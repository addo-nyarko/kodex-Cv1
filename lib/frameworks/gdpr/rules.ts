import type { ControlRule, EvidencePool } from "@/types/scan";

function hasDoc(ev: EvidencePool, ...keywords: string[]): boolean {
  return ev.documents.some((d) =>
    keywords.some((kw) => d.text.toLowerCase().includes(kw) || d.fileName.toLowerCase().includes(kw))
  );
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
      const hasPrivacyPolicy = hasDoc(ev, "privacy policy", "privacy notice", "data protection notice");
      const hasContactInfo = hasDoc(ev, "dpo", "data protection officer", "contact us");
      return {
        status: hasPrivacyPolicy ? (hasContactInfo ? "PASS" : "PARTIAL") : "NO_EVIDENCE",
        confidence: hasPrivacyPolicy && hasContactInfo ? 0.9 : hasPrivacyPolicy ? 0.65 : 0.15,
        evidenceUsed: hasPrivacyPolicy ? ["privacy_policy"] : [],
        gaps: [
          ...(!hasPrivacyPolicy ? ["No privacy notice found"] : []),
          ...(!hasContactInfo ? ["Privacy notice may lack DPO/controller contact details required by Art. 13(1)(a)"] : []),
        ],
        remediations: [
          ...(!hasPrivacyPolicy ? ["Publish a GDPR-compliant privacy notice covering all Art. 13 information requirements"] : []),
          ...(!hasContactInfo ? ["Add controller identity and contact details, and DPO contact if applicable"] : []),
        ],
        lawyerQuestions: ["Does our privacy notice satisfy both Art. 13 (data collected directly) and Art. 14 (data from third parties) requirements?"],
        note: "Arts. 13-14 require clear transparency notices at collection point.",
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
      const hasRopa = hasDoc(ev, "record of processing", "ropa", "processing activities", "article 30");
      return {
        status: hasRopa ? "PASS" : "NO_EVIDENCE",
        confidence: hasRopa ? 0.85 : 0.2,
        evidenceUsed: hasRopa ? ["ropa"] : [],
        gaps: hasRopa ? [] : ["No Record of Processing Activities (RoPA) found"],
        remediations: hasRopa ? [] : ["Create and maintain an Art. 30 RoPA listing all processing activities, their purposes, legal bases, data categories, retention periods, and technical measures"],
        lawyerQuestions: ["Are we exempt from Art. 30 obligations given our size, or must we maintain a full RoPA?"],
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
    id: "GDPR_006_data_breach",
    code: "GDPR-Art33",
    title: "Data breach notification procedure in place",
    frameworks: ["GDPR"],
    evidenceKeys: ["breach_procedure", "incident_response"],
    articleRefs: { GDPR: "Arts. 33-34" },
    check: (ev) => {
      const hasBreachProc = hasDoc(ev, "data breach", "breach notification", "incident response", "security incident");
      return {
        status: hasBreachProc ? "PASS" : "NO_EVIDENCE",
        confidence: hasBreachProc ? 0.85 : 0.2,
        evidenceUsed: hasBreachProc ? ["breach_procedure"] : [],
        gaps: hasBreachProc ? [] : ["No data breach notification procedure documented"],
        remediations: hasBreachProc ? [] : ["Create a breach response plan covering: detection, 72-hour supervisory authority notification (Art. 33), and high-risk subject notification (Art. 34)"],
        lawyerQuestions: ["At what threshold does a breach require notification to data subjects under Art. 34, and who is our designated point of contact for the supervisory authority?"],
        note: "Art. 33 requires 72-hour breach notification to supervisory authority.",
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
