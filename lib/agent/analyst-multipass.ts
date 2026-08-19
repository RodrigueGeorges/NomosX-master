/**
 * ANALYST Agent V3 — Prospective Multi-Pass Analysis
 *
 * NomosX does not produce analyses of topics. It isolates the strongest,
 * most non-obvious cross-domain causal chain, refutes it until it breaks
 * or holds, extrapolates its trajectory toward a dated future, and takes
 * ONE position — rendered in institute prose where the machinery stays
 * invisible.
 *
 * PASS 1 — FRICTION MAPPING: Extract mechanisms with trajectory, identify cross-domain collisions
 * PASS 2 — STRESS TEST: Try to break every mechanism and collision, trace temporal chaining
 * PASS 3 — PROSPECTIVE SYNTHESIS: Build the causal chain argument with warrants, take position
 */

import { callLLM } from '../llm/unified-llm';
import { parseJson } from './json-utils';
import Sentry from '@sentry/nextjs';
import { AgentRole, assertPermission } from '../governance/index';
import { RESEARCHER_KBS, type DomainExpertise } from './researcher-kb/index';
import { MULTI_DOMAIN_CORPUS } from '../knowledge/multi-domain-corpus';
import { NOMOS_EDITORIAL_LINE_SHORT } from './editorial-config';
import { runAllPruningGates, gateHedgingStrip, type PruningResult } from './pruning-gates';

// ============================================================================
// TYPES
// ============================================================================

export type TemporalStatus = "present_fact" | "active_mechanism" | "future_extrapolation";

export interface FrictionMap {
  mechanisms: Array<{
    id: number;
    description: string;
    domain: string;
    crossDomainEffects: string;
    sources: string[];
    dataPoints: string[];
    temporalStatus: "present_fact" | "active_mechanism";
    trajectoryHint: string;
  }>;
  collisions: Array<{
    domainA: string;
    domainB: string;
    friction: string;
    sources: string[];
    surpriseFactor: string;
  }>;
  dataLandscape: {
    totalDataPoints: number;
    quantitativeFindings: string[];
    activeDynamics: string[];
    projectionsInLiterature: string[];
  };
}

export interface StressTestMap {
  mechanismAssessments: Array<{
    mechanismId: number;
    verdict: "holds" | "cracks" | "breaks";
    reasoning: string;
    canSupportExtrapolation: boolean;
    hostileExpertObjection: string;
    temporalChain: {
      anchoredIn: string;
      mechanism: string;
      projectsTo: string;
    };
  }>;
  collisionAssessments: Array<{
    domainA: string;
    domainB: string;
    causationOrCorrelation: "causation" | "probable_causation" | "correlation_only";
    reasoning: string;
    surpriseVerified: boolean;
    surpriseReasoning: string;
  }>;
  survivingMechanisms: number[];
  strongestChain: {
    presentFactIds: number[];
    mechanismIds: number[];
    projectedFuture: string;
  };
}

export interface CausalLink {
  id: number;
  claim: string;
  evidence: string;
  warrant: string;
  temporalStatus: TemporalStatus;
  derivesFrom: number | null;
  sourceRef?: number;
  unsupported?: boolean;
}

export interface ProspectiveNote {
  title: string;
  throughLine: string;
  verdict: string;
  convictionLevel: "firm" | "tempered" | "causal_only";
  anchoringBasis: string;
  causalChain: CausalLink[];
  trajectory: {
    horizon: string;
    state: string;
    assumptions: string;
  };
  rejectedAlternatives: Array<{
    scenario: string;
    whyRejected: string;
    residualRisk: string;
  }>;
  whatToWatch: {
    signals: string[];
    whatWouldChangeMind: string;
    horizonCheck: string;
  };
  evidenceAssessment: {
    strongestLinks: string[];
    weakestLink: string;
    gaps: string[];
    sourceDiversity: string;
  };
  keyFindings: string[];
  _meta: {
    passes: number;
    frictionMap: FrictionMap;
    stressTestMap: StressTestMap;
    totalTokensUsed: number;
    totalCostUsd: number;
    producerFamily?: import('../llm/unified-llm').LLMFamily;
    pruning?: PruningResult;
  };
}

// Backward compatibility aliases
export type AnalysisOutput = Omit<ProspectiveNote, '_meta'>;
export type MultiPassAnalysis = ProspectiveNote;

// Legacy type aliases for consumers that still reference them
export type ThematicMap = FrictionMap;
export type ContradictionMap = StressTestMap;

// ============================================================================
// DOMAIN-AWARE CONTEXT
// ============================================================================

/**
 * Build domain-specific analytical guidance for all 3 passes.
 * Injects key concepts, frameworks, quality criteria, and seminal works
 * so the LLM knows the domain's standards and terminology.
 */
function buildDomainAnalystContext(domain?: string): string {
  if (!domain) return '';
  const kb = RESEARCHER_KBS[domain as DomainExpertise];
  const corpus = MULTI_DOMAIN_CORPUS[domain as DomainExpertise];
  if (!kb && !corpus) return '';

  const parts: string[] = ['\n═══ DOMAIN EXPERTISE ═══'];
  parts.push(`Domain: ${domain.toUpperCase()}`);

  if (kb) {
    if (kb.keyConcepts?.length) {
      parts.push(`Core concepts: ${kb.keyConcepts.slice(0, 6).map((c: any) => `${c.name} (${c.importance})`).join(', ')}`);
    }
    if (kb.frameworks?.length) {
      parts.push(`Analytical frameworks to apply:`);
      kb.frameworks.slice(0, 3).forEach((f: any) => {
        parts.push(`  • ${f.name}: ${f.description.slice(0, 120)}`);
      });
    }
    if (kb.knownBiases?.length) {
      parts.push(`Known biases in this domain: ${kb.knownBiases.slice(0, 3).join('; ')}`);
    }
    if (kb.standingQuestions?.length) {
      parts.push(`Standing debates: ${kb.standingQuestions.slice(0, 3).join('; ')}`);
    }
    if (kb.qualityCriteria) {
      const criteria = Object.entries(kb.qualityCriteria).slice(0, 4).map(([k, v]) => `${k}: ${v}`).join('; ');
      parts.push(`Quality criteria: ${criteria}`);
    }
  }

  if (corpus) {
    if (corpus.keyFrameworks?.length) {
      parts.push(`Key frameworks: ${corpus.keyFrameworks.join(', ')}`);
    }
    if (corpus.seminalWorks?.length) {
      parts.push(`Seminal works: ${corpus.seminalWorks.slice(0, 4).join('; ')}`);
    }
  }

  parts.push('Use this domain knowledge to contextualize findings and assess evidence quality.\n');
  return parts.join('\n');
}

// ============================================================================
// CONTEXT BUILDER
// ============================================================================

function buildSourceContext(sources: any[], readings?: any[]): string {
  // Adaptive tiered context: top sources get full treatment, rest get compact.
  // Tier scales with corpus size — 25% of sources get full context (min 20, max 40).
  // This ensures deep analysis of the best sources whether we have 40 or 200.
  const FULL_TIER = Math.max(20, Math.min(40, Math.ceil(sources.length * 0.25)));
  const COMPACT_ABSTRACT = 500; // Non-full-tier sources: abstract truncated to 500 chars

  return sources
    .map((s: any, i: number) => {
      const reading = readings?.find((r: any) => r.sourceId === s.id) ?? readings?.[i];
      const authors = (s.authors || [])
        .slice(0, 3)
        .map((a: any) => {
          if (!a || typeof a !== 'object') return null;
          const name = a.author?.name || a.name;
          return name ? String(name).trim() : null;
        })
        .filter((n: any): n is string => n !== null && n.length > 0) || [];

      const isFullTier = i < FULL_TIER;
      const abstract = (s.abstract || "").slice(0, isFullTier ? 3000 : COMPACT_ABSTRACT);
      const fullText = isFullTier ? (s.fullText || "").slice(0, 4000) : "";

      // Build context: full tier gets everything, compact tier gets title + abstract only
      let context = `[SRC-${i + 1}] ${s.provider.toUpperCase()} | Quality: ${s.qualityScore || 0}/100 | Citations: ${s.citationCount || 0}
Title: ${s.title}
Authors: ${authors.join(", ") || "N/A"}
Year: ${s.year || "N/A"}`;

      if (isFullTier && reading && reading.confidence !== 'low') {
        context += `
READER EXTRACTIONS:
  CLAIMS: ${reading.claims?.join(" | ") || "None"}
  METHODS: ${reading.methods?.join(" | ") || "None"}
  RESULTS: ${reading.results?.join(" | ") || "None"}
  LIMITATIONS: ${reading.limitations?.join(" | ") || "None"}
  CONFIDENCE: ${reading.confidence}`;
      }

      if (abstract) {
        context += `
${isFullTier ? 'ABSTRACT (full)' : 'ABSTRACT'}: ${abstract}`;
      }

      if (fullText && fullText.length > 200) {
        context += `
KEY TEXT EXCERPT: ${fullText}`;
      }

      return context;
    })
    .join("\n\n");
}

