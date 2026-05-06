# Phase 2 Implementation Plan — Evidence Metadata, UI Clarity, Rule Tightening

**Date:** 2026-05-06  
**Status:** PLANNED (awaiting CEO/Design/Security review)  
**Scope:** 3 coordinated tasks: evidence traceability, UI transparency, framework specificity

---

## EXECUTIVE SUMMARY

Phase 1 tightened framework rules to require implementation evidence instead of keyword-only matches (8 controls across EU AI ACT, GDPR, ISO 27001). Phase 2 adds four missing layers:

1. **Task 1 — Evidence Metadata**: Track *when* and *how* each evidence piece was collected (GitHub scan 30 days ago vs today's doc upload)
2. **Task 2 — UI Display**: Show auditors *why* each control passed (based on which sources, with age/reliability)
3. **Task 3 — Remaining Framework Rules**: Apply same strictness to NIS2, DORA, CRA, PLD, Custom (5 frameworks, 25+ controls)

**Key Decisions:**
- Evidence metadata added to ScanChunkState (T1) → propagated through control results (T1) → rendered in UI (T2)
- Dependency: Task 1 must complete before Task 2 and Task 3 can use it
- Task 3 tightens rules independently (no dependency on T1/T2, but benefits from T1 metadata once deployed)

---

## CURRENT STATE (Phase 0 Findings)

### Evidence Tracking
- **ScanChunkState** (lib/queue/scan-queue.ts): Stores evidence in Redis via `evidenceKey`, no timestamps
- **EvidencePool** (lib/scan-engine): Has documents, code signals (github, workspace, slack, notion), questionnaire, clarifications — no metadata
- **ScanControlResult** (schema): `evidenceUsed: String[]` — just labels like "GitHub: SECURITY.md", no dates or reliability

### Control Results Storage
- evidenceUsed populated by individual framework rules (lib/frameworks/*/rules.ts)
- Labels are human-readable but untraceable: "risk_analysis_policy" tells you WHAT was used, not WHEN or HOW RELIABLE

### UI Display (scans/[scanId]/page.tsx)
- Shows control status + confidence % + text note
- Does NOT show evidence sources
- Auditors cannot see "PASS because privacy-policy.pdf (May 2026) + GitHub (May 5 2026)"

---

## TASK 1 — Evidence Metadata Architecture

**Why this matters:** Auditors need to distinguish "PASS on 6-month-old policy (low reliability)" from "PASS on GitHub scan today (high reliability)". Without dates, stale evidence looks fresh.

### 1a. Extend ScanChunkState with source metadata

**File:** lib/queue/scan-queue.ts  
**Change:** Add `sources` array to track evidence provenance

```typescript
type EvidenceSource = {
  type: 'github' | 'document' | 'questionnaire' | 'clarification' | 'workspace' | 'slack' | 'notion'
  scannedAt: string        // ISO date: "2026-05-06T14:32:00Z"
  reliability: 'high' | 'medium' | 'low'
  label: string            // "GitHub repo scan (myrepo)" or "privacy-policy.pdf"
}

// Added to ScanChunkState:
sources: EvidenceSource[]
```

**Reliability calibration rules:**
- github: `high` (automated, objective) — use Integration.lastSyncAt if available, else now()
- document uploaded today: `high` (fresh)
- document uploaded 1-30 days ago: `medium` (slightly stale)
- document uploaded 30+ days ago: `low` (potentially outdated)
- questionnaire answers: `low` (self-reported, unverified) — use Org.createdAt as proxy
- clarification answers (ScanClarification): `medium` (targeted user response)
- workspace/notion: `medium` (third-party, may lag)

### 1b. Populate sources during processEvidencePhase

**File:** app/api/scan/worker/route.ts::processEvidencePhase  
**Change:** When assembling evidence, record each source

```typescript
const sources: EvidenceSource[] = [];

// GitHub
const gh = evidence.codeSignals?.github;
if (gh) {
  const lastSyncAt = integration.lastSyncAt ?? new Date();
  sources.push({
    type: 'github',
    scannedAt: lastSyncAt.toISOString(),
    reliability: isStale(lastSyncAt) ? 'medium' : 'high',
    label: `GitHub repo scan (${gh.repo})`
  });
}

// Documents
for (const doc of evidence.documents) {
  const age = (now - doc.createdAt) / (1000 * 60 * 60 * 24); // days
  sources.push({
    type: 'document',
    scannedAt: doc.createdAt.toISOString(),
    reliability: age > 30 ? 'low' : age > 0 ? 'medium' : 'high',
    label: doc.fileName || 'Uploaded document'
  });
}

// Questionnaire
if (Object.keys(evidence.questionnaire).length > 0) {
  sources.push({
    type: 'questionnaire',
    scannedAt: org.createdAt.toISOString(),
    reliability: 'low',
    label: `Questionnaire (onboarded ${org.createdAt.toLocaleDateString()})`
  });
}

// Clarifications
for (const [key, value] of Object.entries(evidence.clarifications)) {
  sources.push({
    type: 'clarification',
    scannedAt: new Date().toISOString(),
    reliability: 'medium',
    label: `Clarification: ${key}`
  });
}

state.sources = sources;
await saveScanState(state);
```

### 1c. Store sources in ScanControlResult

**File:** app/api/scan/worker/route.ts::processControlsPhase  
**Change:** When saving each control result, store relevant sources

```typescript
// In processControlsPhase, after evaluating control:
const control = await db.scanControlResult.create({
  data: {
    scanId,
    controlId,
    status: result.status,
    confidence: result.confidence,
    evidenceUsed: result.evidenceUsed, // existing: ["GitHub: ...", "policy_doc"]
    // NEW: store sources as JSON array
    evidenceSourcesJson: JSON.stringify(state.sources),
    gaps: result.gaps,
    remediations: result.remediations,
    lawyerQuestions: result.lawyerQuestions,
    note: result.note,
  }
});
```

**Schema change needed:**

```prisma
model ScanControlResult {
  // ... existing fields ...
  evidenceUsed    String[]
  
  // NEW: JSON array of EvidenceSource (for UI display)
  evidenceSourcesJson  String?  @db.Text
  
  // ... rest of fields ...
}
```

### 1d. Add stale evidence warning to Scan record

**File:** app/api/scan/worker/route.ts::processPostPhase  
**Change:** After all controls evaluated, flag if any source is stale

```typescript
const staleThreshold = 30 * 24 * 60 * 60 * 1000; // 30 days
const now = Date.now();
const staleSources = state.sources.filter(
  s => (now - new Date(s.scannedAt).getTime()) > staleThreshold
);

await db.scan.update({
  where: { id: scanId },
  data: {
    staleEvidence: staleSources.length > 0,
    staleSources: JSON.stringify(staleSources),
  }
});
```

**Schema change needed:**

```prisma
model Scan {
  // ... existing fields ...
  
  // NEW: flag and list of stale sources
  staleEvidence   Boolean?
  staleSources    String?  @db.Text
}
```

---

## TASK 2 — Surface Evidence Sources in UI

**Why this matters:** "87% confident" means nothing without context. "PASS on GitHub scan (May 5, high reliability)" is auditable. "PASS because our policy mentions 'security'" is useless.

### 2a. Update API response to include sources

**File:** app/api/scan/[scanId]/route.ts  
**Change:** Parse and return source metadata

```typescript
controlResults: scan.controlResults.map((cr: any) => ({
  id: cr.id,
  status: cr.status,
  confidence: cr.confidence,
  gaps: cr.gaps,
  remediations: cr.remediations,
  evidenceUsed: cr.evidenceUsed,
  
  // NEW: parsed sources for UI
  evidenceSources: cr.evidenceSourcesJson 
    ? JSON.parse(cr.evidenceSourcesJson)
    : [],
  
  note: cr.note,
  control: {
    code: cr.control.code,
    title: cr.control.title,
  },
}))
```

### 2b. Render sources in scan results page

**File:** app/(dashboard)/scans/[scanId]/page.tsx  
**Change:** Add evidence sources below verdict

For each control result row:

```tsx
<div className="space-y-2">
  {/* Verdict */}
  <div className="flex items-center gap-2">
    <StatusBadge status={result.status} />
    <span className="text-sm text-gray-600">{Math.round(result.confidence * 100)}% confident</span>
  </div>

  {/* NEW: Evidence sources */}
  {result.evidenceSources.length > 0 ? (
    <div className="text-xs text-gray-600">
      <div className="font-medium text-gray-700 mb-1">Based on:</div>
      <div className="flex flex-wrap gap-2">
        {result.evidenceSources.map((source: EvidenceSource) => (
          <div key={`${source.type}-${source.label}`} className="inline-flex items-center gap-1">
            <span className={`px-2 py-1 rounded text-xs ${reliabilityBadge(source.reliability)}`}>
              {source.label}
            </span>
            <span className="text-gray-500">({formatDate(source.scannedAt)})</span>
          </div>
        ))}
      </div>
    </div>
  ) : (
    <div className="text-xs text-gray-500 italic">No traceable evidence</div>
  )}

  {/* Stale warning */}
  {scan.staleEvidence && (
    <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded p-2">
      <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
      <div className="text-xs text-amber-700">
        ⚠️ Some evidence may be outdated — consider re-scanning
      </div>
    </div>
  )}

  {/* Existing: note and gaps */}
  {result.note && <p className="text-sm text-gray-600 italic">{result.note}</p>}
  {result.gaps.length > 0 && (
    <div className="text-xs text-red-600">
      <strong>Gaps:</strong> {result.gaps.join("; ")}
    </div>
  )}
</div>
```

**Reliability badge helper:**

```typescript
function reliabilityBadge(reliability: 'high' | 'medium' | 'low'): string {
  return {
    high: 'bg-green-100 text-green-700 border border-green-200',
    medium: 'bg-amber-100 text-amber-700 border border-amber-200',
    low: 'bg-red-100 text-red-700 border border-red-200',
  }[reliability];
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const diff = (today.getTime() - d.getTime()) / (1000 * 60 * 60 * 24);
  
  if (diff < 1) return 'today';
  if (diff < 2) return 'yesterday';
  if (diff < 30) return `${Math.floor(diff)}d ago`;
  if (diff < 365) return `${Math.floor(diff / 30)}mo ago`;
  return d.toLocaleDateString();
}
```

---

## TASK 3 — Tighten Remaining Framework Rules

**Why this matters:** Phase 1 tightened 3/9 frameworks. Phase 2 applies same strictness to the remaining 5 frameworks (NIS2, DORA, CRA, PLD, Custom) using the same standard: **keyword presence alone → PARTIAL; implementation evidence required → PASS**.

### Rules by Framework

#### NIS2 (lib/frameworks/nis2/rules.ts)

| Control | Current Logic | Change | New Logic |
|---------|---------------|--------|-----------|
| **Art. 21 — Risk Analysis & Security** | `hasRiskDoc \|\| notionHasSecPolicy` → PASS | Add code signals validation | PASS: hasRiskDoc + (hasAuth \|\| hasEncryption) |
| **Art. 21(2)(b) — Incident Handling** | Multiple sources OR — PASS if 2+ present | Add SLA requirement | PASS: hasIRDoc + (explicit 72h/24h timeline) |
| **Art. 21(2)(c) — Business Continuity** | Keyword match only | Add RTO/RPO | PASS: hasDoc + (explicit RTO/RPO timeframe) |
| **Art. 23 — Supervisory Measures** | Document + Code signals | Add DPA check | PASS: if high-risk AI, require DPA evidence + policy |
| **Art. 22 — Staff Awareness** | Notion training pages + document | No change | Keep as-is (already has code signals) |
| **Art. 19 — Network Security** | Already has code signals | No change | Keep as-is |

**Before:**
```typescript
// Art. 21 Risk Analysis
status: hasRiskDoc || notionHasSecPolicy ? "PASS" : "NO_EVIDENCE"
```

**After:**
```typescript
// Art. 21 Risk Analysis + enforcement
const hasRiskDoc = hasDoc(ev, "risk analysis", "risk assessment", ...);
const hasAuth = hasGitSignal(ev, "hasAuth");
const hasEncryption = hasGitSignal(ev, "hasEncryption");
const techCount = [hasAuth, hasEncryption].filter(Boolean).length;

// PASS requires policy + at least one code signal
if (hasRiskDoc && techCount >= 1) return { status: "PASS", ... };
if (hasRiskDoc && techCount === 0) return { status: "PARTIAL", ... };
if (techCount >= 1) return { status: "PARTIAL", ... };
return { status: "NO_EVIDENCE", ... };
```

#### DORA (lib/frameworks/dora/rules.ts)

| Control | Current Logic | Change | New Logic |
|---------|---------------|--------|-----------|
| **Art. 5 — ICT Risk Framework** | Policy alone | Add code signals | PASS: hasDoc + (hasAuth + hasEncryption + hasCI) |
| **Art. 9 — Protection** | Policy + 2+ code signals | No change | Keep as-is (already strict) |
| **Art. 10 — Detection** | Keyword + logging | Add monitoring signals | PASS: hasDoc + hasLogging + (hasAlertingOrSiem) |
| **Art. 11 — Recovery** | Keyword match | Add backup + timeframe | PASS: hasDoc + (explicit RTO/RPO definition) |
| **Art. 17 — Third-Party Risk** | Keyword match | Add vendor assessment | PASS: hasDoc + (SOC2 or audit evidence) |

**Before:**
```typescript
// Art. 5 ICT Risk Framework
status: hasRiskFramework ? "PASS" : notionHasSecPolicy ? "PARTIAL" : "NO_EVIDENCE"
```

**After:**
```typescript
const hasRiskDoc = hasDoc(ev, "ict risk", ...);
const hasAuth = hasGitSignal(ev, "hasAuth");
const hasEncryption = hasGitSignal(ev, "hasEncryption");
const hasCI = hasGitSignal(ev, "hasCI");
const techCount = [hasAuth, hasEncryption, hasCI].filter(Boolean).length;

// PASS requires documented framework + all three code signals
if (hasRiskDoc && techCount >= 3) return { status: "PASS", ... };
if (hasRiskDoc && techCount >= 1) return { status: "PARTIAL", ... };
return { status: "NO_EVIDENCE", ... };
```

#### CRA (lib/frameworks/cyber-resilience-act/rules.ts)

| Control | Current Logic | Change | New Logic |
|---------|---------------|--------|-----------|
| **Art. 13 — Vulnerability Handling** | Keyword match | Require structured disclosure | PASS: hasDoc + (responsible disclosure policy + CVE tracking) |
| **Art. 23 — ENISA Incident Report** | Generic incident handling | Add 24h SLA | PASS: hasDoc + (explicit 24-hour commitment) |

#### PLD (lib/frameworks/product-liability/rules.ts)

| Control | Current Logic | Change | New Logic |
|---------|---------------|--------|-----------|
| **Art. 7 — Documentation** | Generic "technical documentation" | Add 3-component check (like EU AI Art. 11) | PASS: training data + performance + limitations |
| **Art. 10 — Burden of Proof** | Generic liability clause | Require explicit limitation of liability | PASS: hasToS + explicit liability disclaimer |

#### Custom (lib/frameworks/custom/rules.ts)

Apply same standard to all controls:
- Policy document alone → PARTIAL
- Code signals alone → PARTIAL
- Both required → PASS

---

## Task Dependencies & Sequencing

```
T1 (Evidence Metadata) ✓
  ├─ 1a. Add EvidenceSource type + sources to ScanChunkState
  ├─ 1b. Populate sources in processEvidencePhase
  ├─ 1c. Store sources in ScanControlResult (DB schema change)
  └─ 1d. Add stale flag to Scan (DB schema change)

T2 (UI Display) [depends on T1]
  ├─ 2a. Update API response to include evidenceSources
  └─ 2b. Render sources in scans/[scanId]/page.tsx

T3 (Framework Rules) [independent, benefits from T1]
  ├─ Tighten NIS2 rules (5 controls)
  ├─ Tighten DORA rules (5 controls)
  ├─ Tighten CRA rules (2 controls)
  ├─ Tighten PLD rules (2 controls)
  └─ Tighten Custom rules (5 controls)
```

**Parallel paths:** T3 can start while T1 is in progress. T2 must wait for T1 DB schema changes.

---

## Verification Strategy

### Task 1: Evidence Metadata
- [ ] sources array populated in ScanChunkState with correct timestamps
- [ ] Redis persistence: source data survives chunk-to-chunk serialization
- [ ] DB schema: evidenceSourcesJson stores JSON without truncation

### Task 2: UI Display
- [ ] API returns evidenceSources in controlResults
- [ ] scans/[scanId]/page renders sources below verdict
- [ ] Reliability badges show correct colors (green/amber/red)
- [ ] Stale warning appears when scan.staleEvidence = true
- [ ] No traceable evidence edge case handled

### Task 3: Framework Rules
- [ ] NIS2 Art. 21: Policy alone → PARTIAL (was PASS)
- [ ] DORA Art. 5: Policy + 1 signal → PARTIAL (was PARTIAL), policy + 3 signals → PASS
- [ ] CRA Art. 13: Generic doc → PARTIAL, structured disclosure + CVE → PASS
- [ ] PLD Art. 7: Single component → PARTIAL, all 3 → PASS (mirrors EU AI Art. 11)
- [ ] Custom: All keyword-only → PARTIAL, policy + code → PASS

---

## Risk Assessment

### HIGH RISK
- **DB schema changes** (evidenceSourcesJson, staleEvidence): Must add columns with safe defaults
  - **Mitigation:** Make columns nullable, backfill = null
  - **Test:** Old scans still render without errors

- **Evidence source timestamp accuracy**: Evidence.createdAt vs Integration.lastSyncAt mismatch
  - **Mitigation:** Use Integration.lastSyncAt for GitHub (most reliable), fall back to scan.startedAt if missing

### MEDIUM RISK
- **Strictness regression**: Phase 3 rules are much tighter — some orgs previously "PASS" may drop to "PARTIAL"
  - **Mitigation:** Document in changelog, communicate to customers in release notes
  - **Test:** Run phase 3 tightening against existing test scan, verify expected drop in pass rate

- **UI clutter**: Adding sources + dates + reliability badges to every control might overwhelm the UI
  - **Mitigation:** Collapse sources by default, expand on click (future enhancement)

### LOW RISK
- TypeScript compilation: Task 1 adds types, Task 2 uses them, Task 3 is rule code only
- Backwards compat: Old scans without evidenceSourcesJson still render (empty array)

---

## Architecture Decisions

| Decision | Rationale | Alternative | Why Not |
|----------|-----------|-------------|---------|
| EvidenceSource as separate type (not baked into evidenceUsed) | Allows UI to show sources independently of labels; supports future filtering by date/reliability | Store metadata in evidenceUsed strings ("policy_doc:2026-05-06:high") | Harder to parse, loses structure, breaks existing labels |
| Store sources in ScanControlResult.evidenceSourcesJson (JSON text) | Avoids schema churn, easy to extend later | Separate EvidenceSource table | Overkill; sources are immutable per scan |
| Stale = 30 days | Aligns with GDPR fresh evidence interpretation; matches user feedback | 60 days or 90 days | Policies change quarterly; 30d is safer |
| Reliability calibrated by evidence type + age | Automated, objective, auditable | Manual override per control | Can't scale |
| Task 3 tightens 5 frameworks in one batch | Consistency across frameworks; auditors see same pattern | Phase 3a (NIS2+DORA), Phase 3b (CRA), Phase 3c (PLD+Custom) | Slower, creates implementation debt |

---

## Files Changed Summary

### Task 1
- `lib/queue/scan-queue.ts`: Add `sources: EvidenceSource[]` to ScanChunkState
- `app/api/scan/worker/route.ts`: Populate sources in processEvidencePhase
- `prisma/schema.prisma`: Add evidenceSourcesJson to ScanControlResult, staleEvidence + staleSources to Scan
- `types/scan.ts`: Add EvidenceSource type

### Task 2
- `app/api/scan/[scanId]/route.ts`: Parse evidenceSources from ScanControlResult
- `app/(dashboard)/scans/[scanId]/page.tsx`: Render sources + reliability badges
- `components/utils.ts` (or new file): reliabilityBadge() and formatDate() helpers

### Task 3
- `lib/frameworks/nis2/rules.ts`: Tighten 5 controls
- `lib/frameworks/dora/rules.ts`: Tighten 5 controls
- `lib/frameworks/cyber-resilience-act/rules.ts`: Tighten 2 controls
- `lib/frameworks/product-liability/rules.ts`: Tighten 2 controls
- `lib/frameworks/custom/rules.ts`: Tighten 5 controls

---

## Timeline & Sequencing

**Phase 2a (Task 1 + Task 2):** 1-2 days
- Types, DB schema, API wiring, UI rendering

**Phase 2b (Task 3):** 1 day
- Rule rewrites (copy pattern from Phase 1)

**Phase 2c (Validation):** 0.5 days
- Test against existing scans, verify no regressions

**Total:** 2.5-3.5 days (parallel T3 with T1 saves ~0.5d)

---

## Next Gate: CEO Review

**Before implementation, validate:**
1. Is evidence metadata tracking valuable enough to justify DB schema changes?
2. Should stale-evidence threshold be 30 days, or different per framework?
3. Is UI display for sources compatible with current dashboard layout, or needs redesign?
4. Are tighter framework rules acceptable (expect pass rate drop of 5-15% for Phase 3 frameworks)?
5. Timeline: Can we ship T1+T2+T3 in one release, or phased?

---

## Next Gate: Design Review

**Before UI implementation, validate:**
1. Evidence sources display — badge placement, colors, text size
2. Stale warning prominence — modal, inline warning, or hidden by default?
3. Collapse/expand behavior for many sources (>5 per control)
4. Mobile responsiveness (scans page used on iPad for audits)

---

## Next Gate: Security Review

**Before deployment, audit:**
1. Timestamp exposure — are we leaking integration sync times to users?
2. Source labels — do they reveal infrastructure details (e.g., "GitHub: internal-security-repo")?
3. Reliability scoring — could bad actor exploit low reliability to dismiss evidence?
4. Schema migration safety — can we add columns without downtime?

---

## Success Criteria

✅ **Task 1:** Evidence sources traceable end-to-end (assembly → storage → API → UI)  
✅ **Task 2:** Auditor can identify *why* each control passed (source + date + reliability)  
✅ **Task 3:** False positive rate drops 5-15% as stricter rules eliminate keyword-only matches  
✅ **Overall:** Zero regressions on existing passing scans (backward compat)  
✅ **Deployment:** Single release, no feature flags (stale evidence flag is soft, not blocking)  

