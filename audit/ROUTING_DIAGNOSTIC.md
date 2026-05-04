# Routing Diagnostic

**Date:** 2026-05-05

## TL;DR

4 of 4 surfaces have issues: scan detail page missing, document view/download routes missing, policies page shows hardcoded data instead of DB queries, PDF route exists but depends on missing document endpoints.

---

## Surface 1: Scan Detail Page

- **URL user tries to navigate to:** None — `/scan` page displays results inline
- **Page file exists:** ❌ NO
  - Looking for: `app/(dashboard)/scan/[scanId]/page.tsx`
  - What exists: Only `app/(dashboard)/scan/page.tsx` which exports `ScanRunner` component
- **Current behavior:** ScanRunner displays all scan results inline on `/scan` (single list view)
- **What doesn't work:** No way to view a single scan's details in isolation; no scan-detail URL pattern
- **API support:** PDF route exists at `/api/scan/[scanId]/pdf` ✓, but no sibling HTML detail route

---

## Surface 2: Document View/Download Routes

- **URLs user tries to navigate to:**
  - `window.open(/api/documents/{id}/view)` — View document in browser
  - `/api/documents/{id}/download` — Download document
- **API routes exist:** ❌ NO
  - `/api/documents` (GET) exists — lists documents ✓
  - `/api/documents/[id]/view` — MISSING ✗
  - `/api/documents/[id]/download` — MISSING ✗
- **Current behavior:** Buttons render, but onClick handlers try to open/download from non-existent endpoints → 404
- **Data in DB:** Document records should exist (if scans created SCAN_REPORT / POLICY documents)
- **Need to implement:** Dynamic route handler at `app/api/documents/[id]/route.ts` with view/download logic

---

## Surface 3: Policies Page

- **URL:** `app/(dashboard)/policies/page.tsx` exists ✓
- **Current behavior:** Displays hardcoded sample policies (names, frameworks, statuses)
  - Sample data is in `PolicyManager.tsx` lines 7-14
  - No database queries — no real policies shown
- **Policy documents in DB:** Uncertain (need SQL check from audit/routing-diagnostic.sql)
- **What's broken:** Even if POLICY category documents exist in DB, the page doesn't fetch or display them
- **API used:** Calls `/api/ai/generate-policy` to generate new policies ✓
- **Need to implement:** Fetch POLICY documents from `/api/documents?category=POLICY` and display real data instead of samples

---

## Surface 4: PDF Download

- **URL:** `/api/scan/[scanId]/pdf`
- **API route exists:** ✓ YES — `app/api/scan/[scanId]/pdf/route.ts`
- **What it returns:** HTML audit report (meant to be printed as PDF)
- **Dependency:** Calls `generateAuditPdfHtml` from `lib/scan-engine/pdf-report.ts`
- **Status:** Working — no changes needed here

---

## Root Causes by Priority

### Priority 1 (Highest Impact — Blocks demo use)

**Document API routes `/[id]/view` and `/[id]/download` are completely missing.**

- Files to create:
  - `app/api/documents/[id]/route.ts` (or split into `route.ts` for both, or separate `/view` and `/download` subdirs)
- Scope: Handle GET requests for doc by ID, return either file download or HTML view
- Current impact: Every "View" and "Download" button in Documents page fails

### Priority 2

**Scan detail page missing** — but less urgent because results display on `/scan` inline.

- File to create: `app/(dashboard)/scan/[scanId]/page.tsx`
- Scope: Show individual scan result, same content as current inline view but at dedicated URL
- Current impact: No way to share a scan result URL, no SEO-friendly deep link
- Can defer 1-2 sprints if demo only uses `/scan` overview

### Priority 3

**Policies page shows hardcoded data instead of querying DB.**

- File to modify: `app/(dashboard)/policies/PolicyManager.tsx`
- Scope: Fetch POLICY documents via `/api/documents?category=POLICY`, display real data
- Current impact: Generated policies don't persist or show up; looks like broken feature
- Depends on Priority 1 working (if you want to view/download generated policies)

### Priority 4 (Lowest — Nice to Have)

**PDF route exists but is HTML export**, not actual PDF binary.

- Workaround: Users click "Download" → browser print dialog → save as PDF
- If you want PDF binary: would need a PDF library (e.g., `puppeteer`, `pdfkit`)
- Current impact: None — user can export manually, just not automated
- Can ignore for now

---

## Next Steps

Run the SQL in `audit/routing-diagnostic.sql` to confirm:
1. How many Document rows exist and of what categories
2. Whether any POLICY documents have been created by the scan engine

Then fix Priority 1 (document routes) first, which unblocks document view/download functionality and is the most broken surface right now.
