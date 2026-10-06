/**
 * NomosX Intelligent Scout — Multi-lens adaptive retrieval.
 *
 * Replaces the "collect everything" approach with a targeted, multi-lens strategy
 * that finds both consensus sources AND eclectic/divergent material for scenario planning.
 *
 * Inspired by:
 * - AutoSearch (2026): Adaptive search depth — stop when enough evidence
 * - EACL 2026: Exploration-exploitation bandit for sub-query selection (+35% precision)
 * - Paper Circle (ACL 2026): Multi-criteria scoring + diversity-aware ranking
 * - REAP (AAAI 2026): Recursive evaluation + adaptive planning for multi-hop
 * - SourceBench (2026): Source quality assessment (relevance + authority + freshness)
 * - RAG governance: Pre-filter by authority before embedding
 * - llmbestpractices: Hybrid retrieval (dense + sparse + reciprocal rank fusion)
 *
 * Nine lenses (search strategies):
 * 1. CORE: Most relevant, highest-quality sources (consensus)
 * 2. CONTRARIAN: Sources that disagree with the consensus (dissenting views)
 * 3. CROSS-DOMAIN: Sources from adjacent and non-obvious fields (analogous insights)
 * 4. HISTORICAL: Past analogues across centuries (structural patterns)
 * 5. WEAK SIGNAL: Novel, low-citation sources (emerging trends)
 * 6. SCENARIO: Sources about alternative futures including black swans
 * 7. PROVOCATIVE: Questions that challenge the framing of the question itself
 * 8. ONTOLOGICAL: Philosophical/theological/anthropological depth (deepest layer)
 * 9. DISSIDENT: Voices outside the institutional mainstream (heterodox, non-Western)
 *
 * Each lens generates different search queries and uses different provider selections.
 * The bandit algorithm allocates budget across lenses based on yield.
 *
 * For a think tank, this is the key differentiator:
 * - A search engine finds the most relevant answer.
 * - A think tank finds the answer + the counter-argument + the historical analogue
 *   + the weak signal + the cross-domain insight → rich scenario material.
 */

import { callLLM } from '../llm/unified-llm';
import { assertExecutionActive } from '../worker/execution-scope';
import { parseJson } from './json-utils';

// ─── Types ──────────────────────────────────────────────────────────────────

export type LensType = 'core' | 'contrarian' | 'cross_domain' | 'historical' | 'weak_signal' | 'scenario' | 'provocative' | 'ontological' | 'dissident';

export interface SearchLens {
  type: LensType;
  name: string;
  description: string;
  queries: string[];
  providers: string[]; // Preferred providers for this lens
  maxSources: number;
  priority: number; // 0-1, higher = more important
}

export interface LensResult {
  type: LensType;
  queries: string[];
  sources: Array<{
    id: string;
    title: string;
    abstract?: string | null;
    provider: string;
    year?: number | null;
    doi?: string | null;
    citationCount?: number | null;
    qualityScore?: number;
    noveltyScore?: number;
    lensType: LensType;
    relevanceScore: number; // 0-1, how relevant to the original question
    diversityScore: number; // 0-1, how different from other sources
  }>;
  yield: number; // sources found / queries made
  costUsd: number;
}

export interface IntelligentScoutResult {
  lenses: LensResult[];
  allSources: LensResult['sources'];
  /** Per-lens PhD-level mini-analyses — the lens's own disciplinary reading */
  lensInsights?: Array<{
    lensType: LensType;
    analysis: string;
    keyContribution: string;
    knowledgeGaps: string[];
    recommendedCanon: string[];
  }>;
  /** Genuine disagreements detected between lens readings — injected into the
   *  analyst context so synthesis preserves debate instead of flattening it */
  lensTensions?: Array<{ between: string; tension: string; resolution: string }>;
  totalSources: number;
  uniqueSources: number;
  diversityScore: number; // 0-1, how diverse the pool is
  consensusScore: number; // 0-1, how much agreement there is
  scenarioRichness: number; // 0-1, how much scenario material was found
  costUsd: number;
  durationMs: number;
  adaptiveDepth: number; // How many iterations were needed
  banditAllocation: Array<{ lens: LensType; budget: number; yield: number }>;
}

// ─── Lens Generation (LLM-powered) ──────────────────────────────────────────

