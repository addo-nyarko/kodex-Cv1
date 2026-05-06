import { getAnthropicClient, AI_MODELS } from "@/lib/ai";
import type { ControlRule, EvidencePool, ControlEvalResult } from "@/types/scan";
import type Anthropic from "@anthropic-ai/sdk";

/**
 * LLM-powered control evaluation.
 *
 * Sends document text, code signals (from GitHub etc.), and clarifications
 * to Anthropic and asks it to evaluate whether the control is satisfied.
 *
 * Falls back to the rule's static `check()` if there are no documents or signals.
 */
export async function evaluateControlWithLLM(
  rule: ControlRule,
  evidence: EvidencePool
): Promise<ControlEvalResult> {
  // If no documents AND no code signals at all, fall back to the static rule check
  const hasCodeSignals = Object.keys(evidence.codeSignals).length > 0;
  if (evidence.documents.length === 0 && !hasCodeSignals) {
    return rule.check(evidence);
  }

  // Collect relevant document text — pick chunks that might relate to this control
  const relevantDocs = selectRelevantDocuments(rule, evidence);

  // If no relevant docs AND no code signals, still try the static check
  if (relevantDocs.length === 0 && !hasCodeSignals) {
    return rule.check(evidence);
  }

  const client = getAnthropicClient();

  const docContext = relevantDocs.length > 0
    ? relevantDocs
        .map((d) => `--- Document: ${d.fileName} (chunk ${d.chunkIndex}) ---\n${d.text}`)
        .join("\n\n")
    : "(No uploaded documents available)";

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

  // Build code signals context from integrations (GitHub, etc.)
  const codeSignalContext = buildCodeSignalContext(evidence.codeSignals, rule);

  const systemPrompt = `You are a compliance auditor evaluating regulatory controls for accuracy and consistency.

## Status Definitions (strict)

PASS: Control requirement is explicitly implemented AND documented.
  - ≥1 document section addresses the requirement with implementation details (not just policy intent), OR
  - ≥2 independent GitHub signals directly related to this control (e.g., CI/CD + tests for quality requirements), OR
  - Code signals + document aligned (both present and consistent)
  Example PASS for documentation requirement: "Security Policy (v2, 2025-01) states: 'All data is encrypted with AES-256.' GitHub repo contains encryption library imports."

PARTIAL: Requirement partially addressed — policy exists but implementation unclear, or code exists but documentation missing.
  - Document mentions requirement but no implementation steps shown, OR
  - Code signals show related capability but no formal policy/docs, OR
  - Implementation incomplete (e.g., "encryption planned" or "partial rollout")
  Example PARTIAL: "Document outlines encryption strategy but no evidence of actual deployment. GitHub has encryption library but no active use in critical paths."

FAIL: Requirement explicitly NOT met OR evidence contradicts control.
  - Document explicitly states non-compliance (e.g., "We do not encrypt data"), OR
  - Policy requires X but code signals show the opposite, OR
  - Implementation exists but fails to meet standard (e.g., "passwords stored in plaintext")
  Example FAIL: "Security policy requires encryption but codebase contains hardcoded credentials and no encryption libraries."

NO_EVIDENCE: No mention of this requirement anywhere in documents, code signals, or clarifications.
  - No keyword matches in documents, OR
  - No related GitHub signals, OR
  - Company size/type makes requirement likely N/A but not explicitly stated
  Example NO_EVIDENCE: "No documents or code signals mention this control. Clarification needed to determine applicability."

## Contradictory Evidence Rule

IF questionnaire answer contradicts code signals:
  - Default to code signals (automated, higher reliability).
  - Note contradiction in gaps field: "Questionnaire states X, but codebase indicates Y — code signals take precedence."
  Example: User says "no AI" but GitHub shows tensorflow imports → note contradiction, evaluate based on code.

## Confidence Calibration (strict ranges)

0.9–1.0: Multiple independent sources align (documents + code signals + questionnaire all agree).
  Example: Policy doc + GitHub CI/CD + user confirmation = 0.95

0.7–0.89: Two sources present and consistent, third silent or weak.
  Example: Document + code signals aligned, no questionnaire = 0.8

0.5–0.69: Single strong source (e.g., detailed doc) OR two sources partially align.
  Example: Document detailed + code signals ambiguous = 0.6

0.3–0.49: Single weak signal (keyword match only, no implementation evidence).
  Example: Document mentions word "encryption" but no details = 0.35

<0.3: No direct evidence, only inference or assumptions.
  Example: Company is in finance → assume data sensitivity, but no actual evidence = 0.2

## Automated Code Signals

GitHub repo scans are real evidence of what the company has. Use them aggressively:
- hasAuth=true → evidence for access control, authentication requirements
- hasCI + hasTests → evidence for quality management, change control, testing
- hasEncryption → evidence for data protection, security controls
- docCount + hasReadme → evidence for documentation, transparency requirements
If a GitHub signal is present AND related to the control, add 0.1–0.2 to confidence (it's real implementation evidence).`;

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
${codeSignalContext}

## Your task
Evaluate whether the uploaded documents AND code/infrastructure signals satisfy this compliance control.

Use the status definitions and confidence ranges provided in the system prompt.
If questionnaire contradicts code signals, default to code signals and note the contradiction.

You MUST respond with a JSON object matching this exact structure:
{
  "status": "PASS" | "FAIL" | "PARTIAL" | "NO_EVIDENCE",
  "confidence": <number 0-1, use calibration ranges from system prompt>,
  "summary": "<1-2 sentences: what did you find?>",
  "gaps": [<specific missing items if not PASS, be precise; empty if PASS>],
  "remediations": [<concrete actionable steps to fix each gap; empty if PASS>],
  "evidenceUsed": [<which sources contributed: document filenames, "GitHub repo scan", "questionnaire", "clarification">]
}

Rules:
- PASS/FAIL/PARTIAL/NO_EVIDENCE must match definitions in system prompt exactly
- Confidence must fall in ranges defined above (0.9+, 0.7–0.89, 0.5–0.69, 0.3–0.49, <0.3)
- Be specific about gaps, not generic
- When contradictions exist between evidence sources, explicitly note them

Return ONLY the JSON object, no markdown fencing.`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    let res: Awaited<ReturnType<typeof client.messages.create>>;
    try {
      res = await client.messages.create(
        {
          model: AI_MODELS.FAST,
          max_tokens: 1000,
          system: systemPrompt,
          messages: [{ role: "user", content: prompt }],
        },
        { signal: controller.signal }
      );
    } finally {
      clearTimeout(timeoutId);
    }

    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    const match = text.match(/\{[\s\S]*\}/);
    if (!match) {
      console.warn(`LLM evaluator returned no JSON for ${rule.code}, falling back to static check`);
      return rule.check(evidence);
    }

    const parsed = JSON.parse(match[0]) as ControlEvalResult & { summary?: string };

    return {
      status: parsed.status,
      confidence: Math.min(Math.max(parsed.confidence, 0), 1),
      evidenceUsed: parsed.evidenceUsed ?? [],
      gaps: parsed.gaps ?? [],
      remediations: parsed.remediations ?? [],
      lawyerQuestions: parsed.lawyerQuestions ?? [],
      note: parsed.summary ?? parsed.note ?? "",
    };
  } catch (err) {
    console.error(`LLM evaluation failed for ${rule.code}:`, err);
    // Fall back to static check on error
    return rule.check(evidence);
  }
}

/**
 * Build a human-readable summary of code signals relevant to a control.
 */
function buildCodeSignalContext(
  codeSignals: Record<string, unknown>,
  rule: ControlRule
): string {
  if (Object.keys(codeSignals).length === 0) return "";

  const sections: string[] = ["\n## Code & Infrastructure Signals (automated scan results)"];

  const keys = rule.evidenceKeys.join(" ").toLowerCase();
  const title = rule.title.toLowerCase();

  const gh = codeSignals.github as Record<string, unknown> | undefined;
  if (gh) {
    sections.push(`GitHub Repository: ${gh.repo}`);
    sections.push(`Scanned at: ${gh.scannedAt}`);
    sections.push("");

    // Security-related
    if (keys.includes("auth") || keys.includes("access") || title.includes("access") || title.includes("auth")) {
      sections.push(`Authentication: ${gh.hasAuth ? `Yes (${(gh.authPatterns as string[])?.join(", ")})` : "Not detected"}`);
    }
    if (keys.includes("encrypt") || keys.includes("data protection") || title.includes("encrypt") || title.includes("security")) {
      sections.push(`Encryption: ${gh.hasEncryption ? "Yes" : "Not detected"}`);
      sections.push(`Input validation: ${gh.hasInputValidation ? "Yes" : "Not detected"}`);
      sections.push(`Security headers: ${gh.securityHeaders ? "Yes" : "Not detected"}`);
    }
    if (keys.includes("log") || keys.includes("monitor") || title.includes("log") || title.includes("monitor")) {
      sections.push(`Logging/monitoring: ${gh.hasLogging ? "Yes" : "Not detected"}`);
    }

    // Documentation-related
    if (keys.includes("document") || keys.includes("policy") || title.includes("document") || title.includes("transparency")) {
      sections.push(`README: ${gh.hasReadme ? "Yes" : "No"}`);
      sections.push(`SECURITY.md: ${gh.hasSecurityMd ? "Yes" : "No"}`);
      sections.push(`Privacy policy: ${gh.hasPrivacyPolicy ? "Yes" : "No"}`);
      sections.push(`Documentation files: ${gh.docCount}`);
    }

    // CI/CD and change management
    if (keys.includes("ci") || keys.includes("test") || keys.includes("change") || title.includes("management") || title.includes("quality")) {
      sections.push(`CI/CD: ${gh.hasCI ? "Yes" : "No"}`);
      sections.push(`Automated tests: ${gh.hasTests ? "Yes" : "No"}`);
      sections.push(`Dependabot: ${gh.hasDependabot ? "Yes" : "No"}`);
      sections.push(`Code scanning: ${gh.hasCodeScanning ? "Yes" : "No"}`);
      sections.push(`Branch protection: ${gh.hasBranchProtection ? "Yes" : "No"}`);
    }

    // Always include the summary and a selection of relevant findings
    if (gh.summary) sections.push(`\nSummary: ${gh.summary}`);

    const findings = gh.allFindings as string[] | undefined;
    if (findings && findings.length > 0) {
      // Filter findings relevant to this control
      const relevantFindings = findings.filter((f) => {
        const fl = f.toLowerCase();
        return rule.evidenceKeys.some((k) => fl.includes(k.toLowerCase())) ||
          rule.title.toLowerCase().split(/\s+/).some((w) => w.length > 3 && fl.includes(w));
      });
      const toShow = relevantFindings.length > 0 ? relevantFindings.slice(0, 6) : findings.slice(0, 4);
      sections.push(`\nRelevant findings:\n${toShow.map((f) => `- ${f}`).join("\n")}`);
    }
  }

  // ── Google Workspace signals ──────────────────────────────────
  const gws = codeSignals.googleWorkspace as Record<string, unknown> | undefined;
  if (gws) {
    sections.push(`\n## Google Workspace: ${gws.workspace}`);
    sections.push(`Scanned at: ${gws.scannedAt}`);

    if (keys.includes("access") || keys.includes("auth") || title.includes("access") || title.includes("security")) {
      sections.push(`Total users: ${gws.totalUsers}, Admins: ${gws.adminUsers}`);
      sections.push(`2FA enforced (80%+): ${gws.has2FAEnforced ? "Yes" : "No"}`);
      sections.push(`Organization units: ${gws.orgUnitsCount}`);
    }
    if (keys.includes("monitor") || keys.includes("log") || keys.includes("audit") || title.includes("monitor") || title.includes("breach")) {
      sections.push(`Login monitoring: ${gws.hasLoginMonitoring ? "Active" : "Not detected"}`);
      sections.push(`Recent security events (7d): ${gws.recentSecurityEvents}`);
      sections.push(`Admin actions (7d): ${(gws.recentAdminActions as string[])?.length ?? 0}`);
    }
    if (gws.summary) sections.push(`Summary: ${gws.summary}`);
  }

  // ── Slack signals ───────────────────────────────────────────
  const slack = codeSignals.slack as Record<string, unknown> | undefined;
  if (slack) {
    sections.push(`\n## Slack Workspace: ${slack.teamName}`);

    if (keys.includes("incident") || keys.includes("breach") || title.includes("incident") || title.includes("breach")) {
      sections.push(`Incident channel: ${slack.hasIncidentChannel ? "Yes" : "No"}`);
      sections.push(`Security channel: ${slack.hasSecurityChannel ? "Yes" : "No"}`);
      sections.push(`Active incident process: ${slack.hasActiveIncidentProcess ? "Yes" : "No"}`);
    }
    if (keys.includes("security") || title.includes("security") || title.includes("organisation")) {
      const channels = (slack.complianceChannels as Array<{ name: string; category: string }>) ?? [];
      if (channels.length > 0) {
        sections.push(`Compliance channels: ${channels.map((c) => `#${c.name} (${c.category})`).join(", ")}`);
      }
    }
    if (slack.summary) sections.push(`Summary: ${slack.summary}`);
  }

  // ── Notion signals ──────────────────────────────────────────
  const notion = codeSignals.notion as Record<string, unknown> | undefined;
  if (notion) {
    sections.push(`\n## Notion Workspace: ${notion.workspaceName}`);
    sections.push(`Compliance pages found: ${notion.compliancePagesFound}`);

    if (keys.includes("privacy") || keys.includes("policy") || title.includes("privacy")) {
      sections.push(`Privacy policy: ${notion.hasPrivacyPolicy ? "Found" : "Not found"}`);
    }
    if (keys.includes("security") || title.includes("security")) {
      sections.push(`Security policy: ${notion.hasSecurityPolicy ? "Found" : "Not found"}`);
    }
    if (keys.includes("incident") || keys.includes("breach") || title.includes("breach")) {
      sections.push(`Incident response plan: ${notion.hasIncidentResponse ? "Found" : "Not found"}`);
    }
    if (keys.includes("dpia") || keys.includes("impact") || title.includes("impact")) {
      sections.push(`DPIA: ${notion.hasDPIA ? "Found" : "Not found"}`);
    }
    if (keys.includes("ropa") || keys.includes("processing") || title.includes("processing")) {
      sections.push(`RoPA: ${notion.hasRoPA ? "Found" : "Not found"}`);
    }
    if (notion.hasAIPolicy) {
      sections.push(`AI governance policy: Found`);
    }
    if (notion.summary) sections.push(`Summary: ${notion.summary}`);
  }

  return sections.join("\n");
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
