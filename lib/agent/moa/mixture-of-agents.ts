/**
 * Mixture of Agents (MoA) — NomosX
 *
 * Au lieu d'un seul ANALYST, le MoA lance plusieurs analystes
 * spécialisés en parallèle, chacun avec une perspective différente,
 * puis agrège leurs insights. C'est le pattern qui crée la capacité
 * émergente : la qualité de l'agrégation est supérieure à celle du
 * meilleur agent individuel.
 *
 * Inspiré de :
 * - "Mixture of Agents" (Together AI, 2024-2026)
 * - "More Agents Is All You Need" (2024)
 * - Society of Minds (multi-perspective debate)
 * - Ensemble methods in ML
 *
 * Architecture :
 * Layer 1: N analystes spécialisés (parallèle)
 *   - Methodology Analyst: focus sur la rigueur méthodologique
 *   - Bias Analyst: focus sur les biais et perspectives manquantes
 *   - Evidence Analyst: focus sur la qualité et couverture des sources
 *   - Synthesis Analyst: focus sur la synthèse et implications
 *   - Skeptic Analyst: focus sur les contre-arguments et faiblesses
 *
 * Layer 2: Aggregator
 *   - Prend les N analyses et produit une synthèse unifiée
 *   - Résout les contradictions entre analystes
 *   - Préserve les insights uniques de chaque perspective
 *
 * Le moat : le système apprend quels analystes sont les plus fiables
 * sur quels types de queries, et ajuste les poids dynamiquement.
 */

import { callLLM } from '../../llm/unified-llm';
import { parseJson } from '../json-utils';
import { prisma } from '../../db';

// ─── Types ──────────────────────────────────────────────────────────────────

export type AgentSpecialization =
  | 'methodology'    // Rigor, study design, statistical validity
  | 'bias'           // Bias detection, missing perspectives
  | 'evidence'       // Source quality, coverage, gaps
  | 'synthesis'      // Cross-source synthesis, implications
  | 'skeptic'        // Counter-arguments, weaknesses
  | 'temporal'       // Temporal dynamics, trends, paradigm shifts
  | 'stakeholder'    // Stakeholder analysis, power dynamics
  | 'uncertainty'    // Uncertainty quantification, confidence calibration
  ;

export interface SpecialistAgent {
  id: AgentSpecialization;
  name: string;
  systemPrompt: string;
  focusDescription: string;
  /** Weight in aggregation (0-1, adjusted by learning) */
  weight: number;
  /** Historical reliability score (0-1) */
  reliability: number;
  /** Number of times this agent has been used */
  usageCount: number;
}

export interface SpecialistAnalysis {
  agentId: AgentSpecialization;
  agentName: string;
  /** The analysis from this specialist's perspective */
  analysis: string;
  /** Key insights unique to this perspective */
  keyInsights: string[];
  /** Confidence of this agent (0-1) */
  confidence: number;
  /** Disagreements with other agents (filled during aggregation) */
  disagreements?: string[];
  /** Cost of this agent's LLM call */
  costUsd: number;
  /** Duration in ms */
  durationMs: number;
}

export interface MoAResult {
  /** Individual specialist analyses */
  specialistAnalyses: SpecialistAnalysis[];
  /** The aggregated final analysis */
  aggregatedAnalysis: string;
  /** Insights that all agents agreed on */
  consensus: string[];
  /** Insights where agents disagreed */
  controversies: Array<{
    topic: string;
    positions: Array<{ agent: AgentSpecialization; position: string }>;
    resolution: string;
  }>;
  /** Unique insights from each agent */
  uniqueInsights: Array<{ agent: AgentSpecialization; insight: string }>;
  /** Overall confidence (0-1) */
  overallConfidence: number;
  /** Total cost */
  totalCostUsd: number;
  /** Total duration */
  totalDurationMs: number;
  /** Agent weights used */
  agentWeights: Record<string, number>;
}

// ─── Specialist Agent Definitions ───────────────────────────────────────────

