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
      const hasRiskDoc = ev.documents.some((d) =>
        d.text.toLowerCase().includes("risk classification") || d.fileName.toLowerCase().includes("risk")
      );
      return {
        status: hasClassification ? (hasRiskDoc ? "PASS" : "PARTIAL") : "NO_EVIDENCE",
        confidence: hasClassification && hasRiskDoc ? 0.9 : hasClassification ? 0.6 : 0.2,
        evidenceUsed: [hasClassification ? "q_risk_classification" : "", hasRiskDoc ? "risk_assessment_doc" : ""].filter(Boolean),
        gaps: hasRiskDoc ? [] : ["No formal risk classification document found"],
        remediations: hasRiskDoc ? [] : ["Document your AI system's risk level per Art. 6 Annex III criteria"],
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
      // GitHub: check for architecture docs, README, and doc files
      const repoHasArchDocs = hasGitSignal(ev, "hasArchitectureDocs");
      const repoHasReadme = hasGitSignal(ev, "hasReadme");
      const gh = ev.codeSignals?.github as Record<string, unknown> | undefined;
      const repoDocCount = (gh?.docCount as number) ?? 0;

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

      const hasAnyTechDoc = hasTechDoc || repoHasArchDocs;
      const sources: string[] = [];
      if (hasTechDoc) sources.push("technical_doc");
      if (repoHasArchDocs) sources.push("GitHub: architecture docs");
      if (repoHasReadme) sources.push("GitHub: README");

      if (hasAnyTechDoc) {
        return {
          status: hasTechDoc ? "PASS" : "PARTIAL",
          confidence: hasTechDoc ? 0.85 : 0.6,
          evidenceUsed: sources,
          gaps: hasTechDoc ? [] : ["Architecture docs found in repo but formal Art. 11 documentation needed"],
          remediations: hasTechDoc ? [] : ["Expand existing docs into full Annex IV technical documentation including training data, architecture, and performance metrics"],
          lawyerQuestions: ["What specific information must our technical documentation contain per Art. 11 and Annex IV given our system type?"],
          note: `Technical documentation ${hasTechDoc ? "found" : "partially available from repo (architecture docs detected)"}.`,
        };
      }

      return {
        status: "FAIL",
        confidence: 0.9,
        evidenceUsed: sources,
        gaps: ["High-risk AI system lacks Art. 11 technical documentation"],
        remediations: ["Create Annex IV technical documentation including system description, training data, architecture, and performance metrics"],
        lawyerQuestions: ["What specific information must our technical documentation contain per Art. 11 and Annex IV given our system type?"],
        note: `High-risk AI: technical documentation missing.${repoDocCount > 0 ? ` (${repoDocCount} doc files in repo, but none cover Art. 11 requirements)` : ""}`,
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
      const hasTransparency = hasDoc(ev, "ai disclosure", "automated", "ai-assisted", "transparency");
      const hasUserDoc = hasDoc(ev, "user guide", "user manual", "instructions for use");
      // GitHub: README and API docs can serve as user documentation
      const repoHasReadme = hasGitSignal(ev, "hasReadme");
      const repoHasApiDocs = hasGitSignal(ev, "hasApiDocs");

      const hasAnyUserDoc = hasUserDoc || repoHasReadme || repoHasApiDocs;
      const sources: string[] = [];
      if (hasTransparency) sources.push("transparency_notice");
      if (hasUserDoc) sources.push("user_documentation");
      if (repoHasReadme) sources.push("GitHub: README");
      if (repoHasApiDocs) sources.push("GitHub: API documentation");

      return {
        status: hasTransparency && hasAnyUserDoc ? "PASS" : hasTransparency || hasAnyUserDoc ? "PARTIAL" : "NO_EVIDENCE",
        confidence: hasTransparency && hasAnyUserDoc ? 0.9 : hasTransparency || hasAnyUserDoc ? 0.5 : 0.2,
        evidenceUsed: sources,
        gaps: [
          ...(!hasTransparency ? ["No AI transparency disclosure found"] : []),
          ...(!hasAnyUserDoc ? ["No user documentation for AI system found"] : []),
        ],
        remediations: [
          ...(!hasTransparency ? ["Add clear disclosure that users are interacting with or being evaluated by an AI system"] : []),
          ...(!hasAnyUserDoc ? ["Create user-facing documentation explaining AI system capabilities and limitations"] : []),
        ],
        lawyerQuestions: ["What specific disclosures are required under Art. 13 for our AI system type and use case?"],
        note: hasTransparency || hasAnyUserDoc
          ? `Transparency evidence found${repoHasReadme || repoHasApiDocs ? " (including repo documentation)" : ""}.`
          : "Art. 13 requires transparent, understandable information about high-risk AI systems.",
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
