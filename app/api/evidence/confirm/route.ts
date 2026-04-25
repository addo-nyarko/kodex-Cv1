import { getSession } from "@/lib/auth-helper";
import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { extractAndStoreText } from "@/lib/pdf-extract";

const ConfirmSchema = z.object({
  evidenceId: z.string(),
});

/**
 * POST /api/evidence/confirm
 * Called after the client finishes uploading to S3 via the presigned URL.
 * Triggers text extraction and stores the result on the Evidence record.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { orgId } = session;

  const body = ConfirmSchema.safeParse(await req.json());
  if (!body.success) return Response.json({ error: "Invalid input" }, { status: 422 });

  const { evidenceId } = body.data;

  // Verify the evidence belongs to this org
  const evidence = await db.evidence.findFirst({
    where: {
      id: evidenceId,
      control: { framework: { orgId } },
    },
  });
  if (!evidence) return Response.json({ error: "Evidence not found" }, { status: 404 });

  try {
    const extractedText = await extractAndStoreText(evidenceId);

    return Response.json({
      evidenceId,
      textLength: extractedText.length,
      extracted: true,
    });
  } catch (err) {
    console.error(`Text extraction failed for evidence ${evidenceId}:`, err);
    return Response.json({
      evidenceId,
      extracted: false,
      error: err instanceof Error ? err.message : "Extraction failed",
    }, { status: 500 });
  }
}
