import type { ControlRule, EvidencePool, ControlEvalResult } from "@/types/scan";

export function runControl(rule: ControlRule, evidence: EvidencePool): ControlEvalResult {
  try {
    return rule.check(evidence);
  } catch (err) {
    return {
      status: "NO_EVIDENCE",
      confidence: 0,
      evidenceUsed: [],
      gaps: ["Control evaluation failed — check evidence completeness"],
      remediations: ["Provide the required evidence and re-run the scan"],
      lawyerQuestions: [],
      note: `Evaluation error: ${err instanceof Error ? err.message : "unknown"}`,
    };
  }
}

export function aggregateScore(results: ControlEvalResult[]): number {
  if (results.length === 0) return 0;
  const weights = { PASS: 1, PARTIAL: 0.5, FAIL: 0, NO_EVIDENCE: 0 } as const;
  const total = results.reduce((sum, r) => sum + (weights[r.status] ?? 0), 0);
  return Math.round((total / results.length) * 100);
}

export function classifyRisk(score: number): "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" {
  if (score < 25) return "CRITICAL";
  if (score < 50) return "HIGH";
  if (score < 75) return "MEDIUM";
  return "LOW";
}
