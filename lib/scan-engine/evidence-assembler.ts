import { db } from "@/lib/db";
import type { EvidencePool, DocumentChunk } from "@/types/scan";

export async function assembleEvidence(orgId: string, scanId: string): Promise<EvidencePool> {
  const [org, scan, evidence] = await Promise.all([
    db.organization.findUniqueOrThrow({ where: { id: orgId } }),
    db.scan.findUniqueOrThrow({
      where: { id: scanId },
      include: { clarifications: { where: { answeredAt: { not: null } } } },
    }),
    db.evidence.findMany({
      where: {
        control: { framework: { orgId } },
        status: { in: ["APPROVED", "PENDING"] },
      },
      orderBy: { collectedAt: "desc" },
    }),
  ]);

  // Build document chunks from extracted text (real content) or fall back to description
  const documents: DocumentChunk[] = evidence
    .filter((e) => e.fileKey && e.fileName)
    .map((e) => {
      const text = e.extractedText ?? e.description ?? e.title;
      // Split long documents into chunks of ~4000 chars for LLM context management
      const chunks: DocumentChunk[] = [];
      const CHUNK_SIZE = 4000;

      if (text.length <= CHUNK_SIZE) {
        chunks.push({
          evidenceId: e.id,
          fileName: e.fileName!,
          chunkIndex: 0,
          text,
        });
      } else {
        // Split on paragraph boundaries when possible
        const paragraphs = text.split(/\n\s*\n/);
        let currentChunk = "";
        let chunkIndex = 0;

        for (const para of paragraphs) {
          if (currentChunk.length + para.length > CHUNK_SIZE && currentChunk.length > 0) {
            chunks.push({
              evidenceId: e.id,
              fileName: e.fileName!,
              chunkIndex,
              text: currentChunk.trim(),
            });
            chunkIndex++;
            currentChunk = para;
          } else {
            currentChunk += (currentChunk ? "\n\n" : "") + para;
          }
        }

        if (currentChunk.trim()) {
          chunks.push({
            evidenceId: e.id,
            fileName: e.fileName!,
            chunkIndex,
            text: currentChunk.trim(),
          });
        }
      }

      return chunks;
    })
    .flat();

  const clarifications: Record<string, string> = {};
  for (const c of scan.clarifications) {
    if (c.controlCode && c.answer) {
      clarifications[c.controlCode] = c.answer;
    }
  }

  const questionnaire = (org.questionnaireAnswers as Record<string, unknown>) ?? {};

  return {
    onboarding: {
      companyName: org.name,
      industry: org.industry ?? "unknown",
      country: org.country ?? "EU",
      size: org.size ?? "1-10",
      usesAI: org.usesAI,
      aiDescription: org.aiDescription ?? undefined,
      dataCategories: org.dataCategories,
    },
    questionnaire,
    documents,
    codeSignals: {},
    clarifications,
    priorResults: {},
  };
}
