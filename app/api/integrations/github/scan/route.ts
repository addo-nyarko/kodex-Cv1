import { getSession } from "@/lib/auth-helper";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { decrypt } from "@/lib/integrations/crypto";
import { scanGitHubRepo } from "@/lib/integrations/github-scanner";
import { z } from "zod";

const ScanSchema = z.object({
  owner: z.string(),
  repo: z.string(),
});

/**
 * POST /api/integrations/github/scan
 * Triggers a full compliance scan of a GitHub repository.
 * Returns structured ComplianceSignals.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = ScanSchema.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json({ error: "Invalid input", details: body.error.flatten() }, { status: 422 });
  }

  const integration = await db.integration.findUnique({
    where: { orgId_type: { orgId: session.orgId, type: "GITHUB" } },
  });

  if (!integration || integration.status !== "CONNECTED" || !integration.encryptedConfig) {
    return NextResponse.json({ error: "GitHub not connected" }, { status: 400 });
  }

  const config = JSON.parse(decrypt(integration.encryptedConfig));

  // Update integration to show syncing
  await db.integration.update({
    where: { id: integration.id },
    data: { status: "SYNCING" },
  });

  try {
    const signals = await scanGitHubRepo({
      accessToken: config.accessToken,
      owner: body.data.owner,
      repo: body.data.repo,
    });

    // Store scan results in integration config alongside the token
    const updatedConfig = {
      ...config,
      lastScanResults: signals,
      selectedRepo: `${body.data.owner}/${body.data.repo}`,
    };

    await db.integration.update({
      where: { id: integration.id },
      data: {
        status: "CONNECTED",
        encryptedConfig: (await import("@/lib/integrations/crypto")).encrypt(
          JSON.stringify(updatedConfig)
        ),
        lastSyncAt: new Date(),
        lastSyncError: null,
        itemsSynced: (signals.security.findings.length +
          signals.documentation.findings.length +
          signals.cicd.findings.length),
      },
    });

    // Also create automated evidence records from key findings
    await createEvidenceFromSignals(session.orgId, signals);

    return NextResponse.json({ signals });
  } catch (err) {
    console.error("GitHub scan error:", err);

    await db.integration.update({
      where: { id: integration.id },
      data: {
        status: "ERROR",
        lastSyncError: err instanceof Error ? err.message : "Scan failed",
      },
    });

    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Scan failed" },
      { status: 500 }
    );
  }
}

/**
 * Creates Evidence records from GitHub scan signals,
 * linking them to relevant controls.
 */
async function createEvidenceFromSignals(orgId: string, signals: Awaited<ReturnType<typeof scanGitHubRepo>>) {
  const frameworks = await db.framework.findMany({
    where: { orgId },
    include: { controls: { select: { id: true, code: true } } },
  });

  // Map signal categories to control codes
  const signalToControlMap: Record<string, string[]> = {
    security: ["GDPR-Art32", "NIS2-Art21", "AI-Art15"],
    documentation: ["GDPR-Art13", "GDPR-Art30", "AI-Art11", "AI-Art13"],
    cicd: ["GDPR-Art32", "NIS2-Art21"],
  };

  for (const [category, controlCodes] of Object.entries(signalToControlMap)) {
    const categorySignals = signals[category as keyof typeof signals];
    if (!categorySignals || typeof categorySignals !== "object") continue;

    // Fix: cast to unknown first to satisfy TypeScript strict type checking
    const findings = (categorySignals as unknown as Record<string, unknown>).findings;
    if (!Array.isArray(findings) || findings.length === 0) continue;

    const evidenceText = [
      `## GitHub Repository Scan: ${category.charAt(0).toUpperCase() + category.slice(1)}`,
      `Repository: ${signals.repo}`,
      `Scanned: ${signals.scannedAt}`,
      "",
      ...findings.map((f: string) => `- ${f}`),
      "",
      `Summary: ${signals.summary}`,
    ].join("\n");

    // Find matching controls and create evidence
    for (const fw of frameworks) {
      for (const ctrl of fw.controls) {
        if (controlCodes.includes(ctrl.code)) {
          await db.evidence.upsert({
            where: {
              // Use a unique identifier based on control + integration source
              id: `gh-${orgId}-${ctrl.id}-${category}`.slice(0, 25),
            },
            create: {
              controlId: ctrl.id,
              title: `GitHub Scan: ${category.charAt(0).toUpperCase() + category.slice(1)} Analysis`,
              description: `Automated scan of GitHub repository ${signals.repo}`,
              type: "AUTOMATED",
              status: "PENDING",
              fileName: `github-${category}-scan.md`,
              extractedText: evidenceText,
              textExtractedAt: new Date(),
            },
            update: {
              extractedText: evidenceText,
              textExtractedAt: new Date(),
              description: `Automated scan of GitHub repository ${signals.repo}`,
            },
          });
        }
      }
    }
  }
}
