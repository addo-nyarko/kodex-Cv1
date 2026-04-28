# Kodex — Session Handoff

**Last updated:** 2026-04-23

## What Kodex is
EU compliance SaaS for SMB/startup founders (1-10 people). "Vanta for EU", wedge = EU AI Act + chat-first onboarding. Founder answers plain-English questions → Kodex tells them which frameworks apply, what risk tier they are, and exactly what docs to upload. Scan reads uploaded docs and cites pass/fail per control. Code scanning is a future optional boost (not v1).

## Stack
- Next.js 16 (Turbopack, `params` are Promises, `middleware.ts` → rename to `proxy.ts` later)
- Prisma 7 with `@prisma/adapter-pg`, config at `prisma.config.ts` (reads `DATABASE_URL` via `import "dotenv/config"`)
- Clerk v7 (uses `SIGN_IN_FALLBACK_REDIRECT_URL` / `FORCE_REDIRECT_URL` — NOT the old `AFTER_SIGN_IN_URL`)
- Supabase Postgres via **Session Pooler** (`aws-0-eu-west-1.pooler.supabase.com:5432`, user `postgres.vexaalwhhpehhtcrjmid`, password URL-encoded `%23%25`)
- Anthropic = scan engine + classifier; OpenAI `gpt-4o-mini` = chat
- Redis: Docker local (`docker compose up`), Upstash planned for prod
- BullMQ + ioredis workers at `workers/index.ts`
- Supabase MCP added to `.mcp.json` — user authenticated via `/mcp`, but **requires Claude Code restart** to expose tools

## Repo quick map
- `app/(dashboard)/` — dashboard pages (frameworks, scan, evidence, policies, ai-assistant, settings, onboarding/questionnaire)
- `app/api/` — onboarding, frameworks, scan, ai, evidence, billing, webhooks
- `lib/auth-helper.ts` — `getSession()`: JIT-creates User + personal Organization + OrgMember(OWNER). Handles clerkId/email collision (if user row exists by email, attaches clerkId)
- `lib/onboarding/classifier.ts` — Anthropic Haiku call, strict JSON → `{riskTier, applicableFrameworks, summary, documentChecklist, plainEnglishExplainer}`
- `lib/scan-engine/` — existing LLM control-runner (see "known issues" below)
- `lib/frameworks/` — framework plugin definitions
- `middleware.ts` — CSP skipped in dev, locked in prod

## What's working end-to-end
- Sign in (Clerk) → auto-provisioned User + Org + OWNER membership
- Dashboard renders
- Add framework via `/api/frameworks` (fixed body-re-read bug — branches on Content-Type)
- **Questionnaire flow (built this session)** — 8 questions → Anthropic classifier → saves risk tier, applicable frameworks, smart document checklist to Organization
- Scan job plumbing runs (SSE) — but see "scan is theater" below

## What was built this session
1. Extended `Organization` schema with: `productDescription`, `aiPurposes[]`, `userTypes[]`, `usesThirdPartyAI`, `thirdPartyProviders[]`, `trainsOwnModels`, `hasPrivacyPolicy`, `riskTier`, `applicableFrameworks[]`, `documentChecklist` (Json), `questionnaireAnswers` (Json), `questionnaireCompletedAt`. Migration `20260423130150_add_questionnaire_fields` applied.
2. [lib/onboarding/classifier.ts](lib/onboarding/classifier.ts) — Anthropic classifier
3. [app/api/onboarding/questionnaire/route.ts](app/api/onboarding/questionnaire/route.ts) — POST (save + classify), GET (read current state)
4. [app/(dashboard)/onboarding/questionnaire/page.tsx](app/(dashboard)/onboarding/questionnaire/page.tsx) — 8-question UI with toggle/chip inputs + result screen
5. Fixed `auth-helper.ts` email-unique-collision bug
6. Fixed `.env` DATABASE_URL (space before `=`, unencoded `#`/`%`)
7. Added Supabase MCP to `.mcp.json` (needs Claude Code restart to activate)

## Current blocker
User manually deleted their `User` row from Supabase to start fresh and can't log in. Exact failure mode unknown — user hasn't shared the error yet. Likely causes:

- **Orphan `Organization`** — `Organization.ownerId` has no `onDelete` cascade, so deleting only `User` leaves dangling orgs and blocks recreation
- **Stale Clerk session cookie** — even after DB wipe, Clerk still sends the old `clerkId` until they sign out

