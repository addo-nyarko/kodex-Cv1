import { getSession } from "@/lib/auth-helper";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { decrypt, encrypt } from "@/lib/integrations/crypto";
import { scanSlackWorkspace } from "@/lib/integrations/slack-scanner";

/**
 * POST /api/integrations/slack/sync
 * Triggers a compliance scan of the connected Slack workspace.
 * Looks for security/incident channels, compliance files, team structure.
 */
export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const integration = await db.integration.findUnique({
    where: { orgId_type: { orgId: session.orgId, type: "SLACK" } },
  });

  if (!integration || integration.status !== "CONNECTED" || !integration.encryptedConfig) {
    return NextResponse.json({ error: "Slack not connected" }, { status: 400 });
  }

  const config = JSON.parse(decrypt(integration.encryptedConfig));

  await db.integration.update({
    where: { id: integration.id },
    data: { status: "SYNCING" },
  });

  try {
    const signals = await scanSlackWorkspace({
      accessToken: config.accessToken,
      teamId: config.teamId,
      teamName: config.teamName,
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

    // Create evidence records from Slack signals
    await createEvidenceFromSlackSignals(session.orgId, signals);

    return NextResponse.json({ signals });
  } catch (err) {
    console.error("Slack sync error:", err);

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

async function createEvidenceFromSlackSignals(
  orgId: string,
  signals: Awaited<ReturnType<typeof scanSlackWorkspace>>
) {
  const frameworks = await db.framework.findMany({
    where: { orgId },
    include: { controls: { select: { id: true, code: true } } },
  });

  const evidenceText = [
    `## Slack Workspace Compliance Scan`,
    `Workspace: ${signals.teamName}`,
    `Scanned: ${signals.scannedAt}`,
    "",
    `### Workspace Structure`,
    `- Total channels: ${signals.totalChannels}`,
    `- Total members: ${signals.totalMembers}`,
    "",
    `### Compliance-Relevant Channels`,
    ...signals.complianceChannels.map((c) =>
      `- #${c.name} (${c.category}) — ${c.memberCount} members`
    ),
    ...(signals.complianceChannels.length === 0 ? ["- None found"] : []),
    "",
    `### Incident Response Readiness`,
    `- Dedicated incident channel: ${signals.hasIncidentChannel ? "Yes" : "No"}`,
    `- Security channel: ${signals.hasSecurityChannel ? "Yes" : "No"}`,
    `- Active incident process: ${signals.hasActiveIncidentProcess ? "Yes" : "No"}`,
    "",
    `### Data Governance`,
    `- Compliance files shared: ${signals.recentComplianceFiles.length}`,
    ...(signals.recentComplianceFiles.map((f) => `  - ${f.name} (${f.fileType})`)),
    `- External file sharing: ${signals.hasExternalSharing ? "Detected" : "Not detected"}`,
    "",
    `### Findings`,
    ...signals.findings.map((f) => `- ${f}`),
    "",
    signals.summary,
  ].join("\n");

  // Slack signals are most relevant to incident response and organizational measures
  const controlCodes = ["GDPR-Art32", "GDPR-Art33", "NIS2-Art21"];

  for (const fw of frameworks as any[]) {
    for (const ctrl of fw.controls as any[]) {
      if (controlCodes.includes(ctrl.code)) {
        await db.evidence.upsert({
          where: { id: `slack-${orgId}-${ctrl.id}`.slice(0, 25) },
          create: {
            controlId: ctrl.id,
            title: "Slack: Organizational Security & Incident Readiness",
            description: `Automated scan of Slack workspace (${signals.teamName})`,
            type: "AUTOMATED",
            status: "PENDING",
            fileName: "slack-workspace-scan.md",
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
