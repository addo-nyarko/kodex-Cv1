import { getAnthropicClient, AI_MODELS } from "./ai";
import type Anthropic from "@anthropic-ai/sdk";

/**
 * Document type configurations mapping checklist items to detailed generation prompts.
 * Each document type knows which controls it satisfies and how to generate itself.
 */
export const DOCUMENT_TEMPLATES: Record<string, DocumentTemplate> = {
  // GDPR documents
  privacy_policy: {
    title: "Privacy Policy",
    matchKeywords: ["privacy policy", "privacy notice", "data protection notice"],
    frameworkRefs: ["GDPR Art. 13-14"],
    controlCodes: ["GDPR-Art13", "GDPR-Art6"],
    systemPrompt: `You are a GDPR-specialist legal writer. Generate a production-ready Privacy Policy.

Structure:
1. Introduction & Controller Identity
2. What Data We Collect (with specific categories)
3. How We Use Your Data (purpose + lawful basis for each)
4. Who We Share Data With (recipients, third parties)
5. International Data Transfers (Schrems II, SCCs if applicable)
6. Data Retention Periods
7. Your Rights (access, rectification, erasure, portability, objection, restriction)
8. How to Exercise Your Rights (contact details, response timeframes)
9. Cookies & Tracking (if applicable)
10. Changes to This Policy
11. Contact Information & DPO (if applicable)
12. Supervisory Authority

Requirements:
- Cite specific GDPR articles in parentheses
- Use plain language, avoid unnecessary legal jargon
- Include actual lawful basis for each processing activity (Art. 6(1)(a)-(f))
- Include real retention periods based on the business description
- If the company uses AI, include a section on automated decision-making (Art. 22)
- If the company uses third-party AI APIs, list them as sub-processors`,
  },

  ai_system_description: {
    title: "AI System Description & Risk Assessment",
    matchKeywords: ["ai system", "risk assessment", "annex iv", "eu ai act"],
    frameworkRefs: ["EU AI Act Art. 11, Annex IV"],
    controlCodes: ["AI-Art6", "AI-Art11", "AI-Art13"],
    systemPrompt: `You are an EU AI Act compliance specialist. Generate an AI System Description and Risk Assessment document following Annex IV requirements.

Structure:
1. System Overview
   - Name, version, developer
   - Intended purpose and use cases
   - Target users and deployment context
2. Risk Classification
   - Risk tier (Unacceptable/High/Limited/Minimal) with justification
   - Annex III category analysis
3. System Architecture
   - High-level description of how the AI works
   - Input data types and sources
   - Output types and decision scope
   - Third-party AI services used (models, providers, data flows)
4. Data Governance
   - Training data (if applicable)
   - Input data processing
   - Data quality measures
5. Transparency Measures
   - How users are informed they're interacting with AI
   - Disclosure of AI-assisted decisions
6. Human Oversight
   - Human-in-the-loop mechanisms
   - Override capabilities
   - Escalation procedures
7. Accuracy, Robustness & Cybersecurity
   - Performance metrics and limitations
   - Known failure modes
   - Security measures
8. Bias & Fairness Assessment
   - Potential bias sources
   - Mitigation measures
9. Monitoring & Logging
   - What is logged
   - Incident detection
10. Conformity Assessment Status

Requirements:
- Be specific about the actual AI system described
- Reference specific EU AI Act articles
- Flag any high-risk indicators clearly
- Include concrete limitations and failure modes`,
  },

  dpa: {
    title: "Data Processing Agreement (DPA)",
    matchKeywords: ["data processing", "dpa", "third-party", "addendum", "sub-processor"],
    frameworkRefs: ["GDPR Art. 28"],
    controlCodes: ["GDPR-Art6"],
    systemPrompt: `You are a GDPR data protection lawyer. Generate a Data Processing Agreement template for third-party AI API usage.

Structure:
1. Parties & Definitions
2. Subject Matter & Duration
3. Nature & Purpose of Processing
4. Types of Personal Data Processed
5. Categories of Data Subjects
6. Controller's Obligations
7. Processor's Obligations
   - Process only on documented instructions
   - Confidentiality
   - Security measures (Art. 32)
   - Sub-processor management
   - Data subject rights assistance
   - Deletion/return of data
   - Audit rights
8. Sub-Processors
   - List of current sub-processors (AI API providers)
   - Notification and objection procedure
9. International Data Transfers
   - Standard Contractual Clauses reference
   - Transfer Impact Assessment
10. Security Measures (Annex)
11. Data Breach Notification
12. Liability & Indemnification
13. Term & Termination

Requirements:
- Include placeholder fields for specific third-party AI providers mentioned
- Reference specific GDPR articles throughout
- Include Standard Contractual Clauses reference for non-EU transfers
- Make it practically usable — a founder should be able to fill in the blanks and send it`,
  },

  terms_of_service: {
    title: "Terms of Service",
    matchKeywords: ["terms of service", "terms", "tos", "user agreement"],
    frameworkRefs: ["EU AI Act Art. 13", "GDPR Art. 6"],
    controlCodes: ["AI-Art13", "GDPR-Art6"],
    systemPrompt: `You are a technology lawyer specializing in EU-compliant Terms of Service. Generate Terms of Service for an AI-powered product.

Structure:
1. Acceptance of Terms
2. Description of Service
3. AI-Specific Terms
   - AI system transparency disclosure
   - Limitations of AI capabilities
   - User responsibility for AI outputs
   - Automated decision-making rights
4. User Obligations
   - Acceptable use
   - Prohibited uses
   - Data accuracy
5. Data & Privacy (with link to Privacy Policy)
6. Intellectual Property
   - Company IP
   - User-generated content
   - AI-generated content ownership
7. Liability & Disclaimers
   - AI accuracy disclaimers
   - Limitation of liability
   - Indemnification
8. Service Availability & Modifications
9. Termination
10. Governing Law & Jurisdiction (EU-based)
11. Dispute Resolution
12. Severability
13. Contact Information

Requirements:
- Include specific AI transparency disclosures per EU AI Act Art. 13
- Address autonomous actions and liability if the product takes actions
- Use plain language per EU consumer protection directives
- Include GDPR-compliant data handling references`,
  },

  incident_response: {
    title: "Incident Response & Monitoring Plan",
    matchKeywords: ["incident response", "monitoring", "breach", "security incident"],
    frameworkRefs: ["GDPR Art. 33-34", "NIS2 Art. 23"],
    controlCodes: ["GDPR-Art33"],
    systemPrompt: `You are a cybersecurity and compliance specialist. Generate an Incident Response & Monitoring Plan.

Structure:
1. Purpose & Scope
2. Definitions
   - What constitutes an incident
   - Severity levels (P1-P4) with examples
3. Incident Response Team
   - Roles and responsibilities
   - Contact information template
   - Escalation matrix
4. Detection & Monitoring
   - What is monitored
   - Alert thresholds
   - Logging requirements
5. Response Procedures
   - Phase 1: Identification (0-1 hours)
   - Phase 2: Containment (1-4 hours)
   - Phase 3: Eradication (4-24 hours)
   - Phase 4: Recovery (24-72 hours)
   - Phase 5: Post-Incident Review (within 1 week)
6. GDPR Breach Notification
   - 72-hour supervisory authority notification (Art. 33)
   - Data subject notification criteria (Art. 34)
   - Notification templates
7. AI-Specific Incidents
   - Model failures or unexpected outputs
   - Autonomous action incidents
   - Bias detection events
8. Communication Plan
   - Internal communication
   - External/customer communication
   - Regulatory notification
9. Documentation Requirements
   - Incident log template
   - Lessons learned template
10. Testing & Training
    - Tabletop exercise schedule
    - Staff training requirements

Requirements:
- Include realistic timelines for a small team (1-10 people)
- Reference GDPR Art. 33/34 notification requirements
- Include specific AI/autonomous system incident scenarios
- Provide fillable templates for incident logging and notification`,
  },

  ropa: {
    title: "Record of Processing Activities (RoPA)",
    matchKeywords: ["record of processing", "ropa", "processing activities", "article 30"],
    frameworkRefs: ["GDPR Art. 30"],
    controlCodes: ["GDPR-Art30"],
    systemPrompt: `You are a GDPR data mapping specialist. Generate a Record of Processing Activities (RoPA) document.

For each processing activity, include:
1. Processing activity name
2. Purpose of processing
3. Lawful basis (Art. 6(1) ground)
4. Categories of data subjects
5. Categories of personal data
6. Recipients / categories of recipients
7. Transfers to third countries (with safeguards)
8. Retention period
9. Technical & organizational security measures
10. Data source

Generate a RoPA with 5-8 realistic processing activities based on the company description.
Include activities for: user account management, analytics, AI processing, email communications, payment processing (if applicable), employee data (if applicable).

Requirements:
- Format as a structured table/document
- Include the processing activities a company of this type would realistically have
- Reference specific GDPR articles for each lawful basis
- Include third-party AI API data flows as processing activities`,
  },

  dsr_procedure: {
    title: "Data Subject Rights Procedure",
    matchKeywords: ["data subject", "dsar", "rights procedure", "access request"],
    frameworkRefs: ["GDPR Art. 15-22"],
    controlCodes: ["GDPR-Art15"],
    systemPrompt: `You are a GDPR rights management specialist. Generate a Data Subject Access Request (DSAR) handling procedure.

Structure:
1. Scope — which rights are covered (Arts. 15-22)
2. How requests are received (email, form, in-app)
3. Identity verification steps
4. Response timelines (1 month, extension to 3 months)
5. Per-right handling:
   - Right of access (Art. 15)
   - Right to rectification (Art. 16)
   - Right to erasure / right to be forgotten (Art. 17)
   - Right to restriction (Art. 18)
   - Right to data portability (Art. 20)
   - Right to object (Art. 21)
   - Rights related to automated decision-making (Art. 22)
6. Exceptions and refusal grounds
7. Record-keeping requirements
8. Escalation to supervisory authority
9. Template response letters

Requirements:
- Practical for a small team
- Include template responses for each right
- Include AI-specific considerations (Art. 22)
- Include realistic timelines`,
  },
};

