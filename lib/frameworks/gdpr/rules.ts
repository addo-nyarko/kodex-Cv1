import type { ControlRule, EvidencePool } from "@/types/scan";

function hasDoc(ev: EvidencePool, ...keywords: string[]): boolean {
  return ev.documents.some((d) =>
    keywords.some((kw) => d.text.toLowerCase().includes(kw) || d.fileName.toLowerCase().includes(kw))
  );
}

/** Check if GitHub code signals contain a specific capability */
function hasGitSignal(ev: EvidencePool, key: string): boolean {
  const gh = ev.codeSignals?.github as Record<string, unknown> | undefined;
  if (!gh) return false;
  return !!gh[key];
}

/** Get GitHub findings matching keywords */
function gitFindingsMatch(ev: EvidencePool, ...keywords: string[]): boolean {
  const gh = ev.codeSignals?.github as Record<string, unknown> | undefined;
  if (!gh) return false;
  const findings = (gh.allFindings as string[]) ?? [];
  return findings.some((f) => keywords.some((kw) => f.toLowerCase().includes(kw.toLowerCase())));
}

/** Check Google Workspace signal */
function hasGWSSignal(ev: EvidencePool, key: string): boolean {
  const gws = ev.codeSignals?.googleWorkspace as Record<string, unknown> | undefined;
  if (!gws) return false;
  return !!gws[key];
}

/** Check Slack signal */
function hasSlackSignal(ev: EvidencePool, key: string): boolean {
  const slack = ev.codeSignals?.slack as Record<string, unknown> | undefined;
  if (!slack) return false;
  return !!slack[key];
}

/** Check Notion signal */
function hasNotionSignal(ev: EvidencePool, key: string): boolean {
  const notion = ev.codeSignals?.notion as Record<string, unknown> | undefined;
  if (!notion) return false;
  return !!notion[key];
}

function isHighRiskProcessing(ev: EvidencePool): boolean {
  const highRiskCategories = ["health", "financial", "biometric", "children"];
  return (
    ev.onboarding.dataCategories.some((c) => highRiskCategories.includes(c)) ||
    ev.onboarding.usesAI
  );
}

