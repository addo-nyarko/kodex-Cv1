import { getSession } from "@/lib/auth-helper";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { generateAuditPdfHtml } from "@/lib/scan-engine/pdf-report";

/**
 * GET /api/scan/[scanId]/pdf
 * Returns an HTML audit report that can be printed/saved as PDF.
 * The browser's print dialog (Ctrl+P / Cmd+P) generates a clean PDF.
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
        include: { control: { select: { code: true, title: true } } },
      },
      framework: { select: { type: true } },
      org: { select: { name: true } },
    },
  });

  if (!scan) return Response.json({ error: "Scan not found" }, { status: 404 });
  if (scan.status !== "COMPLETED") {
    return Response.json({ error: "Scan not completed yet" }, { status: 400 });
  }

  const report = scan.reportJson as Record<string, unknown> | null;

  const html = generateAuditPdfHtml({
    scanId: scan.id,
    orgName: scan.org.name ?? "Organization",
    frameworkType: scan.framework.type,
    score: scan.score ?? 0,
    riskLevel: scan.riskLevel ?? "UNKNOWN",
    startedAt: scan.startedAt?.toISOString() ?? scan.createdAt.toISOString(),
    completedAt: scan.completedAt?.toISOString() ?? new Date().toISOString(),
    controlResults: (scan.controlResults as any[]).map((r: any) => ({
      controlCode: r.control.code,
      controlTitle: r.control.title,
      status: r.status,
      confidence: r.confidence,
      gaps: r.gaps,
      remediations: r.remediations,
      note: r.note ?? "",
    })),
    executiveSummary: (report?.executiveSummary as string) ?? "No executive summary available.",
    roadmap: (report?.roadmap as { controlCode: string; title: string; description: string; priority: string }[]) ?? [],
    shadowPass: scan.shadowPassJson as Record<string, { met: number; total: number; pct: number }> | null,
  });

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
    },
  });
}
