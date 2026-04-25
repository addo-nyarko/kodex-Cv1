import { getSession } from "@/lib/auth-helper";
import { db } from "@/lib/db";

/**
 * GET /api/evidence/checklist
 * Returns the document checklist from the org + any already-uploaded evidence
 * so the upload UI can show which slots are filled.
 */
export async function GET() {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { orgId } = session;

  try {
    const org = await db.organization.findUnique({
      where: { id: orgId },
      select: {
        documentChecklist: true,
        applicableFrameworks: true,
        riskTier: true,
        frameworks: {
          select: {
            id: true,
            type: true,
            controls: {
              select: { id: true, code: true, title: true },
            },
          },
        },
      },
    });

    if (!org) return Response.json({ error: "Org not found" }, { status: 404 });

    // Get existing evidence for this org
    // Use a try/catch for the extractedText field in case migration hasn't been applied
    let evidence: Array<{
      id: string;
      title: string;
      fileName: string | null;
      status: string;
      controlId: string;
      control: { code: string };
      extractedText?: string | null;
    }> = [];

    try {
      evidence = await db.evidence.findMany({
        where: { control: { framework: { orgId } } },
        select: {
          id: true,
          title: true,
          fileName: true,
          status: true,
          extractedText: true,
          controlId: true,
          control: { select: { code: true } },
        },
        orderBy: { createdAt: "desc" },
      });
    } catch {
      // If extractedText column doesn't exist yet, query without it
      evidence = (await db.evidence.findMany({
        where: { control: { framework: { orgId } } },
        select: {
          id: true,
          title: true,
          fileName: true,
          status: true,
          controlId: true,
          control: { select: { code: true } },
        },
        orderBy: { createdAt: "desc" },
      })) as typeof evidence;
    }

    return Response.json({
      checklist: org.documentChecklist ?? [],
      frameworks: org.frameworks,
      applicableFrameworks: org.applicableFrameworks,
      riskTier: org.riskTier,
      uploadedEvidence: evidence.map((e) => ({
        id: e.id,
        title: e.title,
        fileName: e.fileName,
        status: e.status,
        hasText: !!e.extractedText,
        controlId: e.controlId,
        controlCode: e.control.code,
      })),
    });
  } catch (err) {
    console.error("Checklist endpoint error:", err);
    return Response.json(
      { error: "Internal error", detail: err instanceof Error ? err.message : "unknown" },
      { status: 500 }
    );
  }
}
