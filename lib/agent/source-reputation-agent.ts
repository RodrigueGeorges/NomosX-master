/**
 * NomosX SOURCE REPUTATION AGENT — Persistent Source Quality Learning
 *
 * P3-M: Sources that consistently contribute to high-quality analyses
 * should have their qualityScore boosted over time. Sources that are
 * consistently ignored or associated with low-trust outputs should decay.
 *
 * This creates a self-improving source library where the best sources
 * rise to the top automatically.
 *
 * Process:
 * 1. After each pipeline run, record which sources were used + final trust score
 * 2. Periodically recompute source reputation from usage history
 * 3. Update source.qualityScore with reputation-adjusted value
 * 4. Expose getTopReputationSources() for RANK agent to prefer
 */

import { prisma } from '../db';

// ============================================================================
// TYPES
// ============================================================================

export interface SourceReputation {
  sourceId: string;
  title: string;
  provider: string;
  currentQualityScore: number;
  reputationScore: number;      // Computed from usage history
  usageCount: number;           // Times used in analyses
  avgTrustContribution: number; // Avg trust score of analyses it appeared in
  citationRate: number;         // % of times it was actually cited in output
  lastUsed: Date | null;
  trend: "rising" | "stable" | "declining";
}

export interface ReputationUpdateResult {
  updated: number;
  boosted: number;   // Sources whose score increased
  decayed: number;   // Sources whose score decreased
  unchanged: number;
}

// ============================================================================
// RECORD SOURCE USAGE (call after each pipeline run)
// ============================================================================

/**
 * Record which sources were used in a pipeline run and the resulting trust score.
 * Call this at the end of runFullPipeline / runStrategicPipeline.
 */
export async function recordSourceUsage(
  sourceIds: string[],
  trustScore: number,
  citedSourceIds: string[] = []  // Sources actually cited in the output [SRC-N]
): Promise<void> {
  if (sourceIds.length === 0) return;

  try {
    // Batch upsert usage records into SystemMetric
    const now = new Date();
    const records = sourceIds.map(sourceId => ({
      metricName: `source_reputation:${sourceId}`,
      metricValue: trustScore,
      dimensions: {
        cited: citedSourceIds.includes(sourceId),
        timestamp: now.toISOString(),
      },
      periodStart: now,
      periodEnd: now,
    }));

    // Insert in batches of 50
    for (let i = 0; i < records.length; i += 50) {
      await prisma.systemMetric.createMany({
        data: records.slice(i, i + 50),
        skipDuplicates: false,
      });
    }
  } catch (err) {
    console.warn(`[SOURCE REPUTATION] Failed to record usage:`, err);
  }
}

// ============================================================================
// COMPUTE & UPDATE REPUTATION SCORES
// ============================================================================

/**
 * Recompute reputation scores for all sources based on usage history.
 * Run this as a periodic job (e.g., daily cron).
 */
export async function updateSourceReputations(
  options: {
    lookbackDays?: number;
    minUsages?: number;
    maxSourcesToUpdate?: number;
  } = {}
): Promise<ReputationUpdateResult> {
  const { lookbackDays = 90, minUsages = 2, maxSourcesToUpdate = 500 } = options;

  console.log(`[SOURCE REPUTATION] Recomputing reputation scores (lookback: ${lookbackDays}d)...`);

  const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);

  // Load usage metrics
  const metrics = await prisma.systemMetric.findMany({
    where: {
      metricName: { startsWith: "source_reputation:" },
      timestamp: { gte: since },
    },
    select: { metricName: true, metricValue: true, dimensions: true, timestamp: true },
    orderBy: { timestamp: "desc" },
    take: 10000,
  });

  // Group by sourceId
  const bySource = new Map<string, Array<{ trustScore: number; cited: boolean; timestamp: string }>>();
  for (const metric of metrics) {
    const sourceId = metric.metricName.replace("source_reputation:", "");
    if (!bySource.has(sourceId)) bySource.set(sourceId, []);
    bySource.get(sourceId)!.push({
      trustScore: metric.metricValue,
      cited: (metric.dimensions as any)?.cited ?? false,
      timestamp: (metric.dimensions as any)?.timestamp ?? metric.timestamp.toISOString(),
    });
  }

  let updated = 0, boosted = 0, decayed = 0, unchanged = 0;

  for (const [sourceId, usages] of bySource) {
    if (usages.length < minUsages) continue;
    if (updated >= maxSourcesToUpdate) break;

    try {
      const source = await prisma.source.findUnique({
        where: { id: sourceId },
        select: { id: true, qualityScore: true },
      });
      if (!source) continue;
      const qualityScore = source.qualityScore ?? 50;

      // Compute reputation metrics
      const avgTrust = usages.reduce((s, u) => s + (u.trustScore || 0), 0) / usages.length;
      const citationRate = usages.filter(u => u.cited).length / usages.length;
      const usageCount = usages.length;

      // Reputation formula:
      // - Base: current quality score (50% weight)
      // - Trust contribution: avg trust of analyses it appeared in (30% weight)
      // - Citation rate: was it actually cited? (20% weight)
      const reputationScore = Math.round(
        qualityScore * 0.5 +
        avgTrust * 0.3 +
        citationRate * 100 * 0.2
      );

      // Clamp to 0-100
      const newScore = Math.max(0, Math.min(100, reputationScore));
      const delta = newScore - qualityScore;

      if (Math.abs(delta) >= 2) {
        await prisma.source.update({
          where: { id: sourceId },
          data: { qualityScore: newScore },
        });

        if (delta > 0) boosted++;
        else decayed++;
        updated++;
      } else {
        unchanged++;
      }
    } catch (err) {
      console.warn(`[SOURCE REPUTATION] Failed to update source ${sourceId}:`, err);
    }
  }

  console.log(`[SOURCE REPUTATION] ✅ Updated ${updated} sources: ${boosted} boosted, ${decayed} decayed, ${unchanged} unchanged`);

  return { updated, boosted, decayed, unchanged };
}

