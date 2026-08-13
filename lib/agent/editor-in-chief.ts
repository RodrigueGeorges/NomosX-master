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
import { parseJson } from './json-utils';
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
  /** Analytical research question reformulated from the raw headline (think-tank framing) */
  researchQuestion?: string;
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

  // Step 2b: DETERMINISTIC DOMAIN DIVERSITY — ensure multi-domain coverage
  // The LLM may over-cluster on one domain. This filter guarantees variety.
  const seenVerticals = new Set<string>();
  const diverseSelected: TriageSelection[] = [];
  const droppedForDiversity: TriageSelection[] = [];

  for (const selected of triageResult.selected) {
    const topic = topics.find(t => t.id === selected.topicId);
    if (!topic) continue;
    const vertical = topic.vertical || 'unknown';

    if (maxPubs > 1 && seenVerticals.has(vertical)) {
      // Already have a topic from this vertical — skip for diversity
      droppedForDiversity.push(selected);
      continue;
    }
    seenVerticals.add(vertical);
    diverseSelected.push(selected);
  }

  // If diversity filter left slots empty, backfill from dropped items (best score first)
  if (diverseSelected.length < maxPubs && droppedForDiversity.length > 0) {
    droppedForDiversity.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
    for (const dropped of droppedForDiversity) {
      if (diverseSelected.length >= maxPubs) break;
      diverseSelected.push(dropped);
    }
  }

  if (droppedForDiversity.length > 0) {
    console.log(`[EDITOR-IN-CHIEF] Domain diversity filter: ${droppedForDiversity.length} topics dropped (same vertical), ${diverseSelected.length} kept across ${seenVerticals.size} verticals`);
  }

  // Step 3: For selected topics, run full classification to get researchers + providers
  const decisions: EditorialDecision[] = [];
  let totalCost = triageResult.costUsd;
  let remainingBudget = budgetUsd;

  for (const selected of diverseSelected) {
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
      researchQuestion: selected.researchQuestion,
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
  researchQuestion?: string;
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
    signalStrength: t.signalStrength || 'emerging',
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
6. ACADEMIC TRACTABILITY — Can this topic be answered with existing academic literature? Avoid ultra-niche topics that have no research base. If the topic is too new or too specific for academic databases, skip it or reformulate to a broader question that HAS literature.

SIGNAL STRENGTH GUIDE:
- "breaking" (score ≥ 70): Strong multi-channel signal — prioritize these.
- "emerging" (score 45-69): Early signal worth investigating — select if the topic has strategic value, even if it's not yet mainstream news. Emerging topics often yield the most original analysis.
- "routine" (score < 45): Weak signal — only select if no better options exist and the topic has clear strategic relevance.

ACADEMIC TRACTABILITY CHECK (critical — prevents wasted pipeline runs):
Before selecting a topic, ask yourself: "Is there likely to be academic literature on this?" If the topic is about a very recent event with no academic coverage yet, reformulate the question to the underlying RESEARCHABLE issue. Examples:
- BAD: "What is the impact of the August 2026 Gaza digital currency pilot?" → too specific, no academic literature
- GOOD: "How do digital financial systems affect economic resilience in conflict-affected territories?"
- BAD: "What is the impact of [specific company]'s new AI product?" → no academic literature
- GOOD: "How does AI adoption affect productivity in [industry sector]?"
If you cannot reformulate to a question with likely academic literature, SKIP the topic.

ACTIONS:
- "publish_brief" — Standard 5-page analysis (cost: $2, time: 3-5min)
- "publish_strategic" — Deep 15-page report (cost: $10, time: 8-12min). Only for major events with 3+ corroborating sources.
- "monitor" — Not urgent enough now, but worth watching.
- "skip" — Not relevant, duplicate, or low-value.

Select at most ${maxPubs} topics for publication. Be SELECTIVE but not OVERLY CONSERVATIVE — a think tank's value comes from covering emerging topics before they become mainstream.

CRITICAL — RESEARCH QUESTION REFORMULATION:
For each selected topic, reformulate the raw headline into an ANALYTICAL RESEARCH QUESTION, the way Brookings, RAND or Chatham House would frame it. The pipeline searches academic databases with this question — a news headline yields poor academic matches.
Rules:
- Generalize the anecdote to the underlying policy/strategic issue (e.g. "Gaza: Dialysis patients face grueling hospital journey by donkey cart" → "How does armed conflict degrade access to chronic care, and what policy mechanisms protect patients with life-critical needs in besieged territories?")
- Keep the geographic/temporal anchor when relevant
- Make it answerable with academic literature + primary data
- Use standard academic terminology that databases index well (avoid news jargon)
- One sentence, interrogative form

Return JSON: { "selections": [{ "topicId": "...", "action": "publish_brief|publish_strategic|monitor|skip", "reasoning": "one sentence", "priority": 0-100, "researchQuestion": "analytical question reformulated from the headline" }] }`
        },
        {
          role: 'user',
          content: `CANDIDATE TOPICS:\n${JSON.stringify(topicSummaries, null, 2)}${recentContext}\n\nSelect the best topics for publication.`
        }
      ],
      temperature: 0.15,
      maxTokens: 1500,
      jsonMode: true,
      enableCache: true,
      task: 'editor_in_chief',
    });

    const parsed = parseJson<any>(result.content);
    if (!parsed) return { selected: [], costUsd: result.costUsd };
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

function getAgeLabel(date: Date | null): string {
  if (!date) return 'non établie';
  const hours = (Date.now() - date.getTime()) / (1000 * 60 * 60);
  if (hours < 1) return 'just now';
  if (hours < 6) return `${Math.round(hours)}h ago`;
  if (hours < 24) return `${Math.round(hours)}h ago`;
  if (hours < 48) return 'yesterday';
  return `${Math.round(hours / 24)}d ago`;
}
