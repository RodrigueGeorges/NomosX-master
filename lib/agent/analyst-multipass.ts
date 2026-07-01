/**
 * ANALYST Agent V3 — Multi-Pass Deep Analysis
 * 
 * Instead of a single LLM call, this agent performs 3 sequential passes:
 * 
 * PASS 1 — THEMATIC MAPPING: Identify themes, group sources, extract data points
 * PASS 2 — CONTRADICTION DETECTION: Find conflicts, assess evidence strength, rank claims
 * PASS 3 — SYNTHESIS: Produce final analysis using structured insights from passes 1-2
 * 
 * This mimics how a PhD researcher actually works:
 * 1. First read and categorize all sources
 * 2. Then compare and find contradictions
 * 3. Finally synthesize into a coherent argument
 */

import { callLLM } from '../llm/unified-llm';
import { parseJson } from './json-utils';
// import Sentry from '@sentry/nextjs'; // Commenté pour éviter l'erreur TypeScript
import { AgentRole, assertPermission } from '../governance/index';
import { RESEARCHER_KBS, type DomainExpertise } from './researcher-kb/index';
import { MULTI_DOMAIN_CORPUS } from '../knowledge/multi-domain-corpus';

// ============================================================================
// TYPES
// ============================================================================

export interface ThematicMap {
  themes: Array<{
    name: string;
    description: string;
    sources: string[];           // [SRC-N] references
    dataPoints: string[];        // Specific numbers, percentages, effect sizes
    methodologies: string[];     // Methods used by sources in this theme
    confidence: "high" | "medium" | "low";
  }>;
  methodologyBreakdown: {
    rct: string[];               // Sources using RCTs
    quasiExperimental: string[];
    observational: string[];
    qualitative: string[];
    theoretical: string[];
    metaAnalysis: string[];
  };
  dataLandscape: {
    totalDataPoints: number;
    quantitativeFindings: string[];
    qualitativeFindings: string[];
    sampleSizes: Array<{ source: string; n: string; population: string }>;
  };
}

export interface ContradictionMap {
  contradictions: Array<{
    claim1: { text: string; sources: string[]; strength: "strong" | "moderate" | "weak" };
    claim2: { text: string; sources: string[]; strength: "strong" | "moderate" | "weak" };
    explanation: string;         // WHY they disagree
    resolution: string;          // How to reconcile
    winner: "claim1" | "claim2" | "inconclusive";
    winnerReasoning: string;
  }>;
  consensusPoints: Array<{
    claim: string;
    sources: string[];
    strength: "unanimous" | "strong_majority" | "majority" | "slight_majority";
    evidenceQuality: "high" | "medium" | "low";
  }>;
  evidenceHierarchy: Array<{
    source: string;
    methodRigor: number;         // 1-10
    sampleAdequacy: number;      // 1-10
    replicability: number;       // 1-10
    overallWeight: number;       // 1-10
    reasoning: string;
  }>;
}

export interface MultiPassAnalysis {
  title: string;
  summary: string;
  consensus: string;
  disagreements: string;
  debate: {
    pro: string;
    con: string;
    synthesis: string;
  };
  evidence: string;
  implications: string;
  risks: string;
  open_questions: string;
  what_changes_mind: string;
  // V3 additions
  _meta: {
    passes: number;
    thematicMap: ThematicMap;
    contradictionMap: ContradictionMap;
    totalTokensUsed: number;
    totalCostUsd: number;
    /** LLM family that produced the final synthesis (Pass 3) — used for opposite-family verification rule */
    producerFamily?: import('../llm/unified-llm').LLMFamily;
  };
}

