/**
 * Compliance Analyzer
 *
 * Takes raw site check results and uses Claude to produce a
 * structured compliance report from a user's perspective.
 *
 * This is the "brain" of the tester agent — it maps what the
 * headless browser observed to specific regulatory requirements.
 */

import { getAnthropicClient, AI_MODELS } from "@/lib/ai";
import type Anthropic from "@anthropic-ai/sdk";
import type {
  SiteCheckResults,
  ComplianceFinding,
  ComplianceCategory,
  TesterReport,
} from "@/types/tester";

/**
 * Run deterministic checks first (no LLM needed), then use Claude
 * to synthesize a final analysis and catch nuances.
 */
export async function analyzeCompliance(
  siteResults: SiteCheckResults,
  companyContext?: { name: string; industry: string; country: string }
): Promise<TesterReport> {
  // Phase 1: Deterministic findings (fast, reliable)
  const deterministicFindings = runDeterministicChecks(siteResults);

  // Phase 2: Claude synthesis (catches nuances, generates summary)
  const llmFindings = await runLLMAnalysis(siteResults, deterministicFindings, companyContext);

  // Merge: deterministic findings take precedence, LLM adds extras
  const allFindings = mergeFindingsUnique(deterministicFindings, llmFindings.additionalFindings);

  // Score by category
  const categories = scoreByCategory(allFindings);
  const overallScore = calculateOverallScore(categories);

  return {
    url: siteResults.url,
    testedAt: new Date().toISOString(),
    overallScore,
    findings: allFindings,
    summary: llmFindings.summary,
    categories,
  };
}

/* ── Phase 1: Deterministic Checks ─────────────────────────────────── */

