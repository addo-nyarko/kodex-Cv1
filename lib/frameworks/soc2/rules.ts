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

export const soc2Rules: ControlRule[] = [
  {
    id: "SOC2_CC6_1_logical_access",
    code: "SOC2-CC6.1",
    title: "Logical access security measures implemented",
    frameworks: ["SOC2"],
    evidenceKeys: ["access_control", "authentication", "authorization"],
    articleRefs: { SOC2: "CC6.1" },
    check: (ev) => {
      const hasAccessDoc = hasDoc(ev, "access control", "authentication", "authorization", "role-based access", "rbac", "mfa", "multi-factor");
      const hasAuth = hasGitSignal(ev, "hasAuth");
      const hasEncryption = hasGitSignal(ev, "hasEncryption");
      const hasValidation = hasGitSignal(ev, "hasInputValidation");
      const has2FA = hasGWSSignal(ev, "has2FAEnforced");
      const hasLoginMonitoring = hasGWSSignal(ev, "hasLoginMonitoring");

      const codeCount = [hasAuth, hasEncryption, hasValidation, has2FA, hasLoginMonitoring].filter(Boolean).length;
      const sources: string[] = [];
      if (hasAccessDoc) sources.push("access_control_policy");
      if (hasAuth) sources.push("GitHub: authentication implementation");
      if (hasEncryption) sources.push("GitHub: encryption");
      if (has2FA) sources.push("Google Workspace: 2FA enforced");
      if (hasLoginMonitoring) sources.push("Google Workspace: login monitoring");

      if (hasAccessDoc && codeCount >= 2) {
        return { status: "PASS", confidence: 0.9, evidenceUsed: sources, gaps: [], remediations: [], lawyerQuestions: [], note: `CC6.1 satisfied: access policy documented and ${codeCount} technical controls verified.` };
      }
      if (codeCount >= 2) {
        return { status: "PARTIAL", confidence: 0.65, evidenceUsed: sources, gaps: ["Technical access controls found but no formal access control policy document"], remediations: ["Document your access control policy covering authentication, authorisation, and MFA requirements"], lawyerQuestions: ["Does our access control policy satisfy the SOC 2 CC6.1 description criteria for logical access security software?"], note: `${codeCount} technical access controls detected — policy documentation needed.` };
      }
      return { status: codeCount > 0 ? "PARTIAL" : "NO_EVIDENCE", confidence: codeCount > 0 ? 0.4 : 0.15, evidenceUsed: sources, gaps: ["Insufficient logical access controls documented or detected"], remediations: ["Implement and document: MFA, role-based access control, password policies, and access provisioning/deprovisioning procedures"], lawyerQuestions: ["What authentication standards does our service auditor expect for CC6.1 given our system type?"], note: "CC6.1 requires logical access security measures protecting against unauthorised access." };
    },
  },
  {
    id: "SOC2_CC6_2_user_provisioning",
    code: "SOC2-CC6.2",
    title: "New user access provisioning process documented",
    frameworks: ["SOC2"],
    evidenceKeys: ["user_provisioning", "access_management"],
    articleRefs: { SOC2: "CC6.2" },
    check: (ev) => {
      const hasProvisioning = hasDoc(ev, "user provisioning", "onboarding", "access request", "new user", "user lifecycle", "joiner");
      const hasGWSUsers = hasGWSSignal(ev, "totalUsers");
      const hasOrgUnits = hasGWSSignal(ev, "orgUnitsCount");

      const sources: string[] = [];
      if (hasProvisioning) sources.push("user_provisioning_procedure");
      if (hasGWSUsers) sources.push("Google Workspace: user management detected");
      if (hasOrgUnits) sources.push("Google Workspace: organisational units configured");

      return {
        status: hasProvisioning ? "PASS" : hasGWSUsers ? "PARTIAL" : "NO_EVIDENCE",
        confidence: hasProvisioning ? 0.85 : hasGWSUsers ? 0.5 : 0.2,
        evidenceUsed: sources,
        gaps: hasProvisioning ? [] : ["No user access provisioning procedure documented"],
        remediations: hasProvisioning ? [] : ["Create a user access provisioning procedure covering: access request, approval, granting, periodic review, and revocation on offboarding"],
        lawyerQuestions: ["Does our provisioning process include formal approval workflows and timely deprovisioning for departing employees?"],
        note: hasProvisioning ? "User provisioning procedure found." : "CC6.2 requires a documented process for registering and deregistering users.",
      };
    },
  },
  {
    id: "SOC2_CC6_3_least_privilege",
    code: "SOC2-CC6.3",
    title: "Least privilege and role-based access enforced",
    frameworks: ["SOC2"],
    evidenceKeys: ["least_privilege", "rbac", "access_review"],
    articleRefs: { SOC2: "CC6.3" },
    check: (ev) => {
      const hasLeastPrivDoc = hasDoc(ev, "least privilege", "need to know", "role-based", "rbac", "access review", "privilege review");
      const hasAuth = hasGitSignal(ev, "hasAuth");
      const hasGWSAdmins = hasGWSSignal(ev, "adminUsers");

      const sources: string[] = [];
      if (hasLeastPrivDoc) sources.push("least_privilege_policy");
      if (hasAuth) sources.push("GitHub: role-based access in code");
      if (hasGWSAdmins) sources.push("Google Workspace: admin count tracked");

      return {
        status: hasLeastPrivDoc && hasAuth ? "PASS" : hasLeastPrivDoc || hasAuth ? "PARTIAL" : "NO_EVIDENCE",
        confidence: hasLeastPrivDoc && hasAuth ? 0.85 : hasLeastPrivDoc || hasAuth ? 0.55 : 0.2,
        evidenceUsed: sources,
        gaps: [
          ...(!hasLeastPrivDoc ? ["No least privilege / access review policy found"] : []),
          ...(!hasAuth ? ["No role-based access control detected in codebase"] : []),
        ],
        remediations: ["Implement RBAC with documented role definitions and periodic access reviews (minimum annually)", "Ensure privileged access is granted on need-to-know basis only"],
        lawyerQuestions: ["How frequently must we conduct access reviews to satisfy CC6.3, and is annual sufficient given our customer data sensitivity?"],
        note: "CC6.3 requires access restricted to authorised individuals based on their job responsibilities.",
      };
    },
  },
  {
    id: "SOC2_CC7_1_monitoring",
    code: "SOC2-CC7.1",
    title: "System monitoring and anomaly detection implemented",
    frameworks: ["SOC2"],
    evidenceKeys: ["monitoring", "logging", "alerting"],
    articleRefs: { SOC2: "CC7.1" },
    check: (ev) => {
      const hasMonitorDoc = hasDoc(ev, "monitoring", "logging", "alerting", "siem", "audit log", "observability");
      const hasLogging = hasGitSignal(ev, "hasLogging");
      const hasCI = hasGitSignal(ev, "hasCI");
      const hasLoginMonitoring = hasGWSSignal(ev, "hasLoginMonitoring");
      const hasSecurityEvents = hasGWSSignal(ev, "recentSecurityEvents");
      const hasSecurityChannel = hasSlackSignal(ev, "hasSecurityChannel");

      const signals = [hasLogging, hasCI, hasLoginMonitoring, hasSecurityChannel].filter(Boolean).length;
      const sources: string[] = [];
      if (hasMonitorDoc) sources.push("monitoring_policy");
      if (hasLogging) sources.push("GitHub: logging implementation");
      if (hasLoginMonitoring) sources.push("Google Workspace: login monitoring active");
      if (hasSecurityEvents) sources.push("Google Workspace: security event tracking");
      if (hasSecurityChannel) sources.push("Slack: security channel for alerts");

      if (hasMonitorDoc && signals >= 2) {
        return { status: "PASS", confidence: 0.9, evidenceUsed: sources, gaps: [], remediations: [], lawyerQuestions: [], note: `CC7.1 satisfied: monitoring policy + ${signals} technical monitoring signals.` };
      }
      if (signals >= 2 || hasMonitorDoc) {
        return { status: "PARTIAL", confidence: 0.6, evidenceUsed: sources, gaps: [!hasMonitorDoc ? "No monitoring policy documented" : "Limited monitoring implementation evidence"].filter(Boolean), remediations: ["Document your monitoring and alerting procedures", "Ensure logs capture security-relevant events with sufficient retention"], lawyerQuestions: ["What log retention period satisfies CC7.1 for our SOC 2 Type II audit period?"], note: `${signals} monitoring signals found.` };
      }
      return { status: "NO_EVIDENCE", confidence: 0.15, evidenceUsed: [], gaps: ["No monitoring, logging or anomaly detection evidence found"], remediations: ["Implement centralised logging, anomaly detection alerts, and document your monitoring procedures"], lawyerQuestions: [], note: "CC7.1 requires detection and monitoring of system components for anomalous activity." };
    },
  },
  {
    id: "SOC2_CC7_2_incident_response",
    code: "SOC2-CC7.2",
    title: "Security incident response procedures established",
    frameworks: ["SOC2"],
    evidenceKeys: ["incident_response", "security_incident"],
    articleRefs: { SOC2: "CC7.2" },
    check: (ev) => {
      const hasIRDoc = hasDoc(ev, "incident response", "security incident", "breach response", "incident management");
      const hasSecurityMd = hasGitSignal(ev, "hasSecurityMd");
      const hasIncidentChannel = hasSlackSignal(ev, "hasIncidentChannel");
      const hasActiveProcess = hasSlackSignal(ev, "hasActiveIncidentProcess");
      const notionHasIR = hasNotionSignal(ev, "hasIncidentResponse");

      const hasEvidence = hasIRDoc || hasSecurityMd || hasIncidentChannel || notionHasIR;
      const hasStrongEvidence = hasIRDoc || notionHasIR || (hasSecurityMd && hasIncidentChannel);
      const sources: string[] = [];
      if (hasIRDoc) sources.push("incident_response_plan");
      if (hasSecurityMd) sources.push("GitHub: SECURITY.md");
      if (hasIncidentChannel) sources.push("Slack: #incident channel");
      if (hasActiveProcess) sources.push("Slack: active incident process");
      if (notionHasIR) sources.push("Notion: incident response plan");

      return {
        status: hasStrongEvidence ? "PASS" : hasEvidence ? "PARTIAL" : "NO_EVIDENCE",
        confidence: hasStrongEvidence ? 0.85 : hasEvidence ? 0.55 : 0.2,
        evidenceUsed: sources,
        gaps: hasStrongEvidence ? [] : hasEvidence ? ["Partial IR evidence — a formal documented plan is needed"] : ["No incident response procedure found"],
        remediations: hasStrongEvidence ? [] : ["Create a formal IR plan covering: detection, classification, containment, eradication, recovery, and post-incident review"],
        lawyerQuestions: ["What notification obligations do we have to customers under our service agreements when a security incident occurs?"],
        note: hasEvidence ? `IR evidence from ${sources.length} source(s).` : "CC7.2 requires documented procedures for identifying, responding to, and recovering from security incidents.",
      };
    },
  },
  {
    id: "SOC2_CC9_2_vendor_risk",
    code: "SOC2-CC9.2",
    title: "Vendor and third-party risk management",
    frameworks: ["SOC2"],
    evidenceKeys: ["vendor_management", "third_party_risk"],
    articleRefs: { SOC2: "CC9.2" },
    check: (ev) => {
      const hasVendorDoc = hasDoc(ev, "vendor risk", "third party", "supplier", "subprocessor", "vendor assessment", "due diligence");
      const hasNotionVendor = hasNotionSignal(ev, "hasVendorManagement");
      const usesThirdPartyAI = ev.onboarding.usesAI;

      const sources: string[] = [];
      if (hasVendorDoc) sources.push("vendor_risk_policy");
      if (hasNotionVendor) sources.push("Notion: vendor management docs");

      return {
        status: hasVendorDoc || hasNotionVendor ? "PASS" : usesThirdPartyAI ? "FAIL" : "NO_EVIDENCE",
        confidence: hasVendorDoc ? 0.85 : hasNotionVendor ? 0.7 : usesThirdPartyAI ? 0.8 : 0.25,
        evidenceUsed: sources,
        gaps: (hasVendorDoc || hasNotionVendor) ? [] : ["No vendor/third-party risk management procedure found"],
        remediations: (hasVendorDoc || hasNotionVendor) ? [] : ["Maintain a vendor register with risk assessments and ensure material vendors have SOC 2 reports or equivalent assurance"],
        lawyerQuestions: ["What due diligence must we perform on subprocessors and AI providers under CC9.2?"],
        note: (hasVendorDoc || hasNotionVendor) ? "Vendor risk management evidence found." : "CC9.2 requires assessing and managing risks from vendor and business partner relationships.",
      };
    },
  },
  {
    id: "SOC2_A1_1_availability",
    code: "SOC2-A1.1",
    title: "System availability commitments and capacity management",
    frameworks: ["SOC2"],
    evidenceKeys: ["availability", "sla", "uptime", "capacity"],
    articleRefs: { SOC2: "A1.1" },
    check: (ev) => {
      const hasAvailDoc = hasDoc(ev, "availability", "uptime", "sla", "service level", "capacity", "redundancy", "disaster recovery", "business continuity");
      const hasCI = hasGitSignal(ev, "hasCI");
      const hasTests = hasGitSignal(ev, "hasTests");
      const notionHasBC = hasNotionSignal(ev, "hasBusinessContinuity");

      const sources: string[] = [];
      if (hasAvailDoc) sources.push("availability_commitments");
      if (hasCI) sources.push("GitHub: CI/CD for deployment reliability");
      if (hasTests) sources.push("GitHub: automated tests");
      if (notionHasBC) sources.push("Notion: business continuity docs");

      return {
        status: hasAvailDoc || notionHasBC ? "PASS" : hasCI && hasTests ? "PARTIAL" : "NO_EVIDENCE",
        confidence: hasAvailDoc ? 0.85 : notionHasBC ? 0.75 : hasCI ? 0.5 : 0.2,
        evidenceUsed: sources,
        gaps: (hasAvailDoc || notionHasBC) ? [] : ["No availability commitments or business continuity documentation found"],
        remediations: (hasAvailDoc || notionHasBC) ? [] : ["Document your uptime commitments (SLAs), backup and recovery procedures, and capacity monitoring approach"],
        lawyerQuestions: ["What availability commitments have we made to customers, and do our technical controls support those SLAs?"],
        note: "A1.1 requires that availability commitments are met and capacity is managed.",
      };
    },
  },
  {
    id: "SOC2_PI1_1_privacy",
    code: "SOC2-PI1.1",
    title: "Privacy notice and personal information handling",
    frameworks: ["SOC2"],
    evidenceKeys: ["privacy_policy", "personal_information"],
    articleRefs: { SOC2: "PI1.1" },
    check: (ev) => {
      const hasPrivacy = hasDoc(ev, "privacy policy", "privacy notice", "personal information", "personal data");
      const repoHasPrivacy = hasGitSignal(ev, "hasPrivacyPolicy");
      const notionHasPrivacy = hasNotionSignal(ev, "hasPrivacyPolicy");
      const anyPrivacy = hasPrivacy || repoHasPrivacy || notionHasPrivacy;

      const sources: string[] = [];
      if (hasPrivacy) sources.push("privacy_policy");
      if (repoHasPrivacy) sources.push("GitHub: privacy policy file");
      if (notionHasPrivacy) sources.push("Notion: privacy policy");

      return {
        status: anyPrivacy ? "PASS" : "NO_EVIDENCE",
        confidence: anyPrivacy ? 0.85 : 0.2,
        evidenceUsed: sources,
        gaps: anyPrivacy ? [] : ["No privacy notice or personal information policy found"],
        remediations: anyPrivacy ? [] : ["Publish a privacy notice disclosing how personal information is collected, used, retained, and disclosed"],
        lawyerQuestions: ["Does our privacy notice satisfy the SOC 2 Privacy criteria PI1.1 requirements for notice and communication?"],
        note: anyPrivacy ? "Privacy notice found." : "PI1.1 requires a notice describing personal information practices.",
      };
    },
  },
];
