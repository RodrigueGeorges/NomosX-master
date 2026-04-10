/**
 * NomosX CONTEXT PRIMER — Institutional Memory Injection
 * 
 * Before every analysis, this agent:
 * 1. Queries the Knowledge Graph for related concepts
 * 2. Retrieves prior briefs on the same/similar topics
 * 3. Identifies what has changed since last analysis
 * 4. Builds a structured context block for the ANALYST
 * 
 * This is what transforms NomosX from a stateless tool into a persistent think tank.
 * France Stratégie remembers what it published — so does NomosX.
 */

import { prisma } from '../db';
import { queryKnowledgeGraph, getLongitudinalInsights } from './knowledge-graph';
import { embedText, embedBatch, cosineSimilarity } from './semantic-engine';
import { trendAnalyzer } from './trend-analyzer';
import { fetchRealTimePulse, buildRealTimeContextBlock, type RealTimePulse } from './realtime-data-hub';

// ============================================================================
// TYPES
// ============================================================================

export interface PrimedContext {
  // Knowledge Graph context
  knownConcepts: ConceptSummary[];
  emergingTrends: string[];
  activeControversies: string[];

  // Prior coverage
  priorBriefs: PriorBriefSummary[];
  lastCoverageDate: Date | null;
  coverageGap: number; // days since last brief on this topic

  // Delta analysis
  whatChanged: string[];       // Key changes since last coverage
  newSince: string[];          // New concepts not in prior briefs
  revisitReasons: string[];    // Why this topic deserves fresh analysis

  // P1-F: Live trend breaks from Trend Analyzer
  trendBreaks: string[];       // Active trend breaks detected in last 6 months

  // Real-time economic & market data
  realTimePulse: RealTimePulse | null;

  // Injected prompt block (ready to paste into ANALYST system prompt)
  contextBlock: string;

  // Metadata
  costUsd: number;
  durationMs: number;
}

interface ConceptSummary {
  name: string;
  type: string;
  confidence: number;
  occurrenceCount: number;
  trend: string;
  lastSeen: Date;
}

interface PriorBriefSummary {
  id: string;
  question: string;
  createdAt: Date;
  trustScore: number | null;
  sourceCount: number;
}

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

/**
 * Prime the pipeline with institutional memory before analysis.
 * Called at the start of runFullPipeline / runStrategicPipeline.
 */