export const gdprRules: ControlRule[] = [
  {
    id: "GDPR_001_lawful_basis",
    code: "GDPR-Art6",
    title: "Lawful basis for processing established",
    frameworks: ["GDPR"],
    evidenceKeys: ["q_legal_basis", "privacyPolicy", "dpa"],
    articleRefs: { GDPR: "Art. 6" },
    check: (ev) => {
      const hasPolicy = hasDoc(ev, "lawful basis", "legal basis", "legitimate interest", "consent");
      const questionAnswered = !!ev.questionnaire["q_legal_basis"];
      return {
        status: hasPolicy && questionAnswered ? "PASS" : questionAnswered ? "PARTIAL" : "NO_EVIDENCE",
        confidence: hasPolicy && questionAnswered ? 0.9 : questionAnswered ? 0.6 : 0.2,
        evidenceUsed: hasPolicy ? ["privacyPolicy"] : [],
        gaps: hasPolicy ? [] : ["Privacy policy does not document lawful basis per Art. 6"],
        remediations: hasPolicy ? [] : ["Add a lawful basis section to your privacy policy listing the Art. 6(1) ground for each processing activity"],
        lawyerQuestions: ["Can we rely on legitimate interest (Art. 6(1)(f)) for analytics processing, given our user base includes EU residents?"],
        note: "GDPR Art. 6 requires a documented lawful basis for every processing activity.",
      };
    },
  },
  {
    id: "GDPR_002_privacy_notice",
    code: "GDPR-Art13",
    title: "Privacy notice / policy published",
    frameworks: ["GDPR"],
    evidenceKeys: ["privacy_policy", "privacy_notice"],
    articleRefs: { GDPR: "Art. 13-14" },
    check: (ev) => {
      const hasPolicy = hasDoc(ev, "privacy policy", "privacy notice", "data protection notice");
      const hasContactInfo = hasDoc(ev, "dpo", "data protection officer", "contact us");
      // GitHub: check if repo has a privacy policy file
      const repoHasPrivacy = hasGitSignal(ev, "hasPrivacyPolicy");
      // Notion: check if workspace has a privacy policy
      const notionHasPrivacy = hasNotionSignal(ev, "hasPrivacyPolicy");

      const anyPolicy = hasPolicy || repoHasPrivacy || notionHasPrivacy;
      const sources = [
        ...(hasPolicy ? ["privacy_policy"] : []),
        ...(repoHasPrivacy ? ["GitHub repo (privacy policy file detected)"] : []),
        ...(notionHasPrivacy ? ["Notion workspace (privacy policy found)"] : []),
      ];

      return {
        status: anyPolicy ? (hasContactInfo ? "PASS" : "PARTIAL") : "NO_EVIDENCE",
        confidence: anyPolicy && hasContactInfo ? 0.9 : anyPolicy ? 0.65 : 0.15,
        evidenceUsed: sources,
        gaps: [
          ...(!anyPolicy ? ["No privacy notice found in documents or code repository"] : []),
          ...(!hasContactInfo ? ["Privacy notice may lack DPO/controller contact details required by Art. 13(1)(a)"] : []),
        ],
        remediations: [
          ...(!anyPolicy ? ["Publish a GDPR-compliant privacy notice covering all Art. 13 information requirements"] : []),
          ...(!hasContactInfo ? ["Add controller identity and contact details, and DPO contact if applicable"] : []),
        ],
        lawyerQuestions: ["Does our privacy notice satisfy both Art. 13 (data collected directly) and Art. 14 (data from third parties) requirements?"],
        note: anyPolicy
          ? `Privacy notice found${repoHasPrivacy ? " (detected in GitHub repo)" : ""}.`
          : "Arts. 13-14 require clear transparency notices at collection point.",
      };
    },
  },
  {
    id: "GDPR_003_ropa",
    code: "GDPR-Art30",
    title: "Record of Processing Activities maintained",
    frameworks: ["GDPR"],
    evidenceKeys: ["ropa", "processing_records"],
    articleRefs: { GDPR: "Art. 30" },
    check: (ev) => {
      // TIGHTENED: Require ALL components: data categories, legal basis, retention, third-party transfers
      const hasRopa = hasDoc(ev, "record of processing", "ropa", "processing activities");
      const notionHasRopa = hasNotionSignal(ev, "hasRoPA");

      // More specific: check for each required component
      const hasDataCategories = hasDoc(ev, "personal data categories", "data categories", "types of personal data", "data subjects");
      const hasLegalBasis = hasDoc(ev, "legal basis", "lawful basis", "article 6", "legitimate interest", "consent");
      const hasRetention = hasDoc(ev, "retention period", "storage period", "deletion timeline", "how long");
      const hasTransfers = hasDoc(ev, "third party", "processor", "controller", "recipient", "international transfer", "transfer");

      const anyRopa = hasRopa || notionHasRopa;
      const componentCount = [hasDataCategories, hasLegalBasis, hasRetention, hasTransfers].filter(Boolean).length;

      const sources = [
        ...(hasRopa ? ["ropa"] : []),
        ...(notionHasRopa ? ["Notion: record of processing activities"] : []),
        ...(hasDataCategories ? ["data_categories_documented"] : []),
        ...(hasLegalBasis ? ["legal_basis_documented"] : []),
        ...(hasRetention ? ["retention_periods_documented"] : []),
        ...(hasTransfers ? ["third_party_transfers_documented"] : []),
      ];

      if (anyRopa && componentCount >= 4) {
        return {
          status: "PASS",
          confidence: 0.95,
          evidenceUsed: sources,
          gaps: [],
          remediations: [],
          lawyerQuestions: [],
          note: "RoPA found with all required Art. 30 components: data categories, legal basis, retention periods, and third-party transfers.",
        };
      }

      if (anyRopa && componentCount >= 2) {
        return {
          status: "PARTIAL",
          confidence: 0.65,
          evidenceUsed: sources,
          gaps: [
            ...(!hasDataCategories ? ["Missing: Documented categories of personal data processed"] : []),
            ...(!hasLegalBasis ? ["Missing: Legal basis for each processing activity"] : []),
            ...(!hasRetention ? ["Missing: Data retention and deletion timelines"] : []),
            ...(!hasTransfers ? ["Missing: Documentation of third-party recipients and international transfers"] : []),
          ],
          remediations: ["Update RoPA to include all Art. 30 requirements: data categories, legal basis, retention periods, recipients, and international transfer justifications"],
          lawyerQuestions: ["Does Art. 30 require separate RoPA entries for each processing purpose, or can we group similar activities?"],
          note: `RoPA found with ${componentCount}/4 required components. Documentation incomplete.`,
        };
      }

      if (anyRopa || componentCount > 0) {
        return {
          status: "PARTIAL",
          confidence: 0.5,
          evidenceUsed: sources,
          gaps: [
            ...(!hasDataCategories ? ["Missing: Documented categories of personal data processed"] : []),
            ...(!hasLegalBasis ? ["Missing: Legal basis for each processing activity"] : []),
            ...(!hasRetention ? ["Missing: Data retention and deletion timelines"] : []),
            ...(!hasTransfers ? ["Missing: Documentation of third-party recipients and international transfers"] : []),
          ],
          remediations: ["Create a comprehensive Art. 30 Record of Processing Activities with: (1) data categories, (2) legal basis per Art. 6, (3) retention timelines, (4) third-party recipient list"],
          lawyerQuestions: ["Are we exempt from Art. 30 obligations given our size (< 250 employees), or must we maintain a full RoPA?"],
          note: `Partial RoPA evidence found (${componentCount}/4 components). Full Art. 30 compliance needed.`,
        };
      }

      return {
        status: "NO_EVIDENCE",
        confidence: 0.2,
        evidenceUsed: [],
        gaps: ["No Record of Processing Activities (RoPA) found"],
        remediations: ["Create and maintain an Art. 30 RoPA including: (1) all data categories, (2) legal basis for processing, (3) retention periods, (4) list of recipients, (5) transfer mechanisms if applicable"],
        lawyerQuestions: ["Are we exempt from Art. 30 obligations given our size (< 250 employees), or must we maintain a full RoPA?"],
        note: "Art. 30 RoPA is mandatory for most organisations processing EU personal data.",
      };
    },
  },
  {
    id: "GDPR_004_consent_management",
    code: "GDPR-Art7",
    title: "Consent collection and management compliant",
    frameworks: ["GDPR"],
    evidenceKeys: ["consent_mechanism", "cookie_banner"],
    articleRefs: { GDPR: "Art. 7" },
    check: (ev) => {
      const usesConsent = ev.questionnaire["q_legal_basis"] === "consent";
      if (!usesConsent) {
        return {
          status: "PASS",
          confidence: 0.8,
          evidenceUsed: [],
          gaps: [],
          remediations: [],
          lawyerQuestions: [],
          note: "Consent not used as primary legal basis — Art. 7 conditions not directly applicable.",
        };
      }
      const hasConsentMech = hasDoc(ev, "consent", "opt-in", "cookie", "preferences");
      return {
        status: hasConsentMech ? "PASS" : "FAIL",
        confidence: hasConsentMech ? 0.8 : 0.9,
        evidenceUsed: hasConsentMech ? ["consent_mechanism"] : [],
        gaps: hasConsentMech ? [] : ["Consent used as legal basis but no consent mechanism documentation found"],
        remediations: hasConsentMech ? [] : ["Document consent collection mechanism — ensure freely given, specific, informed, unambiguous consent with easy withdrawal"],
        lawyerQuestions: ["Does our cookie consent banner meet the EDPB guidelines on consent — specifically, is the 'accept all' and 'reject all' equally prominent?"],
        note: "Art. 7 consent must be freely given, specific, informed and unambiguous.",
      };
    },
  },
  {
    id: "GDPR_005_data_subject_rights",
    code: "GDPR-Art15",
    title: "Data subject rights procedures established",
    frameworks: ["GDPR"],
    evidenceKeys: ["dsr_procedure", "privacy_policy"],
    articleRefs: { GDPR: "Arts. 15-22" },
    check: (ev) => {
      const hasProcedure = hasDoc(ev, "data subject", "right to access", "right to erasure", "right to portability", "dsar");
      const hasPrivacyMention = hasDoc(ev, "your rights", "request your data", "delete your data");
      return {
        status: hasProcedure ? "PASS" : hasPrivacyMention ? "PARTIAL" : "NO_EVIDENCE",
        confidence: hasProcedure ? 0.85 : hasPrivacyMention ? 0.5 : 0.2,
        evidenceUsed: [hasProcedure ? "dsr_procedure" : "", hasPrivacyMention ? "privacy_policy" : ""].filter(Boolean),
        gaps: hasProcedure ? [] : ["No data subject rights handling procedure found"],
        remediations: hasProcedure ? [] : ["Create a documented DSR (Data Subject Request) procedure with response timelines per Art. 12 (1 month) and cover Arts. 15-22 rights"],
        lawyerQuestions: ["What is our process for verifying identity before fulfilling DSARs, and is our current process compliant with Art. 12?"],
        note: "Arts. 15-22 grant data subjects rights that require documented handling procedures.",
      };
    },
  },
  {
    id: "GDPR_005b_right_to_erasure",
    code: "GDPR-Art17",
    title: "Right to erasure (deletion) technically implemented",
    frameworks: ["GDPR"],
    evidenceKeys: ["deletion_mechanism", "erasure_procedure"],
    articleRefs: { GDPR: "Art. 17" },
    check: (ev) => {
      // TIGHTENED: Require technical deletion mechanism, not just policy
      const hasDeletionPolicy = hasDoc(ev, "right to erasure", "data deletion", "erasure procedure", "deletion request");
      // Code signals: deletion mechanism implementation
      const hasInputValidation = hasGitSignal(ev, "hasInputValidation");
      const hasAuth = hasGitSignal(ev, "hasAuth");
      // These suggest ability to identify and delete user data

      const anyDeletionEvidence = hasDeletionPolicy || hasInputValidation || hasAuth;
      const sources: string[] = [];
      if (hasDeletionPolicy) sources.push("deletion_policy");
      if (hasInputValidation) sources.push("GitHub: data validation/cleansing capability");
      if (hasAuth) sources.push("GitHub: user identification for deletion");

      if (hasDeletionPolicy && (hasInputValidation || hasAuth)) {
        return {
          status: "PASS",
          confidence: 0.85,
          evidenceUsed: sources,
          gaps: [],
          remediations: [],
          lawyerQuestions: ["Does our deletion mechanism fully remove associated logs, backups, and cached data per Art. 17(1)?"],
          note: "Art. 17 right to erasure: policy documented and technical deletion capability detected.",
        };
      }

      if (hasDeletionPolicy) {
        return {
          status: "PARTIAL",
          confidence: 0.6,
          evidenceUsed: sources,
          gaps: ["Deletion policy exists but no technical implementation evidence (no deletion mechanism in code)"],
          remediations: ["Implement technical deletion mechanism: user data deletion API, background cleanup jobs, backup retention policies, and cascade deletion for related records"],
          lawyerQuestions: ["Must we delete associated metadata and access logs when a user requests erasure under Art. 17(1)?"],
          note: "Policy documented but technical deletion mechanism not evident.",
        };
      }

      if (anyDeletionEvidence) {
        return {
          status: "PARTIAL",
          confidence: 0.5,
          evidenceUsed: sources,
          gaps: ["No deletion policy documented (code signals suggest capability but policy clarification needed)"],
          remediations: ["Document your data deletion policy including: timelines, scope (what data is deleted), exceptions (logs, legal holds), and user interface for deletion requests"],
          lawyerQuestions: [],
          note: "Code signals suggest deletion capability but policy documentation missing.",
        };
      }

      return {
        status: "FAIL",
        confidence: 0.9,
        evidenceUsed: [],
        gaps: ["No data deletion policy or technical deletion mechanism found"],
        remediations: ["Implement Art. 17 right to erasure: document deletion policy and build technical deletion mechanism (delete API, cascade deletes, backup purging)"],
        lawyerQuestions: ["Does Art. 17 require us to delete data immediately or within a reasonable timeframe, and what are acceptable exceptions?"],
        note: "Art. 17 right to erasure requires both policy and technical implementation.",
      };
    },
  },
  {
    id: "GDPR_006_data_breach",
    code: "GDPR-Art33",
    title: "Data breach notification procedure in place",
    frameworks: ["GDPR"],
    evidenceKeys: ["breach_procedure", "incident_response"],
    articleRefs: { GDPR: "Arts. 33-34" },
    check: (ev) => {
      const hasBreachDoc = hasDoc(ev, "data breach", "breach notification", "incident response", "security incident");
      // GitHub: check if repo has a SECURITY.md (vulnerability disclosure policy)
      const repoHasSecurityMd = hasGitSignal(ev, "hasSecurityMd");
      // Slack: check for dedicated incident response channel
      const slackHasIncident = hasSlackSignal(ev, "hasIncidentChannel");
      const slackActiveProcess = hasSlackSignal(ev, "hasActiveIncidentProcess");
      // Notion: check for incident response documentation
      const notionHasIR = hasNotionSignal(ev, "hasIncidentResponse");

      const hasEvidence = hasBreachDoc || repoHasSecurityMd || slackHasIncident || notionHasIR;
      const hasStrongEvidence = hasBreachDoc || notionHasIR || (repoHasSecurityMd && slackHasIncident);

      const sources = [
        ...(hasBreachDoc ? ["breach_procedure"] : []),
        ...(repoHasSecurityMd ? ["GitHub repo (SECURITY.md detected)"] : []),
        ...(slackHasIncident ? ["Slack: #incident channel"] : []),
        ...(slackActiveProcess ? ["Slack: active incident process"] : []),
        ...(notionHasIR ? ["Notion: incident response plan"] : []),
      ];

      const getConfidence = () => {
        if (hasStrongEvidence) return 0.85;
        if (notionHasIR || hasBreachDoc) return 0.8;
        if (repoHasSecurityMd && slackHasIncident) return 0.7;
        if (slackHasIncident || repoHasSecurityMd) return 0.55;
        return 0.2;
      };

      return {
        status: hasStrongEvidence ? "PASS" : hasEvidence ? "PARTIAL" : "NO_EVIDENCE",
        confidence: getConfidence(),
        evidenceUsed: sources,
        gaps: hasStrongEvidence
          ? []
          : hasEvidence
            ? ["Partial incident handling evidence found but a formal breach notification procedure should be documented"]
            : ["No data breach notification procedure documented"],
        remediations: hasStrongEvidence
          ? []
          : ["Create a breach response plan covering: detection, 72-hour supervisory authority notification (Art. 33), and high-risk subject notification (Art. 34)"],
        lawyerQuestions: ["At what threshold does a breach require notification to data subjects under Art. 34, and who is our designated point of contact for the supervisory authority?"],
        note: hasEvidence
          ? `Breach/incident handling evidence found from ${sources.length} source(s): ${sources.join(", ")}.`
          : "Art. 33 requires 72-hour breach notification to supervisory authority.",
      };
    },
  },
  {
    id: "GDPR_007_security_measures",
    code: "GDPR-Art32",
    title: "Appropriate technical and organisational security measures",
    frameworks: ["GDPR"],
    evidenceKeys: ["security_policy", "encryption", "access_control"],
    articleRefs: { GDPR: "Art. 32" },
    check: (ev) => {
      const hasSecDoc = hasDoc(ev, "security policy", "security measures", "information security", "encryption", "access control");

      // GitHub: check for concrete security implementation signals
      const hasAuth = hasGitSignal(ev, "hasAuth");
      const hasEncryption = hasGitSignal(ev, "hasEncryption");
      const hasValidation = hasGitSignal(ev, "hasInputValidation");
      const hasLogging = hasGitSignal(ev, "hasLogging");
      const hasCI = hasGitSignal(ev, "hasCI");
      const hasTests = hasGitSignal(ev, "hasTests");
      const hasBranchProt = hasGitSignal(ev, "hasBranchProtection");

      // Google Workspace: access control signals
      const has2FA = hasGWSSignal(ev, "has2FAEnforced");
      const hasLoginMonitoring = hasGWSSignal(ev, "hasLoginMonitoring");

      // Slack: organizational security signals
      const hasSecurityChannel = hasSlackSignal(ev, "hasSecurityChannel");

      // Notion: security policy document
      const notionHasSecPolicy = hasNotionSignal(ev, "hasSecurityPolicy");

      const codeSecurityCount = [hasAuth, hasEncryption, hasValidation, hasLogging, hasCI, hasTests, hasBranchProt, has2FA, hasLoginMonitoring, hasSecurityChannel, notionHasSecPolicy]
        .filter(Boolean).length;
      const hasStrongCodeSecurity = codeSecurityCount >= 3;

      const sources: string[] = [];
      if (hasSecDoc) sources.push("security_policy");
      if (hasAuth) sources.push("GitHub: authentication middleware");
      if (hasEncryption) sources.push("GitHub: encryption/hashing");
      if (hasValidation) sources.push("GitHub: input validation");
      if (hasLogging) sources.push("GitHub: logging/monitoring");
      if (hasCI) sources.push("GitHub: CI/CD pipeline");
      if (hasTests) sources.push("GitHub: automated tests");
      if (hasBranchProt) sources.push("GitHub: branch protection");
      if (has2FA) sources.push("Google Workspace: 2FA enforced");
      if (hasLoginMonitoring) sources.push("Google Workspace: login monitoring");
      if (hasSecurityChannel) sources.push("Slack: dedicated security channel");
      if (notionHasSecPolicy) sources.push("Notion: security policy document");

      const gaps: string[] = [];
      if (!hasSecDoc && !notionHasSecPolicy && !hasStrongCodeSecurity) gaps.push("No security policy document and limited code-level security measures");
      if (!hasEncryption) gaps.push("No encryption implementation detected");
      if (!hasAuth && !has2FA) gaps.push("No authentication/2FA measures detected");
      if (!hasLogging && !hasLoginMonitoring) gaps.push("No logging/monitoring detected");

      if (hasSecDoc && hasStrongCodeSecurity) {
        return {
          status: "PASS",
          confidence: 0.9,
          evidenceUsed: sources,
          gaps: [],
          remediations: [],
          lawyerQuestions: [],
          note: `Strong Art. 32 compliance: security policy documented and ${codeSecurityCount} technical measures verified in codebase.`,
        };
      }
      if (hasStrongCodeSecurity) {
        return {
          status: "PARTIAL",
          confidence: 0.7,
          evidenceUsed: sources,
          gaps: ["Technical measures found in code but no formal security policy document"],
          remediations: ["Document your existing security measures in a formal information security policy"],
          lawyerQuestions: ["Does our technical security posture satisfy Art. 32's 'appropriate' standard given our data types and processing volume?"],
          note: `${codeSecurityCount} security measures verified in codebase. Formal policy document would complete Art. 32 compliance.`,
        };
      }
      if (hasSecDoc) {
        return {
          status: "PARTIAL",
          confidence: 0.65,
          evidenceUsed: sources,
          gaps: codeSecurityCount === 0 ? ["Security policy exists but no implementation verified in code"] : gaps,
          remediations: ["Ensure documented security measures are actually implemented in code"],
          lawyerQuestions: [],
          note: "Security policy documented but limited implementation evidence from code scan.",
        };
      }

      return {
        status: codeSecurityCount > 0 ? "PARTIAL" : "NO_EVIDENCE",
        confidence: codeSecurityCount > 0 ? 0.4 : 0.15,
        evidenceUsed: sources,
        gaps: gaps.length > 0 ? gaps : ["No security measures documented or detected"],
        remediations: ["Implement and document appropriate technical measures: encryption at rest and in transit, access controls, logging, input validation, and automated testing"],
        lawyerQuestions: ["What constitutes 'appropriate' technical and organisational measures under Art. 32 for our size and data sensitivity?"],
        note: codeSecurityCount > 0
          ? `Only ${codeSecurityCount} technical measure(s) detected. Art. 32 requires comprehensive security.`
          : "Art. 32 requires appropriate technical and organisational security measures.",
      };
    },
  },
  {
    id: "SHARED_001_dpia",
    code: "SHARED-DPIA",
    title: "Data Protection Impact Assessment conducted",
    frameworks: ["GDPR", "EU_AI_ACT"],
    evidenceKeys: ["q3_domain", "q4_decision_impact", "dpia_document"],
    articleRefs: { GDPR: "Art. 35", EU_AI_ACT: "Art. 9" },
    check: (ev) => {
      const isHighRisk = isHighRiskProcessing(ev);
      const hasDpia = ev.documents.some((d) =>
        d.fileName.toLowerCase().includes("dpia") ||
        d.text.toLowerCase().includes("data protection impact assessment")
      );
      if (!isHighRisk) {
        return {
          status: "PASS",
          confidence: 0.95,
          evidenceUsed: [],
          gaps: [],
          remediations: [],
          lawyerQuestions: [],
          note: "DPIA not required — processing is not high-risk.",
        };
      }
      return {
        status: hasDpia ? "PASS" : "FAIL",
        confidence: hasDpia ? 0.85 : 0.9,
        evidenceUsed: hasDpia ? ["dpia_document"] : [],
        gaps: hasDpia ? [] : ["High-risk processing detected but no DPIA document found"],
        remediations: hasDpia ? [] : ["Conduct and document a DPIA before commencing high-risk processing (GDPR Art. 35)"],
        lawyerQuestions: ["Does our automated profiling system meet the threshold for mandatory DPIA under Art. 35(3)(a)?"],
        note: `High-risk processing detected. DPIA ${hasDpia ? "found" : "required"}.`,
      };
    },
  },
];
