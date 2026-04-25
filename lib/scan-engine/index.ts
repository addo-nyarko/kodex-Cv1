import type { ScanProgressEvent, ControlEvalResult } from "@/types/scan";
import type { FrameworkType } from "@prisma/client";
import { assembleEvidence } from "./evidence-assembler";
import { runControl } from "./control-runner";
import { evaluateControlWithLLM } from "./llm-evaluator";
import { runShadowPass } from "./shadow-pass";
import { narrateEvent } from "./narrator";
import { buildReport } from "./report-builder";
import { generateClarificationQuestion } from "./clarification-manager";
import { frameworkRegistry } from "@/lib/frameworks/registry";
import { db } from "@/lib/db";

export async function* runScan(
  scanId: string,
  frameworkType: string,
  orgId: string
): AsyncGenerator<ScanProgressEvent> {
  await db.scan.update({ where: { id: scanId }, data: { status: "RUNNING", startedAt: new Date() } });

  const evidence = await assembleEvidence(orgId, scanId);

  const startMessage = await narrateEvent({ type: "scan_start", evidence });
  yield { type: "narration", message: startMessage };

  const plugin = frameworkRegistry.get(frameworkType);
  if (!plugin) throw new Error(`Unknown framework: ${frameworkType}`);

  // Decide whether to use LLM evaluation (when real docs exist) or static rules
  const hasRealDocuments = evidence.documents.some((d) => d.text.length > 100);

  const controlResults: Array<{
    controlId: string;
    controlCode: string;
    controlTitle: string;
    result: ControlEvalResult;
    inheritedFromFramework?: string;
  }> = [];

  for (const rule of plugin.rules) {
    let raw: ControlEvalResult;

    if (hasRealDocuments) {
      // Use LLM evaluation with actual document content
      raw = await evaluateControlWithLLM(rule, evidence);
    } else {
      // Fall back to static keyword-based rules
      raw = runControl(rule, evidence);
    }

    const message = await narrateEvent({
      type: "control_evaluated",
      controlCode: rule.code,
      controlTitle: rule.title,
      result: raw,
      evidence,
    });
    yield { type: "narration", message, controlCode: rule.code };

    if (raw.confidence < 0.4 && raw.status !== "PASS") {
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
      return;
    }

    // Save individual control result to DB
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

  yield { type: "complete", report, shadowPass };
}
