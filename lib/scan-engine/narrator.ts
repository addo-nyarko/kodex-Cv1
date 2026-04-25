import { anthropic, AI_MODELS } from "@/lib/ai";
import type { ControlEvalResult, EvidencePool, ShadowPassResult } from "@/types/scan";

interface NarrationInput {
  type: "control_evaluated" | "cross_framework_hit" | "scan_start" | "scan_complete";
  controlCode?: string;
  controlTitle?: string;
  result?: ControlEvalResult;
  framework?: string;
  shadowResult?: ShadowPassResult;
  evidence?: EvidencePool;
}

export async function narrateEvent(input: NarrationInput): Promise<string> {
  const prompt = buildPrompt(input);

  const msg = await anthropic.messages.create({
    model: AI_MODELS.FAST,
    max_tokens: 150,
    system:
      "You are the Kodex compliance scanner. Narrate scan progress in a friendly, " +
      "conversational tone — like a knowledgeable colleague walking someone through " +
      "a compliance review. Be concise (1-2 sentences max). No jargon.",
    messages: [{ role: "user", content: prompt }],
  });

  return (msg.content[0] as { text: string }).text;
}

function buildPrompt(input: NarrationInput): string {
  switch (input.type) {
    case "control_evaluated":
      return `Control "${input.controlTitle}" (${input.controlCode}) evaluated with status: ${input.result?.status}. Confidence: ${Math.round((input.result?.confidence ?? 0) * 100)}%. Note: ${input.result?.note}. Narrate this finding naturally.`;
    case "cross_framework_hit":
      return `While scanning, we found that ${input.shadowResult?.met} of ${input.shadowResult?.total} ${input.framework} controls are already satisfied. Narrate this cross-framework discovery with excitement.`;
    case "scan_start":
      return `Starting a compliance scan. Company uses AI: ${input.evidence?.onboarding.usesAI}. Industry: ${input.evidence?.onboarding.industry}. Greet the user and set expectations.`;
    case "scan_complete":
      return `Scan complete. Narrate completion in one encouraging sentence.`;
    default:
      return "Provide a brief scan progress update.";
  }
}