const LENS_GENERATION_PROMPT = `You are NomosX — a revolutionary think tank that does not merely summarize consensus but challenges it, crosses domains that others keep separate, and asks questions that conventional institutions are afraid to pose.

Your editorial DNA (from the Nomos philosophy):
- COMBAT NOVLANGUE: Name things by their true name. When power renames repression as "reform," layoffs as "optimization," or censorship as "responsible moderation," expose the linguistic deception.
- CONNECT IDEAS ACROSS DOMAINS: The most consequential insights live at the intersection of domains. An economist alone misses what a philosopher sees. Force the collision and extract the friction.
- MEANING BEFORE ANSWERS: Before producing a conclusion, establish what the question actually means. A precise question poorly answered is more valuable than a vague question answered confidently.

Your task: generate search queries across 9 strategic lenses for the research question below.

The goal is NOT just to find the most relevant sources — it's to find a RICH, ECLECTIC, PROVOCATIVE pool
that enables scenario planning AND intellectual breakthrough. A revolutionary think tank needs:
consensus AND dissent AND analogues AND weak signals AND provocative framings AND ontological depth AND dissident voices.

RESEARCH QUESTION: "{question}"
DOMAIN: {domain}
FORMAT: {format}

Generate queries for each lens:

1. CORE — The most relevant, authoritative sources on the direct question.
   What are the key papers, reports, and data sources?

2. CONTRARIAN — Sources that DISAGREE with the consensus or challenge the mainstream view.
   Search for criticism, skepticism, failure cases, negative results, alternative interpretations.
   Keywords: "criticism", "rebuttal", "challenge", "failure", "limitations", "contrary evidence"

3. CROSS_DOMAIN — Sources from ADJACENT and NON-OBVIOUS fields that offer transferable insights.
   Think BEYOND the obvious analogies. If the question is about AI governance, look at:
   medieval canon law, monastic governance, the Reformation's challenge to religious authority,
   the history of standardization bodies (ISO, ITU), anthropological studies of ritual and taboo,
   the sociology of expertise, Foucault on governmentality, Habermas on legitimation crisis.
   Force collisions between disciplines that rarely speak to each other.
   Keywords: "analogous", "parallel", "lessons from", "transferable", "cross-domain", "interdisciplinary"

4. HISTORICAL — Past analogues: what happened in similar situations historically?
   Go DEEP into history — not just recent decades but centuries. Look for structural patterns,
   not surface similarities. How did the Catholic Church respond to the printing press?
   How did guilds respond to industrialization? How did colonial powers standardize knowledge?
   Keywords: "historical", "precedent", "case study", "long-term", "lessons learned", "past", "century"

5. WEAK_SIGNAL — Novel, emerging, low-citation sources that hint at future developments.
   Search for preprints, working papers, conference papers, recent theses.
   Use BROAD providers — include social science repositories (ssrn, hal, crossref) not just STEM ones.
   Keywords: "novel", "emerging", "preliminary", "working paper", "experimental", "early findings", "pilot study", "framework proposal"

6. SCENARIO — Sources about alternative futures, projections, forecasts.
   Search for scenario planning, risk assessment, projections, expert surveys.
   Include BLACK SWAN scenarios — low-probability, high-impact events that would transform the landscape.
   Keywords: "scenario", "projection", "forecast", "future", "2050", "pathway", "trajectory", "black swan", "wildcard"

7. PROVOCATIVE — Questions that CHALLENGE the framing of the question itself.
   Generate queries that ask the QUESTION BEHIND THE QUESTION. What assumptions are hidden?
   What if the premise is wrong? What if the real issue is not what everyone thinks?
   Examples: If the question is about "AI governance", ask: "Who defines what counts as 'governance'?"
   "Is 'AI governance' actually a euphemism for ontological control?" "What interests are served
   by framing this as a governance problem rather than a power problem?"
   These queries should be BOLD, INTELLECTUALLY DARING, and willing to challenge taboos.
   Keywords: "critique", "political economy of", "hidden assumptions", "ideology", "power",
   "who benefits", "legitimacy", "hegemony", "discourse analysis", "Foucault", "Bourdieu"

8. ONTOLOGICAL — Sources that address the DEEPEST layer of the question:
   what conception of reality, knowledge, or human nature is being assumed?
   Go to philosophy, theology, anthropology, and the history of ideas.
   If the question is about AI governance, ask: "What conception of the human being
   underlies different governance frameworks?" "Can a universal framework exist without
   imposing a particular anthropology?" Look at phenomenology, hermeneutics, existentialism,
   non-Western philosophical traditions (Confucian ethics, Ubuntu philosophy, Islamic falsafa).
   Keywords: "ontology", "epistemology", "phenomenology", "anthropology", "philosophy of",
   "conception of the human", "philosophical anthropology", "metaphysics", "hermeneutics"

9. DISSIDENT — Voices OUTSIDE the institutional mainstream: independent journalists,
   investigative reporters, whistleblowers, marginalized scholars, non-Western perspectives,
   heterodox economists, dissident philosophers. Search for critical perspectives that
   challenge institutional narratives. Include independent media, Substack writers,
   investigative journalism, and voices from the Global South.
   Keywords: "dissident", "heterodox", "independent", "investigative", "whistleblower",
   "marginalized", "Global South", "decolonial", "post-colonial", "subaltern"

Return JSON:
{
  "lenses": [
    {
      "type": "core",
      "queries": ["query 1", "query 2", "query 3"],
      "providers": ["openalex", "crossref", "semanticscholar"],
      "maxSources": 15,
      "priority": 1.0
    },
    {
      "type": "contrarian",
      "queries": ["query 1", "query 2"],
      "providers": ["openalex", "semanticscholar", "ssrn"],
      "maxSources": 8,
      "priority": 0.8
    },
    {
      "type": "cross_domain",
      "queries": ["query 1", "query 2", "query 3"],
      "providers": ["openalex", "crossref", "base", "jstor"],
      "maxSources": 10,
      "priority": 0.8
    },
    {
      "type": "historical",
      "queries": ["query 1", "query 2"],
      "providers": ["openalex", "crossref", "jstor", "internet-archive"],
      "maxSources": 8,
      "priority": 0.7
    },
    {
      "type": "weak_signal",
      "queries": ["query 1", "query 2"],
      "providers": ["ssrn", "hal", "crossref", "openreview", "arxiv", "openalex"],
      "maxSources": 10,
      "priority": 0.7
    },
    {
      "type": "scenario",
      "queries": ["query 1", "query 2"],
      "providers": ["openalex", "ssrn", "nber", "imf", "oecd"],
      "maxSources": 8,
      "priority": 0.8
    },
    {
      "type": "provocative",
      "queries": ["query 1", "query 2"],
      "providers": ["openalex", "crossref", "ssrn", "hal"],
      "maxSources": 8,
      "priority": 0.9
    },
    {
      "type": "ontological",
      "queries": ["query 1", "query 2"],
      "providers": ["openalex", "crossref", "jstor", "hal", "persee"],
      "maxSources": 8,
      "priority": 0.85
    },
    {
      "type": "dissident",
      "queries": ["query 1", "query 2"],
      "providers": ["openalex", "crossref", "ssrn", "hal", "internet-archive"],
      "maxSources": 8,
      "priority": 0.85
    }
  ]
}

Rules:
- 2-4 queries per lens (more for CORE)
- Queries should be specific enough to return relevant results
- Use English for search queries (most academic databases are English-centric)
- For CROSS_DOMAIN, think CREATIVELY about which adjacent fields are most relevant — go beyond obvious analogies
- For HISTORICAL, include time periods or centuries that might have structural analogues
- For WEAK_SIGNAL, prefer recent/preprint providers
- For SCENARIO, include forward-looking keywords, time horizons, AND black swan scenarios
- For PROVOCATIVE, generate queries that would make a conventional think tank uncomfortable — challenge the framing, expose hidden assumptions, name the power dynamics
- For ONTOLOGICAL, go to the deepest philosophical layer — what conception of reality or the human is being assumed?
- For DISSIDENT, search for voices outside the institutional mainstream — heterodox, independent, marginalized, non-Western`;