// Re-export for backward compatibility
export type AnalysisOutput = Omit<MultiPassAnalysis, '_meta'>;

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
  return sources
    .map((s: any, i: number) => {
      const reading = readings?.[i];
      const authors = (s.authors || [])
        .slice(0, 3)
        .map((a: any) => {
          if (!a || typeof a !== 'object') return null;
          const name = a.author?.name || a.name;
          return name ? String(name).trim() : null;
        })
        .filter((n: any): n is string => n !== null && n.length > 0) || [];

      return `[SRC-${i + 1}] ${s.provider.toUpperCase()} | Quality: ${s.qualityScore || 0}/100 | Citations: ${s.citationCount || 0}
Title: ${s.title}
Authors: ${authors.join(", ") || "N/A"}
Year: ${s.year || "N/A"}
${reading && reading.confidence !== 'low' ? `CLAIMS: ${reading.claims?.join(" | ") || "None"}
METHODS: ${reading.methods?.join(" | ") || "None"}
RESULTS: ${reading.results?.join(" | ") || "None"}
LIMITATIONS: ${reading.limitations?.join(" | ") || "None"}
CONFIDENCE: ${reading.confidence}` : `ABSTRACT: ${(s.abstract || "").slice(0, 600)}...`}`;
    })
    .join("\n\n");
}

function detectLanguage(question: string): string {
  return question.match(/[àâäéèêëïîôùûüÿæœç]/i) ? 'FRENCH' : 'ENGLISH';
}

// ============================================================================
// PASS 1: THEMATIC MAPPING
// ============================================================================

async function pass1ThematicMapping(
  question: string,
  ctx: string,
  sourceCount: number,
  domainContext?: string
): Promise<{ map: ThematicMap; tokens: number; cost: number }> {
  console.log(`[Analyst V3] PASS 1/3: Thematic Mapping (${sourceCount} sources)...`);

  const prompt = `You are a senior research analyst performing THEMATIC MAPPING of academic sources.

RESEARCH QUESTION: "${question}"
${domainContext || ''}

SOURCES:
${ctx}

YOUR TASK — PASS 1 of 3: Identify and map all themes, data points, and methodologies.

Think step by step:
1. Read each source carefully
2. Identify recurring themes across sources
3. Extract ALL specific data points (numbers, percentages, effect sizes, p-values)
4. Categorize methodologies used
5. Note sample sizes and populations

Return JSON:
{
  "themes": [
    {
      "name": "Theme name",
      "description": "What this theme covers (2-3 sentences)",
      "sources": ["[SRC-1]", "[SRC-3]"],
      "dataPoints": ["specific number or finding from source"],
      "methodologies": ["RCT", "survey", etc.],
      "confidence": "high|medium|low"
    }
  ],
  "methodologyBreakdown": {
    "rct": ["[SRC-N]"],
    "quasiExperimental": ["[SRC-N]"],
    "observational": ["[SRC-N]"],
    "qualitative": ["[SRC-N]"],
    "theoretical": ["[SRC-N]"],
    "metaAnalysis": ["[SRC-N]"]
  },
  "dataLandscape": {
    "totalDataPoints": 0,
    "quantitativeFindings": ["finding with number and [SRC-N]"],
    "qualitativeFindings": ["finding and [SRC-N]"],
    "sampleSizes": [{"source": "[SRC-N]", "n": "sample size", "population": "who was studied"}]
  }
}

Be EXHAUSTIVE. Extract EVERY data point. Miss nothing.`;

  const response = await callLLM({
    messages: [{ role: "user", content: prompt }],
    temperature: 0.1,
    jsonMode: true,
    maxTokens: 4000,
    enableCache: true,
    task: 'analyst_brief',
  });

  const map = parseJson<ThematicMap>(response.content);
  if (!map) throw new SyntaxError('Analyst pass 1: failed to parse LLM JSON');
  console.log(`[Analyst V3] PASS 1 complete: ${map.themes?.length || 0} themes, ${map.dataLandscape?.totalDataPoints || 0} data points`);

  return {
    map,
    tokens: response.tokensInput + response.tokensOutput,
    cost: response.costUsd,
  };
}

// ============================================================================
// PASS 2: CONTRADICTION DETECTION
// ============================================================================

