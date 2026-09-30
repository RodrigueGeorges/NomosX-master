/**
 * NomosX Trend Analyzer Agent
 * 
 * Detects trend breaks and shifts in research patterns over time.
 * Analyzes temporal evolution of topics, citations, and findings.
 * 
 * Key capabilities:
 * - Detect sudden changes in publication volume
 * - Identify shifts in consensus or methodology
 * - Spot emerging topics gaining traction
 * - Flag declining research areas
 */

import { prisma } from '@/lib/db';
import { callLLM } from '@/lib/llm/unified-llm';
import { parseJson } from './json-utils';
import { AgentRole,assertPermission } from '@/lib/governance/index';

// ============================================================================
// TYPES
// ============================================================================

export interface TrendBreak {
  topic: string;
  breakType: "volume_spike" | "volume_drop" | "consensus_shift" | "methodology_change" | "emerging_topic";
  confidence: number; // 0-100
  description: string;
  beforePeriod: { start: Date; end: Date; count: number };
  afterPeriod: { start: Date; end: Date; count: number };
  changePercent: number;
  sourceIds: string[];
}

export interface TrendAnalysisOutput {
  analyzed: number;
  periodsCompared: number;
  trendsDetected: number;
  trends: TrendBreak[];
}

// ============================================================================
// MAIN ANALYZER
// ============================================================================

export async function trendAnalyzer(
  options?: {
    topic?: string;
    verticalSlug?: string;
    lookbackMonths?: number;
    minSources?: number;
    /** When set, trend signals must lexically overlap one of these terms to be
     *  stored — prevents unrelated provider tags ("Mice", "Uganda") from
     *  polluting the knowledge graph during query-scoped runs. */
    queryTerms?: string[];
  }
): Promise<TrendAnalysisOutput> {
  assertPermission(AgentRole.READER, "write:claims");
  
  const lookbackMonths = options?.lookbackMonths ?? 12;
  const minSources = options?.minSources ?? 5;
  
  console.log(`[TREND_ANALYZER] Analyzing trends over ${lookbackMonths} months...`);
  
  const now = new Date();
  const lookbackDate = new Date();
  lookbackDate.setMonth(lookbackDate.getMonth() - lookbackMonths);
  
  // Fetch sources in the lookback period
  const whereClause: any = {
    createdAt: { gte: lookbackDate },
    qualityScore: { gte: 60 }
  };
  
  if (options?.topic) {
    whereClause.OR = [
      { title: { contains: options.topic, mode: "insensitive" } },
      { abstract: { contains: options.topic, mode: "insensitive" } },
      { topics: { has: options.topic } }
    ];
  }
  
  const sources = await prisma.source.findMany({
    where: whereClause,
    select: {
      id: true,
      title: true,
      abstract: true,
      year: true,
      topics: true,
      createdAt: true,
      qualityScore: true,
      citationCount: true,
      provider: true
    },
    orderBy: { createdAt: "asc" }
  });
  
  if (sources.length < minSources) {
    console.log(`[TREND_ANALYZER] Insufficient sources (${sources.length} < ${minSources})`);
    return { analyzed: sources.length, periodsCompared: 0, trendsDetected: 0, trends: [] };
  }
  
  console.log(`[TREND_ANALYZER] Analyzing ${sources.length} sources`);
  
  const trends: TrendBreak[] = [];
  
  // 1. Volume trend analysis (monthly)
  const volumeTrends = analyzeVolumeTrends(sources, lookbackMonths);
  trends.push(...volumeTrends);
  
  // 2. Topic emergence analysis
  const topicTrends = await analyzeTopicEmergence(sources);
  trends.push(...topicTrends);
  
  // 3. LLM-based consensus shift detection (if enough sources)
  if (sources.length >= 10) {
    const consensusTrends = await analyzeConsensusShifts(sources);
    trends.push(...consensusTrends);
  }
  
  console.log(`[TREND_ANALYZER] Detected ${trends.length} trend breaks`);
  
  // Query-relevance gate for signal storage: a trend only enters the KG if its
  // topic shares a significant word with the query (or no query was given).
  const qTerms = (options?.queryTerms || [])
    .map(t => t.toLowerCase().replace(/[^a-zà-ÿ0-9 -]/g, ''))
    .filter(t => t.length > 3);
  const isQueryRelevant = (trend: TrendBreak) => {
    if (qTerms.length === 0) return true;
    const hay = `${trend.topic} ${trend.description}`.toLowerCase();
    return qTerms.some(qt => hay.includes(qt));
  };
  const storable = trends.filter(isQueryRelevant);
  if (qTerms.length > 0 && storable.length < trends.length) {
    console.log(`[TREND_ANALYZER] ${trends.length - storable.length} trends dropped (no query relevance)`);
  }

  // Store significant trends as signals — cap at top 10 to avoid signal spam
  for (const trend of storable
    .filter(t => t.confidence >= 70)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 10)) {
    await createTrendSignal(trend, options?.verticalSlug);
  }
  
  return {
    analyzed: sources.length,
    periodsCompared: lookbackMonths,
    trendsDetected: trends.length,
    trends
  };
}

