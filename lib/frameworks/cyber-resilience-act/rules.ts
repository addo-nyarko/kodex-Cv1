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

export const cyberResilienceActRules: ControlRule[] = [
  {
    id: "CRA_AnnexI_1_no_vulnerabilities",
    code: "CRA-AnnI(1)",
    title: "Products delivered without known exploitable vulnerabilities",
    frameworks: ["CYBER_RESILIENCE_ACT"],
    evidenceKeys: ["vulnerability_management", "secure_development"],
    articleRefs: { CYBER_RESILIENCE_ACT: "Annex I, Part I(1)" },
    check: (ev) => {
      const hasVulnDoc = hasDoc(ev, "vulnerability management", "secure development", "security testing", "cve", "known vulnerability", "security review");
      const hasDependabot = hasGitSignal(ev, "hasDependabot");
      const hasCodeScanning = hasGitSignal(ev, "hasCodeScanning");
      const hasSecurityMd = hasGitSignal(ev, "hasSecurityMd");

      const techCount = [hasDependabot, hasCodeScanning, hasSecurityMd].filter(Boolean).length;
      const sources: string[] = [];
      if (hasVulnDoc) sources.push("vulnerability_management_policy");
      if (hasDependabot) sources.push("GitHub: Dependabot dependency scanning");
      if (hasCodeScanning) sources.push("GitHub: code scanning");
      if (hasSecurityMd) sources.push("GitHub: SECURITY.md");

      if (hasVulnDoc && techCount >= 2) {
        return { status: "PASS", confidence: 0.9, evidenceUsed: sources, gaps: [], remediations: [], lawyerQuestions: [], note: `CRA Annex I(1): vulnerability policy + ${techCount} automated scanning tools.` };
      }
      if (techCount >= 2) {
        return { status: "PARTIAL", confidence: 0.65, evidenceUsed: sources, gaps: ["Automated scanning in place but no formal vulnerability management policy"], remediations: ["Document your secure development and vulnerability management process"], lawyerQuestions: [], note: `${techCount} scanning tools active.` };
      }
      return { status: "NO_EVIDENCE", confidence: 0.2, evidenceUsed: [], gaps: ["No vulnerability scanning or management process found"], remediations: ["Enable Dependabot, code scanning, and document a process to ensure no known exploitable vulnerabilities at release"], lawyerQuestions: ["Does the CRA Annex I(1) obligation require us to perform penetration testing before each release?"], note: "CRA Annex I Part I(1) requires products to be delivered without known exploitable vulnerabilities." };
    },
  },
  {
    id: "CRA_AnnexI_2_secure_default",
    code: "CRA-AnnI(2)",
    title: "Secure-by-default configuration",
    frameworks: ["CYBER_RESILIENCE_ACT"],
    evidenceKeys: ["secure_default", "security_configuration"],
    articleRefs: { CYBER_RESILIENCE_ACT: "Annex I, Part I(2)" },
    check: (ev) => {
      const hasSecureDefaultDoc = hasDoc(ev, "secure by default", "security configuration", "hardening guide", "default configuration", "minimal permissions");
      const hasAuth = hasGitSignal(ev, "hasAuth");
      const hasEncryption = hasGitSignal(ev, "hasEncryption");
      const hasValidation = hasGitSignal(ev, "hasInputValidation");

      const techCount = [hasAuth, hasEncryption, hasValidation].filter(Boolean).length;
      const sources: string[] = [];
      if (hasSecureDefaultDoc) sources.push("secure_default_configuration");
      if (hasAuth) sources.push("GitHub: authentication required by default");
      if (hasEncryption) sources.push("GitHub: encryption enabled by default");
      if (hasValidation) sources.push("GitHub: input validation");

      return {
        status: hasSecureDefaultDoc && techCount >= 2 ? "PASS" : hasSecureDefaultDoc || techCount >= 2 ? "PARTIAL" : "NO_EVIDENCE",
        confidence: hasSecureDefaultDoc && techCount >= 2 ? 0.85 : techCount >= 2 ? 0.6 : 0.2,
        evidenceUsed: sources,
        gaps: [
          ...(!hasSecureDefaultDoc ? ["No secure-by-default configuration documentation found"] : []),
          ...(techCount < 2 ? ["Insufficient secure-by-default technical controls detected"] : []),
        ],
        remediations: ["Document secure-by-default settings: require authentication, enable encryption, apply least-privilege defaults, disable unnecessary features out of the box"],
        lawyerQuestions: ["Does CRA Annex I(2) require us to document and justify every default setting, or is a general secure configuration policy sufficient?"],
        note: "CRA Annex I Part I(2) requires products to be configured securely by default.",
      };
    },
  },
  {
    id: "CRA_AnnexI_3_access_control",
    code: "CRA-AnnI(3)",
    title: "Protection against unauthorised access",
    frameworks: ["CYBER_RESILIENCE_ACT"],
    evidenceKeys: ["access_control", "authentication"],
    articleRefs: { CYBER_RESILIENCE_ACT: "Annex I, Part I(3)" },
    check: (ev) => {
      const hasAccessDoc = hasDoc(ev, "access control", "authentication", "authorisation", "unauthorized access", "identity management");
      const hasAuth = hasGitSignal(ev, "hasAuth");
      const hasEncryption = hasGitSignal(ev, "hasEncryption");

      const sources: string[] = [];
      if (hasAccessDoc) sources.push("access_control_documentation");
      if (hasAuth) sources.push("GitHub: authentication implementation");
      if (hasEncryption) sources.push("GitHub: data protection");

      return {
        status: hasAccessDoc && hasAuth ? "PASS" : hasAuth ? "PARTIAL" : "NO_EVIDENCE",
        confidence: hasAccessDoc && hasAuth ? 0.9 : hasAuth ? 0.65 : 0.2,
        evidenceUsed: sources,
        gaps: [
          ...(!hasAccessDoc ? ["No access control documentation found"] : []),
          ...(!hasAuth ? ["No authentication implementation detected in codebase"] : []),
        ],
        remediations: ["Implement and document authentication, session management, and authorisation controls; prevent brute-force and credential stuffing attacks"],
        lawyerQuestions: ["Does CRA Annex I(3) require specific authentication standards (e.g., MFA by default) for our product category?"],
        note: "CRA Annex I Part I(3) requires protection against unauthorised access to the product and its data.",
      };
    },
  },
  {
    id: "CRA_AnnexI_4_data_protection",
    code: "CRA-AnnI(4)",
    title: "Data confidentiality and integrity protection",
    frameworks: ["CYBER_RESILIENCE_ACT"],
    evidenceKeys: ["data_confidentiality", "data_integrity", "encryption"],
    articleRefs: { CYBER_RESILIENCE_ACT: "Annex I, Part I(4)" },
    check: (ev) => {
      const hasDataDoc = hasDoc(ev, "data confidentiality", "data integrity", "encryption", "data protection", "data at rest", "data in transit");
      const hasEncryption = hasGitSignal(ev, "hasEncryption");
      const hasValidation = hasGitSignal(ev, "hasInputValidation");

      const sources: string[] = [];
      if (hasDataDoc) sources.push("data_protection_documentation");
      if (hasEncryption) sources.push("GitHub: encryption implementation");
      if (hasValidation) sources.push("GitHub: input validation/integrity checks");

      return {
        status: hasDataDoc && hasEncryption ? "PASS" : hasEncryption ? "PARTIAL" : "NO_EVIDENCE",
        confidence: hasDataDoc && hasEncryption ? 0.9 : hasEncryption ? 0.6 : 0.2,
        evidenceUsed: sources,
        gaps: [
          ...(!hasDataDoc ? ["No data confidentiality and integrity policy documented"] : []),
          ...(!hasEncryption ? ["No encryption of personal or sensitive data detected"] : []),
        ],
        remediations: ["Encrypt data at rest and in transit (TLS 1.2+, AES-256), implement integrity checks, and document your data protection approach"],
        lawyerQuestions: ["Does CRA Annex I(4) require us to minimise personal data processing, and how does this interact with GDPR data minimisation?"],
        note: "CRA Annex I Part I(4) requires protection of confidentiality and integrity of data stored or transmitted.",
      };
    },
  },
  {
    id: "CRA_AnnexI_6_security_updates",
    code: "CRA-AnnI(6)",
    title: "Security updates policy and lifecycle management",
    frameworks: ["CYBER_RESILIENCE_ACT"],
    evidenceKeys: ["security_updates", "patch_policy", "support_lifecycle"],
    articleRefs: { CYBER_RESILIENCE_ACT: "Annex I, Part I(6)" },
    check: (ev) => {
      const hasUpdateDoc = hasDoc(ev, "security update", "patch policy", "security patch", "software update", "support lifecycle", "end of support");
      const hasDependabot = hasGitSignal(ev, "hasDependabot");
      const hasCI = hasGitSignal(ev, "hasCI");

      const sources: string[] = [];
      if (hasUpdateDoc) sources.push("security_update_policy");
      if (hasDependabot) sources.push("GitHub: automated dependency updates");
      if (hasCI) sources.push("GitHub: CI/CD release pipeline");

      return {
        status: hasUpdateDoc ? "PASS" : hasDependabot && hasCI ? "PARTIAL" : "NO_EVIDENCE",
        confidence: hasUpdateDoc ? 0.9 : hasDependabot ? 0.55 : 0.2,
        evidenceUsed: sources,
        gaps: hasUpdateDoc ? [] : ["No security update policy or product support lifecycle defined"],
        remediations: ["Publish a security update policy defining: patch timelines by severity, support period (minimum 5 years under CRA), and end-of-life notification procedures"],
        lawyerQuestions: ["Does the CRA require us to support the product with security updates for a defined minimum period, and what is that period for our product category?"],
        note: hasUpdateDoc ? "Security update policy found." : "CRA Annex I Part I(6) requires security updates to be provided without delay and a defined support lifecycle.",
      };
    },
  },
  {
    id: "CRA_AnnexI_II_1_vulnerability_identification",
    code: "CRA-AnnI-II(1)",
    title: "Vulnerability identification and remediation process",
    frameworks: ["CYBER_RESILIENCE_ACT"],
    evidenceKeys: ["vulnerability_identification", "cvd_policy"],
    articleRefs: { CYBER_RESILIENCE_ACT: "Annex I, Part II(1)" },
    check: (ev) => {
      const hasVulnProcess = hasDoc(ev, "vulnerability identification", "security testing", "vulnerability assessment", "cve process", "security review process");
      const hasDependabot = hasGitSignal(ev, "hasDependabot");
      const hasCodeScanning = hasGitSignal(ev, "hasCodeScanning");

      const sources: string[] = [];
      if (hasVulnProcess) sources.push("vulnerability_identification_process");
      if (hasDependabot) sources.push("GitHub: Dependabot");
      if (hasCodeScanning) sources.push("GitHub: code scanning");

      const techCount = [hasDependabot, hasCodeScanning].filter(Boolean).length;

      return {
        status: hasVulnProcess && techCount >= 1 ? "PASS" : hasVulnProcess || techCount >= 1 ? "PARTIAL" : "NO_EVIDENCE",
        confidence: hasVulnProcess && techCount >= 1 ? 0.85 : techCount >= 1 ? 0.55 : 0.2,
        evidenceUsed: sources,
        gaps: [
          ...(!hasVulnProcess ? ["No vulnerability identification process documented"] : []),
          ...(techCount === 0 ? ["No automated vulnerability scanning tools detected"] : []),
        ],
        remediations: ["Implement automated scanning (Dependabot, SAST), document a process to triage, track, and remediate identified vulnerabilities with defined timelines"],
        lawyerQuestions: ["Does CRA Annex I Part II(1) require us to maintain a Software Bill of Materials (SBOM) for each product?"],
        note: "CRA Annex I Part II(1) requires manufacturers to identify and document vulnerabilities in their products.",
      };
    },
  },
  {
    id: "CRA_AnnexI_II_5_cvd",
    code: "CRA-AnnI-II(5)",
    title: "Coordinated vulnerability disclosure policy",
    frameworks: ["CYBER_RESILIENCE_ACT"],
    evidenceKeys: ["vulnerability_disclosure", "cvd", "security_contact"],
    articleRefs: { CYBER_RESILIENCE_ACT: "Annex I, Part II(5)" },
    check: (ev) => {
      const hasCVDDoc = hasDoc(ev, "vulnerability disclosure", "coordinated disclosure", "responsible disclosure", "security contact", "bug bounty", "security reporting");
      const hasSecurityMd = hasGitSignal(ev, "hasSecurityMd");

      const sources: string[] = [];
      if (hasCVDDoc) sources.push("coordinated_vulnerability_disclosure_policy");
      if (hasSecurityMd) sources.push("GitHub: SECURITY.md (vulnerability reporting instructions)");

      return {
        status: hasCVDDoc || hasSecurityMd ? "PASS" : "FAIL",
        confidence: hasCVDDoc ? 0.9 : hasSecurityMd ? 0.8 : 0.9,
        evidenceUsed: sources,
        gaps: (hasCVDDoc || hasSecurityMd) ? [] : ["No coordinated vulnerability disclosure policy published — CRA mandates this"],
        remediations: ["Publish a SECURITY.md and a CVD policy specifying how to report vulnerabilities, expected timelines, and your security contact channel"],
        lawyerQuestions: ["Does the CRA require us to register our CVD policy with ENISA, and what are the reporting obligations for actively exploited vulnerabilities under Art. 14?"],
        note: (hasCVDDoc || hasSecurityMd) ? "CVD policy found." : "CRA Annex I Part II(5) mandates a coordinated vulnerability disclosure policy — this is required.",
      };
    },
  },
  {
    id: "CRA_Art14_reporting",
    code: "CRA-Art14",
    title: "Reporting of actively exploited vulnerabilities and incidents",
    frameworks: ["CYBER_RESILIENCE_ACT"],
    evidenceKeys: ["exploit_reporting", "enisa_reporting"],
    articleRefs: { CYBER_RESILIENCE_ACT: "Art. 14" },
    check: (ev) => {
      const hasReportingDoc = hasDoc(ev, "actively exploited", "enisa", "vulnerability reporting obligation", "cra reporting", "incident notification manufacturer");
      const hasIRDoc = hasDoc(ev, "incident response", "security incident");

      const sources: string[] = [];
      if (hasReportingDoc) sources.push("exploit_reporting_procedure");
      if (hasIRDoc) sources.push("incident_response_plan");

      return {
        status: hasReportingDoc ? "PASS" : hasIRDoc ? "PARTIAL" : "NO_EVIDENCE",
        confidence: hasReportingDoc ? 0.9 : hasIRDoc ? 0.45 : 0.2,
        evidenceUsed: sources,
        gaps: hasReportingDoc ? [] : ["No CRA Art. 14 reporting procedure to ENISA documented"],
        remediations: ["Document the CRA reporting process: notify ENISA within 24h of becoming aware of an actively exploited vulnerability or severe security incident"],
        lawyerQuestions: ["How do we determine if a vulnerability is 'actively exploited', and what constitutes a 'severe incident' under CRA Art. 14?"],
        note: hasReportingDoc ? "Reporting procedure found." : "CRA Art. 14 requires notification to ENISA within 24h of discovering an actively exploited vulnerability.",
      };
    },
  },
];
