/**
 * GitHub Repository Scanner for Compliance Signals
 *
 * Scans a GitHub repo for:
 * 1. Security patterns — auth, encryption, input validation, logging, error handling
 * 2. Documentation — README, SECURITY.md, CONTRIBUTING, architecture docs
 * 3. CI/CD config — GitHub Actions, Dependabot, branch protection, code scanning
 *
 * Returns structured ComplianceSignals that feed into the policy generator
 * to make generated documents reference actual implementation details.
 */

export interface GitHubCredentials {
  accessToken: string;
  owner: string;
  repo: string;
}

export interface ComplianceSignals {
  scannedAt: string;
  repo: string;
  security: SecuritySignals;
  documentation: DocumentationSignals;
  cicd: CICDSignals;
  summary: string;
}

export interface SecuritySignals {
  hasAuthMiddleware: boolean;
  authPatterns: string[];
  hasEncryption: boolean;
  encryptionDetails: string[];
  hasInputValidation: boolean;
  validationLibraries: string[];
  hasLogging: boolean;
  loggingDetails: string[];
  hasErrorHandling: boolean;
  errorHandlingPatterns: string[];
  hasRateLimiting: boolean;
  hasCSRFProtection: boolean;
  hasHelmetOrSecurityHeaders: boolean;
  sensitiveDataExposure: string[];
  findings: string[];
}

export interface DocumentationSignals {
  hasReadme: boolean;
  readmeLength: number;
  hasSecurityMd: boolean;
  securityMdContent: string;
  hasContributing: boolean;
  hasChangelog: boolean;
  hasLicense: boolean;
  licenseType: string;
  hasArchitectureDocs: boolean;
  hasApiDocs: boolean;
  hasPrivacyPolicy: boolean;
  docFiles: string[];
  findings: string[];
}

export interface CICDSignals {
  hasGitHubActions: boolean;
  workflows: string[];
  hasDependabot: boolean;
  hasCodeScanning: boolean;
  hasSecretScanning: boolean;
  hasBranchProtection: boolean;
  branchProtectionRules: string[];
  hasTestWorkflow: boolean;
  hasLintWorkflow: boolean;
  hasDeployWorkflow: boolean;
  findings: string[];
}

const GITHUB_API = "https://api.github.com";

async function ghFetch(path: string, token: string): Promise<Response> {
  return fetch(`${GITHUB_API}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "Kodex-Compliance-Scanner",
    },
  });
}

async function ghJson<T>(path: string, token: string): Promise<T | null> {
  const res = await ghFetch(path, token);
  if (!res.ok) return null;
  return res.json() as Promise<T>;
}

async function ghText(path: string, token: string): Promise<string | null> {
  const res = await fetch(`${GITHUB_API}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github.v3.raw",
      "User-Agent": "Kodex-Compliance-Scanner",
    },
  });
  if (!res.ok) return null;
  return res.text();
}

type TreeItem = { path: string; type: string };
type RepoInfo = { default_branch: string; private: boolean; language: string };
type WorkflowItem = { name: string; path: string };
type BranchProtection = { required_status_checks?: unknown; required_pull_request_reviews?: unknown; enforce_admins?: { enabled: boolean } };

/**
 * Scan a GitHub repo for compliance-relevant signals.
 */
export async function scanGitHubRepo(creds: GitHubCredentials): Promise<ComplianceSignals> {
  const { accessToken: token, owner, repo } = creds;
  const prefix = `/repos/${owner}/${repo}`;

  // Fetch repo info first so we know the default branch
  const repoInfo = await ghJson<RepoInfo>(`${prefix}`, token);
  const branch = repoInfo?.default_branch ?? "main";

  // Fetch file tree using the correct default branch
  const tree = await ghJson<{ tree: TreeItem[] }>(
    `${prefix}/git/trees/${branch}?recursive=1`, token
  ).catch(() => ghJson<{ tree: TreeItem[] }>(`${prefix}/git/trees/main?recursive=1`, token));

  const files = (tree?.tree ?? []).filter((t) => t.type === "blob").map((t) => t.path);

  // Run all scans in parallel
  const [security, documentation, cicd] = await Promise.all([
    scanSecurity(prefix, token, files),
    scanDocumentation(prefix, token, files),
    scanCICD(prefix, token, files, branch),
  ]);

  const findings = [...security.findings, ...documentation.findings, ...cicd.findings];
  const summary = buildSummary(security, documentation, cicd, `${owner}/${repo}`);

  return {
    scannedAt: new Date().toISOString(),
    repo: `${owner}/${repo}`,
    security,
    documentation,
    cicd,
    summary,
  };
}

