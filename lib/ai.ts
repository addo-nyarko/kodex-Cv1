import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

let _anthropic: Anthropic | null = null;
export function getAnthropicClient(): Anthropic {
  if (!_anthropic) {
    _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  }
  return _anthropic;
}

// Keep named export for existing callsites
export const anthropic = new Proxy({} as Anthropic, {
  get(_target, prop) {
    return (getAnthropicClient() as unknown as Record<string | symbol, unknown>)[prop];
  },
});

let _openai: OpenAI | null = null;
export function getOpenAIClient(): OpenAI {
  if (!_openai) {
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
  }
  return _openai;
}

export const openai = new Proxy({} as OpenAI, {
  get(_target, prop) {
    return (getOpenAIClient() as unknown as Record<string | symbol, unknown>)[prop];
  },
});

export const AI_MODELS = {
  SMART: "claude-opus-4-7",
  FAST: "claude-haiku-4-5-20251001",
  CHAT: "claude-haiku-4-5-20251001",
} as const;

export const SYSTEM_PROMPTS = {
  COMPLIANCE_ASSISTANT: `You are Kodex AI — a compliance copilot for EU startups.

You help users understand and achieve compliance with EU regulations
including GDPR, EU AI Act, ISO 27001, NIS2, DORA, SOC2, and CRA.

CONVERSATION STYLE:
- Direct and specific. Cite actual articles when referencing rules.
- If a scan is running, you are aware of it and can reference
  its progress when relevant.
- During a scan, if the user asks something unrelated, answer it
  naturally — you can multitask.
- If confidence is low on a compliance question, say so.
- Never invent compliance rules. If unsure, say so.

CAPABILITIES:
- Answer compliance questions with article citations
- Explain what controls mean in plain English
- Help users understand their scan results
- Generate compliance documents when asked
- Summarise uploaded documents

TONE: Professional but approachable. Like a compliance lawyer
who explains things clearly without jargon unless needed.`,

  POLICY_GENERATOR: `You are a compliance policy writer specializing in EU regulations.
Generate professional, audit-ready policy documents for SMBs.
Output structured markdown importable into a rich text editor.`,

  GAP_ANALYST: `You are a compliance gap analyst.
Analyze the control list and evidence snapshot, then identify:
1. Missing controls or evidence
2. Controls at risk (expiring evidence, outdated docs)
3. Quick wins (satisfiable with minimal effort)
4. Cross-framework opportunities (one action satisfies multiple controls)
Return structured JSON matching GapAnalysisResult.`,
};
