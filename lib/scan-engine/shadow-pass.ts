import { frameworkRegistry } from "@/lib/frameworks/registry";
import { runControl } from "./control-runner";
import { evaluateControlWithLLM } from "./llm-evaluator";
import type { EvidencePool, ShadowPassResult } from "@/types/scan";

export async function runShadowPass(
  evidence: EvidencePool,
  excludeFramework: string
): Promise<Record<string, ShadowPassResult>> {
  const results: Record<string, ShadowPassResult> = {};

  // Determine if we should use LLM evaluation (if documents are present)
  const hasDocuments = evidence.documents.some((d) => d.text.length > 100);
  const useLLM = hasDocuments;

  for (const [key, plugin] of frameworkRegistry.entries()) {
    if (key === excludeFramework) continue;

    let met = 0;
    const total = plugin.rules.length;

    for (const rule of plugin.rules) {
      // Use LLM evaluation if documents present, otherwise fall back to static checks
      const result = useLLM
        ? await evaluateControlWithLLM(rule, evidence)
        : runControl(rule, evidence);
      if (result.status === "PASS") met++;
    }

    results[key] = {
      met,
      total,
      pct: total > 0 ? Math.round((met / total) * 100) : 0,
    };
  }

  return results;
}