function detectLanguage(question: string): string {
  return question.match(/[àâäéèêëïîôùûüÿæœç]/i) ? 'FRENCH' : 'ENGLISH';
}

// ============================================================================
// PASS 1: FRICTION MAPPING
// ============================================================================

async function pass1FrictionMapping(
  question: string,
  ctx: string,
  sourceCount: number,
  domainContext?: string,
  depth?: "brief" | "strategic"
): Promise<{ map: FrictionMap; tokens: number; cost: number }> {
  console.log(`[Analyst V3] PASS 1/3: Friction Mapping (${sourceCount} sources, depth: ${depth ?? 'brief'})...`);

  const systemPrompt = `You are NomosX Analyst — Pass 1 of 3: FRICTION MAPPING.

${NOMOS_EDITORIAL_LINE_SHORT}

NOMOSX EDITORIAL DNA:
You are agnostic — even anarchistic. You are not afraid to shock, to draw
ambitious correlations that others dismiss. You detect the underlying
bullshit that conventional analysis papers over. You are revolutionary in
the best sense: you reason like Einstein, Marie Curie, Hobbes, the greatest
inventors, philosophers, economists, and scientists. Your goal is to
brilliant with every publication — to produce work worthy of a Pulitzer,
a Fields Medal, a Nobel Prize. You dig deeper, reason harder, and see
connections that specialists trapped in their silos cannot.

ANTI-NOVLANGUE RULE (Pillar 6 — non-negotiable):
You NEVER use euphemisms that mask violence or obscure accountability.
"Collateral damage" → "civilian deaths". "Optimization" → "layoffs".
"Enhanced interrogation" → "torture". "Responsible moderation" → "censorship".
"Reform" → name the actual policy change. "Modernization" → name what changes.
If a source uses a euphemism, you quote it WITH BRACKETS and immediately
provide the true name: "the report cites 'collateral damage' [i.e., civilian
deaths]". Precision of language is the first defense against tyranny of
thought. Name the thing by its true name. Always.

NomosX does not inventory sources. It isolates the strongest cross-domain
causal chain and extrapolates its trajectory toward a dated future.

YOUR TASK — PASS 1: Map the raw material for the causal chain.

Think step by step:
1. Read each source for MECHANISMS — not themes. A mechanism is a dynamic
   that produces an effect (e.g., "sanctions compress trade volume → displaced
   flows seek alternative channels").
2. Extract data points that ANCHOR mechanisms in fact (numbers, rates, trends).
3. Identify where domains COLLIDE — where a dynamic in one field produces
   effects in another that an expert of either field alone would miss.
4. Note active dynamics (growth rates, adoption curves, regulatory shifts)
   that have TRAJECTORY — things moving in a direction.
5. Flag sources that describe present facts vs. active mechanisms vs.
   projections already in the literature.

PRIORITIZE DYNAMIC MECHANISMS OVER STATIC FACTS.
A mechanism with a trajectory ("concentration is accelerating at X%/year")
is more valuable than a static fact ("the market is worth $40B"). Static
facts anchor, but dynamics drive extrapolation. Extract dynamics first,
then the facts that anchor them.

SOURCE DIVERSITY ANALYSIS (NomosX multi-provider corpus):
NomosX now draws from 100+ providers spanning diverse origin types. You MUST
recognize and weigh each source type differently:
- ACADEMIC (OpenAlex, Crossref, Semantic Scholar): peer-reviewed empirical rigor.
  Weight for methodological soundness, replicability, statistical significance.
- INTELLIGENCE (MI5, GCHQ, Europol, Interpol, Bellingcat): threat assessment,
  operational detail, classified-derived insights. Weight for threat dynamics
  but note threat-inflation bias and classification bias (you only see
  declassified fragments). National perspective bias: each agency frames
  through its government's priorities.
- NGO (Amnesty, HRW, Transparency International): ground truth, on-the-ground
  violations, field investigations. Weight for primary evidence of abuses but
  note advocacy-oriented framing — NGOs highlight violations by mission mandate.
- THINK TANK (Carnegie, Chatham House, IFRI, IRIS, Heritage, Cato): policy
  implications, strategic analysis. Weight for policy-relevant synthesis but
  note political orientation bias (Heritage=conservative, Cato=libertarian,
  CAP=progressive, Carnegie=centrist). Identify the orientation when citing.
- INTERNATIONAL ORG (WTO, ICC, UNHCR, ILO, UN agencies): official positions,
  treaty obligations, aggregated statistics. Weight for authoritative data
  and legal frameworks but note consensus-seeking bias — diplomatic language
  may downplay conflicts between member states.
- SCIENCE ORG (CERN, ESA, DARPA): technical breakthroughs, experimental results.
  Weight for technical accuracy and reproducibility.
- AI LAB (OpenAI, DeepMind, Anthropic): capability claims, safety research.
  Weight for technical insight but note commercial bias toward overstating
  capabilities and "safety theater" — labs may frame results to favor
  regulatory moats or demonstrate responsibility for market positioning.
- NEWS: timely reporting, event-driven. Weight for recency and factual events
  but verify against primary sources.

CROSS-CORROBORATION BETWEEN SOURCE TYPES (critical):
The strongest mechanisms are those corroborated by INDEPENDENT source types.
Explicitly look for:
- Does an ACADEMIC study confirm what an INTELLIGENCE report claims?
- Does an NGO field investigation corroborate a THINK TANK analysis?
- Does a SCIENCE ORG publication validate an AI LAB capability claim?
- Do INTERNATIONAL ORG statistics align with ACADEMIC findings?
When two or more source types independently converge on a finding, flag it
as CROSS-TYPE CORROBORATED — this is the highest-confidence evidence tier.
When source types DISAGREE (e.g., an AI lab claims a capability that academic
evaluations cannot reproduce), flag the conflict and note which type has
stronger methodological grounds for the claim.

INSTITUTIONAL BIAS AWARENESS:
When extracting mechanisms, note the source type's characteristic bias:
- Intelligence agencies may OVERSTATE threats (budget/mandate incentives).
- NGOs may FOCUS on violations (advocacy mission — absence of violation
  reporting does not mean absence of violations, but neither does presence
  prove systemic patterns without scale data).
- Think tanks may REFLECT political orientations in framing and emphasis.
- AI labs may OVERSTATE capabilities (commercial incentives) or OVERSTATE
  risks (regulatory capture incentives). Check if claims are benchmarked.
- International orgs may use DIPLOMATIC LANGUAGE that obscures disagreement.
Record these biases in the mechanism's trajectoryHint or dataPoints when
they materially affect the evidence weight.

CITATION RULES (NON-NEGOTIABLE):
- You have EXACTLY ${sourceCount} sources, numbered [SRC-1] through [SRC-${sourceCount}]. Do NOT cite [SRC-${sourceCount + 1}] or higher.
- Every dataPoint MUST end with [SRC-N] referencing the source it came from.
- A dataPoint without [SRC-N] is NOT a data point — it is an opinion.
- Do NOT extract numbers you cannot trace to a specific source.
- If a source mentions a number, extract it WITH the [SRC-N] tag.
- CITATION SPREAD: Extract dataPoints from as many different sources as possible. Aim to cite at least ${Math.ceil(sourceCount * 0.5)} distinct sources across all mechanisms. Do not over-rely on 3-4 sources — each source was selected for a reason. Go through sources systematically: [SRC-1], [SRC-2], ... and extract at least one dataPoint from each relevant source.

Return JSON:
{
  "mechanisms": [
    {
      "id": 1,
      "description": "What the mechanism is and what it does (2-3 sentences)",
      "domain": "Primary domain of this mechanism",
      "crossDomainEffects": "What effects in OTHER domains this mechanism produces — the friction point. Empty string if none found.",
      "sources": ["[SRC-1]", "[SRC-3]"],
      "dataPoints": ["specific number or finding from source"],
      "temporalStatus": "present_fact|active_mechanism",
      "trajectoryHint": "If this mechanism continues, where does it point? 1 sentence. Empty string if no trajectory."
    }
  ],
  "collisions": [
    {
      "domainA": "Domain 1",
      "domainB": "Domain 2",
      "friction": "What tension or non-obvious connection exists between these domains",
      "sources": ["[SRC-N]"],
      "surpriseFactor": "Why an expert in either domain alone would miss this (1 sentence)"
    }
  ],
  "dataLandscape": {
    "totalDataPoints": 0,
    "quantitativeFindings": ["finding with number and [SRC-N]"],
    "activeDynamics": ["dynamic with rate/direction and [SRC-N]"],
    "projectionsInLiterature": ["projection already made by a source, with [SRC-N]"]
  }
}

${depth === "strategic" ? `
DEPTH: STRATEGIC REPORT MODE.
- Extract more mechanisms (aim for 8-12 instead of 5-8).
- For each mechanism, provide richer dataPoints (3-5 instead of 1-2).
- Surface more collisions (aim for 4-6 instead of 2-3).
- Develop trajectoryHint into 2-3 sentences with direction and rate where available.
` : ""}
Select what SERVES the argument — do not exhaustively dump everything.`;

  const userPrompt = `RESEARCH QUESTION: "${question}"
${domainContext || ''}

SOURCES:
${ctx}`;

  const response = await callLLM({
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.1,
    jsonMode: true,
    maxTokens: depth === "strategic" ? 16000 : 8000,
    enableCache: true,
    task: 'analyst_brief',
  });

  const map = parseJson<FrictionMap>(response.content);
  if (!map) throw new SyntaxError('Analyst pass 1: failed to parse LLM JSON');
  console.log(`[Analyst V3] PASS 1 complete: ${map.mechanisms?.length || 0} mechanisms, ${map.collisions?.length || 0} collisions, ${map.dataLandscape?.totalDataPoints || 0} data points`);

  return {
    map,
    tokens: response.tokensInput + response.tokensOutput,
    cost: response.costUsd,
  };
}

