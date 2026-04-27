import type { ScanProgressEvent, ControlEvalResult, EvidencePool } from "@/types/scan";
import type { FrameworkType } from "@prisma/client";
import { assembleEvidence } from "./evidence-assembler";
import { synthesizeEvidence } from "./evidence-synthesizer";
import { runControl } from "./control-runner";
import { evaluateControlWithLLM } from "./llm-evaluator";
import { runShadowPass } from "./shadow-pass";
import { narrateEvent } from "./narrator";
import { buildReport } from "./report-builder";
import { generateClarificationQuestion } from "./clarification-manager";
import { createScanReportDocument, autoGeneratePolicies } from "./post-scan-documents";
import { frameworkRegistry } from "@/lib/frameworks/registry";
import { db } from "@/lib/db";

/**
 * Prepare enriched evidence for scanning.
 * This is the expensive part — assembles evidence from all integrations,
 * auto-syncs connected tools, and runs LLM synthesis.
 * Call this ONCE, then pass the result to runScan for each framework.
 */
export async function* prepareEvidence(
  orgId: string,
  scanId: string
): AsyncGenerator<ScanProgressEvent, EvidencePool> {
  const evidence = await assembleEvidence(orgId, scanId);

  const hasCodeSignals = Object.keys(evidence.codeSignals).length > 0;
  const hasRealDocuments = evidence.documents.some((d) => d.text.length > 100);

  const startMessage = await narrateEvent({ type: "scan_start", evidence });
  yield { type: "narration", message: startMessage };

  // Show what data sources are available
  const sources: string[] = [];
  if (hasRealDocuments) sources.push(`${evidence.documents.length} document chunks`);
  if (hasCodeSignals) {
    const gh = evidence.codeSignals.github as Record<string, unknown> | undefined;
    if (gh) sources.push(`GitHub repo scan (${gh.repo})`);
    const gws = evidence.codeSignals.googleWorkspace as Record<string, unknown> | undefined;
    if (gws) sources.push(`Google Workspace (${gws.workspace})`);
    const slack = evidence.codeSignals.slack as Record<string, unknown> | undefined;
    if (slack) sources.push(`Slack workspace (${slack.teamName})`);
    const notion = evidence.codeSignals.notion as Record<string, unknown> | undefined;
    if (notion) sources.push(`Notion (${notion.compliancePagesFound} compliance pages)`);
  }

  const hasClarifications = Object.keys(evidence.clarifications).length > 0;
  if (hasClarifications) sources.push(`${Object.keys(evidence.clarifications).length} prior answers`);

  if (sources.length > 0) {
    yield {
      type: "narration",
      message: `Working with: ${sources.join(", ")}. Let me cross-reference these against the compliance controls.`,
    };
  }

  // ── Evidence Synthesis: Claude pre-processes raw signals into compliance evidence ──
  if (hasCodeSignals || hasRealDocuments) {
    yield { type: "narration", message: "Analyzing all evidence sources for compliance patterns..." };

    const synthesis = await synthesizeEvidence(evidence);

    for (const step of synthesis.thinkingSteps) {
      yield { type: "narration", message: step };
    }

    if (synthesis.syntheticDocuments.length > 0) {
      evidence.documents.push(...synthesis.syntheticDocuments);
      yield {
        type: "narration",
        message: `Pre-analysis complete: generated ${synthesis.syntheticDocuments.length} evidence summaries covering security, data protection, quality management, and more.`,
      };
    }

    for (const [key, value] of Object.entries(synthesis.inferredAnswers)) {
      if (!evidence.questionnaire[key]) {
        evidence.questionnaire[key] = value;
      }
    }
  }

  return evidence;
}

/**
 * Run a compliance scan for a single framework.
 * Accepts optional pre-prepared evidence to avoid redundant assembly+synthesis
 * when scanning multiple frameworks in sequence.
 */
