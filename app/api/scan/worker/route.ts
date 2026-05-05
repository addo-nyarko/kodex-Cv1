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
import { narrateEvent } from "@/lib/scan-engine/narrator";
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

    await pushScanEvent(scanId, `Checking: ${rule.title} (${rule.code})...`);

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

    // Narrate result
    const message = await narrateEvent({
      type: "control_evaluated",
      controlCode: rule.code,
      controlTitle: rule.title,
      result: raw,
      evidence,
    });
    await pushScanEvent(scanId, message);

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
      await saveControlResult(scanId, orgId, frameworkType, rule, raw);

      // Don't queue next chunk — wait for clarification
      return;
    }

    // Save control result to DB
    await saveControlResult(scanId, orgId, frameworkType, rule, raw);
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
      const message = await narrateEvent({
        type: "cross_framework_hit",
        framework: fw,
        shadowResult: result,
      });
      await pushScanEvent(scanId, message);
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
    },
  });

  // Post-scan document generation
  const postScanCtx = { scanId, orgId, frameworkType, report };

  await pushScanEvent(scanId, "Saving scan report to your documents...");
  await createScanReportDocument(postScanCtx);

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
  raw: ControlEvalResult
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
      },
      update: {
        status: raw.status,
        confidence: raw.confidence,
        evidenceUsed: raw.evidenceUsed,
        gaps: raw.gaps,
        remediations: raw.remediations,
        lawyerQuestions: raw.lawyerQuestions,
        note: raw.note,
      },
    });
  } else {
    // This should never happen after the Phase 4 safety net runs in processEvidencePhase.
    // If it does, the safety net failed or the plugin's rule.code doesn't match the
    // Control row's code field. Loudly log and persist a scan event so the user sees it.
    const msg = `Control row missing for code=${rule.code} framework=${frameworkType}. Result discarded.`;
    console.error(`[saveControlResult] ${msg}`);
    await pushScanEvent(scanId, `Warning: ${msg}`).catch(() => {});
  }
}

// Wrap with QStash signature verification for production
// In development (no signing keys), skip verification
const isProduction = !!process.env.QSTASH_CURRENT_SIGNING_KEY;

export const POST = isProduction
  ? verifySignatureAppRouter(handler)
  : handler;
