import { prisma } from '@/lib/db';
import { enqueueStudioXPipeline } from './enqueue';

const STALE_PAID_MS = 2 * 60 * 1000;
const STALE_QUEUED_MS = 5 * 60 * 1000;
const STALE_RUNNING_MS = 20 * 60 * 1000;
const BATCH = 10;

export interface StudioXDrainResult {
  scanned: { paid: number; queued: number; running: number };
  requeued: string[];
  skipped: string[];
}

/**
 * Reconcile stuck StudioX orders — enqueue or reclaim stale RUNNING workers.
 * Safe to run on a schedule; all actions are idempotent.
 */
export async function drainStudioXOrders(): Promise<StudioXDrainResult> {
  const now = Date.now();
  const result: StudioXDrainResult = {
    scanned: { paid: 0, queued: 0, running: 0 },
    requeued: [],
    skipped: [],
  };

  const stuckPaid = await prisma.studioXOrder.findMany({
    where: {
      status: 'PAID',
      result: null,
      updatedAt: { lt: new Date(now - STALE_PAID_MS) },
    },
    orderBy: { updatedAt: 'asc' },
    take: BATCH,
    select: { id: true },
  });

  const stuckQueued = await prisma.studioXOrder.findMany({
    where: {
      status: 'QUEUED',
      result: null,
      updatedAt: { lt: new Date(now - STALE_QUEUED_MS) },
    },
    orderBy: { updatedAt: 'asc' },
    take: BATCH,
    select: { id: true },
  });

  const staleRunning = await prisma.studioXOrder.findMany({
    where: {
      status: 'RUNNING',
      result: null,
      startedAt: { lt: new Date(now - STALE_RUNNING_MS) },
    },
    orderBy: { startedAt: 'asc' },
    take: BATCH,
    select: { id: true },
  });

  result.scanned.paid = stuckPaid.length;
  result.scanned.queued = stuckQueued.length;
  result.scanned.running = staleRunning.length;

  for (const { id } of staleRunning) {
    const reclaimed = await prisma.studioXOrder.updateMany({
      where: { id, status: 'RUNNING', result: null },
      data: {
        status: 'QUEUED',
        progressMessage: 'Pipeline timed out — retry scheduled…',
        progressStep: 'RETRY',
      },
    });
    if (reclaimed.count === 0) {
      result.skipped.push(id);
      continue;
    }
    console.warn(`[StudioX Drain] Reclaimed stale RUNNING order ${id}`);
  }

  const toEnqueue = [
    ...stuckPaid.map((o) => o.id),
    ...stuckQueued.map((o) => o.id),
    ...staleRunning.map((o) => o.id),
  ];

  for (const orderId of [...new Set(toEnqueue)]) {
    const { enqueued, reason } = await enqueueStudioXPipeline(orderId);
    if (enqueued) {
      result.requeued.push(orderId);
      console.log(`[StudioX Drain] Re-enqueued ${orderId} (${reason ?? 'ok'})`);
    } else {
      result.skipped.push(`${orderId}:${reason ?? 'unknown'}`);
    }
  }

  return result;
}