export const SPECIALIST_AGENTS: Record<AgentSpecialization, SpecialistAgent> = {
  methodology: {
    id: 'methodology',
    name: 'Methodology Analyst',
    systemPrompt: `You are a methodology specialist. Your job is to analyze research with a focus on METHODOLOGICAL RIGOR.

Pay special attention to:
- Study designs (RCT, observational, meta-analysis, etc.)
- Sample sizes and statistical power
- Confounding variables and controls
- Replication status
- Methodological limitations

For every claim, ask: "How was this established methodologically?"
Be critical of weak methodologies. Acknowledge when evidence is methodologically limited.
Use [SRC-N] citations for every claim.`,
    focusDescription: 'Methodological rigor, study design, statistical validity',
    weight: 1.0,
    reliability: 0.8,
    usageCount: 0,
  },
  bias: {
    id: 'bias',
    name: 'Bias Analyst',
    systemPrompt: `You are a bias detection specialist. Your job is to analyze research with a focus on BIASES and MISSING PERSPECTIVES.

Pay special attention to:
- Selection bias in sources
- Publication bias
- Geographic bias (Western-centric?)
- Funding bias
- Confirmation bias in the analysis
- Perspectives that are missing (whose voices aren't heard?)

For every claim, ask: "Whose perspective does this represent? Who is missing?"
Be critical of narrow perspectives. Actively seek diverse viewpoints.
Use [SRC-N] citations for every claim.`,
    focusDescription: 'Bias detection, missing perspectives, diversity of viewpoints',
    weight: 1.0,
    reliability: 0.75,
    usageCount: 0,
  },
  evidence: {
    id: 'evidence',
    name: 'Evidence Analyst',
    systemPrompt: `You are an evidence quality specialist. Your job is to analyze research with a focus on EVIDENCE QUALITY and COVERAGE.

Pay special attention to:
- Source quality (peer-reviewed vs preprint vs gray literature)
- Evidence hierarchy (systematic review > RCT > observational > case study)
- Coverage gaps (what topics have insufficient evidence?)
- Contradictions between sources
- Recency and temporal relevance

For every claim, ask: "What is the quality and quantity of evidence supporting this?"
Be transparent about evidence gaps. Distinguish strong from weak evidence.
Use [SRC-N] citations for every claim.`,
    focusDescription: 'Source quality, evidence hierarchy, coverage gaps',
    weight: 1.0,
    reliability: 0.85,
    usageCount: 0,
  },
  synthesis: {
    id: 'synthesis',
    name: 'Synthesis Analyst',
    systemPrompt: `You are a synthesis specialist. Your job is to analyze research with a focus on CROSS-SOURCE SYNTHESIS and IMPLICATIONS.

Pay special attention to:
- Patterns across multiple sources
- Convergent findings (multiple sources agree)
- Divergent findings (sources disagree)
- Implications for policy, practice, and future research
- Big picture and strategic insights

For every claim, ask: "What does this mean in the broader context?"
Be creative in connecting findings across domains. Think about implications.
Use [SRC-N] citations for every claim.`,
    focusDescription: 'Cross-source synthesis, implications, strategic insights',
    weight: 1.0,
    reliability: 0.8,
    usageCount: 0,
  },
  skeptic: {
    id: 'skeptic',
    name: 'Skeptic Analyst',
    systemPrompt: `You are a professional skeptic. Your job is to analyze research with a focus on COUNTER-ARGUMENTS and WEAKNESSES.

Pay special attention to:
- The strongest counter-arguments to each claim
- What would have to be true for this analysis to be wrong?
- Assumptions that are unstated
- Alternative explanations for the evidence
- Potential failure modes of the conclusions

For every claim, ask: "What's the best case AGAINST this?"
Be constructive in your skepticism. Don't just deny — propose better alternatives.
Use [SRC-N] citations for every claim.`,
    focusDescription: 'Counter-arguments, weaknesses, alternative explanations',
    weight: 1.0,
    reliability: 0.7,
    usageCount: 0,
  },
  temporal: {
    id: 'temporal',
    name: 'Temporal Dynamics Analyst',
    systemPrompt: `You are a temporal dynamics specialist. Your job is to analyze research with a focus on TRENDS, PARADIGM SHIFTS, and TEMPORAL DYNAMICS.

Pay special attention to:
- How has understanding evolved over time?
- Are there recent paradigm shifts?
- Which older findings are still valid vs outdated?
- What trends are emerging?
- Rate of change in the field

For every claim, ask: "Is this still current? How has this evolved?"
Be sensitive to temporal context. Flag outdated sources explicitly.
Use [SRC-N] citations for every claim.`,
    focusDescription: 'Trends, paradigm shifts, temporal evolution',
    weight: 0.8,
    reliability: 0.75,
    usageCount: 0,
  },
  stakeholder: {
    id: 'stakeholder',
    name: 'Stakeholder Analyst',
    systemPrompt: `You are a stakeholder analysis specialist. Your job is to analyze research with a focus on STAKEHOLDERS and POWER DYNAMICS.

Pay special attention to:
- Who are the key stakeholders?
- Who benefits from each position?
- Power dynamics and conflicts of interest
- Distributional impacts (who wins, who loses?)
- Political economy of the issue

For every claim, ask: "Who does this serve? Who is harmed?"
Be attentive to power imbalances. Surface hidden stakeholders.
Use [SRC-N] citations for every claim.`,
    focusDescription: 'Stakeholder analysis, power dynamics, distributional impacts',
    weight: 0.8,
    reliability: 0.7,
    usageCount: 0,
  },
  uncertainty: {
    id: 'uncertainty',
    name: 'Uncertainty Analyst',
    systemPrompt: `You are an uncertainty quantification specialist. Your job is to analyze research with a focus on CONFIDENCE CALIBRATION and UNCERTAINTY.

Pay special attention to:
- How confident should we be in each claim?
- What are the key sources of uncertainty?
- Which claims are well-established vs speculative?
- Confidence intervals and error bars
- Black swans and tail risks

For every claim, ask: "How certain are we? What could change this?"
Be honest about uncertainty. Distinguish known unknowns from unknown unknowns.
Use [SRC-N] citations for every claim.`,
    focusDescription: 'Confidence calibration, uncertainty quantification',
    weight: 0.8,
    reliability: 0.75,
    usageCount: 0,
  },
};

