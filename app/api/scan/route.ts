import { getSession } from "@/lib/auth-helper";
import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { runScan } from "@/lib/scan-engine";

const StartScanSchema = z.object({
  frameworkId: z.string(),
  questionnaire: z.record(z.string(), z.unknown()).optional(),
});

export const maxDuration = 300; // Allow up to 5 minutes for scan

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

  const parsed = StartScanSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 422 });
  }

  const { frameworkId, questionnaire } = parsed.data;

  const framework = await db.framework.findFirst({
    where: { id: frameworkId, orgId },
  });
  if (!framework) {
    return Response.json({ error: "Framework not found" }, { status: 404 });
  }

  const scan = await db.scan.create({
    data: {
      orgId,
      frameworkId,
      status: "QUEUED",
      evidenceSnapshot: (questionnaire ?? {}) as object,
    },
  });

  // Run scan inline and stream progress events via SSE
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

      // Send initial event with scanId
      send({ scanId: scan.id, message: "Scan started — analyzing your evidence..." });

      try {
        const generator = runScan(scan.id, framework.type, orgId);

        for await (const event of generator) {
          if (event.type === "narration") {
            send({ scanId: scan.id, message: event.message });
          } else if (event.type === "clarification_needed") {
            send({
              type: "clarification_needed",
              scanId: scan.id,
              question: event.question,
              controlCode: event.controlCode,
            });
          } else if (event.type === "cross_framework_hit") {
            send({ scanId: scan.id, message: event.message });
          } else if (event.type === "complete") {
            send({
              type: "complete",
              scanId: scan.id,
              message: "Scan complete!",
            });
          } else if (event.type === "error") {
            send({ type: "error", message: event.message || "Scan failed" });
          }
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Scan failed unexpectedly";
        console.error("Scan error:", err);

        // Update scan status to failed
        await db.scan.update({
          where: { id: scan.id },
          data: {
            status: "FAILED",
            errorMessage: errorMsg,
            completedAt: new Date(),
          },
        }).catch(() => {});

        send({ type: "error", scanId: scan.id, message: errorMsg });
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
