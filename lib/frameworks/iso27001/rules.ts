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

export const iso27001Rules: ControlRule[] = [
  {
    id: "ISO_A5_1_policy",
    code: "ISO-A.5.1",
    title: "Information security policies defined and approved",
    frameworks: ["ISO_27001"],
    evidenceKeys: ["information_security_policy", "isms_policy"],
    articleRefs: { ISO_27001: "A.5.1" },
    check: (ev) => {
      const hasPolicy = hasDoc(ev, "information security policy", "isms", "security policy", "infosec policy");
      const notionHasSecPolicy = hasNotionSignal(ev, "hasSecurityPolicy");

      const sources: string[] = [];
      if (hasPolicy) sources.push("information_security_policy");
      if (notionHasSecPolicy) sources.push("Notion: security policy");

      return {
        status: hasPolicy || notionHasSecPolicy ? "PASS" : "NO_EVIDENCE",
        confidence: hasPolicy ? 0.9 : notionHasSecPolicy ? 0.75 : 0.2,
        evidenceUsed: sources,
        gaps: (hasPolicy || notionHasSecPolicy) ? [] : ["No information security policy found"],
        remediations: ["Create a top-level Information Security Policy approved by management, covering security objectives, scope, and roles"],
        lawyerQuestions: ["Does our ISMS policy need to reference all ISO 27001:2022 Annex A controls, or only those in scope per our Statement of Applicability?"],
        note: (hasPolicy || notionHasSecPolicy) ? "Information security policy found." : "A.5.1 requires a management-approved information security policy.",
      };
    },
  },
  {
    id: "ISO_A6_1_roles",
    code: "ISO-A.6.1",
    title: "Information security roles and responsibilities defined",
    frameworks: ["ISO_27001"],
    evidenceKeys: ["roles_responsibilities", "isms_roles"],
    articleRefs: { ISO_27001: "A.6.1" },
    check: (ev) => {
      const hasRolesDoc = hasDoc(ev, "roles and responsibilities", "information security officer", "isms roles", "security responsibilities", "ciso", "data protection officer");
      const hasGWSAdmins = hasGWSSignal(ev, "adminUsers");
      const hasOrgUnits = hasGWSSignal(ev, "orgUnitsCount");

      const sources: string[] = [];
      if (hasRolesDoc) sources.push("roles_responsibilities_doc");
      if (hasGWSAdmins) sources.push("Google Workspace: admin roles configured");

      return {
        status: hasRolesDoc ? "PASS" : hasGWSAdmins || hasOrgUnits ? "PARTIAL" : "NO_EVIDENCE",
        confidence: hasRolesDoc ? 0.85 : hasGWSAdmins ? 0.5 : 0.2,
        evidenceUsed: sources,
        gaps: hasRolesDoc ? [] : ["No documented information security roles and responsibilities"],
        remediations: ["Define and document ISMS roles: CISO/security owner, risk owner, asset owners, and their responsibilities"],
        lawyerQuestions: ["Must we appoint a formal CISO or is a documented security responsibility sufficient for ISO 27001 certification?"],
        note: hasRolesDoc ? "Roles and responsibilities documented." : "A.6.1 requires clearly defined information security roles.",
      };
    },
  },
  {
    id: "ISO_A8_2_privileged_access",
    code: "ISO-A.8.2",
    title: "Privileged access rights restricted and managed",
    frameworks: ["ISO_27001"],
    evidenceKeys: ["privileged_access", "admin_access"],
    articleRefs: { ISO_27001: "A.8.2" },
    check: (ev) => {
      // TIGHTENED: Require BOTH policy AND code signals (not just one or the other)
      const hasPrivAccessDoc = hasDoc(ev, "privileged access", "admin access", "superuser", "root access", "privileged account", "least privilege", "privilege review");
      const hasAuth = hasGitSignal(ev, "hasAuth");
      const has2FA = hasGWSSignal(ev, "has2FAEnforced");
      const hasLoginMonitoring = hasGWSSignal(ev, "hasLoginMonitoring");

      const sources: string[] = [];
      if (hasPrivAccessDoc) sources.push("privileged_access_policy");
      if (hasAuth) sources.push("GitHub: authentication controls");
      if (has2FA) sources.push("Google Workspace: 2FA enforced");
      if (hasLoginMonitoring) sources.push("Google Workspace: login monitoring");

      const techCount = [hasAuth, has2FA, hasLoginMonitoring].filter(Boolean).length;

      if (hasPrivAccessDoc && techCount >= 1) {
        return {
          status: "PASS",
          confidence: 0.9,
          evidenceUsed: sources,
          gaps: [],
          remediations: [],
          lawyerQuestions: [],
          note: `A.8.2: Privileged access policy + ${techCount} technical control(s) implemented.`,
        };
      }

      if (hasPrivAccessDoc && techCount === 0) {
        return {
          status: "PARTIAL",
          confidence: 0.6,
          evidenceUsed: sources,
          gaps: ["Privileged access policy documented but no MFA/monitoring technical controls detected"],
          remediations: ["Implement technical controls: enforce MFA for admin accounts, enable login monitoring, and use authentication middleware"],
          lawyerQuestions: [],
          note: "Policy exists but lacks technical enforcement for A.8.2 requirements.",
        };
      }

      if (techCount >= 2) {
        return {
          status: "PARTIAL",
          confidence: 0.65,
          evidenceUsed: sources,
          gaps: ["Technical privileged access controls detected but no formal policy documentation"],
          remediations: ["Document privileged access management policy: admin account provisioning, MFA requirements, access review frequency, and least-privilege principles"],
          lawyerQuestions: [],
          note: "Technical controls present but policy documentation missing.",
        };
      }

      return {
        status: "NO_EVIDENCE",
        confidence: 0.2,
        evidenceUsed: [],
        gaps: ["No privileged access management policy or technical controls found"],
        remediations: ["Implement: privileged account policy, MFA enforcement for admins, login monitoring, least-privilege access provisioning, and periodic access reviews"],
        lawyerQuestions: ["How frequently must privileged access be reviewed under A.8.2 to maintain ISO 27001 certification?"],
        note: "A.8.2 requires allocation and use of privileged access rights to be restricted and controlled.",
      };
    },
  },
  {
    id: "ISO_A8_7_malware",
    code: "ISO-A.8.7",
    title: "Protection against malware implemented",
    frameworks: ["ISO_27001"],
    evidenceKeys: ["malware_protection", "antivirus", "endpoint_security"],
    articleRefs: { ISO_27001: "A.8.7" },
    check: (ev) => {
      const hasMalwareDoc = hasDoc(ev, "malware", "antivirus", "anti-malware", "endpoint protection", "edr", "endpoint security");
      const hasDependabot = hasGitSignal(ev, "hasDependabot");
      const hasCodeScanning = hasGitSignal(ev, "hasCodeScanning");
      const hasInputValidation = hasGitSignal(ev, "hasInputValidation");

      const sources: string[] = [];
      if (hasMalwareDoc) sources.push("malware_protection_policy");
      if (hasDependabot) sources.push("GitHub: Dependabot vulnerability scanning");
      if (hasCodeScanning) sources.push("GitHub: code scanning");
      if (hasInputValidation) sources.push("GitHub: input validation");

      const techCount = [hasDependabot, hasCodeScanning, hasInputValidation].filter(Boolean).length;

      return {
        status: hasMalwareDoc && techCount >= 1 ? "PASS" : hasMalwareDoc || techCount >= 2 ? "PARTIAL" : "NO_EVIDENCE",
        confidence: hasMalwareDoc && techCount >= 1 ? 0.85 : techCount >= 1 ? 0.55 : 0.2,
        evidenceUsed: sources,
        gaps: [
          ...(!hasMalwareDoc ? ["No malware protection policy documented"] : []),
          ...(techCount === 0 ? ["No automated vulnerability or malware scanning detected"] : []),
        ],
        remediations: ["Document malware protection policy, enable Dependabot/code scanning, and enforce endpoint protection on all company devices"],
        lawyerQuestions: ["Does our Dependabot + code scanning setup satisfy A.8.7 for a software product, or do we need endpoint AV on developer machines too?"],
        note: "A.8.7 requires protection against malware to be implemented.",
      };
    },
  },
  {
    id: "ISO_A8_12_data_leakage",
    code: "ISO-A.8.12",
    title: "Data leakage prevention measures in place",
    frameworks: ["ISO_27001"],
    evidenceKeys: ["data_leakage", "dlp", "data_classification"],
    articleRefs: { ISO_27001: "A.8.12" },
    check: (ev) => {
      const hasDLPDoc = hasDoc(ev, "data leakage", "dlp", "data loss prevention", "data classification", "information classification");
      const hasEncryption = hasGitSignal(ev, "hasEncryption");
      const hasLogging = hasGitSignal(ev, "hasLogging");

      const sources: string[] = [];
      if (hasDLPDoc) sources.push("dlp_policy");
      if (hasEncryption) sources.push("GitHub: encryption implementation");
      if (hasLogging) sources.push("GitHub: audit logging");

      return {
        status: hasDLPDoc && hasEncryption ? "PASS" : hasDLPDoc || hasEncryption ? "PARTIAL" : "NO_EVIDENCE",
        confidence: hasDLPDoc && hasEncryption ? 0.85 : hasEncryption ? 0.55 : 0.2,
        evidenceUsed: sources,
        gaps: [
          ...(!hasDLPDoc ? ["No data leakage prevention policy or data classification scheme found"] : []),
          ...(!hasEncryption ? ["No encryption of sensitive data detected in codebase"] : []),
        ],
        remediations: ["Implement data classification, encrypt sensitive data at rest and in transit, and document your DLP controls"],
        lawyerQuestions: ["What data classification tiers should we apply given our data types, and does encryption-at-rest satisfy A.8.12?"],
        note: "A.8.12 requires measures to prevent unauthorised disclosure of information.",
      };
    },
  },
  {
    id: "ISO_A8_32_change_management",
    code: "ISO-A.8.32",
    title: "Change management procedures implemented",
    frameworks: ["ISO_27001"],
    evidenceKeys: ["change_management", "change_control"],
    articleRefs: { ISO_27001: "A.8.32" },
    check: (ev) => {
      // TIGHTENED: Require BOTH policy AND CI/CD implementation (not policy alone)
      const hasChangeDoc = hasDoc(ev, "change management", "change control", "change request", "release management", "deployment procedure", "code review");
      const hasBranchProtection = hasGitSignal(ev, "hasBranchProtection");
      const hasCI = hasGitSignal(ev, "hasCI");
      const hasTests = hasGitSignal(ev, "hasTests");

      const codeCount = [hasBranchProtection, hasCI, hasTests].filter(Boolean).length;
      const sources: string[] = [];
      if (hasChangeDoc) sources.push("change_management_procedure");
      if (hasBranchProtection) sources.push("GitHub: branch protection rules");
      if (hasCI) sources.push("GitHub: CI/CD pipeline");
      if (hasTests) sources.push("GitHub: automated tests");

      if (hasChangeDoc && codeCount >= 2) {
        return {
          status: "PASS",
          confidence: 0.95,
          evidenceUsed: sources,
          gaps: [],
          remediations: [],
          lawyerQuestions: [],
          note: `A.8.32: Change management policy + ${codeCount} technical controls (CI/CD, testing).`,
        };
      }

      if (hasChangeDoc && codeCount === 1) {
        return {
          status: "PARTIAL",
          confidence: 0.7,
          evidenceUsed: sources,
          gaps: ["Change management policy documented but incomplete technical implementation (need CI/CD + tests)"],
          remediations: ["Implement both CI/CD pipeline AND automated testing, and reference in your change management procedure"],
          lawyerQuestions: [],
          note: "Policy exists but CI/CD automation limited.",
        };
      }

      if (codeCount >= 2) {
        return {
          status: "PARTIAL",
          confidence: 0.7,
          evidenceUsed: sources,
          gaps: ["Technical change controls (CI/CD, tests) found but no formal documented change management procedure"],
          remediations: ["Document a formal change management procedure explicitly referencing: branch protection, code review, CI/CD testing, and approval workflow"],
          lawyerQuestions: [],
          note: `${codeCount} technical controls present. Formal procedure documentation required.`,
        };
      }

      if (hasChangeDoc) {
        return {
          status: "PARTIAL",
          confidence: 0.5,
          evidenceUsed: sources,
          gaps: ["Change management procedure documented but no CI/CD/testing automation detected"],
          remediations: ["Implement technical change controls: branch protection rules, CI/CD pipeline, and automated testing"],
          lawyerQuestions: [],
          note: "Policy exists but lacks automated enforcement.",
        };
      }

      return {
        status: "NO_EVIDENCE",
        confidence: 0.2,
        evidenceUsed: [],
        gaps: ["No change management controls documented or detected"],
        remediations: ["Implement and document change management: (1) formal change procedure, (2) branch protection, (3) CI/CD pipeline, (4) automated testing"],
        lawyerQuestions: ["What change management evidence does an ISO 27001 auditor typically require for A.8.32?"],
        note: "A.8.32 requires changes to be managed through formal change management procedures and technical controls.",
      };
    },
  },
  {
    id: "ISO_A8_8_vulnerability_management",
    code: "ISO-A.8.8",
    title: "Management of technical vulnerabilities",
    frameworks: ["ISO_27001"],
    evidenceKeys: ["vulnerability_management", "patch_management"],
    articleRefs: { ISO_27001: "A.8.8" },
    check: (ev) => {
      const hasVulnDoc = hasDoc(ev, "vulnerability management", "patch management", "cve", "vulnerability scanning", "penetration test");
      const hasDependabot = hasGitSignal(ev, "hasDependabot");
      const hasCodeScanning = hasGitSignal(ev, "hasCodeScanning");
      const hasSecurityMd = hasGitSignal(ev, "hasSecurityMd");

      const techCount = [hasDependabot, hasCodeScanning, hasSecurityMd].filter(Boolean).length;
      const sources: string[] = [];
      if (hasVulnDoc) sources.push("vulnerability_management_policy");
      if (hasDependabot) sources.push("GitHub: Dependabot");
      if (hasCodeScanning) sources.push("GitHub: code scanning");
      if (hasSecurityMd) sources.push("GitHub: SECURITY.md (vulnerability disclosure)");

      return {
        status: hasVulnDoc && techCount >= 1 ? "PASS" : hasVulnDoc || techCount >= 2 ? "PARTIAL" : "NO_EVIDENCE",
        confidence: hasVulnDoc && techCount >= 1 ? 0.9 : techCount >= 2 ? 0.65 : techCount >= 1 ? 0.5 : 0.2,
        evidenceUsed: sources,
        gaps: [
          ...(!hasVulnDoc ? ["No vulnerability management procedure documented"] : []),
          ...(techCount === 0 ? ["No automated vulnerability scanning detected"] : []),
        ],
        remediations: ["Enable Dependabot and code scanning, publish a SECURITY.md, document patch SLAs (e.g. critical: 24h, high: 7 days)"],
        lawyerQuestions: ["What patch timelines are expected for ISO 27001 A.8.8, and how do we handle third-party libraries with no available patch?"],
        note: "A.8.8 requires timely identification and remediation of technical vulnerabilities.",
      };
    },
  },
  {
    id: "ISO_A5_26_incident_response",
    code: "ISO-A.5.26",
    title: "Response to information security incidents",
    frameworks: ["ISO_27001"],
    evidenceKeys: ["incident_response", "security_incident_procedure"],
    articleRefs: { ISO_27001: "A.5.26" },
    check: (ev) => {
      const hasIRDoc = hasDoc(ev, "incident response", "security incident", "incident management", "breach response");
      const hasSecurityMd = hasGitSignal(ev, "hasSecurityMd");
      const hasIncidentChannel = hasSlackSignal(ev, "hasIncidentChannel");
      const notionHasIR = hasNotionSignal(ev, "hasIncidentResponse");

      const hasEvidence = hasIRDoc || hasSecurityMd || hasIncidentChannel || notionHasIR;
      const sources: string[] = [];
      if (hasIRDoc) sources.push("incident_response_plan");
      if (hasSecurityMd) sources.push("GitHub: SECURITY.md");
      if (hasIncidentChannel) sources.push("Slack: #incident channel");
      if (notionHasIR) sources.push("Notion: incident response plan");

      return {
        status: (hasIRDoc || notionHasIR) ? "PASS" : hasEvidence ? "PARTIAL" : "NO_EVIDENCE",
        confidence: (hasIRDoc || notionHasIR) ? 0.85 : hasEvidence ? 0.55 : 0.2,
        evidenceUsed: sources,
        gaps: (hasIRDoc || notionHasIR) ? [] : ["No formal incident response plan found"],
        remediations: ["Create an incident response plan covering: detection, triage, containment, eradication, recovery, and lessons learned"],
        lawyerQuestions: ["Does A.5.26 require us to maintain incident response metrics, and if so, what KPIs are expected?"],
        note: hasEvidence ? `IR evidence found from ${sources.length} source(s).` : "A.5.26 requires a documented response to information security incidents.",
      };
    },
  },
  {
    id: "ISO_A5_23_cloud_security",
    code: "ISO-A.5.23",
    title: "Information security for use of cloud services",
    frameworks: ["ISO_27001"],
    evidenceKeys: ["cloud_security", "cloud_policy"],
    articleRefs: { ISO_27001: "A.5.23" },
    check: (ev) => {
      const hasCloudDoc = hasDoc(ev, "cloud security", "cloud policy", "cloud provider", "aws", "gcp", "azure", "saas security");
      const hasEncryption = hasGitSignal(ev, "hasEncryption");
      const hasAuth = hasGitSignal(ev, "hasAuth");
      const usesCloud = ev.onboarding.usesAI || ev.onboarding.dataCategories.length > 0;

      const sources: string[] = [];
      if (hasCloudDoc) sources.push("cloud_security_policy");
      if (hasEncryption) sources.push("GitHub: encryption");
      if (hasAuth) sources.push("GitHub: authentication");

      return {
        status: hasCloudDoc ? "PASS" : !usesCloud ? "PASS" : hasEncryption && hasAuth ? "PARTIAL" : "NO_EVIDENCE",
        confidence: hasCloudDoc ? 0.85 : !usesCloud ? 0.9 : hasEncryption ? 0.5 : 0.2,
        evidenceUsed: sources,
        gaps: hasCloudDoc ? [] : usesCloud ? ["No cloud security policy documented"] : [],
        remediations: ["Document cloud service usage, security requirements for each provider, and shared-responsibility model understanding"],
        lawyerQuestions: ["Under A.5.23, are we required to obtain SOC 2 or ISO 27001 reports from all our cloud providers?"],
        note: hasCloudDoc ? "Cloud security policy found." : "A.5.23 requires security measures for cloud services to be agreed and managed.",
      };
    },
  },
];
