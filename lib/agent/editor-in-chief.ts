/**
 * NomosX EDITOR-IN-CHIEF — LLM Triage for Breaking Topics
 * 
 * The "DECIDE" step in the DETECT → DECIDE → DELEGATE architecture.
 * Takes raw RadarTopic[] from TopicRadar and decides:
 * 
 *   1. Is this NEW? (not already covered in recent publications)
 *   2. Is this URGENT? (time-sensitive, breaking)
 *   3. Do we have an ANGLE? (can our researchers add value?)
 *   4. What FORMAT? (brief vs strategic)
 *   5. WHO handles it? (which researcher, which providers)
 * 
 * Single LLM call with gpt-4o-mini — fast, cheap (~$0.001), decisive.
 */

import { callLLM } from '../llm/unified-llm';
import { prisma } from '../db';
import { classifyTopic, TopicClassification } from './topic-classifier';
import type { RadarTopic } from './topic-radar';

// ============================================================================
// TYPES
// ============================================================================

export interface EditorialDecision {
  /** The selected topic */
  topic: RadarTopic;
  /** What to do with it */
  action: 'publish_brief' | 'publish_strategic' | 'monitor' | 'skip';
  /** Why this decision */
  reasoning: string;
  /** Priority 0-100 */
  priority: number;
  /** Full topic classification (domain, researchers, providers) */
  classification: TopicClassification;
  /** Estimated pipeline cost */
  estimatedCostUsd: number;
}

export interface EditorialTriageResult {
  decisions: EditorialDecision[];
  skipped: number;
  costUsd: number;
  durationMs: number;
}

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

/**
 * Editor-in-Chief triage — takes radar topics, returns publication decisions.
 * Should complete in <15 seconds.
 * 
 * @param topics - Raw topics from TopicRadar
 * @param options - Budget and slot constraints
 */
export async function editorialTriage(
  topics: RadarTopic[],
  options?: {
    maxPublications?: number;
    budgetUsd?: number;
  }
): Promise<EditorialTriageResult> {
  const start = Date.now();
  const maxPubs = options?.maxPublications ?? 3;
  const budgetUsd = options?.budgetUsd ?? 20.0;

  if (topics.length === 0) {
    return { decisions: [], skipped: 0, costUsd: 0, durationMs: 0 };
  }

  console.log(`[EDITOR-IN-CHIEF] Triaging ${topics.length} topics (max ${maxPubs} publications, budget $${budgetUsd})...`);

  // Step 1: Get recent publications to avoid duplicates
  const recentTitles = await getRecentPublicationTitles();

  // Step 2: LLM triage — single call to select + prioritize
  const triageResult = await llmTriage(topics, recentTitles, maxPubs);

  // Step 3: For selected topics, run full classification to get researchers + providers
  const decisions: EditorialDecision[] = [];
  let totalCost = triageResult.costUsd;
  let remainingBudget = budgetUsd;

  for (const selected of triageResult.selected) {
    const topic = topics.find(t => t.id === selected.topicId);
    if (!topic) continue;

    // Full classification
    const classification = await classifyTopic(topic.title, topic.summary);
    totalCost += classification.costUsd;

    const estimatedCost = selected.action === 'publish_strategic' ? 10.0 : 2.0;

    if (estimatedCost > remainingBudget && selected.priority < 90) {
      continue; // Skip if over budget (unless critical)
    }

    decisions.push({
      topic,
      action: selected.action,
      reasoning: selected.reasoning,
      priority: selected.priority,
      classification,
      estimatedCostUsd: estimatedCost,
    });

    remainingBudget -= estimatedCost;
  }

  const durationMs = Date.now() - start;
  console.log(`[EDITOR-IN-CHIEF] ✅ ${decisions.length} publications selected, ${triageResult.selected.length - decisions.length} budget-cut, ${topics.length - triageResult.selected.length} skipped in ${durationMs}ms ($${totalCost.toFixed(4)})`);

  return {
    decisions,
    skipped: topics.length - decisions.length,
    costUsd: totalCost,
    durationMs,
  };
}

// ============================================================================
// LLM TRIAGE — Single call to select and prioritize topics
// ============================================================================

