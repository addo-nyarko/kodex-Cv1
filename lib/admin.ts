/**
 * Founder admin allow-list. Emails here bypass all plan limits app-wide.
 *
 * Hardcoded, not DB-backed — solo founder pre-launch, the ceremony isn't worth it.
 * Case-insensitive + trimmed: Supabase normalises on signup but we normalise here too.
 *
 * SECURITY: use only for limit/quota bypasses. Never use to bypass data-access or
 * privacy checks — if the bypass misfires, the worst case is an extra test project,
 * not a data leak.
 *
 * When you add a teammate: append their email below.
 * When you build real RBAC: replace this file's exports with DB-backed equivalents.
 * The rest of the app calls isAdmin / isOverLimit and doesn't care how they're backed.
 */
const ADMIN_EMAILS = new Set<string>([
  "nyarkooo8@gmail.com",
]);

/**
 * Returns true if the email is on the founder allow-list.
 * Fails closed: null / undefined / empty → false.
 */
export function isAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.has(email.trim().toLowerCase());
}

/**
 * Returns true if the user is over the limit and should be BLOCKED.
 * Returns false (do not block) when:
 *   - User is on the admin allow-list (founder bypass)
 *   - Count is below the limit
 *   - Limit is -1 / Infinity (unlimited tier)
 *
 * Use this at every limit-gate in the API so the bypass is automatic.
 *
 * @example
 *   if (isOverLimit(session, currentCount, planLimit)) {
 *     return Response.json({ error: "Limit reached" }, { status: 403 });
 *   }
 */
export function isOverLimit(
  session: { isAdmin: boolean },
  currentCount: number,
  limit: number
): boolean {
  if (session.isAdmin) return false;
  if (limit === -1 || limit === Infinity) return false;
  return currentCount >= limit;
}