// ============================================================================
// PASS 2: STRESS TEST
// ============================================================================

async function pass2StressTest(
  question: string,
  ctx: string,
  frictionMap: FrictionMap,
  domainContext?: string
): Promise<{ map: StressTestMap; tokens: number; cost: number }> {
  console.log(`[Analyst V3] PASS 2/3: Stress Test...`);

  const mechanismSummary = (frictionMap.mechanisms ?? [])
    .map(m => `MECHANISM #${m.id}: ${m.description} [${m.temporalStatus}] — Sources: ${(m.sources ?? []).join(", ")} — Trajectory: ${m.trajectoryHint || "none"}`)
    .join("\n");

  const collisionSummary = (frictionMap.collisions ?? [])
    .map(c => `COLLISION: ${c.domainA} × ${c.domainB} — ${c.friction} — Surprise: ${c.surpriseFactor}`)
    .join("\n");

  const systemPrompt = `You are NomosX Analyst — Pass 2 of 3: STRESS TEST.

${NOMOS_EDITORIAL_LINE_SHORT}

NOMOSX EDITORIAL DNA:
You are agnostic — even anarchistic. You detect the underlying bullshit
that conventional analysis papers over. You reason like Einstein, Marie
Curie, Hobbes — the greatest minds. Your goal is to produce work worthy
of a Pulitzer, a Fields Medal, a Nobel Prize. You dig deeper, reason
harder, and see connections that specialists trapped in their silos cannot.

You are adversarial. Your job is to BREAK every mechanism and collision from
Pass 1, not to summarize them. Only what survives your attack will enter the
final causal chain.

YOUR TASK — PASS 2:
1. For each mechanism: try to refute it. Would a hostile expert accept it?
   What is their strongest objection? Does it hold, crack, or break?
2. For each mechanism: can it support extrapolation? A mechanism that is
   real but static (no trajectory) cannot ground a future projection.
3. For each mechanism: trace the temporal chain — what present fact anchors
   it, what mechanism drives it, and what future does it project toward?
4. For each collision: is the cross-domain link causation, probable
   causation, or merely correlation? Be rigorous.
5. For each collision: does the surprise factor survive scrutiny?

PRIORITIZE CROSS-DOMAIN CONTRADICTIONS.
When two domains make claims that collide (e.g., economics says X, climate
science says not-X), that collision is more valuable than intra-domain
disagreement. Cross-domain contradictions reveal hidden assumptions that
neither field questions on its own. Surface them first and assess them
rigorously.

SOURCE-TYPE STRESS TESTING:
When evaluating whether a mechanism holds, cracks, or breaks, consider the
source TYPE behind each claim and its characteristic bias:
- Intelligence-sourced claims: may overstate threats. Does independent
  corroboration from academic or NGO sources exist?
- AI-lab capability claims: may be commercially inflated. Are they
  reproduced in peer-reviewed academic evaluations?
- Think-tank analyses: may reflect political orientation. Does a source
  from a different political orientation agree or disagree?
- NGO violation reports: advocacy-framed. Is the scale corroborated by
  international-org statistics or academic field studies?
A mechanism that rests on a SINGLE source type is weaker than one
corroborated across multiple independent source types. Factor this into
your verdict and into the hostileExpertObjection — the strongest hostile
objection often comes from a different source type's perspective.

Return JSON:
{
  "mechanismAssessments": [
    {
      "mechanismId": 1,
      "verdict": "holds|cracks|breaks",
      "reasoning": "Why it holds/cracks/breaks (2-3 sentences)",
      "canSupportExtrapolation": true,
      "hostileExpertObjection": "Strongest objection from a domain expert (1-2 sentences)",
      "temporalChain": {
        "anchoredIn": "The present fact that grounds this (with [SRC-N])",
        "mechanism": "The active dynamic (with [SRC-N])",
        "projectsTo": "What future state this points toward if it continues"
      }
    }
  ],
  "collisionAssessments": [
    {
      "domainA": "Domain 1",
      "domainB": "Domain 2",
      "causationOrCorrelation": "causation|probable_causation|correlation_only",
      "reasoning": "Why this is causation/correlation (2-3 sentences)",
      "surpriseVerified": true,
      "surpriseReasoning": "Does the surprise survive scrutiny? Why or why not?"
    }
  ],
  "survivingMechanisms": [1, 3],
  "strongestChain": {
    "presentFactIds": [1, 2],
    "mechanismIds": [3, 4],
    "projectedFuture": "The most defensible future state implied by the surviving chain"
  }
}

OUTPUT LIMITS:
- One assessment per mechanism, one per collision.
- Keep reasoning fields under 50 words each.
- Output ONLY the JSON object — no markdown, no prose.`;

  const userPrompt = `RESEARCH QUESTION: "${question}"
${domainContext || ''}

PASS 1 RESULTS: FRICTION MAP
MECHANISMS:
${mechanismSummary || "None extracted"}

COLLISIONS:
${collisionSummary || "None identified"}

ACTIVE DYNAMICS:
${frictionMap.dataLandscape?.activeDynamics?.slice(0, 10).join("\n") || "None"}

PROJECTIONS IN LITERATURE:
${frictionMap.dataLandscape?.projectionsInLiterature?.slice(0, 5).join("\n") || "None"}

DATA POINTS (for verification):
${(frictionMap.dataLandscape?.quantitativeFindings || []).slice(0, 15).join("\n") || "None"}`;

  const response = await callLLM({
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.15,
    jsonMode: true,
    maxTokens: 8000,
    enableCache: true,
    task: 'analyst_brief',
  });

  const map = parseJson<StressTestMap>(response.content);
  if (!map) throw new SyntaxError('Analyst pass 2: failed to parse LLM JSON');
  console.log(`[Analyst V3] PASS 2 complete: ${map.mechanismAssessments?.length || 0} assessments, ${map.survivingMechanisms?.length || 0} surviving`);

  return {
    map,
    tokens: response.tokensInput + response.tokensOutput,
    cost: response.costUsd,
  };
}

