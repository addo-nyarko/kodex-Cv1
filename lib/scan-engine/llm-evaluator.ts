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

IMPORTANT: Code signals from GitHub repo scans are real automated evidence — they show what the company actually has in their codebase. Use them to make stronger assessments. For example:
- If code signals show authentication middleware exists, that's evidence for access control requirements
- If code signals show CI/CD with tests, that's evidence for quality assurance and change management
- If code signals show encryption libraries, that's evidence for data protection measures

You MUST respond with a JSON object matching this exact structure:
{
  "status": "PASS" | "FAIL" | "PARTIAL" | "NO_EVIDENCE",
  "confidence": <number 0-1>,
  "evidenceUsed": [<list of document filenames or "GitHub repo scan" used>],
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
- When code signals provide strong automated evidence, confidence should be at least 0.5

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
