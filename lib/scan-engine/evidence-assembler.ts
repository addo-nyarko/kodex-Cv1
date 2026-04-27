import { db } from "@/lib/db";
import { decrypt, encrypt } from "@/lib/integrations/crypto";
import type { EvidencePool, DocumentChunk } from "@/types/scan";
import type { NotionCompliancePage } from "@/lib/integrations/notion-scanner";
import { scanGoogleWorkspace } from "@/lib/integrations/google-workspace-scanner";
import { scanNotionWorkspace } from "@/lib/integrations/notion-scanner";
import { scanSlackWorkspace } from "@/lib/integrations/slack-scanner";

export async function assembleEvidence(orgId: string, scanId: string): Promise<EvidencePool> {
  const [org, scan, evidence, integrations] = await Promise.all([
    db.organization.findUniqueOrThrow({ where: { id: orgId } }),
    db.scan.findUniqueOrThrow({
      where: { id: scanId },
      include: { clarifications: { where: { answeredAt: { not: null } } } },
    }),
    db.evidence.findMany({
      where: {
        control: { framework: { orgId } },
        status: { in: ["APPROVED", "PENDING"] },
      },
      orderBy: { collectedAt: "desc" },
    }),
    // Fetch connected integrations to pull code signals
    db.integration.findMany({
      where: { orgId, status: "CONNECTED" },
    }),
  ]);

  // Build document chunks from extracted text (real content) or fall back to description
  const documents: DocumentChunk[] = evidence
    .filter((e) => e.fileKey && e.fileName)
    .map((e) => {
      const text = e.extractedText ?? e.description ?? e.title;
      // Split long documents into chunks of ~4000 chars for LLM context management
      const chunks: DocumentChunk[] = [];
      const CHUNK_SIZE = 4000;

      if (text.length <= CHUNK_SIZE) {
        chunks.push({
          evidenceId: e.id,
          fileName: e.fileName!,
          chunkIndex: 0,
          text,
        });
      } else {
        // Split on paragraph boundaries when possible
        const paragraphs = text.split(/\n\s*\n/);
        let currentChunk = "";
        let chunkIndex = 0;

        for (const para of paragraphs) {
          if (currentChunk.length + para.length > CHUNK_SIZE && currentChunk.length > 0) {
            chunks.push({
              evidenceId: e.id,
              fileName: e.fileName!,
              chunkIndex,
              text: currentChunk.trim(),
            });
            chunkIndex++;
            currentChunk = para;
          } else {
            currentChunk += (currentChunk ? "\n\n" : "") + para;
          }
        }

        if (currentChunk.trim()) {
          chunks.push({
            evidenceId: e.id,
            fileName: e.fileName!,
            chunkIndex,
            text: currentChunk.trim(),
          });
        }
      }

      return chunks;
    })
    .flat();

  const clarifications: Record<string, string> = {};
  for (const c of (scan as any).clarifications) {
    if (c.controlCode && c.answer) {
      clarifications[c.controlCode] = c.answer;
    }
  }

  const questionnaire = (org.questionnaireAnswers as Record<string, unknown>) ?? {};

  // Auto-sync connected integrations that haven't been scanned yet
  // This means users don't have to manually click "Scan for Evidence" on each one
  // before running a compliance scan — it just works.
  const syncedIntegrations = await autoSyncIfNeeded(integrations);

  // Pull signals from ALL connected integrations (GitHub, Google, Slack, Notion)
  const { signals: codeSignals, notionDocuments } = await extractIntegrationSignals(syncedIntegrations);

  // Inject Notion compliance pages as document chunks so the scanner can search them
  if (notionDocuments.length > 0) {
    documents.push(...notionDocuments);
  }

  return {
    onboarding: {
      companyName: org.name,
      industry: org.industry ?? "unknown",
      country: org.country ?? "EU",
      size: org.size ?? "1-10",
      usesAI: org.usesAI,
      aiDescription: org.aiDescription ?? undefined,
      dataCategories: org.dataCategories,
    },
    questionnaire,
    documents,
    codeSignals,
    clarifications,
    priorResults: {},
  };
}

/**
 * Auto-sync connected integrations that haven't been scanned yet.
 * Checks if encryptedConfig has lastScanResults — if not, runs the scanner
 * and updates the integration record so the evidence assembler can pick it up.
 *
 * GitHub is excluded because it requires a user-selected repo.
 */
