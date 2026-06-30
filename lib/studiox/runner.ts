import { prisma } from '@/lib/db';
import { runPipeline } from '@/lib/agent/pipeline-v2';
import { setProgressPersistenceHook } from '@/lib/agent/pipeline-progress';
import Sentry from '@sentry/nextjs';
import { formatTypeToReportFormat } from './format';
import { STUDIOX_JOB_TYPE, studioXJobIdempotencyKey } from './enqueue';
import { refundStudioXOrder } from './refund';

const STALE_RUNNING_MS = 20 * 60 * 1000;

/**
 * Process a paid StudioX order: run the full V7 pipeline and persist the result.
 * Idempotent — safe if called twice for the same orderId.
 */
export async function processStudioXOrder(orderId: string): Promise<void> {
  const order = await prisma.studioXOrder.findUnique({ where: { id: orderId } });
  if (!order) {
    console.warn(`[StudioX Runner] Order ${orderId} not found`);
    return;
  }

  if (order.result || order.status === 'DONE') {
    console.log(`[StudioX Runner] Order ${orderId} already completed`);
    return;
  }

  if (order.status === 'RUNNING') {
    const started = order.startedAt?.getTime() ?? 0;
    if (started && Date.now() - started < STALE_RUNNING_MS) {
      console.log(`[StudioX Runner] Order ${orderId} already running`);
      return;
    }
    console.warn(`[StudioX Runner] Order ${orderId} stale RUNNING — reclaiming`);
  }

  if (!['QUEUED', 'PAID', 'RUNNING'].includes(order.status)) {
    console.warn(`[StudioX Runner] Order ${orderId} status=${order.status} — skip`);
    return;
  }

  const claimed = await prisma.studioXOrder.updateMany({
    where: {
      id: orderId,
      status: { in: ['QUEUED', 'PAID', 'RUNNING'] },
      result: null,
    },
    data: {
      status: 'RUNNING',
      startedAt: new Date(),
      progressStep: 'INIT',
      progressPct: 0,
      progressMessage: 'Starting research pipeline…',
      failureReason: null,
    },
  });

  if (claimed.count === 0) {
    console.log(`[StudioX Runner] Order ${orderId} claim failed (another worker?)`);
    return;
  }

  const idempotencyKey = studioXJobIdempotencyKey(orderId);
  let job = await prisma.job.findUnique({ where: { idempotencyKey } });

  if (job && job.status === 'RUNNING') {
    const jobStarted = job.startedAt?.getTime() ?? 0;
    if (jobStarted && Date.now() - jobStarted < STALE_RUNNING_MS) {
      await prisma.studioXOrder.updateMany({
        where: { id: orderId, status: 'RUNNING' },
        data: { status: 'QUEUED' },
      });
      return;
    }
  }

  if (!job) {
    job = await prisma.job.create({
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
      data: { jobId: job.id },
    });
  }

  await prisma.job.update({
    where: { id: job.id },
    data: { status: 'RUNNING', startedAt: new Date(), attempts: { increment: 1 } },
  });

  setProgressPersistenceHook(async (event) => {
    try {
      await prisma.studioXOrder.update({
        where: { id: orderId },
        data: {
          pipelineRunId: event.runId,
          progressStep: event.step,
          progressPct: event.progress >= 0 ? event.progress : undefined,
          progressMessage: event.message,
        },
      });
    } catch (err) {
      console.warn('[StudioX Runner] Progress persist failed:', err);
    }
  });

  const reportFormat = formatTypeToReportFormat(order.formatType);

  try {
    console.log(`[StudioX Runner] Starting pipeline for order ${orderId} format=${reportFormat}`);

    const run = await runPipeline(order.question, reportFormat, {
      targetAudience: order.audience ?? undefined,
      urgencyContext: order.urgency ?? undefined,
    });

    const brief = await prisma.brief.findUnique({
      where: { id: run.briefId },
      select: { html: true },
    });
    const html = brief?.html ?? '';

    if (!html) {
      throw new Error('Pipeline completed but brief HTML is empty');
    }

    await prisma.$transaction([
      prisma.studioXOrder.update({
        where: { id: orderId },
        data: {
          status: 'DONE',
          result: html,
          completedAt: new Date(),
          pipelineRunId: run.pipelineRunId,
          progressStep: 'COMPLETE',
          progressPct: 100,
          progressMessage: 'Research complete',
          failureReason: null,
        },
      }),
      prisma.job.update({
        where: { id: job!.id },
        data: {
          status: 'COMPLETED',
          finishedAt: new Date(),
          result: { briefId: run.briefId, pipelineRunId: run.pipelineRunId },
        },
      }),
    ]);

    console.log(`[StudioX Runner] Order ${orderId} DONE brief=${run.briefId}`);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[StudioX Runner] Order ${orderId} FAILED:`, message);
    Sentry.captureException(err, { extra: { orderId } });

    const attempts = job?.attempts ?? 1;
    const maxRetries = job?.maxRetries ?? 2;
    const canRetry = attempts < maxRetries;

    await prisma.studioXOrder.update({
      where: { id: orderId },
      data: {
        status: canRetry ? 'QUEUED' : 'FAILED',
        failureReason: message,
        failedAt: canRetry ? null : new Date(),
        progressStep: 'ERROR',
        progressMessage: canRetry ? 'Retry scheduled…' : `Failed: ${message}`,
      },
    });

    await prisma.job.update({
      where: { id: job!.id },
      data: {
        status: canRetry ? 'PENDING' : 'FAILED',
        lastError: message,
        finishedAt: canRetry ? null : new Date(),
      },
    });

    if (canRetry) {
      throw err;
    }

    void refundStudioXOrder(orderId).catch((refundErr) => {
      console.error(`[StudioX Runner] Refund trigger failed for ${orderId}:`, refundErr);
    });
  } finally {
    setProgressPersistenceHook(null);
  }
}