/* ── Security Scanner ──────────────────────────────────────────── */

async function scanSecurity(prefix: string, token: string, files: string[]): Promise<SecuritySignals> {
  const findings: string[] = [];

  // Check for auth patterns
  const authFiles = files.filter((f) =>
    /auth|middleware|session|jwt|oauth|passport|clerk|nextauth/i.test(f)
  );
  const hasAuthMiddleware = authFiles.length > 0;
  const authPatterns: string[] = [];

  if (files.some((f) => /clerk/i.test(f))) authPatterns.push("Clerk authentication");
  if (files.some((f) => /nextauth|next-auth/i.test(f))) authPatterns.push("NextAuth.js");
  if (files.some((f) => /passport/i.test(f))) authPatterns.push("Passport.js");
  if (files.some((f) => /jwt|jsonwebtoken/i.test(f))) authPatterns.push("JWT tokens");
  if (files.some((f) => /oauth/i.test(f))) authPatterns.push("OAuth 2.0");
  if (files.some((f) => /middleware\.(ts|js)/i.test(f))) authPatterns.push("Route middleware");

  if (hasAuthMiddleware) {
    findings.push(`Authentication: Found ${authPatterns.join(", ")} in ${authFiles.length} files`);
  } else {
    findings.push("Authentication: No auth middleware detected — verify authentication approach");
  }

  // Check for encryption
  const hasEncryption = files.some((f) => /encrypt|crypto|vault|hash|bcrypt|argon/i.test(f));
  const encryptionDetails: string[] = [];
  if (files.some((f) => /bcrypt|argon/i.test(f))) encryptionDetails.push("Password hashing");
  if (files.some((f) => /encrypt|aes|crypto/i.test(f))) encryptionDetails.push("Data encryption");
  if (files.some((f) => /vault|secret/i.test(f))) encryptionDetails.push("Secrets management");

  // Check for input validation
  const hasInputValidation = files.some((f) => /valid|schema|sanitiz|zod|joi|yup/i.test(f));
  const validationLibraries: string[] = [];
  if (files.some((f) => /zod/i.test(f))) validationLibraries.push("Zod");
  if (files.some((f) => /joi/i.test(f))) validationLibraries.push("Joi");
  if (files.some((f) => /yup/i.test(f))) validationLibraries.push("Yup");

  // Check for logging
  const hasLogging = files.some((f) => /log|monitor|sentry|datadog|winston|pino/i.test(f));
  const loggingDetails: string[] = [];
  if (files.some((f) => /sentry/i.test(f))) loggingDetails.push("Sentry error tracking");
  if (files.some((f) => /datadog/i.test(f))) loggingDetails.push("Datadog monitoring");
  if (files.some((f) => /winston|pino|bunyan/i.test(f))) loggingDetails.push("Structured logging");

  // Check for error handling
  const hasErrorHandling = files.some((f) => /error|exception|handler/i.test(f));
  const errorHandlingPatterns: string[] = [];
  if (files.some((f) => /error.*boundary/i.test(f))) errorHandlingPatterns.push("Error boundaries");
  if (files.some((f) => /global.*error|error.*handler/i.test(f))) errorHandlingPatterns.push("Global error handler");

  // Check for rate limiting
  const hasRateLimiting = files.some((f) => /rate.*limit|throttl|upstash.*ratelimit/i.test(f));

  // Check for CSRF protection
  const hasCSRFProtection = files.some((f) => /csrf|csurf|xsrf/i.test(f));

  // Check for security headers
  const hasHelmetOrSecurityHeaders = files.some((f) => /helmet|security.*header|csp|content.*security/i.test(f));

  // Check for sensitive data exposure
  const sensitiveDataExposure: string[] = [];
  const envFiles = files.filter((f) => /\.env(?!\.example|\.sample)$/i.test(f) && !f.includes("gitignore"));
  if (envFiles.length > 0) {
    sensitiveDataExposure.push(`Found ${envFiles.length} .env files tracked in git`);
  }

  // Sample a few key files for deeper analysis
  const packageJson = await ghText(`${prefix}/contents/package.json`, token);
  if (packageJson) {
    try {
      const pkg = JSON.parse(packageJson);
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      if (deps["helmet"]) { encryptionDetails.push("Helmet security headers"); }
      if (deps["cors"]) { findings.push("CORS: cors package configured"); }
      if (deps["express-rate-limit"] || deps["@upstash/ratelimit"]) {
        findings.push("Rate limiting: rate limiter package installed");
      }
    } catch { /* ignore */ }
  }

  return {
    hasAuthMiddleware,
    authPatterns,
    hasEncryption,
    encryptionDetails,
    hasInputValidation,
    validationLibraries,
    hasLogging,
    loggingDetails,
    hasErrorHandling,
    errorHandlingPatterns,
    hasRateLimiting,
    hasCSRFProtection,
    hasHelmetOrSecurityHeaders,
    sensitiveDataExposure,
    findings,
  };
}