async function pass2ContradictionDetection(
  question: string,
  ctx: string,
  thematicMap: ThematicMap,
  domainContext?: string
): Promise<{ map: ContradictionMap; tokens: number; cost: number }> {
  console.log(`[Analyst V3] PASS 2/3: Contradiction Detection...`);

  const themeSummary = thematicMap.themes
    .map(t => `• ${t.name}: ${t.sources.join(", ")} — ${t.dataPoints.slice(0, 2).join("; ")}`)
    .join("\n");

  const prompt = `You are a senior research analyst performing CONTRADICTION DETECTION.

RESEARCH QUESTION: "${question}"
${domainContext || ''}

THEMATIC MAP FROM PASS 1:
${themeSummary}

METHODOLOGY BREAKDOWN:
${JSON.stringify(thematicMap.methodologyBreakdown, null, 2)}

DATA POINTS:
${thematicMap.dataLandscape.quantitativeFindings?.slice(0, 15).join("\n") || "None extracted"}

SOURCES:
${ctx}

YOUR TASK — PASS 2 of 3: Find ALL contradictions, build consensus map, rank evidence.

Think step by step:
1. Compare claims ACROSS themes — do any sources contradict each other?
2. For each contradiction, determine WHY (different methods? populations? timeframes?)
3. Assess which side has stronger evidence (methodology rigor, sample size, replication)
4. Identify points of CONSENSUS (what do most/all sources agree on?)
5. Rank each source by evidence weight

Return JSON:
{
  "contradictions": [
    {
      "claim1": {"text": "claim text", "sources": ["[SRC-N]"], "strength": "strong|moderate|weak"},
      "claim2": {"text": "opposing claim", "sources": ["[SRC-N]"], "strength": "strong|moderate|weak"},
      "explanation": "WHY they disagree (methods? population? timing?)",
      "resolution": "How to reconcile these findings",
      "winner": "claim1|claim2|inconclusive",
      "winnerReasoning": "Why this claim has stronger evidence"
    }
  ],
  "consensusPoints": [
    {
      "claim": "What sources agree on",
      "sources": ["[SRC-1]", "[SRC-2]"],
      "strength": "unanimous|strong_majority|majority|slight_majority",
      "evidenceQuality": "high|medium|low"
    }
  ],
  "evidenceHierarchy": [
    {
      "source": "[SRC-N]",
      "methodRigor": 8,
      "sampleAdequacy": 7,
      "replicability": 6,
      "overallWeight": 7,
      "reasoning": "Why this source is ranked here"
    }
  ]
}

Be ADVERSARIAL. Actively look for conflicts. A good analyst finds what others miss.`;

  const response = await callLLM({
    messages: [{ role: "user", content: prompt }],
    temperature: 0.15,
    jsonMode: true,
    maxTokens: 4000,
    enableCache: true,
    task: 'analyst_brief',
  });

  const map = parseJson<ContradictionMap>(response.content);
  if (!map) throw new SyntaxError('Analyst pass 2: failed to parse LLM JSON');
  console.log(`[Analyst V3] PASS 2 complete: ${map.contradictions?.length || 0} contradictions, ${map.consensusPoints?.length || 0} consensus points`);

  return {
    map,
    tokens: response.tokensInput + response.tokensOutput,
    cost: response.costUsd,
  };
}

// ============================================================================
// PASS 3: DEEP SYNTHESIS
// ============================================================================