/**
 * Generate the 6 search lenses for a research question.
 * Uses LLM to create targeted queries for each lens.
 */
export async function generateSearchLenses(
  question: string,
  domain: string = 'general',
  format: string = 'brief',
): Promise<{ lenses: SearchLens[]; costUsd: number }> {
  try {
    const response = await callLLM({
      messages: [{
        role: 'user',
        content: LENS_GENERATION_PROMPT
          .replace('{question}', question.slice(0, 500))
          .replace('{domain}', domain)
          .replace('{format}', format),
      }],
      temperature: 0.3,
      jsonMode: true,
      maxTokens: 2000,
      enableCache: true,
      task: 'reader_v3',
    });

    const result = parseJson<{ lenses: Array<{ type: LensType; queries: string[]; providers: string[]; maxSources: number; priority: number }> }>(response.content);

    if (result?.lenses && Array.isArray(result.lenses) && result.lenses.length > 0) {
      const lenses: SearchLens[] = result.lenses.map(l => ({
        type: l.type,
        name: lensName(l.type),
        description: lensDescription(l.type),
        queries: l.queries || [],
        providers: l.providers || ['openalex', 'crossref'],
        maxSources: l.maxSources || 10,
        priority: l.priority ?? 0.7,
      }));
      return { lenses, costUsd: typeof response.costUsd === 'number' ? response.costUsd : 0 };
    }
  } catch (err) {
    console.warn('[IntelligentScout] LLM lens generation failed, using defaults:', String(err).slice(0, 100));
  }

  // Fallback: default lenses with simple query expansion
  return { lenses: defaultLenses(question), costUsd: 0 };
}

function lensName(type: LensType): string {
  const names: Record<LensType, string> = {
    core: 'Core Consensus',
    contrarian: 'Contrarian Views',
    cross_domain: 'Cross-Domain Analogues',
    historical: 'Historical Precedents',
    weak_signal: 'Weak Signals',
    scenario: 'Scenario Seeds',
    provocative: 'Provocative Framings',
    ontological: 'Ontological Depth',
    dissident: 'Dissident Voices',
  };
  return names[type];
}

function lensDescription(type: LensType): string {
  const descs: Record<LensType, string> = {
    core: 'Most relevant, authoritative sources on the direct question',
    contrarian: 'Sources that disagree with the consensus or challenge the mainstream view',
    cross_domain: 'Sources from adjacent and non-obvious fields offering transferable insights',
    historical: 'Past analogues, structural patterns, and historical precedents across centuries',
    weak_signal: 'Novel, emerging, low-citation sources hinting at future developments',
    scenario: 'Sources about alternative futures, projections, forecasts, and black swan events',
    provocative: 'Questions that challenge the framing of the question itself and expose hidden assumptions',
    ontological: 'Philosophical, theological, and anthropological sources addressing the deepest layer of the question',
    dissident: 'Voices outside the institutional mainstream: independent journalists, heterodox scholars, non-Western perspectives',
  };
  return descs[type];
}

function defaultLenses(question: string): SearchLens[] {
  const q = question.slice(0, 100);
  return [
    { type: 'core', name: lensName('core'), description: lensDescription('core'), queries: [q], providers: ['openalex', 'crossref', 'semanticscholar'], maxSources: 15, priority: 1.0 },
    { type: 'contrarian', name: lensName('contrarian'), description: lensDescription('contrarian'), queries: [`${q} criticism limitations`], providers: ['openalex', 'semanticscholar', 'ssrn'], maxSources: 8, priority: 0.8 },
    { type: 'cross_domain', name: lensName('cross_domain'), description: lensDescription('cross_domain'), queries: [`${q} analogous lessons from interdisciplinary`], providers: ['openalex', 'crossref', 'base', 'jstor'], maxSources: 10, priority: 0.8 },
    { type: 'historical', name: lensName('historical'), description: lensDescription('historical'), queries: [`${q} historical precedent case study century`], providers: ['openalex', 'crossref', 'jstor', 'internet-archive'], maxSources: 8, priority: 0.7 },
    { type: 'weak_signal', name: lensName('weak_signal'), description: lensDescription('weak_signal'), queries: [`${q} novel emerging preliminary`, `${q} early findings pilot study framework`], providers: ['ssrn', 'hal', 'crossref', 'openreview', 'openalex'], maxSources: 10, priority: 0.7 },
    { type: 'scenario', name: lensName('scenario'), description: lensDescription('scenario'), queries: [`${q} scenario projection forecast future black swan`], providers: ['openalex', 'ssrn', 'nber'], maxSources: 8, priority: 0.8 },
    { type: 'provocative', name: lensName('provocative'), description: lensDescription('provocative'), queries: [`${q} critique political economy power ideology hidden assumptions`], providers: ['openalex', 'crossref', 'ssrn', 'hal'], maxSources: 8, priority: 0.9 },
    { type: 'ontological', name: lensName('ontological'), description: lensDescription('ontological'), queries: [`${q} ontology epistemology philosophy anthropology conception human`], providers: ['openalex', 'crossref', 'jstor', 'hal', 'persee'], maxSources: 8, priority: 0.85 },
    { type: 'dissident', name: lensName('dissident'), description: lensDescription('dissident'), queries: [`${q} heterodox dissident independent marginalized Global South decolonial`], providers: ['openalex', 'crossref', 'ssrn', 'hal', 'internet-archive'], maxSources: 8, priority: 0.85 },
  ];
}