export async function primeContext(
  query: string,
  options: {
    maxConcepts?: number;
    maxPriorBriefs?: number;
    lookbackDays?: number;
  } = {}
): Promise<PrimedContext> {
  const start = Date.now();
  const { maxConcepts = 15, maxPriorBriefs = 5, lookbackDays = 180 } = options;

  console.log(`[CONTEXT PRIMER] Priming context for: "${query.slice(0, 80)}..."`);

  // ── STEP 1: Query Knowledge Graph + Longitudinal Insights + Trend Analyzer (parallel) ──
  let knownConcepts: ConceptSummary[] = [];
  let emergingTrends: string[] = [];
  let activeControversies: string[] = [];
  let trendBreaks: string[] = [];
  let kgCost = 0;

  try {
    // P1-F: Run KG query, longitudinal insights, trend analyzer, AND real-time data in parallel
    const [kgResult, insights, trendResult, realTimePulseResult] = await Promise.all([
      queryKnowledgeGraph(query, { limit: maxConcepts, minSimilarity: 0.5 }),
      getLongitudinalInsights({ minOccurrences: 2, limit: 10 }),
      trendAnalyzer({ lookbackMonths: 6, minSources: 5 }).catch(() => ({ trends: [] })),
      fetchRealTimePulse().catch(() => null),
    ]);

    knownConcepts = kgResult.concepts.map(c => ({
      name: c.name,
      type: c.type,
      confidence: c.confidence,
      occurrenceCount: c.occurrenceCount,
      trend: "stable",
      lastSeen: c.lastSeen,
    }));

    emergingTrends = insights
      .filter(i => i.trend === "emerging")
      .map(i => i.summary);

    activeControversies = insights
      .filter(i => i.trend === "contested")
      .map(i => i.summary);

    // P1-F: Extract trend breaks relevant to query
    trendBreaks = (trendResult.trends || [])
      .filter((t: any) => {
        const trendText = `${t.topic || ""} ${t.description || ""}`.toLowerCase();
        const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 4);
        return queryWords.some(w => trendText.includes(w));
      })
      .slice(0, 5)
      .map((t: any) => t.description || t.topic || String(t));

    // Update trends in known concepts
    for (const concept of knownConcepts) {
      const insight = insights.find(i => i.concept === concept.name);
      if (insight) concept.trend = insight.trend;
    }

    // Store real-time pulse for later
    if (realTimePulseResult) {
      console.log(`[CONTEXT PRIMER] Real-time data: ${realTimePulseResult.indicators.length} indicators, ${realTimePulseResult.alerts.length} alerts`);
    }

    console.log(`[CONTEXT PRIMER] KG: ${knownConcepts.length} concepts, ${emergingTrends.length} trends, ${activeControversies.length} controversies, ${trendBreaks.length} trend breaks`);
  } catch (err) {
    console.warn("[CONTEXT PRIMER] Knowledge Graph query failed (continuing without):", err);
  }

  // ── STEP 2: Retrieve prior briefs on similar topics ──
  let priorBriefs: PriorBriefSummary[] = [];
  let lastCoverageDate: Date | null = null;

  try {
    const cutoffDate = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);

    // Fetch briefs and embed query in parallel
    const [recentBriefs, queryEmbedding] = await Promise.all([
      prisma.brief.findMany({
        where: {
          createdAt: { gte: cutoffDate },
          kind: { in: ["brief", "strategic"] },
        },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          question: true,
          createdAt: true,
          trustScore: true,
          sources: true,
        },
      }),
      embedText(query),
    ]);

    if (recentBriefs.length > 0) {
      // Batch embed all brief questions in a single API call (N+1 fix)
      const briefQuestions = recentBriefs.map(b => b.question);
      const briefEmbeddings = await embedBatch(briefQuestions);

      const scored = recentBriefs.map((brief, i) => ({
        brief,
        similarity: cosineSimilarity(queryEmbedding, briefEmbeddings[i]),
      }));

      const relevant = scored
        .filter(s => s.similarity >= 0.55)
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, maxPriorBriefs);

      priorBriefs = relevant.map(s => ({
        id: s.brief.id,
        question: s.brief.question,
        createdAt: s.brief.createdAt,
        trustScore: s.brief.trustScore,
        sourceCount: s.brief.sources?.length || 0,
      }));

      if (priorBriefs.length > 0) {
        lastCoverageDate = priorBriefs[0].createdAt;
      }
    }

    console.log(`[CONTEXT PRIMER] Prior briefs: ${priorBriefs.length} related (from ${recentBriefs.length} scanned)`);
  } catch (err) {
    console.warn("[CONTEXT PRIMER] Prior brief retrieval failed (continuing without):", err);
  }

  // ── STEP 3: Delta analysis — what's new since last coverage ──
  const coverageGap = lastCoverageDate
    ? Math.round((Date.now() - lastCoverageDate.getTime()) / (1000 * 60 * 60 * 24))
    : -1; // -1 = never covered

  const newSince: string[] = [];
  const whatChanged: string[] = [];
  const revisitReasons: string[] = [];

  if (lastCoverageDate) {
    // Find concepts that appeared after last coverage
    const newConcepts = knownConcepts.filter(c =>
      c.lastSeen > lastCoverageDate! && c.occurrenceCount <= 2
    );
    newSince.push(...newConcepts.map(c => `New concept: "${c.name}" (${c.type}, confidence ${c.confidence}%)`));

    if (coverageGap > 30) {
      revisitReasons.push(`${coverageGap} days since last coverage — data may be stale`);
    }
    if (emergingTrends.length > 0) {
      revisitReasons.push(`${emergingTrends.length} emerging trend(s) detected in Knowledge Graph`);
    }
    if (activeControversies.length > 0) {
      revisitReasons.push(`${activeControversies.length} active controversy(ies) — positions may have shifted`);
    }
  } else {
    revisitReasons.push("First analysis on this topic — no prior institutional coverage");
  }

  // ── STEP 4: Fetch real-time pulse (if not already fetched in step 1) ──
  let realTimePulse: RealTimePulse | null = null;
  try {
    // @ts-ignore — realTimePulseResult may exist from step 1
    realTimePulse = typeof realTimePulseResult !== 'undefined' ? realTimePulseResult : await fetchRealTimePulse().catch(() => null);
  } catch { /* non-blocking */ }

  // ── STEP 5: Build context block for ANALYST injection ──
  let contextBlock = buildContextBlock({
    knownConcepts,
    emergingTrends,
    activeControversies,
    trendBreaks,
    priorBriefs,
    lastCoverageDate,
    coverageGap,
    newSince,
    whatChanged,
    revisitReasons,
  });

  // Append real-time data block if available
  if (realTimePulse && realTimePulse.indicators.length > 0) {
    const rtBlock = buildRealTimeContextBlock(realTimePulse);
    contextBlock = contextBlock + '\n\n' + rtBlock;
  }

  const durationMs = Date.now() - start;
  console.log(`[CONTEXT PRIMER] ✅ Context primed in ${durationMs}ms (${knownConcepts.length} concepts, ${priorBriefs.length} prior briefs, ${trendBreaks.length} trend breaks)`);

  return {
    knownConcepts,
    emergingTrends,
    activeControversies,
    trendBreaks,
    realTimePulse,
    priorBriefs,
    lastCoverageDate,
    coverageGap,
    whatChanged,
    newSince,
    revisitReasons,
    contextBlock,
    costUsd: kgCost,
    durationMs,
  };
}

