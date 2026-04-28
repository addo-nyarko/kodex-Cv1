import { anthropic, AI_MODELS } from "@/lib/ai";
import { aggregateScore, classifyRisk } from "./control-runner";
import type { ControlEvalResult, FrameworkReport, RemediationTask, ScanControlResult } from "@/types/scan";

interface ControlResultInput {
  controlId: string;
  controlCode: string;
  controlTitle: string;
  result: ControlEvalResult;
  inheritedFromFramework?: string;
}

export async function buildReport(
  frameworkType: string,
  controlResults: ControlResultInput[],
  evidence: { onboarding: { companyName: string; industry: string } }
): Promise<FrameworkReport> {
  const results: ScanControlResult[] = controlResults.map((cr) => ({
    controlId: cr.controlId,
    controlCode: cr.controlCode,
    controlTitle: cr.controlTitle,
    status: cr.result.status,
    confidence: cr.result.confidence,
    evidenceUsed: cr.result.evidenceUsed,
    gaps: cr.result.gaps,
    remediations: cr.result.remediations,
    lawyerQuestions: cr.result.lawyerQuestions,
    note: cr.result.note,
    inheritedFromFramework: cr.inheritedFromFramework,
  }));

  const allResults = controlResults.map((cr) => cr.result);
  const score = aggregateScore(allResults);
  const riskLevel = classifyRisk(score);

  const controlsPassed = results.filter((r) => r.status === "PASS").length;
  const controlsFromOtherFrameworks = results.filter((r) => r.inheritedFromFramework).length;

  const roadmap = buildRoadmap(results);
  const executiveSummary = await generateExecutiveSummary(
    frameworkType,
    score,
    riskLevel,
    results,
    evidence.onboarding
  );

  return {
    framework: frameworkType,
    riskLevel,
    score,
    controlsTotal: results.length,
    controlsPassed,
    controlsFromOtherFrameworks,
    results,
    roadmap,
    executiveSummary,
  };
}

function buildRoadmap(results: ScanControlResult[]): RemediationTask[] {
  const failed = results.filter((r) => r.status === "FAIL" || r.status === "NO_EVIDENCE");

  const priorityOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

  return failed
    .map((r): RemediationTask => ({
      controlCode: r.controlCode,
      title: `Remediate: ${r.controlTitle}`,
      description: r.remediations[0] ?? "Address the identified gaps",
      priority: r.confidence > 0.8 ? "HIGH" : "MEDIUM",
      effortEstimate: "1-3 weeks",
      lawyerQuestions: r.lawyerQuestions,
      articleRef: r.controlCode,
    }))
    .sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
}

async function generateExecutiveSummary(
  framework: string,
  score: number,
  riskLevel: string,
  results: ScanControlResult[],
  onboarding: { companyName: string; industry: string }
): Promise<string> {
  const passed = results.filter((r) => r.status === "PASS").length;
  const failed = results.filter((r) => r.status === "FAIL").length;
  const noEvidence = results.filter((r) => r.status === "NO_EVIDENCE").length;

  const msg = await anthropic.messages.create({
    model: AI_MODELS.SMART,
    max_tokens: 1500,
    system: "You are a compliance expert writing an executive summary for a compliance report. Be professional, specific, and actionable. 3-4 sentences.",
    messages: [
      {
        role: "user",
        content: `Company: ${onboarding.companyName} (${onboarding.industry})\nFramework: ${framework}\nScore: ${score}%\nRisk level: ${riskLevel}\nControls passed: ${passed}/${results.length}\nControls failed: ${failed}\nNo evidence: ${noEvidence}\n\nWrite the executive summary.`,
      },
    ],
  });

  return (msg.content[0] as { text: string }).text;
}
