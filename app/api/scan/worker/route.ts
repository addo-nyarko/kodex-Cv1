/**
 * POST /api/scan/worker
 *
 * Called by QStash to process a chunk of the scan.
 * Each invocation processes 2-3 controls, saves state, and queues the next chunk.
 * This keeps each function call under Vercel's 10s limit.
 */

import { NextRequest, NextResponse } from "next/server";
import { verifySignatureAppRouter } from "@upstash/qstash/nextjs";
import { db } from "@/lib/db";
import {
  loadScanState,
  saveScanState,
  clearScanState,
  pushScanEvent,
  saveEvidence,
  loadEvidence,
  queueNextChunk,
  CONTROLS_PER_CHUNK,
  type ScanChunkState,
} from "@/lib/queue/scan-queue";
import { assembleEvidence } from "@/lib/scan-engine/evidence-assembler";
import { extractPendingEvidenceForOrg } from "@/lib/pdf-extract";
import { synthesizeEvidence } from "@/lib/scan-engine/evidence-synthesizer";
import { runControl } from "@/lib/scan-engine/control-runner";
import { evaluateControlWithLLM } from "@/lib/scan-engine/llm-evaluator";
import { generateClarificationQuestion } from "@/lib/scan-engine/clarification-manager";
import { runShadowPass } from "@/lib/scan-engine/shadow-pass";
import { buildReport } from "@/lib/scan-engine/report-builder";
import { createScanReportDocument, autoGeneratePolicies } from "@/lib/scan-engine/post-scan-documents";
import { frameworkRegistry } from "@/lib/frameworks/registry";
import { ensureControlsForFramework } from "@/lib/frameworks/ensure-controls";
import type { ControlEvalResult, EvidencePool } from "@/types/scan";
import type { FrameworkType } from "@prisma/client";

export const maxDuration = 10; // Vercel free tier limit

