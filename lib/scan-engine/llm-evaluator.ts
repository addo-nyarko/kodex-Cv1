import { getAnthropicClient, AI_MODELS } from "@/lib/ai";
import type { ControlRule, EvidencePool, ControlEvalResult } from "@/types/scan";
import type Anthropic from "@anthropic-ai/sdk";

/**
 * LLM-powered control evaluation.
 *
 * Instead of keyword matching, we send the actual document text to Anthropic
 * and ask it to evaluate whether the control is satisfied, citing specific
 * quotes from the evidence.
 *
 * Falls back to the rule's static `check()` if there are no documents.
 */
export async function evaluateControlWithLLM(
  rule: ControlRule,
  evidence: EvidencePool
): Promise<ControlEvalResult> {
  // If no documents at all, fall back to the static rule check
  if (evidence.documents.length === 0) {
    return rule.check(evidence);
  }

  // Collect relevant document text — pick chunks that might relate to this control
  const relevantDocs = selectRelevantDocuments(rule, evidence);

  // If no relevant docs found, still try the static check (questionnaire-based)
  if (relevantDocs.length === 0) {
    return rule.check(evidence);
  }

  const client = getAnthropicClient();

  const docContext = relevantDocs
    .map((d) => `--- Document: ${d.fileName} (chunk ${d.chunkIndex}) ---\n${d.text}`)
    .join("\n\n");

  const companyContext = [
    `Company: ${evidence.onboarding.companyName}`,
    `Industry: ${evidence.onboarding.industry}`,
    `Country: ${evidence.onboarding.country}`,
    `Size: ${evidence.onboarding.size}`,
    `Uses AI: ${evidence.onboarding.usesAI}`,
    evidence.onboarding.aiDescription ? `AI description: ${evidence.onboarding.aiDescription}` : null,
    evidence.onboarding.dataCategories.length > 0 ? `Data categories: ${evidence.onboarding.dataCategories.join(", ")}` : null,
  ].filter(Boolean).join("\n");

  const clarificationContext = evidence.clarifications[rule.code]
    ? `\nPrevious clarification for this control:\nQ&A: ${evidence.clarifications[rule.code]}`
    : "";

  const prompt = `You are a compliance auditor evaluating a specific regulatory control.

## Control being evaluated
- Code: ${rule.code}
- Title: ${rule.title}
- Article references: ${JSON.stringify(rule.articleRefs)}
- Evidence keys to look for: ${rule.evidenceKeys.join(", ")}

## Company context
${companyContext}
${clarificationContext}

## Documents to review
${docContext}

## Your task
Evaluate whether the uploaded documents satisfy this compliance control.

You MUST respond with a JSON object matching this exact structure:
{
  "status": "PASS" | "FAIL" | "PARTIAL" | "NO_EVIDENCE",
  "confidence": <number 0-1>,
  "evidenceUsed": [<list of document filenames used>],
  "citations": [<direct quotes from documents that support your finding, max 3>],
  "gaps": [<specific compliance gaps found, be precise>],
  "remediations": [<concrete actionable steps to fix each gap>],
  "lawyerQuestions": [<questions a lawyer should answer, max 2>],
  "note": "<1-2 sentence summary of your finding>"
}

Rules:
- PASS = the control is clearly satisfied by the evidence
- PARTIAL = some aspects are covered but gaps remain
- FAIL = evidence exists but does not satisfy the control
- NO_EVIDENCE = no relevant evidence found for this control
- Always cite direct quotes when possible
- Be specific about what is missing, not generic
- Confidence should reflect how sure you are (0.9+ for clear evidence, 0.4-0.6 for ambiguous)

Return ONLY the JSON object, no markdown fencing.`;

  try {
    const res = await client.messages.create({
      model: AI_MODELS.FAST,
      max_tokens: 1000,
      messages: [{ role: "user", content: prompt }],
    });

    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    const match = text.match(/\{[\s\S]*\}/);
    if (!match) {
      console.warn(`LLM evaluator returned no JSON for ${rule.code}, falling back to static check`);
      return rule.check(evidence);
    }

    const parsed = JSON.parse(match[0]) as ControlEvalResult & { citations?: string[] };

    // Merge citations into the note for visibility
    const citations = parsed.citations ?? [];
    const noteWithCitations = citations.length > 0
      ? `${parsed.note}\n\nCited evidence:\n${citations.map((c) => `  "${c}"`).join("\n")}`
      : parsed.note;

    return {
      status: parsed.status,
      confidence: Math.min(Math.max(parsed.confidence, 0), 1),
      evidenceUsed: parsed.evidenceUsed ?? [],
      gaps: parsed.gaps ?? [],
      remediations: parsed.remediations ?? [],
      lawyerQuestions: parsed.lawyerQuestions ?? [],
      note: noteWithCitations,
    };
  } catch (err) {
    console.error(`LLM evaluation failed for ${rule.code}:`, err);
    // Fall back to static check on error
    return rule.check(evidence);
  }
}

/**
 * Select document chunks most likely relevant to a given control.
 * Uses the control's evidence keys and title keywords to filter.
 */
function selectRelevantDocuments(
  rule: ControlRule,
  evidence: EvidencePool
): typeof evidence.documents {
  const keywords = [
    ...rule.evidenceKeys,
    ...rule.title.toLowerCase().split(/\s+/).filter((w) => w.length > 3),
    ...Object.values(rule.articleRefs).flatMap((ref) => ref.toLowerCase().split(/\s+/)),
  ];

  // Score each document chunk by keyword relevance
  const scored = evidence.documents.map((doc) => {
    const docText = `${doc.fileName} ${doc.text}`.toLowerCase();
    const score = keywords.reduce((sum, kw) => sum + (docText.includes(kw.toLowerCase()) ? 1 : 0), 0);
    return { doc, score };
  });

  // Include documents with any match, plus always include the first few for context
  const relevant = scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((s) => s.doc);

  // If no keyword matches, send the first 5 chunks as general context
  if (relevant.length === 0) {
    return evidence.documents.slice(0, 5);
  }

  // Cap at 8 chunks to stay within LLM context limits
  return relevant.slice(0, 8);
}