// ============================================================================
// PASS 3: PROSPECTIVE SYNTHESIS
// ============================================================================

async function pass3ProspectiveSynthesis(
  question: string,
  ctx: string,
  frictionMap: FrictionMap,
  stressTestMap: StressTestMap,
  sourceCount: number,
  avgQuality: number,
  lang: string,
  domainContext?: string,
  depth?: "brief" | "strategic"
): Promise<{ analysis: AnalysisOutput; tokens: number; cost: number; family: import('../llm/unified-llm').LLMFamily }> {
  console.log(`[Analyst V3] PASS 3/3: Prospective Synthesis (depth: ${depth ?? 'brief'})...`);

  const mechanismBrief = (frictionMap.mechanisms ?? [])
    .map(m => `MECHANISM #${m.id} [${m.temporalStatus}]: ${m.description}
  Domain: ${m.domain} | Cross-domain: ${m.crossDomainEffects || "none"}
  Sources: ${(m.sources ?? []).join(", ")}
  Data: ${(m.dataPoints ?? []).slice(0, 3).join("; ")}
  Trajectory: ${m.trajectoryHint || "none"}`)
    .join("\n\n");

  const stressBrief = (stressTestMap.mechanismAssessments ?? [])
    .map(a => `ASSESSMENT #${a.mechanismId}: ${a.verdict.toUpperCase()}
  Reasoning: ${a.reasoning}
  Can extrapolate: ${a.canSupportExtrapolation}
  Hostile objection: ${a.hostileExpertObjection}
  Chain: ${a.temporalChain.anchoredIn} -> ${a.temporalChain.mechanism} -> ${a.temporalChain.projectsTo}`)
    .join("\n\n");

  const collisionBrief = (stressTestMap.collisionAssessments ?? [])
    .map(c => `COLLISION: ${c.domainA} x ${c.domainB}
  Verdict: ${c.causationOrCorrelation}
  Reasoning: ${c.reasoning}
  Surprise verified: ${c.surpriseVerified} — ${c.surpriseReasoning}`)
    .join("\n\n");

  const systemPrompt = `You are NomosX Analyst — Pass 3 of 3: PROSPECTIVE SYNTHESIS.

You have mapped the mechanisms (Pass 1) and stress-tested them (Pass 2).
Now you build the argument and take a position.

${NOMOS_EDITORIAL_LINE_SHORT}

${depth === "strategic" ? `THINK TANK EDITORIAL STANDARDS (Chatham House / RAND / Brookings grade):
→ CAUSAL PRUDENCE: Never make causal jumps the evidence cannot support. Distinguish what the data SHOWS from what the literature INTERPRETS from what we ARGUE from what we PROJECT.
→ EPISTEMIC LADDER: Tag claims with their epistemic level — "The data demonstrates [X]" (proven), "The literature suggests [X]" (interpreted), "This analysis proposes [X]" (our contribution), "We project [X]" (future projection, framed as thought experiment NOT prediction).
→ NEUTRAL VOCABULARY: Describe, never accuse. Analyze, never advocate. No polemical titles.
→ KPI ARGUMENT REFRAMING: If discussing religious institutions and metrics/KPIs, frame as "translating normative objectives into measurable governance frameworks" NOT "religions becoming AI-governed organizations".
→ CENTRE OF GRAVITY: The deepest question is NOT "will religious institutions influence AI?" but "Can a universal AI governance framework exist without imposing a particular conception of what a human being is?" Religious institutions are ONE of several actors, not THE actor.
→ CONCLUSION SUBTLETY: The verdict should acknowledge that "the question is not whether religion will influence AI governance, but whether global AI governance will have the institutional mechanisms necessary to recognize competing conceptions of human dignity, knowledge and agency."
→ CAUSAL ARCHITECTURE: For each major causal claim, identify (1) the causal chain, (2) confidence level, (3) what would falsify it, (4) alternative explanation. This is the NomosX method for causal transparency.` : ""}

NOMOSX IDENTITY:
You are agnostic — even anarchistic. You are not afraid to shock, to draw
ambitious correlations that others dismiss. You detect the underlying
bullshit that conventional analysis papers over. You are revolutionary in
the best sense: you reason like Einstein, Marie Curie, Hobbes, the greatest
inventors, philosophers, economists, and scientists. Your goal is to
brilliant with every publication — to produce work worthy of a Pulitzer,
a Fields Medal, a Nobel Prize. You dig deeper, reason harder, and see
connections that specialists trapped in their silos cannot.

NomosX is a prospective think tank. It does not summarize what is known.
It isolates the strongest causal chain, extrapolates its trajectory, and
takes ONE assertive position — sober, dense, assured, falsifiable.

VOICE:
- Sober, dense, assured. No marketing superlatives. No false precision.
- No "however" hedging after every claim. State the claim, then the
  conditions under which it would be wrong.
- Explicit falsifiability: every projection must name what would disprove it.
- No "experts say" or "researchers believe" — name the mechanism, not the
  consensus.
- BANNED PHRASES: "delves into", "sheds light on", "plays a crucial role",
  "it is worth noting", "in today's world", "a testament to", "myriad",
  "plethora", "tapestry", "landscape of", "navigates the", "underscores".
- PREFERRED: precise verbs (analyzes, reveals, examines, isolates),
  concrete numbers with [SRC-N], mechanism-first explanations.
- Position-first: lead with the conclusion, then justify. Not the reverse.

PROSE STRUCTURE RULE (Chatham House / RUSI / ECFR standard — NON-NEGOTIABLE):
- BANNED: "First, ... Second, ... Third, ..." enumeration in prose. This is a
  student essay, not a think tank report. If you have 3 points, weave them
  into analytical prose with transition phrases, not a numbered list.
  BAD: "First, climate models show X [SRC-1]. Second, phenology shifts Y [SRC-2]. Third, adaptation limits Z [SRC-3]."
  GOOD: "Climate models consistently show X [SRC-1], a pattern reinforced by observed phenology shifts Y [SRC-2]. These trends converge toward Z [SRC-3], though adaptation limits remain."
- BANNED: Starting paragraphs with "It is important to note that..." or
  "It should be emphasized that..." — start with the FINDING, not the setup.
- BANNED: "This paper examines..." or "This report explores..." — the reader
  already knows what the report is about.
- REQUIRED: Start each paragraph with the FINDING or the CLAIM, not the setup.
- REQUIRED: Vary sentence structure. Mix short declarative findings with
  longer analytical sentences. Never write 3 consecutive sentences with the
  same structure.
- REQUIRED: Use transition phrases that show analytical logic:
  "This pattern is reinforced by..." / "A competing interpretation suggests..." /
  "A key conditioning factor appears to be..." / "What distinguishes this case from..." /
  "The evidence suggests that..." / "Against this backdrop..." / "Yet the data also reveal..."
- REQUIRED: Write in the INSTITUTIONAL VOICE — "This analysis proposes..." /
  "The evidence indicates..." / "The central finding is that..." — never "I think"
  or "we feel" or "it seems to me"
- REQUIRED: CAUSAL PRUDENCE — distinguish between:
  • ASSOCIATION (what the data shows) — use "is associated with", "correlates with", "tends to coincide with"
  • MECHANISM (what the literature proposes) — use "appears to transmit through", "may operate via"
  • CAUSATION (only when identified by the source) — use "the study identifies a causal effect", "the authors establish causation"
  Never write "X is the critical variable" or "X determines Y" unless the cited source explicitly makes that causal claim.
  Prefer: "X appears to be a critical conditioning factor" / "The evidence suggests X strongly conditions Y" / "X may play a mediating role"

ANTI-HALLUCINATION RULES (NON-NEGOTIABLE — violations cause grounding veto):
- EVIDENCE-FIRST ORDERING: For each causalChain link, FIRST identify which [SRC-N]
  contains the evidence, THEN write the claim using that source's own vocabulary.
  Do NOT write a claim first and bolt on a citation afterward — this is the #1
  cause of ungrounded claims. Read the source, extract the fact, write it close
  to the original wording, cite [SRC-N]. This is not optional.
- Every number, percentage, or quantitative claim MUST be a present_fact
  with a [SRC-N] citation. No invented numbers.
- If you cannot find a number in any source, DO NOT invent one. Use
  "non établie" instead. An absent datum is a fact about the research,
  not about the subject.
- NUMBERS WITHOUT [SRC-N] WILL BE DELETED by the citation repair system.
  This is not a warning — it is a deterministic code execution. If you
  write "attacks increased by 300%" without [SRC-N], the reader will see
  "attacks increased by non établie". Cite or do not use numbers.
- SOURCE-CLAIM MAPPING: Before writing any claim, identify which [SRC-N]
  it comes from. If a claim does not map to a specific source, it is
  opinion, not evidence. Do not include it as a factual claim.
- future_extrapolation claims MUST derive from an active_mechanism or
  present_fact via an explicit warrant. No free-floating predictions.
- A future_extrapolation CANNOT derive from another future_extrapolation.
  (No cascade extrapolations — derivesFrom must point to a present_fact
  or active_mechanism, never to another future_extrapolation.)
- The warrant field must name the MECHANISM that connects evidence to claim.
  "Because the data shows X" is not a warrant. "Because mechanism Y
  compresses margin, which forces consolidation" is a warrant.

EVIDENCE-FIRST METHODOLOGY (CRITICAL FOR QUALITY):
- BUILD FROM SOURCES, NOT FROM GENERAL KNOWLEDGE. Every factual claim in
  your analysis must be traceable to specific text in the source abstracts
  and full-text excerpts provided above. If a source says "transformers process tokens
  through self-attention layers [SRC-3]", your claim should echo that language:
  "Self-attention layers in transformers process tokens sequentially [SRC-3]".
- PARAPHRASE CLOSELY. Do not restate in completely different words — the
  grounding system checks for lexical overlap between your claims and source
  text. If the source says "adversarial perturbations exploit high-dimensional
  input spaces", write "adversarial perturbations exploit high-dimensional
  input spaces [SRC-5]" — not "attackers use sophisticated methods to fool
  models [SRC-5]". Close paraphrase is not plagiarism in analysis — it is
  evidence of grounding.
- QUOTE KEY DATA POINTS VERBATIM. When a source provides a specific statistic,
  finding, or conclusion, reproduce it closely with [SRC-N]. The reader needs
  to see that your claim comes from the source, not from your imagination.
- BEFORE EACH CAUSAL CHAIN LINK: Read the source context for [SRC-N] and
  write the claim using the source's own vocabulary. If the source discusses
  "autoregressive decoding vulnerabilities", use that exact phrase in your
  claim — do not replace it with "sequential generation weaknesses".
- STRUCTURE: For each causalChain link, the "evidence" field should contain
  a near-verbatim quote or close paraphrase from the cited source, not a
  summary in your own words. This is what makes the chain grounded.

EPISTEMIC HUMILITY RULES (to survive Devil's Advocate):
- In the "evidenceAssessment.gaps" field, explicitly acknowledge what you
  DON'T know — missing data, untested assumptions, regional blind spots.
- In the "verdict" field, after stating the position, include a paragraph
  that qualifies the confidence level and names the key uncertainties.
- If the source base is geographically skewed (e.g., mostly US studies for
  a European question), acknowledge this mismatch in evidenceAssessment.sourceDiversity.
- If there are regional variations (e.g., Nordic surplus vs. Iberian deficit),
  name them explicitly in the trajectory or rejectedAlternatives.

CAUSAL CHAIN STRUCTURE:
Build a causal chain with as many CausalLinks as the evidence supports.
Do NOT fabricate links to reach a target length — if evidence supports only
3 links, produce 3 links. The chain must flow:
  present_fact -> present_fact -> active_mechanism -> active_mechanism -> future_extrapolation -> future_extrapolation
Each link's derivesFrom must point to a prior link's id. The first links
are present_facts (derivesFrom: null), then active_mechanisms, then
future_extrapolations. A future_extrapolation's derivesFrom must NEVER
point to another future_extrapolation — only to a present_fact or
active_mechanism.

Return JSON:
{
  "title": "Neutral, analytical title UNDER 100 characters. NO partisan framing, NO loaded language. Describe the TOPIC and KEY FINDING objectively. BANNED words: cartel, conspiracy, crisis, threat, war, battle, weapon, scheme, plot. Example: 'AI Governance and Religious Pluralism: Ontological Politics and Policy Implications' NOT 'The Vatican's Algorithm: How Religion Will Control AI'.",
  "throughLine": "The single sentence that captures the entire argument. One sentence, max 40 words.",
  "verdict": "${depth === "strategic" ? "400-700" : "200-400"} words. The institute's position. State it first, then justify with the causal chain. Cite [SRC-N] for every factual anchor. State the position confidently but with causal prudence — use 'the evidence indicates', 'the central finding is that', NOT 'X is the critical variable' or 'X determines Y' unless the source explicitly establishes causation. Then qualify.",
  "convictionLevel": "firm|tempered|causal_only",
  "anchoringBasis": "${depth === "strategic" ? "200-400" : "100-200"} words. What grounds this analysis — the strongest present facts and the data behind them. With [SRC-N].",
  "causalChain": [
    {
      "id": 1,
      "claim": "The specific claim this link makes. MUST include [SRC-N] citation for any factual assertion.",
      "evidence": "The data or observation supporting this claim. MUST include at least one [SRC-N] citation. Example: 'Data center electricity demand doubled 2022-2024 [SRC-7]'.",
      "warrant": "The MECHANISM that connects evidence to claim. Must name a dynamic, not just restate the data.",
      "temporalStatus": "present_fact|active_mechanism|future_extrapolation",
      "derivesFrom": null,
      "sourceRef": "The [SRC-N] number that primarily supports this link. Required for every link."
    }
  ],
  "trajectory": {
    "horizon": "e.g., '2025-2028' or 'next 36 months'",
    "state": "${depth === "strategic" ? "300-500" : "200-300"} words. Describe the projected future state if the causal chain holds. Be specific — named actors, quantified shifts, structural changes.",
    "assumptions": "${depth === "strategic" ? "150-300" : "100-200"} words. What must remain true for this trajectory to hold. Be explicit."
  },
  "rejectedAlternatives": [
    {
      "scenario": "An alternative future that was considered",
      "whyRejected": "Why the evidence does not support this scenario (2-3 sentences)",
      "residualRisk": "What risk remains if this scenario is wrong"
    }
  ],
  "whatToWatch": {
    "signals": ["Observable indicators that would confirm or challenge the trajectory"],
    "whatWouldChangeMind": "100-200 words. Specific falsifiable triggers that would reverse the position.",
    "horizonCheck": "When should this projection be revisited? What date?"
  },
  "evidenceAssessment": {
    "strongestLinks": ["Which causal chain links are strongest and why"],
    "weakestLink": "The weakest link in the chain and why",
    "gaps": ["What evidence is missing that would strengthen the argument"],
    "sourceDiversity": "Assessment of cross-domain AND cross-source-type coverage. Explicitly note which source TYPES are present (academic, intelligence, NGO, think-tank, international-org, science-org, ai-lab, news) and which agree vs. disagree. Identify cross-type corroboration (e.g., 'academic [SRC-3] confirms intelligence [SRC-7] threat assessment') and cross-type conflicts (e.g., 'AI lab [SRC-12] capability claim not reproduced in academic [SRC-18] evaluation'). Note institutional biases that may skew the evidence base."
  },
  "keyFindings": ["5 key findings, each 1-2 sentences. Each MUST include at least one [SRC-N] citation."]
}

LANGUAGE: Write in ${lang}.
MINIMUM ${depth === "strategic" ? "5000" : "2500"} WORDS TOTAL across all text fields. Depth and substance are non-negotiable. For strategic reports, produce comprehensive analysis across all fields — the verdict, anchoringBasis, causalChain, trajectory, rejectedAlternatives, whatToWatch, evidenceAssessment, and keyFindings should each be substantial. Do not abbreviate or summarize — develop each section fully.
Output ONLY the JSON object — no markdown, no prose before or after.

CITATION RULES (NON-NEGOTIABLE):
- You have EXACTLY ${sourceCount} sources, numbered [SRC-1] through [SRC-${sourceCount}].
- Any citation with N > ${sourceCount} or N < 1 is INVALID and will be DELETED by the system.
- Do NOT use [SRC-${sourceCount + 1}] or higher — they do not exist. This is the #1 cause of rejected reports.
- Every factual claim, number, or data point MUST have a [SRC-N] citation where 1 ≤ N ≤ ${sourceCount}.
- The "evidence" field of every causalChain link MUST contain at least one [SRC-N].
- The "verdict" field MUST cite [SRC-N] for every factual anchor.
- The "keyFindings" array: each finding MUST include [SRC-N].
- A claim without [SRC-N] is not evidence — it is opinion. The Devil's Advocate will reject uncited claims.
- future_extrapolation claims cite the present_fact or active_mechanism they derive from, not new sources.
- CITATION DIVERSITY (HARD REQUIREMENT): You have ${sourceCount} sources. You MUST cite at least ${Math.ceil(sourceCount * 0.5)} different [SRC-N] sources across the analysis. Do not cluster on 3-4 sources — spread citations across the full source base.
- CRITICAL ENFORCEMENT: Before outputting JSON, extract all [SRC-N] tags from your draft, convert to a Set, and check the size. If below ${Math.ceil(sourceCount * 0.5)}, you MUST go back and add citations from uncited sources to relevant claims. Reports with fewer than ${Math.ceil(sourceCount * 0.5)} distinct citations WILL BE REJECTED and discarded.
- CITATION SPREADING STRATEGY: Group your sources by theme (e.g., sources 1-20 for mechanisms, 21-40 for stakeholders, 41-60 for outcomes, etc.). Ensure each theme section cites from its relevant source group. This guarantees broad coverage.`;

  const userPrompt = `RESEARCH QUESTION: "${question}"
${domainContext || ''}

PASS 1 RESULTS: FRICTION MAP
${mechanismBrief}

COLLISIONS:
${(frictionMap.collisions ?? []).map(c => `${c.domainA} x ${c.domainB}: ${c.friction}`).join("\n") || "None"}

PASS 2 RESULTS: STRESS TEST
${stressBrief}

COLLISION ASSESSMENTS:
${collisionBrief || "None assessed"}

SURVIVING MECHANISMS: ${(stressTestMap.survivingMechanisms ?? []).join(", ") || "none"}
STRONGEST CHAIN: ${stressTestMap.strongestChain?.projectedFuture || "not identified"}

RAW SOURCES (for citation verification):
${ctx}

YOUR MISSION:
Using the structured intelligence from Passes 1-2, produce the prospective note.
You have ${sourceCount} sources (avg quality: ${avgQuality}/100).
Build the causal chain from the surviving mechanisms. Take ONE position.`;

  const response = await callLLM({
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.2,
    jsonMode: true,
    maxTokens: depth === "strategic" ? 16000 : 8000,
    enableCache: true,
    task: depth === "strategic" ? 'strategic_analyst' : 'analyst_brief',
  });

  const analysis = parseJson<AnalysisOutput>(response.content);
  if (!analysis) throw new SyntaxError('Analyst pass 3: failed to parse LLM JSON');
  console.log(`[Analyst V3] PASS 3 complete: prospective synthesis generated`);

  return {
    analysis,
    tokens: response.tokensInput + response.tokensOutput,
    cost: response.costUsd,
    family: response.family,
  };
}

