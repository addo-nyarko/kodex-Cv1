# Kodex Codebase State Audit

**Date:** 2026-05-01
**Branch:** main (clean — no uncommitted changes)
**Last commit:** `3d11063 fix: total refactor continuation`

---

## TL;DR

All three migrations (Clerk → Supabase Auth, Vercel → Render, S3 → Supabase Storage) are **code-complete and building clean**. The build passes, TypeScript is clean, Prisma schema is valid. The most dangerous live issue is that **QStash env vars (`QSTASH_TOKEN`, `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY`) are not documented in `.env.example` and may not be set in Render's environment** — if they're missing, no scan can ever run. The second issue is that **there is no health check endpoint** and no `render.yaml`, so Render has no way to verify the service started.

---

## Section 1 — Clerk leftovers

**Status:** ✅ Clean

**Findings:**
- 🟢 No `@clerk/*` imports anywhere in source files
- 🟢 No Clerk packages in `package.json`
- 🟢 No Clerk env vars in any `.env` file
- 🟢 No `clerkId` column in Prisma schema
- 🟢 `app/(auth)/sign-in/page.tsx` has a local `SignInForm` and `SignInPage` component — these are your own components, not Clerk exports
- 🟢 `lib/integrations/github-scanner.ts:161` — scans user repos for "clerk" as a string pattern to detect auth libs. Not a Clerk dependency. Safe.
- 🟢 `HANDOFF.md` mentions Clerk historically. Optional cleanup.

**Required actions:** None.

---

## Section 2 — Vercel artifacts

**Status:** 🟡 Minor dead code, one misleading error message

**Findings:**
- 🟡 `app/api/scan/test/route.ts:15` — `export const maxDuration = 60; // Vercel Pro cap`
- 🟡 `app/api/scan/worker/route.ts:37` — `export const maxDuration = 10; // Vercel free tier limit`
  - Both are Vercel-only settings. On Render, these are ignored. They don't cause errors but are dead code and mislead anyone reading those files.
- 🟡 `lib/queue/scan-queue.ts:121-122` — fallback to `VERCEL_URL` if `NEXT_PUBLIC_APP_URL` is unset. On Render, `VERCEL_URL` won't exist, so the code will throw: `"Cannot determine base URL for QStash callback. Set NEXT_PUBLIC_APP_URL in Vercel environment variables."` — the error message still says "Vercel" even though you're on Render. This only fires if `NEXT_PUBLIC_APP_URL` is unset; **setting it in Render env variables is mandatory**.
- 🟢 `public/vercel.svg` — Next.js default asset, harmless
- 🟢 No `vercel.json` or `.vercel` folder

**Required actions:**
- Set `NEXT_PUBLIC_APP_URL` in Render environment variables (critical — see Section 5)
- Optional: remove the two `maxDuration` exports and update the throw message from "Vercel" to generic

---

## Section 3 — Auth state

**Status:** ✅ Migration code-complete

**Findings:**
- ✅ `lib/supabase/server.ts` — cookie-based server client (correct for Next.js App Router)
- ✅ `lib/supabase/browser.ts` — browser client
- ✅ `lib/supabase/admin.ts` — service-role client, never exposed to browser
- ✅ `lib/auth-helper.ts` — `getSession()` uses email-based JIT lookup: reads Supabase Auth session, finds/creates `User` by email, finds/creates personal `Organization`. No `clerkId` anywhere.
- ✅ `proxy.ts` — Next.js 15 accepts `proxy.ts` as an alternative middleware file name (the build output confirms: `ƒ Proxy (Middleware)`). The middleware correctly: refreshes session tokens, gates non-public routes, and exempts `/api/scan/worker` from auth (QStash calls that route server-to-server).
- ✅ Auth pages all present: `sign-in`, `sign-up`, `forgot-password`, `reset-password`, `onboarding`
- ✅ Auth callback at `app/auth/callback/route.ts` — exchanges code for session, redirects to `/dashboard`
- ✅ 33 files call `getSession`/`requireSession` — consistent usage across the API
- ✅ No `clerkId` column in `User` schema

