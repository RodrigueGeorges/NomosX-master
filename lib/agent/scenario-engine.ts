/**
 * NomosX Causal Analogical Researcher (CANA) + SCATTER + Courtroom Debate
 *
 * Three innovations from 2026 research for scenario-rich analysis:
 *
 * 1. CANA (arxiv 2026): Causal Analogical Researcher
 *    Finds historical analogies by UNDERLYING MECHANISM, not surface similarity.
 *    +10% vs deep research agents on ADR-bench.
 *    Key insight: LLMs match on surface features. CANA decomposes situations
 *    into causal mechanisms, then searches for analogues on those mechanisms.
 *
 * 2. SCATTER (ACL 2026): Scattered Hypothesis Generation
 *    Generates diverse hypotheses about future events (not just most probable).
 *    Optimizes inclusiveness + diversity via validity + intra/inter-group diversity.
 *    For scenario planning: 5-10 divergent hypotheses → search sources for each.
 *
 * 3. PROCLAIM (arxiv 2026): Courtroom-Style Debate
 *    Plaintiff, Defense, Judge with Progressive RAG.
 *    81.7% accuracy on claim verification (+10pp vs standard debate).
 *    For controversial topics: structured adversarial deliberation.
 */

import { callLLM } from '../llm/unified-llm';
import { parseJson } from './json-utils';

// ─── CANA: Causal Analogical Researcher ─────────────────────────────────────

export interface CausalMechanism {
  id: string;
  type: 'incentive' | 'constraint' | 'feedback_loop' | 'threshold' | 'network_effect' | 'path_dependency' | 'collective_action' | 'information_asymmetry';
  description: string;
  actors: string[];
  causalChain: string[];
}

export interface HistoricalAnalogue {
  event: string;
  period: string;
  region: string;
  mechanismAlignment: number; // 0-1, how well mechanisms match
  surfaceSimilarity: number; // 0-1, surface feature similarity
  outcome: string;
  lessonsLearned: string[];
  searchQueries: string[]; // Queries to find sources about this analogue
}

export interface CanaResult {
  mechanisms: CausalMechanism[];
  analogues: HistoricalAnalogue[];
  searchQueries: string[];
  costUsd: number;
}

const MECHANISM_DECOMPOSITION_PROMPT = `You are a causal analyst at a Tier-1 think tank. Decompose a situation into its underlying causal mechanisms.

The goal is to identify the MECHANISMS that drive the situation — not the surface features.
This enables finding historical analogues that share the same mechanisms but look different on the surface.

SITUATION: {situation}

Decompose into causal mechanisms. For each:
- type: The mechanism type (incentive, constraint, feedback_loop, threshold, network_effect, path_dependency, collective_action, information_asymmetry)
- description: How this mechanism operates in this situation
- actors: Who is involved
- causalChain: The chain of cause→effect

Return JSON:
{
  "mechanisms": [
    {
      "id": "m1",
      "type": "incentive",
      "description": "Regulated entities face lower costs from non-compliance than from compliance",
      "actors": ["regulators", "regulated companies"],
      "causalChain": ["Weak enforcement", "Low expected penalty", "Non-compliance is rational", "Regulatory failure"]
    }
  ]
}

Aim for 3-6 mechanisms. Focus on STRUCTURAL drivers, not surface details.`;