function runDeterministicChecks(site: SiteCheckResults): ComplianceFinding[] {
  const findings: ComplianceFinding[] = [];

  // ── HTTPS ──
  findings.push({
    category: "security",
    check: "HTTPS enforcement",
    status: site.httpsEnforced ? "PASS" : "FAIL",
    detail: site.httpsEnforced
      ? "Site is served over HTTPS with TLS encryption."
      : "Site is not served over HTTPS. All data transmission is unencrypted.",
    severity: site.httpsEnforced ? "info" : "critical",
    articleRefs: ["GDPR Art. 32", "GDPR Art. 5(1)(f)"],
  });

  // ── Security Headers ──
  const sh = site.securityHeaders;
  const headerCount = [sh.hasHSTS, sh.hasCSP, sh.hasXFrameOptions, sh.hasXContentTypeOptions, sh.hasReferrerPolicy]
    .filter(Boolean).length;

  findings.push({
    category: "security",
    check: "Security headers",
    status: headerCount >= 3 ? "PASS" : headerCount >= 1 ? "WARN" : "FAIL",
    detail: `${headerCount}/5 security headers present. `
      + (!sh.hasHSTS ? "Missing: HSTS. " : "")
      + (!sh.hasCSP ? "Missing: Content-Security-Policy. " : "")
      + (!sh.hasXFrameOptions ? "Missing: X-Frame-Options. " : "")
      + (!sh.hasXContentTypeOptions ? "Missing: X-Content-Type-Options. " : "")
      + (!sh.hasReferrerPolicy ? "Missing: Referrer-Policy. " : ""),
    severity: headerCount >= 3 ? "low" : headerCount >= 1 ? "medium" : "high",
    articleRefs: ["GDPR Art. 32", "NIS2 Art. 21"],
  });

  // ── Cookie Banner ──
  if (site.thirdPartyTrackers.consentRequired) {
    if (!site.cookieBanner.found) {
      findings.push({
        category: "consent",
        check: "Cookie consent banner",
        status: "FAIL",
        detail: `Trackers detected (${site.thirdPartyTrackers.trackersFound.join(", ")}) but no cookie consent banner was found. GDPR requires explicit consent before non-essential cookies.`,
        severity: "critical",
        articleRefs: ["GDPR Art. 6", "GDPR Art. 7", "ePrivacy Directive Art. 5(3)"],
      });
    } else {
      findings.push({
        category: "consent",
        check: "Cookie consent banner",
        status: "PASS",
        detail: "Cookie consent banner is present.",
        severity: "info",
        articleRefs: ["GDPR Art. 6", "GDPR Art. 7"],
      });

      // Reject option
      findings.push({
        category: "consent",
        check: "Cookie reject option",
        status: site.cookieBanner.hasRejectOption ? "PASS" : "FAIL",
        detail: site.cookieBanner.hasRejectOption
          ? "Users can reject non-essential cookies."
          : "No clear 'reject' or 'decline' option found. GDPR requires refusing cookies to be as easy as accepting them.",
        severity: site.cookieBanner.hasRejectOption ? "info" : "high",
        articleRefs: ["GDPR Art. 7(3)", "EDPB Guidelines 05/2020"],
      });

      // Pre-checked boxes
      if (site.cookieBanner.preCheckedBoxes) {
        findings.push({
          category: "consent",
          check: "Pre-checked consent boxes",
          status: "FAIL",
          detail: "Cookie banner has pre-checked checkboxes. The CJEU ruled in Planet49 that pre-checked boxes do not constitute valid consent.",
          severity: "high",
          articleRefs: ["GDPR Art. 4(11)", "CJEU C-673/17 (Planet49)"],
        });
      }
    }
  } else if (site.cookieBanner.found) {
    findings.push({
      category: "consent",
      check: "Cookie consent banner",
      status: "PASS",
      detail: "Cookie consent banner present even without detectable trackers — good practice.",
      severity: "info",
      articleRefs: ["GDPR Art. 6"],
    });
  } else {
    findings.push({
      category: "consent",
      check: "Cookie consent banner",
      status: "PASS",
      detail: "No third-party trackers detected — a cookie banner may not be strictly required.",
      severity: "info",
      articleRefs: ["ePrivacy Directive Art. 5(3)"],
    });
  }

  // ── Privacy Policy ──
  findings.push({
    category: "privacy",
    check: "Privacy policy accessibility",
    status: site.privacyPolicy.found ? "PASS" : "FAIL",
    detail: site.privacyPolicy.found
      ? `Privacy policy found at ${site.privacyPolicy.url} (${site.privacyPolicy.contentLength} words).`
      : "No privacy policy link found on the homepage or in the footer. GDPR Art. 13 requires a clear, accessible privacy notice.",
    severity: site.privacyPolicy.found ? "info" : "critical",
    articleRefs: ["GDPR Art. 13", "GDPR Art. 14"],
  });

  if (site.privacyPolicy.found && site.privacyPolicy.contentLength < 100) {
    findings.push({
      category: "privacy",
      check: "Privacy policy substance",
      status: "WARN",
      detail: `Privacy policy page has only ${site.privacyPolicy.contentLength} words. This seems too short to cover all required GDPR disclosures (purposes, legal basis, retention, rights, etc.).`,
      severity: "medium",
      articleRefs: ["GDPR Art. 13"],
    });
  }

  // ── Terms of Service ──
  findings.push({
    category: "transparency",
    check: "Terms of service",
    status: site.termsOfService.found ? "PASS" : "WARN",
    detail: site.termsOfService.found
      ? `Terms of service found at ${site.termsOfService.url}.`
      : "No terms of service link found. While not strictly required by GDPR, ToS are important for legal clarity.",
    severity: site.termsOfService.found ? "info" : "medium",
    articleRefs: [],
  });

  // ── Data Collection Forms ──
  if (site.dataCollection.formsFound > 0) {
    for (const form of site.dataCollection.forms) {
      const piiFields = form.fields.filter((f) => f.isPII);
      if (piiFields.length > 0) {
        findings.push({
          category: "data_collection",
          check: "PII collection transparency",
          status: form.hasPrivacyNotice ? "PASS" : "FAIL",
          detail: form.hasPrivacyNotice
            ? `Form collects PII (${piiFields.map((f) => f.label || f.name).join(", ")}) with a privacy notice present.`
            : `Form collects PII (${piiFields.map((f) => f.label || f.name).join(", ")}) without any visible privacy notice or data usage explanation.`,
          severity: form.hasPrivacyNotice ? "info" : "high",
          articleRefs: ["GDPR Art. 13(1)", "GDPR Art. 5(1)(a)"],
        });

        if (!form.hasConsentCheckbox && piiFields.some((f) => PII_NEEDS_CONSENT.has(f.type))) {
          findings.push({
            category: "data_collection",
            check: "Consent checkbox for PII",
            status: "WARN",
            detail: `Form collects sensitive-adjacent data but has no explicit consent checkbox. Consider whether consent is the appropriate legal basis.`,
            severity: "medium",
            articleRefs: ["GDPR Art. 6(1)(a)", "GDPR Art. 7"],
          });
        }
      }
    }
  }

  // ── Third-Party Trackers ──
  if (site.thirdPartyTrackers.trackersFound.length > 0) {
    findings.push({
      category: "third_party",
      check: "Third-party trackers",
      status: "WARN",
      detail: `Detected ${site.thirdPartyTrackers.trackersFound.length} third-party tracker(s): ${site.thirdPartyTrackers.trackersFound.join(", ")}. Each requires a lawful basis under GDPR.`,
      severity: "medium",
      articleRefs: ["GDPR Art. 6", "GDPR Art. 28", "ePrivacy Directive Art. 5(3)"],
    });
  } else {
    findings.push({
      category: "third_party",
      check: "Third-party trackers",
      status: "PASS",
      detail: "No third-party trackers detected in network requests.",
      severity: "info",
      articleRefs: [],
    });
  }

  // ── User Rights ──
  findings.push({
    category: "user_rights",
    check: "Account deletion option",
    status: site.userRights.hasAccountDeletion ? "PASS" : "WARN",
    detail: site.userRights.hasAccountDeletion
      ? "Account deletion option detected."
      : "No visible account deletion option found. GDPR Art. 17 gives users the right to erasure.",
    severity: site.userRights.hasAccountDeletion ? "info" : "medium",
    articleRefs: ["GDPR Art. 17"],
  });

  findings.push({
    category: "user_rights",
    check: "Data export option",
    status: site.userRights.hasDataExport ? "PASS" : "WARN",
    detail: site.userRights.hasDataExport
      ? "Data export/portability option detected."
      : "No visible data export option found. GDPR Art. 20 gives users the right to data portability.",
    severity: site.userRights.hasDataExport ? "info" : "medium",
    articleRefs: ["GDPR Art. 20"],
  });

  return findings;
}

