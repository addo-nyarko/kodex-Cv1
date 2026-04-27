import { getSession } from "@/lib/auth-helper";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getScanEvents } from "@/lib/queue/scan-queue";

/**
 * GET /api/scan/status/[scanId]
 * Poll for scan status, results, and live narration events.
 *
 * Query params:
 *   ?eventsSince=N — only return events after index N (for incremental polling)
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ scanId: string }> }
) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { scanId } = await params;
  const eventsSince = parseInt(req.nextUrl.searchParams.get("eventsSince") ?? "0", 10);

  const scan = await db.scan.findFirst({
    where: { id: scanId, orgId: session.orgId },
    include: {
      controlResults: {
        include: {
          control: { select: { code: true, title: true } },
        },
      },
      framework: { select: { type: true } },
    },
  });

  if (!scan) return Response.json({ error: "Scan not found" }, { status: 404 });

  // Get narration events from Redis
  const allEvents = await getScanEvents(scanId);
  const newEvents = allEvents.slice(eventsSince);

  return Response.json({
    id: scan.id,
    status: scan.status,
    score: scan.score,
    riskLevel: scan.riskLevel,
    frameworkType: scan.framework.type,
    report: scan.reportJson,
    shadowPass: scan.shadowPassJson,
    pendingQuestion: scan.pendingQuestion,
    pendingControlCode: scan.pendingControlCode,
    startedAt: scan.startedAt,
    completedAt: scan.completedAt,
    errorMessage: scan.errorMessage,
    // Live narration events
    events: newEvents,
    eventCount: allEvents.length,
    controlResults: (scan.controlResults as any[]).map((r: any) => ({
      id: r.id,
      controlCode: r.control.code,
      controlTitle: r.control.title,
      status: r.status,
      confidence: r.confidence,
      evidenceUsed: r.evidenceUsed,
      gaps: r.gaps,
      remediations: r.remediations,
      note: r.note,
    })),
  });
}