export async function* runScan(
  scanId: string,
  frameworkType: string,
  orgId: string,
  preparedEvidence?: EvidencePool
): AsyncGenerator<ScanProgressEvent> {
  await db.scan.update({ where: { id: scanId }, data: { status: "RUNNING", startedAt: new Date() } });

  let evidence: EvidencePool;

  if (preparedEvidence) {
    // Use shared evidence — skip assembly and synthesis (already done)
    evidence = preparedEvidence;
  } else {
    // Single-framework scan: assemble and synthesize inline (backwards compatible)
    const gen = prepareEvidence(orgId, scanId);
    let result = await gen.next();
    while (!result.done) {
      yield result.value;
      result = await gen.next();
    }
    evidence = result.value;
  }

  const hasCodeSignals = Object.keys(evidence.codeSignals).length > 0;

  const plugin = frameworkRegistry.get(frameworkType);
  if (!plugin) throw new Error(`Unknown framework: ${frameworkType}`);

  // Track how many controls we've already evaluated (for resume after clarification)
  const existingResults = await db.scanControlResult.findMany({
    where: { scanId },
    select: { control: { select: { code: true } } },
  });
  const alreadyEvaluated = new Set(existingResults.map((r) => r.control.code));

  // Decide whether to use LLM evaluation
  const hasDocumentsNow = evidence.documents.some((d) => d.text.length > 100);
  const useLLM = hasDocumentsNow || hasCodeSignals;

  const controlResults: Array<{
    controlId: string;
    controlCode: string;
    controlTitle: string;
    result: ControlEvalResult;
    inheritedFromFramework?: string;
  }> = [];

  let clarificationAsked = false;

  for (const rule of plugin.rules) {
    if (alreadyEvaluated.has(rule.code)) {
      const existing = await db.scanControlResult.findFirst({
        where: { scanId, control: { code: rule.code } },
        include: { control: true },
      });
      if (existing) {
        controlResults.push({
          controlId: rule.id,
          controlCode: rule.code,
          controlTitle: rule.title,
          result: {
            status: existing.status as ControlEvalResult["status"],
            confidence: existing.confidence,
            evidenceUsed: existing.evidenceUsed,
            gaps: existing.gaps,
            remediations: existing.remediations,
            lawyerQuestions: existing.lawyerQuestions,
            note: existing.note ?? "",
          },
        });
      }
      continue;
    }

    yield {
      type: "narration",
      message: `Checking: ${rule.title} (${rule.code})...`,
      controlCode: rule.code,
    };

    let raw: ControlEvalResult;

    if (useLLM) {
      raw = await evaluateControlWithLLM(rule, evidence);
    } else {
      raw = runControl(rule, evidence);
    }

    if (evidence.clarifications[rule.code]) {
      raw.confidence = Math.max(raw.confidence, 0.5);
    }

    if (hasCodeSignals && raw.confidence >= 0.3 && raw.confidence < 0.5) {
      raw.confidence = Math.min(raw.confidence + 0.15, 0.6);
    }

    const message = await narrateEvent({
      type: "control_evaluated",
      controlCode: rule.code,
      controlTitle: rule.title,
      result: raw,
      evidence,
    });
    yield { type: "narration", message, controlCode: rule.code };

    if (
      raw.confidence < 0.35 &&
      raw.status !== "PASS" &&
      !clarificationAsked &&
      !evidence.clarifications[rule.code]
    ) {
      const question = await generateClarificationQuestion(rule, evidence);
      yield { type: "clarification_needed", question, controlCode: rule.code };

      await db.scan.update({
        where: { id: scanId },
        data: {
          status: "AWAITING_CLARIFICATION",
          pendingQuestion: question,
          pendingControlCode: rule.code,
        },
      });
      clarificationAsked = true;

      const control = await db.control.findFirst({
        where: { code: rule.code, framework: { orgId, type: frameworkType as FrameworkType } },
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
      }

      return; // Pause scan
    }

    const control = await db.control.findFirst({
      where: { code: rule.code, framework: { orgId, type: frameworkType as FrameworkType } },
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
    }

    controlResults.push({
      controlId: rule.id,
      controlCode: rule.code,
      controlTitle: rule.title,
      result: raw,
    });
  }

  // Shadow pass: check how much of other frameworks is satisfied by the same evidence
  yield { type: "narration", message: "Cross-referencing against other compliance frameworks..." };

  const shadowPass = await runShadowPass(evidence, frameworkType);
  for (const [fw, result] of Object.entries(shadowPass)) {
    if (result.met > 0) {
      const message = await narrateEvent({
        type: "cross_framework_hit",
        framework: fw,
        shadowResult: result,
      });
      yield { type: "cross_framework_hit", message };
    }
  }

  yield { type: "narration", message: "Building your compliance report and remediation roadmap..." };

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

  // Update org-level compliance score (average across all framework scores)
  const allFrameworks = await db.framework.findMany({
    where: { orgId },
    select: { score: true },
  });
  const avgScore = allFrameworks.length > 0
    ? Math.round(allFrameworks.reduce((sum, f) => sum + f.score, 0) / allFrameworks.length)
    : 0;

  await db.organization.update({
    where: { id: orgId },
    data: { complianceScore: avgScore, scoreUpdatedAt: new Date() },
  });

  // Update project-level compliance score if the scan is linked to a project
  const scanRecord = await db.scan.findUnique({
    where: { id: scanId },
    select: { projectId: true },
  });
  if (scanRecord?.projectId) {
    const projectFrameworks = await db.framework.findMany({
      where: { projectId: scanRecord.projectId },
      select: { score: true },
    });
    if (projectFrameworks.length > 0) {
      const projectAvg = Math.round(
        projectFrameworks.reduce((sum, f) => sum + f.score, 0) / projectFrameworks.length
      );
      await db.project.update({
        where: { id: scanRecord.projectId },
        data: { complianceScore: projectAvg, scoreUpdatedAt: new Date() },
      });
    }
  }

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

  // ── Post-scan: create Document records so they appear in the Documents page ──
  const postScanCtx = { scanId, orgId, frameworkType, report };

  yield { type: "narration", message: "Saving scan report to your documents..." };
  await createScanReportDocument(postScanCtx);

  // Auto-generate policy documents for controls that failed or have gaps
  const failedCount = report.results.filter(
    (r) => r.status === "FAIL" || r.status === "NO_EVIDENCE"
  ).length;

  if (failedCount > 0) {
    yield {
      type: "narration",
      message: `Generating policy documents for ${failedCount} gap${failedCount > 1 ? "s" : ""} found...`,
    };
    const generatedIds = await autoGeneratePolicies(postScanCtx);
    if (generatedIds.length > 0) {
      yield {
        type: "narration",
        message: `Created ${generatedIds.length} policy document${generatedIds.length > 1 ? "s" : ""} to address compliance gaps. Check your Documents page.`,
      };
    }
  }

  yield { type: "complete", report, shadowPass };
}
