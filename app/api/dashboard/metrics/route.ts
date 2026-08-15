/**
 * NomosX METRICS DASHBOARD API — LOT 8.3
 *
 * GET /api/dashboard/metrics
 * Returns aggregated pipeline metrics for monitoring.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withAuth } from '@/lib/validation';

export async function GET(req: NextRequest) {
  return withAuth(
    async () => {
  try {
    // Last 30 days of briefs
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const briefs = await prisma.brief.findMany({
      where: { createdAt: { gte: since } },
      select: {
        id: true,
        kind: true,
        question: true,
        createdAt: true,
        pipelineRunId: true,
        pipelineRun: {
          select: { steps: true, totalCostUsd: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    // Aggregate metrics
    let totalCost = 0;
    let styleGatePasses = 0;
    let numericalGatePasses = 0;
    let totalPredictions = 0;
    let totalResearchGaps = 0;
    let deepPlannerRuns = 0;
    let deepPlannerNodes = 0;

    for (const brief of briefs) {
      const steps = brief.pipelineRun?.steps as any;
      totalCost += brief.pipelineRun?.totalCostUsd || 0;
      if (steps) {
        if (steps.styleGates?.passed) styleGatePasses++;
        if (steps.numericalGate?.passed) numericalGatePasses++;
        totalPredictions += steps.predictions?.registered || 0;
        totalResearchGaps += steps.researchGaps?.length || 0;
        if (steps.deepPlanner?.nodes) {
          deepPlannerRuns++;
          deepPlannerNodes += steps.deepPlanner.nodes;
        }
      }
    }

    const metrics = {
      period: '30d',
      briefCount: briefs.length,
      briefTypes: {
        strategic: briefs.filter(b => b.kind === 'strategic').length,
        brief: briefs.filter(b => b.kind === 'brief').length,
      },
      aggregated: {
        totalCostUsd: Math.round(totalCost * 100) / 100,
        avgCostPerBrief: briefs.length > 0 ? Math.round((totalCost / briefs.length) * 100) / 100 : 0,
        styleGatePassRate: briefs.length > 0 ? styleGatePasses / briefs.length : 0,
        numericalGatePassRate: briefs.length > 0 ? numericalGatePasses / briefs.length : 0,
        totalPredictions,
        totalResearchGaps,
        deepPlanner: {
          runs: deepPlannerRuns,
          avgNodes: deepPlannerRuns > 0 ? Math.round(deepPlannerNodes / deepPlannerRuns) : 0,
        },
      },
      recent: briefs.slice(0, 10).map(b => ({
        id: b.id,
        question: b.question.slice(0, 100),
        kind: b.kind,
        createdAt: b.createdAt.toISOString(),
      })),
    };

    return NextResponse.json(metrics);
  } catch (err) {
    console.error('[DASHBOARD] Error:', err);
    return NextResponse.json({ error: 'Failed to fetch metrics' }, { status: 500 });
  }
    }
  )(req);
}
