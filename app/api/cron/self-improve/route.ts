/**
 * Cron: Self-Improvement Jobs
 * 
 * Runs daily to:
 * 1. Audit past predictions (PredictionAuditor)
 * 2. Update source reputation scores (SourceReputationAgent)
 * 
 * Schedule: daily at 03:00 UTC (low-traffic window)
 */

import { NextResponse } from 'next/server';
import { runPredictionAuditor } from '@/lib/agent/prediction-auditor';
import { updateSourceReputations } from '@/lib/agent/source-reputation-agent';
import { prisma } from '@/lib/db';

export const maxDuration = 300;

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const start = Date.now();
  const results: Record<string, any> = {};

  // 1. Prediction Auditor — check if past predictions were confirmed/falsified
  try {
    console.log('[CRON:self-improve] Running Prediction Auditor...');
    const auditResult = await runPredictionAuditor({ lookbackDays: 365, minProbability: 0.5 });
    results.predictionAudit = {
      audited: auditResult.audited,
      confirmed: auditResult.confirmed,
      falsified: auditResult.falsified,
      avgAccuracy: auditResult.avgAccuracyScore,
      costUsd: auditResult.costUsd,
    };
    console.log(`[CRON:self-improve] Prediction Audit: ${auditResult.audited} audited, avg accuracy ${auditResult.avgAccuracyScore}/100`);
  } catch (err: any) {
    console.error('[CRON:self-improve] Prediction Auditor failed:', err.message);
    results.predictionAudit = { error: err.message };
  }

  // 2. Source Reputation — recompute quality scores from usage history
  try {
    console.log('[CRON:self-improve] Updating source reputations...');
    const repResult = await updateSourceReputations({ lookbackDays: 90, minUsages: 2 });
    results.sourceReputation = repResult;
    console.log(`[CRON:self-improve] Source Reputation: ${repResult.updated} updated (${repResult.boosted} boosted, ${repResult.decayed} decayed)`);
  } catch (err: any) {
    console.error('[CRON:self-improve] Source Reputation failed:', err.message);
    results.sourceReputation = { error: err.message };
  }

  // Record cron run for health monitoring
  const now = new Date();
  prisma.systemMetric.create({
    data: {
      metricName: 'cron.self-improve',
      metricValue: 1,
      unit: 'count',
      periodStart: now,
      periodEnd: now,
      dimensions: results,
    },
  }).catch(() => {});

  return NextResponse.json({
    ok: true,
    durationMs: Date.now() - start,
    results,
  });
}
