import type { ControlRule, EvidencePool } from "@/types/scan";

function usesHighRiskAI(ev: EvidencePool): boolean {
  const highRiskDomains = ["health", "financial", "biometric", "children", "employment", "education", "justice"];
  return (
    ev.onboarding.usesAI &&
    (ev.onboarding.dataCategories.some((c) => highRiskDomains.includes(c)) ||
      !!ev.questionnaire["q_high_risk_domain"])
  );
}

function hasDoc(ev: EvidencePool, ...keywords: string[]): boolean {
  return ev.documents.some((d) =>
    keywords.some((kw) => d.text.toLowerCase().includes(kw) || d.fileName.toLowerCase().includes(kw))
  );
}

export const euAiActRules: ControlRule[] = [
  {
    id: "EU_AI_001_prohibited_practices",
    code: "AI-Art5",
    title: "No prohibited AI practices",
    frameworks: ["EU_AI_ACT"],
    evidenceKeys: ["q_prohibited_practices", "ai_system_description"],
    articleRefs: { EU_AI_ACT: "Art. 5" },
    check: (ev) => {
      const answered = !!ev.questionnaire["q_prohibited_practices"];
      const prohibited = ev.questionnaire["q_prohibited_practices"] === "yes";
      if (!answered) {
        return {
          status: "NO_EVIDENCE",
          confidence: 0.3,
          evidenceUsed: [],
          gaps: ["No confirmation provided that AI system avoids prohibited practices"],
          remediations: ["Complete the AI system questionnaire confirming absence of Art. 5 prohibited practices"],
          lawyerQuestions: ["Does our AI system use subliminal techniques, social scoring, or real-time biometric identification in public spaces covered by Art. 5?"],
          note: "Art. 5 prohibits certain AI practices outright.",
        };
      }
      if (prohibited) {
        return {
          status: "FAIL",
          confidence: 0.95,
          evidenceUsed: ["q_prohibited_practices"],
          gaps: ["System uses one or more prohibited AI practices under Art. 5"],
          remediations: ["Immediately cease the prohibited practice and consult legal counsel"],
          lawyerQuestions: ["Which specific Art. 5(1) prohibition applies, and what modifications would bring the system into compliance?"],
          note: "CRITICAL: Prohibited AI practice detected.",
        };
      }
      return {
        status: "PASS",
        confidence: 0.8,
        evidenceUsed: ["q_prohibited_practices"],
        gaps: [],
        remediations: [],
        lawyerQuestions: [],
        note: "No prohibited practices confirmed.",
      };
    },
  },
  {
    id: "EU_AI_002_risk_classification",
    code: "AI-Art6",
    title: "AI system risk classification documented",
    frameworks: ["EU_AI_ACT"],
    evidenceKeys: ["q_risk_classification", "risk_assessment_doc"],
    articleRefs: { EU_AI_ACT: "Art. 6" },
    check: (ev) => {
      const hasClassification = !!ev.questionnaire["q_risk_classification"];
      const hasDoc = ev.documents.some((d) =>
        d.text.toLowerCase().includes("risk classification") || d.fileName.toLowerCase().includes("risk")
      );
      return {
        status: hasClassification ? (hasDoc ? "PASS" : "PARTIAL") : "NO_EVIDENCE",
        confidence: hasClassification && hasDoc ? 0.9 : hasClassification ? 0.6 : 0.2,
        evidenceUsed: [hasClassification ? "q_risk_classification" : "", hasDoc ? "risk_assessment_doc" : ""].filter(Boolean),
        gaps: hasDoc ? [] : ["No formal risk classification document found"],
        remediations: hasDoc ? [] : ["Document your AI system's risk level per Art. 6 Annex III criteria"],
        lawyerQuestions: ["Does our AI system fall under Annex III high-risk categories, specifically given our use in " + ev.onboarding.industry + "?"],
        note: "Art. 6 requires risk classification for all AI systems.",
      };
    },
  },
  {
    id: "EU_AI_003_technical_documentation",
    code: "AI-Art11",
    title: "Technical documentation maintained",
    frameworks: ["EU_AI_ACT"],
    evidenceKeys: ["technical_doc", "system_architecture"],
    articleRefs: { EU_AI_ACT: "Art. 11" },
    check: (ev) => {
      const hasTechDoc = hasDoc(ev, "technical documentation", "architecture", "system design", "model card");
      if (!usesHighRiskAI(ev)) {
        return {
          status: "PASS",
          confidence: 0.85,
          evidenceUsed: [],
          gaps: [],
          remediations: [],
          lawyerQuestions: [],
          note: "Art. 11 documentation is mandatory only for high-risk AI systems.",
        };
      }
      return {
        status: hasTechDoc ? "PASS" : "FAIL",
        confidence: hasTechDoc ? 0.85 : 0.9,
        evidenceUsed: hasTechDoc ? ["technical_doc"] : [],
        gaps: hasTechDoc ? [] : ["High-risk AI system lacks Art. 11 technical documentation"],
        remediations: hasTechDoc ? [] : ["Create Annex IV technical documentation including system description, training data, architecture, and performance metrics"],
        lawyerQuestions: ["What specific information must our technical documentation contain per Art. 11 and Annex IV given our system type?"],
        note: `High-risk AI: technical documentation ${hasTechDoc ? "found" : "missing"}.`,
      };
    },
  },
  {
    id: "EU_AI_004_transparency",
    code: "AI-Art13",
    title: "Transparency and information provision to users",
    frameworks: ["EU_AI_ACT"],
    evidenceKeys: ["user_documentation", "transparency_notice"],
    articleRefs: { EU_AI_ACT: "Art. 13" },
    check: (ev) => {
      const hasTransparency = hasDoc(ev, "ai disclosure", "automated", "ai-assisted", "transparency");
      const hasUserDoc = hasDoc(ev, "user guide", "user manual", "instructions for use");
      return {
        status: hasTransparency && hasUserDoc ? "PASS" : hasTransparency || hasUserDoc ? "PARTIAL" : "NO_EVIDENCE",
        confidence: hasTransparency && hasUserDoc ? 0.9 : 0.4,
        evidenceUsed: [hasTransparency ? "transparency_notice" : "", hasUserDoc ? "user_documentation" : ""].filter(Boolean),
        gaps: [
          ...(!hasTransparency ? ["No AI transparency disclosure found"] : []),
          ...(!hasUserDoc ? ["No user documentation for AI system found"] : []),
        ],
        remediations: [
          ...(!hasTransparency ? ["Add clear disclosure that users are interacting with or being evaluated by an AI system"] : []),
          ...(!hasUserDoc ? ["Create user-facing documentation explaining AI system capabilities and limitations"] : []),
        ],
        lawyerQuestions: ["What specific disclosures are required under Art. 13 for our AI system type and use case?"],
        note: "Art. 13 requires transparent, understandable information about high-risk AI systems.",
      };
    },
  },
  {
    id: "EU_AI_005_human_oversight",
    code: "AI-Art14",
    title: "Human oversight measures implemented",
    frameworks: ["EU_AI_ACT"],
    evidenceKeys: ["q_human_oversight", "oversight_procedures"],
    articleRefs: { EU_AI_ACT: "Art. 14" },
    check: (ev) => {
      const hasOversight = !!ev.questionnaire["q_human_oversight"];
      const hasProc = hasDoc(ev, "human oversight", "review process", "escalation", "human-in-the-loop");
      if (!usesHighRiskAI(ev)) {
        return {
          status: "PASS",
          confidence: 0.8,
          evidenceUsed: [],
          gaps: [],
          remediations: [],
          lawyerQuestions: [],
          note: "Art. 14 oversight requirements apply primarily to high-risk AI systems.",
        };
      }
      return {
        status: hasOversight && hasProc ? "PASS" : hasOversight ? "PARTIAL" : "NO_EVIDENCE",
        confidence: hasOversight && hasProc ? 0.9 : 0.4,
        evidenceUsed: [hasOversight ? "q_human_oversight" : "", hasProc ? "oversight_procedures" : ""].filter(Boolean),
        gaps: hasProc ? [] : ["No documented human oversight procedures for AI system"],
        remediations: hasProc ? [] : ["Document human oversight procedures including who reviews AI outputs, escalation paths, and override mechanisms"],
        lawyerQuestions: ["What level of human oversight satisfies Art. 14 for our specific AI use case — does manager review qualify as 'meaningful human oversight'?"],
        note: `Human oversight: ${hasOversight && hasProc ? "documented" : "insufficient"}.`,
      };
    },
  },
  {
    id: "SHARED_001_dpia",
    code: "SHARED-DPIA",
    title: "Data Protection Impact Assessment conducted",
    frameworks: ["EU_AI_ACT", "GDPR"],
    evidenceKeys: ["q3_domain", "q4_decision_impact", "dpia_document"],
    articleRefs: { EU_AI_ACT: "Art. 9", GDPR: "Art. 35" },
    check: (ev) => {
      const isHighRisk = isHighRiskProcessing(ev);
      const hasDpia = ev.documents.some((d) =>
        d.fileName.toLowerCase().includes("dpia") ||
        d.text.toLowerCase().includes("data protection impact assessment") ||
        d.text.toLowerCase().includes("privacy impact assessment")
      );
      if (!isHighRisk) {
        return {
          status: "PASS",
          confidence: 0.95,
          evidenceUsed: [],
          gaps: [],
          remediations: [],
          lawyerQuestions: [],
          note: "DPIA not required — processing does not appear high-risk.",
        };
      }
      return {
        status: hasDpia ? "PASS" : "FAIL",
        confidence: hasDpia ? 0.85 : 0.9,
        evidenceUsed: hasDpia ? ["dpia_document"] : [],
        gaps: hasDpia ? [] : ["High-risk processing detected but no DPIA document found"],
        remediations: hasDpia ? [] : ["Conduct and document a DPIA before commencing high-risk processing (GDPR Art. 35 / EU AI Act Art. 9)"],
        lawyerQuestions: [
          "Does our automated processing meet the threshold for mandatory DPIA under Art. 35(3)(a)?",
          "Does the AI Act Art. 9 risk management obligation require a separate assessment from the GDPR DPIA?",
        ],
        note: `High-risk processing detected. DPIA ${hasDpia ? "found" : "required"}.`,
      };
    },
  },
];

function isHighRiskProcessing(ev: EvidencePool): boolean {
  const highRiskCategories = ["health", "financial", "biometric", "children"];
  return (
    ev.onboarding.dataCategories.some((c) => highRiskCategories.includes(c)) ||
    ev.onboarding.usesAI
  );
}
