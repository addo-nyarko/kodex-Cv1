-- Add evidence source tracking to ScanControlResult and Scan tables

-- SQL Block 1: Add columns
ALTER TABLE "ScanControlResult" ADD COLUMN IF NOT EXISTS "evidenceSourcesJson" TEXT;
ALTER TABLE "Scan" ADD COLUMN IF NOT EXISTS "staleEvidence" BOOLEAN DEFAULT false;
ALTER TABLE "Scan" ADD COLUMN IF NOT EXISTS "staleSources" TEXT;

-- SQL Block 2: Verify columns added
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'ScanControlResult' AND column_name = 'evidenceSourcesJson'
UNION ALL
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'Scan' AND column_name IN ('staleEvidence', 'staleSources')
ORDER BY column_name;