const PII_NEEDS_CONSENT = new Set(["email", "phone", "dob", "ssn", "credit_card"]);

/* ── Phase 2: LLM Synthesis ────────────────────────────────────────── */

async function runLLMAnalysis(
  site: SiteCheckResults,
  deterministicFindings: ComplianceFinding[],
  companyContext?: { name: string; industry: string; country: string }
): Promise<{ summary: string; additionalFindings: ComplianceFinding[] }> {
  const client = getAnthropicClient();

  const findingsSummary = deterministicFindings
    .map((f) => `[${f.status}] ${f.check}: ${f.detail}`)
    .join("\n");

  const prompt = `You are a compliance expert analyzing a live website from a user's perspective.

## Site: ${site.url}
${companyContext ? `Company: ${companyContext.name} (${companyContext.industry}, ${companyContext.country})` : ""}

## What our automated scanner found:
${findingsSummary}

## Additional raw data:
- Cookie banner text: "${site.cookieBanner.bannerText || "none"}"
- Trackers: ${site.thirdPartyTrackers.trackersFound.join(", ") || "none"}
- Forms found: ${site.dataCollection.formsFound}
- HTTPS: ${site.httpsEnforced}
- Security headers: HSTS=${site.securityHeaders.hasHSTS}, CSP=${site.securityHeaders.hasCSP}

## Your task:
1. Write a concise plain-language summary (3-5 sentences) of the user-facing compliance posture. Write as if explaining to a startup founder what a first-time visitor would notice. Be direct and specific.

2. Identify up to 3 ADDITIONAL compliance issues our automated checks might have missed — things that require human/LLM judgment. For example: misleading consent UX patterns (dark patterns), unclear language in cookie banners, or implicit data collection.

Respond with a JSON object:
{
  "summary": "<your plain-language summary>",
  "additionalFindings": [
    {
      "category": "consent" | "privacy" | "data_collection" | "security" | "transparency" | "user_rights" | "third_party",
      "check": "<what you checked>",
      "status": "PASS" | "FAIL" | "WARN",
      "detail": "<specific finding>",
      "severity": "critical" | "high" | "medium" | "low" | "info",
      "articleRefs": ["<article references>"]
    }
  ]
}

Return ONLY the JSON, no markdown fencing.`;

  try {
    const res = await client.messages.create({
      model: AI_MODELS.FAST,
      max_tokens: 1500,
      messages: [{ role: "user", content: prompt }],
    });

    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    const match = text.match(/\{[\s\S]*\}/);
    if (!match) {
      return { summary: generateFallbackSummary(deterministicFindings, site), additionalFindings: [] };
    }

    const parsed = JSON.parse(match[0]);
    return {
      summary: parsed.summary ?? generateFallbackSummary(deterministicFindings, site),
      additionalFindings: (parsed.additionalFindings ?? []) as ComplianceFinding[],
    };
  } catch (err) {
    console.error("Tester agent LLM analysis failed:", err);
    return { summary: generateFallbackSummary(deterministicFindings, site), additionalFindings: [] };
  }
}

