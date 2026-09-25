/**
 * Witness Dashboard API — NomosX
 *
 * GET /api/dashboard/witness
 * Returns Witness metrics: anomalies, interventions, run learnings, health trends.
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

    // Fetch all Witness audit logs in the lookback period
    const records = await prisma.agentAuditLog.findMany({
      where: {
        agent: 'witness',
        timestamp: { gte: since },
      },
      orderBy: { timestamp: 'desc' },
      take: 500,
    });

    // Categorize records
    const cycleTraces: any[] = [];
    const anomalies: any[] = [];
    const interventions: any[] = [];
    const runLearnings: any[] = [];

    for (const record of records) {
      try {
        const meta = JSON.parse(record.metadata || '{}');
        switch (record.action) {
          case 'CYCLE_TRACE':
            cycleTraces.push({ id: record.id, timestamp: record.timestamp, ...meta });
            break;
          case 'ANOMALY':
            anomalies.push({ id: record.id, timestamp: record.timestamp, ...meta });
            break;
          case 'INTERVENTION':
            interventions.push({ id: record.id, timestamp: record.timestamp, ...meta });
            break;
          case 'RUN_LEARNING':
            runLearnings.push({ id: record.id, timestamp: record.timestamp, ...meta });
            break;
        }
      } catch {}
    }

    // ── Aggregate metrics ──

    // Anomaly type distribution
    const anomalyTypeCounts: Record<string, number> = {};
    const anomalySeverityCounts: Record<string, number> = {};
    for (const a of anomalies) {
      anomalyTypeCounts[a.type] = (anomalyTypeCounts[a.type] || 0) + 1;
      anomalySeverityCounts[a.severity] = (anomalySeverityCounts[a.severity] || 0) + 1;
    }

    // Intervention type distribution
    const interventionTypeCounts: Record<string, number> = {};
    let approvedCount = 0;
    let deniedCount = 0;
    for (const i of interventions) {
      interventionTypeCounts[i.type] = (interventionTypeCounts[i.type] || 0) + 1;
      if (i.approved) approvedCount++;
      else deniedCount++;
    }

    // Run learnings summary
    const learnings = runLearnings.map(l => ({
      runId: l.runId,
      query: l.query,
      qualityScore: l.qualityScore,
      recommendsChanges: l.recommendsChanges,
      promptMods: l.promptModifications?.length || 0,
      thresholdAdjustments: l.thresholdAdjustments?.length || 0,
      recurringAnomalies: l.recurringAnomalies || [],
      timestamp: l.timestamp,
    }));

    // Average quality score
    const avgQuality = learnings.length > 0
      ? Math.round(learnings.reduce((s, l) => s + (l.qualityScore || 0), 0) / learnings.length)
      : null;

    // Health trend (from cycle traces)
    const healthTrend = cycleTraces.slice(0, 50).reverse().map(t => ({
      step: t.pipelineStep,
      onTrack: t.onTrack,
      severity: t.severity,
      anomalies: t.anomalies,
      intervened: t.intervened,
    }));

    // Per-step anomaly counts
    const stepAnomalyCounts: Record<string, number> = {};
    for (const a of anomalies) {
      stepAnomalyCounts[a.pipelineStep] = (stepAnomalyCounts[a.pipelineStep] || 0) + 1;
    }

    // Recent items (for display)
    const recentAnomalies = anomalies.slice(0, 10).map(a => ({
      type: a.type,
      severity: a.severity,
      description: a.description,
      pipelineStep: a.pipelineStep,
      timestamp: a.timestamp,
    }));

    const recentInterventions = interventions.slice(0, 10).map(i => ({
      type: i.type,
      pipelineStep: i.pipelineStep,
      reason: i.reason,
      approved: i.approved,
      result: i.result,
      rejectionReason: i.rejectionReason,
      timestamp: i.timestamp,
    }));

    const recentLearnings = learnings.slice(0, 10);

    // Collect all prompt modifications and threshold adjustments
    const allPromptMods: any[] = [];
    const allThresholdAdjustments: any[] = [];
    for (const l of runLearnings) {
      if (l.promptModifications) allPromptMods.push(...l.promptModifications);
      if (l.thresholdAdjustments) allThresholdAdjustments.push(...l.thresholdAdjustments);
    }

    return NextResponse.json({
      summary: {
        totalCycleTraces: cycleTraces.length,
        totalAnomalies: anomalies.length,
        totalInterventions: interventions.length,
        approvedInterventions: approvedCount,
        deniedInterventions: deniedCount,
        totalRunLearnings: runLearnings.length,
        avgQualityScore: avgQuality,
        lookbackDays,
      },
      anomalyTypeCounts,
      anomalySeverityCounts,
      interventionTypeCounts,
      stepAnomalyCounts,
      healthTrend,
      recentAnomalies,
      recentInterventions,
      recentLearnings,
      promptModifications: allPromptMods.slice(0, 10),
      thresholdAdjustments: allThresholdAdjustments.slice(0, 10),
    });
  } catch (error: any) {
    console.error('[Witness Dashboard API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch Witness metrics' },
      { status: 500 },
    );
  }
}
