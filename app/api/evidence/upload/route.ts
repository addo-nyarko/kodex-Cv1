import { getSession } from "@/lib/auth-helper";
import { NextRequest } from "next/server";
import { z } from "zod";
import { getSignedUploadUrl, buildEvidenceKey } from "@/lib/storage";
import { db } from "@/lib/db";
import { randomUUID } from "crypto";

const UploadSchema = z.object({
  controlId: z.string(),
  fileName: z.string(),
  contentType: z.string(),
  fileSize: z.number(),
  evidenceType: z.enum(["DOCUMENT", "SCREENSHOT", "LOG_EXPORT", "POLICY", "CERTIFICATE", "ATTESTATION"]),
});

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { orgId } = session;

  const body = UploadSchema.safeParse(await req.json());
  if (!body.success) return Response.json({ error: "Invalid input" }, { status: 422 });

  const { controlId, fileName, contentType, fileSize, evidenceType } = body.data;

  const control = await db.control.findFirst({
    where: { id: controlId, framework: { orgId } },
  });
  if (!control) return Response.json({ error: "Control not found" }, { status: 404 });

  const evidenceId = randomUUID();
  const fileKey = buildEvidenceKey(orgId, evidenceId, fileName);

  const { uploadUrl, token, path } = await getSignedUploadUrl(fileKey);

  await db.evidence.create({
    data: {
      id: evidenceId,
      controlId,
      title: fileName,
      type: evidenceType,
      fileKey,
      fileName,
      fileSize,
      mimeType: contentType,
      status: "PENDING",
    },
  });

  return Response.json({
    uploadUrl,
    token,
    path,
    evidenceId,
    fileKey,
    // Client MUST PUT to uploadUrl with Authorization: `Bearer ${token}`,
    // then POST { evidenceId } to confirmUrl to trigger text extraction.
    confirmUrl: "/api/evidence/confirm",
  });
}
