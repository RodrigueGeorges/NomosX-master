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
  
  // Store significant trends as signals
  for (const trend of trends.filter(t => t.confidence >= 70)) {
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
  
  // Find emerging topics (appear much more in second half)
  for (const [topic, countSecond] of topicsSecond) {
    const countFirst = topicsFirst.get(topic) || 0;
    
    if (countSecond >= 3 && countFirst <= 1) {
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

function countTopics(sources: any[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const source of sources) {
    for (const topic of source.topics || []) {
      counts.set(topic, (counts.get(topic) || 0) + 1);
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
        content: `Analyze if there's a consensus shift or methodology change between these two research periods.

EARLIER PERIOD (${firstHalf.length} sources):
${summaryFirst}

RECENT PERIOD (${secondHalf.length} sources):
${summarySecond}

Return JSON:
{
  "hasShift": boolean,
  "shiftType": "consensus_shift" | "methodology_change" | null,
  "confidence": 0-100,
  "description": "what changed and why it matters",
  "beforeConsensus": "brief summary of earlier view",
  "afterConsensus": "brief summary of current view"
}

Only report REAL shifts with confidence ≥ 60.`
      }],
      temperature: 0.2,
      jsonMode: true,
      maxTokens: 500,
      enableCache: true
    });
    
    const result = JSON.parse(response.content);
    
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
