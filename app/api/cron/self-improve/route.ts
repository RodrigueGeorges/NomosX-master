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
import { verifyBearerToken } from '@/lib/security/timing-safe';

export const maxDuration = 300;

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (!verifyBearerToken(authHeader, process.env.CRON_SECRET)) {
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

  // 3. GMPO prompt optimization — optimize the weakest agent's prompt
  // Runs only when enough signal exists (≥5 audit logs for the agent).
  try {
    const { runGMPOForAgent } = await import('@/lib/agent/self-evolver');
    // Pick the agent with the most SELF_CORRECTION/LESSON_LEARNED activity
    const candidates = ['analyst', 'strategic-analyst', 'reader', 'critic'];
    let target: string | null = null;
    let maxLogs = 0;
    for (const agentId of candidates) {
      const count = await prisma.agentAuditLog.count({
        where: { agent: agentId, action: { in: ['SELF_CORRECTION', 'LESSON_LEARNED'] } },
      });
      if (count > maxLogs) { maxLogs = count; target = agentId; }
    }
    if (target && maxLogs >= 5) {
      const testCases = [
        'How do critical mineral supply chains reshape US-China strategic rivalry?',
        'What drives institutional trust erosion in post-industrial democracies?',
      ];
      const gmpoResult = await runGMPOForAgent(target, `[${target}] default system prompt`, testCases);
      results.gmpo = {
        agent: target,
        improved: gmpoResult.improved,
        improvementScore: gmpoResult.improvementScore,
        costUsd: gmpoResult.costUsd,
      };
      console.log(`[CRON:self-improve] GMPO: ${target} ${gmpoResult.improved ? 'improved' : 'no improvement'} (${(gmpoResult.improvementScore * 100).toFixed(0)}pts, $${gmpoResult.costUsd.toFixed(4)})`);
    } else {
      results.gmpo = { skipped: true, reason: `insufficient signal (${maxLogs} logs < 5)` };
    }
  } catch (err: any) {
    console.error('[CRON:self-improve] GMPO failed:', err.message);
    results.gmpo = { error: err.message };
  }

  // 4. Memory Consolidation — episodic → semantic (STM→LTM promotion).
  // Digests recent episodes + lessons into durable domain patterns.
  // Self-throttles to once per 24h internally.
  try {
    const { consolidateEpisodicMemory } = await import('@/lib/agent/memory-consolidation');
    const consolidation = await consolidateEpisodicMemory();
    results.memoryConsolidation = {
      ran: consolidation.ran,
      skippedReason: consolidation.skippedReason,
      episodesRead: consolidation.episodesRead,
      domainsProcessed: consolidation.domainsProcessed,
      patternsStored: consolidation.patternsStored,
      costUsd: consolidation.costUsd,
    };
    if (consolidation.ran) {
      console.log(`[CRON:self-improve] Memory Consolidation: ${consolidation.patternsStored} patterns from ${consolidation.episodesRead + consolidation.lessonsRead} records across ${consolidation.domainsProcessed} domains`);
    }
  } catch (err: any) {
    console.error('[CRON:self-improve] Memory Consolidation failed:', err.message);
    results.memoryConsolidation = { error: err.message };
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