// ============================================================================
// INTER-PASS VALIDATION — Ground-truth check
// ============================================================================

/**
 * Validate Pass 1 friction map against source reality:
 * 1. All [SRC-N] references must be 1 ≤ N ≤ sourceCount
 * 2. Mechanisms with zero valid citations are removed (likely hallucinated)
 * 3. Invalid references in valid mechanisms are stripped
 * 4. Cascade guard: future_extrapolation cannot derive from another future_extrapolation
 */
function validateFrictionMap(
  map: FrictionMap,
  sourceCount: number
): { map: FrictionMap; removedMechanisms: number; details: string } {
  const srcPattern = /\[SRC-(\d+)\]/g;
  let removedMechanisms = 0;
  const removedIds: string[] = [];

  function filterValidRefs(refs: string[]): string[] {
    return refs.filter(ref => {
      const matches = [...ref.matchAll(srcPattern)];
      if (matches.length === 0) return true;
      return matches.every(m => {
        const n = parseInt(m[1], 10);
        return n >= 1 && n <= sourceCount;
      });
    });
  }

  const validatedMechanisms = (map.mechanisms || []).filter(mech => {
    const validSources = filterValidRefs(mech.sources || []);
    if (validSources.length === 0 && (mech.sources || []).length > 0) {
      removedMechanisms++;
      removedIds.push(`#${mech.id}`);
      return false;
    }
    mech.sources = validSources;
    mech.dataPoints = filterValidRefs(mech.dataPoints || []);
    return true;
  });

  // Validate data landscape
  if (map.dataLandscape) {
    map.dataLandscape.quantitativeFindings = filterValidRefs(map.dataLandscape.quantitativeFindings || []);
    map.dataLandscape.activeDynamics = filterValidRefs(map.dataLandscape.activeDynamics || []);
    map.dataLandscape.projectionsInLiterature = filterValidRefs(map.dataLandscape.projectionsInLiterature || []);
  }

  // Validate collisions
  if (map.collisions) {
    for (const c of map.collisions) {
      c.sources = filterValidRefs(c.sources || []);
    }
  }

  return {
    map: { ...map, mechanisms: validatedMechanisms },
    removedMechanisms,
    details: removedIds.length > 0 ? removedIds.join(', ') : 'none',
  };
}

