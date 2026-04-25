import type Anthropic from "@anthropic-ai/sdk";
import { getAnthropicClient, AI_MODELS } from "@/lib/ai";
import type { FrameworkType } from "@prisma/client";

export type QuestionnaireAnswers = {
  productDescription: string;
  usesAI: boolean;
  aiPurposes: string[];
  dataCategories: string[];
  userTypes: string[];
  size: string;
  hasPrivacyPolicy: boolean;
  usesThirdPartyAI: boolean;
  thirdPartyProviders: string[];
  trainsOwnModels: boolean;
  country: string;
};

export type DocumentRequest = {
  id: string;
  title: string;
  why: string;
  required: boolean;
};

export type ClassifierResult = {
  riskTier: "UNACCEPTABLE" | "HIGH" | "LIMITED" | "MINIMAL" | "NONE";
  applicableFrameworks: FrameworkType[];
  summary: string;
  documentChecklist: DocumentRequest[];
  plainEnglishExplainer: string;
};

const SYSTEM = `You are a EU compliance risk classifier for small startups (1-10 people).
Given a founder's plain-English answers, you output a JSON object classifying:
1. Which EU frameworks apply (subset of: GDPR, EU_AI_ACT, NIS2, DORA, CYBER_RESILIENCE_ACT, PRODUCT_LIABILITY)
2. EU AI Act risk tier (UNACCEPTABLE / HIGH / LIMITED / MINIMAL / NONE — NONE means no AI)
3. A short smart document checklist — only ask for documents that apply to THIS founder. Do not ask for model cards, training-data audits, or bias reports if they don't train models.
4. A plainEnglishExplainer: 2-3 sentences, no jargon, what Kodex found and what they need to do.

Output STRICT JSON matching this TypeScript type:
{
  "riskTier": "UNACCEPTABLE"|"HIGH"|"LIMITED"|"MINIMAL"|"NONE",
  "applicableFrameworks": ("GDPR"|"EU_AI_ACT"|"NIS2"|"DORA"|"CYBER_RESILIENCE_ACT"|"PRODUCT_LIABILITY")[],
  "summary": string,
  "documentChecklist": { "id": string, "title": string, "why": string, "required": boolean }[],
  "plainEnglishExplainer": string
}

Keep the checklist to 3-6 items. Prefer documents a 2-person startup actually has (privacy policy, ToS, product one-pager, AI system description in a Notion doc, list of third-party APIs).`;

export async function classifyOrg(answers: QuestionnaireAnswers): Promise<ClassifierResult> {
  const client = getAnthropicClient();

  const userMsg = `Founder's answers:
- Product: ${answers.productDescription}
- Uses AI: ${answers.usesAI ? "yes" : "no"}
- AI purposes: ${answers.aiPurposes.join(", ") || "none"}
- Data handled: ${answers.dataCategories.join(", ") || "none specified"}
- User types: ${answers.userTypes.join(", ") || "unspecified"}
- Team size: ${answers.size}
- Country: ${answers.country}
- Has privacy policy live: ${answers.hasPrivacyPolicy ? "yes" : "no"}
- Uses third-party AI APIs: ${answers.usesThirdPartyAI ? "yes" : "no"} (${answers.thirdPartyProviders.join(", ") || "-"})
- Trains own models: ${answers.trainsOwnModels ? "yes" : "no"}

Classify and return JSON only.`;

  const res = await client.messages.create({
    model: AI_MODELS.FAST,
    max_tokens: 2000,
    system: SYSTEM,
    messages: [{ role: "user", content: userMsg }],
  });

  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("Classifier returned no JSON");

  const parsed = JSON.parse(match[0]) as ClassifierResult;
  return parsed;
}
