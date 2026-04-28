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

export const doraRules: ControlRule[] = [
  {
    id: "DORA_Art5_ict_risk_framework",
    code: "DORA-Art5",
    title: "ICT risk management framework established",
    frameworks: ["DORA"],
    evidenceKeys: ["ict_risk_framework", "risk_management"],
    articleRefs: { DORA: "Art. 5" },
    check: (ev) => {
      const hasRiskFramework = hasDoc(ev, "ict risk", "information and communication technology risk", "operational risk", "risk management framework", "risk register");
      const notionHasSecPolicy = hasNotionSignal(ev, "hasSecurityPolicy");

      const sources: string[] = [];
      if (hasRiskFramework) sources.push("ict_risk_management_framework");
      if (notionHasSecPolicy) sources.push("Notion: security/risk policy");

      return {
        status: hasRiskFramework ? "PASS" : notionHasSecPolicy ? "PARTIAL" : "NO_EVIDENCE",
        confidence: hasRiskFramework ? 0.9 : notionHasSecPolicy ? 0.55 : 0.2,
        evidenceUsed: sources,
        gaps: hasRiskFramework ? [] : ["No ICT risk management framework documented"],
        remediations: ["Establish a comprehensive ICT risk management framework covering identification, classification, assessment, and treatment of ICT risks per DORA Art. 5"],
        lawyerQuestions: ["Are we in scope for DORA as a financial entity or ICT third-party service provider, and what proportionality principle applies to our risk framework?"],
        note: hasRiskFramework ? "ICT risk framework found." : "DORA Art. 5 requires financial entities to maintain a comprehensive ICT risk management framework.",
      };
    },
  },
  {
    id: "DORA_Art9_protection",
    code: "DORA-Art9",
    title: "ICT systems protection and prevention measures",
    frameworks: ["DORA"],
    evidenceKeys: ["ict_protection", "system_security"],
    articleRefs: { DORA: "Art. 9" },
    check: (ev) => {
      const hasProtectionDoc = hasDoc(ev, "system protection", "security hardening", "patch management", "vulnerability management", "access control", "data protection");
      const hasEncryption = hasGitSignal(ev, "hasEncryption");
      const hasAuth = hasGitSignal(ev, "hasAuth");
      const hasValidation = hasGitSignal(ev, "hasInputValidation");
      const hasDependabot = hasGitSignal(ev, "hasDependabot");

      const techCount = [hasEncryption, hasAuth, hasValidation, hasDependabot].filter(Boolean).length;
      const sources: string[] = [];
      if (hasProtectionDoc) sources.push("protection_policy");
      if (hasEncryption) sources.push("GitHub: encryption");
      if (hasAuth) sources.push("GitHub: access controls");
      if (hasValidation) sources.push("GitHub: input validation");
      if (hasDependabot) sources.push("GitHub: Dependabot");

      if (hasProtectionDoc && techCount >= 2) {
        return { status: "PASS", confidence: 0.9, evidenceUsed: sources, gaps: [], remediations: [], lawyerQuestions: [], note: `DORA Art. 9: protection policy + ${techCount} technical controls verified.` };
      }
      if (techCount >= 2) {
        return { status: "PARTIAL", confidence: 0.6, evidenceUsed: sources, gaps: ["Technical protections exist but no formal ICT protection policy"], remediations: ["Document your ICT protection measures in a formal policy covering hardening, patching, and access controls"], lawyerQuestions: [], note: `${techCount} technical controls detected.` };
      }
      return { status: "NO_EVIDENCE", confidence: 0.2, evidenceUsed: [], gaps: ["Insufficient ICT protection and prevention measures"], remediations: ["Implement encryption, access controls, input validation, and vulnerability management"], lawyerQuestions: ["What specific technical protection standards does DORA Art. 9 require for our ICT systems?"], note: "DORA Art. 9 requires ICT systems protection and prevention measures." };
    },
  },
  {
    id: "DORA_Art10_detection",
    code: "DORA-Art10",
    title: "Detection of anomalous activities and ICT-related incidents",
    frameworks: ["DORA"],
    evidenceKeys: ["anomaly_detection", "monitoring", "siem"],
    articleRefs: { DORA: "Art. 10" },
    check: (ev) => {
      const hasDetectionDoc = hasDoc(ev, "anomaly detection", "monitoring", "siem", "intrusion detection", "security monitoring", "alerting");
      const hasLogging = hasGitSignal(ev, "hasLogging");
      const hasSecurityChannel = hasSlackSignal(ev, "hasSecurityChannel");
      const hasLoginMonitoring = ev.codeSignals?.googleWorkspace ? !!(ev.codeSignals.googleWorkspace as Record<string, unknown>)["hasLoginMonitoring"] : false;

      const sources: string[] = [];
      if (hasDetectionDoc) sources.push("anomaly_detection_policy");
      if (hasLogging) sources.push("GitHub: logging/monitoring");
      if (hasSecurityChannel) sources.push("Slack: security alerting channel");
      if (hasLoginMonitoring) sources.push("Google Workspace: login monitoring");

      const hasEvidence = hasDetectionDoc || hasLogging || hasSecurityChannel || hasLoginMonitoring;

      return {
        status: hasDetectionDoc && hasLogging ? "PASS" : hasEvidence ? "PARTIAL" : "NO_EVIDENCE",
        confidence: hasDetectionDoc && hasLogging ? 0.85 : hasEvidence ? 0.55 : 0.2,
        evidenceUsed: sources,
        gaps: (hasDetectionDoc && hasLogging) ? [] : ["Detection and monitoring capabilities not fully documented or implemented"],
        remediations: ["Implement centralised logging, anomaly detection, and real-time alerting; document detection procedures and thresholds for ICT-related incidents"],
        lawyerQuestions: ["What detection capabilities and response times are required under DORA Art. 10 for our entity classification?"],
        note: hasEvidence ? `Detection evidence from ${sources.length} source(s).` : "DORA Art. 10 requires mechanisms to promptly detect anomalous activities.",
      };
    },
  },
  {
    id: "DORA_Art11_business_continuity",
    code: "DORA-Art11",
    title: "ICT business continuity policy",
    frameworks: ["DORA"],
    evidenceKeys: ["ict_business_continuity", "bcp", "disaster_recovery"],
    articleRefs: { DORA: "Art. 11" },
    check: (ev) => {
      const hasBCPDoc = hasDoc(ev, "business continuity", "disaster recovery", "rto", "rpo", "recovery time objective", "recovery point objective", "bcp", "continuity plan");
      const notionHasBC = hasNotionSignal(ev, "hasBusinessContinuity");
      const hasCI = hasGitSignal(ev, "hasCI");

      const sources: string[] = [];
      if (hasBCPDoc) sources.push("ict_bcp_document");
      if (notionHasBC) sources.push("Notion: business continuity docs");
      if (hasCI) sources.push("GitHub: CI/CD deployment automation");

      return {
        status: hasBCPDoc || notionHasBC ? "PASS" : hasCI ? "PARTIAL" : "NO_EVIDENCE",
        confidence: hasBCPDoc ? 0.9 : notionHasBC ? 0.75 : hasCI ? 0.4 : 0.2,
        evidenceUsed: sources,
        gaps: (hasBCPDoc || notionHasBC) ? [] : ["No ICT business continuity plan with RTO/RPO targets found"],
        remediations: ["Create an ICT BCP with defined RTO/RPO targets, backup and recovery procedures, and failover capabilities per DORA Art. 11"],
        lawyerQuestions: ["What RTO/RPO targets does DORA Art. 11 prescribe for our type of financial entity, and must these be tested annually?"],
        note: (hasBCPDoc || notionHasBC) ? "ICT BCP found." : "DORA Art. 11 requires an ICT business continuity policy with specific recovery objectives.",
      };
    },
  },
  {
    id: "DORA_Art17_incident_management",
    code: "DORA-Art17",
    title: "ICT-related incident management process",
    frameworks: ["DORA"],
    evidenceKeys: ["incident_management", "ict_incident"],
    articleRefs: { DORA: "Art. 17" },
    check: (ev) => {
      const hasIMDoc = hasDoc(ev, "incident management", "ict incident", "incident classification", "incident handling", "incident response");
      const hasSecurityMd = hasGitSignal(ev, "hasSecurityMd");
      const hasIncidentChannel = hasSlackSignal(ev, "hasIncidentChannel");
      const notionHasIR = hasNotionSignal(ev, "hasIncidentResponse");

      const hasEvidence = hasIMDoc || hasSecurityMd || hasIncidentChannel || notionHasIR;
      const sources: string[] = [];
      if (hasIMDoc) sources.push("incident_management_procedure");
      if (hasSecurityMd) sources.push("GitHub: SECURITY.md");
      if (hasIncidentChannel) sources.push("Slack: #incident channel");
      if (notionHasIR) sources.push("Notion: incident management");

      return {
        status: (hasIMDoc || notionHasIR) ? "PASS" : hasEvidence ? "PARTIAL" : "NO_EVIDENCE",
        confidence: hasIMDoc ? 0.9 : notionHasIR ? 0.75 : hasEvidence ? 0.5 : 0.2,
        evidenceUsed: sources,
        gaps: (hasIMDoc || notionHasIR) ? [] : ["No DORA-aligned ICT incident management process found"],
        remediations: ["Establish a documented ICT incident management process with incident classification, escalation procedures, and root cause analysis requirements"],
        lawyerQuestions: ["How does DORA Art. 17 incident classification relate to NIS2 incident reporting, and can we use a single procedure?"],
        note: (hasIMDoc || notionHasIR) ? "ICT incident management found." : "DORA Art. 17 requires a documented ICT-related incident management process.",
      };
    },
  },
  {
    id: "DORA_Art19_major_incident_reporting",
    code: "DORA-Art19",
    title: "Major ICT-related incident reporting to authorities",
    frameworks: ["DORA"],
    evidenceKeys: ["major_incident_reporting", "regulatory_notification"],
    articleRefs: { DORA: "Art. 19" },
    check: (ev) => {
      const hasReportingDoc = hasDoc(ev, "major incident report", "regulatory notification", "dora reporting", "competent authority notification", "significant ict incident");
      const hasIRDoc = hasDoc(ev, "incident response", "incident management");

      const sources: string[] = [];
      if (hasReportingDoc) sources.push("major_incident_reporting_procedure");
      if (hasIRDoc) sources.push("incident_response_plan");

      return {
        status: hasReportingDoc ? "PASS" : hasIRDoc ? "PARTIAL" : "NO_EVIDENCE",
        confidence: hasReportingDoc ? 0.9 : hasIRDoc ? 0.45 : 0.2,
        evidenceUsed: sources,
        gaps: hasReportingDoc ? [] : ["No DORA major incident reporting procedure to competent authorities documented"],
        remediations: ["Document the DORA major incident reporting process: initial notification within 4h of classification, intermediate report within 72h, final report within 1 month"],
        lawyerQuestions: ["What classifies as a 'major ICT-related incident' under DORA Art. 18, and which competent authority do we notify?"],
        note: hasReportingDoc ? "Major incident reporting procedure found." : "DORA Art. 19 requires major ICT incidents to be reported to competent authorities within strict timelines.",
      };
    },
  },
  {
    id: "DORA_Art25_resilience_testing",
    code: "DORA-Art25",
    title: "Digital operational resilience testing programme",
    frameworks: ["DORA"],
    evidenceKeys: ["resilience_testing", "penetration_testing", "threat_led_testing"],
    articleRefs: { DORA: "Art. 25" },
    check: (ev) => {
      const hasTestingDoc = hasDoc(ev, "resilience testing", "penetration test", "pen test", "vulnerability assessment", "threat-led", "tlpt", "red team");
      const hasCodeScanning = hasGitSignal(ev, "hasCodeScanning");
      const hasTests = hasGitSignal(ev, "hasTests");
      const hasCI = hasGitSignal(ev, "hasCI");

      const techCount = [hasCodeScanning, hasTests, hasCI].filter(Boolean).length;
      const sources: string[] = [];
      if (hasTestingDoc) sources.push("resilience_testing_programme");
      if (hasCodeScanning) sources.push("GitHub: automated code scanning");
      if (hasTests) sources.push("GitHub: automated tests");
      if (hasCI) sources.push("GitHub: CI/CD test pipeline");

      return {
        status: hasTestingDoc ? "PASS" : techCount >= 2 ? "PARTIAL" : "NO_EVIDENCE",
        confidence: hasTestingDoc ? 0.85 : techCount >= 2 ? 0.55 : 0.2,
        evidenceUsed: sources,
        gaps: hasTestingDoc ? [] : ["No digital operational resilience testing programme documented"],
        remediations: ["Establish annual resilience testing including vulnerability assessments and, for significant entities, threat-led penetration testing (TLPT) per DORA Art. 26"],
        lawyerQuestions: ["Are we required to conduct threat-led penetration testing (TLPT) under DORA Art. 26, or only basic resilience testing under Art. 25?"],
        note: hasTestingDoc ? "Resilience testing programme found." : "DORA Art. 25 requires a digital operational resilience testing programme.",
      };
    },
  },
  {
    id: "DORA_Art28_third_party_risk",
    code: "DORA-Art28",
    title: "ICT third-party risk management",
    frameworks: ["DORA"],
    evidenceKeys: ["ict_third_party_risk", "vendor_management"],
    articleRefs: { DORA: "Art. 28" },
    check: (ev) => {
      const hasTPRMDoc = hasDoc(ev, "third party risk", "vendor management", "ict service provider", "outsourcing", "critical ict", "subcontracting");
      const notionHasVendor = hasNotionSignal(ev, "hasVendorManagement");

      const sources: string[] = [];
      if (hasTPRMDoc) sources.push("ict_tprm_policy");
      if (notionHasVendor) sources.push("Notion: vendor management");

      return {
        status: hasTPRMDoc || notionHasVendor ? "PASS" : "NO_EVIDENCE",
        confidence: hasTPRMDoc ? 0.9 : notionHasVendor ? 0.7 : 0.2,
        evidenceUsed: sources,
        gaps: (hasTPRMDoc || notionHasVendor) ? [] : ["No ICT third-party risk management policy found"],
        remediations: ["Create an ICT TPRM framework covering: vendor register, risk classification (critical vs non-critical), contractual requirements per DORA Annex, and exit strategies"],
        lawyerQuestions: ["Which of our ICT service providers qualify as 'critical' under DORA Art. 31, triggering the oversight framework?"],
        note: (hasTPRMDoc || notionHasVendor) ? "ICT third-party risk management found." : "DORA Art. 28 requires managing ICT third-party risk with appropriate due diligence.",
      };
    },
  },
];
