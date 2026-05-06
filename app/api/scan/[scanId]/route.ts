import { getSession } from "@/lib/auth-helper";
import type { NextRequest } from "next/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ scanId: string }> }
) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { orgId } = session;

  const { scanId } = await params;

  const { db } = await import("@/lib/db");
  const scan = await db.scan.findFirst({
    where: { id: scanId, orgId },
    include: {
      framework: { select: { type: true, id: true } },
      controlResults: {
        include: {
          control: { select: { code: true, title: true } },
        },
      },
    },
  });

  if (!scan) return Response.json({ error: "Not found" }, { status: 404 });

  // Get documents linked to this scan's project
  const projectId = scan.projectId;
  const documents: Array<{ id: string; title: string; category: string; createdAt: Date }> = [];
  if (projectId) {
    const docs = await db.document.findMany({
      where: {
        projectId,
        category: { in: ["POLICY", "SCAN_REPORT"] },
      },
      select: { id: true, title: true, category: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });
    documents.push(...docs);
  }

  return Response.json({
    id: scan.id,
    status: scan.status,
    score: scan.score,
    riskLevel: scan.riskLevel,
    frameworkId: scan.frameworkId,
    frameworkType: scan.framework.type,
    createdAt: scan.createdAt,
    completedAt: scan.completedAt,
    reportJson: scan.reportJson,
    shadowPassJson: scan.shadowPassJson,
    staleEvidence: scan.staleEvidence || false,
    staleSources: scan.staleSources ? JSON.parse(scan.staleSources) : [],
    controlResults: scan.controlResults.map((cr: any) => ({
      id: cr.id,
      status: cr.status,
      confidence: cr.confidence,
      gaps: cr.gaps,
      remediations: cr.remediations,
      evidenceUsed: cr.evidenceUsed,
      evidenceSources: cr.evidenceSourcesJson ? JSON.parse(cr.evidenceSourcesJson) : [],
      note: cr.note,
      evaluationError: cr.evaluationError || null,
      control: {
        code: cr.control.code,
        title: cr.control.title,
      },
    })),
    documents,
  });
}
