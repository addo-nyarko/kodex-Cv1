import { anthropic, AI_MODELS } from "@/lib/ai";
import type { ControlRule, EvidencePool } from "@/types/scan";

export async function generateClarificationQuestion(
  rule: ControlRule,
  evidence: EvidencePool
): Promise<string> {
  const msg = await anthropic.messages.create({
    model: AI_MODELS.FAST,
    max_tokens: 200,
    system:
      "You are a compliance auditor. Generate a single, specific clarifying question to resolve " +
      "ambiguity in a compliance control evaluation. Be direct and concrete. One question only.",
    messages: [
      {
        role: "user",
        content: `Control: ${rule.title} (${rule.code})\nArticle refs: ${JSON.stringify(rule.articleRefs)}\nEvidence keys needed: ${rule.evidenceKeys.join(", ")}\nCompany context: ${evidence.onboarding.industry}, uses AI: ${evidence.onboarding.usesAI}\n\nWhat single question would best resolve the ambiguity?`,
      },
    ],
  });

  return (msg.content[0] as { text: string }).text;
}