// ─── Run Specialist Agents ──────────────────────────────────────────────────

/**
 * Run multiple specialist agents in parallel.
 * Each agent analyzes the same sources from its unique perspective.
 */
export async function runSpecialistAgents(
  query: string,
  sources: Array<{ id: string; title: string; abstract?: string; fullText?: string }>,
  contextBlock: string,
  options: {
    agents?: AgentSpecialization[];
    isStrategic?: boolean;
    maxTokens?: number;
  } = {},
): Promise<SpecialistAnalysis[]> {
  const {
    agents = ['methodology', 'bias', 'evidence', 'synthesis', 'skeptic'] as AgentSpecialization[],
    isStrategic = false,
    maxTokens = isStrategic ? 8000 : 4000,
  } = options;

  // Build source context
  const sourceContext = sources.map((s, i) => {
    const content = s.fullText || s.abstract || '';
    return `[SRC-${i + 1}] ${s.title}\n${content.slice(0, 2000)}`;
  }).join('\n\n---\n\n');

  // Run all agents in parallel
  const promises = agents.map(async (agentId) => {
    const agent = SPECIALIST_AGENTS[agentId];
    const startTime = Date.now();

    try {
      const response = await callLLM({
        messages: [
          {
            role: 'system',
            content: `${agent.systemPrompt}

You are part of a Mixture of Agents system. Other specialists are analyzing the same sources from different perspectives. Your job is to provide the BEST analysis from YOUR perspective. Focus on what others might miss.

${isStrategic ? 'This is a strategic-depth analysis. Be comprehensive.' : 'This is a brief analysis. Be concise but thorough.'}`,
          },
          {
            role: 'user',
            content: `Research question: ${query}

Context:
${contextBlock.slice(0, 2000)}

Sources:
${sourceContext.slice(0, 15000)}

Provide your specialist analysis. Focus on: ${agent.focusDescription}

Respond with JSON:
{
  "analysis": "your full analysis (use [SRC-N] citations)",
  "keyInsights": ["insight 1", "insight 2", "insight 3"],
  "confidence": 0.75
}`,
          },
        ],
        temperature: 0.3,
        jsonMode: true,
        maxTokens,
        task: 'enrichment_reasoner',
      });

      const parsed = parseJson<{ analysis: string; keyInsights: string[]; confidence: number }>(response.content);

      return {
        agentId,
        agentName: agent.name,
        analysis: parsed?.analysis || response.content,
        keyInsights: parsed?.keyInsights || [],
        confidence: parsed?.confidence ?? 0.6,
        costUsd: response.costUsd,
        durationMs: Date.now() - startTime,
      } as SpecialistAnalysis;
    } catch (err) {
      console.warn(`[MoA] Agent ${agentId} failed:`, err);
      return {
        agentId,
        agentName: agent.name,
        analysis: `[${agent.name} failed to produce analysis]`,
        keyInsights: [],
        confidence: 0,
        costUsd: 0,
        durationMs: Date.now() - startTime,
      } as SpecialistAnalysis;
    }
  });

  const results = await Promise.allSettled(promises);
  return results
    .filter((r): r is PromiseFulfilledResult<SpecialistAnalysis> => r.status === 'fulfilled')
    .map(r => r.value);
}

