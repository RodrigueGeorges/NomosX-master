-- StudioX refund tracking (auto-refund on terminal pipeline failure)
ALTER TABLE "StudioXOrder" ADD COLUMN IF NOT EXISTS "refundedAt" TIMESTAMP(3);
ALTER TABLE "StudioXOrder" ADD COLUMN IF NOT EXISTS "stripeRefundId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "StudioXOrder_stripeRefundId_key" ON "StudioXOrder"("stripeRefundId");
