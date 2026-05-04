import { db } from "@/lib/db";
import { frameworkRegistry } from "@/lib/frameworks/registry";
import type { FrameworkType } from "@prisma/client";

/**
 * Ensure that Control rows exist in the database for a given framework.
 *
 * The framework plugin defines rules (lib/frameworks/<fw>/rules.ts). At runtime,
 * the scan engine evaluates these rules in memory, then calls `saveControlResult`
 * which looks up a matching `Control` DB row by (frameworkId, code) — if the row
 * is missing, the evaluation result is silently discarded.
 *
 * This helper is the single source of truth for creating those Control rows.
 * Call it whenever a Framework is created or before a scan begins, to guarantee
 * that the rules table and the Control table are in sync.
 *
 * Idempotent. Safe to call multiple times.
 *
 * @param frameworkId - The Framework row's id
 * @param frameworkType - The framework type used to look up the plugin (e.g. "EU_AI_ACT")
 * @returns The number of Control rows present after the operation (created or pre-existing).
 *          Returns 0 if the plugin is not found in the registry.
 */
export async function ensureControlsForFramework(
  frameworkId: string,
  frameworkType: FrameworkType | string
): Promise<number> {
  const plugin = frameworkRegistry.get(frameworkType);
  if (!plugin) {
    console.warn(
      `[ensureControlsForFramework] no plugin found for frameworkType=${frameworkType}`
    );
    return 0;
  }

  // upsert each rule's Control row. The unique constraint on (frameworkId, code)
  // makes this safe to run repeatedly.
  for (const rule of plugin.rules) {
    await db.control.upsert({
      where: {
        frameworkId_code: { frameworkId, code: rule.code },
      },
      create: {
        frameworkId,
        code: rule.code,
        title: rule.title,
        description: rule.title, // plugins don't have separate descriptions today
        status: "NOT_STARTED",
      },
      update: {
        // Keep title/description in sync if rule definitions change in code,
        // but never overwrite operator-set status fields.
        title: rule.title,
        description: rule.title,
      },
    });
  }

  // Keep the framework's totalControls denormalised count accurate
  await db.framework.update({
    where: { id: frameworkId },
    data: { totalControls: plugin.rules.length },
  });

  return plugin.rules.length;
}
