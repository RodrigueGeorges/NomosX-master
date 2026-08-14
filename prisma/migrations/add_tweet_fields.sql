-- ============================================================================
-- TWITTER DISTRIBUTION FIELDS
-- Adds tweetedAt and tweetId to ThinkTankPublication for auto-tweet tracking
-- ============================================================================

ALTER TABLE "ThinkTankPublication"
    ADD COLUMN IF NOT EXISTS "tweetedAt" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "tweetId" TEXT;
