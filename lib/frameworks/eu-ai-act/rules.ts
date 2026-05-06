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

/** Check if GitHub code signals contain a specific capability */
function hasGitSignal(ev: EvidencePool, key: string): boolean {
  const gh = ev.codeSignals?.github as Record<string, unknown> | undefined;
  if (!gh) return false;
  return !!gh[key];
}

function isHighRiskProcessing(ev: EvidencePool): boolean {
  const highRiskCategories = ["health", "financial", "biometric", "children"];
  return (
    ev.onboarding.dataCategories.some((c) => highRiskCategories.includes(c)) ||
    ev.onboarding.usesAI
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
      if (!ev.onboarding.usesAI) {
        return {
          status: "PASS",
          confidence: 0.85,
          evidenceUsed: [],
          gaps: [],
          remediations: [],
          lawyerQuestions: [],
          note: "Company does not use AI — Art. 5 prohibited practices not applicable.",
        };
      }
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
      if (!ev.onboarding.usesAI) {
        return {
          status: "PASS",
          confidence: 0.85,
          evidenceUsed: [],
          gaps: [],
          remediations: [],
          lawyerQuestions: [],
          note: "Company does not use AI — risk classification not applicable.",
        };
      }
      const hasClassification = !!ev.questionnaire["q_risk_classification"];
      // TIGHTENED: Require explicit Annex III reference, not just "risk" filename keyword
      const hasAnnexIIIRef = ev.documents.some((d) =>
        d.text.toLowerCase().includes("annex iii") ||
        d.text.toLowerCase().includes("high-risk") ||
        d.text.toLowerCase().includes("biometric") ||
        d.text.toLowerCase().includes("safety-critical") ||
        d.text.toLowerCase().includes("employment") ||
        d.text.toLowerCase().includes("education")
      );
      const hasExplicitClassification = ev.documents.some((d) =>
        d.text.toLowerCase().includes("risk classification") &&
        (d.text.toLowerCase().includes("high") || d.text.toLowerCase().includes("limited") || d.text.toLowerCase().includes("minimal"))
      );

      return {
        status: hasClassification && (hasAnnexIIIRef || hasExplicitClassification) ? "PASS" : hasClassification ? "PARTIAL" : "NO_EVIDENCE",
        confidence: hasClassification && (hasAnnexIIIRef || hasExplicitClassification) ? 0.9 : hasClassification ? 0.5 : 0.2,
        evidenceUsed: [hasClassification ? "q_risk_classification" : "", hasAnnexIIIRef ? "risk_assessment_with_annex_iii_criteria" : ""].filter(Boolean),
        gaps: !hasAnnexIIIRef ? ["Document does not explicitly reference Annex III high-risk categories or classification rationale"] : [],
        remediations: !hasAnnexIIIRef ? ["Document risk classification explicitly referencing Annex III categories (biometric, safety-critical, employment, education, etc.) with justification for classification"] : [],
        lawyerQuestions: ["Does our AI system fall under Annex III high-risk categories — specifically " + (ev.onboarding.dataCategories.join(", ") || "identify applicable domains") + "?"],
        note: `Art. 6: Risk classification ${hasAnnexIIIRef ? "with Annex III criteria found" : hasExplicitClassification ? "explicitly stated but needs Annex III reference" : "needs Annex III alignment"}.`,
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
      // TIGHTENED: Require ALL THREE components for PASS, not just any documentation
      const hasTrainingDataDesc = hasDoc(ev, "training data", "training dataset", "training methodology", "data sources");
      const hasPerformanceMetrics = hasDoc(ev, "performance", "accuracy", "f1 score", "recall", "precision", "metrics", "test results");
      const hasLimitations = hasDoc(ev, "limitations", "constraints", "known issues", "model card", "failure modes");

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

      const sources: string[] = [];
      if (hasTrainingDataDesc) sources.push("training_data_description");
      if (hasPerformanceMetrics) sources.push("performance_metrics");
      if (hasLimitations) sources.push("system_limitations");

      const componentsCount = [hasTrainingDataDesc, hasPerformanceMetrics, hasLimitations].filter(Boolean).length;

      if (componentsCount === 3) {
        return {
          status: "PASS",
          confidence: 0.95,
          evidenceUsed: sources,
          gaps: [],
          remediations: [],
          lawyerQuestions: [],
          note: "Art. 11: Complete technical documentation with training data, performance metrics, and limitations.",
        };
      }

      if (componentsCount === 2) {
        return {
          status: "PARTIAL",
          confidence: 0.65,
          evidenceUsed: sources,
          gaps: [
            ...(!hasTrainingDataDesc ? ["Missing: Training data description (sources, size, preprocessing)"] : []),
            ...(!hasPerformanceMetrics ? ["Missing: Performance metrics (accuracy, test results)"] : []),
            ...(!hasLimitations ? ["Missing: Known limitations and failure modes"] : []),
          ],
          remediations: ["Complete Annex IV documentation with all three components: training data provenance, measured performance metrics, and documented limitations"],
          lawyerQuestions: ["What specific metrics and thresholds must we document to satisfy Annex IV requirements for our system type?"],
          note: `Art. 11: ${componentsCount}/3 required components present. Documentation incomplete.`,
        };
      }

      if (componentsCount === 1) {
        return {
          status: "PARTIAL",
          confidence: 0.4,
          evidenceUsed: sources,
          gaps: [
            ...(!hasTrainingDataDesc ? ["Missing: Training data description (sources, size, preprocessing)"] : []),
            ...(!hasPerformanceMetrics ? ["Missing: Performance metrics (accuracy, test results)"] : []),
            ...(!hasLimitations ? ["Missing: Known limitations and failure modes"] : []),
          ],
          remediations: ["Develop comprehensive Annex IV technical documentation covering: (1) training data sources and methodology, (2) performance metrics with test evidence, (3) documented limitations"],
          lawyerQuestions: ["What specific metrics and thresholds must we document to satisfy Annex IV requirements for our system type?"],
          note: `Art. 11: Only 1/3 required components. Documentation significantly incomplete.`,
        };
      }

      return {
        status: "FAIL",
        confidence: 0.9,
        evidenceUsed: [],
        gaps: ["High-risk AI system lacks Art. 11 Annex IV technical documentation — no training data, performance metrics, or limitations documented"],
        remediations: ["Create formal Annex IV technical documentation with: training data provenance, measured performance metrics, documented limitations, system architecture, and use case description"],
        lawyerQuestions: ["What is the minimum required scope of Annex IV documentation given our AI system's risk classification and use case?"],
        note: "Art. 11: Technical documentation missing all required components for high-risk AI systems.",
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
      if (!ev.onboarding.usesAI) {
        return {
          status: "PASS",
          confidence: 0.85,
          evidenceUsed: [],
          gaps: [],
          remediations: [],
          lawyerQuestions: [],
          note: "Company does not use AI — Art. 13 transparency not applicable.",
        };
      }
      // TIGHTENED: Require disclosure AT POINT OF USE (UI/UX), not just policy existence
      const hasPointOfUseDisclosure = hasDoc(ev, "ai disclosure", "ai-generated", "automated decision", "you are interacting", "this result was generated", "ai-powered");
      const hasUserDocWithAI = hasDoc(ev, "user guide", "user manual", "instructions", "capability", "ai system");
      // Code signals: UI/UX patterns that indicate disclosure implementation
      const repoHasApiDocs = hasGitSignal(ev, "hasApiDocs");

      const sources: string[] = [];
      if (hasPointOfUseDisclosure) sources.push("point_of_use_ai_disclosure");
      if (hasUserDocWithAI) sources.push("user_documentation_with_ai_explanation");
      if (repoHasApiDocs) sources.push("GitHub: API documentation (system integration)");

      const hasFullDisclosure = hasPointOfUseDisclosure && hasUserDocWithAI;
      const hasPartialDisclosure = (hasPointOfUseDisclosure || hasUserDocWithAI) && !hasFullDisclosure;

      return {
        status: hasFullDisclosure ? "PASS" : hasPartialDisclosure ? "PARTIAL" : "NO_EVIDENCE",
        confidence: hasFullDisclosure ? 0.9 : hasPartialDisclosure ? 0.5 : 0.2,
        evidenceUsed: sources,
        gaps: [
          ...(!hasPointOfUseDisclosure ? ["No evidence of AI disclosure at point of use (in UI/output)"] : []),
          ...(!hasUserDocWithAI ? ["No user-facing documentation explaining AI involvement"] : []),
        ],
        remediations: [
          ...(!hasPointOfUseDisclosure ? ["Implement clear disclosure at point of AI use (e.g., 'This recommendation was generated by AI', 'AI-assisted analysis')"] : []),
          ...(!hasUserDocWithAI ? ["Create user documentation explaining: AI system involvement, how it works, its capabilities and limitations, when recommendations should be verified"] : []),
        ],
        lawyerQuestions: ["What specific disclosure language satisfies Art. 13 for our AI use case — must we label every AI-generated output?"],
        note: `Art. 13: Transparency ${hasFullDisclosure ? "at point of use and documented" : hasPartialDisclosure ? "partially implemented" : "not found"}.`,
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
      // TIGHTENED: Require BOTH policy AND code signals (escalation/override implementation), not just policy
      const hasOversight = !!ev.questionnaire["q_human_oversight"];
      const hasProc = hasDoc(ev, "human oversight", "review process", "escalation", "human-in-the-loop", "approval", "intervention");
      // Code signals: check for escalation/override mechanisms (auth checks, conditional logic, approval workflows)
      const hasAuth = hasGitSignal(ev, "hasAuth");
      const hasInputValidation = hasGitSignal(ev, "hasInputValidation");

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

      const sources: string[] = [];
      if (hasOversight) sources.push("q_human_oversight");
      if (hasProc) sources.push("oversight_procedures");
      if (hasAuth) sources.push("GitHub: authentication/authorization for escalation");
      if (hasInputValidation) sources.push("GitHub: input validation for human review");

      const hasCodeSignals = hasAuth || hasInputValidation;

      return {
        status: hasOversight && hasProc && hasCodeSignals ? "PASS" : (hasOversight && hasProc) || (hasProc && hasCodeSignals) ? "PARTIAL" : "NO_EVIDENCE",
        confidence: hasOversight && hasProc && hasCodeSignals ? 0.95 : (hasOversight && hasProc) ? 0.6 : 0.3,
        evidenceUsed: sources,
        gaps: [
          ...(!hasProc ? ["No documented human oversight procedures"] : []),
          ...(!hasCodeSignals ? ["No implementation evidence for escalation/override mechanisms in codebase"] : []),
        ],
        remediations: [
          ...(!hasProc ? ["Document human oversight procedures: who reviews, approval workflow, escalation triggers, override mechanisms"] : []),
          ...(!hasCodeSignals ? ["Implement technical escalation/override mechanisms: approval queues, human review gates, authorization checks"] : []),
        ],
        lawyerQuestions: ["What level of human oversight satisfies Art. 14 — must every AI decision be human-reviewable, or only high-impact decisions?"],
        note: `Art. 14: Human oversight ${hasOversight && hasProc && hasCodeSignals ? "documented and implemented" : hasProc ? "policy documented but no implementation code signals" : "insufficient evidence"}.`,
      };
    },
  },
  {
    id: "EU_AI_006_quality_management",
    code: "AI-Art15",
    title: "Quality management and testing procedures",
    frameworks: ["EU_AI_ACT"],
    evidenceKeys: ["quality_management", "testing_procedures"],
    articleRefs: { EU_AI_ACT: "Art. 15" },
    check: (ev) => {
      if (!ev.onboarding.usesAI) {
        return {
          status: "PASS",
          confidence: 0.85,
          evidenceUsed: [],
          gaps: [],
          remediations: [],
          lawyerQuestions: [],
          note: "Company does not use AI — Art. 15 quality management not applicable.",
        };
      }

      const hasQualityDoc = hasDoc(ev, "quality management", "testing", "qa", "validation", "accuracy");
      // GitHub: CI/CD, tests, code scanning, branch protection = quality management evidence
      const hasCI = hasGitSignal(ev, "hasCI");
      const hasTests = hasGitSignal(ev, "hasTests");
      const hasCodeScan = hasGitSignal(ev, "hasCodeScanning");
      const hasDependabot = hasGitSignal(ev, "hasDependabot");
      const hasBranchProt = hasGitSignal(ev, "hasBranchProtection");

      const codeQualityCount = [hasCI, hasTests, hasCodeScan, hasDependabot, hasBranchProt].filter(Boolean).length;

      const sources: string[] = [];
      if (hasQualityDoc) sources.push("quality_management");
      if (hasCI) sources.push("GitHub: CI/CD pipelines");
      if (hasTests) sources.push("GitHub: automated tests");
      if (hasCodeScan) sources.push("GitHub: code scanning");
      if (hasDependabot) sources.push("GitHub: Dependabot");
      if (hasBranchProt) sources.push("GitHub: branch protection");

      if (hasQualityDoc && codeQualityCount >= 2) {
        return {
          status: "PASS",
          confidence: 0.9,
          evidenceUsed: sources,
          gaps: [],
          remediations: [],
          lawyerQuestions: [],
          note: `Strong quality management: documented procedures + ${codeQualityCount} automated quality measures in codebase.`,
        };
      }
      if (codeQualityCount >= 3) {
        return {
          status: "PARTIAL",
          confidence: 0.7,
          evidenceUsed: sources,
          gaps: ["Code quality measures exist but no formal quality management document"],
          remediations: ["Document your quality management system formally, referencing your existing CI/CD, testing, and review processes"],
          lawyerQuestions: [],
          note: `${codeQualityCount} quality measures detected in code. Formal documentation would complete Art. 15.`,
        };
      }
      if (hasQualityDoc || codeQualityCount > 0) {
        return {
          status: "PARTIAL",
          confidence: 0.5,
          evidenceUsed: sources,
          gaps: [
            ...(!hasQualityDoc ? ["No formal quality management document"] : []),
            ...(!hasTests ? ["No automated testing detected"] : []),
            ...(!hasCI ? ["No CI/CD pipeline detected"] : []),
          ],
          remediations: ["Implement automated testing, CI/CD pipelines, and document your quality management system"],
          lawyerQuestions: ["What testing and validation standards apply under Art. 15 for our AI system risk level?"],
          note: "Partial quality management evidence found.",
        };
      }

      return {
        status: "NO_EVIDENCE",
        confidence: 0.15,
        evidenceUsed: [],
        gaps: ["No quality management documentation or automated quality measures detected"],
        remediations: ["Establish a quality management system with automated testing, CI/CD, code review, and documentation"],
        lawyerQuestions: ["What testing and validation standards apply under Art. 15 for our AI system risk level?"],
        note: "Art. 15 requires accuracy, robustness, and cybersecurity measures for AI systems.",
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