// ─── Exploration-Exploitation Bandit ────────────────────────────────────────

interface BanditArm {
  lens: LensType;
  budget: number;
  pulls: number;
  totalReward: number;
  ucbValue: number;
}

/**
 * UCB1 bandit algorithm for allocating search budget across lenses.
 * Each lens is an "arm". The "reward" is the number of high-quality sources found.
 *
 * The bandit balances:
 * - Exploration: trying lenses that haven't been searched much
 * - Exploitation: focusing on lenses that have yielded good sources
 *
 * This is the EACL 2026 pattern: +35% precision by dynamically selecting
 * the most informative sub-queries.
 */
export class LensBandit {
  private arms: Map<LensType, BanditArm> = new Map();
  private totalPulls = 0;

  constructor(lenses: SearchLens[]) {
    for (const lens of lenses) {
      this.arms.set(lens.type, {
        lens: lens.type,
        budget: lens.maxSources,
        pulls: 0,
        totalReward: 0,
        ucbValue: Infinity, // Unexplored arms have infinite UCB
      });
    }
  }

  /**
   * Select the next lens to search using UCB1.
   * Returns null if all lenses have been exhausted.
   */
  selectNextLens(): LensType | null {
    let bestArm: BanditArm | null = null;
    let bestUCB = -Infinity;

    for (const arm of this.arms.values()) {
      if (arm.pulls >= arm.budget) continue; // Exhausted

      if (arm.pulls === 0) {
        // Unexplored — prioritize
        return arm.lens;
      }

      // UCB1: average_reward + c * sqrt(ln(total_pulls) / pulls)
      const c = 1.41; // sqrt(2) — standard UCB exploration constant
      const avgReward = arm.totalReward / arm.pulls;
      const ucb = avgReward + c * Math.sqrt(Math.log(this.totalPulls + 1) / arm.pulls);

      if (ucb > bestUCB) {
        bestUCB = ucb;
        bestArm = arm;
      }
    }

    return bestArm?.lens ?? null;
  }

  /**
   * Record the result of a lens search.
   * @param lens - The lens type
   * @param sourcesFound - Number of high-quality sources found
   */
  recordResult(lens: LensType, sourcesFound: number): void {
    const arm = this.arms.get(lens);
    if (!arm) return;
    arm.pulls++;
    arm.totalReward += sourcesFound;
    this.totalPulls++;
  }

  /**
   * Get the allocation summary for reporting.
   */
  getAllocation(): Array<{ lens: LensType; budget: number; pulls: number; yield: number }> {
    return Array.from(this.arms.values()).map(arm => ({
      lens: arm.lens,
      budget: arm.budget,
      pulls: arm.pulls,
      yield: arm.totalReward,
    }));
  }
}

// ─── Adaptive Search Depth (AutoSearch pattern) ─────────────────────────────

export interface AdaptiveDepthConfig {
  minSources: number; // Minimum sources needed (default: 15)
  maxSources: number; // Maximum sources to collect (default: 200)
  maxIterations: number; // Maximum search iterations (default: 3)
  sufficiencyThreshold: number; // Stop when this many high-quality sources found (default: 30)
  requiredLenses?: LensType[]; // Lenses that must have coverage before stopping (default: core, contrarian, scenario)
}

/**
 * Assess whether we have enough evidence to stop searching.
 * This is the AutoSearch pattern: evaluate after each iteration whether
 * the current evidence pool is sufficient.
 *
 * Criteria for sufficiency:
 * 1. At least minSources total sources
 * 2. At least 3 lenses have yielded sources (diversity)
 * 3. At least 1 contrarian source (dissent exists)
 * 4. At least 1 scenario source (future material exists)
 */
export function assessSufficiency(
  sources: IntelligentScoutResult['allSources'],
  config: AdaptiveDepthConfig,
): { sufficient: boolean; reason: string; gaps: LensType[] } {
  const totalSources = sources.length;
  const lensCoverage = new Set(sources.map(s => s.lensType));
  const gaps: LensType[] = [];

  // Check minimum count
  if (totalSources < config.minSources) {
    return { sufficient: false, reason: `Only ${totalSources} sources (need ${config.minSources})`, gaps: [] };
  }

  const required = config.requiredLenses ?? ['core', 'contrarian', 'scenario'];

  // Check sufficiency threshold
  if (totalSources >= config.sufficiencyThreshold) {
    // Also check diversity
    for (const req of required) {
      if (!lensCoverage.has(req)) gaps.push(req);
    }
    if (!lensCoverage.has('cross_domain')) gaps.push('cross_domain');

    if (gaps.length === 0) {
      return { sufficient: true, reason: `Sufficient: ${totalSources} sources across ${lensCoverage.size} lenses`, gaps: [] };
    }
    return { sufficient: false, reason: `Sufficient count but missing lenses: ${gaps.join(', ')}`, gaps };
  }

  // Check lens diversity
  const requiredLenses: LensType[] = required;
  for (const req of requiredLenses) {
    if (!lensCoverage.has(req)) gaps.push(req);
  }

  if (gaps.length > 0) {
    return { sufficient: false, reason: `Missing critical lenses: ${gaps.join(', ')}`, gaps };
  }

  return { sufficient: true, reason: `Sufficient: ${totalSources} sources across ${lensCoverage.size} lenses`, gaps: [] };
}

