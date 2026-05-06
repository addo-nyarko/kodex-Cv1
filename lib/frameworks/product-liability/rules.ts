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

export const productLiabilityRules: ControlRule[] = [
  {
    id: "PLD_Art6_no_defects",
    code: "PLD-Art6",
    title: "Product safety and defect prevention",
    frameworks: ["PRODUCT_LIABILITY"],
    evidenceKeys: ["product_safety", "defect_prevention", "quality_assurance"],
    articleRefs: { PRODUCT_LIABILITY: "Art. 6" },
    check: (ev) => {
      const hasSafetyDoc = hasDoc(ev, "product safety", "quality assurance", "defect", "safety testing", "acceptance testing", "qa process");
      const hasTests = hasGitSignal(ev, "hasTests");
      const hasCI = hasGitSignal(ev, "hasCI");
      const hasCodeScanning = hasGitSignal(ev, "hasCodeScanning");

      const techCount = [hasTests, hasCI, hasCodeScanning].filter(Boolean).length;
      const sources: string[] = [];
      if (hasSafetyDoc) sources.push("product_safety_documentation");
      if (hasTests) sources.push("GitHub: automated tests");
      if (hasCI) sources.push("GitHub: CI/CD pipeline");
      if (hasCodeScanning) sources.push("GitHub: code scanning");

      if (hasSafetyDoc && techCount >= 2) {
        return { status: "PASS", confidence: 0.9, evidenceUsed: sources, gaps: [], remediations: [], lawyerQuestions: [], note: `Product safety: documented QA process + ${techCount} automated quality controls.` };
      }
      if (techCount >= 2) {
        return { status: "PARTIAL", confidence: 0.6, evidenceUsed: sources, gaps: ["Technical quality controls found but no formal product safety/defect prevention policy"], remediations: ["Document your QA process, acceptance criteria, and how you ensure no defects at release"], lawyerQuestions: [], note: `${techCount} quality controls detected.` };
      }
      return { status: "NO_EVIDENCE", confidence: 0.2, evidenceUsed: [], gaps: ["No product safety or quality assurance evidence found"], remediations: ["Implement and document QA processes: automated testing, code review, acceptance criteria, and defect tracking"], lawyerQuestions: ["Under PLD Art. 6, what factors determine whether a digital product (software/AI) is considered defective?"], note: "PLD Art. 6 defines a product as defective if it does not provide expected safety — applies to software and AI systems under the 2024 directive." };
    },
  },
  {
    id: "PLD_Art10_technical_documentation",
    code: "PLD-Art10",
    title: "Technical documentation and product information",
    frameworks: ["PRODUCT_LIABILITY"],
    evidenceKeys: ["technical_documentation", "product_documentation"],
    articleRefs: { PRODUCT_LIABILITY: "Art. 10" },
    check: (ev) => {
      const hasTechDoc = hasDoc(ev, "technical documentation", "product specification", "system architecture");
      const hasPerformanceDoc = hasDoc(ev, "performance", "testing", "test results", "conformity");
      const hasLimitationsDoc = hasDoc(ev, "limitations", "known issues", "constraints", "intended use");
      const hasReadme = hasGitSignal(ev, "hasReadme");
      const hasArchDocs = hasGitSignal(ev, "hasArchitectureDocs");
      const gh = ev.codeSignals?.github as Record<string, unknown> | undefined;
      const docCount = (gh?.docCount as number) ?? 0;

      const sources: string[] = [];
      if (hasTechDoc) sources.push("technical_documentation");
      if (hasPerformanceDoc) sources.push("performance_testing_documentation");
      if (hasLimitationsDoc) sources.push("product_limitations_documentation");
      if (hasReadme) sources.push("GitHub: README");
      if (hasArchDocs) sources.push("GitHub: architecture documentation");
      if (docCount > 2) sources.push(`GitHub: ${docCount} documentation files`);

      const componentCount = [hasTechDoc, hasPerformanceDoc, hasLimitationsDoc].filter(Boolean).length;
      const hasCodeDocs = hasReadme || hasArchDocs || docCount > 2;

      return {
        status: componentCount >= 3 || (componentCount >= 2 && hasCodeDocs) ? "PASS" : (componentCount >= 1 || hasCodeDocs) ? "PARTIAL" : "NO_EVIDENCE",
        confidence: componentCount >= 3 ? 0.9 : (componentCount >= 2) ? 0.65 : componentCount >= 1 ? 0.45 : 0.2,
        evidenceUsed: sources,
        gaps: componentCount >= 3 ? [] : [
          ...(!hasTechDoc ? ["Product specifications/architecture not documented"] : []),
          ...(!hasPerformanceDoc ? ["Performance/testing evidence not documented"] : []),
          ...(!hasLimitationsDoc ? ["Known limitations and intended use not documented"] : [])
        ],
        remediations: ["Maintain technical documentation with three components: (1) product specifications and architecture, (2) testing and performance evidence, (3) known limitations and intended use"],
        lawyerQuestions: ["Does PLD Art. 10 require us to retain technical documentation for a specific period, and what format is expected for software products?"],
        note: componentCount >= 3 ? "Complete technical documentation (3/3 components) verified." : componentCount >= 1 ? `Partial documentation: ${componentCount}/3 components found.` : "PLD Art. 10 requires claimants to have access to technical documentation — producers should maintain this proactively.",
      };
    },
  },
  {
    id: "PLD_Art7_warnings_instructions",
    code: "PLD-Art7",
    title: "User instructions and safety warnings",
    frameworks: ["PRODUCT_LIABILITY"],
    evidenceKeys: ["user_instructions", "safety_warnings", "user_documentation"],
    articleRefs: { PRODUCT_LIABILITY: "Art. 7" },
    check: (ev) => {
      const hasUserDoc = hasDoc(ev, "user guide", "user manual", "instructions", "warnings", "limitations", "terms of service", "terms of use");
      const hasReadme = hasGitSignal(ev, "hasReadme");
      const hasApiDocs = hasGitSignal(ev, "hasApiDocs");

      const sources: string[] = [];
      if (hasUserDoc) sources.push("user_documentation");
      if (hasReadme) sources.push("GitHub: README");
      if (hasApiDocs) sources.push("GitHub: API documentation");

      const hasEvidence = hasUserDoc || hasReadme || hasApiDocs;

      return {
        status: hasUserDoc ? "PASS" : hasEvidence ? "PARTIAL" : "NO_EVIDENCE",
        confidence: hasUserDoc ? 0.85 : hasEvidence ? 0.55 : 0.2,
        evidenceUsed: sources,
        gaps: hasUserDoc ? [] : ["No user instructions or safety warnings documentation found"],
        remediations: ["Create user-facing documentation covering: intended use, operating instructions, known limitations, safety warnings, and contraindications"],
        lawyerQuestions: ["For AI-powered products, must warnings explicitly disclose AI involvement and associated risks of incorrect outputs under the PLD?"],
        note: hasUserDoc ? "User instructions found." : "PLD requires adequate warnings and instructions — absence can be evidence of defect.",
      };
    },
  },
  {
    id: "PLD_traceability",
    code: "PLD-Traceability",
    title: "Product traceability and version identification",
    frameworks: ["PRODUCT_LIABILITY"],
    evidenceKeys: ["product_traceability", "version_control"],
    articleRefs: { PRODUCT_LIABILITY: "Art. 8" },
    check: (ev) => {
      const hasTraceDoc = hasDoc(ev, "traceability", "version control", "release notes", "changelog", "product identification", "versioning");
      const hasCI = hasGitSignal(ev, "hasCI");
      const hasBranchProt = hasGitSignal(ev, "hasBranchProtection");
      const gh = ev.codeSignals?.github as Record<string, unknown> | undefined;
      const hasRepo = !!gh?.repo;

      const sources: string[] = [];
      if (hasTraceDoc) sources.push("version_traceability_documentation");
      if (hasCI) sources.push("GitHub: CI/CD with tagged releases");
      if (hasBranchProt) sources.push("GitHub: branch protection rules");
      if (hasRepo) sources.push("GitHub: version-controlled codebase");

      const techCount = [hasCI, hasBranchProt, hasRepo].filter(Boolean).length;

      return {
        status: hasTraceDoc && techCount >= 1 ? "PASS" : hasTraceDoc || techCount >= 2 ? "PARTIAL" : "NO_EVIDENCE",
        confidence: hasTraceDoc && techCount >= 1 ? 0.85 : techCount >= 2 ? 0.6 : 0.3,
        evidenceUsed: sources,
        gaps: hasTraceDoc ? [] : ["No formal product traceability or version identification documentation"],
        remediations: ["Implement semantic versioning, maintain a changelog, and ensure product versions are clearly identifiable in deployments and user interfaces"],
        lawyerQuestions: ["Under the PLD, what information must be retained to establish which product version was in use at the time of an alleged defect?"],
        note: "Version control and traceability are essential for establishing product state at time of claimed damage.",
      };
    },
  },
  {
    id: "PLD_post_market_monitoring",
    code: "PLD-PostMarket",
    title: "Post-market surveillance and incident tracking",
    frameworks: ["PRODUCT_LIABILITY"],
    evidenceKeys: ["post_market_surveillance", "product_monitoring"],
    articleRefs: { PRODUCT_LIABILITY: "Art. 10" },
    check: (ev) => {
      const hasMonitoringDoc = hasDoc(ev, "post-market", "post market", "product monitoring", "user feedback", "bug tracking", "issue tracking", "defect reporting");
      const hasLogging = hasGitSignal(ev, "hasLogging");
      const hasCI = hasGitSignal(ev, "hasCI");

      const sources: string[] = [];
      if (hasMonitoringDoc) sources.push("post_market_surveillance_procedure");
      if (hasLogging) sources.push("GitHub: application monitoring/logging");
      if (hasCI) sources.push("GitHub: CI/CD deployment tracking");

      return {
        status: hasMonitoringDoc ? "PASS" : hasLogging ? "PARTIAL" : "NO_EVIDENCE",
        confidence: hasMonitoringDoc ? 0.85 : hasLogging ? 0.5 : 0.2,
        evidenceUsed: sources,
        gaps: hasMonitoringDoc ? [] : ["No post-market surveillance or product issue monitoring process documented"],
        remediations: ["Implement a post-market surveillance process: monitor for defects/incidents, maintain user feedback channels, document corrective actions and recalls"],
        lawyerQuestions: ["What post-market surveillance obligations apply to us under the PLD for AI-enabled products, and how do they interact with the EU AI Act Art. 72?"],
        note: hasMonitoringDoc ? "Post-market monitoring found." : "Proactive post-market monitoring reduces liability exposure by enabling timely corrective action.",
      };
    },
  },
  {
    id: "PLD_liability_limitation",
    code: "PLD-LiabilityMgmt",
    title: "Liability risk management and legal protections",
    frameworks: ["PRODUCT_LIABILITY"],
    evidenceKeys: ["liability_limitation", "terms_of_service", "insurance"],
    articleRefs: { PRODUCT_LIABILITY: "Art. 14" },
    check: (ev) => {
      const hasToS = hasDoc(ev, "terms of service", "terms and conditions", "terms of use");
      const hasLiabilityLimit = hasDoc(ev, "limitation of liability", "disclaimer", "as-is", "no warranty", "indemnification");
      const hasPrivacyPolicy = hasDoc(ev, "privacy policy");
      const gh = ev.codeSignals?.github as Record<string, unknown> | undefined;
      const hasRepoPrivacy = !!gh?.hasPrivacyPolicy;

      const sources: string[] = [];
      if (hasToS) sources.push("terms_of_service");
      if (hasLiabilityLimit) sources.push("liability_limitation_clause");
      if (hasPrivacyPolicy || hasRepoPrivacy) sources.push("privacy_policy");

      return {
        status: hasToS && hasLiabilityLimit ? "PASS" : hasToS ? "PARTIAL" : hasPrivacyPolicy ? "PARTIAL" : "FAIL",
        confidence: hasToS && hasLiabilityLimit ? 0.85 : hasToS ? 0.6 : 0.2,
        evidenceUsed: sources,
        gaps: [
          ...(!hasToS ? ["No terms of service document found"] : []),
          ...(hasToS && !hasLiabilityLimit ? ["Terms of service exists but explicit liability limitation clauses not found"] : [])
        ],
        remediations: ["Publish comprehensive terms of service with explicit liability limitation clauses; consult legal counsel on PLD 2024-compliant disclaimers for software and AI products"],
        lawyerQuestions: ["Are limitation of liability clauses in our ToS enforceable against consumers under the PLD 2024, given the directive's non-derogation principle?"],
        note: hasToS && hasLiabilityLimit ? "ToS with liability limitations verified." : hasToS ? "ToS exists but explicit liability limitation clauses missing." : "Well-drafted ToS with liability disclaimers are a key layer of liability protection.",
      };
    },
  },
];