// ============================================================================
// VOLUME ANALYSIS
// ============================================================================

function analyzeVolumeTrends(sources: any[], months: number): TrendBreak[] {
  const trends: TrendBreak[] = [];
  
  // Group by month
  const byMonth = new Map<string, any[]>();
  for (const source of sources) {
    const date = new Date(source.createdAt);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    if (!byMonth.has(key)) byMonth.set(key, []);
    byMonth.get(key)!.push(source);
  }
  
  const monthKeys = Array.from(byMonth.keys()).sort();
  if (monthKeys.length < 3) return trends;
  
  // Compare consecutive periods
  for (let i = 2; i < monthKeys.length; i++) {
    const prevMonth = monthKeys[i - 1];
    const currMonth = monthKeys[i];
    const prevCount = byMonth.get(prevMonth)?.length || 0;
    const currCount = byMonth.get(currMonth)?.length || 0;
    
    if (prevCount === 0) continue;
    
    const changePercent = ((currCount - prevCount) / prevCount) * 100;
    
    // Detect significant changes (>50% increase or >40% decrease)
    if (changePercent > 50) {
      trends.push({
        topic: "Publication Volume",
        breakType: "volume_spike",
        confidence: Math.min(90, 60 + Math.abs(changePercent) / 5),
        description: `Publication volume increased ${Math.round(changePercent)}% from ${prevMonth} to ${currMonth}`,
        beforePeriod: { start: parseMonthKey(prevMonth), end: parseMonthKey(prevMonth, true), count: prevCount },
        afterPeriod: { start: parseMonthKey(currMonth), end: parseMonthKey(currMonth, true), count: currCount },
        changePercent,
        sourceIds: byMonth.get(currMonth)?.map(s => s.id) || []
      });
    } else if (changePercent < -40) {
      trends.push({
        topic: "Publication Volume",
        breakType: "volume_drop",
        confidence: Math.min(85, 55 + Math.abs(changePercent) / 5),
        description: `Publication volume decreased ${Math.round(Math.abs(changePercent))}% from ${prevMonth} to ${currMonth}`,
        beforePeriod: { start: parseMonthKey(prevMonth), end: parseMonthKey(prevMonth, true), count: prevCount },
        afterPeriod: { start: parseMonthKey(currMonth), end: parseMonthKey(currMonth, true), count: currCount },
        changePercent,
        sourceIds: byMonth.get(currMonth)?.map(s => s.id) || []
      });
    }
  }
  
  return trends;
}

function parseMonthKey(key: string, endOfMonth = false): Date {
  const [year, month] = key.split("-").map(Number);
  if (endOfMonth) {
    return new Date(year, month, 0); // Last day of month
  }
  return new Date(year, month - 1, 1);
}

// ============================================================================
// TOPIC EMERGENCE
// ============================================================================