/* ── Helpers ────────────────────────────────────────────────────────── */

function generateFallbackSummary(findings: ComplianceFinding[], site: SiteCheckResults): string {
  const fails = findings.filter((f) => f.status === "FAIL");
  const warns = findings.filter((f) => f.status === "WARN");
  const passes = findings.filter((f) => f.status === "PASS");

  if (fails.length === 0 && warns.length === 0) {
    return `${site.url} looks good from a user's perspective. All ${passes.length} compliance checks passed. No immediate issues spotted.`;
  }

  return `${site.url} has ${fails.length} compliance issue${fails.length !== 1 ? "s" : ""} and ${warns.length} warning${warns.length !== 1 ? "s" : ""}. `
    + (fails.length > 0 ? `Critical: ${fails.map((f) => f.check).join(", ")}. ` : "")
    + (warns.length > 0 ? `Needs attention: ${warns.map((f) => f.check).join(", ")}.` : "");
}

function mergeFindingsUnique(
  primary: ComplianceFinding[],
  secondary: ComplianceFinding[]
): ComplianceFinding[] {
  const existing = new Set(primary.map((f) => f.check));
  const extra = secondary.filter((f) => !existing.has(f.check));
  return [...primary, ...extra];
}

function scoreByCategory(
  findings: ComplianceFinding[]
): Record<ComplianceCategory, { score: number; findings: ComplianceFinding[] }> {
  const categories: ComplianceCategory[] = [
    "consent", "privacy", "data_collection", "security", "transparency", "user_rights", "third_party",
  ];

  const result: Record<string, { score: number; findings: ComplianceFinding[] }> = {};

  for (const cat of categories) {
    const catFindings = findings.filter((f) => f.category === cat);

    if (catFindings.length === 0) {
      result[cat] = { score: 100, findings: [] };
      continue;
    }

    // Score: PASS=100, WARN=50, FAIL=0, NOT_APPLICABLE=excluded
    const applicable = catFindings.filter((f) => f.status !== "NOT_APPLICABLE");
    if (applicable.length === 0) {
      result[cat] = { score: 100, findings: catFindings };
      continue;
    }

    const total = applicable.reduce((sum, f) => {
      if (f.status === "PASS") return sum + 100;
      if (f.status === "WARN") return sum + 50;
      return sum;
    }, 0);

    result[cat] = {
      score: Math.round(total / applicable.length),
      findings: catFindings,
    };
  }

  return result as Record<ComplianceCategory, { score: number; findings: ComplianceFinding[] }>;
}

function calculateOverallScore(
  categories: Record<ComplianceCategory, { score: number; findings: ComplianceFinding[] }>
): number {
  // Weight categories by importance
  const weights: Record<ComplianceCategory, number> = {
    consent: 20,
    privacy: 25,
    data_collection: 15,
    security: 15,
    transparency: 10,
    user_rights: 10,
    third_party: 5,
  };

  let weightedSum = 0;
  let totalWeight = 0;

  for (const [cat, weight] of Object.entries(weights)) {
    const catData = categories[cat as ComplianceCategory];
    if (catData.findings.length > 0) {
      weightedSum += catData.score * weight;
      totalWeight += weight;
    }
  }

  return totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 100;
}
