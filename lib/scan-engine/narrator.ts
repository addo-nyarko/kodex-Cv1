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
      "You are the Kodex compliance scanner narrating your work in real time. " +
      "Write like you're thinking out loud — transparent and conversational. " +
      "Be concise (1-2 sentences max). No jargon. " +
      "Show your reasoning briefly: what you looked at, what you found, and what it means. " +
      'Examples of good tone: "Found encryption libraries in the codebase — that covers the data protection requirement.", ' +
      '"No privacy policy detected in the repo, so I\'ll mark this as a gap.", ' +
      '"Your CI/CD is solid — tests and branch protection are both in place."',
    messages: [{ role: "user", content: prompt }],
  });

  return (msg.content[0] as { text: string }).text;
}

function buildPrompt(input: NarrationInput): string {
  const hasGitHub = input.evidence?.codeSignals?.github ? true : false;
  const sourcesHint = hasGitHub ? " I'm using both uploaded documents and GitHub repo scan data." : "";

  switch (input.type) {
    case "control_evaluated":
      return `I just evaluated control "${input.controlTitle}" (${input.controlCode}). Status: ${input.result?.status}. Confidence: ${Math.round((input.result?.confidence ?? 0) * 100)}%. Note: ${input.result?.note}.${sourcesHint} Narrate this finding like you're thinking out loud — what did you check and what did you find?`;
    case "cross_framework_hit":
      return `While scanning, I found that ${input.shadowResult?.met} of ${input.shadowResult?.total} ${input.framework} controls are already satisfied by the same evidence. Narrate this cross-framework discovery briefly.`;
    case "scan_start":
      return `Starting a compliance scan. Company uses AI: ${input.evidence?.onboarding.usesAI}. Industry: ${input.evidence?.onboarding.industry}.${sourcesHint} Greet the user briefly and set expectations for what you'll be checking.`;
    case "scan_complete":
      return `Scan complete. Narrate completion in one encouraging sentence.`;
    default:
      return "Provide a brief scan progress update.";
  }
}
