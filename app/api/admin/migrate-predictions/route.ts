/**
 * POST /api/admin/migrate-predictions — one-shot schema migration for the
 * OT-1 Prediction columns (kind, dueAt, linkId, parentPredictionId,
 * resolutionSource). Idempotent (IF NOT EXISTS). Guarded by ADMIN_KEY.
 *
 * Needed because `prisma db push` can't run against prod from a dev machine
 * without the Neon URL — this route executes the same additive DDL through
 * the already-bundled Prisma client.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { env } from '@/lib/env';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const DDL = [
  `ALTER TABLE "Prediction" ADD COLUMN IF NOT EXISTS "kind" TEXT NOT NULL DEFAULT 'strategic'`,
  `ALTER TABLE "Prediction" ADD COLUMN IF NOT EXISTS "dueAt" TIMESTAMP(3)`,
  `ALTER TABLE "Prediction" ADD COLUMN IF NOT EXISTS "linkId" TEXT`,
  `ALTER TABLE "Prediction" ADD COLUMN IF NOT EXISTS "parentPredictionId" TEXT`,
  `ALTER TABLE "Prediction" ADD COLUMN IF NOT EXISTS "resolutionSource" TEXT`,
  `CREATE INDEX IF NOT EXISTS "Prediction_dueAt_idx" ON "Prediction"("dueAt")`,
  `CREATE INDEX IF NOT EXISTS "Prediction_kind_idx" ON "Prediction"("kind")`,
];

export async function POST(req: NextRequest) {
  const key = req.headers.get('x-admin-key') ?? req.nextUrl.searchParams.get('key');
  if (!env.ADMIN_KEY || key !== env.ADMIN_KEY) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const results: string[] = [];
  for (const sql of DDL) {
    try {
      await prisma.$executeRawUnsafe(sql);
      results.push(`ok: ${sql.slice(0, 60)}`);
    } catch (err) {
      results.push(`fail: ${sql.slice(0, 60)} — ${err instanceof Error ? err.message.slice(0, 120) : String(err)}`);
    }
  }
  return NextResponse.json({ results });
}