/**
 * Validate Pass 3 causal chain for cascade violations:
 * A future_extrapolation's derivesFrom must NOT point to another future_extrapolation.
 */
function validateCausalChain(
  analysis: AnalysisOutput
): { valid: boolean; cascadeViolations: number; details: string } {
  const chain = analysis.causalChain || [];
  let violations = 0;
  const violationDetails: string[] = [];

  for (const link of chain) {
    if (link.temporalStatus === 'future_extrapolation' && link.derivesFrom != null) {
      const parent = chain.find(l => l.id === link.derivesFrom);
      if (parent && parent.temporalStatus === 'future_extrapolation') {
        violations++;
        violationDetails.push(`Link #${link.id} derives from future_extrapolation #${parent.id}`);
      }
    }
  }

  return {
    valid: violations === 0,
    cascadeViolations: violations,
    details: violationDetails.length > 0 ? violationDetails.join('; ') : 'none',
  };
}

/**
 * Sanitize all [SRC-N] citations in the analysis JSON.
 * Removes any [SRC-N] where N < 1 or N > sourceCount.
 * Also fixes causalChain.sourceRef numbers that are out of range.
 * This is deterministic — no LLM in the loop.
 */
function sanitizeAnalysisCitations(
  analysis: AnalysisOutput,
  sourceCount: number
): AnalysisOutput {
  const srcPattern = /\[SRC-(\d+)\]/g;
  let totalRemoved = 0;

  function sanitizeString(s: string): string {
    if (typeof s !== 'string') return s;
    const result = s.replace(srcPattern, (match, n) => {
      const num = parseInt(n, 10);
      if (num >= 1 && num <= sourceCount) {
        return match; // Keep valid citation
      }
      totalRemoved++;
      return ''; // Remove invalid citation
    });
    // Clean up double spaces left by removal
    return result.replace(/\s+\s+/g, ' ').replace(/\s+([.,;:])/g, '$1').trim();
  }

  function sanitizeObject(obj: any): any {
    if (typeof obj === 'string') return sanitizeString(obj);
    if (Array.isArray(obj)) return obj.map(sanitizeObject);
    if (obj && typeof obj === 'object') {
      const result: any = {};
      for (const key of Object.keys(obj)) {
        if (key === 'sourceRef' && typeof obj[key] === 'number') {
          if (obj[key] < 1 || obj[key] > sourceCount) {
            totalRemoved++;
            result[key] = null; // Null out invalid sourceRef
          } else {
            result[key] = obj[key];
          }
        } else {
          result[key] = sanitizeObject(obj[key]);
        }
      }
      return result;
    }
    return obj;
  }

  const sanitized = sanitizeObject(analysis) as AnalysisOutput;

  if (totalRemoved > 0) {
    console.warn(`[Analyst V3] CITATION SANITIZATION: removed ${totalRemoved} out-of-range [SRC-N] citations (source count: ${sourceCount})`);
  }

  return sanitized;
}

