import { s3, BUCKET } from "./s3";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { db } from "./db";

/**
 * Downloads a file from S3, extracts text (PDF or plain text), and stores it
 * on the Evidence record. Returns the extracted text.
 */
export async function extractAndStoreText(evidenceId: string): Promise<string> {
  const evidence = await db.evidence.findUniqueOrThrow({
    where: { id: evidenceId },
  });

  if (!evidence.fileKey) {
    throw new Error(`Evidence ${evidenceId} has no fileKey`);
  }

  // Download from S3
  const response = await s3.send(
    new GetObjectCommand({ Bucket: BUCKET, Key: evidence.fileKey })
  );

  const body = response.Body;
  if (!body) throw new Error("Empty S3 response body");

  const bytes = await body.transformToByteArray();
  const buffer = Buffer.from(bytes);

  let text = "";

  const mime = evidence.mimeType ?? "";
  const name = (evidence.fileName ?? "").toLowerCase();

  if (mime === "application/pdf" || name.endsWith(".pdf")) {
    // Dynamic import so pdf-parse isn't required at startup
    const pdfParse = (await import("pdf-parse")).default;
    const result = await pdfParse(buffer);
    text = result.text;
  } else if (
    mime.startsWith("text/") ||
    name.endsWith(".txt") ||
    name.endsWith(".md") ||
    name.endsWith(".csv")
  ) {
    text = buffer.toString("utf-8");
  } else if (
    mime.includes("json") ||
    name.endsWith(".json")
  ) {
    text = buffer.toString("utf-8");
  } else if (
    mime.includes("word") ||
    name.endsWith(".docx") ||
    name.endsWith(".doc")
  ) {
    // For .docx, extract raw XML text as fallback — better than nothing
    // In production, use mammoth or similar
    text = buffer.toString("utf-8").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  } else {
    // Unknown type — store what we can
    text = `[Binary file: ${evidence.fileName}, ${evidence.fileSize} bytes. Content not extractable.]`;
  }

  // Truncate to 100k chars to avoid blowing up DB/LLM context
  const MAX_TEXT_LENGTH = 100_000;
  if (text.length > MAX_TEXT_LENGTH) {
    text = text.slice(0, MAX_TEXT_LENGTH) + "\n\n[...truncated]";
  }

  await db.evidence.update({
    where: { id: evidenceId },
    data: {
      extractedText: text,
      textExtractedAt: new Date(),
    },
  });

  return text;
}