async function analyzeTopicEmergence(sources: any[]): Promise<TrendBreak[]> {
  const trends: TrendBreak[] = [];
  
  // Count topic occurrences by half-period
  const midpoint = new Date(sources[Math.floor(sources.length / 2)].createdAt);
  const firstHalf = sources.filter(s => new Date(s.createdAt) < midpoint);
  const secondHalf = sources.filter(s => new Date(s.createdAt) >= midpoint);
  
  const topicsFirst = countTopics(firstHalf);
  const topicsSecond = countTopics(secondHalf);
  
  // Find emerging topics (appear much more in second half).
  // Require >= 5 sources: with large corpora, countSecond=3 lets random
  // provider tags ("Mice", "rice production") become "trend breaks".
  const sorted = [...topicsSecond.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);
  for (const [topic, countSecond] of sorted) {
    const countFirst = topicsFirst.get(topic) || 0;

    if (countSecond >= 5 && countFirst <= 1) {
      // New topic emergence
      trends.push({
        topic,
        breakType: "emerging_topic",
        confidence: Math.min(85, 60 + countSecond * 5),
        description: `Topic "${topic}" emerged with ${countSecond} sources in recent period (vs ${countFirst} before)`,
        beforePeriod: { 
          start: new Date(firstHalf[0]?.createdAt || Date.now()), 
          end: midpoint, 
          count: countFirst 
        },
        afterPeriod: { 
          start: midpoint, 
          end: new Date(secondHalf[secondHalf.length - 1]?.createdAt || Date.now()), 
          count: countSecond 
        },
        changePercent: countFirst === 0 ? 100 : ((countSecond - countFirst) / countFirst) * 100,
        sourceIds: secondHalf.filter(s => s.topics?.includes(topic)).map(s => s.id)
      });
    }
  }
  
  return trends;
}

/** Provider classification codes and junk tags that must never become trends. */
const JUNK_TOPIC = /^(\d+\.[\d.]|[a-z]{2,5}\.[A-Z]{2}|primary-source$)/i;

function countTopics(sources: any[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const source of sources) {
    for (const topic of source.topics || []) {
      const t = String(topic).trim();
      // Skip arXiv/HAL classification codes ("1.info.info-cy", "eess.AS",
      // "2.sdv.bbm.gtp"), empty tags, and over-long raw strings.
      if (t.length < 4 || t.length > 60 || JUNK_TOPIC.test(t)) continue;
      counts.set(t, (counts.get(t) || 0) + 1);
    }
  }
  return counts;
}

// ============================================================================
// CONSENSUS SHIFT (LLM-based)
// ============================================================================

async function analyzeConsensusShifts(sources: any[]): Promise<TrendBreak[]> {
  const trends: TrendBreak[] = [];
  
  // Split into two periods
  const midpoint = Math.floor(sources.length / 2);
  const firstHalf = sources.slice(0, midpoint);
  const secondHalf = sources.slice(midpoint);
  
  // Build summaries for each period
  const summaryFirst = firstHalf
    .slice(0, 5)
    .map(s => `- ${s.title}: ${(s.abstract || "").slice(0, 200)}`)
    .join("\n");
  
  const summarySecond = secondHalf
    .slice(-5)
    .map(s => `- ${s.title}: ${(s.abstract || "").slice(0, 200)}`)
    .join("\n");
  
  try {
    const response = await callLLM({
      messages: [{
        role: "user",
        content: `You are NomosX — a revolutionary trend analyst who does not merely track mainstream trends but identifies counter-trends, weak signals, and paradigm shifts that conventional analysis misses.

Analyze if there's a consensus shift, methodology change, OR counter-trend emergence between these two research periods.

EARLIER PERIOD (${firstHalf.length} sources):
${summaryFirst}

RECENT PERIOD (${secondHalf.length} sources):
${summarySecond}

Look for:
1. CONSENSUS SHIFT — Has the mainstream view changed?
2. METHODOLOGY CHANGE — Have research methods shifted?
3. COUNTER-TREND — Is there a minority viewpoint gaining traction that challenges the dominant narrative?
4. WEAK SIGNAL — Is there a small but potentially significant pattern that could grow into a major trend?
5. PARADIGM SHIFT — Is there evidence of a fundamental change in how the field conceptualizes the problem?

Return JSON:
{
  "hasShift": boolean,
  "shiftType": "consensus_shift" | "methodology_change" | "counter_trend" | "weak_signal" | "paradigm_shift" | null,
  "confidence": 0-100,
  "description": "what changed and why it matters",
  "beforeConsensus": "brief summary of earlier view",
  "afterConsensus": "brief summary of current view",
  "counterTrend": "description of any counter-trend or minority viewpoint gaining traction, or null",
  "weakSignal": "description of any weak signal that could grow into a major trend, or null",
  "crossDomainPotential": "could this trend affect other domains? if so, which ones?"
}

Only report REAL shifts with confidence ≥ 60. But DO look for counter-trends and weak signals — a revolutionary think tank's value comes from identifying what others miss.`
      }],
      temperature: 0.2,
      jsonMode: true,
      maxTokens: 800,
      enableCache: true,
      task: 'meta_analysis',
    });
    
    const result = parseJson<any>(response.content);
    if (!result) return [];
    
    if (result.hasShift && result.confidence >= 60) {
      trends.push({
        topic: "Research Consensus",
        breakType: result.shiftType || "consensus_shift",
        confidence: result.confidence,
        description: result.description,
        beforePeriod: {
          start: new Date(firstHalf[0]?.createdAt || Date.now()),
          end: new Date(firstHalf[firstHalf.length - 1]?.createdAt || Date.now()),
          count: firstHalf.length
        },
        afterPeriod: {
          start: new Date(secondHalf[0]?.createdAt || Date.now()),
          end: new Date(secondHalf[secondHalf.length - 1]?.createdAt || Date.now()),
          count: secondHalf.length
        },
        changePercent: 0,
        sourceIds: secondHalf.slice(-5).map(s => s.id)
      });
    }
  } catch (error) {
    console.warn(`[TREND_ANALYZER] Consensus analysis failed:`, error);
  }
  
  return trends;
}