interface TriageSelection {
  topicId: string;
  action: 'publish_brief' | 'publish_strategic' | 'monitor' | 'skip';
  reasoning: string;
  priority: number;
}

async function llmTriage(
  topics: RadarTopic[],
  recentTitles: string[],
  maxPubs: number
): Promise<{ selected: TriageSelection[]; costUsd: number }> {
  const topicSummaries = topics.slice(0, 15).map((t, i) => ({
    index: i,
    id: t.id,
    title: t.title,
    source: t.source,
    type: t.sourceType,
    score: t.score,
    vertical: t.vertical || 'unknown',
    age: getAgeLabel(t.publishedAt),
  }));

  const recentContext = recentTitles.length > 0
    ? `\nALREADY PUBLISHED (last 48h):\n${recentTitles.map(t => `- ${t}`).join('\n')}`
    : '\nNo recent publications.';

  try {
    const result = await callLLM({
      messages: [
        {
          role: 'system',
          content: `You are the Editor-in-Chief of NomosX, an AI-powered think tank. Your job is to select the most valuable topics for publication RIGHT NOW.

SELECTION CRITERIA (in order of importance):
1. NOVELTY — Is this NEW? Skip anything already covered in recent publications.
2. URGENCY — Is this BREAKING? Time-sensitive events > evergreen analysis.
3. IMPACT — Will decision-makers care? Policy changes, crises, breakthroughs.
4. ANGLE — Can we add unique value with academic + news cross-referencing?
5. DIVERSITY — Don't over-cover one domain. Mix geopolitics, tech, climate, etc.

ACTIONS:
- "publish_brief" — Standard 5-page analysis (cost: $2, time: 3-5min)
- "publish_strategic" — Deep 15-page report (cost: $10, time: 8-12min). Only for major events with 3+ corroborating sources.
- "monitor" — Not urgent enough now, but worth watching.
- "skip" — Not relevant, duplicate, or low-value.

Select at most ${maxPubs} topics for publication. Be SELECTIVE — quality over quantity.

Return JSON: { "selections": [{ "topicId": "...", "action": "publish_brief|publish_strategic|monitor|skip", "reasoning": "one sentence", "priority": 0-100 }] }`
        },
        {
          role: 'user',
          content: `CANDIDATE TOPICS:\n${JSON.stringify(topicSummaries, null, 2)}${recentContext}\n\nSelect the best topics for publication.`
        }
      ],
      temperature: 0.15,
      maxTokens: 800,
      jsonMode: true,
      model: 'gpt-4o-mini',
    });

    const parsed = JSON.parse(result.content);
    const selections: TriageSelection[] = (parsed.selections || [])
      .filter((s: any) => s.action === 'publish_brief' || s.action === 'publish_strategic')
      .slice(0, maxPubs);

    return { selected: selections, costUsd: result.costUsd };
  } catch (err) {
    console.warn('[EDITOR-IN-CHIEF] LLM triage failed, falling back to score-based selection:', err);
    // Fallback: top N by score
    const fallback = topics.slice(0, maxPubs).map(t => ({
      topicId: t.id,
      action: 'publish_brief' as const,
      reasoning: 'Fallback: selected by score',
      priority: t.score,
    }));
    return { selected: fallback, costUsd: 0 };
  }
}

// ============================================================================
// HELPERS
// ============================================================================

async function getRecentPublicationTitles(): Promise<string[]> {
  try {
    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const pubs = await prisma.thinkTankPublication.findMany({
      where: { publishedAt: { gte: cutoff }, status: 'PUBLISHED' },
      select: { title: true },
      orderBy: { publishedAt: 'desc' },
      take: 20,
    });
    return pubs.map(p => p.title);
  } catch {
    return [];
  }
}

function getAgeLabel(date: Date): string {
  const hours = (Date.now() - date.getTime()) / (1000 * 60 * 60);
  if (hours < 1) return 'just now';
  if (hours < 6) return `${Math.round(hours)}h ago`;
  if (hours < 24) return `${Math.round(hours)}h ago`;
  if (hours < 48) return 'yesterday';
  return `${Math.round(hours / 24)}d ago`;
}
