-- Add email verification fields to User model
-- Migration: 20260220_add_email_verification.sql

-- Add email verification specific fields (keeping existing ones for compatibility)
ALTER TABLE "User" 
ADD COLUMN "emailVerificationToken" VARCHAR(255),
ADD COLUMN "emailVerificationExpires" TIMESTAMP(3);

-- Create index for verification token lookup
CREATE INDEX "User_emailVerificationToken_idx" ON "User"("emailVerificationToken", "emailVerificationExpires");

-- Update existing users with verification tokens if they don't have one
UPDATE "User" 
SET "emailVerificationToken" = encode(sha256(random_bytes(32)::bytea, 'hex'), 'hex'),
    "emailVerificationExpires" = NOW() + INTERVAL '24 hours'
WHERE "emailVerified" = false AND "emailVerificationToken" IS NULL;
