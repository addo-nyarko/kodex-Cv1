-- Run these in Supabase SQL Editor.
-- READ-ONLY. Does not modify any data.

-- 1. User table structure
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'User'
  AND table_schema = 'public'
ORDER BY ordinal_position;

-- 2. Is clerkId still present? (expect: no row returned)
SELECT column_name FROM information_schema.columns
WHERE table_name = 'User' AND table_schema = 'public'
  AND column_name ILIKE '%clerk%';

-- 3. How many users?
SELECT COUNT(*) AS user_count FROM "User";

-- 4. Recent users (to confirm email-based keying works, no clerk residue)
SELECT id, email, "createdAt", "onboardingComplete"
FROM "User"
ORDER BY "createdAt" DESC
LIMIT 20;

-- 5. Project count per org (debug "4 of 2 projects" over-limit bug)
SELECT
  o.id, o.name, o.plan,
  COUNT(p.id) AS total_projects,
  COUNT(p.id) FILTER (WHERE p."isActive" = true) AS active_projects
FROM "Organization" o
LEFT JOIN "Project" p ON p."orgId" = o.id
GROUP BY o.id
ORDER BY active_projects DESC
LIMIT 10;

-- 6. Scans stuck in RUNNING for more than an hour
SELECT id, status, "createdAt", "completedAt", "orgId"
FROM "Scan"
WHERE status = 'RUNNING'
  AND "createdAt" < NOW() - INTERVAL '1 hour'
ORDER BY "createdAt" DESC
LIMIT 20;

-- 7. All scans (recent 20) to understand overall health
SELECT id, status, "createdAt", "completedAt", "orgId"
FROM "Scan"
ORDER BY "createdAt" DESC
LIMIT 20;

-- 8. RLS policies on storage.objects (evidence bucket)
SELECT policyname, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects';

-- 9. Evidence bucket exists in storage?
SELECT id, name, public, created_at
FROM storage.buckets
WHERE name = 'evidence';