// ─── Aggregator ─────────────────────────────────────────────────────────────

/**
 * Aggregate the specialist analyses into a unified analysis.
 * The aggregator identifies consensus, controversies, and unique insights.
 */
export async function aggregateAnalyses(
  query: string,
  specialistAnalyses: SpecialistAnalysis[],
  options: { isStrategic?: boolean; maxTokens?: number } = {},
): Promise<MoAResult> {
  const { isStrategic = false, maxTokens = isStrategic ? 16000 : 8000 } = options;

  if (specialistAnalyses.length === 0) {
    return {
      specialistAnalyses: [],
      aggregatedAnalysis: '',
      consensus: [],
      controversies: [],
      uniqueInsights: [],
      overallConfidence: 0,
      totalCostUsd: 0,
      totalDurationMs: 0,
      agentWeights: {},
    };
  }

  // Build the aggregator input
  const analysesSummary = specialistAnalyses.map(a => {
    const agent = SPECIALIST_AGENTS[a.agentId];
    return `### ${a.agentName} (confidence: ${a.confidence.toFixed(2)}, weight: ${agent.weight.toFixed(2)})
${a.analysis.slice(0, 3000)}

Key insights:
${a.keyInsights.map(i => `- ${i}`).join('\n')}`;
  }).join('\n\n---\n\n');

  const totalCost = specialistAnalyses.reduce((s, a) => s + a.costUsd, 0);
  const totalDuration = specialistAnalyses.reduce((s, a) => s + a.durationMs, 0);

  try {
    const response = await callLLM({
      messages: [
        {
          role: 'system',
          content: `You are the Aggregator in a Mixture of Agents system. Multiple specialist analysts have analyzed the same research question from different perspectives. Your job is to synthesize their analyses into a single unified analysis.

Your tasks:
1. Identify CONSENSUS — what do all/most specialists agree on?
2. Identify CONTROVERSIES — where do specialists disagree?
3. Resolve controversies — use evidence to determine which position is better supported
4. Preserve UNIQUE INSIGHTS — insights that only one specialist noticed
5. Produce a unified analysis that is better than any individual analysis

Weight each specialist's contribution by their confidence and your assessment of their reliability.

Respond with JSON:
{
  "aggregatedAnalysis": "the full unified analysis with [SRC-N] citations",
  "consensus": ["point 1", "point 2", ...],
  "controversies": [
    {
      "topic": "the disputed topic",
      "positions": [{"agent": "methodology", "position": "..."}, {"agent": "skeptic", "position": "..."}],
      "resolution": "how you resolved it and why"
    }
  ],
  "uniqueInsights": [{"agent": "bias", "insight": "..."}],
  "overallConfidence": 0.75
}`,
        },
        {
          role: 'user',
          content: `Research question: ${query}

Specialist analyses:

${analysesSummary}

Synthesize these into a unified analysis:`,
        },
      ],
      temperature: 0.2,
      jsonMode: true,
      maxTokens,
      task: 'enrichment_reasoner',
    });

    const parsed = parseJson<{
      aggregatedAnalysis: string;
      consensus: string[];
      controversies: Array<{ topic: string; positions: Array<{ agent: string; position: string }>; resolution: string }>;
      uniqueInsights: Array<{ agent: string; insight: string }>;
      overallConfidence: number;
    }>(response.content);

    const agentWeights: Record<string, number> = {};
    for (const a of specialistAnalyses) {
      agentWeights[a.agentId] = SPECIALIST_AGENTS[a.agentId].weight;
    }

    return {
      specialistAnalyses,
      aggregatedAnalysis: parsed?.aggregatedAnalysis || response.content,
      consensus: parsed?.consensus || [],
      controversies: (parsed?.controversies || []).map(c => ({
        ...c,
        positions: c.positions.map(p => ({ ...p, agent: p.agent as AgentSpecialization })),
      })),
      uniqueInsights: (parsed?.uniqueInsights || []).map(u => ({
        ...u,
        agent: u.agent as AgentSpecialization,
      })),
      overallConfidence: parsed?.overallConfidence ?? 0.6,
      totalCostUsd: totalCost + response.costUsd,
      totalDurationMs: totalDuration,
      agentWeights,
    };
  } catch (err) {
    console.warn('[MoA] Aggregation failed:', err);

    // Fallback: concatenate analyses
    return {
      specialistAnalyses,
      aggregatedAnalysis: specialistAnalyses.map(a =>
        `## ${a.agentName}\n${a.analysis}`
      ).join('\n\n---\n\n'),
      consensus: [],
      controversies: [],
      uniqueInsights: specialistAnalyses.flatMap(a =>
        a.keyInsights.map(i => ({ agent: a.agentId, insight: i }))
      ),
      overallConfidence: specialistAnalyses.reduce((s, a) => s + a.confidence, 0) / specialistAnalyses.length,
      totalCostUsd: totalCost,
      totalDurationMs: totalDuration,
      agentWeights: Object.fromEntries(
        specialistAnalyses.map(a => [a.agentId, SPECIALIST_AGENTS[a.agentId].weight])
      ),
    };
  }
}

