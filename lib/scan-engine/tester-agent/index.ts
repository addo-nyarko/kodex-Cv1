/**
 * Tester Agent — User-POV Compliance Checker
 *
 * Orchestrates the full tester flow:
 * 1. Discover the deployed URL from GitHub repo metadata
 * 2. Visit the live site with a headless browser
 * 3. Check user-visible compliance elements
 * 4. Analyze findings and produce a report
 *
 * Streams progress events so the UI can show real-time updates.
 */

import { db } from "@/lib/db";
import { decrypt } from "@/lib/integrations/crypto";
import { discoverUrl, verifyUrl } from "./url-discovery";
import { checkSite } from "./site-checker";
import { analyzeCompliance } from "./compliance-analyzer";
import type { TesterProgressEvent, TesterReport } from "@/types/tester";

export type { TesterReport, TesterProgressEvent };

/**
 * Run the tester agent for a GitHub integration.
 *
 * @param integrationId - The GitHub integration record ID
 * @param orgId - The organization ID (for context)
 * @param manualUrl - Optional: skip URL discovery and test this URL directly
 */
export async function* runTesterAgent(
  integrationId: string,
  orgId: string,
  manualUrl?: string
): AsyncGenerator<TesterProgressEvent> {
  // Fetch integration config and org context
  const [integration, org] = await Promise.all([
    db.integration.findUniqueOrThrow({
      where: { id: integrationId },
    }),
    db.organization.findUniqueOrThrow({
      where: { id: orgId },
      select: { name: true, industry: true, country: true },
    }),
  ]);

  if (integration.orgId !== orgId) {
    yield { type: "error", message: "Integration does not belong to this organization." };
    return;
  }

  yield {
    type: "narration",
    message: "Starting user-perspective compliance test — I'll visit your app like a real user would.",
  };

  // ── Step 1: Find the URL ──────────────────────────────────────────
  let targetUrl: string;

  if (manualUrl) {
    targetUrl = manualUrl;
    yield { type: "narration", message: `Using provided URL: ${manualUrl}` };
  } else {
    yield { type: "narration", message: "Looking for your deployed app URL in the repo metadata..." };

    // Extract owner/repo from the integration config
    const { owner, repo } = extractRepoInfo(integration);
    if (!owner || !repo) {
      yield { type: "error", message: "Couldn't determine the GitHub repo. Please provide a URL manually." };
      return;
    }

    const token = extractToken(integration);
    if (!token) {
      yield { type: "error", message: "GitHub access token not found. Please reconnect the integration." };
      return;
    }

    const discovery = await discoverUrl(owner, repo, token);

    if (!discovery.url) {
      yield {
        type: "error",
        message: "Couldn't find a deployed URL for this repo. No homepage, Vercel/Netlify config, CNAME, or deployment links found in the README. You can provide a URL manually.",
      };
      return;
    }

    targetUrl = discovery.url;
    yield {
      type: "narration",
      message: `Found URL: ${targetUrl} (from ${discovery.source.replace(/_/g, " ")}, ${Math.round(discovery.confidence * 100)}% confidence)`,
    };
  }

  // ── Step 2: Verify the URL is reachable ───────────────────────────
  yield { type: "narration", message: `Checking if ${targetUrl} is reachable...` };

  const verification = await verifyUrl(targetUrl);
  if (!verification.reachable) {
    yield {
      type: "error",
      message: `${targetUrl} is not reachable (status: ${verification.statusCode || "connection failed"}). The app might be down, behind auth, or the URL might be wrong. You can try a different URL.`,
    };
    return;
  }

  const finalUrl = verification.finalUrl;
  if (finalUrl !== targetUrl) {
    yield { type: "narration", message: `Redirected to: ${finalUrl}` };
  }

  yield {
    type: "narration",
    message: `Site is live (loaded in ${verification.loadTimeMs}ms). Opening a browser to check compliance...`,
  };

  // ── Step 3: Run the headless browser checks ───────────────────────
  yield { type: "narration", message: "Checking for cookie consent banners..." };
  yield { type: "narration", message: "Looking for privacy policy and terms of service..." };
  yield { type: "narration", message: "Inspecting forms for PII collection and consent..." };
  yield { type: "narration", message: "Analyzing security headers and HTTPS configuration..." };
  yield { type: "narration", message: "Detecting third-party trackers in network requests..." };

  let siteResults;
  try {
    siteResults = await checkSite(finalUrl);
  } catch (err) {
    yield {
      type: "error",
      message: `Browser check failed: ${err instanceof Error ? err.message : "Unknown error"}. The site might block headless browsers or require authentication.`,
    };
    return;
  }

  // Stream individual findings as they're discovered
  if (!siteResults.reachable) {
    yield { type: "error", message: "Browser couldn't load the page. The site may require authentication or block automated access." };
    return;
  }

  // Quick narration of what we see
  const quickStats: string[] = [];
  if (siteResults.httpsEnforced) quickStats.push("HTTPS enforced");
  else quickStats.push("no HTTPS (critical!)");
  if (siteResults.cookieBanner.found) quickStats.push("cookie banner found");
  else quickStats.push("no cookie banner");
  if (siteResults.privacyPolicy.found) quickStats.push("privacy policy linked");
  else quickStats.push("no privacy policy link");
  if (siteResults.thirdPartyTrackers.trackersFound.length > 0) {
    quickStats.push(`${siteResults.thirdPartyTrackers.trackersFound.length} tracker(s) detected`);
  }
  if (siteResults.dataCollection.formsFound > 0) {
    quickStats.push(`${siteResults.dataCollection.formsFound} form(s) found`);
  }

  yield {
    type: "narration",
    message: `Initial observations: ${quickStats.join(", ")}. Now analyzing against GDPR requirements...`,
  };

  // ── Step 4: Analyze compliance ────────────────────────────────────
  yield { type: "narration", message: "Running compliance analysis with Claude..." };

  const report = await analyzeCompliance(siteResults, {
    name: org.name,
    industry: org.industry ?? "unknown",
    country: org.country ?? "EU",
  });

  // Stream each finding
  for (const finding of report.findings) {
    yield { type: "finding", finding };
  }

  // ── Step 5: Store results in encryptedConfig alongside scan data ──
  try {
    if (integration.encryptedConfig) {
      const config = JSON.parse(decrypt(integration.encryptedConfig));
      config.lastTesterReport = {
        url: report.url,
        testedAt: report.testedAt,
        overallScore: report.overallScore,
        summary: report.summary,
        findingsCount: report.findings.length,
        criticalCount: report.findings.filter((f) => f.severity === "critical").length,
        highCount: report.findings.filter((f) => f.severity === "high").length,
      };
      const { encrypt } = await import("@/lib/integrations/crypto");
      await db.integration.update({
        where: { id: integrationId },
        data: { encryptedConfig: encrypt(JSON.stringify(config)) },
      });
    }
  } catch {
    // Non-critical — report is still returned via SSE even if storage fails
  }

  yield { type: "complete", report };
}

/* ── Helpers ────────────────────────────────────────────────────────── */

function extractRepoInfo(
  integration: { encryptedConfig: string | null; metadata?: unknown }
): { owner: string | null; repo: string | null } {
  if (!integration.encryptedConfig) return { owner: null, repo: null };

  try {
    const config = JSON.parse(decrypt(integration.encryptedConfig));
    const selectedRepo = config.selectedRepo as string | undefined;
    if (selectedRepo && selectedRepo.includes("/")) {
      const [owner, repo] = selectedRepo.split("/");
      return { owner, repo };
    }
    // Fall back to config fields
    return { owner: config.owner ?? null, repo: config.repo ?? null };
  } catch {
    return { owner: null, repo: null };
  }
}

function extractToken(
  integration: { encryptedConfig: string | null }
): string | null {
  if (!integration.encryptedConfig) return null;

  try {
    const config = JSON.parse(decrypt(integration.encryptedConfig));
    return config.accessToken ?? null;
  } catch {
    return null;
  }
}
