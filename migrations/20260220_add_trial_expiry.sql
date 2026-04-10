-- Add trial expiry fields to Subscription model
-- Migration: 20260220_add_trial_expiry.sql

ALTER TABLE "Subscription" 
ADD COLUMN "trialEnd" TIMESTAMP(3),
ADD COLUMN "isTrialActive" BOOLEAN DEFAULT true;

-- Update existing subscriptions to have 30-day trial from creation date
UPDATE "Subscription" 
SET "trialEnd" = "createdAt" + INTERVAL '30 days',
    "isTrialActive" = true
WHERE "trialEnd" IS NULL;

-- Create index for trial expiry queries
CREATE INDEX "Subscription_trialEnd_idx" ON "Subscription"("trialEnd");