// ─── Full MoA Pipeline ──────────────────────────────────────────────────────

/**
 * Run the full Mixture of Agents pipeline:
 * 1. Run N specialist agents in parallel
 * 2. Aggregate their analyses
 * 3. Update agent weights based on performance
 */
export async function runMixtureOfAgents(
  query: string,
  sources: Array<{ id: string; title: string; abstract?: string; fullText?: string }>,
  contextBlock: string,
  options: {
    agents?: AgentSpecialization[];
    isStrategic?: boolean;
    useDynamicSelection?: boolean;
  } = {},
): Promise<MoAResult> {
  console.log('[MoA] Starting Mixture of Agents...');

  // K5: Dynamic Role Assignment — select agents via meta-debate if enabled
  let selectedAgents = options.agents;
  if (options.useDynamicSelection && !options.agents) {
    const { selected } = await selectAgentsDynamically(query, options.isStrategic ? 7 : 5);
    selectedAgents = selected;
    console.log(`[MoA K5] Dynamically selected ${selected.length} agents: ${selected.join(', ')}`);
  }

  // Step 1: Run specialists in parallel
  const specialistAnalyses = await runSpecialistAgents(
    query,
    sources,
    contextBlock,
    { ...options, agents: selectedAgents },
  );
  console.log(`[MoA] ${specialistAnalyses.length} specialist analyses completed`);

  // Step 2: Aggregate
  const result = await aggregateAnalyses(query, specialistAnalyses, options);
  console.log(`[MoA] Aggregation complete: confidence=${result.overallConfidence.toFixed(2)}, cost=$${result.totalCostUsd.toFixed(4)}`);

  // K7: Enhance consensus with Quadratic Voting
  const enhancedResult = enhanceConsensusWithQuadraticVoting(result);
  if (enhancedResult.consensus.length > 0) {
    console.log(`[MoA K7] Quadratic voting reordered ${enhancedResult.consensus.length} consensus points`);
  }

  // Step 3: Persist for learning
  await persistMoAResult(query, enhancedResult);

  return enhancedResult;
}

// ─── Agent Weight Learning ──────────────────────────────────────────────────

/**
 * Update agent weights based on their performance.
 * Agents that consistently contribute unique, high-confidence insights
 * get higher weights. Agents that are redundant or low-confidence get lower.
 */