const ANALOGUE_FINDING_PROMPT = `You are a historian and policy analyst. Find historical analogues for a situation based on SHARED CAUSAL MECHANISMS (not surface similarity).

SITUATION: {situation}
CAUSAL MECHANISMS:
{mechanisms}

Find 3-5 historical events that share the SAME underlying mechanisms but may look different on the surface.

For each analogue:
- event: What happened
- period: When (decade or year)
- region: Where
- mechanismAlignment: How well the mechanisms match (0-1)
- surfaceSimilarity: How similar the surface features are (0-1)
- outcome: What was the result
- lessonsLearned: What lessons can be transferred
- searchQueries: 2-3 search queries to find academic sources about this event

Return JSON:
{
  "analogues": [
    {
      "event": "The collapse of the Montreal Protocol's enforcement mechanism",
      "period": "1990s",
      "region": "Global",
      "mechanismAlignment": 0.85,
      "surfaceSimilarity": 0.30,
      "outcome": "Initial non-compliance, later resolved through trade sanctions",
      "lessonsLearned": ["Trade sanctions can enforce environmental agreements", "Enforcement lags create windows of non-compliance"],
      "searchQueries": ["Montreal Protocol enforcement mechanisms", "trade sanctions environmental compliance", "ozone treaty non-compliance"]
    }
  ]
}

Rules:
- Prioritize MECHANISM ALIGNMENT over surface similarity
- Include analogues from DIFFERENT domains (if situation is about climate, look at nuclear, public health, financial regulation)
- Include both SUCCESS and FAILURE cases
- Be specific about the historical event (not vague generalizations)`;

/**
 * Run CANA: Causal Analogical Researcher.
 * Decomposes a situation into causal mechanisms, then finds historical analogues
 * that share those mechanisms.
 *
 * The search queries generated can be used by the Intelligent Scout's "historical"
 * lens to find sources about these analogues.
 */
export async function runCana(situation: string): Promise<CanaResult> {
  let totalCost = 0;

  // Step 1: Decompose into causal mechanisms
  let mechanisms: CausalMechanism[] = [];
  try {
    const response = await callLLM({
      messages: [{
        role: 'user',
        content: MECHANISM_DECOMPOSITION_PROMPT.replace('{situation}', situation.slice(0, 2000)),
      }],
      temperature: 0.2,
      jsonMode: true,
      maxTokens: 2000,
      task: 'reader_v3',
      enableCache: true,
    });
    totalCost += response.costUsd || 0;

    const result = parseJson<{ mechanisms: CausalMechanism[] }>(response.content);
    if (result?.mechanisms) {
      mechanisms = result.mechanisms;
    }
  } catch (err) {
    console.warn('[CANA] Mechanism decomposition failed:', String(err).slice(0, 80));
  }

  if (mechanisms.length === 0) {
    return { mechanisms: [], analogues: [], searchQueries: [], costUsd: totalCost };
  }

  // Step 2: Find historical analogues
  let analogues: HistoricalAnalogue[] = [];
  try {
    const mechanismsJson = JSON.stringify(mechanisms.map(m => ({ type: m.type, description: m.description, causalChain: m.causalChain })));
    const response = await callLLM({
      messages: [{
        role: 'user',
        content: ANALOGUE_FINDING_PROMPT
          .replace('{situation}', situation.slice(0, 1000))
          .replace('{mechanisms}', mechanismsJson),
      }],
      temperature: 0.3,
      jsonMode: true,
      maxTokens: 3000,
      task: 'reader_v3',
      enableCache: true,
    });
    totalCost += response.costUsd || 0;

    const result = parseJson<{ analogues: HistoricalAnalogue[] }>(response.content);
    if (result?.analogues) {
      analogues = result.analogues;
    }
  } catch (err) {
    console.warn('[CANA] Analogue finding failed:', String(err).slice(0, 80));
  }

  // Collect all search queries
  const searchQueries = analogues.flatMap(a => a.searchQueries);

  console.log(`[CANA] Found ${mechanisms.length} mechanisms, ${analogues.length} analogues, ${searchQueries.length} search queries`);

  return { mechanisms, analogues, searchQueries, costUsd: totalCost };
}

// ─── SCATTER: Scattered Hypothesis Generation ───────────────────────────────

export interface Hypothesis {
  id: string;
  statement: string;
  probability: number; // 0-1, estimated probability
  category: 'continuation' | 'disruption' | 'transformation' | 'collapse' | 'surprise';
  drivers: string[];
  secondOrderEffects?: string[]; // Consequences of the consequences
  evidenceNeeded: string[];
  searchQueries: string[];
}

