-- Migration: Add institutional provider fields to Source table
-- Date: 2026-01-23
-- Description: Support for 21 institutional data providers (intelligence, defense, economic, cyber, multilateral, archives)

-- Add new columns to Source table
ALTER TABLE "Source" 
ADD COLUMN IF NOT EXISTS "documentType" TEXT,
ADD COLUMN IF NOT EXISTS "issuer" TEXT,
ADD COLUMN IF NOT EXISTS "issuerType" TEXT,
ADD COLUMN IF NOT EXISTS "classification" TEXT,
ADD COLUMN IF NOT EXISTS "publishedDate" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "language" TEXT DEFAULT 'en',
ADD COLUMN IF NOT EXISTS "contentFormat" TEXT,
ADD COLUMN IF NOT EXISTS "securityLevel" TEXT,
ADD COLUMN IF NOT EXISTS "economicSeries" TEXT,
ADD COLUMN IF NOT EXISTS "legalStatus" TEXT;

-- Add indexes for efficient querying
CREATE INDEX IF NOT EXISTS "Source_issuerType_idx" ON "Source"("issuerType");
CREATE INDEX IF NOT EXISTS "Source_issuer_idx" ON "Source"("issuer");
CREATE INDEX IF NOT EXISTS "Source_documentType_idx" ON "Source"("documentType");
CREATE INDEX IF NOT EXISTS "Source_classification_idx" ON "Source"("classification");
CREATE INDEX IF NOT EXISTS "Source_publishedDate_idx" ON "Source"("publishedDate");
CREATE INDEX IF NOT EXISTS "Source_language_idx" ON "Source"("language");

-- Add comments for documentation
COMMENT ON COLUMN "Source"."documentType" IS 'Type of institutional document: report, assessment, declassified, dataset, directive, briefing';
COMMENT ON COLUMN "Source"."issuer" IS 'Issuing institution: ODNI, CIA, IMF, NATO, etc.';
COMMENT ON COLUMN "Source"."issuerType" IS 'Category of issuer: intelligence, defense, economic, multilateral, cyber';
COMMENT ON COLUMN "Source"."classification" IS 'Security classification: unclassified, declassified, public';
COMMENT ON COLUMN "Source"."publishedDate" IS 'Official publication date (distinct from createdAt)';
COMMENT ON COLUMN "Source"."language" IS 'Document language: en, fr, multi';
COMMENT ON COLUMN "Source"."contentFormat" IS 'Content format: pdf, html, xml, api, json';
COMMENT ON COLUMN "Source"."securityLevel" IS 'Security level for intelligence sources';
COMMENT ON COLUMN "Source"."economicSeries" IS 'Economic series code (e.g., IMF WP, World Bank CR)';
COMMENT ON COLUMN "Source"."legalStatus" IS 'Legal status for directives/regulations';