export interface DocumentTemplate {
  title: string;
  matchKeywords: string[];
  frameworkRefs: string[];
  controlCodes: string[];
  systemPrompt: string;
}

/**
 * Find the best matching document template for a checklist item.
 */
export function findTemplate(checklistTitle: string): DocumentTemplate | null {
  const title = checklistTitle.toLowerCase();

  // Score each template by keyword matches
  let bestMatch: DocumentTemplate | null = null;
  let bestScore = 0;

  for (const template of Object.values(DOCUMENT_TEMPLATES)) {
    const score = template.matchKeywords.reduce(
      (sum, kw) => sum + (title.includes(kw) ? kw.length : 0),
      0
    );
    if (score > bestScore) {
      bestScore = score;
      bestMatch = template;
    }
  }

  // Also try matching the template title itself
  if (!bestMatch) {
    for (const template of Object.values(DOCUMENT_TEMPLATES)) {
      if (title.includes(template.title.toLowerCase().slice(0, 10))) {
        return template;
      }
    }
  }

  return bestMatch;
}

/**
 * Integration signals from connected tools (GitHub, etc.)
 * These are injected into policy generation prompts to make documents reference real infrastructure.
 */
export interface IntegrationContext {
  github?: {
    repo: string;
    security: {
      hasAuthMiddleware: boolean;
      authPatterns: string[];
      hasEncryption: boolean;
      encryptionDetails: string[];
      hasInputValidation: boolean;
      validationLibraries: string[];
      hasLogging: boolean;
      loggingDetails: string[];
      hasRateLimiting: boolean;
      hasCSRFProtection: boolean;
      hasHelmetOrSecurityHeaders: boolean;
      findings: string[];
    };
    documentation: {
      hasReadme: boolean;
      hasSecurityMd: boolean;
      hasLicense: boolean;
      licenseType: string;
      hasPrivacyPolicy: boolean;
      findings: string[];
    };
    cicd: {
      hasGitHubActions: boolean;
      workflows: string[];
      hasDependabot: boolean;
      hasCodeScanning: boolean;
      hasTestWorkflow: boolean;
      findings: string[];
    };
    summary: string;
  };
}