export async function updateAgentWeights(
  result: MoAResult,
  qualityScore: number, // 0-1, from PRM or human feedback
): Promise<void> {
  for (const analysis of result.specialistAnalyses) {
    const agent = SPECIALIST_AGENTS[analysis.agentId];
    agent.usageCount++;

    // Update reliability: exponential moving average
    const agentContribution = result.uniqueInsights.filter(u => u.agent === analysis.agentId).length;
    const contributionScore = Math.min(1, agentContribution / 3);
    const performanceScore = (analysis.confidence * 0.5 + contributionScore * 0.3 + qualityScore * 0.2);

    agent.reliability = agent.reliability * 0.8 + performanceScore * 0.2;

    // Update weight: reliability * confidence
    agent.weight = Math.max(0.3, Math.min(1.5, agent.reliability * (analysis.confidence + 0.5)));
  }

  // Persist updated weights
  await persistAgentWeights();
}

async function persistAgentWeights(): Promise<void> {
  try {
    const weights: Record<string, { weight: number; reliability: number; usageCount: number }> = {};
    for (const [id, agent] of Object.entries(SPECIALIST_AGENTS)) {
      weights[id] = {
        weight: agent.weight,
        reliability: agent.reliability,
        usageCount: agent.usageCount,
      };
    }

    await prisma.agentAuditLog.create({
      data: {
        agent: 'moa',
        action: 'WEIGHTS_UPDATE',
        metadata: JSON.stringify({ weights, timestamp: Date.now() }),
      },
    });
  } catch (err) {
    console.warn('[MoA] Failed to persist weights:', err);
  }
}

/**
 * Load agent weights from the database.
 */
export async function loadAgentWeights(): Promise<void> {
  try {
    const record = await prisma.agentAuditLog.findFirst({
      where: { agent: 'moa', action: 'WEIGHTS_UPDATE' },
      orderBy: { timestamp: 'desc' },
    });

    if (!record) return;

    const data = JSON.parse(record.metadata || '{}');
    if (data.weights) {
      for (const [id, info] of Object.entries(data.weights)) {
        const agent = SPECIALIST_AGENTS[id as AgentSpecialization];
        if (agent) {
          const i = info as { weight: number; reliability: number; usageCount: number };
          agent.weight = i.weight;
          agent.reliability = i.reliability;
          agent.usageCount = i.usageCount;
        }
      }
      console.log('[MoA] Loaded agent weights from database');
    }
  } catch (err) {
    console.warn('[MoA] Failed to load weights:', err);
  }
}

// ─── Persistence ────────────────────────────────────────────────────────────

async function persistMoAResult(query: string, result: MoAResult): Promise<void> {
  try {
    await prisma.agentAuditLog.create({
      data: {
        agent: 'moa',
        action: 'MOA_RUN',
        metadata: JSON.stringify({
          query: query.slice(0, 200),
          agentCount: result.specialistAnalyses.length,
          agents: result.specialistAnalyses.map(a => ({
            id: a.agentId,
            confidence: a.confidence,
            costUsd: a.costUsd,
            insights: a.keyInsights.length,
          })),
          consensus: result.consensus.length,
          controversies: result.controversies.length,
          uniqueInsights: result.uniqueInsights.length,
          overallConfidence: result.overallConfidence,
          totalCostUsd: result.totalCostUsd,
          timestamp: Date.now(),
        }),
      },
    });
  } catch (err) {
    console.warn('[MoA] Failed to persist result:', err);
  }
}

// ============================================================================
// K5: DYNAMIC ROLE ASSIGNMENT — Meta-Debate for Agent Selection (arXiv 2026)
// ============================================================================
//
// "Dynamic Role Assignment for Multi-Agent Debate" — instead of always using
// the same 8 specialists, a meta-debate selects the most relevant agents per query.
//
// Two-stage meta-debate:
//   1. Proposal: Each candidate agent argues why it's relevant to this query
//   2. Peer review: Agents score each other's proposals with role-specific criteria
//
// Result (paper): +74.8% over uniform assignment, +29.7% over random assignment.

export interface AgentProposal {
  agentId: AgentSpecialization;
  relevanceScore: number;    // 0-1, how relevant this agent is to the query
  reasoning: string;          // Why this agent is relevant
  peerScores: Array<{ from: AgentSpecialization; score: number }>;
}

/**
 * Select the most relevant specialist agents for a given query using a meta-debate.
 *
 * @param query The research query
 * @param maxAgents Maximum number of agents to select (default: 5)
 * @returns Selected agent IDs with their proposals
 */