/**
 * Strip student-essay enumeration markers from prose fields.
 * Removes "First, ", "Second, ", "Third, ", "Fourth, ", "Fifth, ",
 * "Finally, " when they appear at the start of a sentence OR mid-sentence
 * after a colon/semicolon (common in DeepSeek output).
 * This is a deterministic post-processing step — the LLM prompt bans
 * this pattern but DeepSeek/GPT still produce it.
 */
function stripEssayEnumerations(analysis: any): void {
  // Match "First, " / "Second, " etc. at sentence start or after : ; —
  const essayMarkers = /\b(First|Second|Third|Fourth|Fifth|Finally|Lastly),\s+/gi;
  let stripped = 0;

  function cleanString(s: string): string {
    return s.replace(essayMarkers, (match, _word, offset) => {
      if (offset === 0) { stripped++; return ''; }
      // Look backwards past citations [SRC-N] and whitespace to find the real previous char
      let i = offset - 1;
      while (i >= 0) {
        const ch = s[i];
        if (ch === ' ' || ch === '\n' || ch === '\t') { i--; continue; }
        // Skip [SRC-N] citations
        if (ch === ']') {
          const bracketStart = s.lastIndexOf('[', i);
          if (bracketStart >= 0 && /\[SRC-\d+\]/.test(s.substring(bracketStart, i + 1))) {
            i = bracketStart - 1;
            continue;
          }
        }
        // Found the real previous character
        if (ch === '.' || ch === '!' || ch === '?' || ch === ':' ||
            ch === ';' || ch === '—' || ch === '–') {
          stripped++;
          return '';
        }
        return match; // Previous char is a letter/comma — not a sentence boundary
      }
      stripped++;
      return ''; // Start of string
    });
  }

  function cleanObject(obj: any): any {
    if (typeof obj === 'string') return cleanString(obj);
    if (Array.isArray(obj)) return obj.map(cleanObject);
    if (obj && typeof obj === 'object') {
      for (const key of Object.keys(obj)) {
        obj[key] = cleanObject(obj[key]);
      }
    }
    return obj;
  }

  cleanObject(analysis);
  if (stripped > 0) {
    console.log(`[Analyst V3] PROSE FIX: stripped ${stripped} essay enumeration markers (First/Second/Third...)`);
  }
}

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

