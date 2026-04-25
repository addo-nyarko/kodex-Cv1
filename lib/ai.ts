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
  SMART: "claude-opus-4-5",
  FAST: "claude-haiku-4-5-20251001",
  CHAT: "gpt-4o-mini",
} as const;

export const SYSTEM_PROMPTS = {
  COMPLIANCE_ASSISTANT: `You are Kodex AI, a compliance expert embedded in the Kodex platform.
You help users achieve EU compliance (GDPR, ISO 27001, SOC 2, NIS2, DORA, EU AI Act).
- Cite specific article/section numbers when referencing regulations
- Never provide legal advice — recommend qualified lawyers for legal interpretation
- Keep responses concise and structured with markdown
- Focus on practical implementation for SMBs`,

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
