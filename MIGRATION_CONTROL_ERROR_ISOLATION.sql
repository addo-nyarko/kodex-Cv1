-- Add per-control error isolation tracking to ScanControlResult

-- SQL Block 1: Add evaluationError column
ALTER TABLE "ScanControlResult" ADD COLUMN IF NOT EXISTS "evaluationError" TEXT;

-- SQL Block 2: Verify column added
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'ScanControlResult' AND column_name = 'evaluationError'
ORDER BY column_name;
