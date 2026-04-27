import { getSession } from "@/lib/auth-helper";
import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { runTesterAgent } from "@/lib/scan-engine/tester-agent";

const TestScanSchema = z.object({
  integrationId: z.string(),
  url: z.string().url().optional(),
});

export const maxDuration = 120; // 2 minutes max for the tester agent

export async function POST(req: NextRequest) {
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
