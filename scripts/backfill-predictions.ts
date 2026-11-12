/**
 * OT-1 BACKFILL — give every OPEN prediction a concrete dueAt and attach a
 * 90-day sentinel milestone to long-horizon predictions.
 *
 * Before this: 813 OPEN predictions, all pluriannual horizons, first due
 * 2028-07-01 → zero Brier signal for ~2 years. After: every row has an
 * authoritative dueAt; every strategic prediction gets a near-term sentinel
 * child that the worker resolver can close within a quarter.
 *
 * Run: npx tsx scripts/backfill-predictions.ts [--dry-run]
 */

import { prisma } from '../lib/db';
import { parseHorizonDue } from '../lib/agent/prediction-tracker';

const DRY_RUN = process.argv.includes('--dry-run');
const SENTINEL_DAYS = 90;

async function main() {
  const open = await prisma.prediction.findMany({
    where: { status: 'OPEN' },
    select: {
      id: true, briefId: true, claim: true, horizon: true, probability: true,
      confidence: true, resolutionCriteria: true, whatWouldFalsify: true,
      sourceRefs: true, createdAt: true, kind: true, dueAt: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  console.log(`[backfill] ${open.length} OPEN predictions${DRY_RUN ? ' (dry-run)' : ''}`);

  let dueSet = 0, unparseable = 0, sentinels = 0, skippedSentinel = 0;

  for (const p of open) {
    // 1. dueAt backfill — authoritative ISO deadline from horizon parsing.
    if (!p.dueAt) {
      const parsed = parseHorizonDue(p.horizon, p.createdAt);
      if (parsed) {
        if (!DRY_RUN) {
          await prisma.prediction.update({ where: { id: p.id }, data: { dueAt: parsed } });
        }
        dueSet++;
      } else {
        unparseable++;
      }
    }
    const effectiveDue = p.dueAt ?? parseHorizonDue(p.horizon, p.createdAt);

    // 2. Sentinel milestone — only for predictions due beyond the sentinel
    //    window (a near-term prediction IS already its own sentinel).
    if (!effectiveDue) continue;
    const daysOut = (effectiveDue.getTime() - Date.now()) / 86_400_000;
    if (daysOut <= SENTINEL_DAYS) continue;

    const existing = await prisma.prediction.findFirst({
      where: { parentPredictionId: p.id, kind: 'sentinel' },
      select: { id: true },
    });
    if (existing) { skippedSentinel++; continue; }

    const dueAt = new Date(Date.now() + SENTINEL_DAYS * 86_400_000);
    const claim = `[90d milestone] ${p.claim.slice(0, 400)}`;
    const dupe = await prisma.prediction.findFirst({
      where: { briefId: p.briefId, claim, status: 'OPEN' },
      select: { id: true },
    });
    if (dupe) { skippedSentinel++; continue; }

    if (!DRY_RUN) {
      await prisma.prediction.create({
        data: {
          briefId: p.briefId,
          claim,
          horizon: dueAt.toISOString().slice(0, 10),
          probability: p.probability,
          confidence: p.confidence,
          resolutionCriteria: `By ${dueAt.toISOString().slice(0, 10)}: early checkpoint on the trajectory — ${p.resolutionCriteria.slice(0, 300)}`,
          whatWouldFalsify: `Trajectory broken or key observable moved against the prediction by the checkpoint date`,
          sourceRefs: p.sourceRefs,
          status: 'OPEN',
          kind: 'sentinel',
          dueAt,
          linkId: null,
          parentPredictionId: p.id,
        },
      });
    }
    sentinels++;
  }

  console.log(`[backfill] dueAt set: ${dueSet} | still unparseable: ${unparseable} | sentinels created: ${sentinels} | already had sentinel: ${skippedSentinel}`);
  const nextDue = await prisma.prediction.findFirst({
    where: { status: 'OPEN', dueAt: { not: null } },
    orderBy: { dueAt: 'asc' },
    select: { dueAt: true },
  });
  console.log(`[backfill] earliest dueAt now: ${nextDue?.dueAt?.toISOString() ?? 'none'}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