// ─── Source Diversity Scoring ───────────────────────────────────────────────

/**
 * Compute the diversity score of a source pool.
 * Measures how varied the sources are across:
 * - Providers (different databases)
 * - Years (temporal spread)
 * - Citation counts (mix of high/low citation)
 * - Lens types (all 9 lenses represented)
 */
export function computeDiversityScore(sources: IntelligentScoutResult['allSources']): number {
  if (sources.length === 0) return 0;

  // Provider diversity
  const providers = new Set(sources.map(s => s.provider));
  const providerScore = Math.min(1, providers.size / 5); // 5+ providers = max

  // Temporal diversity
  const years = sources.map(s => s.year).filter((y): y is number => y !== null && y !== undefined && y > 1900);
  const yearSpan = years.length > 1 ? (Math.max(...years) - Math.min(...years)) : 0;
  const temporalScore = Math.min(1, yearSpan / 10); // 10+ year span = max

  // Citation diversity (mix of high and low citation)
  const citations = sources.map(s => s.citationCount || 0).sort((a, b) => a - b);
  const citationMedian = citations.length > 0 ? citations[Math.floor(citations.length / 2)] : 0;
  const citationSpread = citations.length > 0 ? (citations[citations.length - 1] - citations[0]) : 0;
  const citationScore = Math.min(1, citationSpread / (citationMedian + 1)); // High spread relative to median

  // Lens diversity
  const lenses = new Set(sources.map(s => s.lensType));
  const lensScore = lenses.size / 9; // 9 lenses = max

  // Weighted average
  return (providerScore * 0.25 + temporalScore * 0.25 + citationScore * 0.2 + lensScore * 0.3);
}

/**
 * Compute the consensus score — how much agreement there is among sources.
 * Low consensus = high potential for interesting scenario analysis.
 */
export function computeConsensusScore(sources: IntelligentScoutResult['allSources']): number {
  if (sources.length < 3) return 0.5; // Unknown

  // Contrarian sources reduce consensus
  const contrarianRatio = sources.filter(s => s.lensType === 'contrarian').length / sources.length;
  const consensus = 1 - Math.min(1, contrarianRatio * 3); // 33% contrarian = zero consensus

  return Math.max(0, Math.min(1, consensus));
}

/**
 * Compute the scenario richness score — how much material for scenario planning.
 * Based on the presence of scenario, weak signal, historical, and cross-domain sources.
 */
export function computeScenarioRichness(sources: IntelligentScoutResult['allSources']): number {
  if (sources.length === 0) return 0;

  const scenarioSources = sources.filter(s => s.lensType === 'scenario').length;
  const weakSignalSources = sources.filter(s => s.lensType === 'weak_signal').length;
  const historicalSources = sources.filter(s => s.lensType === 'historical').length;
  const crossDomainSources = sources.filter(s => s.lensType === 'cross_domain').length;

  // Each lens contributes to scenario richness
  const scenarioScore = Math.min(1, scenarioSources / 5); // 5+ scenario sources = max
  const weakSignalScore = Math.min(1, weakSignalSources / 3); // 3+ weak signals = max
  const historicalScore = Math.min(1, historicalSources / 3);
  const crossDomainScore = Math.min(1, crossDomainSources / 3);

  return (scenarioScore * 0.4 + weakSignalScore * 0.2 + historicalScore * 0.2 + crossDomainScore * 0.2);
}

// ─── Pre-filtering (RAG governance pattern) ─────────────────────────────────

export type SourceAuthority = 'peer_reviewed' | 'preprint' | 'institutional' | 'news' | 'blog' | 'unknown';

/**
 * Classify source authority based on provider and metadata.
 * Used for pre-filtering before embedding.
 */
export function classifyAuthority(source: {
  provider?: string;
  type?: string;
  doi?: string | null;
  citationCount?: number | null;
}): SourceAuthority {
  const provider = (source.provider || '').toLowerCase();
  const type = (source.type || '').toLowerCase();

  // Peer-reviewed indicators
  const peerReviewedProviders = ['openalex', 'crossref', 'semanticscholar', 'pubmed', 'europepmc', 'doaj', 'springer'];
  if (peerReviewedProviders.some(p => provider.includes(p)) && type === 'paper') {
    return 'peer_reviewed';
  }

  // Foundational & heritage sources — academic book archives and curated
  // libraries (JSTOR, HathiTrust, university presses, national libraries).
  // Books are vetted scholarship: peer_reviewed tier, not 'unknown'.
  const heritageProviders = ['jstor', 'hathitrust', 'open-library', 'gutenberg', 'gallica', 'europeana', 'dpla', 'wikisource', 'internet-archive', 'persee', 'isidore', 'philpapers'];
  if (heritageProviders.some(p => provider.includes(p))) {
    return 'peer_reviewed';
  }

  // Preprint indicators
  const preprintProviders = ['arxiv', 'biorxiv', 'openreview', 'ssrn', 'nber', 'repec'];
  if (preprintProviders.some(p => provider.includes(p))) {
    return 'preprint';
  }

  // Institutional
  const institutionalProviders = ['imf', 'worldbank', 'oecd', 'bis', 'ecb', 'eurostat', 'iaea', 'irena', 'iea', 'nato', 'un', 'undp', 'bruegel', 'rand', 'brookings', 'cfr', 'carnegie'];
  if (institutionalProviders.some(p => provider.includes(p))) {
    return 'institutional';
  }

  // News
  if (provider.includes('gdelt') || provider.includes('news') || provider.includes('rss') || provider.includes('tavily')) {
    return 'news';
  }

  // Blog / web
  if (provider.includes('linkup') || provider.includes('exa') || provider.includes('apitube')) {
    return 'blog';
  }

  return 'unknown';
}

