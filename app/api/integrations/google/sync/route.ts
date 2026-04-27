import { getSession } from "@/lib/auth-helper";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { decrypt, encrypt } from "@/lib/integrations/crypto";
import { scanGoogleWorkspace } from "@/lib/integrations/google-workspace-scanner";

/**
 * POST /api/integrations/google/sync
 * Triggers a compliance scan of the connected Google Workspace.
 */
export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const integration = await db.integration.findUnique({
    where: { orgId_type: { orgId: session.orgId, type: "GOOGLE_WORKSPACE" } },
  });

  if (!integration || integration.status !== "CONNECTED" || !integration.encryptedConfig) {
    return NextResponse.json({ error: "Google Workspace not connected" }, { status: 400 });
  }

  const config = JSON.parse(decrypt(integration.encryptedConfig));

  await db.integration.update({
    where: { id: integration.id },
    data: { status: "SYNCING" },
  });

  try {
    const signals = await scanGoogleWorkspace({
      accessToken: config.accessToken,
      refreshToken: config.refreshToken,
      expiresAt: config.expiresAt,
    });

    const updatedConfig = {
      ...config,
      lastScanResults: signals,
    };

    await db.integration.update({
      where: { id: integration.id },
      data: {
        status: "CONNECTED",
        encryptedConfig: encrypt(JSON.stringify(updatedConfig)),
        lastSyncAt: new Date(),
        lastSyncError: null,
        itemsSynced: signals.findings.length,
      },
    });

    // Create evidence records from Google Workspace signals
    await createEvidenceFromGoogleSignals(session.orgId, signals);

    return NextResponse.json({ signals });
  } catch (err) {
    console.error("Google Workspace sync error:", err);

    await db.integration.update({
      where: { id: integration.id },
      data: {
        status: "ERROR",
        lastSyncError: err instanceof Error ? err.message : "Sync failed",
      },
    });

    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Sync failed" },
      { status: 500 }
    );
  }
}

async function createEvidenceFromGoogleSignals(
  orgId: string,
  signals: Awaited<ReturnType<typeof scanGoogleWorkspace>>
) {
  const frameworks = await db.framework.findMany({
    where: { orgId },
    include: { controls: { select: { id: true, code: true } } },
  });

  // Google Workspace signals map to access control and monitoring controls
  const evidenceText = [
    `## Google Workspace Compliance Scan`,
    `Workspace: ${signals.workspace}`,
    `Scanned: ${signals.scannedAt}`,
    "",
    `### Identity & Access Management`,
    `- Total users: ${signals.totalUsers}`,
    `- Admin users: ${signals.adminUsers}`,
    `- 2FA enforced: ${signals.has2FAEnforced ? "Yes (80%+)" : "No"}`,
    `- Organization units: ${signals.orgUnitsCount}`,
    "",
    `### Data Governance`,
    `- Shared drives: ${signals.sharedDrivesCount}`,
    `- External sharing: ${signals.externalSharingEnabled ? "Enabled" : "Disabled"}`,
    "",
    `### Monitoring`,
    `- Login monitoring: ${signals.hasLoginMonitoring ? "Active" : "Not detected"}`,
    `- Recent security events: ${signals.recentSecurityEvents}`,
    `- Admin actions (7d): ${signals.recentAdminActions.length}`,
    "",
    `### Findings`,
    ...signals.findings.map((f) => `- ${f}`),
    "",
    signals.summary,
  ].join("\n");

  // Map to relevant control codes
  const controlCodes = ["GDPR-Art32", "GDPR-Art33", "NIS2-Art21"];

  for (const fw of frameworks) {
    for (const ctrl of fw.controls) {
      if (controlCodes.includes(ctrl.code)) {
        await db.evidence.upsert({
          where: { id: `gws-${orgId}-${ctrl.id}`.slice(0, 25) },
          create: {
            controlId: ctrl.id,
            title: "Google Workspace: Security & Access Analysis",
            description: `Automated scan of Google Workspace (${signals.workspace})`,
            type: "AUTOMATED",
            status: "PENDING",
            fileName: "google-workspace-scan.md",
            extractedText: evidenceText,
            textExtractedAt: new Date(),
          },
          update: {
            extractedText: evidenceText,
            textExtractedAt: new Date(),
          },
        });
      }
    }
  }
}
