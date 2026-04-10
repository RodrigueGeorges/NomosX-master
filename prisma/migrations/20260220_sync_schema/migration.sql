-- Migration: Sync schema with codebase (Feb 2026)
-- Adds missing columns introduced since initial migration
-- All statements use IF NOT EXISTS / safe defaults

-- ============================================================================
-- 1. Subscription — add studio limits + fix plan default
-- ============================================================================

ALTER TABLE "Subscription"
  ADD COLUMN IF NOT EXISTS "studioQuestionsPerMonth" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "studioQuestionsUsed"     INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "lastStudioReset"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "activeVerticalsMax"       INTEGER NOT NULL DEFAULT 1;

-- Update default plan from TRIAL to ANALYST for new rows
ALTER TABLE "Subscription" ALTER COLUMN "plan" SET DEFAULT 'ANALYST';

-- Migrate existing TRIAL rows to ANALYST
UPDATE "Subscription" SET "plan" = 'ANALYST' WHERE "plan" = 'TRIAL';

-- Migrate old plan names to new ones (EXECUTIVE → RESEARCHER, STRATEGY → STUDIO)
UPDATE "Subscription" SET "plan" = 'RESEARCHER' WHERE "plan" = 'EXECUTIVE';
UPDATE "Subscription" SET "plan" = 'STUDIO'     WHERE "plan" = 'STRATEGY';

-- ============================================================================
-- 2. NewsletterSubscriber — ensure all required columns exist
-- ============================================================================

ALTER TABLE "NewsletterSubscriber"
  ADD COLUMN IF NOT EXISTS "confirmToken"       TEXT,
  ADD COLUMN IF NOT EXISTS "confirmedAt"        TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "unsubscribedAt"     TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "unsubscribeReason"  TEXT,
  ADD COLUMN IF NOT EXISTS "lastEmailSentAt"    TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "emailsSent"         INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "emailsOpened"       INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "emailsClicked"      INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "convertedToTrial"   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "convertedAt"        TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "source"             TEXT,
  ADD COLUMN IF NOT EXISTS "referrer"           TEXT;

-- Unique index on confirmToken (if not already present)
CREATE UNIQUE INDEX IF NOT EXISTS "NewsletterSubscriber_confirmToken_key"
  ON "NewsletterSubscriber"("confirmToken")
  WHERE "confirmToken" IS NOT NULL;

-- Indexes
CREATE INDEX IF NOT EXISTS "NewsletterSubscriber_status_idx"    ON "NewsletterSubscriber"("status");
CREATE INDEX IF NOT EXISTS "NewsletterSubscriber_source_idx"    ON "NewsletterSubscriber"("source");
CREATE INDEX IF NOT EXISTS "NewsletterSubscriber_createdAt_idx" ON "NewsletterSubscriber"("createdAt");

-- ============================================================================
-- 3. NewsletterEdition — ensure all required columns exist
-- ============================================================================

ALTER TABLE "NewsletterEdition"
  ADD COLUMN IF NOT EXISTS "preheader"        TEXT,
  ADD COLUMN IF NOT EXISTS "scheduledFor"     TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "sentAt"           TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "recipientCount"   INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "openCount"        INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "clickCount"       INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "unsubscribeCount" INTEGER NOT NULL DEFAULT 0;

-- Indexes
CREATE INDEX IF NOT EXISTS "NewsletterEdition_status_idx"       ON "NewsletterEdition"("status");
CREATE INDEX IF NOT EXISTS "NewsletterEdition_scheduledFor_idx" ON "NewsletterEdition"("scheduledFor");
CREATE INDEX IF NOT EXISTS "NewsletterEdition_sentAt_idx"       ON "NewsletterEdition"("sentAt");

-- ============================================================================
-- 4. SystemMetric — ensure timestamp field exists (used by health/crons)
-- ============================================================================

ALTER TABLE "SystemMetric"
  ADD COLUMN IF NOT EXISTS "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS "SystemMetric_metricName_timestamp_idx"
  ON "SystemMetric"("metricName", "timestamp");