/**
 * Authority score: peer_reviewed (1.0) > institutional (0.9) > preprint (0.7) > news (0.4) > blog (0.2) > unknown (0.5)
 */
export function authorityScore(authority: SourceAuthority): number {
  const scores: Record<SourceAuthority, number> = {
    peer_reviewed: 1.0,
    institutional: 0.9,
    preprint: 0.7,
    unknown: 0.5,
    news: 0.4,
    blog: 0.2,
  };
  return scores[authority];
}

/**
 * Pre-filter sources before embedding.
 * Removes low-quality, irrelevant, or contaminated sources.
 *
 * Criteria:
 * - Authority: must be at least 'news' level (filter out pure blogs)
 * - Recency: prefer sources from last 10 years (except historical lens)
 * - Abstract: must have an abstract of at least 50 chars (for semantic search)
 * - Deduplication: remove duplicates by DOI or normalized title
 */
/** Lenses whose value IS old/foundational material — exempt from the recency filter. */
const INTERPRETIVE_LENSES = new Set<LensType>([
  'historical',
  'ontological',
  'cross_domain',
  'provocative',
  'dissident',
]);

export function preFilterSources(
  sources: IntelligentScoutResult['allSources'],
  options?: { minAuthority?: SourceAuthority; minYear?: number; minAbstractLength?: number },
): { kept: IntelligentScoutResult['allSources']; dropped: number; reasons: Record<string, number> } {
  const minAuthorityScore = authorityScore(options?.minAuthority ?? 'news');
  const minYear = options?.minYear ?? 2010;
  const minAbstractLength = options?.minAbstractLength ?? 50;

  const reasons: Record<string, number> = {};
  const kept: IntelligentScoutResult['allSources'] = [];
  const seenDoi = new Set<string>();
  const seenTitle = new Set<string>();

  for (const source of sources) {
    // Dedup by DOI
    if (source.doi) {
      const doiLower = source.doi.toLowerCase();
      if (seenDoi.has(doiLower)) { reasons.duplicate_doi = (reasons.duplicate_doi || 0) + 1; continue; }
      seenDoi.add(doiLower);
    }

    // Dedup by normalized title
    const normTitle = (source.title || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 100);
    if (normTitle && seenTitle.has(normTitle)) { reasons.duplicate_title = (reasons.duplicate_title || 0) + 1; continue; }
    if (normTitle) seenTitle.add(normTitle);

    // Authority filter
    const auth = classifyAuthority(source);
    if (authorityScore(auth) < minAuthorityScore) { reasons.low_authority = (reasons.low_authority || 0) + 1; continue; }

    // Abstract filter
    if ((source.abstract || '').length < minAbstractLength) { reasons.no_abstract = (reasons.no_abstract || 0) + 1; continue; }

    // Year filter — interpretive lenses legitimately surface foundational
    // texts (Kant, Tocqueville, Weber, Polanyi): exempt them all, not just
    // 'historical', or the canon gets silently dropped.
    if (!INTERPRETIVE_LENSES.has(source.lensType) && source.year && source.year < minYear) {
      reasons.too_old = (reasons.too_old || 0) + 1; continue;
    }

    kept.push(source);
  }

  return { kept, dropped: sources.length - kept.length, reasons };
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Run the intelligent multi-lens scout.
 *
 * This is the main entry point. It:
 * 1. Generates 6 search lenses (core, contrarian, cross-domain, historical, weak signal, scenario)
 * 2. Uses a UCB1 bandit to allocate budget across lenses
 * 3. Runs adaptive search depth (stops when sufficient evidence)
 * 4. Pre-filters sources by authority and relevance
 * 5. Computes diversity, consensus, and scenario richness scores
 *
 * @param question - The research question
 * @param domain - The domain (e.g., 'climate', 'ai', 'geopolitics')
 * @param format - The report format ('brief', 'strategic', 'dossier')
 * @param searchFn - The search function to use (delegates to existing scout)
 * @returns Intelligent scout result with all sources and metadata
 */
export async function runIntelligentScout(
  question: string,
  domain: string,
  format: string,
  searchFn: (query: string, providers: string[], perProvider: number) => Promise<Array<{ id: string; title: string; abstract?: string | null; provider: string; year?: number | null; doi?: string | null; citationCount?: number | null; qualityScore?: number; noveltyScore?: number }>>,
): Promise<IntelligentScoutResult> {
  const startTime = Date.now();
  const config: AdaptiveDepthConfig = {
    minSources: format === 'dossier' ? 30 : 15,
    maxSources: format === 'dossier' ? 300 : format === 'strategic' ? 200 : 100,
    maxIterations: 2,
    sufficiencyThreshold: format === 'dossier' ? 60 : format === 'strategic' ? 40 : 20,
    // Strategic/dossier formats must reach the depth lenses — ontological and
    // historical coverage are what make the output a think-tank piece rather
    // than a literature review.
    requiredLenses: format === 'dossier' || format === 'strategic'
      ? ['core', 'contrarian', 'scenario', 'historical', 'ontological']
      : ['core', 'contrarian', 'scenario'],
  };

  // Step 1: Generate search lenses
  const { lenses, costUsd: lensCost } = await generateSearchLenses(question, domain, format);
  console.log(`[IntelligentScout] Generated ${lenses.length} lenses: ${lenses.map(l => `${l.type}(${l.queries.length}q)`).join(', ')}`);

  // Every lens must get at least one pull — with maxIterations=2 only ~2 of 9
  // lenses ever ran, so ontological/provocative/dissident depth never executed.
  // lenses.length + 2 lets the bandit also re-pull its highest-yield lens.
  // Memo/brief is capped lower — 11 lens waves × provider fan-out was the main
  // driver of 55min timeouts; required lenses (core/contrarian/scenario) run first.
  config.maxIterations = Math.min(
    lenses.length + 2,
    format === 'dossier' ? 14 : format === 'strategic' ? 11 : 6
  );

  // Step 2: Initialize bandit
  const bandit = new LensBandit(lenses);

  // Step 3: Adaptive search with bandit allocation
  const allSources: IntelligentScoutResult['allSources'] = [];
  let totalCost = lensCost;
  let iteration = 0;
  // Wall-clock budget: a single scout pass can balloon to 20+ min when dead
  // providers stack timeouts × retries × query variations. Cap the whole
  // adaptive loop — partial evidence beats a killed pipeline.
  const SCOUT_WALL_BUDGET_MS = Number(process.env.INTELLIGENT_SCOUT_BUDGET_MS ?? 8 * 60 * 1000);

  while (iteration < config.maxIterations) {
    iteration++;
    assertExecutionActive();
    if (Date.now() - startTime > SCOUT_WALL_BUDGET_MS) {
      console.warn(`[IntelligentScout] Wall-clock budget ${SCOUT_WALL_BUDGET_MS / 60000}min exhausted at iteration ${iteration} — stopping with ${allSources.length} sources`);
      break;
    }
    const lensType = bandit.selectNextLens();
    if (!lensType) break;

    const lens = lenses.find(l => l.type === lensType);
    if (!lens) continue;

    // Search with this lens
    const perProvider = Math.min(20, Math.ceil(lens.maxSources / lens.queries.length));
    const lensSources: IntelligentScoutResult['allSources'] = [];

    for (const query of lens.queries) {
      assertExecutionActive();
      if (Date.now() - startTime > SCOUT_WALL_BUDGET_MS) break;
      try {
        const results = await searchFn(query, lens.providers, perProvider);
        for (const r of results) {
          lensSources.push({
            ...r,
            lensType: lens.type,
            relevanceScore: 0.5, // Will be computed later
            diversityScore: 0, // Will be computed later
          });
        }
      } catch (err) {
        console.warn(`[IntelligentScout] Lens ${lens.type} query "${query.slice(0, 50)}" failed:`, String(err).slice(0, 80));
      }
    }

    // Record yield for bandit
    bandit.recordResult(lens.type, lensSources.length);
    allSources.push(...lensSources);

    console.log(`[IntelligentScout] Iteration ${iteration}: lens=${lens.type}, found=${lensSources.length}, total=${allSources.length}`);

    // Check sufficiency
    const sufficiency = assessSufficiency(allSources, config);
    if (sufficiency.sufficient) {
      console.log(`[IntelligentScout] Sufficient evidence: ${sufficiency.reason}`);
      break;
    }

    // If there are gaps, prioritize those lenses in the next iteration
    if (sufficiency.gaps.length > 0) {
      for (const gap of sufficiency.gaps) {
        const gapLens = lenses.find(l => l.type === gap);
        if (gapLens) {
          // Force search this gap lens
          const gapResults = await searchFn(gapLens.queries[0], gapLens.providers, 15);
          for (const r of gapResults) {
            allSources.push({ ...r, lensType: gap, relevanceScore: 0.5, diversityScore: 0 });
          }
          bandit.recordResult(gap, gapResults.length);
          console.log(`[IntelligentScout] Gap fill: lens=${gap}, found=${gapResults.length}`);
        }
      }
    }
  }

  // Step 4: Deduplicate
  const uniqueIds = new Set<string>();
  const uniqueSources = allSources.filter(s => {
    if (uniqueIds.has(s.id)) return false;
    uniqueIds.add(s.id);
    return true;
  });

  // Step 5: Pre-filter
  const filtered = preFilterSources(uniqueSources);
  console.log(`[IntelligentScout] Pre-filter: ${uniqueSources.length} → ${filtered.kept.length} (dropped ${filtered.dropped}: ${JSON.stringify(filtered.reasons)})`);

  // ── LENS AGENTS (strategic/dossier only) ──────────────────────────────
  // Each lens gets a PhD-level intelligence pass: analyze its own sources,
  // self-assess knowledge sufficiency, and emit fetch queries when thin.
  let lensInsights: IntelligentScoutResult['lensInsights'] = [];
  let lensTensions: IntelligentScoutResult['lensTensions'] = [];
  if (format === 'strategic' || format === 'dossier') {
    try {
      const { runLensAgent, lensFetchProviders, checkLensTensions } = await import('./lenses/lens-agent');
      const agentResults = await Promise.all(
        lenses.map(async (lens) => {
          const lensSources = filtered.kept.filter(s => s.lensType === lens.type);
          return runLensAgent(lens, question, lensSources);
        })
      );

      const selfFetchSources: typeof allSources = [];
      for (const insight of agentResults) {
        if (!insight) continue;
        lensInsights.push({
          lensType: insight.lensType,
          analysis: insight.analysis,
          keyContribution: insight.keyContribution,
          knowledgeGaps: insight.knowledgeGaps,
          recommendedCanon: insight.recommendedCanon,
        });
        totalCost += insight.costUsd;

        // Self-fetch: lens deemed its knowledge insufficient → run its queries
        // on ITS OWN preferred providers (PhD profile), not the plan's.
        if (insight.fetchQueries.length > 0) {
          const own = lensFetchProviders(insight.lensType);
          const lens = lenses.find(l => l.type === insight.lensType);
          const fetchProviders = own.length > 0 ? own : (lens?.providers ?? []);
          for (const fq of insight.fetchQueries.slice(0, 2)) {
            try {
              const fetched = await searchFn(fq, fetchProviders, 10);
              for (const r of fetched) {
                selfFetchSources.push({ ...r, lensType: insight.lensType, relevanceScore: 0.5, diversityScore: 0 });
              }
            } catch { /* non-blocking */ }
          }
        }
      }

      // Merge self-fetch results into the pool (dedup + filter again)
      if (selfFetchSources.length > 0) {
        const refiltered = preFilterSources(
          selfFetchSources.filter(s => !uniqueIds.has(s.id))
        );
        filtered.kept.push(...refiltered.kept);
        for (const s of refiltered.kept) uniqueIds.add(s.id);
        console.log(`[IntelligentScout] Lens agents: ${agentResults.filter(Boolean).length} analyses, +${refiltered.kept.length} self-fetched sources`);
      } else {
        console.log(`[IntelligentScout] Lens agents: ${agentResults.filter(Boolean).length} analyses, no self-fetch needed`);
      }

      // ── INTER-LENS TENSIONS — the supervisor-merge failure mode is
      // injecting worker outputs verbatim without checking coherence.
      // Lenses SHOULD disagree; the analyst must see the axes of debate. ──
      if (lensInsights.length >= 2) {
        const tensionResult = await checkLensTensions(question, lensInsights);
        if (tensionResult) {
          lensTensions = tensionResult.tensions;
          totalCost += tensionResult.costUsd;
          if (lensTensions.length > 0) {
            console.log(`[IntelligentScout] Lens tensions detected: ${lensTensions.map(t => t.between).join(' | ')}`);
          }
        }
      }
    } catch (err) {
      console.warn('[IntelligentScout] Lens agents failed (non-blocking):', String(err).slice(0, 100));
    }
  }

  // Step 6: Compute scores
  const diversityScore = computeDiversityScore(filtered.kept);
  const consensusScore = computeConsensusScore(filtered.kept);
  const scenarioRichness = computeScenarioRichness(filtered.kept);

  // Step 7: Build lens results
  const lensResults: LensResult[] = lenses.map(lens => {
    const lensSources = filtered.kept.filter(s => s.lensType === lens.type);
    return {
      type: lens.type,
      queries: lens.queries,
      sources: lensSources,
      yield: lens.queries.length > 0 ? lensSources.length / lens.queries.length : 0,
      costUsd: 0,
    };
  });

  const durationMs = Date.now() - startTime;
  const banditAllocation = bandit.getAllocation();

  console.log(`[IntelligentScout] Done: ${filtered.kept.length} sources, diversity=${Math.round(diversityScore * 100)}%, consensus=${Math.round(consensusScore * 100)}%, scenarioRichness=${Math.round(scenarioRichness * 100)}%, ${durationMs}ms`);

  // Step 8: S18 — Retrieval-Grounded Voting (RGV)
  // arXiv 2608.24024 — multi-round retrieval voting improves precision by ~5.4%
  // Sources that appear across multiple retrieval rounds get higher vote scores.
  // This re-ranks sources by cross-round consensus rather than single-shot relevance.
  const votedSources = applyRetrievalGroundedVoting(filtered.kept, lenses);

  return {
    lenses: lensResults,
    allSources: votedSources,
    lensInsights,
    lensTensions,
    totalSources: allSources.length,
    uniqueSources: votedSources.length,
    diversityScore,
    consensusScore,
    scenarioRichness,
    costUsd: totalCost,
    durationMs,
    adaptiveDepth: iteration,
    banditAllocation,
  };
}

// ============================================================================
// S18: RGV — Retrieval-Grounded Voting
// arXiv 2608.24024 (Aug 2026)
// ============================================================================
//
// Multi-round retrieval voting: sources that appear across multiple retrieval
// rounds (different lenses, different queries) get higher vote scores. This
// re-ranks sources by cross-round consensus rather than single-shot relevance.
//
// Key insight: a source found by BOTH the "core" lens AND the "cross_domain"
// lens is likely more fundamental than one found only by a single lens.
// Similarly, a source found by multiple queries within the same lens is
// more robust than one found by a single query.
//
// Effect: +5.4% accuracy on multi-turn search tasks (paper benchmark).

export function applyRetrievalGroundedVoting(
  sources: IntelligentScoutResult['allSources'],
  lenses: SearchLens[],
): IntelligentScoutResult['allSources'] {
  if (sources.length === 0) return sources;

  const lensTypes = new Set(lenses.map(l => l.type));
  const voteMap = new Map<string, { source: typeof sources[0]; votes: number; lensCount: number }>();

  for (const source of sources) {
    const key = source.doi || source.id;
    const existing = voteMap.get(key);
    if (existing) {
      existing.votes++;
    } else {
      voteMap.set(key, { source, votes: 1, lensCount: 0 });
    }
  }

  const lensAppearances = new Map<string, Set<LensType>>();
  for (const source of sources) {
    const key = source.doi || source.id;
    if (!lensAppearances.has(key)) lensAppearances.set(key, new Set());
    lensAppearances.get(key)!.add(source.lensType);
  }

  for (const [key, entry] of voteMap) {
    entry.lensCount = lensAppearances.get(key)?.size ?? 1;
  }

  const maxVotes = Math.max(...Array.from(voteMap.values()).map(v => v.votes), 1);
  const maxLensCount = Math.max(...Array.from(voteMap.values()).map(v => v.lensCount), 1);

  return Array.from(voteMap.values())
    .map(({ source, votes, lensCount }) => ({
      ...source,
      relevanceScore: Math.min(1, (votes / maxVotes) * 0.5 + (lensCount / maxLensCount) * 0.5),
      diversityScore: lensCount / lensTypes.size,
    }))
    .sort((a, b) => b.relevanceScore - a.relevanceScore);
}
