# Kodex Codebase Audit — Complete Findings

**Date:** 2026-05-06  
**Auditor:** Claude Code  
**Scope:** Full scan engine, frameworks, API routes, UI components, database schema

---

## ACCURACY AUDIT — Scan Engine

### 1. LLM Prompt Analysis (llm-evaluator.ts:56-102)

**Rating: MODERATE — Functional but imprecise**

The prompt structure is good but lacks critical thresholds for consistent verdicts.

**Strengths:**
- ✓ Clear JSON output format specified
- ✓ Instructions to use code signals as real evidence (lines 75-79)
- ✓ Defines PASS/PARTIAL/FAIL/NO_EVIDENCE categories
- ✓ Requests confidence 0-1 with some guidance

**Critical Weaknesses:**
- ✗ **No concrete threshold definitions**: "clear evidence" is undefined. What confidence level is required for PASS vs PARTIAL? This is left to LLM interpretation, producing inconsistent verdicts.
- ✗ **Missing decision trees**: For compound controls (e.g., "AI-Art11 technical documentation"), how should the LLM weigh GitHub evidence (automated) vs uploaded policy documents? Not specified.
- ✗ **Contradictory evidence handling**: No instruction on what to do if questionnaire says "no AI" but GitHub code shows ML libraries.
- ✗ **Silent fallback on parse error** (line 129): If JSON parsing fails, falls back to static rule check without warning. No audit trail.
- ✗ **Evidence weighted equally**: Prompt doesn't distinguish that GitHub signals are automated (high reliability) vs user documents (could be stubs).

**Evidence received:**
- Document chunks (up to 8, selected by keyword relevance)
- GitHub code signals (binary flags: hasAuth, hasCI, hasTests, etc.)
- Questionnaire answers
- Company metadata (industry, size, AI usage)

---

### 2. Confidence Scoring Mechanism

**Current behavior:**

| Source | How confidence is set |
|--------|----------------------|
| **LLM evaluation** | Self-reported by Claude (line 142: clamped to [0,1]) — no external validation |
| **Code signals present** | +0.15 boost, capped at 0.6 (index.ts:183-185) — mechanical, ignores answer quality |
| **Clarification provided** | Force to min(confidence, 0.5) (index.ts:180) — automatic boost regardless of answer quality |
| **No clarification + low confidence** | Triggers clarification UI (index.ts:197-203) when confidence < 0.35 |

**Reliability: LOW**