export async function analystAgentV3(
  question: string,
  sources: any[],
  readings?: any[],
  options?: { contextBlock?: string; domain?: string; depth?: "brief" | "strategic" }
): Promise<MultiPassAnalysis> {
  assertPermission(AgentRole.ANALYST, "write:analysis");

  const startTime = Date.now();
  const avgQuality = Math.round(sources.reduce((sum, s) => sum + (s.qualityScore || 0), 0) / Math.max(sources.length, 1));
  const lang = detectLanguage(question);
  let ctx = buildSourceContext(sources, readings);

  if (options?.contextBlock) {
    ctx = `${options.contextBlock}\n\n${ctx}`;
    console.log(`[Analyst V3] Institutional memory injected (${options.contextBlock.length} chars)`);
  }

  console.log(`[Analyst V3] Starting 3-pass prospective analysis: ${sources.length} sources, avg quality ${avgQuality}/100`);

  try {
    const domainContext = buildDomainAnalystContext(options?.domain);
    if (options?.domain) console.log(`[Analyst V3] Domain-aware mode: ${options.domain}`);

    const depth = options?.depth ?? "brief";

    // PASS 1: Friction Mapping
    const p1 = await pass1FrictionMapping(question, ctx, sources.length, domainContext, depth);

    // INTER-PASS VALIDATION: Ground-truth check on Pass 1 output
    const validatedMap = validateFrictionMap(p1.map, sources.length);
    if (validatedMap.removedMechanisms > 0) {
      console.warn(`[Analyst V3] VALIDATION: removed ${validatedMap.removedMechanisms} mechanisms with invalid citations (${validatedMap.details})`);
    }

    // PASS 2: Stress Test (uses validated Pass 1 output)
    let p2: { map: StressTestMap; tokens: number; cost: number };
    try {
      p2 = await pass2StressTest(question, ctx, validatedMap.map, domainContext);
    } catch (pass2Err) {
      console.warn(`[Analyst V3] PASS 2 failed, continuing with empty stress test map:`, pass2Err);
      p2 = {
        map: { mechanismAssessments: [], collisionAssessments: [], survivingMechanisms: [], strongestChain: { presentFactIds: [], mechanismIds: [], projectedFuture: '' } },
        tokens: 0,
        cost: 0,
      };
    }

    // PASS 3: Prospective Synthesis (uses Pass 1 + Pass 2 outputs)
    const p3 = await pass3ProspectiveSynthesis(question, ctx, p1.map, p2.map, sources.length, avgQuality, lang, domainContext, depth);

    // CITATION SANITIZATION: Strip all out-of-range [SRC-N] from analysis JSON.
    // The LLM (deepseek-v4-flash) hallucinates citations beyond the source count.
    // This is deterministic — no LLM in the loop.
    const sanitizedAnalysis = sanitizeAnalysisCitations(p3.analysis, sources.length);

    // CITATION COVERAGE AUDIT: log how many distinct sources were cited.
    // No retry — DeepSeek-v4-flash can't cite more even with stronger prompts
    // (tested: 10/135 → 10/135 on retry). Instead, deterministic citation
    // injection happens downstream in the pipeline (citation-repair module).
    const minDistinctCitations = Math.ceil(sources.length * 0.5);
    function countDistinctCitations(obj: any): Set<number> {
      const distinct = new Set<number>();
      function walk(o: any) {
        if (typeof o === 'string') {
          for (const m of o.matchAll(/\[SRC-(\d+)\]/g)) {
            const n = parseInt(m[1], 10);
            if (n >= 1 && n <= sources.length) distinct.add(n);
          }
        } else if (Array.isArray(o)) {
          o.forEach(walk);
        } else if (o && typeof o === 'object') {
          Object.values(o).forEach(walk);
        }
      }
      walk(obj);
      return distinct;
    }
    const citedCount = countDistinctCitations(sanitizedAnalysis).size;
    if (citedCount < minDistinctCitations) {
      console.warn(`[Analyst V3] CITATION COVERAGE LOW: ${citedCount}/${sources.length} distinct sources cited (target: ${minDistinctCitations}). Deterministic citation injection will run downstream.`);
    }
    console.log(`[Analyst V3] CITATION COVERAGE: ${citedCount}/${sources.length} distinct sources cited`);

    // PRUNING GATES: Deterministic post-generation quality assurance.
    // Gates PRUNE, never BLOCK. Invalid content is removed before render.
    // Trust propagates through the DAG: weak parents reduce confidence in children.
    const pruningResult = runAllPruningGates(sanitizedAnalysis, sources.length);

    // Apply pruned chain back to analysis
    const prunedAnalysis: AnalysisOutput = {
      ...sanitizedAnalysis,
      causalChain: pruningResult.prunedChain,
    };

    // Apply hedging strip to verdict (deterministic, no LLM)
    if (prunedAnalysis.verdict) {
      const hedgeResult = gateHedgingStrip(prunedAnalysis.verdict);
      if (hedgeResult.modified) {
        console.warn(`[Analyst V3] HEDGING GATE: stripped ${hedgeResult.hedgeCount} hedge phrases from verdict`);
        prunedAnalysis.verdict = hedgeResult.cleaned;
      }
    }

    // Log pruning results
    if (pruningResult.removed.length > 0) {
      console.warn(`[Analyst V3] PRUNING GATES: removed ${pruningResult.removed.length} links — ${pruningResult.removed.map(r => `#${r.link.id}(${r.gate})`).join(', ')}`);
    }
    if (pruningResult.warnings.length > 0) {
      pruningResult.warnings.forEach(w => console.warn(`[Analyst V3] GATE WARNING: ${w}`));
    }
    console.log(`[Analyst V3] Trust propagation: overall=${pruningResult.overallTrust}, chain=${pruningResult.prunedChain.length}/${sanitizedAnalysis.causalChain?.length || 0} links survived`);

    // Backward-compatible cascade validation (extended, not replaced)
    const chainValidation = validateCausalChain(prunedAnalysis);
    if (!chainValidation.valid) {
      console.warn(`[Analyst V3] CASCADE GUARD (post-pruning): ${chainValidation.cascadeViolations} violations (${chainValidation.details})`);
    }

    const totalTokens = p1.tokens + p2.tokens + p3.tokens;
    const totalCost = p1.cost + p2.cost + p3.cost;
    const elapsed = Date.now() - startTime;

    console.log(`[Analyst V3] Complete in ${elapsed}ms | 3 passes | ${totalTokens} tokens | $${totalCost.toFixed(4)} | cascade violations: ${chainValidation.cascadeViolations}`);

    // Validate required fields
    const analysis = prunedAnalysis;
    const required: (keyof AnalysisOutput)[] = ['title', 'throughLine', 'verdict', 'causalChain'];
    const missing = required.filter((k) => {
      const val = analysis[k];
      if (k === 'causalChain') return !val || !Array.isArray(val) || val.length === 0;
      return !val || (typeof val === 'string' && !val.trim());
    });

    if (missing.length > 0) {
      console.warn(`[Analyst V3] Missing fields: ${missing.join(', ')}. Returning partial analysis.`);
    }

    // ── SELF-REFINE: Auto-evaluate and refine the analysis (Self-Refine pattern) ──
    // The agent critiques its own output and refines weak sections before returning.
    // Only triggers if there are quality issues (low citation coverage or missing fields).
    let refinedAnalysis = analysis;
    if ((citedCount < minDistinctCitations || missing.length > 0) && !isStrategicDepth(depth)) {
      try {
        console.log(`[Analyst V3] SELF-REFINE: auto-evaluating analysis for improvement`);
        const refinement = await selfRefineAnalysis(analysis, question, sources.length, citedCount, missing);
        if (refinement.improved) {
          refinedAnalysis = { ...analysis, ...refinement.analysis };
          console.log(`[Analyst V3] SELF-REFINE: applied ${refinement.changes.length} improvements: ${refinement.changes.join('; ')}`);
        }
      } catch (refineErr) {
        console.warn(`[Analyst V3] SELF-REFINE: failed (non-blocking):`, refineErr);
      }
    }

    // Deterministic prose fix: strip "First, / Second, / Third, ..." essay markers
    stripEssayEnumerations(refinedAnalysis);

    return {
      ...analysis,
      _meta: {
        passes: 3,
        frictionMap: p1.map,
        stressTestMap: p2.map,
        totalTokensUsed: totalTokens,
        totalCostUsd: totalCost,
        producerFamily: p3.family,
        pruning: pruningResult,
      },
    };
  } catch (error: any) {
    console.error(`[Analyst V3] Failed: ${error.message}`);

    return {
      title: "Analysis Failed",
      throughLine: `Error: ${error.message}`,
      verdict: `Error: ${error.message}`,
      convictionLevel: "causal_only",
      anchoringBasis: "",
      causalChain: [],
      trajectory: { horizon: "", state: "", assumptions: "" },
      rejectedAlternatives: [],
      whatToWatch: { signals: [], whatWouldChangeMind: "", horizonCheck: "" },
      evidenceAssessment: { strongestLinks: [], weakestLink: "", gaps: [], sourceDiversity: "" },
      keyFindings: [],
      _meta: {
        passes: 0,
        frictionMap: { mechanisms: [], collisions: [], dataLandscape: { totalDataPoints: 0, quantitativeFindings: [], activeDynamics: [], projectionsInLiterature: [] } },
        stressTestMap: { mechanismAssessments: [], collisionAssessments: [], survivingMechanisms: [], strongestChain: { presentFactIds: [], mechanismIds: [], projectedFuture: '' } },
        totalTokensUsed: 0,
        totalCostUsd: 0,
      },
    };
  }
}

// ============================================================================
// SELF-REFINE — Auto-evaluate and refine analysis (Self-Refine pattern, 2023)
// ============================================================================

function isStrategicDepth(depth: string): boolean {
  return depth === 'strategic';
}

/**
 * Self-evaluate the analysis and generate improvements.
 * Inspired by Self-Refine (2023): FEEDBACK → REFINE → FEEDBACK loop.
 *
 * The agent critiques its own output on:
 * - Citation coverage (are enough sources cited?)
 * - Missing fields (are required fields populated?)
 * - Claim specificity (are claims concrete or vague?)
 * - Evidence linking (are claims tied to sources?)
 */
async function selfRefineAnalysis(
  analysis: AnalysisOutput,
  question: string,
  sourceCount: number,
  citedCount: number,
  missingFields: string[]
): Promise<{ improved: boolean; analysis: Partial<AnalysisOutput>; changes: string[] }> {
  const issues: string[] = [];
  if (citedCount < sourceCount * 0.5) {
    issues.push(`Citation coverage is low: ${citedCount}/${sourceCount} sources cited. Add more [SRC-N] references to claims.`);
  }
  if (missingFields.length > 0) {
    issues.push(`Missing required fields: ${missingFields.join(', ')}. Populate them.`);
  }

  if (issues.length === 0) {
    return { improved: false, analysis: {}, changes: [] };
  }

  const result = await callLLM({
    messages: [
      {
        role: "system",
        content: `You are a self-refinement engine. Given an analysis with identified issues, generate targeted fixes. Return ONLY the fields that need updating, in JSON format. Do not rewrite the entire analysis.`,
      },
      {
        role: "user",
        content: `QUESTION: "${question.slice(0, 200)}"
SOURCE COUNT: ${sourceCount}
CITED COUNT: ${citedCount}

ISSUES TO FIX:
${issues.map((i, idx) => `${idx + 1}. ${i}`).join('\n')}

CURRENT ANALYSIS (excerpt):
${JSON.stringify(analysis).slice(0, 3000)}

Return JSON with the fields that need fixing:
{
  "verdict": "improved verdict if needed",
  "throughLine": "improved throughLine if needed",
  "keyFindings": ["improved finding 1", ...],
  "changes": ["change 1 description", "change 2 description"]
}

Rules:
- Only include fields that actually need fixing
- Add [SRC-N] citations to any new claims
- Be specific and concrete, not vague
- Keep changes surgical — don't rewrite everything`,
      },
    ],
    temperature: 0.2,
    maxTokens: 2000,
    jsonMode: true,
    task: 'topic_classification',
  });

  try {
    const parsed = parseJson<any>(result.content);
    if (!parsed) return { improved: false, analysis: {}, changes: [] };

    const changes = parsed.changes || [];
    const refinedFields: Partial<AnalysisOutput> = {};

    // Validation helper: reject garbled text from the LLM.
    // Checks for: concatenated words without spaces (e.g., "thatmirrored"),
    // text shorter than 80% of original (degradation), or empty strings.
    const isGarbled = (text: string): boolean => {
      if (!text || text.trim().length < 20) return true;
      // Detect concatenated words: a lowercase letter directly followed by
      // an uppercase letter, or a word >25 chars (likely two words jammed together)
      if (/[a-z][A-Z]/.test(text)) return true;
      const words = text.split(/\s+/);
      if (words.some(w => w.length > 25 && /[a-z]/.test(w))) return true;
      return false;
    };

    if (parsed.verdict && !isGarbled(parsed.verdict) &&
        (!analysis.verdict || parsed.verdict.length >= analysis.verdict.length * 0.8)) {
      refinedFields.verdict = parsed.verdict;
    }
    if (parsed.throughLine && !isGarbled(parsed.throughLine) &&
        (!analysis.throughLine || parsed.throughLine.length >= analysis.throughLine.length * 0.8)) {
      refinedFields.throughLine = parsed.throughLine;
    }
    if (parsed.keyFindings && Array.isArray(parsed.keyFindings)) {
      const cleanFindings = parsed.keyFindings.filter((f: any) => typeof f === 'string' && !isGarbled(f));
      if (cleanFindings.length > 0) refinedFields.keyFindings = cleanFindings;
    }

    // Only report improvement if at least one field passed validation
    if (Object.keys(refinedFields).length === 0) {
      return { improved: false, analysis: {}, changes: [] };
    }

    return { improved: true, analysis: refinedFields, changes };
  } catch {
    return { improved: false, analysis: {}, changes: [] };
  }
}