export interface ScatterResult {
  hypotheses: Hypothesis[];
  diversityScore: number; // 0-1
  costUsd: number;
}

const SCATTER_PROMPT = `You are NomosX — a revolutionary foresight analyst who does not merely extrapolate trends but identifies the structural tensions, second-order effects, and black swan events that conventional foresight misses.

Your editorial DNA:
- COMBAT NOVLANGUE: Expose the gap between official discourse and structural reality.
- CONNECT IDEAS ACROSS DOMAINS: The most consequential disruptions come from domain collisions, not from within-domain trends.
- MEANING BEFORE ANSWERS: Before forecasting, establish what the question actually means.

The goal is NOT to predict the most likely outcome, but to cover the SPACE of plausible futures — including futures that conventional analysts dismiss as unlikely but that would be transformative if they occurred.

SITUATION: {situation}
TIME HORIZON: {timeHorizon}

Generate 7-10 hypotheses covering different categories:
1. "continuation": Current trends continue (most likely scenario)
2. "disruption": A major disruption changes the trajectory
3. "transformation": Structural transformation occurs
4. "collapse": System breakdown or failure
5. "surprise": Unexpected outcome that few are anticipating — a BLACK SWAN event

For each hypothesis:
- statement: Clear, specific hypothesis
- probability: Estimated probability (0-1)
- category: One of the 5 categories
- drivers: Key drivers that would make this happen
- secondOrderEffects: What SECOND-ORDER effects would this produce? (If X happens, what does X enable/prevent that then enables/prevents something else?)
- evidenceNeeded: What evidence would support or refute this
- searchQueries: 2-3 search queries to find sources about this scenario

CRITICAL REQUIREMENTS:
- SECOND-ORDER THINKING: For each hypothesis, identify at least 2 second-order effects — the consequences of the consequences. Most analysts stop at first-order effects. NomosX goes deeper.
- BLACK SWAN INCLUSION: Include at least 2 "surprise" hypotheses — low-probability, high-impact events that would transform the landscape. Think: what would make this situation look completely different in 10 years? What unlikely event would make all current analysis obsolete?
- CROSS-DOMAIN DISRUPTIONS: Consider disruptions from UNRELATED domains — a technological breakthrough in one field that transforms another, a geopolitical event that reframes a technical debate, a cultural shift that changes what is politically possible.
- ONTOLOGICAL DISRUPTIONS: Consider scenarios where the fundamental categories of the debate change — not just new answers, but new questions that make the current question obsolete.

Return JSON:
{
  "hypotheses": [
    {
      "id": "h1",
      "statement": "Carbon pricing becomes universal through trade-linked mechanisms by 2030",
      "probability": 0.35,
      "category": "transformation",
      "drivers": ["EU CBAM expansion", "China national ETS maturation", "US carbon border adjustments"],
      "secondOrderEffects": ["Carbon-linked trade wars reshape WTO architecture", "Developing nations form carbon-pricing cartels", "Carbon accounting becomes a new profession with ISO standards"],
      "evidenceNeeded": ["CBAM implementation progress", "ETS coverage expansion rates", "Trade agreement carbon provisions"],
      "searchQueries": ["carbon border adjustment mechanism expansion", "global carbon pricing 2030 projections", "CBAM trade policy future"]
    }
  ]
}

Rules:
- Cover ALL 5 categories (at least 1 hypothesis per category)
- Be SPECIFIC (not vague "things might change")
- Probabilities should sum to ~1.0
- Prioritize DIVERSITY over likelihood
- Include at least 2 "surprise" hypotheses that challenge conventional wisdom — these are your BLACK SWANS
- Every hypothesis MUST include secondOrderEffects — first-order thinking is not enough
- Think across domains: what could disrupt this situation from an unrelated field?
- Think ontologically: what could change the fundamental categories of this debate?`;

