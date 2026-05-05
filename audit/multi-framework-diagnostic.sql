-- Multi-framework scan diagnostic
-- Run this to confirm whether both frameworks were scanned and where the 0/0 came from

-- Were multiple Scan records created for the multi-framework attempt?
SELECT
  s.id,
  f.type AS framework_type,
  s.status,
  s.score,
  s."createdAt",
  s."completedAt",
  s."errorMessage"
FROM "Scan" s
JOIN "Framework" f ON f.id = s."frameworkId"
WHERE s."createdAt" > NOW() - INTERVAL '2 hours'
ORDER BY s."createdAt" DESC;

-- Were Control rows created for both frameworks?
SELECT
  f.type,
  COUNT(c.id) AS control_count
FROM "Framework" f
LEFT JOIN "Control" c ON c."frameworkId" = f.id
WHERE f."orgId" = (
  SELECT "orgId" FROM "Scan"
  ORDER BY "createdAt" DESC LIMIT 1
)
GROUP BY f.type
ORDER BY f.type;

-- Were any ScanControlResult rows saved for the second framework's scan?
SELECT
  s.id AS scan_id,
  f.type AS framework_type,
  s.status,
  s.score,
  COUNT(cr.id) AS result_count
FROM "Scan" s
JOIN "Framework" f ON f.id = s."frameworkId"
LEFT JOIN "ScanControlResult" cr ON cr."scanId" = s.id
WHERE s."createdAt" > NOW() - INTERVAL '2 hours'
GROUP BY s.id, f.type, s.status, s.score
ORDER BY s."createdAt" DESC;
