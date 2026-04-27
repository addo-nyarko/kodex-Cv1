import { getSession } from "@/lib/auth-helper";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { decrypt, encrypt } from "@/lib/integrations/crypto";
import { scanNotionWorkspace } from "@/lib/integrations/notion-scanner";

/**
 * POST /api/integrations/notion/sync
 * Triggers a compliance scan of the connected Notion workspace.
 * Searches for compliance-related pages and extracts their content
 * as evidence for the scanner.
 */
export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Notion uses CUSTOM_WEBHOOK type
  const integration = await db.integration.findUnique({
    where: { orgId_type: { orgId: session.orgId, type: "CUSTOM_WEBHOOK" } },
  });

  if (!integration || integration.status !== "CONNECTED" || !integration.encryptedConfig) {
    return NextResponse.json({ error: "Notion not connected" }, { status: 400 });
  }

  const config = JSON.parse(decrypt(integration.encryptedConfig));

  // Verify this is actually a Notion integration (not some other webhook)
  if (config.provider !== "notion") {
    return NextResponse.json({ error: "Integration is not Notion" }, { status: 400 });
  }

  await db.integration.update({
    where: { id: integration.id },
    data: { status: "SYNCING" },
  });

  try {
    const signals = await scanNotionWorkspace({
      accessToken: config.accessToken,
      workspaceId: config.workspaceId,
      workspaceName: config.workspaceName,
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
        itemsSynced: signals.compliancePagesFound,
      },
    });

    // Create evidence records from each compliance page found
    await createEvidenceFromNotionPages(session.orgId, signals);

    return NextResponse.json({ signals });
  } catch (err) {
    console.error("Notion sync error:", err);

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

async function createEvidenceFromNotionPages(
  orgId: string,
  signals: Awaited<ReturnType<typeof scanNotionWorkspace>>
) {
  const frameworks = await db.framework.findMany({
    where: { orgId },
    include: { controls: { select: { id: true, code: true } } },
  });

  // Map Notion page categories to control codes
  const categoryToControls: Record<string, string[]> = {
    privacy_policy: ["GDPR-Art13", "GDPR-Art6"],
    security_policy: ["GDPR-Art32", "NIS2-Art21"],
    incident_response: ["GDPR-Art33"],
    dpia: ["SHARED-DPIA"],
    ropa: ["GDPR-Art30"],
    data_retention: ["GDPR-Art5"],
    acceptable_use: ["GDPR-Art32"],
    employee_handbook: ["GDPR-Art32"],
    vendor_management: ["GDPR-Art28"],
    change_management: ["GDPR-Art32", "AI-Art15"],
    ai_policy: ["AI-Art6", "AI-Art9", "AI-Art13"],
    risk_assessment: ["SHARED-DPIA", "AI-Art9"],
    access_control: ["GDPR-Art32", "NIS2-Art21"],
    business_continuity: ["NIS2-Art21"],
  };

  for (const page of signals.compliancePages) {
    const controlCodes = categoryToControls[page.category] ?? [];

    const evidenceText = [
      `## Notion Document: ${page.title}`,
      `Category: ${page.category.replace(/_/g, " ")}`,
      `Source: ${page.url}`,
      `Last edited: ${page.lastEditedAt}`,
      "",
      page.textContent,
    ].join("\n");

    for (const fw of frameworks as any[]) {
      for (const ctrl of fw.controls as any[]) {
        if (controlCodes.includes(ctrl.code)) {
          const evidenceId = `notion-${orgId}-${page.id}-${ctrl.id}`.slice(0, 25);

          await db.evidence.upsert({
            where: { id: evidenceId },
            create: {
              controlId: ctrl.id,
              title: `Notion: ${page.title}`,
              description: `Compliance document from Notion workspace — ${page.category.replace(/_/g, " ")}`,
              type: "AUTOMATED",
              status: "PENDING",
              fileName: `notion-${page.category}.md`,
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
}
