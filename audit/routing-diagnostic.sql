-- 1. What Document rows exist? What types?
SELECT
  id,
  category,
  title,
  status,
  "createdAt"
FROM "Document"
ORDER BY "createdAt" DESC
LIMIT 20;

-- 2. Are there any POLICY type documents?
SELECT COUNT(*) as policy_count
FROM "Document"
WHERE category = 'POLICY';

-- 3. What scan IDs exist?
SELECT
  s.id AS scan_id,
  f.type AS framework,
  s.status,
  s.score,
  s."createdAt"
FROM "Scan" s
JOIN "Framework" f ON f.id = s."frameworkId"
ORDER BY s."createdAt" DESC
LIMIT 10;