// ============================================================================
// GET TOP REPUTATION SOURCES (for RANK agent)
// ============================================================================

/**
 * Get sources with the highest reputation scores for a given provider set.
 * Used by the RANK agent to prefer historically reliable sources.
 */
export async function getTopReputationSources(
  providers: string[],
  limit: number = 20
): Promise<Array<{ id: string; title: string; provider: string; qualityScore: number }>> {
  try {
    const rows = await prisma.source.findMany({
      where: {
        provider: { in: providers },
        qualityScore: { gte: 70 },
      },
      select: { id: true, title: true, provider: true, qualityScore: true },
      orderBy: { qualityScore: "desc" },
      take: limit,
    });
    return rows.map(r => ({ ...r, qualityScore: r.qualityScore ?? 70 }));
  } catch {
    return [];
  }
}

// ============================================================================
// REPUTATION REPORT
// ============================================================================

/**
 * Get a reputation report for a set of sources.
 * Useful for debugging and monitoring.
 */
export async function getSourceReputationReport(
  sourceIds: string[]
): Promise<SourceReputation[]> {
  const report: SourceReputation[] = [];
  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

  for (const sourceId of sourceIds.slice(0, 50)) {
    try {
      const [source, metrics] = await Promise.all([
        prisma.source.findUnique({
          where: { id: sourceId },
          select: { id: true, title: true, provider: true, qualityScore: true },
        }),
        prisma.systemMetric.findMany({
          where: {
            metricName: `source_reputation:${sourceId}`,
            timestamp: { gte: since },
          },
          select: { metricValue: true, dimensions: true, timestamp: true },
          orderBy: { timestamp: "desc" },
          take: 100,
        }),
      ]);

      if (!source) continue;
      const qualityScore = source.qualityScore ?? 50;

      const usages = metrics.map(m => ({
        trustScore: m.metricValue,
        cited: (m.dimensions as any)?.cited ?? false,
      }));
      const usageCount = usages.length;
      const avgTrust = usageCount > 0
        ? usages.reduce((s: number, u: any) => s + (u.trustScore || 0), 0) / usageCount
        : 0;
      const citationRate = usageCount > 0
        ? usages.filter((u: any) => u.cited).length / usageCount
        : 0;
      const lastUsed = metrics[0]?.timestamp || null;

      // Trend: compare first half vs second half of usage history
      const half = Math.floor(usages.length / 2);
      const recentAvg = half > 0
        ? usages.slice(0, half).reduce((s: number, u: any) => s + (u.trustScore || 0), 0) / half
        : avgTrust;
      const olderAvg = half > 0
        ? usages.slice(half).reduce((s: number, u: any) => s + (u.trustScore || 0), 0) / half
        : avgTrust;
      const trend: SourceReputation["trend"] =
        recentAvg > olderAvg + 5 ? "rising" :
        recentAvg < olderAvg - 5 ? "declining" : "stable";

      const reputationScore = Math.round(
        qualityScore * 0.5 +
        avgTrust * 0.3 +
        citationRate * 100 * 0.2
      );

      report.push({
        sourceId,
        title: source.title,
        provider: source.provider,
        currentQualityScore: qualityScore,
        reputationScore: Math.max(0, Math.min(100, reputationScore)),
        usageCount,
        avgTrustContribution: Math.round(avgTrust),
        citationRate: Math.round(citationRate * 100) / 100,
        lastUsed,
        trend,
      });
    } catch { /* skip this source */ }
  }

  return report.sort((a, b) => b.reputationScore - a.reputationScore);
}