**Required actions:** None. Auth is fully migrated.

---

## Section 4 — Storage refactor

**Status:** ✅ Complete

**Findings:**
- ✅ `lib/s3.ts` — deleted
- ✅ `lib/storage.ts` — present with Supabase Storage helpers
- ✅ `lib/supabase/admin.ts` — admin client for server-side downloads
- ✅ Zero AWS SDK imports in source files
- ✅ Zero `@aws-sdk/*` packages in `package.json`
- ✅ Zero S3 env var references in code
- ✅ Only one file imports from `@/lib/storage`: `app/api/evidence/upload/route.ts` — that's correct

**Required actions:** None. Verify once live: upload a PDF as evidence, trigger a scan, confirm extracted text appears.

---

## Section 5 — Scan engine wiring

**Status:** 🔴 QStash env vars undocumented — likely not set on Render

**Findings:**

### 5a. getBaseUrl() — Render safe IF NEXT_PUBLIC_APP_URL is set
```
getBaseUrl() priority:
  1. NEXT_PUBLIC_APP_URL → use this (set it in Render!)
  2. VERCEL_URL → won't exist on Render → throw with misleading "Vercel" error
  3. NODE_ENV=development → localhost:3000
```
**If `NEXT_PUBLIC_APP_URL` is not set in Render, every scan fails at chunk 1 with a thrown exception.** This is almost certainly why scans aren't working on Render if they're broken.

### 5b. Worker route auth — correct
- `/api/scan/worker` is in `PUBLIC_API_PREFIXES` in `proxy.ts` — middleware skips auth for it. ✅
- In production: wrapped with `verifySignatureAppRouter(handler)` using `QSTASH_CURRENT_SIGNING_KEY`. ✅
- In dev: auth bypassed if `QSTASH_CURRENT_SIGNING_KEY` is not set. ✅

### 5c. QStash env vars — NOT in .env.example
These three vars are used in code but **not documented anywhere**:
- `QSTASH_TOKEN` — required by `lib/queue/scan-queue.ts` to publish jobs to QStash
- `QSTASH_CURRENT_SIGNING_KEY` — required by `app/api/scan/worker/route.ts` to verify QStash signatures
- `QSTASH_NEXT_SIGNING_KEY` — used by the same verification

If any of these are missing from Render's environment variables:
- Missing `QSTASH_TOKEN` → `qstash.publishJSON()` fails → scan never starts
- Missing `QSTASH_CURRENT_SIGNING_KEY` → worker runs in dev mode (no verification) — **security hole in production**

### 5d. Legacy BullMQ workers/ folder
- `workers/index.ts` and `workers/scan-processor.ts` exist
- They use `bullMQConnection` (IORedis) from `lib/redis.ts` which exists
- `npm run worker` script exists in `package.json`
- **These are completely dead code in the current QStash architecture.** They import `runScan` from `lib/scan-engine` which still works, but nobody calls them in the normal flow.
- If you run `npm run worker` on Render as a separate process, it would try to connect to `REDIS_URL` (full Redis URL) — this is the IORedis connection, not the Upstash REST URL. On Upstash, you'd need the `rediss://` URL, not the REST endpoint.
- **Recommendation:** Don't use these. The QStash path is the right one.

**Required actions:**
1. 🔴 Add to Render environment variables: `QSTASH_TOKEN`, `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY` (get from Upstash QStash dashboard)
2. 🔴 Confirm `NEXT_PUBLIC_APP_URL` is set to your Render domain (e.g., `https://kodex.onrender.com`)
3. 🟡 Add the three QStash vars to `.env.example` so they're not forgotten again

---

## Section 6 — Render deployment fitness

**Status:** 🟡 Works but undocumented and no health check

