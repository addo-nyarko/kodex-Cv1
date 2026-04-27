/**
 * Post-Scan Document Generator
 *
 * After a compliance scan completes, this module:
 * 1. Creates a SCAN_REPORT Document record from the scan report JSON
 * 2. Auto-generates policy documents for controls that FAILED or had critical gaps
 * 3. Links everything to the correct project so it appears in the Documents page
 *
 * This closes the gap where scans produced reports stored only in Scan.reportJson
 * but never created Document records — so the Documents page showed nothing.
 */

import { db } from "@/lib/db";
import { decrypt } from "@/lib/integrations/crypto";
import {
  DOCUMENT_TEMPLATES,
  buildGenerationPrompt,
  streamGenerateDocument,
  type IntegrationContext,
  type DocumentTemplate,
} from "@/lib/document-generator";
import type { FrameworkReport, ScanControlResult } from "@/types/scan";
import type { FrameworkType } from "@prisma/client";

interface PostScanContext {
  scanId: string;
  orgId: string;
  frameworkType: string;
  report: FrameworkReport;
}

/**
 * Create a Document record for the scan report.
 * This makes the report appear in the Documents page under "Scan Reports".
 */
export async function createScanReportDocument(ctx: PostScanContext): Promise<string | null> {
  const { scanId, orgId, frameworkType, report } = ctx;

  // Find the project through the framework
  const projectId = await resolveProjectId(orgId, frameworkType, scanId);
  if (!projectId) {
    console.warn("No project found for scan — cannot create report document");
    return null;
  }

  const frameworkLabel = frameworkType.replace(/_/g, " ");
  const title = `${frameworkLabel} Scan Report — ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;

  // Build a readable markdown report from the JSON
  const content = buildReportMarkdown(report, frameworkLabel);

  try {
    const doc = await db.document.create({
      data: {
        projectId,
        title,
        description: report.executiveSummary,
        category: "SCAN_REPORT",
        fileName: `${frameworkType.toLowerCase()}-scan-report-${scanId.slice(-6)}.md`,
        fileSize: Buffer.byteLength(content, "utf-8"),
        mimeType: "text/markdown",
        content,
        aiGenerated: true,
        sourceType: "scan",
        sourceId: scanId,
      },
    });

    return doc.id;
  } catch (err) {
    console.error("Failed to create scan report document:", err);
    return null;
  }
}

/**
 * Auto-generate policy documents for controls that failed or have critical gaps.
 *
 * Only generates policies that:
 * 1. Match a known document template
 * 2. Don't already exist as a Document for this project
 * 3. Had a FAIL or PARTIAL status in the scan
 *
 * Returns the IDs of created documents.
 */
export async function autoGeneratePolicies(ctx: PostScanContext): Promise<string[]> {
  const { scanId, orgId, frameworkType, report } = ctx;

  const projectId = await resolveProjectId(orgId, frameworkType, scanId);
  if (!projectId) return [];

  // Find controls that need policies
  const failedControls = report.results.filter(
    (r) => r.status === "FAIL" || r.status === "PARTIAL" || r.status === "NO_EVIDENCE"
  );

  if (failedControls.length === 0) return [];

  // Map failed control codes to document templates
  const templatesToGenerate = new Map<string, { template: DocumentTemplate; key: string; controls: ScanControlResult[] }>();

  for (const [key, template] of Object.entries(DOCUMENT_TEMPLATES)) {
    const matchingFailed = failedControls.filter((c) =>
      template.controlCodes.includes(c.controlCode)
    );

    if (matchingFailed.length > 0) {
      templatesToGenerate.set(key, { template, key, controls: matchingFailed });
    }
  }

  if (templatesToGenerate.size === 0) return [];

  // Check which policies already exist for this project (avoid duplicates)
  const existingDocs = await db.document.findMany({
    where: {
      projectId,
      category: { in: ["POLICY", "GENERATED"] },
    },
    select: { title: true },
  });

  const existingTitles = new Set(existingDocs.map((d) => d.title.toLowerCase()));

  // Load org context for policy generation
  const org = await db.organization.findUnique({
    where: { id: orgId },
    select: {
      name: true, industry: true, country: true, size: true,
      productDescription: true, usesAI: true, aiDescription: true,
      aiPurposes: true, dataCategories: true, userTypes: true,
      usesThirdPartyAI: true, thirdPartyProviders: true,
      trainsOwnModels: true, riskTier: true, applicableFrameworks: true,
      frameworks: {
        select: { type: true, controls: { select: { id: true, code: true, title: true } } },
      },
    },
  });

  if (!org) return [];

  // Load integration context for richer policy content
  let integrationContext: IntegrationContext | undefined;
  try {
    const ghIntegration = await db.integration.findUnique({
      where: { orgId_type: { orgId, type: "GITHUB" } },
    });
    if (ghIntegration?.status === "CONNECTED" && ghIntegration.encryptedConfig) {
      const config = JSON.parse(decrypt(ghIntegration.encryptedConfig));
      if (config.lastScanResults) {
        integrationContext = { github: config.lastScanResults };
      }
    }
  } catch { /* non-fatal */ }

  const createdIds: string[] = [];

  for (const [key, { template, controls }] of templatesToGenerate) {
    // Skip if this policy already exists
    if (existingTitles.has(template.title.toLowerCase())) continue;

    try {
      // Generate the policy content
      const prompt = buildGenerationPrompt(template, org, integrationContext);
      const gen = streamGenerateDocument(template, prompt);

      let content = "";
      for await (const chunk of gen) {
        content += chunk;
      }

      if (content.length < 100) continue; // Skip if generation failed

      // Create the Document record
      const doc = await db.document.create({
        data: {
          projectId,
          title: template.title,
          description: `Auto-generated after scan detected gaps in: ${controls.map((c) => c.controlCode).join(", ")}`,
          category: "POLICY",
          fileName: `${key.replace(/_/g, "-")}.md`,
          fileSize: Buffer.byteLength(content, "utf-8"),
          mimeType: "text/markdown",
          content,
          aiGenerated: true,
          sourceType: "auto-scan",
          sourceId: scanId,
        },
      });

      createdIds.push(doc.id);

      // Also create a Policy record for the policies page
      await db.policy.create({
        data: {
          orgId,
          title: template.title,
          status: "DRAFT",
          aiGenerated: true,
          contentText: content,
          content: { markdown: content },
          applicableFrameworks: org.applicableFrameworks,
          projectId,
        },
      });

      // Create Evidence records linked to matching controls
      const fwRecord = org.frameworks.find((fw) => fw.type === frameworkType);
      if (fwRecord) {
        for (const ctrl of fwRecord.controls) {
          if (template.controlCodes.includes(ctrl.code)) {
            await db.evidence.create({
              data: {
                controlId: ctrl.id,
                title: template.title,
                description: `AI-generated ${template.title} — auto-created after compliance scan`,
                type: "POLICY",
                status: "PENDING",
                fileName: `${key.replace(/_/g, "-")}.md`,
                extractedText: content,
                textExtractedAt: new Date(),
              },
            });
          }
        }
      }
    } catch (err) {
      console.error(`Auto-generation failed for ${template.title}:`, err);
      // Continue with other policies
    }
  }

  return createdIds;
}

/* ── Helpers ────────────────────────────────────────────────────────── */

/**
 * Resolve the projectId from the framework or scan record.
 * Falls back to creating/finding a default project if none exists.
 */
async function resolveProjectId(
  orgId: string,
  frameworkType: string,
  scanId: string
): Promise<string | null> {
  // Check if the scan already has a projectId
  const scan = await db.scan.findUnique({
    where: { id: scanId },
    select: { projectId: true },
  });
  if (scan?.projectId) return scan.projectId;

  // Check if the framework has a projectId
  const framework = await db.framework.findUnique({
    where: { orgId_type: { orgId, type: frameworkType as FrameworkType } },
    select: { projectId: true },
  });
  if (framework?.projectId) return framework.projectId;

  // Fall back: find any active project for this org, or create a default one
  let project = await db.project.findFirst({
    where: { orgId, isActive: true },
    select: { id: true },
    orderBy: { createdAt: "desc" },
  });

  if (!project) {
    const org = await db.organization.findUnique({
      where: { id: orgId },
      select: { name: true },
    });
    project = await db.project.create({
      data: {
        orgId,
        name: org?.name ?? "Default Project",
        description: "Auto-created project for compliance documents",
      },
    });
  }

  // Update the scan with this projectId for future reference
  await db.scan.update({
    where: { id: scanId },
    data: { projectId: project.id },
  }).catch(() => {});

  return project.id;
}

/**
 * Build a human-readable markdown report from the scan JSON.
 */
function buildReportMarkdown(report: FrameworkReport, frameworkLabel: string): string {
  const sections: string[] = [];

  sections.push(`# ${frameworkLabel} Compliance Scan Report`);
  sections.push(`**Generated:** ${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`);
  sections.push(`**Risk Level:** ${report.riskLevel}`);
  sections.push(`**Overall Score:** ${report.score}/100`);
  sections.push(`**Controls:** ${report.controlsPassed}/${report.controlsTotal} passed`);
  sections.push("");

  // Executive Summary
  sections.push("## Executive Summary");
  sections.push(report.executiveSummary);
  sections.push("");

  // Control Results by status
  const passed = report.results.filter((r) => r.status === "PASS");
  const partial = report.results.filter((r) => r.status === "PARTIAL");
  const failed = report.results.filter((r) => r.status === "FAIL");
  const noEvidence = report.results.filter((r) => r.status === "NO_EVIDENCE");

  if (failed.length > 0) {
    sections.push("## Failed Controls");
    for (const r of failed) {
      sections.push(`### ${r.controlCode} — ${r.controlTitle}`);
      sections.push(`**Status:** FAIL | **Confidence:** ${Math.round(r.confidence * 100)}%`);
      if (r.note) sections.push(`\n${r.note}`);
      if (r.gaps.length > 0) {
        sections.push("\n**Gaps:**");
        for (const g of r.gaps) sections.push(`- ${g}`);
      }
      if (r.remediations.length > 0) {
        sections.push("\n**Remediation:**");
        for (const rem of r.remediations) sections.push(`- ${rem}`);
      }
      sections.push("");
    }
  }

  if (partial.length > 0) {
    sections.push("## Partially Met Controls");
    for (const r of partial) {
      sections.push(`### ${r.controlCode} — ${r.controlTitle}`);
      sections.push(`**Status:** PARTIAL | **Confidence:** ${Math.round(r.confidence * 100)}%`);
      if (r.note) sections.push(`\n${r.note}`);
      if (r.gaps.length > 0) {
        sections.push("\n**Gaps:**");
        for (const g of r.gaps) sections.push(`- ${g}`);
      }
      if (r.remediations.length > 0) {
        sections.push("\n**Remediation:**");
        for (const rem of r.remediations) sections.push(`- ${rem}`);
      }
      sections.push("");
    }
  }

  if (noEvidence.length > 0) {
    sections.push("## Controls With No Evidence");
    for (const r of noEvidence) {
      sections.push(`- **${r.controlCode}** — ${r.controlTitle}`);
      if (r.remediations.length > 0) {
        sections.push(`  - Fix: ${r.remediations[0]}`);
      }
    }
    sections.push("");
  }

  if (passed.length > 0) {
    sections.push("## Passed Controls");
    for (const r of passed) {
      sections.push(`- **${r.controlCode}** — ${r.controlTitle} (${Math.round(r.confidence * 100)}% confidence)`);
      if (r.evidenceUsed.length > 0) {
        sections.push(`  - Evidence: ${r.evidenceUsed.join(", ")}`);
      }
    }
    sections.push("");
  }

  // Remediation Roadmap
  if (report.roadmap.length > 0) {
    sections.push("## Remediation Roadmap");
    const critical = report.roadmap.filter((t) => t.priority === "CRITICAL");
    const high = report.roadmap.filter((t) => t.priority === "HIGH");
    const medium = report.roadmap.filter((t) => t.priority === "MEDIUM");
    const low = report.roadmap.filter((t) => t.priority === "LOW");

    for (const [label, tasks] of [["Critical", critical], ["High", high], ["Medium", medium], ["Low", low]] as const) {
      if (tasks.length > 0) {
        sections.push(`\n### ${label} Priority`);
        for (const t of tasks) {
          sections.push(`- **${t.controlCode}**: ${t.title}`);
          sections.push(`  - ${t.description}`);
          sections.push(`  - Effort: ${t.effortEstimate}`);
        }
      }
    }
  }

  return sections.join("\n");
}