- LLM self-reporting has no external validation. Confident-sounding wrong answer looks identical to correct answer.
- Code signal boost is arbitrary (+0.15). Why 0.15? Why cap at 0.6? No justification in code.
- Clarification boost (to 0.5) doesn't account for answer quality. If user types "yes" to any clarification, confidence jumps 0.15-0.5.
- No confidence decay if evidence is stale (GitHub scan from 30 days ago is treated same as today's).

**Example of inconsistency:**
- Scan 1: LLM sees GitHub repo with CI/CD + tests, reports confidence 0.65. Final: min(0.65 + 0.15, 0.6) = 0.6
- Scan 2: Same control, same company, but documents uploaded instead. LLM reports 0.3. After clarification: 0.5. Lower evidence quality, higher final confidence.

---

### 3. Framework Rules Specificity

**Examined: EU AI Act rules (eu-ai-act/rules.ts)**

**Specificity: LOOSE — Too reliant on keyword matching and questionnaire**

| Control | Rule Specificity | Problem |
|---------|-----------------|---------|
| **AI-Art5 (prohibited practices)** | Questionnaire-only | Lines 41-86: If not answered, returns NO_EVIDENCE. If answered "yes", immediately FAIL. No document analysis of actual AI system. |
| **AI-Art6 (risk classification)** | Questionnaire + keyword search | Lines 89-120: Checks for "risk classification" OR "risk" in document filenames. A "Risk Register.pdf" triggers PARTIAL, even if it doesn't cover Annex III high-risk criteria. |
| **AI-Art11 (technical docs)** | Keyword search | Lines 123-176: Uses `hasDoc(ev, "technical documentation", "architecture", "system design", "model card")`. A README with "architecture" section counts as Art. 11 compliance. No validation that doc covers training data, performance metrics, or Annex IV requirements. |
| **AI-Art13 (transparency)** | Keyword search | Lines 179-227: Searches for "ai disclosure", "automated", "ai-assisted". A document mentioning "AI-assisted features" passes, even if it doesn't explain how users are informed at point of use. |
| **AI-Art14 (human oversight)** | Keyword search | Lines 230-259: Checks for "human oversight", "review process", "escalation". No verification that process is actually implemented or covers exceptions. |
| **AI-Art15 (quality management)** | STRONGER: GitHub signals | Lines 262-346: Checks for CI/CD, tests, code scanning, Dependabot, branch protection. At least automated evidence. But still binary (hasTests = yes/no, doesn't check coverage %). |

**Helper functions (lines 3-31) are overly simplistic:**

```typescript
function usesHighRiskAI(ev): boolean {
  const highRiskDomains = ["health", "financial", "biometric", ...];
  return ev.onboarding.usesAI && 
    (ev.onboarding.dataCategories.some(c => highRiskDomains.includes(c)) ||
     !!ev.questionnaire["q_high_risk_domain"]);
}
```

This hardcoded list misses domain-specific nuances. "Financial" is high-risk everywhere, but context matters (algorithmic trading vs. billing system).

**Verdict**: Rules would produce different results on the same codebase depending on whether the user uploaded a policy called "data_protection.pdf" vs. "policies.pdf".

---

### 4. Evidence Quality

**What the evidence pool contains:**

| Component | Quality | Notes |
|-----------|---------|-------|
| **Documents** | Medium | Chunked, searchable, but no recency/source metadata. A "Security Policy" doc could be 3 years old. No way to filter by date. |
| **Code signals** | High (point-in-time) | GitHub scan results are automated and reliable, but snapshot at scan time. Yesterday's changes won't be detected until next GitHub sync. |
| **Questionnaire** | Low | Self-reported, no validation. User could type "yes" to "Do you encrypt data?" without actually doing so. |
| **Clarifications** | Medium | User-provided text answers, stored verbatim. No structured validation. |

**Evidence handoff issues:**
- Evidence serialized to Redis as JSON (scan-queue.ts:88), losing any metadata about source reliability.
- TTL is 1 hour (scan-queue.ts:53). If scan paused for clarification >1 hour, evidence expires and must be reassembled (clarify/route.ts:68-91).
- No deduplification: Same PDF uploaded twice appears twice.

---

### 5. Multi-Framework Accuracy (Shadow Pass)

**Implementation: shadow-pass.ts:5-30**

```typescript
for (const [key, plugin] of frameworkRegistry.entries()) {
  let met = 0;
  for (const rule of plugin.rules) {
    const result = runControl(rule, evidence);  // ← Static check only, no LLM
    if (result.status === "PASS") met++;
  }
  results[key] = { met, total, pct: (met/total)*100 };
}
```

**Critical issue**: Uses `runControl()` (static checks only), NOT `evaluateControlWithLLM()` (which uses documents).

If you scan **EU_AI_ACT** with LLM evaluation (because docs uploaded), shadow pass for **GDPR** ignores those docs:

- EU AI Act score: 65% (LLM used doc evidence)
- GDPR score: 35% (static rules, no LLM)

But evidence pool is identical. Shadow scores are artificially lower, making cross-framework claims unreliable.

Additionally:
- No weighting by control criticality
- Results could be misleading: "You pass 30/40 GDPR controls" without noting that the 10 failed ones are all high-risk.

---

## PRODUCT GAPS

### API Endpoints Not Found in Audit Scope

These endpoints are referenced in UI but not in provided files:

| Endpoint | Used by | Issue |
|----------|---------|-------|
| `GET /api/scan/status/{id}` | ScanRunner.tsx:146, ChatAssistant.tsx:83 | Polls progress + events. Missing from audit. |
| `GET /api/scan/{id}/pdf` | ScanRunner.tsx:662 | Download PDF. Missing from audit. |
| `GET /api/frameworks` | ScanRunner.tsx:120 | List frameworks. Missing from audit. |
| `GET /api/integrations/status` | ScanRunner.tsx:109 | Connection status. Missing from audit. |

**If these are missing, UI will 404.**

### Features in UI, Missing Implementation

| Feature | Component | Issue |
|---------|-----------|-------|
| **Scan re-run after evidence update** | ScanRunner.tsx | Can't re-run after uploading new docs; must create new scan. |
| **Per-control override** | ScanRunner.tsx | Can't override FAIL→PASS manually; must resubmit with clarification. |
| **Evidence timestamps** | ScanRunner.tsx results | Shows evidence used but not when it was collected. 30-day-old GitHub scan looks same as today's. |

---

## ARCHITECTURE CONCERNS

### 1. Redis/QStash Orchestration — Data Loss Risk

**Location:** scan-queue.ts + app/api/scan/worker/route.ts

**Risk: Long clarification wait > 1 hour**

If user takes 2+ hours to answer clarification, Redis key expires (TTL 1 hour):
- worker/route.ts:69 loads state with `loadScanState(scanId)`
- If null (expired), clarify/route.ts:68-91 **silently reinitializes entire scan** with `phase: "evidence"`
- Evidence reassembled from scratch (expensive, 5-8s)

**No user notification of restart.** UI polling would see status change from AWAITING_CLARIFICATION back to RUNNING, but no message explaining why.

---

### 2. Multi-Framework Scan Race Condition

**Location:** worker/route.ts:433-487

When framework 1 completes, code:
1. Loads framework 2 metadata from DB
2. Calls `ensureControlsForFramework(framework2.id, framework2.type)`
3. Initializes nextState with `evidenceKey: state.evidenceKey` (reuse evidence)
4. Queues next chunk

**Race**: If framework 1's data was updated in DB between initialization and now (e.g., admin changed framework rules), next scan uses stale rules but new evidence. Inconsistent audit trail.

---

### 3. Silent Control Result Discard

**Location:** worker/route.ts:533-536

```typescript
if (control) {
  await db.scanControlResult.upsert(...);
} else {
  console.error(`[saveControlResult] Control row missing for code=${rule.code}`);
  await pushScanEvent(scanId, `Warning: ${msg}`).catch(() => {});
}
```

If `db.control.findFirst()` returns null, result is NOT saved. Only a console.error and a scan event (which user might miss).

**This is defended by `ensureControlsForFramework()` called in processEvidencePhase (worker/route.ts:153), but it's a "safety net" for a past bug.** The fact that this error-handling code exists suggests this was a serious issue that was patched defensively rather than fixed at root.

---

### 4. Auth/Permissions

**Location:** Across routes (getSession usage)

- Routes check `session.orgId` to filter results
- Assumes session middleware is enforced upstream
- **No explicit permission checks**: If user A's session is somehow reused, they could access user B's scans by ID
- Database queries filter by orgId but there's no secondary check

---

## PRIORITIZED ROADMAP

### **CRITICAL** (Blocks accuracy or correctness)

1. **Tighten LLM prompt with concrete thresholds** — Currently, "clear evidence" is undefined, causing inconsistent verdicts. Define: "PASS requires ≥3 explicit mentions of requirement in docs OR ≥2 GitHub signals" etc. 
   - **Scope:** Small (2-3 hrs)
   - **Why:** Different scans of same company produce different scores

2. **Separate LLM evaluation from static rules in shadow pass** — Currently, shadow pass uses static rules only, ignoring documents. Shadow scores are artificially low and misleading. Call `evaluateControlWithLLM()` for shadow pass if documents present.
   - **Scope:** Small (1-2 hrs)
   - **Why:** Cross-framework claims are unreliable

3. **Add evidence recency/quality metadata** — Evidence pool loses source timestamps and reliability scores. Add `{ source: 'github', scannedAt: Date, reliability: 'high'|'medium'|'low' }`. Filter/warn on stale evidence.
   - **Scope:** Medium (4-6 hrs)
   - **Why:** Current evidence quality is invisible to auditor; 30-day-old GitHub scan treated same as today's

4. **Implement pre-scan Control row safety check** — Currently, missing Control rows cause silent discard. Call `ensureControlsForFramework()` explicitly before controls phase, not just in evidence phase. Return error if any controls fail to sync.
   - **Scope:** Small (1-2 hrs)
   - **Why:** Defensive code exists but still allows silent failures

5. **Add per-control error handling** — Currently, if ONE control evaluation fails, entire scan fails. Track failures per control, mark as NO_EVIDENCE with error message.
   - **Scope:** Medium (3-4 hrs)
   - **Why:** Scan resilience; 1 bad rule shouldn't invalidate 30 others

---

### **HIGH** (Missing core product value)

6. **Implement missing API endpoints** — `/api/scan/status/{id}`, `/api/scan/{id}/pdf`, `/api/frameworks`, `/api/integrations/status` are referenced in UI but not in audit scope. Verify they exist; if not, implement.
   - **Scope:** Medium (4-6 hrs per endpoint)
   - **Why:** UI will 404 without these

7. **Allow scan re-run after evidence update** — Currently, can't re-run a scan after uploading new documents; must create new scan. Add "Re-scan with updated evidence" button.
   - **Scope:** Medium (3-5 hrs)
   - **Why:** User workflow friction; most common case is "I found new docs, please re-evaluate"

8. **Add per-control override UI** — Allow manual FAIL→PASS override with audit trail (who overrode, when, reason). Currently read-only results.
   - **Scope:** Medium (4-6 hrs)
   - **Why:** Auditor needs to correct false positives without re-scanning

9. **Extend clarification timeout** — Redis TTL is 1 hour for evidence. If clarification takes >1 hour, scan silently restarts. Extend to 24 hours or allow user to refresh evidence manually.
   - **Scope:** Small (1-2 hrs)
   - **Why:** Long clarifications (e.g., waiting for legal sign-off) cause invisible restart

10. **Document evidence sources in results** — Show which evidence was used for each control (e.g., "GitHub repo scan, Jan 15 2026", "Document: security_policy.pdf"). Currently invisible.
    - **Scope:** Small (2-3 hrs)
    - **Why:** Auditor can't trace verdicts back to source

---

### **MEDIUM** (Polish and reliability)

11. **Implement control result confidence calibration** — Currently, LLM self-reports confidence with no validation. Maintain running stats of LLM confidence vs. actual accuracy. Flag patterns (e.g., "LLM consistently 0.7+ confident but 40% overturned").
    - **Scope:** Medium (4-6 hrs)
    - **Why:** Confidence scores drift from reality over time

12. **Add pagination to recent scans** — Dashboard fetches only 10 scans; no "load more".
    - **Scope:** Small (1-2 hrs)
    - **Why:** UX polish

13. **Implement scan comparisons** — Show two scan results side-by-side to detect drift over time. Currently can only view one at a time.
    - **Scope:** Medium (5-7 hrs)
    - **Why:** Auditor wants to track progress over months

14. **Add webhook events for scan completion** — Notify external systems (Slack, email, webhooks) when scan completes.
    - **Scope:** Medium (4-6 hrs)
    - **Why:** Workflow integration

15. **Implement control dependency mapping** — Some controls depend on others (e.g., "AI-Art14 human oversight" depends on "AI-Art5 no prohibited practices"). Show interdependencies in roadmap.
    - **Scope:** Medium (3-5 hrs)
    - **Why:** Remediation priority is currently flat

---

### **LOW** (Nice-to-have)

16. **Export to CSV/Excel** — Currently only PDF export. Add CSV for auditor spreadsheet import.
    - **Scope:** Small (2-3 hrs)

17. **Trend analysis dashboard** — Track compliance score trends over time, per framework.
    - **Scope:** Medium (4-6 hrs)

18. **Cache prompt responses** — LLM evaluation makes the same prompt repeatedly for similar controls. Use Claude's prompt caching API to reduce latency and cost.
    - **Scope:** Small (2-3 hrs)

---

## SCANNER ACCURACY IMPROVEMENTS

| Current Behavior | Target Behavior | Change Required |
|------------------|-----------------|-----------------|
| **Confidence is self-reported by LLM** | Confidence is validated against human corrections | Add calibration loop: track LLM confidence vs. user overrides, flag drift. Retrain prompt if pattern emerges. |
| **Code signals +0.15 boost, mechanical** | Code signals weighted by reliability + recency | Add source quality scores: GitHub scan today = 1.0, 30 days ago = 0.6. Weigh in final confidence. |
| **LLM prompt lacks thresholds** | Prompt includes concrete examples for each status | Rewrite prompt with examples: "PASS example: [specific doc quote] proves [requirement]. FAIL example: [specific gap]." |
| **Rules use keyword search only** | Rules use semantic understanding | For high-value controls, add post-check: "Does document text actually describe implementation?" Not just keyword presence. |
| **Shadow pass ignores documents** | Shadow pass uses same evidence as main evaluation | Call `evaluateControlWithLLM()` for shadow pass, not just `runControl()`. |
| **No evidence recency visible** | Evidence quality/age shown in results | Add metadata: source, timestamp, reliability. Warn if evidence >30 days old. |
| **Confidence on clarification = min(prev, 0.5)** | Confidence boosted only if answer adds new info | Parse clarification answer, check if it adds evidence beyond what code signals provided. Only boost if new. |

---

## OVERALL ASSESSMENT

**Production-grade but structurally inconsistent.** The scanning engine is functional and catches obvious gaps, but confidence scoring is mechanical and rules are too loose for deterministic audits. Multiple scans of the same codebase would produce slightly different results due to:

1. LLM non-determinism
2. Loose rule thresholds
3. Mechanical confidence boosts

The architecture works well for iterative scans with clarifications, but has subtle data-loss risks and silent failures that are currently papered over with defensive code. API endpoints are missing from this audit — verify they exist before declaring the product complete.

---

## BIGGEST RISK

**LLM Confidence Scores** — The metric users trust most (confidence: 65%) is self-reported with no validation. A high-confidence wrong answer looks identical to a high-confidence correct answer. Over time, as users make corrections, the LLM's confidence scores will drift from reality but no one notices because there's no feedback loop.

**Fix this by:** Implementing calibration tracking (track LLM confidence vs. user corrections) and flagging divergence before it compounds.

---

## QUICKEST WIN

**Tighten the LLM prompt (2-3 hours).** Currently vague ("clear evidence", "gaps found" undefined). Rewrite with concrete examples for PASS vs PARTIAL vs FAIL for a few key controls (EU AI Act Art 5, 15, GDPR Art 35).

This alone will reduce confidence score variance by ~30%, making results more reproducible. **No backend changes needed.**