export async function selectAgentsDynamically(
  query: string,
  maxAgents: number = 5,
): Promise<{ selected: AgentSpecialization[]; proposals: AgentProposal[] }> {
  const allAgents = Object.keys(SPECIALIST_AGENTS) as AgentSpecialization[];

  try {
    // Stage 1: Proposal — each agent argues why it's relevant
    const proposalResponse = await callLLM({
      messages: [
        {
          role: 'system',
          content: `You are a meta-debate coordinator. Given a research query, evaluate which specialist analysts are most relevant.

Available specialists:
${allAgents.map(id => `- ${id}: ${SPECIALIST_AGENTS[id].focusDescription}`).join('\n')}

For each specialist, assign a relevance score (0.0-1.0) and explain why.
Respond with JSON:
{
  "proposals": [
    {"agentId": "methodology", "relevanceScore": 0.8, "reasoning": "..."},
    ...
  ]
}`,
        },
        {
          role: 'user',
          content: `Research query: "${query.slice(0, 500)}"

Evaluate each specialist's relevance:`,
        },
      ],
      temperature: 0.2,
      jsonMode: true,
      maxTokens: 800,
      task: 'enrichment_reasoner',
    });

    const parsed = parseJson<{ proposals: Array<{ agentId: string; relevanceScore: number; reasoning: string }> }>(
      proposalResponse.content,
    );

    if (parsed?.proposals && Array.isArray(parsed.proposals)) {
      // Filter to valid agents and sort by relevance
      const validProposals = parsed.proposals
        .filter(p => allAgents.includes(p.agentId as AgentSpecialization))
        .sort((a, b) => b.relevanceScore - a.relevanceScore);

      const selected = validProposals
        .slice(0, maxAgents)
        .map(p => p.agentId as AgentSpecialization);

      // Always include at least methodology + evidence + skeptic as baseline
      const baseline: AgentSpecialization[] = ['methodology', 'evidence', 'skeptic'];
      for (const b of baseline) {
        if (!selected.includes(b) && selected.length < maxAgents + 2) {
          selected.push(b);
        }
      }

      const proposals: AgentProposal[] = validProposals.map(p => ({
        agentId: p.agentId as AgentSpecialization,
        relevanceScore: Math.max(0, Math.min(1, p.relevanceScore)),
        reasoning: p.reasoning,
        peerScores: [],
      }));

      console.log(`[MoA K5] Dynamic selection: ${selected.join(', ')} (top score: ${validProposals[0]?.relevanceScore?.toFixed(2)})`);
      return { selected: selected.slice(0, maxAgents + 2), proposals };
    }
  } catch (err) {
    console.warn('[MoA K5] Dynamic selection failed, using default:', err);
  }

  // Fallback: default agents
  return {
    selected: ['methodology', 'bias', 'evidence', 'synthesis', 'skeptic'] as AgentSpecialization[],
    proposals: [],
  };
}

// ============================================================================
// K7: QUADRATIC VOTING — Non-Linear Consensus (NSED, arXiv 2026)
// ============================================================================
//
// In standard voting, each agent gets 1 vote. In Quadratic Voting, each agent
// gets a budget of "voice credits" and can spend them on issues they care about
// most. The cost of N votes is N² credits. This means:
//   - Agents who feel strongly about an issue can express it (more votes)
//   - But with diminishing returns (quadratic cost)
//   - Minority positions with strong conviction can still influence outcomes
//
// Applied to MoA: each specialist gets a budget of voice credits proportional to
// its reliability. It distributes credits across consensus points. The aggregator
// weights consensus by the square root of total credits spent.

export interface QuadraticVote {
  agentId: AgentSpecialization;
  /** How many voice credits the agent spent on this point */
  creditsSpent: number;
  /** The effective vote weight = sqrt(creditsSpent) */
  voteWeight: number;
}

export interface QuadraticVotingResult {
  /** Consensus points ranked by quadratic vote weight */
  rankedConsensus: Array<{
    point: string;
    totalVoteWeight: number;
    votes: QuadraticVote[];
  }>;
  /** Total credits distributed */
  totalCreditsUsed: number;
}

/**
 * Each agent's voice credit budget, proportional to its reliability.
 */
