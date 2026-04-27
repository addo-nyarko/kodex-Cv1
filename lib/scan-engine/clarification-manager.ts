import { anthropic, AI_MODELS } from "@/lib/ai";
import type { ControlRule, EvidencePool } from "@/types/scan";

export async function generateClarificationQuestion(
  rule: ControlRule,
  evidence: EvidencePool
): Promise<string> {
  // Build context about what we already know from integrations
  const knownSignals: string[] = [];
  const gh = evidence.codeSignals.github as Record<string, unknown> | undefined;
  if (gh) {
    knownSignals.push(`GitHub repo "${gh.repo}" has been scanned.`);
    if (gh.hasAuth) knownSignals.push(`Authentication detected: ${(gh.authPatterns as string[])?.join(", ")}`);
    if (gh.hasEncryption) knownSignals.push("Encryption/hashing detected in codebase");
    if (gh.hasCI) knownSignals.push("CI/CD pipelines detected");
    if (gh.hasTests) knownSignals.push("Automated tests detected");
    if (gh.hasBranchProtection) knownSignals.push("Branch protection enabled");
  }

  const priorAnswers = Object.entries(evidence.clarifications);
  const priorContext = priorAnswers.length > 0
    ? `\nPrior answers from the user:\n${priorAnswers.map(([code, answer]) => `  ${code}: ${answer}`).join("\n")}`
    : "";

  const msg = await anthropic.messages.create({
    model: AI_MODELS.FAST,
    max_tokens: 200,
    system:
      "You are a compliance auditor. Generate a single, specific clarifying question to resolve " +
      "ambiguity in a compliance control evaluation. Be direct, concrete, and SHORT (2-3 sentences max). " +
      "Do NOT ask about things we already know from code scans or prior answers. " +
      "Focus only on organizational/process questions that can't be determined from code. " +
      "If the user previously made a typo or correction, acknowledge it naturally. " +
      "One question only. Keep it simple — avoid jargon.",
    messages: [
      {
        role: "user",
        content: `Control: ${rule.title} (${rule.code})
Article refs: ${JSON.stringify(rule.articleRefs)}
Evidence keys needed: ${rule.evidenceKeys.join(", ")}
Company context: ${evidence.onboarding.industry}, uses AI: ${evidence.onboarding.usesAI}${evidence.onboarding.aiDescription ? `, AI usage: ${evidence.onboarding.aiDescription}` : ""}
${knownSignals.length > 0 ? `\nAlready known from code scans:\n${knownSignals.map((s) => `  - ${s}`).join("\n")}` : ""}
${priorContext}

What single question would best resolve the remaining ambiguity? Do NOT ask about anything listed in "Already known" above.`,
      },
    ],
  });

  return (msg.content[0] as { text: string }).text;
}