async function autoSyncIfNeeded(
  integrations: Array<{ id: string; type: string; encryptedConfig: string | null }>
): Promise<Array<{ id: string; type: string; encryptedConfig: string | null }>> {
  const updated = [...integrations];

  for (let i = 0; i < updated.length; i++) {
    const integration = updated[i];
    if (!integration.encryptedConfig) continue;

    try {
      const config = JSON.parse(decrypt(integration.encryptedConfig));

      // Skip if already scanned
      if (config.lastScanResults) continue;
      // Skip GitHub — requires user to pick a repo first
      if (integration.type === "GITHUB") continue;

      // Auto-sync Google Workspace
      if (integration.type === "GOOGLE_WORKSPACE" && config.accessToken) {
        try {
          const signals = await scanGoogleWorkspace({
            accessToken: config.accessToken,
            refreshToken: config.refreshToken,
            expiresAt: config.expiresAt,
          });
          const updatedConfig = { ...config, lastScanResults: signals };
          const encryptedConfig = encrypt(JSON.stringify(updatedConfig));
          await db.integration.update({
            where: { id: integration.id },
            data: { encryptedConfig, lastSyncAt: new Date(), itemsSynced: signals.findings.length },
          });
          updated[i] = { ...integration, encryptedConfig };
        } catch (err) {
          console.warn("Auto-sync Google Workspace failed:", err);
        }
      }

      // Auto-sync Notion
      if (integration.type === "CUSTOM_WEBHOOK" && config.provider === "notion" && config.accessToken) {
        try {
          const signals = await scanNotionWorkspace({
            accessToken: config.accessToken,
            workspaceId: config.workspaceId,
            workspaceName: config.workspaceName,
          });
          const updatedConfig = { ...config, lastScanResults: signals };
          const encryptedConfig = encrypt(JSON.stringify(updatedConfig));
          await db.integration.update({
            where: { id: integration.id },
            data: { encryptedConfig, lastSyncAt: new Date(), itemsSynced: signals.compliancePagesFound },
          });
          updated[i] = { ...integration, encryptedConfig };
        } catch (err) {
          console.warn("Auto-sync Notion failed:", err);
        }
      }

      // Auto-sync Slack
      if (integration.type === "SLACK" && config.accessToken) {
        try {
          const signals = await scanSlackWorkspace({
            accessToken: config.accessToken,
            teamId: config.teamId,
            teamName: config.teamName,
          });
          const updatedConfig = { ...config, lastScanResults: signals };
          const encryptedConfig = encrypt(JSON.stringify(updatedConfig));
          await db.integration.update({
            where: { id: integration.id },
            data: { encryptedConfig, lastSyncAt: new Date(), itemsSynced: signals.findings.length },
          });
          updated[i] = { ...integration, encryptedConfig };
        } catch (err) {
          console.warn("Auto-sync Slack failed:", err);
        }
      }
    } catch {
      // Bad encrypted config — skip
    }
  }

  return updated;
}

/**
 * Extract signals from ALL connected integrations.
 * Returns both structured signals (for codeSignals) and
 * Notion document chunks (injected directly into evidence.documents).
 */