/* ── Documentation Scanner ─────────────────────────────────────── */

async function scanDocumentation(prefix: string, token: string, files: string[]): Promise<DocumentationSignals> {
  const findings: string[] = [];
  const lower = files.map((f) => f.toLowerCase());

  const hasReadme = lower.some((f) => f === "readme.md" || f === "readme.txt" || f === "readme");
  const hasSecurityMd = lower.some((f) => f === "security.md" || f === ".github/security.md");
  const hasContributing = lower.some((f) => f.includes("contributing"));
  const hasChangelog = lower.some((f) => f.includes("changelog") || f.includes("changes"));
  const hasLicense = lower.some((f) => f.startsWith("license"));
  const hasArchitectureDocs = lower.some((f) =>
    f.includes("architecture") || f.includes("design") || f.includes("adr") ||
    (f.includes("docs/") && f.endsWith(".md"))
  );
  const hasApiDocs = lower.some((f) =>
    f.includes("api") && (f.endsWith(".md") || f.endsWith(".yaml") || f.endsWith(".json")) ||
    f.includes("swagger") || f.includes("openapi")
  );
  const hasPrivacyPolicy = lower.some((f) => f.includes("privacy"));

  // Fetch README length
  let readmeLength = 0;
  const readmeContent = await ghText(`${prefix}/readme`, token);
  if (readmeContent) readmeLength = readmeContent.length;

  // Fetch SECURITY.md content
  let securityMdContent = "";
  if (hasSecurityMd) {
    securityMdContent = (await ghText(`${prefix}/contents/SECURITY.md`, token)) ?? "";
  }

  // Detect license type
  let licenseType = "Unknown";
  const licenseData = await ghJson<{ license?: { spdx_id: string } }>(`${prefix}`, token);
  if (licenseData?.license?.spdx_id) licenseType = licenseData.license.spdx_id;

  // Find all doc files
  const docFiles = files.filter((f) =>
    f.endsWith(".md") || f.includes("docs/") || f.includes("documentation/")
  );

  if (hasReadme) findings.push(`README.md: ${readmeLength > 1000 ? "Comprehensive" : "Brief"} (${readmeLength} chars)`);
  if (!hasReadme) findings.push("README.md: Missing — recommended for project documentation");
  if (hasSecurityMd) findings.push("SECURITY.md: Found — security disclosure policy documented");
  if (!hasSecurityMd) findings.push("SECURITY.md: Missing — consider adding a security disclosure policy");
  if (docFiles.length > 0) findings.push(`Documentation files: ${docFiles.length} found`);

  return {
    hasReadme,
    readmeLength,
    hasSecurityMd,
    securityMdContent,
    hasContributing,
    hasChangelog,
    hasLicense,
    licenseType,
    hasArchitectureDocs,
    hasApiDocs,
    hasPrivacyPolicy,
    docFiles,
    findings,
  };
}

/* ── CI/CD Scanner ─────────────────────────────────────────────── */