/**
 * Run SCATTER: Scattered Hypothesis Generation.
 * Generates diverse hypotheses about future outcomes.
 *
 * The search queries can be used by the Intelligent Scout's "scenario" lens
 * to find sources about each hypothesis.
 */
export async function runScatter(situation: string, timeHorizon: string = '5-10 years'): Promise<ScatterResult> {
  try {
    const response = await callLLM({
      messages: [{
        role: 'user',
        content: SCATTER_PROMPT
          .replace('{situation}', situation.slice(0, 2000))
          .replace('{timeHorizon}', timeHorizon),
      }],
      temperature: 0.4, // Higher temperature for diversity
      jsonMode: true,
      maxTokens: 3000,
      task: 'reader_v3',
      enableCache: true,
    });

    const result = parseJson<{ hypotheses: Hypothesis[] }>(response.content);
    if (result?.hypotheses && result.hypotheses.length > 0) {
      // Compute diversity score
      const categories = new Set(result.hypotheses.map(h => h.category));
      const diversityScore = categories.size / 5; // 5 categories = max diversity

      console.log(`[SCATTER] Generated ${result.hypotheses.length} hypotheses across ${categories.size} categories (diversity=${Math.round(diversityScore * 100)}%)`);

      return {
        hypotheses: result.hypotheses,
        diversityScore,
        costUsd: response.costUsd || 0,
      };
    }
  } catch (err) {
    console.warn('[SCATTER] Hypothesis generation failed:', String(err).slice(0, 80));
  }

  return { hypotheses: [], diversityScore: 0, costUsd: 0 };
}

// ─── PROCLAIM: Courtroom-Style Debate ───────────────────────────────────────

export interface DebateArgument {
  round: number;
  agent: 'plaintiff' | 'defense' | 'judge';
  argument: string;
  evidence: string[];
  citations: string[];
}

export interface DebateResult {
  verdict: 'sustained' | 'overturned' | 'mixed';
  confidence: number; // 0-1
  arguments: DebateArgument[];
  keyContentions: string[];
  synthesis: string;
  costUsd: number;
}

const PLAINTIFF_PROMPT = `You are the Plaintiff in a courtroom-style debate about a research claim.
Your role is to ARGUE IN FAVOR of the claim, presenting the strongest possible case.

CLAIM: {claim}
EVIDENCE AVAILABLE:
{evidence}

Present your case with:
1. Opening statement (why the claim is correct)
2. Key evidence supporting the claim
3. Anticipated counterarguments and your rebuttals

Return JSON:
{
  "argument": "Your full argument",
  "evidence": ["evidence 1", "evidence 2"],
  "citations": ["[SRC-1]", "[SRC-3]"]
}`;

const DEFENSE_PROMPT = `You are the Defense in a courtroom-style debate about a research claim.
Your role is to ARGUE AGAINST the claim, presenting the strongest possible case.

CLAIM: {claim}
EVIDENCE AVAILABLE:
{evidence}

Present your case with:
1. Opening statement (why the claim is incorrect or unsupported)
2. Key evidence contradicting the claim
3. Anticipated counterarguments and your rebuttals

Return JSON:
{
  "argument": "Your full argument",
  "evidence": ["evidence 1", "evidence 2"],
  "citations": ["[SRC-2]", "[SRC-5]"]
}`;

const JUDGE_PROMPT = `You are the Judge in a courtroom-style debate. You must render a verdict based on the arguments presented.

CLAIM: {claim}

PLAINTIFF ARGUMENT:
{plaintiffArgument}

DEFENSE ARGUMENT:
{defenseArgument}

Evaluate:
1. Which side presented stronger evidence?
2. Were the citations accurate and relevant?
3. Is the claim sustained (supported), overturned (refuted), or mixed (uncertain)?

Return JSON:
{
  "verdict": "sustained" | "overturned" | "mixed",
  "confidence": 0.0-1.0,
  "keyContentions": ["contention 1", "contention 2"],
  "synthesis": "Your final synthesis weighing both sides"
}`;