async function extractIntegrationSignals(
  integrations: Array<{ type: string; encryptedConfig: string | null }>
): Promise<{ signals: Record<string, unknown>; notionDocuments: DocumentChunk[] }> {
  const signals: Record<string, unknown> = {};
  const notionDocuments: DocumentChunk[] = [];

  for (const integration of integrations) {
    if (!integration.encryptedConfig) continue;

    try {
      const config = JSON.parse(decrypt(integration.encryptedConfig));

      // ── GitHub ────────────────────────────────────────────────
      if (integration.type === "GITHUB" && config.lastScanResults) {
        const scan = config.lastScanResults;
        signals.github = {
          repo: config.selectedRepo ?? scan.repo,
          scannedAt: scan.scannedAt,
          hasAuth: scan.security?.hasAuthMiddleware ?? false,
          authPatterns: scan.security?.authPatterns ?? [],
          hasEncryption: scan.security?.hasEncryption ?? false,
          hasInputValidation: scan.security?.hasInputValidation ?? false,
          hasLogging: scan.security?.hasLogging ?? false,
          hasRateLimiting: scan.security?.hasRateLimiting ?? false,
          hasCSRFProtection: scan.security?.hasCSRFProtection ?? false,
          securityHeaders: scan.security?.hasHelmetOrSecurityHeaders ?? false,
          hasReadme: scan.documentation?.hasReadme ?? false,
          hasSecurityMd: scan.documentation?.hasSecurityMd ?? false,
          hasPrivacyPolicy: scan.documentation?.hasPrivacyPolicy ?? false,
          hasArchitectureDocs: scan.documentation?.hasArchitectureDocs ?? false,
          docCount: scan.documentation?.docFiles?.length ?? 0,
          hasCI: scan.cicd?.hasGitHubActions ?? false,
          hasDependabot: scan.cicd?.hasDependabot ?? false,
          hasCodeScanning: scan.cicd?.hasCodeScanning ?? false,
          hasBranchProtection: scan.cicd?.hasBranchProtection ?? false,
          hasTests: scan.cicd?.hasTestWorkflow ?? false,
          allFindings: [
            ...(scan.security?.findings ?? []),
            ...(scan.documentation?.findings ?? []),
            ...(scan.cicd?.findings ?? []),
          ],
          summary: scan.summary ?? "",
        };
      }

      // ── Google Workspace ──────────────────────────────────────
      if (integration.type === "GOOGLE_WORKSPACE" && config.lastScanResults) {
        const scan = config.lastScanResults;
        signals.googleWorkspace = {
          workspace: scan.workspace ?? "unknown",
          scannedAt: scan.scannedAt,
          // Identity & access
          totalUsers: scan.totalUsers ?? 0,
          adminUsers: scan.adminUsers ?? 0,
          suspendedUsers: scan.suspendedUsers ?? 0,
          has2FAEnforced: scan.has2FAEnforced ?? false,
          orgUnitsCount: scan.orgUnitsCount ?? 0,
          // Data governance
          externalSharingEnabled: scan.externalSharingEnabled ?? true,
          sharedDrivesCount: scan.sharedDrivesCount ?? 0,
          hasDataLossPreventionRules: scan.hasDataLossPreventionRules ?? false,
          // Monitoring
          hasLoginMonitoring: scan.hasLoginMonitoring ?? false,
          recentSecurityEvents: scan.recentSecurityEvents ?? 0,
          hasSuspiciousActivityAlerts: scan.hasSuspiciousActivityAlerts ?? false,
          recentAdminActions: scan.recentAdminActions ?? [],
          // Findings
          allFindings: scan.findings ?? [],
          summary: scan.summary ?? "",
        };
      }

      // ── Slack ─────────────────────────────────────────────────
      if (integration.type === "SLACK" && config.lastScanResults) {
        const scan = config.lastScanResults;
        signals.slack = {
          teamName: scan.teamName ?? "unknown",
          scannedAt: scan.scannedAt,
          // Structure
          totalChannels: scan.totalChannels ?? 0,
          totalMembers: scan.totalMembers ?? 0,
          // Compliance channels
          hasSecurityChannel: scan.hasSecurityChannel ?? false,
          hasIncidentChannel: scan.hasIncidentChannel ?? false,
          hasComplianceChannel: scan.hasComplianceChannel ?? false,
          hasPrivacyChannel: scan.hasPrivacyChannel ?? false,
          hasDevOpsChannel: scan.hasDevOpsChannel ?? false,
          complianceChannels: scan.complianceChannels ?? [],
          // Data governance
          hasFileSharing: scan.hasFileSharing ?? false,
          recentComplianceFiles: scan.recentComplianceFiles ?? [],
          hasExternalSharing: scan.hasExternalSharing ?? false,
          // Incident readiness
          hasActiveIncidentProcess: scan.hasActiveIncidentProcess ?? false,
          complianceTopicMentions: scan.complianceTopicMentions ?? 0,
          // Findings
          allFindings: scan.findings ?? [],
          summary: scan.summary ?? "",
        };
      }

      // ── Notion (CUSTOM_WEBHOOK with provider=notion) ──────────
      if (integration.type === "CUSTOM_WEBHOOK" && config.provider === "notion" && config.lastScanResults) {
        const scan = config.lastScanResults;
        signals.notion = {
          workspaceName: scan.workspaceName ?? "unknown",
          scannedAt: scan.scannedAt,
          pagesScanned: scan.pagesScanned ?? 0,
          compliancePagesFound: scan.compliancePagesFound ?? 0,
          categories: scan.categories ?? {},
          // Doc presence flags
          hasPrivacyPolicy: scan.hasPrivacyPolicy ?? false,
          hasSecurityPolicy: scan.hasSecurityPolicy ?? false,
          hasIncidentResponse: scan.hasIncidentResponse ?? false,
          hasDPIA: scan.hasDPIA ?? false,
          hasRoPA: scan.hasRoPA ?? false,
          hasDataRetentionPolicy: scan.hasDataRetentionPolicy ?? false,
          hasAIPolicy: scan.hasAIPolicy ?? false,
          hasEmployeeHandbook: scan.hasEmployeeHandbook ?? false,
          hasVendorManagement: scan.hasVendorManagement ?? false,
          // Findings
          allFindings: scan.findings ?? [],
          summary: scan.summary ?? "",
        };

        // Inject Notion page content as document chunks
        // This is the big win — compliance docs from Notion become searchable evidence
        const pages = (scan.compliancePages ?? []) as NotionCompliancePage[];
        for (const page of pages) {
          if (page.textContent && page.textContent.length > 50) {
            notionDocuments.push({
              evidenceId: `notion-${page.id}`,
              fileName: `[Notion] ${page.title}`,
              chunkIndex: 0,
              text: page.textContent,
            });
          }
        }
      }
    } catch {
      // Skip integrations with bad config
    }
  }

  return { signals, notionDocuments };
}
