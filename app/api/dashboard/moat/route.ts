/**
 * Moat Dashboard API — NomosX
 *
 * GET /api/dashboard/moat
 * Returns metrics for all 4 moat pillars: PRM, Self-Play, MoA, World Model.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function GET(_req: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.id) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const lookbackDays = 30;
    const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);

    // Fetch all moat-related audit logs
    const records = await prisma.agentAuditLog.findMany({
      where: {
        agent: { in: ['prm', 'self_play', 'moa', 'world_model'] },
        timestamp: { gte: since },
      },
      orderBy: { timestamp: 'desc' },
      take: 1000,
    });

    // Categorize
    const prmSteps: any[] = [];
    const prmModels: any[] = [];
    const selfPlayRounds: any[] = [];
    const moaRuns: any[] = [];
    const moaWeights: any[] = [];
    const worldModelUpdates: any[] = [];
    const crossDomainLinks: any[] = [];

    for (const record of records) {
      try {
        const meta = JSON.parse(record.metadata || '{}');
        switch (record.agent) {
          case 'prm':
            if (record.action === 'PROCESS_STEP') prmSteps.push({ ...meta, logId: record.id, timestamp: record.timestamp });
            else if (record.action === 'MODEL_UPDATE') prmModels.push({ ...meta, logId: record.id, timestamp: record.timestamp });
            break;
          case 'self_play':
            if (record.action === 'SELF_PLAY_ROUND') selfPlayRounds.push({ ...meta, logId: record.id, timestamp: record.timestamp });
            break;
          case 'moa':
            if (record.action === 'MOA_RUN') moaRuns.push({ ...meta, logId: record.id, timestamp: record.timestamp });
            else if (record.action === 'WEIGHTS_UPDATE') moaWeights.push({ ...meta, logId: record.id, timestamp: record.timestamp });
            break;
          case 'world_model':
            if (record.action === 'CROSS_DOMAIN_LINK') crossDomainLinks.push({ ...meta, logId: record.id, timestamp: record.timestamp });
            else if (record.action.startsWith('DOMAIN_UPDATE_')) {
              worldModelUpdates.push({ domain: record.action.replace('DOMAIN_UPDATE_', ''), ...meta, logId: record.id, timestamp: record.timestamp });
            }
            break;
        }
      } catch {}
    }

    // ── PRM metrics ──
    const latestPRMModel = prmModels[0] || null;
    const prmAvgReward = prmSteps.length > 0
      ? prmSteps.filter(s => s.reward !== undefined).reduce((s, x) => s + x.reward, 0) / prmSteps.filter(s => s.reward !== undefined).length
      : null;
    const prmTopFeatures = latestPRMModel
      ? Object.entries(latestPRMModel.weights || {})
          .sort((a: any, b: any) => Math.abs(b[1]) - Math.abs(a[1]))
          .slice(0, 5)
          .map(([name, weight]) => ({ feature: name, weight: weight as number }))
      : [];

    // ── Self-Play metrics ──
    const spTotalAttacks = selfPlayRounds.reduce((s, r) => s + (r.attackCount || 0), 0);
    const spSucceededAttacks = selfPlayRounds.reduce((s, r) => s + (r.succeededAttacks || 0), 0);
    const spAvgRobustness = selfPlayRounds.length > 0
      ? selfPlayRounds.reduce((s, r) => s + (r.robustnessScore || 0), 0) / selfPlayRounds.length
      : null;
    const spWeaknessCategories: Record<string, number> = {};
    for (const round of selfPlayRounds) {
      if (round.lessons) {
        for (const lesson of round.lessons) {
          spWeaknessCategories[lesson.category] = (spWeaknessCategories[lesson.category] || 0) + 1;
        }
      }
    }

    // ── MoA metrics ──
    const moaAvgConfidence = moaRuns.length > 0
      ? moaRuns.reduce((s, r) => s + (r.overallConfidence || 0), 0) / moaRuns.length
      : null;
    const moaAgentUsage: Record<string, number> = {};
    for (const run of moaRuns) {
      if (run.agents) {
        for (const agent of run.agents) {
          moaAgentUsage[agent.id] = (moaAgentUsage[agent.id] || 0) + 1;
        }
      }
    }
    const latestMoAWeights = moaWeights[0]?.weights || null;

    // ── World Model metrics ──
    const wmDomainCount = new Set(worldModelUpdates.map(u => u.domain)).size;
    const wmTotalConcepts = worldModelUpdates.reduce((s, u) => s + (u.concepts?.length || 0), 0);
    const wmTotalPositions = worldModelUpdates.reduce((s, u) => s + (u.establishedPositions?.length || 0), 0);
    const wmTotalControversies = worldModelUpdates.reduce((s, u) => s + (u.controversies?.length || 0), 0);
    const wmTotalSources = worldModelUpdates.reduce((s, u) => s + (u.keySources?.length || 0), 0);
    const wmTotalRuns = worldModelUpdates.reduce((s, u) => s + (u.runCount || 0), 0);
    const wmDomains = worldModelUpdates.map(u => ({
      domain: u.domain,
      concepts: u.concepts?.length || 0,
      positions: u.establishedPositions?.length || 0,
      controversies: u.controversies?.length || 0,
      sources: u.keySources?.length || 0,
      runCount: u.runCount || 0,
    }));

    return NextResponse.json({
      summary: {
        prmSteps: prmSteps.length,
        prmTrainingExamples: latestPRMModel?.trainingExamples || 0,
        selfPlayRounds: selfPlayRounds.length,
        moaRuns: moaRuns.length,
        worldModelDomains: wmDomainCount,
        crossDomainLinks: crossDomainLinks.length,
        lookbackDays,
      },
      prm: {
        trainingExamples: latestPRMModel?.trainingExamples || 0,
        avgReward: prmAvgReward,
        topFeatures: prmTopFeatures,
        recentSteps: prmSteps.slice(0, 10).map(s => ({
          phase: s.phase,
          reward: s.reward,
          timestamp: s.timestamp,
        })),
      },
      selfPlay: {
        totalRounds: selfPlayRounds.length,
        totalAttacks: spTotalAttacks,
        succeededAttacks: spSucceededAttacks,
        successRate: spTotalAttacks > 0 ? spSucceededAttacks / spTotalAttacks : null,
        avgRobustness: spAvgRobustness,
        weaknessCategories: spWeaknessCategories,
        recentRounds: selfPlayRounds.slice(0, 5).map(r => ({
          query: r.query,
          attacks: r.attackCount,
          succeeded: r.succeededAttacks,
          robustness: r.robustnessScore,
          lessons: r.lessons?.length || 0,
        })),
      },
      moa: {
        totalRuns: moaRuns.length,
        avgConfidence: moaAvgConfidence,
        agentUsage: moaAgentUsage,
        latestWeights: latestMoAWeights,
        recentRuns: moaRuns.slice(0, 5).map(r => ({
          query: r.query,
          agentCount: r.agentCount,
          consensus: r.consensus,
          controversies: r.controversies,
          confidence: r.overallConfidence,
        })),
      },
      worldModel: {
        domainCount: wmDomainCount,
        totalConcepts: wmTotalConcepts,
        totalPositions: wmTotalPositions,
        totalControversies: wmTotalControversies,
        totalSources: wmTotalSources,
        totalRuns: wmTotalRuns,
        domains: wmDomains,
        crossDomainLinks: crossDomainLinks.slice(0, 10).map(l => ({
          conceptA: l.conceptA,
          domainA: l.domainA,
          conceptB: l.conceptB,
          domainB: l.domainB,
          connection: l.connection,
          strength: l.strength,
        })),
      },
    });
  } catch (error: any) {
    console.error('[Moat Dashboard API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch moat metrics' },
      { status: 500 },
    );
  }
}
