import type { ControlRule, EvidencePool } from "@/types/scan";

function hasDoc(ev: EvidencePool, ...keywords: string[]): boolean {
  return ev.documents.some((d) =>
    keywords.some((kw) => d.text.toLowerCase().includes(kw) || d.fileName.toLowerCase().includes(kw))
  );
}

function hasGitSignal(ev: EvidencePool, key: string): boolean {
  const gh = ev.codeSignals?.github as Record<string, unknown> | undefined;
  if (!gh) return false;
  return !!gh[key];
}

function hasGWSSignal(ev: EvidencePool, key: string): boolean {
  const gws = ev.codeSignals?.googleWorkspace as Record<string, unknown> | undefined;
  if (!gws) return false;
  return !!gws[key];
}

function hasSlackSignal(ev: EvidencePool, key: string): boolean {
  const slack = ev.codeSignals?.slack as Record<string, unknown> | undefined;
  if (!slack) return false;
  return !!slack[key];
}

function hasNotionSignal(ev: EvidencePool, key: string): boolean {
  const notion = ev.codeSignals?.notion as Record<string, unknown> | undefined;
  if (!notion) return false;
  return !!notion[key];
}

export const nis2Rules: ControlRule[] = [
  {
    id: "NIS2_Art21a_risk_analysis",
    code: "NIS2-Art21(2)(a)",
    title: "Policies on risk analysis and information system security",
    frameworks: ["NIS2"],
    evidenceKeys: ["risk_analysis", "security_policy", "isms"],
    articleRefs: { NIS2: "Art. 21(2)(a)" },
    check: (ev) => {
      const hasRiskDoc = hasDoc(ev, "risk analysis", "risk assessment", "information security policy", "isms", "cyber risk");
      const notionHasSecPolicy = hasNotionSignal(ev, "hasSecurityPolicy");
      const hasAuth = hasGitSignal(ev, "hasAuth");
      const hasEncryption = hasGitSignal(ev, "hasEncryption");

      const anyPolicy = hasRiskDoc || notionHasSecPolicy;
      const hasCodeSignals = hasAuth || hasEncryption;

      const sources: string[] = [];
      if (hasRiskDoc) sources.push("risk_analysis_policy");
      if (notionHasSecPolicy) sources.push("Notion: security policy");
      if (hasAuth) sources.push("GitHub: authentication");
      if (hasEncryption) sources.push("GitHub: encryption");

      return {
        status: anyPolicy && hasCodeSignals ? "PASS" : anyPolicy ? "PARTIAL" : "NO_EVIDENCE",
        confidence: anyPolicy && hasCodeSignals ? 0.9 : anyPolicy ? 0.55 : 0.2,
        evidenceUsed: sources,
        gaps: anyPolicy ? (hasCodeSignals ? [] : ["Policy documented but no technical security controls detected"]) : ["No risk analysis policy or information security policy found"],
        remediations: anyPolicy ? ["Implement technical security controls: authentication, encryption, and logging per NIS2 Art. 21(2)(e)"] : ["Establish a documented risk analysis process and information security policy covering identification, assessment, and treatment of cybersecurity risks"],
        lawyerQuestions: ["Are we in scope for NIS2 as an essential or important entity, and what sector-specific requirements apply to our risk management obligations?"],
        note: anyPolicy && hasCodeSignals ? "Risk/security policy with technical enforcement verified." : anyPolicy ? "Risk/security policy found but enforcement not verified." : "NIS2 Art. 21(2)(a) requires documented risk analysis and security policies plus technical controls.",
      };
    },
  },
  {
    id: "NIS2_Art21b_incident_handling",
    code: "NIS2-Art21(2)(b)",
    title: "Incident handling procedures implemented",
    frameworks: ["NIS2"],
    evidenceKeys: ["incident_handling", "incident_response"],
    articleRefs: { NIS2: "Art. 21(2)(b)" },
    check: (ev) => {
      const hasIRDoc = hasDoc(ev, "incident handling", "incident response", "security incident", "incident management", "breach response");
      const hasSecurityMd = hasGitSignal(ev, "hasSecurityMd");
      const hasIncidentChannel = hasSlackSignal(ev, "hasIncidentChannel");
      const hasActiveProcess = hasSlackSignal(ev, "hasActiveIncidentProcess");
      const notionHasIR = hasNotionSignal(ev, "hasIncidentResponse");

      const hasEvidence = hasIRDoc || hasSecurityMd || hasIncidentChannel || notionHasIR;
      const hasStrongEvidence = hasIRDoc || notionHasIR || (hasSecurityMd && hasActiveProcess);
      const sources: string[] = [];
      if (hasIRDoc) sources.push("incident_handling_procedure");
      if (hasSecurityMd) sources.push("GitHub: SECURITY.md");
      if (hasIncidentChannel) sources.push("Slack: #incident channel");
      if (notionHasIR) sources.push("Notion: incident response plan");

      return {
        status: hasStrongEvidence ? "PASS" : hasEvidence ? "PARTIAL" : "NO_EVIDENCE",
        confidence: hasStrongEvidence ? 0.85 : hasEvidence ? 0.55 : 0.2,
        evidenceUsed: sources,
        gaps: hasStrongEvidence ? [] : hasEvidence ? ["Partial IR evidence — a formal documented procedure is needed"] : ["No incident handling procedure found"],
        remediations: ["Create a formal incident handling procedure covering detection, classification, containment, recovery, and post-incident analysis"],
        lawyerQuestions: ["What constitutes a 'significant incident' under NIS2 Art. 23 that triggers mandatory reporting to the national CSIRT?"],
        note: hasEvidence ? `IR evidence from ${sources.length} source(s).` : "NIS2 Art. 21(2)(b) requires documented incident handling procedures.",
      };
    },
  },
  {
    id: "NIS2_Art21c_business_continuity",
    code: "NIS2-Art21(2)(c)",
    title: "Business continuity and crisis management",
    frameworks: ["NIS2"],
    evidenceKeys: ["business_continuity", "disaster_recovery", "crisis_management"],
    articleRefs: { NIS2: "Art. 21(2)(c)" },
    check: (ev) => {
      const hasBCPDoc = hasDoc(ev, "business continuity", "disaster recovery", "bcp", "crisis management", "backup", "recovery plan");
      const notionHasBC = hasNotionSignal(ev, "hasBusinessContinuity");
      const hasCI = hasGitSignal(ev, "hasCI");

      const sources: string[] = [];
      if (hasBCPDoc) sources.push("business_continuity_plan");
      if (notionHasBC) sources.push("Notion: business continuity docs");
      if (hasCI) sources.push("GitHub: CI/CD deployment automation");

      return {
        status: hasBCPDoc || notionHasBC ? "PASS" : hasCI ? "PARTIAL" : "NO_EVIDENCE",
        confidence: hasBCPDoc ? 0.9 : notionHasBC ? 0.75 : hasCI ? 0.4 : 0.2,
        evidenceUsed: sources,
        gaps: (hasBCPDoc || notionHasBC) ? [] : ["No business continuity or disaster recovery plan found"],
        remediations: ["Create a BCP/DRP covering backup procedures, RTO/RPO targets, and crisis communication protocols"],
        lawyerQuestions: ["Does NIS2 Art. 21(2)(c) require us to test our BCP annually, and must test results be provided to the competent authority?"],
        note: (hasBCPDoc || notionHasBC) ? "Business continuity plan found." : "NIS2 Art. 21(2)(c) requires business continuity and crisis management procedures.",
      };
    },
  },
  {
    id: "NIS2_Art21d_supply_chain",
    code: "NIS2-Art21(2)(d)",
    title: "Supply chain security measures",
    frameworks: ["NIS2"],
    evidenceKeys: ["supply_chain_security", "vendor_security"],
    articleRefs: { NIS2: "Art. 21(2)(d)" },
    check: (ev) => {
      const hasSupplyDoc = hasDoc(ev, "supply chain", "vendor security", "third party security", "supplier assessment", "subprocessor security");
      const hasDependabot = hasGitSignal(ev, "hasDependabot");
      const hasCodeScanning = hasGitSignal(ev, "hasCodeScanning");

      const sources: string[] = [];
      if (hasSupplyDoc) sources.push("supply_chain_security_policy");
      if (hasDependabot) sources.push("GitHub: Dependabot (dependency security)");
      if (hasCodeScanning) sources.push("GitHub: code scanning");

      const techCount = [hasDependabot, hasCodeScanning].filter(Boolean).length;

      return {
        status: hasSupplyDoc ? "PASS" : techCount >= 2 ? "PARTIAL" : "NO_EVIDENCE",
        confidence: hasSupplyDoc ? 0.85 : techCount >= 2 ? 0.55 : techCount >= 1 ? 0.4 : 0.2,
        evidenceUsed: sources,
        gaps: hasSupplyDoc ? [] : ["No supply chain security policy found"],
        remediations: ["Document your supply chain security measures: vendor vetting criteria, security requirements in contracts, and software dependency management"],
        lawyerQuestions: ["Under NIS2 Art. 21(2)(d), must we assess cybersecurity practices of all direct suppliers, or only critical ones?"],
        note: hasSupplyDoc ? "Supply chain security policy found." : "NIS2 Art. 21(2)(d) requires measures addressing security in supply chains.",
      };
    },
  },
  {
    id: "NIS2_Art21e_network_security",
    code: "NIS2-Art21(2)(e)",
    title: "Network and information systems security",
    frameworks: ["NIS2"],
    evidenceKeys: ["network_security", "systems_security"],
    articleRefs: { NIS2: "Art. 21(2)(e)" },
    check: (ev) => {
      const hasNetworkDoc = hasDoc(ev, "network security", "firewall", "network segmentation", "system hardening", "patch management", "vulnerability");
      const hasEncryption = hasGitSignal(ev, "hasEncryption");
      const hasAuth = hasGitSignal(ev, "hasAuth");
      const hasLogging = hasGitSignal(ev, "hasLogging");
      const hasDependabot = hasGitSignal(ev, "hasDependabot");
      const has2FA = hasGWSSignal(ev, "has2FAEnforced");

      const techCount = [hasEncryption, hasAuth, hasLogging, hasDependabot, has2FA].filter(Boolean).length;
      const sources: string[] = [];
      if (hasNetworkDoc) sources.push("network_security_policy");
      if (hasEncryption) sources.push("GitHub: encryption");
      if (hasAuth) sources.push("GitHub: authentication");
      if (hasLogging) sources.push("GitHub: audit logging");
      if (has2FA) sources.push("Google Workspace: 2FA");

      if (hasNetworkDoc && techCount >= 3) {
        return { status: "PASS", confidence: 0.9, evidenceUsed: sources, gaps: [], remediations: [], lawyerQuestions: [], note: `NIS2 network/system security: policy documented + ${techCount} controls verified.` };
      }
      if (techCount >= 2) {
        return { status: "PARTIAL", confidence: 0.6, evidenceUsed: sources, gaps: hasNetworkDoc ? [] : ["Network security policy not formally documented"], remediations: ["Document network security architecture, hardening baselines, and patch management procedures"], lawyerQuestions: [], note: `${techCount} technical controls detected.` };
      }
      return { status: "NO_EVIDENCE", confidence: 0.2, evidenceUsed: [], gaps: ["Insufficient network and information system security evidence"], remediations: ["Implement encryption, access controls, logging, and network security policy"], lawyerQuestions: ["What technical security baseline does NIS2 Art. 21(2)(e) require for our entity type?"], note: "NIS2 Art. 21(2)(e) requires security of network and information systems." };
    },
  },
  {
    id: "NIS2_Art21f_staff_awareness",
    code: "NIS2-Art21(2)(f)",
    title: "Cybersecurity hygiene and staff awareness training",
    frameworks: ["NIS2"],
    evidenceKeys: ["security_awareness", "staff_training", "cybersecurity_hygiene"],
    articleRefs: { NIS2: "Art. 21(2)(f)" },
    check: (ev) => {
      const hasTrainingDoc = hasDoc(ev, "security awareness", "staff training", "cybersecurity training", "phishing", "employee security");
      const hasSecurityChannel = hasSlackSignal(ev, "hasSecurityChannel");

      const sources: string[] = [];
      if (hasTrainingDoc) sources.push("security_awareness_program");
      if (hasSecurityChannel) sources.push("Slack: security channel for staff communications");

      return {
        status: hasTrainingDoc ? "PASS" : hasSecurityChannel ? "PARTIAL" : "NO_EVIDENCE",
        confidence: hasTrainingDoc ? 0.85 : hasSecurityChannel ? 0.4 : 0.2,
        evidenceUsed: sources,
        gaps: hasTrainingDoc ? [] : ["No cybersecurity awareness training programme documented"],
        remediations: ["Implement annual security awareness training covering phishing, password hygiene, data handling, and incident reporting for all staff"],
        lawyerQuestions: ["Does NIS2 Art. 21(2)(f) require documented training records, and must training cover specific topics defined by ENISA?"],
        note: hasTrainingDoc ? "Security awareness training programme found." : "NIS2 Art. 21(2)(f) requires cybersecurity hygiene practices and staff training.",
      };
    },
  },
  {
    id: "NIS2_Art21h_crypto_policy",
    code: "NIS2-Art21(2)(h)",
    title: "Cryptography and encryption policies",
    frameworks: ["NIS2"],
    evidenceKeys: ["cryptography", "encryption_policy"],
    articleRefs: { NIS2: "Art. 21(2)(h)" },
    check: (ev) => {
      const hasCryptoDoc = hasDoc(ev, "cryptography", "encryption policy", "key management", "tls", "certificate management");
      const hasEncryption = hasGitSignal(ev, "hasEncryption");

      const sources: string[] = [];
      if (hasCryptoDoc) sources.push("cryptography_policy");
      if (hasEncryption) sources.push("GitHub: encryption implementation");

      return {
        status: hasCryptoDoc && hasEncryption ? "PASS" : hasCryptoDoc || hasEncryption ? "PARTIAL" : "NO_EVIDENCE",
        confidence: hasCryptoDoc && hasEncryption ? 0.9 : hasEncryption ? 0.6 : hasCryptoDoc ? 0.65 : 0.2,
        evidenceUsed: sources,
        gaps: [
          ...(!hasCryptoDoc ? ["No cryptography/encryption policy documented"] : []),
          ...(!hasEncryption ? ["No encryption implementation detected in codebase"] : []),
        ],
        remediations: ["Document encryption standards (TLS 1.2+, AES-256), key management procedures, and prohibited algorithms"],
        lawyerQuestions: ["Does NIS2 Art. 21(2)(h) require specific encryption standards, or is compliance with ENISA's cryptographic guidelines sufficient?"],
        note: "NIS2 Art. 21(2)(h) requires policies on the use of cryptography and encryption.",
      };
    },
  },
  {
    id: "NIS2_Art23_incident_reporting",
    code: "NIS2-Art23",
    title: "Significant incident reporting obligations",
    frameworks: ["NIS2"],
    evidenceKeys: ["incident_reporting", "notification_procedure"],
    articleRefs: { NIS2: "Art. 23" },
    check: (ev) => {
      const hasReportingDoc = hasDoc(ev, "incident reporting", "notification obligation", "csirt", "competent authority", "significant incident");
      const hasTimeframeDoc = hasDoc(ev, "24 hours", "72 hours", "within 24", "within 72", "24h", "72h", "early warning");
      const hasIRDoc = hasDoc(ev, "incident response", "incident handling");
      const notionHasIR = hasNotionSignal(ev, "hasIncidentResponse");

      const sources: string[] = [];
      if (hasReportingDoc) sources.push("incident_reporting_procedure");
      if (hasTimeframeDoc) sources.push("reporting_timeframe_24h_72h");
      if (hasIRDoc) sources.push("incident_response_plan");
      if (notionHasIR) sources.push("Notion: incident response");

      return {
        status: hasReportingDoc && hasTimeframeDoc ? "PASS" : hasReportingDoc || hasIRDoc || notionHasIR ? "PARTIAL" : "NO_EVIDENCE",
        confidence: hasReportingDoc && hasTimeframeDoc ? 0.9 : (hasReportingDoc || hasIRDoc) ? 0.5 : 0.2,
        evidenceUsed: sources,
        gaps: hasReportingDoc && hasTimeframeDoc ? [] : [
          ...(!hasReportingDoc ? ["No NIS2 Art. 23 incident reporting procedure documented"] : []),
          ...(!hasTimeframeDoc && (hasReportingDoc || hasIRDoc) ? ["Reporting procedure lacks explicit 24h (early warning) and 72h (notification) timelines"] : [])
        ],
        remediations: ["Document the NIS2 incident reporting timeline: early warning to CSIRT within 24h, incident notification within 72h, final report within 1 month"],
        lawyerQuestions: ["Which national CSIRT or competent authority must we notify for incidents, and what thresholds trigger NIS2 Art. 23 reporting?"],
        note: hasReportingDoc && hasTimeframeDoc ? "Incident reporting with 24h/72h SLA found." : (hasReportingDoc || hasIRDoc) ? "Incident reporting procedure found but timeframes not explicit." : "NIS2 Art. 23 requires notification to CSIRT within 24h (early warning) and 72h (notification) for significant incidents.",
      };
    },
  },
];
