-- StudioX async pipeline: progress + execution tracking
ALTER TABLE "StudioXOrder" ADD COLUMN IF NOT EXISTS "jobId" TEXT;
ALTER TABLE "StudioXOrder" ADD COLUMN IF NOT EXISTS "pipelineRunId" TEXT;
ALTER TABLE "StudioXOrder" ADD COLUMN IF NOT EXISTS "progressStep" TEXT;
ALTER TABLE "StudioXOrder" ADD COLUMN IF NOT EXISTS "progressPct" INTEGER;
ALTER TABLE "StudioXOrder" ADD COLUMN IF NOT EXISTS "progressMessage" TEXT;
ALTER TABLE "StudioXOrder" ADD COLUMN IF NOT EXISTS "failureReason" TEXT;
ALTER TABLE "StudioXOrder" ADD COLUMN IF NOT EXISTS "startedAt" TIMESTAMP(3);
ALTER TABLE "StudioXOrder" ADD COLUMN IF NOT EXISTS "failedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "StudioXOrder_jobId_idx" ON "StudioXOrder"("jobId");