/**
 * Build the full generation prompt with company context and integration signals.
 */
export function buildGenerationPrompt(
  template: DocumentTemplate,
  org: {
    name: string;
    industry?: string | null;
    country?: string | null;
    size?: string | null;
    productDescription?: string | null;
    usesAI: boolean;
    aiDescription?: string | null;
    aiPurposes: string[];
    dataCategories: string[];
    userTypes: string[];
    usesThirdPartyAI: boolean;
    thirdPartyProviders: string[];
    trainsOwnModels: boolean;
    riskTier?: string | null;
    applicableFrameworks: string[];
  },
  integrationContext?: IntegrationContext
): string {
  let integrationSection = "";

  if (integrationContext?.github) {
    const gh = integrationContext.github;
    integrationSection = `

--- INTEGRATION SCAN DATA (from actual codebase) ---
The following was automatically detected from the company's GitHub repository (${gh.repo}).
Use these real findings to make the document specific and accurate:

Security Measures Detected:
- Authentication: ${gh.security.hasAuthMiddleware ? `Yes — patterns: ${gh.security.authPatterns.join(", ")}` : "Not detected"}
- Encryption: ${gh.security.hasEncryption ? `Yes — ${gh.security.encryptionDetails.join(", ")}` : "Not detected"}
- Input Validation: ${gh.security.hasInputValidation ? `Yes — libraries: ${gh.security.validationLibraries.join(", ")}` : "Not detected"}
- Logging/Monitoring: ${gh.security.hasLogging ? `Yes — ${gh.security.loggingDetails.join(", ")}` : "Not detected"}
- Rate Limiting: ${gh.security.hasRateLimiting ? "Yes" : "Not detected"}
- CSRF Protection: ${gh.security.hasCSRFProtection ? "Yes" : "Not detected"}
- Security Headers: ${gh.security.hasHelmetOrSecurityHeaders ? "Yes" : "Not detected"}

Documentation Found:
- README: ${gh.documentation.hasReadme ? "Yes" : "No"}
- SECURITY.md: ${gh.documentation.hasSecurityMd ? "Yes" : "No"}
- Privacy Policy: ${gh.documentation.hasPrivacyPolicy ? "Yes" : "No"}
- License: ${gh.documentation.hasLicense ? `Yes (${gh.documentation.licenseType})` : "No"}

CI/CD & DevSecOps:
- GitHub Actions: ${gh.cicd.hasGitHubActions ? `Yes — workflows: ${gh.cicd.workflows.join(", ")}` : "No"}
- Dependency Scanning: ${gh.cicd.hasDependabot ? "Yes (Dependabot)" : "Not configured"}
- Code Scanning: ${gh.cicd.hasCodeScanning ? "Yes" : "Not configured"}
- Automated Tests: ${gh.cicd.hasTestWorkflow ? "Yes" : "Not detected"}

Key Findings:
${[...gh.security.findings, ...gh.documentation.findings, ...gh.cicd.findings].map((f) => `- ${f}`).join("\n")}

IMPORTANT: Reference these actual security measures, tools, and configurations in the document.
Do not use generic placeholders — cite the real libraries, patterns, and workflows detected above.`;
  }

  return `Generate a ${template.title} for this company:

Company: ${org.name}
Industry: ${org.industry ?? "Technology"}
Country: ${org.country ?? "Germany (EU)"}
Team size: ${org.size ?? "1-10"}
Product: ${org.productDescription ?? "Not specified"}

AI Usage: ${org.usesAI ? "Yes" : "No"}
${org.aiDescription ? `AI Description: ${org.aiDescription}` : ""}
${org.aiPurposes.length > 0 ? `AI Purposes: ${org.aiPurposes.join(", ")}` : ""}
${org.usesThirdPartyAI ? `Third-party AI providers: ${org.thirdPartyProviders.join(", ") || "unspecified"}` : ""}
${org.trainsOwnModels ? "Trains own AI models: Yes" : ""}

Data categories handled: ${org.dataCategories.join(", ") || "Not specified"}
User types: ${org.userTypes.join(", ") || "Not specified"}

EU AI Act risk tier: ${org.riskTier ?? "Not classified"}
Applicable frameworks: ${org.applicableFrameworks.join(", ")}
${integrationSection}

Output the complete document in markdown. Use the company name and details throughout — do NOT use placeholders like [Company Name]. Make it specific and ready to use.`;
}

/**
 * Stream-generate a document using Anthropic.
 * Uses the streaming API so text appears in real-time for the user.
 */
export async function* streamGenerateDocument(
  template: DocumentTemplate,
  prompt: string
): AsyncGenerator<string> {
  const client = getAnthropicClient();

  const stream = client.messages.stream({
    model: AI_MODELS.SMART,
    max_tokens: 8000,
    system: template.systemPrompt,
    messages: [{ role: "user", content: prompt }],
  });

  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      yield event.delta.text;
    }
  }
}
