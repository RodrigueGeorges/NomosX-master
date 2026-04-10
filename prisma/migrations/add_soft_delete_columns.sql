-- CreateIndex
CREATE INDEX "Source_deletedAt_idx" ON "Source"("deletedAt");

-- CreateIndex (composite index for dedup queries)
CREATE INDEX "Source_doi_deletedAt_idx" ON "Source"("doi", "deletedAt");

-- AlterTable - Add soft-delete columns
ALTER TABLE "Source" ADD COLUMN "deletedAt" TIMESTAMP(3),
ADD COLUMN "deletionReason" TEXT;

-- Update queries to filter soft-deleted sources by default
-- This should be done in ORM code, but documented here for reference:
-- 
-- BEFORE:
-- SELECT * FROM "Source" WHERE provider = 'openalex'
--
-- AFTER:
-- SELECT * FROM "Source" WHERE provider = 'openalex' AND "deletedAt" IS NULL
--
-- This ensures soft-deleted sources are never returned by default.
-- To query deleted sources: add AND "deletedAt" IS NOT NULL