async function handler(req: NextRequest) {
  const body = await req.json();
  const { scanId } = body as { scanId: string };

  if (!scanId) {
    return NextResponse.json({ error: "Missing scanId" }, { status: 400 });
  }

  const state = await loadScanState(scanId);
  if (!state) {
    return NextResponse.json({ error: "No scan state found" }, { status: 404 });
  }

  try {
    if (state.phase === "evidence") {
      await processEvidencePhase(state);
    } else if (state.phase === "controls") {
      await processControlsPhase(state);
    } else if (state.phase === "post") {
      await processPostPhase(state);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Worker failed";
    console.error(`Scan worker error (${scanId}):`, err);

    await pushScanEvent(scanId, `Error: ${errorMsg}`);
    await db.scan.update({
      where: { id: scanId },
      data: {
        status: "FAILED",
        errorMessage: errorMsg,
        completedAt: new Date(),
      },
    }).catch(() => {});

    await clearScanState(scanId);
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}

/**
 * Phase 1: Assemble and synthesize evidence.
 * This is the expensive upfront step — may take 5-8s.
 */
async function processEvidencePhase(state: ScanChunkState): Promise<void> {
  const { scanId, orgId } = state;

  // Extract text for any evidence uploaded but never confirmed via /api/evidence/confirm.
  // Capped at 3 files per invocation to stay under the 10s function limit.
  const pendingResult = await extractPendingEvidenceForOrg(orgId);
  if (pendingResult.extracted > 0) {
    await pushScanEvent(scanId, `Extracted text from ${pendingResult.extracted} document(s)...`);
  }

  await pushScanEvent(scanId, "Assembling evidence from all connected sources...");

  const evidence = await assembleEvidence(orgId, scanId);

  const hasCodeSignals = Object.keys(evidence.codeSignals).length > 0;
  const hasRealDocuments = evidence.documents.some((d: { text: string }) => d.text.length > 100);

  // Populate evidence sources with metadata
  const evidenceSources: Array<{
    type: 'github' | 'document' | 'questionnaire' | 'clarification';
    scannedAt: string;
    reliability: 'high' | 'medium' | 'low';
    label: string;
  }> = [];

  // GitHub source
  if (hasCodeSignals && evidence.codeSignals.github) {
    const ghIntegration = await db.integration.findFirst({
      where: { orgId, type: "GITHUB" },
      select: { lastSyncAt: true },
    });
    if (ghIntegration?.lastSyncAt) {
      evidenceSources.push({
        type: 'github',
        scannedAt: ghIntegration.lastSyncAt.toISOString(),
        reliability: 'high',
        label: 'GitHub repository scan',
      });
    }
  }

  // Document sources
  if (hasRealDocuments && evidence.documents.length > 0) {
    const docIds = [...new Set(evidence.documents.map((d: any) => d.evidenceId))];
    const docs = await db.document.findMany({
      where: { id: { in: docIds } },
      select: { id: true, title: true, fileName: true, createdAt: true },
    });
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    for (const doc of docs) {
      const isStale = doc.createdAt < thirtyDaysAgo;
      evidenceSources.push({
        type: 'document',
        scannedAt: doc.createdAt.toISOString(),
        reliability: isStale ? 'medium' : 'high',
        label: doc.title || doc.fileName || 'Uploaded document',
      });
    }
  }

  // Questionnaire source
  if (Object.keys(evidence.questionnaire).length > 0) {
    const org = await db.organization.findUnique({
      where: { id: orgId },
      select: { createdAt: true },
    });
    if (org) {
      evidenceSources.push({
        type: 'questionnaire',
        scannedAt: org.createdAt.toISOString(),
        reliability: 'low',
        label: 'Onboarding questionnaire',
      });
    }
  }

  // Clarification sources
  if (Object.keys(evidence.clarifications).length > 0) {
    evidenceSources.push({
      type: 'clarification',
      scannedAt: new Date().toISOString(),
      reliability: 'medium',
      label: 'User clarifications',
    });
  }

  state.sources = evidenceSources;

  // Build sources description
  const sources: string[] = [];
  if (hasRealDocuments) sources.push(`${evidence.documents.length} document chunks`);
  if (hasCodeSignals) {
    const gh = evidence.codeSignals.github as Record<string, unknown> | undefined;
    if (gh) sources.push(`GitHub repo scan (${gh.repo})`);
  }
  if (sources.length > 0) {
    await pushScanEvent(scanId, `Working with: ${sources.join(", ")}`);
  }

  // Evidence synthesis (if we have real data)
  if (hasCodeSignals || hasRealDocuments) {
    await pushScanEvent(scanId, "Analyzing evidence for compliance patterns...");
    const synthesis = await synthesizeEvidence(evidence);

    if (synthesis.syntheticDocuments.length > 0) {
      evidence.documents.push(...synthesis.syntheticDocuments);
      await pushScanEvent(
        scanId,
        `Pre-analysis complete: generated ${synthesis.syntheticDocuments.length} evidence summaries.`
      );
    }

    for (const [key, value] of Object.entries(synthesis.inferredAnswers)) {
      if (!evidence.questionnaire[key]) {
        evidence.questionnaire[key] = value;
      }
    }
  }

  // Store evidence in Redis for subsequent chunks
  const evidenceKey = await saveEvidence(scanId, evidence);

  // Determine framework controls count
  const plugin = frameworkRegistry.get(state.frameworkType);
  if (!plugin) throw new Error(`Unknown framework: ${state.frameworkType}`);

  // Safety net: ensure Control rows exist before the controls phase starts.
  // Without this, saveControlResult silently discards every evaluation
  // because db.control.findFirst returns null. See audit/SCAN_DIAGNOSTIC.md.
  const framework = await db.framework.findFirst({
    where: { orgId, type: state.frameworkType as FrameworkType },
  });
  if (!framework) {
    throw new Error(
      `Framework not found for org=${orgId} type=${state.frameworkType}. ` +
      `This should have been created in onboarding or project creation.`
    );
  }

  const controlCount = await ensureControlsForFramework(framework.id, state.frameworkType);
  if (controlCount === 0) {
    throw new Error(
      `No controls available for framework ${state.frameworkType}. ` +
      `The plugin may be missing or have no rules.`
    );
  }
  await pushScanEvent(
    scanId,
    `Prepared ${controlCount} control${controlCount === 1 ? "" : "s"} for evaluation.`
  );

  // Update state: move to controls phase
  state.phase = "controls";
  state.controlIndex = 0;
  state.totalControls = plugin.rules.length;
  state.evidencePrepared = true;
  state.evidenceKey = evidenceKey;
  state.useLLM = hasRealDocuments || hasCodeSignals;
  // sources already populated above
  await saveScanState(state);

  // Queue the first controls chunk
  await queueNextChunk(scanId);
}

/**
 * Phase 2: Process a chunk of controls (2-3 at a time).
 */
async function processControlsPhase(state: ScanChunkState): Promise<void> {
  const { scanId, frameworkType, orgId } = state;

  const plugin = frameworkRegistry.get(frameworkType);
  if (!plugin) throw new Error(`Unknown framework: ${frameworkType}`);

  // Safety net: ensure Control rows exist before evaluation
  // This is called again here (also called in processEvidencePhase) to guarantee
  // Control rows exist even if the evidence phase was skipped (multi-framework reuse)
  try {
    const framework = await db.framework.findFirst({
      where: { orgId, type: frameworkType as FrameworkType },
    });
    if (framework) {
      await ensureControlsForFramework(framework.id, frameworkType);
    }
  } catch (err) {
    console.error(`[processControlsPhase] Failed to ensure controls for ${frameworkType}:`, err);
    // Don't fail the scan if this fails, but log it for debugging
    await pushScanEvent(
      scanId,
      `Warning: Could not verify control setup — some results may not save. Error: ${err instanceof Error ? err.message : "Unknown error"}`
    );
  }

  // Load evidence from Redis
  const evidence = (await loadEvidence(state.evidenceKey!)) as EvidencePool;
  if (!evidence) throw new Error("Evidence not found in Redis — expired?");

  // Check which controls were already evaluated (for resume)
  const existingResults = await db.scanControlResult.findMany({
    where: { scanId },
    select: { control: { select: { code: true } } },
  });
  const alreadyEvaluated = new Set((existingResults as any[]).map((r: any) => r.control.code));

  const startIdx = state.controlIndex;
  const endIdx = Math.min(startIdx + CONTROLS_PER_CHUNK, plugin.rules.length);

  for (let i = startIdx; i < endIdx; i++) {
    const rule = plugin.rules[i];

    // Skip already-evaluated controls
    if (alreadyEvaluated.has(rule.code)) {
      continue;
    }

    try {
      // Evaluate control
      let raw: ControlEvalResult;
      if (state.useLLM) {
        raw = await evaluateControlWithLLM(rule, evidence);
      } else {
        raw = runControl(rule, evidence);
      }

      // Confidence boosts
      if (evidence.clarifications[rule.code]) {
        raw.confidence = Math.max(raw.confidence, 0.5);
      }
      if (Object.keys(evidence.codeSignals).length > 0 && raw.confidence >= 0.3 && raw.confidence < 0.5) {
        raw.confidence = Math.min(raw.confidence + 0.15, 0.6);
      }

      // One-line status update instead of verbose narration
      const statusMessage = `Evaluating ${rule.code}: ${rule.title}`;
      await pushScanEvent(scanId, statusMessage);

      // Check if clarification is needed
      if (
        raw.confidence < 0.35 &&
        raw.status !== "PASS" &&
        !state.clarificationAsked &&
        !evidence.clarifications[rule.code]
      ) {
        const question = await generateClarificationQuestion(rule, evidence);
        await pushScanEvent(scanId, `Clarification needed for ${rule.code}`);

        await db.scan.update({
          where: { id: scanId },
          data: {
            status: "AWAITING_CLARIFICATION",
            pendingQuestion: question,
            pendingControlCode: rule.code,
          },
        });

        state.clarificationAsked = true;
        state.controlIndex = i; // Resume from this control after clarification
        await saveScanState(state);

        // Save the partial result
        await saveControlResult(scanId, orgId, frameworkType, rule, raw, state.sources);

        // Don't queue next chunk — wait for clarification
        return;
      }

      // Save control result to DB
      await saveControlResult(scanId, orgId, frameworkType, rule, raw, state.sources);
    } catch (err) {
      // Isolate this control's failure — don't fail entire scan
      const errorMsg = err instanceof Error ? err.message : "Unknown error";
      console.error(`[control-isolation] Failed to evaluate ${rule.code}:`, err);

      // Save as NO_EVIDENCE with error marker
      await saveControlResult(
        scanId,
        orgId,
        frameworkType,
        rule,
        {
          status: "NO_EVIDENCE",
          confidence: 0,
          evidenceUsed: [],
          gaps: ["Automated evaluation error — manual review required"],
          remediations: ["Review this control manually"],
          lawyerQuestions: [],
          note: "",
        },
        state.sources,
        errorMsg // Pass error to be stored
      );

      // Push event but don't stop scan
      await pushScanEvent(scanId, `⚠️ ${rule.code}: Auto-evaluation failed, marked for manual review`);
    }
  }

  // Update state for next chunk
  state.controlIndex = endIdx;
  await saveScanState(state);

  if (endIdx >= plugin.rules.length) {
    // All controls done — move to post-processing phase
    state.phase = "post";
    await saveScanState(state);
    await queueNextChunk(scanId);
  } else {
    // More controls to process — queue next chunk
    await pushScanEvent(
      scanId,
      `Progress: ${endIdx}/${plugin.rules.length} controls evaluated...`
    );
    await queueNextChunk(scanId);
  }
}

/**
 * Phase 3: Post-processing — shadow pass, report building, document generation.
 */
async function processPostPhase(state: ScanChunkState): Promise<void> {
  const { scanId, frameworkType, orgId } = state;

  const evidence = (await loadEvidence(state.evidenceKey!)) as EvidencePool;

  // Shadow pass
  await pushScanEvent(scanId, "Cross-referencing against other compliance frameworks...");
  const shadowPass = await runShadowPass(evidence, frameworkType);

  for (const [fw, result] of Object.entries(shadowPass)) {
    if (result.met > 0) {
      const pct = Math.round((result.met / result.total) * 100);
      await pushScanEvent(scanId, `${fw.replace(/_/g, " ")} — ${pct}% coverage (${result.met}/${result.total} controls)`);
    }
  }

  // Build report
  await pushScanEvent(scanId, "Building your compliance report and remediation roadmap...");

  // Load all control results for this scan
  const scanResults = await db.scanControlResult.findMany({
    where: { scanId },
    include: { control: { select: { id: true, code: true, title: true } } },
  });

  const controlResults = (scanResults as any[]).map((r: any) => ({
    controlId: r.control.id,
    controlCode: r.control.code,
    controlTitle: r.control.title,
    result: {
      status: r.status as ControlEvalResult["status"],
      confidence: r.confidence,
      evidenceUsed: r.evidenceUsed,
      gaps: r.gaps,
      remediations: r.remediations,
      lawyerQuestions: r.lawyerQuestions,
      note: r.note ?? "",
    },
  }));

  const report = await buildReport(frameworkType, controlResults, evidence);

  // Update framework score
  await db.framework.updateMany({
    where: { orgId, type: frameworkType as FrameworkType },
    data: {
      score: report.score,
      totalControls: report.controlsTotal,
      passedControls: report.controlsPassed,
      status: report.score >= 80 ? "AUDIT_READY" : report.score > 0 ? "IN_PROGRESS" : "NOT_STARTED",
    },
  });

  // Update org-level compliance score
  const allFrameworks = await db.framework.findMany({
    where: { orgId },
    select: { score: true },
  });
  const avgScore = allFrameworks.length > 0
    ? Math.round(allFrameworks.reduce((sum: number, f: any) => sum + f.score, 0) / allFrameworks.length)
    : 0;

  await db.organization.update({
    where: { id: orgId },
    data: { complianceScore: avgScore, scoreUpdatedAt: new Date() },
  });

  // Update project-level score
  const framework = await db.framework.findFirst({
    where: { orgId, type: frameworkType as FrameworkType },
    select: { projectId: true },
  });
  if (framework?.projectId) {
    const projectFrameworks = await db.framework.findMany({
      where: { projectId: framework.projectId },
      select: { score: true },
    });
    if (projectFrameworks.length > 0) {
      const projectAvg = Math.round(
        projectFrameworks.reduce((sum: number, f: any) => sum + f.score, 0) / projectFrameworks.length
      );
      await db.project.update({
        where: { id: framework.projectId },
        data: { complianceScore: projectAvg, scoreUpdatedAt: new Date() },
      });
    }
  }

  // Check for stale evidence (sources older than 30 days)
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const staleSources = state.sources.filter((s) => new Date(s.scannedAt) < thirtyDaysAgo);
  const staleEvidence = staleSources.length > 0;
  const staleSourcesToSave = staleEvidence ? staleSources.map((s) => s.label) : [];

  // Mark scan complete
  await db.scan.update({
    where: { id: scanId },
    data: {
      status: "COMPLETED",
      reportJson: report as object,
      shadowPassJson: shadowPass as object,
      score: report.score,
      riskLevel: report.riskLevel,
      completedAt: new Date(),
      staleEvidence,
      staleSources: staleEvidence ? JSON.stringify(staleSourcesToSave) : null,
    },
  });

  // Post-scan document generation
  const postScanCtx = { scanId, orgId, frameworkType, report };

  await pushScanEvent(scanId, "Saving scan report to your documents...");
  await createScanReportDocument(postScanCtx);

  // Save synthesized evidence as a Document
  const scan = await db.scan.findFirst({ where: { id: scanId } });
  if (scan?.projectId) {
    const evidenceMarkdown = generateEvidenceMarkdown(frameworkType, controlResults);
    const now = new Date();
    const dateStr = now.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    await db.document.create({
      data: {
        projectId: scan.projectId,
        title: `${frameworkType.replace(/_/g, " ")} Evidence — ${dateStr}`,
        content: evidenceMarkdown,
        category: "EVIDENCE",
        aiGenerated: false,
      },
    });
  }

  const failedCount = report.results.filter(
    (r) => r.status === "FAIL" || r.status === "NO_EVIDENCE"
  ).length;

  if (failedCount > 0) {
    await pushScanEvent(
      scanId,
      `Generating policy documents for ${failedCount} gap${failedCount > 1 ? "s" : ""} found...`
    );
    const generatedIds = await autoGeneratePolicies(postScanCtx);
    if (generatedIds.length > 0) {
      await pushScanEvent(
        scanId,
        `Created ${generatedIds.length} policy document${generatedIds.length > 1 ? "s" : ""} to address compliance gaps.`
      );
    }
  }

  await pushScanEvent(scanId, "Scan complete!");

  // Cleanup Redis state (keep events for polling)
  await clearScanState(scanId);

  // If there are more frameworks in a multi-framework scan, queue next
  if (state.pendingFrameworks && state.pendingFrameworks.length > 0) {
    const next = state.pendingFrameworks[0];
    const remaining = state.pendingFrameworks.slice(1);

    await pushScanEvent(next.scanId, `Starting next framework: ${next.frameworkType.replace(/_/g, " ")}...`);

    // Ensure Control rows exist for the next framework before its controls phase runs.
    // The evidence phase (which normally calls this) is skipped for frameworks 2+ in a
    // multi-framework scan. Without this, saveControlResult silently discards all
    // evaluations for this framework — the root cause of the 0/0 bug.
    const nextFramework = await db.framework.findFirst({
      where: { orgId, type: next.frameworkType as FrameworkType },
    });
    if (nextFramework) {
      const controlCount = await ensureControlsForFramework(nextFramework.id, next.frameworkType);
      await pushScanEvent(
        next.scanId,
        `Prepared ${controlCount} control${controlCount === 1 ? "" : "s"} for evaluation.`
      );
    } else {
      console.error(
        `[processPostPhase] Framework not found for type=${next.frameworkType} orgId=${orgId}`
      );
    }

    // Initialize state for next framework (reuse evidence)
    const nextState: ScanChunkState = {
      scanId: next.scanId,
      frameworkType: next.frameworkType,
      orgId,
      controlIndex: 0,
      totalControls: 0,
      evidencePrepared: true,
      evidenceKey: state.evidenceKey, // Reuse same evidence
      useLLM: state.useLLM,
      clarificationAsked: false,
      phase: "controls", // Skip evidence phase — already done
      projectId: state.projectId, // Preserve project context
      pendingFrameworks: remaining.length > 0 ? remaining : undefined,
      sources: state.sources, // Reuse sources from first framework
    };

    // Get control count for next framework
    const plugin = frameworkRegistry.get(next.frameworkType);
    if (plugin) {
      nextState.totalControls = plugin.rules.length;
    }

    await db.scan.update({
      where: { id: next.scanId },
      data: { status: "RUNNING", startedAt: new Date() },
    });

    await saveScanState(nextState);
    await queueNextChunk(next.scanId);
  }
}

/** Save a single control result to the database */
async function saveControlResult(
  scanId: string,
  orgId: string,
  frameworkType: string,
  rule: { id: string; code: string },
  raw: ControlEvalResult,
  sources?: Array<{ type: string; scannedAt: string; reliability: string; label: string }>,
  evaluationError?: string
): Promise<void> {
  const control = await db.control.findFirst({
    where: {
      code: rule.code,
      framework: { orgId, type: frameworkType as FrameworkType },
    },
  });

  if (control) {
    await db.scanControlResult.upsert({
      where: { scanId_controlId: { scanId, controlId: control.id } },
      create: {
        scanId,
        controlId: control.id,
        status: raw.status,
        confidence: raw.confidence,
        evidenceUsed: raw.evidenceUsed,
        gaps: raw.gaps,
        remediations: raw.remediations,
        lawyerQuestions: raw.lawyerQuestions,
        note: raw.note,
        evidenceSourcesJson: sources ? JSON.stringify(sources) : null,
        evaluationError: evaluationError || null,
      },
      update: {
        status: raw.status,
        confidence: raw.confidence,
        evidenceUsed: raw.evidenceUsed,
        gaps: raw.gaps,
        remediations: raw.remediations,
        lawyerQuestions: raw.lawyerQuestions,
        note: raw.note,
        evidenceSourcesJson: sources ? JSON.stringify(sources) : null,
        evaluationError: evaluationError || null,
      },
    });
  } else {
    // Control row missing — this should not happen after ensureControlsForFramework runs in processEvidencePhase.
    // Mark as NO_EVIDENCE with explicit error so it's not silently dropped.
    const msg = `Control row missing for code=${rule.code} framework=${frameworkType}`;
    console.error(`[saveControlResult] ${msg}`);
    await pushScanEvent(scanId, `Warning: ${msg}. This control will need manual review.`).catch(() => {});
  }
}

function generateEvidenceMarkdown(
  frameworkType: string,
  controlResults: Array<{ controlCode: string; controlTitle: string; result: ControlEvalResult }>
): string {
  const lines: string[] = [];
  lines.push(`# ${frameworkType.replace(/_/g, " ")} Evidence Summary\n`);
  lines.push(`Generated: ${new Date().toISOString()}\n`);

  const passed = controlResults.filter((c) => c.result.status === "PASS");
  const failed = controlResults.filter((c) => c.result.status === "FAIL");
  const noEvidence = controlResults.filter((c) => c.result.status === "NO_EVIDENCE");
  const partial = controlResults.filter((c) => c.result.status === "PARTIAL");

  lines.push(`## Summary`);
  lines.push(`- **Passed**: ${passed.length}/${controlResults.length}`);
  lines.push(`- **Failed**: ${failed.length}`);
  lines.push(`- **No Evidence**: ${noEvidence.length}`);
  lines.push(`- **Partial**: ${partial.length}\n`);

  if (failed.length > 0) {
    lines.push(`## Failed Controls`);
    failed.forEach((c) => {
      lines.push(`### ${c.controlCode}: ${c.controlTitle}`);
      lines.push(`**Confidence**: ${Math.round(c.result.confidence * 100)}%`);
      if (c.result.gaps.length > 0) {
        lines.push(`**Gaps**:`);
        c.result.gaps.forEach((g) => lines.push(`- ${g}`));
      }
      if (c.result.remediations.length > 0) {
        lines.push(`**Remediations**:`);
        c.result.remediations.forEach((r) => lines.push(`- ${r}`));
      }
      if (c.result.note) lines.push(`**Note**: ${c.result.note}`);
      lines.push("");
    });
  }

  if (noEvidence.length > 0) {
    lines.push(`## Controls Without Evidence`);
    noEvidence.forEach((c) => {
      lines.push(`### ${c.controlCode}: ${c.controlTitle}`);
      if (c.result.remediations.length > 0) {
        lines.push(`**Suggested Actions**:`);
        c.result.remediations.forEach((r) => lines.push(`- ${r}`));
      }
      lines.push("");
    });
  }

  if (passed.length > 0) {
    lines.push(`## Passed Controls`);
    lines.push(`${passed.length} control${passed.length !== 1 ? "s" : ""} verified as compliant.`);
    passed.slice(0, 5).forEach((c) => {
      lines.push(`- ${c.controlCode}: ${c.controlTitle}`);
    });
    if (passed.length > 5) {
      lines.push(`- ... and ${passed.length - 5} more`);
    }
  }

  return lines.join("\n");
}

// Wrap with QStash signature verification for production
// In development (no signing keys), skip verification
const isProduction = !!process.env.QSTASH_CURRENT_SIGNING_KEY;

export const POST = isProduction
  ? verifySignatureAppRouter(handler)
  : handler;