// ============================================================================
// SIGNAL CREATION
// ============================================================================

async function createTrendSignal(trend: TrendBreak, verticalSlug?: string): Promise<void> {
  // Find vertical ID
  let verticalId: string | null = null;
  if (verticalSlug) {
    const vertical = await prisma.vertical.findFirst({ where: { slug: verticalSlug } });
    verticalId = vertical?.id || null;
  }
  
  if (!verticalId) {
    // Use default vertical
    const defaultVertical = await prisma.vertical.findFirst({ where: { isActive: true } });
    verticalId = defaultVertical?.id || null;
  }
  
  if (!verticalId) {
    console.warn(`[TREND_ANALYZER] No vertical found, skipping signal creation`);
    return;
  }

  // Dedup: the same break condition persists across cycles — without this a
  // held/failed signal is re-created every cycle and re-dispatched forever
  // (observed live: "Trend Break: Publication Volume" firing every ~15min).
  const dedupWindow = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const existing = await prisma.signal.findFirst({
    where: {
      signalType: "TREND_BREAK",
      title: `Trend Break: ${trend.topic}`,
      createdAt: { gte: dedupWindow },
    },
    select: { id: true, status: true },
  }).catch(() => null);
  if (existing) {
    console.log(`[TREND_ANALYZER] TREND_BREAK "${trend.topic}" already signaled (${existing.status}) — skipping duplicate`);
    return;
  }

  await prisma.signal.create({
    data: {
      verticalId,
      signalType: "TREND_BREAK",
      title: `Trend Break: ${trend.topic}`,
      summary: trend.description,
      noveltyScore: Math.round(trend.confidence * 0.9),
      impactScore: Math.round(trend.confidence * 0.85),
      confidenceScore: trend.confidence,
      urgencyScore: trend.breakType === "volume_spike" ? 80 : 60,
      priorityScore: Math.round(trend.confidence * 0.9),
      sourceIds: trend.sourceIds,
      status: "NEW",
      expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
    }
  });
  
  console.log(`[TREND_ANALYZER] Created TREND_BREAK signal: ${trend.topic}`);
}

// ============================================================================
// SCHEDULED ANALYSIS
// ============================================================================

export async function runWeeklyTrendAnalysis(): Promise<TrendAnalysisOutput> {
  console.log(`[TREND_ANALYZER] Running weekly trend analysis...`);
  return trendAnalyzer({ lookbackMonths: 6, minSources: 10 });
}