async function scanCICD(prefix: string, token: string, files: string[], defaultBranch: string): Promise<CICDSignals> {
  const findings: string[] = [];
  const lower = files.map((f) => f.toLowerCase());

  // GitHub Actions
  const workflowFiles = files.filter((f) => f.startsWith(".github/workflows/"));
  const hasGitHubActions = workflowFiles.length > 0;
  const workflows = workflowFiles.map((f) => f.replace(".github/workflows/", ""));

  // Classify workflows
  const hasTestWorkflow = workflows.some((w) => /test|spec|jest|vitest|pytest|ci/i.test(w));
  const hasLintWorkflow = workflows.some((w) => /lint|eslint|prettier|format/i.test(w));
  const hasDeployWorkflow = workflows.some((w) => /deploy|release|publish|cd/i.test(w));

  // Dependabot
  const hasDependabot = lower.some((f) =>
    f === ".github/dependabot.yml" || f === ".github/dependabot.yaml"
  );

  // Code scanning (CodeQL)
  const hasCodeScanning = workflows.some((w) => /codeql|code.*scan|security.*scan/i.test(w)) ||
    lower.some((f) => f.includes("codeql"));

  // Secret scanning — check via API
  const hasSecretScanning = false; // Requires admin access, skip for now

  // Branch protection
  let hasBranchProtection = false;
  const branchProtectionRules: string[] = [];
  const protection = await ghJson<BranchProtection>(
    `${prefix}/branches/${defaultBranch}/protection`, token
  );
  if (protection) {
    hasBranchProtection = true;
    if (protection.required_status_checks) branchProtectionRules.push("Required status checks");
    if (protection.required_pull_request_reviews) branchProtectionRules.push("Required PR reviews");
    if (protection.enforce_admins?.enabled) branchProtectionRules.push("Admin enforcement");
  }

  if (hasGitHubActions) findings.push(`GitHub Actions: ${workflows.length} workflows (${workflows.join(", ")})`);
  if (hasDependabot) findings.push("Dependabot: Automated dependency updates enabled");
  if (!hasDependabot) findings.push("Dependabot: Not configured — consider enabling for security patches");
  if (hasCodeScanning) findings.push("Code scanning: CodeQL or equivalent configured");
  if (hasBranchProtection) findings.push(`Branch protection: ${branchProtectionRules.join(", ")}`);
  if (!hasBranchProtection) findings.push("Branch protection: Not detected on default branch");
  if (hasTestWorkflow) findings.push("Testing: Automated test workflow found");
  if (!hasTestWorkflow) findings.push("Testing: No automated test workflow detected");

  return {
    hasGitHubActions,
    workflows,
    hasDependabot,
    hasCodeScanning,
    hasSecretScanning,
    hasBranchProtection,
    branchProtectionRules,
    hasTestWorkflow,
    hasLintWorkflow,
    hasDeployWorkflow,
    findings,
  };
}

/* ── Summary Builder ───────────────────────────────────────────── */

function buildSummary(
  security: SecuritySignals,
  docs: DocumentationSignals,
  cicd: CICDSignals,
  repo: string
): string {
  const strengths: string[] = [];
  const gaps: string[] = [];

  if (security.hasAuthMiddleware) strengths.push(`authentication (${security.authPatterns.join(", ")})`);
  else gaps.push("no authentication middleware detected");

  if (security.hasInputValidation) strengths.push(`input validation (${security.validationLibraries.join(", ") || "custom"})`);
  else gaps.push("no input validation library detected");

  if (security.hasLogging) strengths.push(`logging/monitoring (${security.loggingDetails.join(", ") || "custom"})`);
  else gaps.push("no logging/monitoring detected");

  if (security.hasEncryption) strengths.push("encryption/hashing");
  if (cicd.hasGitHubActions) strengths.push("CI/CD automation");
  if (cicd.hasDependabot) strengths.push("automated dependency updates");
  if (cicd.hasBranchProtection) strengths.push("branch protection");
  if (docs.hasSecurityMd) strengths.push("SECURITY.md disclosure policy");
  if (docs.hasReadme && docs.readmeLength > 500) strengths.push("comprehensive README");

  if (!cicd.hasTestWorkflow) gaps.push("no automated tests");
  if (!docs.hasSecurityMd) gaps.push("no SECURITY.md");
  if (!cicd.hasDependabot) gaps.push("no Dependabot");

  return `Repository ${repo} scan: ${strengths.length} compliance strengths found (${strengths.join(", ")}). ${gaps.length} gaps identified (${gaps.join(", ")}).`;
}
