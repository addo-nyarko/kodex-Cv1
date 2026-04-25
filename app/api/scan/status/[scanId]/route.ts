import { getSession } from "@/lib/auth-helper";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";

/**
 * GET /api/scan/status/[scanId]
 * Poll for scan status + results
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ scanId: string }> }
) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { scanId } = await params;

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
    controlResults: scan.controlResults.map((r) => ({
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
