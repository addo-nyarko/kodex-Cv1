import { downloadObject } from "./storage";
import { db } from "./db";

/**
 * Downloads a file from Supabase Storage, extracts text (PDF or plain text),
 * and stores it on the Evidence record. Returns the extracted text.
 */
export async function extractAndStoreText(evidenceId: string): Promise<string> {
  const evidence = await db.evidence.findUniqueOrThrow({
    where: { id: evidenceId },
  });

  if (!evidence.fileKey) {
    throw new Error(`Evidence ${evidenceId} has no fileKey`);
  }

  const buffer = await downloadObject(evidence.fileKey);

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

/**
 * Find every evidence row in the org that has a fileKey but no extractedText,
 * and extract them. Capped at 3 items per call to stay under the Vercel 10s limit
 * (each PDF download + parse can take 2-4s). Fails soft: one bad file does not
 * block the scan.
 */
export async function extractPendingEvidenceForOrg(
  orgId: string,
  limit = 3
): Promise<{ extracted: number; failed: number }> {
  const pending = await db.evidence.findMany({
    where: {
      control: { framework: { orgId } },
      fileKey: { not: null },
      extractedText: null,
    },
    take: limit,
    select: { id: true },
  });

  let extracted = 0;
  let failed = 0;
  for (const ev of pending) {
    try {
      await extractAndStoreText(ev.id);
      extracted++;
    } catch (err) {
      failed++;
      console.warn(`Could not extract evidence ${ev.id}:`, err);
      // Mark it so we don't retry forever on the same broken file.
      await db.evidence
        .update({
          where: { id: ev.id },
          data: { extractedText: "", textExtractedAt: new Date() },
        })
        .catch(() => {});
    }
  }

  return { extracted, failed };
}