**Findings:**
- ❌ No `render.yaml` — deployment is configured manually in Render web UI. Acceptable for now but means the config lives only in Render's dashboard, not in source control.
- ✅ `postinstall: prisma generate` — runs on every `npm install`. Render runs `npm install` as part of build, so Prisma client is always generated.
- ✅ `build: prisma generate && next build` — runs `prisma generate` twice (harmless redundancy).
- ✅ `start: next start` — correct for Next.js on Render.
- ✅ `.nvmrc` → Node 20. Render auto-detects this.
- ❌ No health check route. Render needs an HTTP endpoint (typically `/api/health`) to confirm the service is up after deploy. Without it, Render uses a TCP check, which passes even if the app is broken.
- ✅ All major env vars documented in `.env.example`
- ❌ Missing from `.env.example`: `QSTASH_TOKEN`, `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY`

**Render env vars to confirm are set:**
```
DATABASE_URL
DIRECT_URL
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
NEXT_PUBLIC_APP_URL          ← critical for QStash callbacks
ANTHROPIC_API_KEY
OPENAI_API_KEY
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
QSTASH_TOKEN                 ← missing from env example
QSTASH_CURRENT_SIGNING_KEY   ← missing from env example
QSTASH_NEXT_SIGNING_KEY      ← missing from env example
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
STRIPE_*_PRICE_ID            ← all 6 price IDs
RESEND_API_KEY
ENCRYPTION_KEY
INTEGRATION_ENCRYPTION_KEY
```

**Required actions:**
1. Add `QSTASH_TOKEN`, `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY` to `.env.example`
2. Create a `/api/health` route that returns `{ ok: true }` so Render can health-check

---

## Section 7 — Build state

**Status:** ✅ Pass

- `npm run build` — exits 0, no errors, no warnings
- `tsc --noEmit` — exits 0, no type errors
- `prisma validate` — schema valid
- Build output confirms: `ƒ Proxy (Middleware)` — middleware is active

---

## Section 8 — Database inspection

Run `audit/db-inspection.sql` in Supabase SQL Editor and share the results. Without those we cannot confirm:
- Whether `clerkId` is still in the live schema (the Prisma schema says it's gone, but migrations may not have applied)
- Whether any users have stale data
- Whether RLS policies are correctly set up on the evidence bucket
- Whether scans are stuck in RUNNING state

---

## Top 5 priorities, ranked

1. **🔴 QStash env vars missing from Render.** `QSTASH_TOKEN`, `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY` are not in `.env.example` and were likely never added to Render's environment variables. Without `QSTASH_TOKEN`, no scan job can be published. Without `QSTASH_CURRENT_SIGNING_KEY`, production worker runs without signature verification (security hole). Check Render dashboard → Environment → confirm all three are present.

2. **🔴 NEXT_PUBLIC_APP_URL must be set on Render.** If missing, the first scan chunk throws immediately because `getBaseUrl()` can't determine where to send QStash callbacks. Set this to your Render domain before any scan testing.

3. **🟠 Run db-inspection.sql and share results.** We can't confirm whether the DB schema matches the Prisma schema, whether stuck scans need clearing, or whether RLS policies are correct on the evidence bucket.

4. **🟡 No health check endpoint.** Render falls back to TCP check without one. A broken Next.js app that bound to port 3000 would still pass TCP. Add `GET /api/health → { ok: true }` so Render can actually verify the service.

5. **🟡 Add QStash vars to .env.example.** Currently they exist only in code. Anyone setting up Render (including future-you) will miss them.

---

## What to do next

**Prompt 1 — Quick wins (15 minutes):** Add the three QStash vars to `.env.example`, confirm they're set in Render dashboard, confirm `NEXT_PUBLIC_APP_URL` is set, add a `/api/health` route. These are all small and unblocking.

**Prompt 2 — Run db-inspection.sql.** Share the results; we'll decide if any schema cleanup is needed.

**Prompt 3 — Smoke test scans.** Once env vars are confirmed, trigger a scan on Render and watch the QStash dashboard for delivery + retry logs. The worker route logs will tell us where it breaks.

**Prompt 4 (optional) — Clean up dead code.** Remove `workers/`, the two `maxDuration` exports, update the `getBaseUrl` error message, add `render.yaml` to document the deploy config.
