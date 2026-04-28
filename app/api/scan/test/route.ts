import { getSession } from "@/lib/auth-helper";
import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { runTesterAgent } from "@/lib/scan-engine/tester-agent";

const TestScanSchema = z.object({
  integrationId: z.string(),
  url: z.string().url().optional(),
});

// V2 NOTE: When the tester agent moves to a managed browser service (Browserless/Browserbase),
// the actual Puppeteer call runs there, not in this function. This route just orchestrates the
// remote browser and stays well under Vercel's limits. For now, the route is gated off entirely.
export const maxDuration = 60; // Vercel Pro cap. Real work happens elsewhere when v2 ships.

export async function POST(req: NextRequest) {
  // Tester agent is a v2 feature — disabled until live-site testing infrastructure ships.
  // To enable in dev/staging: set ENABLE_TESTER_AGENT=true in env vars.
  if (process.env.ENABLE_TESTER_AGENT !== "true") {
    return Response.json(
      {
        error: "Site testing is in private beta",
        message: "Live-site compliance testing is coming soon. We'll email you when it's available.",
        waitlist: true,
      },
      { status: 503 }
    );
  }

  // V2 NOTE: When live-site testing ships, this is where ownership verification goes.
  // Allowed URL sources:
  //   1. GitHub integration → repository homepage_url field (already in DB)
  //   2. URL pre-verified via .well-known/kodex-verification.txt with a per-org token
  // We never scan arbitrary user-supplied URLs. See HANDOFF.md "tester agent v2" section.

  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { orgId } = session;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = TestScanSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 422 });
  }

  const { integrationId, url } = parsed.data;

  // Verify the integration belongs to this org and is a GitHub integration
  const integration = await db.integration.findFirst({
    where: { id: integrationId, orgId, type: "GITHUB" },
  });

  if (!integration) {
    return Response.json(
      { error: "GitHub integration not found or not connected" },
      { status: 404 }
    );
  }

  // Stream progress events via SSE
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (data: object) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          // Stream may have been closed by the client
        }
      };

      try {
        const generator = runTesterAgent(integrationId, orgId, url);

        for await (const event of generator) {
          if (event.type === "narration") {
            send({ type: "narration", message: event.message });
          } else if (event.type === "finding") {
            send({ type: "finding", finding: event.finding });
          } else if (event.type === "complete") {
            send({ type: "complete", report: event.report });
          } else if (event.type === "error") {
            send({ type: "error", message: event.message });
          }
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Tester agent failed unexpectedly";
        console.error("Tester agent error:", err);
        send({ type: "error", message: errorMsg });
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