async function pass3Synthesis(
  question: string,
  ctx: string,
  thematicMap: ThematicMap,
  contradictionMap: ContradictionMap,
  sourceCount: number,
  avgQuality: number,
  lang: string,
  domainContext?: string
): Promise<{ analysis: AnalysisOutput; tokens: number; cost: number; family: import('../llm/unified-llm').LLMFamily }> {
  console.log(`[Analyst V3] PASS 3/3: Deep Synthesis...`);

  // Build structured intelligence brief from passes 1-2
  const themeBrief = thematicMap.themes
    .map(t => `THEME: ${t.name} (${t.confidence} confidence)
  Sources: ${t.sources.join(", ")}
  Key data: ${t.dataPoints.slice(0, 3).join("; ")}
  Methods: ${t.methodologies.join(", ")}`)
    .join("\n\n");

  const contradictionBrief = contradictionMap.contradictions
    .map(c => `CONTRADICTION:
  Claim A (${c.claim1.strength}): ${c.claim1.text} — ${c.claim1.sources.join(", ")}
  Claim B (${c.claim2.strength}): ${c.claim2.text} — ${c.claim2.sources.join(", ")}
  Why: ${c.explanation}
  Winner: ${c.winner} — ${c.winnerReasoning}`)
    .join("\n\n");

  const consensusBrief = contradictionMap.consensusPoints
    .map(c => `CONSENSUS (${c.strength}, ${c.evidenceQuality} evidence): ${c.claim} — ${c.sources.join(", ")}`)
    .join("\n");

  const evidenceRanking = contradictionMap.evidenceHierarchy
    ?.sort((a, b) => b.overallWeight - a.overallWeight)
    .slice(0, 10)
    .map(e => `${e.source}: weight ${e.overallWeight}/10 — ${e.reasoning}`)
    .join("\n") || "No ranking available";

  const prompt = `You are NomosX Analyst V3 — Elite strategic intelligence analyst.
You have completed 2 analytical passes and now must produce the FINAL SYNTHESIS.

RESEARCH QUESTION: "${question}"
${domainContext || ''}

═══ PASS 1 RESULTS: THEMATIC MAP ═══
${themeBrief}

Quantitative findings: ${thematicMap.dataLandscape?.quantitativeFindings?.slice(0, 10).join("; ") || "None"}
Sample sizes: ${thematicMap.dataLandscape?.sampleSizes?.map(s => `${s.source}: n=${s.n} (${s.population})`).join("; ") || "None"}

═══ PASS 2 RESULTS: CONTRADICTIONS & CONSENSUS ═══
${contradictionBrief || "No contradictions found"}

CONSENSUS POINTS:
${consensusBrief || "No consensus identified"}

EVIDENCE HIERARCHY:
${evidenceRanking}

═══ RAW SOURCES (for citation verification) ═══
${ctx}

═══ YOUR MISSION ═══
Using the structured intelligence from Passes 1-2, produce the DEFINITIVE analysis.
You have ${sourceCount} sources (avg quality: ${avgQuality}/100).

CRITICAL RULES:
1. LEVERAGE Pass 1-2 insights — don't re-analyze from scratch
2. Every claim MUST cite [SRC-N]
3. Use the EVIDENCE HIERARCHY to weight claims (higher-ranked sources = more weight)
4. Address EVERY contradiction found in Pass 2
5. Build on CONSENSUS points with specific data
6. Be SPECIFIC: numbers, effect sizes, sample sizes, p-values
7. Provide ACTIONABLE implications grounded in evidence strength
8. Quantify uncertainty explicitly
9. **MINIMUM 2500 WORDS TOTAL across all sections.** Each major section (consensus, disagreements, debate, evidence, implications, risks) must be 250-400 words. Summary must be 200-300 words. This is a professional think tank brief — depth and substance are non-negotiable.

Return JSON:
{
  "title": "Neutral, analytical title — NO partisan framing, NO loaded language, NO editorializing. Think tank standard: describe the TOPIC and KEY FINDING, not a position. Example: 'Military Intervention in Iran: Strategic Implications and Evidence Assessment' NOT 'On the U.S.-Israeli War in Iran'.",
  "summary": "200-300 words. Executive summary: direct answer + confidence level + key quantitative findings + main insight + policy relevance. All with [SRC-*].",
  "consensus": "250-400 words. What sources agree on. Use consensus points from Pass 2. Cite strength of agreement, evidence quality, sample sizes, and effect sizes. Distinguish strong vs weak consensus. All with [SRC-*].",
  "disagreements": "250-400 words. Address EVERY contradiction from Pass 2. Explain WHY researchers disagree (methodology, scope, ideology, data). Cite evidence hierarchy. All with [SRC-*].",
  "debate": {
    "pro": "200-300 words. Strongest position with evidence hierarchy weighting. Cite specific data, methods, effect sizes, confidence intervals. [SRC-*].",
    "con": "200-300 words. Counter-position with evidence. Use contradictions from Pass 2. Steel-man the opposing view. [SRC-*].",
    "synthesis": "200-300 words. Reconciliation using thematic map + contradiction resolution. Nuanced position with conditions under which each side is right. [SRC-*]."
  },
  "evidence": "250-400 words. Critical assessment using evidence hierarchy from Pass 2. Methodology breakdown from Pass 1. Sample sizes. Replication status. Potential biases. CEBM evidence levels. [SRC-*].",
  "implications": "250-400 words. Actionable recommendations weighted by evidence strength. Immediate (0-6 months) + medium (6-24 months) + long term (2-5 years). Include stakeholder-specific guidance. [SRC-*].",
  "risks": "200-300 words. Limitations, generalizability constraints, evidence gaps, uncertainty quantification. What we DON'T know. [SRC-*].",
  "open_questions": "150-200 words. Research gaps identified across all 3 passes. Specific studies needed.",
  "what_changes_mind": "100-150 words. Specific falsifiable predictions. Evidence thresholds that would reverse conclusions."
}

LANGUAGE: Write in ${lang}.
QUALITY: This is the final output for senior decision-makers. Intellectual rigor is paramount.`;

  const response = await callLLM({
    messages: [{ role: "user", content: prompt }],
    temperature: 0.2,
    jsonMode: true,
    maxTokens: 12000,
    enableCache: true,
    task: 'analyst_brief',
  });

  const analysis = parseJson<AnalysisOutput>(response.content);
  if (!analysis) throw new SyntaxError('Analyst pass 3: failed to parse LLM JSON');
  console.log(`[Analyst V3] PASS 3 complete: synthesis generated`);

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
 * Validate Pass 1 thematic map against source reality:
 * 1. All [SRC-N] references must be 1 ≤ N ≤ sourceCount
 * 2. Themes with zero valid citations are removed (likely hallucinated)
 * 3. Invalid references in valid themes are stripped
 */
function validateThematicMap(
  map: ThematicMap,
  sourceCount: number
): { map: ThematicMap; removedThemes: number; details: string } {
  const srcPattern = /\[SRC-(\d+)\]/g;
  let removedThemes = 0;
  const removedNames: string[] = [];

  function filterValidRefs(refs: string[]): string[] {
    return refs.filter(ref => {
      const matches = [...ref.matchAll(srcPattern)];
      if (matches.length === 0) return true; // Keep non-citation strings
      return matches.every(m => {
        const n = parseInt(m[1], 10);
        return n >= 1 && n <= sourceCount;
      });
    });
  }

  const validatedThemes = (map.themes || []).filter(theme => {
    const validSources = filterValidRefs(theme.sources || []);
    if (validSources.length === 0 && (theme.sources || []).length > 0) {
      // Theme had citations but ALL were invalid → likely hallucinated
      removedThemes++;
      removedNames.push(theme.name);
      return false;
    }
    theme.sources = validSources;
    theme.dataPoints = filterValidRefs(theme.dataPoints || []);
    return true;
  });

  // Validate methodology breakdown
  const mb = map.methodologyBreakdown;
  if (mb) {
    for (const key of Object.keys(mb) as Array<keyof typeof mb>) {
      mb[key] = filterValidRefs(mb[key] || []);
    }
  }

  // Validate data landscape
  if (map.dataLandscape) {
    map.dataLandscape.quantitativeFindings = filterValidRefs(map.dataLandscape.quantitativeFindings || []);
    map.dataLandscape.qualitativeFindings = filterValidRefs(map.dataLandscape.qualitativeFindings || []);
  }

  return {
    map: { ...map, themes: validatedThemes },
    removedThemes,
    details: removedNames.length > 0 ? removedNames.join(', ') : 'none',
  };
}

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

export async function analystAgentV3(
  question: string,
  sources: any[],
  readings?: any[],
  options?: { contextBlock?: string; domain?: string }
): Promise<MultiPassAnalysis> {
  assertPermission(AgentRole.ANALYST, "write:analysis");

  const startTime = Date.now();
  const avgQuality = Math.round(sources.reduce((sum, s) => sum + (s.qualityScore || 0), 0) / Math.max(sources.length, 1));
  const lang = detectLanguage(question);
  let ctx = buildSourceContext(sources, readings);

  // Inject institutional memory from Context Primer (if available)
  if (options?.contextBlock) {
    ctx = `${options.contextBlock}\n\n${ctx}`;
    console.log(`[Analyst V3] Institutional memory injected (${options.contextBlock.length} chars)`);
  }

  console.log(`[Analyst V3] Starting 3-pass analysis: ${sources.length} sources, avg quality ${avgQuality}/100`);

  try {
    const domainContext = buildDomainAnalystContext(options?.domain);
    if (options?.domain) console.log(`[Analyst V3] Domain-aware mode: ${options.domain}`);

    // PASS 1: Thematic Mapping
    const p1 = await pass1ThematicMapping(question, ctx, sources.length, domainContext);

    // INTER-PASS VALIDATION: Ground-truth check on Pass 1 output
    // Prevents hallucinated themes from propagating to Pass 2 and Pass 3
    const validatedMap = validateThematicMap(p1.map, sources.length);
    if (validatedMap.removedThemes > 0) {
      console.warn(`[Analyst V3] VALIDATION: removed ${validatedMap.removedThemes} themes with invalid citations (${validatedMap.details})`);
    }

    // PASS 2: Contradiction Detection (uses validated Pass 1 output)
    const p2 = await pass2ContradictionDetection(question, ctx, validatedMap.map, domainContext);

    // PASS 3: Deep Synthesis (uses Pass 1 + Pass 2 outputs)
    const p3 = await pass3Synthesis(question, ctx, p1.map, p2.map, sources.length, avgQuality, lang, domainContext);

    const totalTokens = p1.tokens + p2.tokens + p3.tokens;
    const totalCost = p1.cost + p2.cost + p3.cost;
    const elapsed = Date.now() - startTime;

    console.log(`[Analyst V3] Complete in ${elapsed}ms | 3 passes | ${totalTokens} tokens | $${totalCost.toFixed(4)}`);

    // Validate required fields
    const analysis = p3.analysis;
    const required: (keyof AnalysisOutput)[] = ['title', 'summary', 'consensus', 'debate'];
    const missing = required.filter((k) => {
      const val = analysis[k];
      if (k === 'debate') return !val || typeof val !== 'object' || !(val as any).pro || !(val as any).con;
      return !val || (typeof val === 'string' && !val.trim());
    });

    if (missing.length > 0) {
      console.warn(`[Analyst V3] Missing fields: ${missing.join(', ')}. Returning partial analysis.`);
    }

    return {
      ...analysis,
      _meta: {
        passes: 3,
        thematicMap: p1.map,
        contradictionMap: p2.map,
        totalTokensUsed: totalTokens,
        totalCostUsd: totalCost,
        producerFamily: p3.family,
      },
    };
  } catch (error: any) {
    console.error(`[Analyst V3] Failed: ${error.message}`);

    // Sentry.captureException(error, {
    //   tags: { agent: "analyst-v3", question, sourceCount: sources.length },
    //   contexts: { analyst: { question, sourceCount: sources.length, avgQuality } },
    // });

    return {
      title: "Analysis Failed",
      summary: `Error: ${error.message}`,
      consensus: "",
      disagreements: "",
      debate: { pro: "", con: "", synthesis: "" },
      evidence: "",
      implications: "",
      risks: "",
      open_questions: "",
      what_changes_mind: "",
      _meta: {
        passes: 0,
        thematicMap: { themes: [], methodologyBreakdown: { rct: [], quasiExperimental: [], observational: [], qualitative: [], theoretical: [], metaAnalysis: [] }, dataLandscape: { totalDataPoints: 0, quantitativeFindings: [], qualitativeFindings: [], sampleSizes: [] } },
        contradictionMap: { contradictions: [], consensusPoints: [], evidenceHierarchy: [] },
        totalTokensUsed: 0,
        totalCostUsd: 0,
      },
    };
  }
}
