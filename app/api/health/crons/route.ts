/**
 * GET /api/health/crons
 * Returns last run time of each cron job + staleness status.
 * Protected by ADMIN_KEY.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

const CRON_JOBS = [
  { metricName: 'cron.newsletter',      label: 'Weekly Newsletter',    maxStalenessHours: 170 },
  { metricName: 'cron.editorial-plan',  label: 'Editorial Planner',    maxStalenessHours: 170 },
  { metricName: 'cron.self-improve',    label: 'Self-Improvement',     maxStalenessHours: 26  },
  { metricName: 'cron.cadence-reset',   label: 'Cadence Reset',        maxStalenessHours: 26  },
] as const;

export async function GET(req: NextRequest) {
  const adminKey = process.env.ADMIN_KEY;
  const provided = req.headers.get('x-admin-key');

  if (!adminKey || provided !== adminKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const metrics = await Promise.all(
      CRON_JOBS.map(async (job) => {
        const metric = await prisma.systemMetric.findFirst({
          where: { metricName: job.metricName },
          orderBy: { timestamp: 'desc' },
        }).catch(() => null);

        const lastRun = metric?.timestamp ?? null;
        const ageHours = lastRun
          ? (Date.now() - new Date(lastRun).getTime()) / (1000 * 60 * 60)
          : null;

        const status = !lastRun
          ? 'never_run'
          : ageHours! > job.maxStalenessHours
          ? 'stale'
          : 'ok';

        return {
          metricName: job.metricName,
          label: job.label,
          lastRun: lastRun?.toISOString() ?? null,
          ageHours: ageHours !== null ? Math.round(ageHours * 10) / 10 : null,
          maxStalenessHours: job.maxStalenessHours,
          status,
        };
      })
    );

    const allOk = metrics.every(m => m.status === 'ok');

    return NextResponse.json({
      status: allOk ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      crons: metrics,
    });
  } catch (error) {
    console.error('[Health/Crons] Error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
