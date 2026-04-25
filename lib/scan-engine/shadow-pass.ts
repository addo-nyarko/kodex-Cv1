import { frameworkRegistry } from "@/lib/frameworks/registry";
import { runControl } from "./control-runner";
import type { EvidencePool, ShadowPassResult } from "@/types/scan";

export async function runShadowPass(
  evidence: EvidencePool,
  excludeFramework: string
): Promise<Record<string, ShadowPassResult>> {
  const results: Record<string, ShadowPassResult> = {};

  for (const [key, plugin] of frameworkRegistry.entries()) {
    if (key === excludeFramework) continue;

    let met = 0;
    const total = plugin.rules.length;

    for (const rule of plugin.rules) {
      const result = runControl(rule, evidence);
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
