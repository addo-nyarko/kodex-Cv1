import { getSession } from "@/lib/auth-helper";
import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { runScan, prepareEvidence } from "@/lib/scan-engine";
import type { EvidencePool } from "@/types/scan";

const StartScanSchema = z.object({
  // Accept a single frameworkId (backwards compatible) or multiple
  frameworkId: z.string().optional(),
  frameworkIds: z.array(z.string()).optional(),
  questionnaire: z.record(z.string(), z.unknown()).optional(),
}).refine(
  (d) => d.frameworkId || (d.frameworkIds && d.frameworkIds.length > 0),
  { message: "At least one framework must be specified" }
);

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

  const { frameworkId, frameworkIds: rawIds, questionnaire } = parsed.data;

  // Normalize to array of IDs
  const allIds = rawIds && rawIds.length > 0 ? rawIds : [frameworkId!];

  // Validate all frameworks exist and belong to the org
  const frameworks = await db.framework.findMany({
    where: { id: { in: allIds }, orgId },
  });

  if (frameworks.length === 0) {
    return Response.json({ error: "No valid frameworks found" }, { status: 404 });
  }

  // Create a scan record for each framework
  const scans = await Promise.all(
    frameworks.map((fw) =>
      db.scan.create({
        data: {
          orgId,
          frameworkId: fw.id,
          status: "QUEUED",
          evidenceSnapshot: (questionnaire ?? {}) as object,
        },
      })
    )
  );

  // Run scans sequentially and stream progress events via SSE
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

      const totalFrameworks = frameworks.length;
      const scanIds = scans.map((s) => s.id);

      // Send initial event with all scanIds
      send({
        scanId: scanIds[0],
        scanIds,
        message: totalFrameworks > 1
          ? `Starting multi-framework scan — ${totalFrameworks} frameworks queued...`
          : "Scan started — analyzing your evidence...",
      });

      // Prepare evidence ONCE — assembly + LLM synthesis shared across all frameworks
      let sharedEvidence: EvidencePool | undefined;

      if (totalFrameworks > 1) {
        try {
          const evidenceGen = prepareEvidence(orgId, scanIds[0]);
          let result = await evidenceGen.next();
          while (!result.done) {
            const event = result.value;
            if (event.type === "narration") {
              send({ scanId: scanIds[0], message: event.message });
            }
            result = await evidenceGen.next();
          }
          sharedEvidence = result.value;
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : "Evidence preparation failed";
          console.error("Evidence preparation error:", err);
          send({ type: "error", message: errorMsg });
          controller.close();
          return;
        }
      }

      for (let i = 0; i < frameworks.length; i++) {
        const fw = frameworks[i];
        const scan = scans[i];

        if (totalFrameworks > 1) {
          send({
            scanId: scan.id,
            message: `── Framework ${i + 1}/${totalFrameworks}: ${fw.type.replace(/_/g, " ")} ──`,
          });
        }

        try {
          const generator = runScan(scan.id, fw.type, orgId, sharedEvidence);

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
              if (i === frameworks.length - 1) {
                // Last framework — signal overall completion
                send({
                  type: "complete",
                  scanId: scan.id,
                  scanIds,
                  message: totalFrameworks > 1
                    ? `All ${totalFrameworks} framework scans complete!`
                    : "Scan complete!",
                });
              } else {
                send({
                  scanId: scan.id,
                  message: `${fw.type.replace(/_/g, " ")} scan complete. Moving to next framework...`,
                });
              }
            } else if (event.type === "error") {
              send({ type: "error", message: event.message || "Scan failed" });
            }
          }
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : "Scan failed unexpectedly";
          console.error(`Scan error (${fw.type}):`, err);

          await db.scan.update({
            where: { id: scan.id },
            data: {
              status: "FAILED",
              errorMessage: errorMsg,
              completedAt: new Date(),
            },
          }).catch(() => {});

          send({ type: "error", scanId: scan.id, message: `${fw.type}: ${errorMsg}` });
          // Continue to the next framework even if one fails
        }
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
