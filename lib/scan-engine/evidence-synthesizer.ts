import { getAnthropicClient, AI_MODELS } from "@/lib/ai";
import type { EvidencePool, DocumentChunk } from "@/types/scan";
import type Anthropic from "@anthropic-ai/sdk";

/**
 * LLM-powered evidence synthesis.
 *
 * Sits between raw data collection and per-control evaluation.
 * Claude looks at ALL available evidence holistically — code signals,
 * documents, onboarding, clarifications — and produces structured
 * compliance evidence summaries that become synthetic document chunks.
 *
 * This means:
 * 1. Static rules can pick up code signal insights via keyword matching
 *    (because the synthesis output is written with compliance vocabulary)
 * 2. The LLM evaluator gets pre-digested context instead of raw booleans
 * 3. Patterns across sources get connected ("auth + encryption + logging = security posture")
 * 4. The scan asks fewer clarification questions because evidence gaps are smaller
 */

export interface SynthesisResult {
  /** Synthetic document chunks injected into the evidence pool */
  syntheticDocuments: DocumentChunk[];
  /** Short inline-thinking messages for the user to see progress */
  thinkingSteps: string[];
  /** Questionnaire fields that can be auto-filled from evidence */
  inferredAnswers: Record<string, string>;
}

export async function synthesizeEvidence(evidence: EvidencePool): Promise<SynthesisResult> {
  const codeSignals = evidence.codeSignals;
  const hasGitHub = !!(codeSignals.github as Record<string, unknown> | undefined);
  const hasGoogleWorkspace = !!(codeSignals.googleWorkspace as Record<string, unknown> | undefined);
  const hasSlack = !!(codeSignals.slack as Record<string, unknown> | undefined);
  const hasNotion = !!(codeSignals.notion as Record<string, unknown> | undefined);
  const hasDocuments = evidence.documents.length > 0;
  const hasAnyIntegration = hasGitHub || hasGoogleWorkspace || hasSlack || hasNotion;

  // If there's nothing to synthesize, skip
  if (!hasAnyIntegration && !hasDocuments) {
    return { syntheticDocuments: [], thinkingSteps: [], inferredAnswers: {} };
  }

  const thinkingSteps: string[] = [];

  // Build the raw data dump for Claude to reason over
  const sections: string[] = [];

  // Company context
  sections.push(`## Company Profile
- Name: ${evidence.onboarding.companyName}
- Industry: ${evidence.onboarding.industry}
- Country: ${evidence.onboarding.country}
- Size: ${evidence.onboarding.size} employees
- Uses AI: ${evidence.onboarding.usesAI}${evidence.onboarding.aiDescription ? ` (${evidence.onboarding.aiDescription})` : ""}
- Data categories: ${evidence.onboarding.dataCategories.length > 0 ? evidence.onboarding.dataCategories.join(", ") : "not specified"}`);

  // GitHub signals
  const gh = codeSignals.github as Record<string, unknown> | undefined;
  if (gh) {
    thinkingSteps.push(`Analyzing GitHub repo "${gh.repo}" for compliance patterns...`);
    sections.push(`## GitHub Repository Scan: ${gh.repo}
Scanned: ${gh.scannedAt}

### Security
- Authentication: ${gh.hasAuth ? `Yes — ${(gh.authPatterns as string[])?.join(", ")}` : "Not detected"}
- Encryption/hashing: ${gh.hasEncryption ? "Yes" : "Not detected"}
- Input validation: ${gh.hasInputValidation ? "Yes" : "Not detected"}
- Logging/monitoring: ${gh.hasLogging ? "Yes" : "Not detected"}
- Rate limiting: ${gh.hasRateLimiting ? "Yes" : "Not detected"}
- CSRF protection: ${gh.hasCSRFProtection ? "Yes" : "Not detected"}
- Security headers: ${gh.securityHeaders ? "Yes" : "Not detected"}

### Documentation
- README: ${gh.hasReadme ? "Yes" : "No"}
- SECURITY.md: ${gh.hasSecurityMd ? "Yes" : "No"}
- Privacy policy: ${gh.hasPrivacyPolicy ? "Yes" : "No"}
- Architecture docs: ${gh.hasArchitectureDocs ? "Yes" : "No"}
- Total doc files: ${gh.docCount}

### CI/CD & Quality
- CI/CD pipelines: ${gh.hasCI ? "Yes" : "No"}
- Automated tests: ${gh.hasTests ? "Yes" : "No"}
- Dependabot: ${gh.hasDependabot ? "Yes" : "No"}
- Code scanning: ${gh.hasCodeScanning ? "Yes" : "No"}
- Branch protection: ${gh.hasBranchProtection ? "Yes" : "No"}

### Raw Findings
${((gh.allFindings as string[]) ?? []).map((f) => `- ${f}`).join("\n")}

### Summary
${gh.summary}`);
  }

  // Google Workspace signals
  const gws = codeSignals.googleWorkspace as Record<string, unknown> | undefined;
  if (gws) {
    thinkingSteps.push(`Analyzing Google Workspace (${gws.workspace}) for access controls and monitoring...`);
    sections.push(`## Google Workspace Scan: ${gws.workspace}
Scanned: ${gws.scannedAt}

### Identity & Access Management
- Total users: ${gws.totalUsers}
- Admin users: ${gws.adminUsers}
- Suspended users: ${gws.suspendedUsers}
- 2FA enforced (80%+): ${gws.has2FAEnforced ? "Yes" : "No"}
- Organization units: ${gws.orgUnitsCount}

### Data Governance
- Shared drives: ${gws.sharedDrivesCount}
- External sharing: ${gws.externalSharingEnabled ? "Enabled" : "Disabled/Unknown"}
- DLP rules: ${gws.hasDataLossPreventionRules ? "Yes" : "Not detected"}

### Security Monitoring
- Login monitoring: ${gws.hasLoginMonitoring ? "Active" : "Not detected"}
- Recent security events (7d): ${gws.recentSecurityEvents}
- Suspicious activity alerts: ${gws.hasSuspiciousActivityAlerts ? "Yes" : "Not detected"}
- Recent admin actions: ${(gws.recentAdminActions as string[])?.length ?? 0}

### Findings
${((gws.allFindings as string[]) ?? []).map((f) => `- ${f}`).join("\n")}

### Summary
${gws.summary}`);
  }

  // Slack workspace signals
  const slack = codeSignals.slack as Record<string, unknown> | undefined;
  if (slack) {
    thinkingSteps.push(`Analyzing Slack workspace "${slack.teamName}" for organizational compliance signals...`);
    const channels = (slack.complianceChannels as Array<{ name: string; category: string; memberCount: number }>) ?? [];
    sections.push(`## Slack Workspace Scan: ${slack.teamName}
Scanned: ${slack.scannedAt}

### Structure
- Total channels: ${slack.totalChannels}
- Total members: ${slack.totalMembers}

### Compliance-Relevant Channels
${channels.length > 0 ? channels.map((c) => `- #${c.name} (${c.category}) — ${c.memberCount} members`).join("\n") : "- None found"}

### Incident Response Readiness
- Security channel: ${slack.hasSecurityChannel ? "Yes" : "No"}
- Incident channel: ${slack.hasIncidentChannel ? "Yes" : "No"}
- Compliance channel: ${slack.hasComplianceChannel ? "Yes" : "No"}
- Privacy channel: ${slack.hasPrivacyChannel ? "Yes" : "No"}
- Active incident process: ${slack.hasActiveIncidentProcess ? "Yes" : "No"}

### Data Governance
- Compliance files shared: ${(slack.recentComplianceFiles as Array<unknown>)?.length ?? 0}
- External file sharing: ${slack.hasExternalSharing ? "Detected" : "Not detected"}

### Findings
${((slack.allFindings as string[]) ?? []).map((f) => `- ${f}`).join("\n")}

### Summary
${slack.summary}`);
  }

  // Notion workspace signals
  const notion = codeSignals.notion as Record<string, unknown> | undefined;
  if (notion) {
    thinkingSteps.push(`Analyzing Notion workspace "${notion.workspaceName}" for compliance documentation...`);
    sections.push(`## Notion Workspace Scan: ${notion.workspaceName}
Scanned: ${notion.scannedAt}
Pages scanned: ${notion.pagesScanned}
Compliance pages found: ${notion.compliancePagesFound}

### Documentation Inventory
- Privacy policy: ${notion.hasPrivacyPolicy ? "Found" : "Not found"}
- Security policy: ${notion.hasSecurityPolicy ? "Found" : "Not found"}
- Incident response plan: ${notion.hasIncidentResponse ? "Found" : "Not found"}
- DPIA: ${notion.hasDPIA ? "Found" : "Not found"}
- RoPA: ${notion.hasRoPA ? "Found" : "Not found"}
- Data retention policy: ${notion.hasDataRetentionPolicy ? "Found" : "Not found"}
- AI governance policy: ${notion.hasAIPolicy ? "Found" : "Not found"}
- Employee handbook: ${notion.hasEmployeeHandbook ? "Found" : "Not found"}
- Vendor management: ${notion.hasVendorManagement ? "Found" : "Not found"}

### Findings
${((notion.allFindings as string[]) ?? []).map((f) => `- ${f}`).join("\n")}

### Summary
${notion.summary}`);
  }

  // Document summaries (first ~500 chars of each unique document)
  if (hasDocuments) {
    thinkingSteps.push(`Reviewing ${evidence.documents.length} document chunks for compliance evidence...`);
    const uniqueFiles = new Map<string, string>();
    for (const doc of evidence.documents) {
      if (!uniqueFiles.has(doc.fileName)) {
        uniqueFiles.set(doc.fileName, doc.text.slice(0, 500));
      }
    }
    const docSummaries = Array.from(uniqueFiles.entries())
      .slice(0, 10)
      .map(([name, preview]) => `- **${name}**: ${preview.replace(/\n/g, " ").slice(0, 200)}...`)
      .join("\n");
    sections.push(`## Uploaded Documents (${uniqueFiles.size} files)\n${docSummaries}`);
  }

  // Clarifications
  if (Object.keys(evidence.clarifications).length > 0) {
    const clarList = Object.entries(evidence.clarifications)
      .map(([code, answer]) => `- ${code}: ${answer}`)
      .join("\n");
    sections.push(`## Prior User Clarifications\n${clarList}`);
  }

  thinkingSteps.push("Synthesizing evidence across all sources into compliance findings...");

  const client = getAnthropicClient();

  try {
    const res = await client.messages.create({
      model: AI_MODELS.FAST,
      max_tokens: 3000,
      system: `You are a compliance evidence analyst for a company going through EU regulatory compliance assessment.

Your job: look at ALL the raw data available (code scans, Google Workspace signals, Slack workspace analysis, Notion documentation, uploaded documents, company profile, prior answers) and synthesize it into structured compliance evidence reports.

Think holistically — connect patterns across ALL sources. For example:
- Auth middleware (GitHub) + 2FA enforcement (Google Workspace) + security channel (Slack) = strong access control evidence (GDPR Art. 32)
- CI/CD + tests + branch protection = evidence of quality management (EU AI Act Art. 15)
- Privacy policy in Notion + privacy policy in repo = comprehensive privacy notice evidence (GDPR Art. 13)
- Incident channel (Slack) + SECURITY.md (GitHub) + incident response doc (Notion) = strong breach handling evidence (GDPR Art. 33)
- Login monitoring (Google Workspace) + logging (GitHub) = evidence of audit trails
- Compliance files in Slack + security policy in Notion = organizational security awareness

Output a JSON object with exactly these keys:
{
  "security_posture": "2-3 sentence summary of the company's security measures, citing specific evidence found across ALL integrations",
  "data_protection": "2-3 sentence summary of data protection practices found",
  "documentation_status": "2-3 sentence summary of documentation completeness (GitHub docs, Notion pages, uploaded files)",
  "quality_management": "2-3 sentence summary of quality/testing practices found",
  "transparency": "2-3 sentence summary of transparency and disclosure practices",
  "incident_response": "2-3 sentence summary of breach/incident handling evidence (Slack channels, GitHub SECURITY.md, Notion plans)",
  "access_management": "2-3 sentence summary of identity and access management (Google Workspace 2FA, org units, user management)",
  "ai_governance": "2-3 sentence summary of AI-specific governance (or 'Not applicable' if company doesn't use AI)",
  "overall_assessment": "3-4 sentence overall compliance posture assessment with key strengths and gaps",
  "inferred_answers": {
    "q_has_security_measures": "yes/no based on evidence",
    "q_has_encryption": "yes/no based on evidence",
    "q_has_logging": "yes/no based on evidence",
    "q_has_ci_cd": "yes/no based on evidence",
    "q_has_testing": "yes/no based on evidence",
    "q_has_privacy_policy": "yes/no based on evidence",
    "q_has_incident_response": "yes/no based on evidence",
    "q_has_2fa": "yes/no based on Google Workspace evidence",
    "q_has_access_controls": "yes/no based on evidence",
    "q_has_audit_logging": "yes/no based on evidence",
    "q_has_security_channel": "yes/no based on Slack evidence",
    "q_has_compliance_docs": "yes/no based on Notion evidence"
  }
}

Be specific — cite what you found. Don't be generic. If something is missing, say so clearly.
Return ONLY the JSON, no markdown fencing.`,
      messages: [
        {
          role: "user",
          content: `Analyze the following raw evidence and produce a synthesized compliance evidence report:\n\n${sections.join("\n\n")}`,
        },
      ],
    });

    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    const match = text.match(/\{[\s\S]*\}/);
    if (!match) {
      console.warn("Evidence synthesis returned no JSON, skipping");
      return { syntheticDocuments: [], thinkingSteps, inferredAnswers: {} };
    }

    const parsed = JSON.parse(match[0]) as Record<string, unknown>;

    // Convert synthesis results into document chunks that static rules can match via keywords
    const syntheticDocuments: DocumentChunk[] = [];
    const synthesisCategories = [
      "security_posture",
      "data_protection",
      "documentation_status",
      "quality_management",
      "transparency",
      "incident_response",
      "access_management",
      "ai_governance",
      "overall_assessment",
    ];

    for (const category of synthesisCategories) {
      const content = parsed[category] as string | undefined;
      if (content && content.length > 10 && !content.toLowerCase().includes("not applicable")) {
        syntheticDocuments.push({
          evidenceId: `synthesis-${category}`,
          fileName: `[AI Analysis] ${category.replace(/_/g, " ")}`,
          chunkIndex: 0,
          text: content,
        });
      }
    }

    // Extract inferred questionnaire answers
    const inferredAnswers: Record<string, string> = {};
    const inferred = parsed.inferred_answers as Record<string, string> | undefined;
    if (inferred) {
      for (const [key, value] of Object.entries(inferred)) {
        if (value && typeof value === "string") {
          inferredAnswers[key] = value;
        }
      }
    }

    const sourcesList = [
      hasGitHub ? "GitHub" : "",
      hasGoogleWorkspace ? "Google Workspace" : "",
      hasSlack ? "Slack" : "",
      hasNotion ? "Notion" : "",
      hasDocuments ? "uploaded documents" : "",
    ].filter(Boolean).join(", ");

    thinkingSteps.push(
      `Synthesized ${syntheticDocuments.length} compliance evidence summaries from ${sourcesList}.`
    );

    return { syntheticDocuments, thinkingSteps, inferredAnswers };
  } catch (err) {
    console.error("Evidence synthesis failed:", err);
    thinkingSteps.push("Evidence synthesis encountered an error — proceeding with raw data.");
    return { syntheticDocuments: [], thinkingSteps, inferredAnswers: {} };
  }
}
