-- Reset the stuck EU AI ACT scan so it can be re-run
-- This marks it as FAILED so the user can start a fresh scan

UPDATE "Scan"
SET
  status = 'FAILED',
  "errorMessage" = 'Reset: scan was stuck in AWAITING_CLARIFICATION — multi-framework polling fix deployed, please re-run',
  "completedAt" = NOW()
WHERE status = 'AWAITING_CLARIFICATION'
  AND "createdAt" > NOW() - INTERVAL '24 hours';

-- Verify
SELECT id, status, "errorMessage", "completedAt"
FROM "Scan"
WHERE status = 'FAILED'
  AND "completedAt" > NOW() - INTERVAL '5 minutes';
