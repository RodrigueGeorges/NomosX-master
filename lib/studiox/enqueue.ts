import { prisma } from '@/lib/db';

export const STUDIOX_JOB_TYPE = 'STUDIOX_PIPELINE';

export function studioXJobIdempotencyKey(orderId: string): string {
  return `studiox:order:${orderId}`;
}

/**
 * Enqueue a StudioX pipeline job (idempotent) and trigger background execution.
 * Safe to call from webhook, API retry, or order reconciliation.
 */
export async function enqueueStudioXPipeline(orderId: string): Promise<{ enqueued: boolean; reason?: string }> {
  const order = await prisma.studioXOrder.findUnique({ where: { id: orderId } });
  if (!order) return { enqueued: false, reason: 'order_not_found' };

  if (order.result || order.status === 'DONE') {
    return { enqueued: false, reason: 'already_done' };
  }
  if (order.status === 'RUNNING') {
    return { enqueued: false, reason: 'already_running' };
  }
  if (order.status === 'FAILED') {
    return { enqueued: false, reason: 'failed' };
  }
  if (!['PAID', 'QUEUED'].includes(order.status)) {
    return { enqueued: false, reason: `invalid_status:${order.status}` };
  }

  const idempotencyKey = studioXJobIdempotencyKey(orderId);
  const existingJob = await prisma.job.findUnique({ where: { idempotencyKey } });

  if (existingJob && ['PENDING', 'RUNNING'].includes(existingJob.status)) {
    if (order.status !== 'QUEUED') {
      await prisma.studioXOrder.update({
        where: { id: orderId },
        data: { status: 'QUEUED', jobId: existingJob.id },
      });
    }
    await triggerStudioXBackground(orderId);
    return { enqueued: true, reason: 'existing_job' };
  }

  if (existingJob?.status === 'COMPLETED') {
    return { enqueued: false, reason: 'job_already_completed' };
  }

  const job = await prisma.job.create({
    data: {
      type: STUDIOX_JOB_TYPE,
      payload: { orderId, userId: order.userId },
      idempotencyKey,
      correlationId: orderId,
      priority: 9,
      maxRetries: 2,
    },
  });

  await prisma.studioXOrder.update({
    where: { id: orderId },
    data: { status: 'QUEUED', jobId: job.id },
  });

  await triggerStudioXBackground(orderId);
  return { enqueued: true };
}

/** Fire-and-forget: Netlify background function (prod) or API route (dev). */
export async function triggerStudioXBackground(orderId: string): Promise<void> {
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || process.env.URL || 'http://localhost:3000').replace(/\/$/, '');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error('[StudioX] CRON_SECRET missing — cannot trigger background runner');
    return;
  }

  const headers = {
    Authorization: `Bearer ${cronSecret}`,
    'Content-Type': 'application/json',
  };
  const body = JSON.stringify({ orderId });

  // Netlify background function (production)
  const bgUrl = `${appUrl}/.netlify/functions/studiox-run-pipeline-background`;
  void fetch(bgUrl, { method: 'POST', headers, body }).catch(async (err) => {
    console.warn('[StudioX] Background function trigger failed, falling back to API route:', err?.message);
    void fetch(`${appUrl}/api/studiox/process`, { method: 'POST', headers, body }).catch((e) => {
      console.error('[StudioX] API process fallback failed:', e?.message);
    });
  });
}
