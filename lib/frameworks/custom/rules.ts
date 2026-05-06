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

function hasNotionSignal(ev: EvidencePool, key: string): boolean {
  const notion = ev.codeSignals?.notion as Record<string, unknown> | undefined;
  if (!notion) return false;
  return !!notion[key];
}

export const customRules: ControlRule[] = [
  {
    id: "CUSTOM_001_security_policy",
    code: "CUSTOM-SEC-001",
    title: "Information security policy in place",
    frameworks: ["CUSTOM"],
    evidenceKeys: ["security_policy", "information_security"],
    articleRefs: { CUSTOM: "Security Baseline" },
    check: (ev) => {
      const hasPolicy = hasDoc(ev, "security policy", "information security", "isms", "cybersecurity policy");
      const notionHasSec = hasNotionSignal(ev, "hasSecurityPolicy");
      const hasAuth = hasGitSignal(ev, "hasAuth");
      const hasEncryption = hasGitSignal(ev, "hasEncryption");

      const sources: string[] = [];
      if (hasPolicy) sources.push("security_policy");
      if (notionHasSec) sources.push("Notion: security policy");
      if (hasAuth) sources.push("GitHub: authentication");
      if (hasEncryption) sources.push("GitHub: encryption");

      const hasAnyPolicy = hasPolicy || notionHasSec;
      const hasTech = hasAuth || hasEncryption;

      return {
        status: hasAnyPolicy && hasTech ? "PASS" : hasAnyPolicy || hasTech ? "PARTIAL" : "NO_EVIDENCE",
        confidence: hasAnyPolicy && hasTech ? 0.85 : hasAnyPolicy || hasTech ? 0.55 : 0.2,
        evidenceUsed: sources,
        gaps: [
          ...(!hasAnyPolicy ? ["No information security policy documented"] : []),
          ...(!hasTech ? ["No basic security controls (auth, encryption) detected"] : []),
        ],
        remediations: ["Document an information security policy and implement authentication, encryption, and access controls"],
        lawyerQuestions: [],
        note: "A baseline security policy with supporting technical controls is a foundational requirement.",
      };
    },
  },
  {
    id: "CUSTOM_002_incident_response",
    code: "CUSTOM-IR-001",
    title: "Incident response procedure",
    frameworks: ["CUSTOM"],
    evidenceKeys: ["incident_response", "security_incident"],
    articleRefs: { CUSTOM: "Incident Management" },
    check: (ev) => {
      const hasIRDoc = hasDoc(ev, "incident response", "security incident", "breach response", "incident handling");
      const hasSecurityMd = hasGitSignal(ev, "hasSecurityMd");
      const notionHasIR = hasNotionSignal(ev, "hasIncidentResponse");
      const hasAuth = hasGitSignal(ev, "hasAuth");

      const sources: string[] = [];
      if (hasIRDoc) sources.push("incident_response_plan");
      if (hasSecurityMd) sources.push("GitHub: SECURITY.md");
      if (notionHasIR) sources.push("Notion: incident response plan");
      if (hasAuth) sources.push("GitHub: authentication (access control)");

      const hasPolicy = hasIRDoc || notionHasIR;
      const hasCodeSignal = hasSecurityMd || hasAuth;

      return {
        status: hasPolicy && hasCodeSignal ? "PASS" : hasPolicy || hasCodeSignal ? "PARTIAL" : "NO_EVIDENCE",
        confidence: hasPolicy && hasCodeSignal ? 0.85 : (hasPolicy || hasCodeSignal) ? 0.55 : 0.2,
        evidenceUsed: sources,
        gaps: hasPolicy || hasCodeSignal ? (hasPolicy ? [] : ["Policy documented but no code-level enforcement found"]) : ["No incident response procedure found"],
        remediations: ["Create a documented incident response procedure AND implement code-level enforcement (e.g., SECURITY.md, access controls, audit logging)"],
        lawyerQuestions: [],
        note: hasPolicy && hasCodeSignal ? "IR policy with code-level enforcement verified." : hasPolicy || hasCodeSignal ? "Partial IR evidence found." : "An incident response procedure is a fundamental security requirement.",
      };
    },
  },
  {
    id: "CUSTOM_003_access_control",
    code: "CUSTOM-AC-001",
    title: "Access control and authentication",
    frameworks: ["CUSTOM"],
    evidenceKeys: ["access_control", "authentication"],
    articleRefs: { CUSTOM: "Access Control" },
    check: (ev) => {
      const hasAccessDoc = hasDoc(ev, "access control", "authentication", "authorisation", "password policy", "mfa");
      const hasAuth = hasGitSignal(ev, "hasAuth");
      const has2FA = !!(ev.codeSignals?.googleWorkspace as Record<string, unknown> | undefined)?.["has2FAEnforced"];

      const sources: string[] = [];
      if (hasAccessDoc) sources.push("access_control_policy");
      if (hasAuth) sources.push("GitHub: authentication");
      if (has2FA) sources.push("Google Workspace: 2FA");

      return {
        status: hasAccessDoc && hasAuth ? "PASS" : hasAuth ? "PARTIAL" : "NO_EVIDENCE",
        confidence: hasAccessDoc && hasAuth ? 0.9 : hasAuth ? 0.65 : 0.2,
        evidenceUsed: sources,
        gaps: [
          ...(!hasAccessDoc ? ["No access control policy documented"] : []),
          ...(!hasAuth ? ["No authentication controls detected"] : []),
        ],
        remediations: ["Implement and document access control procedures: authentication, MFA, role-based access, and regular access reviews"],
        lawyerQuestions: [],
        note: "Access control is a universal security baseline requirement.",
      };
    },
  },
  {
    id: "CUSTOM_004_data_protection",
    code: "CUSTOM-DP-001",
    title: "Data protection and privacy",
    frameworks: ["CUSTOM"],
    evidenceKeys: ["data_protection", "privacy_policy"],
    articleRefs: { CUSTOM: "Data Protection" },
    check: (ev) => {
      const hasPrivacyDoc = hasDoc(ev, "privacy policy", "data protection", "personal data", "gdpr", "data handling");
      const hasEncryption = hasGitSignal(ev, "hasEncryption");
      const gh = ev.codeSignals?.github as Record<string, unknown> | undefined;
      const hasRepoPrivacy = !!gh?.hasPrivacyPolicy;
      const notionHasPrivacy = hasNotionSignal(ev, "hasPrivacyPolicy");

      const anyPrivacy = hasPrivacyDoc || hasRepoPrivacy || notionHasPrivacy;
      const sources: string[] = [];
      if (hasPrivacyDoc) sources.push("privacy_policy");
      if (hasRepoPrivacy) sources.push("GitHub: privacy policy");
      if (notionHasPrivacy) sources.push("Notion: privacy policy");
      if (hasEncryption) sources.push("GitHub: data encryption");

      return {
        status: anyPrivacy && hasEncryption ? "PASS" : anyPrivacy || hasEncryption ? "PARTIAL" : "NO_EVIDENCE",
        confidence: anyPrivacy && hasEncryption ? 0.85 : anyPrivacy || hasEncryption ? 0.55 : 0.2,
        evidenceUsed: sources,
        gaps: [
          ...(!anyPrivacy ? ["No data protection or privacy policy found"] : []),
          ...(!hasEncryption ? ["No data encryption detected"] : []),
        ],
        remediations: ["Publish a privacy policy and implement data encryption for sensitive data"],
        lawyerQuestions: [],
        note: anyPrivacy ? "Data protection documentation found." : "Data protection is a baseline requirement for any product handling user data.",
      };
    },
  },
  {
    id: "CUSTOM_005_change_management",
    code: "CUSTOM-CM-001",
    title: "Change management and release control",
    frameworks: ["CUSTOM"],
    evidenceKeys: ["change_management", "release_process"],
    articleRefs: { CUSTOM: "Change Management" },
    check: (ev) => {
      const hasChangeDoc = hasDoc(ev, "change management", "release process", "deployment procedure", "code review", "change control");
      const hasBranchProt = hasGitSignal(ev, "hasBranchProtection");
      const hasCI = hasGitSignal(ev, "hasCI");
      const hasTests = hasGitSignal(ev, "hasTests");

      const techCount = [hasBranchProt, hasCI, hasTests].filter(Boolean).length;
      const sources: string[] = [];
      if (hasChangeDoc) sources.push("change_management_procedure");
      if (hasBranchProt) sources.push("GitHub: branch protection");
      if (hasCI) sources.push("GitHub: CI/CD pipeline");
      if (hasTests) sources.push("GitHub: automated tests");

      return {
        status: hasChangeDoc && techCount >= 2 ? "PASS" : (hasChangeDoc && techCount >= 1) || (techCount >= 2) ? "PARTIAL" : "NO_EVIDENCE",
        confidence: hasChangeDoc && techCount >= 2 ? 0.9 : (hasChangeDoc || techCount >= 2) ? 0.65 : techCount >= 1 ? 0.4 : 0.2,
        evidenceUsed: sources,
        gaps: hasChangeDoc && techCount >= 2 ? [] : [
          ...(!hasChangeDoc && techCount > 0 ? ["Technical controls present but change management procedure not documented"] : []),
          ...(hasChangeDoc && techCount < 2 ? [` Documentation exists but only ${techCount}/2 minimum technical controls (branch protection + CI/CD) detected`] : []),
          ...(!hasChangeDoc && techCount === 0 ? ["No change management controls found"] : [])
        ],
        remediations: ["Establish formal change management: document release procedures AND implement code review, branch protection, CI/CD pipeline, and automated tests"],
        lawyerQuestions: [],
        note: hasChangeDoc && techCount >= 2 ? `Change management: documented procedure + ${techCount} technical controls verified.` : `Partial evidence: documentation=${!!hasChangeDoc}, technical controls=${techCount}/2.`,
      };
    },
  },
];