### Fix to try first
In Supabase SQL editor:
```sql
TRUNCATE "User", "Organization", "OrgMember", "Framework", "Control", "Evidence",
         "Scan", "ScanControlResult", "ScanClarification" CASCADE;
```
Then sign out of Clerk (or use incognito) and sign back in.

## Product philosophy (agreed with user)
- **Target:** non-technical founders at 1-10 person startups. Example user: "Bob" — autonomous local AI that troubleshoots PCs by running scripts. EU AI Act Limited Risk.
- **Vanta loop:** connect → check → fix → prove. Continuous monitoring = just the same scan on a cron. Get the one-shot right first.
- **v1 scope:** questionnaire + doc upload + scan-reads-docs + dashboard. **Drop** GitHub/MCP code scanning, rules engine, cross-framework mapping for v1.
- **Not theater:** current scan asks the LLM "is this control satisfied?" with empty evidence — meaningless. v2 must feed real uploaded-doc content into each control check and cite quotes.

## Known issues / next priorities
1. **Scan is theater** (blocker for real product) — `POST /api/scan` runs a control-runner loop against empty evidence. 3.1min of LLM calls producing nothing. Needs: after upload, scan reads PDF text → per control asks Anthropic "pass/fail given this doc?" → cites line/quote.
2. **Scan page UX** — raw framework-ID textbox. Should be a dropdown populated from user's `Framework` rows.
3. **Questionnaire checklist not wired to upload** — classifier outputs `documentChecklist` but the evidence upload page doesn't read it. Need: upload page shows the checklist, each item = one upload slot.
4. **Rotate leaked dev credentials** before prod — user pasted live DB password + Clerk/Anthropic/OpenAI keys in earlier transcripts.
5. Rename `middleware.ts` → `proxy.ts` (Next.js 16 deprecation warning, not urgent).

### Tester agent (v2 — deferred)

`lib/scan-engine/tester-agent/*` is a complete Puppeteer-based live-site checker
(cookie banners, GDPR rights, PII patterns, security headers, third-party trackers).
Code is good and tested locally. **Cannot run on Vercel** because:
- `puppeteer` package = ~170MB Chromium, exceeds Vercel's 250MB function size cap
- Site checks take 60–120s, exceeds Vercel's 60s Pro function timeout
- Cold-start launch of Chrome is 3–8s, too slow for serverless

The route at `app/api/scan/test/route.ts` is gated off via `ENABLE_TESTER_AGENT=true`.
In production this returns 503 with a "coming soon" message.

**To ship v2:**
1. Sign up for [Browserless.io](https://browserless.io) or [Browserbase](https://browserbase.com).
   Browserbase is purpose-built for AI agents (~$0.10/session, ~$30/mo for early traction).
2. In `lib/scan-engine/tester-agent/site-checker.ts`, replace `puppeteer.launch()` with
   `puppeteer.connect({ browserWSEndpoint: process.env.BROWSER_WS_ENDPOINT })`.
3. Switch the dependency from `puppeteer` to `puppeteer-core` (no Chromium download).
4. Implement URL-ownership verification (see TODO in `app/api/scan/test/route.ts`):
   - For GitHub-connected projects, fetch `repository.homepage` from the GitHub API and
     allow that exact URL only.
   - For other projects, generate a per-org verification token, ask the user to host it
     at `https://their-domain.com/.well-known/kodex-verification.txt`, and verify before
     allowing the scan.
5. Set `ENABLE_TESTER_AGENT=true` in Vercel for production.
6. Update the dashboard to show a "Run live site test" button when the org has a
   verified URL.

The compliance scanner (`/api/scan/worker`) is independent of this and ships now.

## Recommended next step
Fix login blocker → then wire `documentChecklist` → upload slots → then make scan read those uploads and cite per-control. That's the minimum path from "onboarding demo" to "the scan means something."

## User's vision doc (for reference)
Three input paths (upload / dashboard / chat-first), two scan inputs (docs + GitHub MCP), three-phase pipeline (rules engine → code scanner → Anthropic 3-call), SSE lifecycle with named phases (INIT/CONNECT/DISCOVER/DEEP SCAN/LLM ANALYSIS/RENDER), two-brain chat (Anthropic back-office structured JSON + OpenAI front-desk conversational). **Adopt the structure, not the technicality** — our `lib/scan-engine/` should mirror the layering (`rules/`, `code/`, `llm/`, `orchestrator/`) over time. v1 = `llm/` layer reading `docs/` input only.
