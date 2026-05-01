-- Run these in Supabase SQL Editor.
-- READ-ONLY. Does not modify any data.

-- 1. Most recent 5 scans
SELECT
  id,
  status,
  "frameworkType",
  score,
  "totalControls",
  "passedControls",
  "createdAt",
  "completedAt",
  EXTRACT(EPOCH FROM ("completedAt" - "createdAt"))::int AS duration_seconds,
  "errorMessage"
FROM "Scan"
ORDER BY "createdAt" DESC
LIMIT 5;

-- 2. Full reportJson of the most recent scan
SELECT
  id,
  "frameworkType",
  jsonb_pretty("reportJson") AS report_json
FROM "Scan"
ORDER BY "createdAt" DESC
LIMIT 1;

-- 3. ControlResult rows for the most recent scan (CRITICAL — expect 0 rows)
SELECT
  cr."scanId",
  cr.status,
  cr.confidence,
  cr."createdAt"
FROM "ScanControlResult" cr
WHERE cr."scanId" = (SELECT id FROM "Scan" ORDER BY "createdAt" DESC LIMIT 1)
ORDER BY cr."createdAt";

-- THE KEY DIAGNOSTIC QUERY:
-- 4. Control rows for EU AI Act framework (CRITICAL — expect 0 or 7 rows)
--    If this returns 0 rows, that IS the root cause.
SELECT
  c.id,
  c.code,
  c.title,
  c.status,
  f.type AS framework_type,
  f."orgId"
FROM "Control" c
JOIN "Framework" f ON f.id = c."frameworkId"
WHERE f.type = 'EU_AI_ACT'
ORDER BY c.code;

-- 5. All frameworks for this org, and their control counts
SELECT
  f.id,
  f.type,
  f.status,
  f.score,
  f."totalControls",
  f."passedControls",
  COUNT(c.id) AS actual_control_rows_in_db
FROM "Framework" f
LEFT JOIN "Control" c ON c."frameworkId" = f.id
WHERE f."orgId" = (SELECT "orgId" FROM "Scan" ORDER BY "createdAt" DESC LIMIT 1)
GROUP BY f.id
ORDER BY f.type;

-- 6. Evidence for this org
SELECT
  id,
  "fileName",
  LENGTH("extractedText") AS text_length,
  "textExtractedAt",
  "createdAt"
FROM "Evidence"
WHERE "orgId" = (SELECT "orgId" FROM "Scan" ORDER BY "createdAt" DESC LIMIT 1)
ORDER BY "createdAt" DESC
LIMIT 20;

-- 7. GitHub integration — does it have lastScanResults in config?
SELECT
  id,
  type,
  "isActive",
  "lastSyncedAt",
  CASE
    WHEN "encryptedConfig" IS NULL THEN 'NO CONFIG'
    WHEN "encryptedConfig" LIKE '%lastScanResults%' THEN 'HAS lastScanResults'
    ELSE 'CONFIG EXISTS but no lastScanResults'
  END AS github_scan_status
FROM "Integration"
WHERE "orgId" = (SELECT "orgId" FROM "Scan" ORDER BY "createdAt" DESC LIMIT 1);

-- 8. Did onboarding questionnaire get completed?
SELECT
  id,
  name,
  "questionnaireCompletedAt",
  "applicableFrameworks",
  "riskTier"
FROM "Organization"
WHERE id = (SELECT "orgId" FROM "Scan" ORDER BY "createdAt" DESC LIMIT 1);

-- 9. ScanControlResult count across ALL scans (not just recent)
SELECT
  s.id AS scan_id,
  s."frameworkType",
  s.status,
  s."createdAt",
  COUNT(cr.id) AS control_results_saved
FROM "Scan" s
LEFT JOIN "ScanControlResult" cr ON cr."scanId" = s.id
GROUP BY s.id
ORDER BY s."createdAt" DESC
LIMIT 10;