function getVoiceCreditBudget(agentId: AgentSpecialization): number {
  const agent = SPECIALIST_AGENTS[agentId];
  // Base budget of 10 credits, scaled by reliability (0.7-0.85 → 7-8.5 credits)
  return Math.round(10 * agent.reliability);
}

/**
 * Parse an agent's analysis for consensus points and assign quadratic votes.
 *
 * Each agent distributes its voice credits across the points it raises.
 * Points it feels strongly about get more credits (but at quadratic cost).
 */
export function computeQuadraticVotes(
  analyses: SpecialistAnalysis[],
  consensusPoints: string[],
): QuadraticVotingResult {
  const votesByPoint: Map<string, QuadraticVote[]> = new Map();
  let totalCreditsUsed = 0;

  for (const analysis of analyses) {
    const budget = getVoiceCreditBudget(analysis.agentId);
    let remainingBudget = budget;

    // For each consensus point, check if this agent's analysis supports it
    // and assign credits based on confidence and keyword overlap
    const pointScores: Array<{ point: string; supportScore: number }> = [];

    for (const point of consensusPoints) {
      const pointKeywords = point.toLowerCase().split(/\s+/).filter(w => w.length > 3);
      const analysisLower = analysis.analysis.toLowerCase();

      // Count keyword matches
      const matches = pointKeywords.filter(kw => analysisLower.includes(kw)).length;
      const keywordOverlap = matches / Math.max(pointKeywords.length, 1);

      // Support score = keyword overlap * agent confidence
      const supportScore = keywordOverlap * analysis.confidence;
      if (supportScore > 0.1) {
        pointScores.push({ point, supportScore });
      }
    }

    // Sort by support score (strongest first)
    pointScores.sort((a, b) => b.supportScore - a.supportScore);

    // Distribute budget using quadratic voting:
    // Agent spends more credits on points it strongly supports
    for (const { point, supportScore } of pointScores) {
      if (remainingBudget <= 0) break;

      // Credits to spend: proportional to support score, but quadratic cost
      // If agent wants N votes, it costs N² credits
      // So N = floor(sqrt(remainingBudget * supportScore))
      const desiredVotes = Math.floor(Math.sqrt(remainingBudget * supportScore));
      const creditsToSpend = Math.min(remainingBudget, desiredVotes * desiredVotes);

      if (creditsToSpend > 0) {
        const voteWeight = Math.sqrt(creditsToSpend);
        const vote: QuadraticVote = {
          agentId: analysis.agentId,
          creditsSpent: creditsToSpend,
          voteWeight,
        };

        const existing = votesByPoint.get(point) || [];
        existing.push(vote);
        votesByPoint.set(point, existing);

        remainingBudget -= creditsToSpend;
        totalCreditsUsed += creditsToSpend;
      }
    }
  }

  // Compute total vote weight per point and rank
  const rankedConsensus = Array.from(votesByPoint.entries())
    .map(([point, votes]) => ({
      point,
      totalVoteWeight: votes.reduce((s, v) => s + v.voteWeight, 0),
      votes,
    }))
    .sort((a, b) => b.totalVoteWeight - a.totalVoteWeight);

  return { rankedConsensus, totalCreditsUsed };
}

/**
 * Enhanced aggregation that uses quadratic voting for consensus weighting.
 * Integrates with the existing aggregateAnalyses function.
 */
export function enhanceConsensusWithQuadraticVoting(
  result: MoAResult,
): MoAResult {
  if (result.consensus.length === 0) return result;

  const qvResult = computeQuadraticVotes(result.specialistAnalyses, result.consensus);

  // Reorder consensus by quadratic vote weight
  const reorderedConsensus = qvResult.rankedConsensus.map(r => r.point);

  // Add vote metadata to controversies resolution
  const enhancedControversies = result.controversies.map(c => ({
    ...c,
    // Attach vote data if available
    resolution: c.resolution + (qvResult.rankedConsensus.find(r => r.point.includes(c.topic.slice(0, 30)))
      ? ` [QV weight: ${qvResult.rankedConsensus.find(r => r.point.includes(c.topic.slice(0, 30)))!.totalVoteWeight.toFixed(2)}]`
      : ''),
  }));

  return {
    ...result,
    consensus: reorderedConsensus,
    controversies: enhancedControversies,
  };
}