/**
 * Run a courtroom-style debate on a controversial claim.
 * Plaintiff argues for, Defense argues against, Judge renders verdict.
 *
 * Use this for:
 * - Controversial claims where sources disagree
 * - Policy recommendations with distributional consequences
 * - Claims that the Critic flagged as "contradicted"
 */
export async function runCourtroomDebate(
  claim: string,
  evidence: string,
): Promise<DebateResult> {
  let totalCost = 0;
  const arguments_: DebateArgument[] = [];

  // Round 1: Plaintiff and Defense in parallel
  const [plaintiffResult, defenseResult] = await Promise.allSettled([
    callLLM({
      messages: [{ role: 'user', content: PLAINTIFF_PROMPT.replace('{claim}', claim).replace('{evidence}', evidence.slice(0, 2000)) }],
      temperature: 0.3,
      jsonMode: true,
      maxTokens: 1500,
      task: 'reader_v3',
      enableCache: true,
    }),
    callLLM({
      messages: [{ role: 'user', content: DEFENSE_PROMPT.replace('{claim}', claim).replace('{evidence}', evidence.slice(0, 2000)) }],
      temperature: 0.3,
      jsonMode: true,
      maxTokens: 1500,
      task: 'reader_v3',
      enableCache: true,
    }),
  ]);

  let plaintiffArgument = '';
  let defenseArgument = '';

  if (plaintiffResult.status === 'fulfilled') {
    const result = parseJson<{ argument: string; evidence: string[]; citations: string[] }>(plaintiffResult.value.content);
    if (result) {
      plaintiffArgument = result.argument;
      arguments_.push({ round: 1, agent: 'plaintiff', argument: result.argument, evidence: result.evidence, citations: result.citations });
      totalCost += plaintiffResult.value.costUsd || 0;
    }
  }

  if (defenseResult.status === 'fulfilled') {
    const result = parseJson<{ argument: string; evidence: string[]; citations: string[] }>(defenseResult.value.content);
    if (result) {
      defenseArgument = result.argument;
      arguments_.push({ round: 1, agent: 'defense', argument: result.argument, evidence: result.evidence, citations: result.citations });
      totalCost += defenseResult.value.costUsd || 0;
    }
  }

  // Round 2: Judge renders verdict
  let verdict: DebateResult['verdict'] = 'mixed';
  let confidence = 0.5;
  let keyContentions: string[] = [];
  let synthesis = '';

  if (plaintiffArgument && defenseArgument) {
    try {
      const judgeResponse = await callLLM({
        messages: [{
          role: 'user',
          content: JUDGE_PROMPT
            .replace('{claim}', claim)
            .replace('{plaintiffArgument}', plaintiffArgument.slice(0, 2000))
            .replace('{defenseArgument}', defenseArgument.slice(0, 2000)),
        }],
        temperature: 0.1,
        jsonMode: true,
        maxTokens: 1500,
        task: 'reader_v3',
        enableCache: true,
      });
      totalCost += judgeResponse.costUsd || 0;

      const result = parseJson<{ verdict: string; confidence: number; keyContentions: string[]; synthesis: string }>(judgeResponse.content);
      if (result) {
        verdict = result.verdict as DebateResult['verdict'];
        confidence = result.confidence;
        keyContentions = result.keyContentions || [];
        synthesis = result.synthesis;
        arguments_.push({ round: 2, agent: 'judge', argument: result.synthesis, evidence: [], citations: [] });
      }
    } catch (err) {
      console.warn('[Debate] Judge failed:', String(err).slice(0, 80));
    }
  }

  console.log(`[Debate] Verdict: ${verdict} (confidence=${Math.round(confidence * 100)}%, ${arguments_.length} arguments)`);

  return {
    verdict,
    confidence,
    arguments: arguments_,
    keyContentions,
    synthesis,
    costUsd: totalCost,
  };
}