// ============================================================================
// CONTEXT BLOCK BUILDER
// ============================================================================

function buildContextBlock(ctx: {
  knownConcepts: ConceptSummary[];
  emergingTrends: string[];
  activeControversies: string[];
  trendBreaks: string[];
  priorBriefs: PriorBriefSummary[];
  lastCoverageDate: Date | null;
  coverageGap: number;
  newSince: string[];
  whatChanged: string[];
  revisitReasons: string[];
}): string {
  const sections: string[] = [];

  // Header
  sections.push("=== INSTITUTIONAL MEMORY (Context Primer) ===");

  // Prior coverage
  if (ctx.priorBriefs.length > 0) {
    sections.push("\n## Prior Coverage");
    sections.push(`NomosX has previously analyzed this topic ${ctx.priorBriefs.length} time(s).`);
    sections.push(`Last coverage: ${ctx.lastCoverageDate?.toISOString().split("T")[0]} (${ctx.coverageGap} days ago)`);
    for (const brief of ctx.priorBriefs) {
      sections.push(`- "${brief.question}" (${brief.createdAt.toISOString().split("T")[0]}, trust: ${brief.trustScore ?? "N/A"}, ${brief.sourceCount} sources)`);
    }
    sections.push("IMPORTANT: Build on prior analysis. Do NOT repeat known findings. Focus on what is NEW or CHANGED.");
  } else {
    sections.push("\n## Prior Coverage: NONE");
    sections.push("This is the first NomosX analysis on this topic. Provide comprehensive foundational coverage.");
  }

  // Known concepts
  if (ctx.knownConcepts.length > 0) {
    sections.push("\n## Known Concepts from Knowledge Graph");
    const highConfidence = ctx.knownConcepts.filter(c => c.confidence >= 70);
    const lowConfidence = ctx.knownConcepts.filter(c => c.confidence < 70);

    if (highConfidence.length > 0) {
      sections.push("Established (high confidence):");
      for (const c of highConfidence.slice(0, 8)) {
        sections.push(`- ${c.name} (${c.type}, ${c.confidence}%, seen ${c.occurrenceCount}x, trend: ${c.trend})`);
      }
    }
    if (lowConfidence.length > 0) {
      sections.push("Uncertain (needs verification):");
      for (const c of lowConfidence.slice(0, 5)) {
        sections.push(`- ${c.name} (${c.type}, ${c.confidence}%, seen ${c.occurrenceCount}x)`);
      }
    }
  }

  // Emerging trends
  if (ctx.emergingTrends.length > 0) {
    sections.push("\n## Emerging Trends (pay special attention)");
    for (const trend of ctx.emergingTrends) {
      sections.push(`- ${trend}`);
    }
  }

  // Active controversies
  if (ctx.activeControversies.length > 0) {
    sections.push("\n## Active Controversies (address explicitly)");
    for (const controversy of ctx.activeControversies) {
      sections.push(`- ${controversy}`);
    }
  }

  // P1-F: Live trend breaks
  if (ctx.trendBreaks.length > 0) {
    sections.push("\n## ⚡ Live Trend Breaks (detected in last 6 months — high priority)");
    sections.push("These are statistically significant shifts in the evidence base. Address them explicitly.");
    for (const trend of ctx.trendBreaks) {
      sections.push(`- ${trend}`);
    }
  }

  // New since last coverage
  if (ctx.newSince.length > 0) {
    sections.push("\n## New Since Last Coverage");
    for (const item of ctx.newSince) {
      sections.push(`- ${item}`);
    }
  }

  // Revisit reasons
  if (ctx.revisitReasons.length > 0) {
    sections.push("\n## Why This Analysis Matters Now");
    for (const reason of ctx.revisitReasons) {
      sections.push(`- ${reason}`);
    }
  }

  sections.push("\n=== END INSTITUTIONAL MEMORY ===");

  return sections.join("\n");
}
