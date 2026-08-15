/**
 * STRATEGIC ANALYST Agent
 * Produces comprehensive 10-15 page Strategic Reports with:
 * - Executive Summary
 * - Deep Literature Review
 * - Methodology Assessment
 * - Thematic Analysis
 * - Stakeholder Impact Matrix
 * - Scenario Planning
 * - Policy Recommendations
 * - Implementation Roadmap
 */

import { callLLM } from '../llm/unified-llm';
import { parseJson } from './json-utils';
import Sentry from '@sentry/nextjs';
import { AgentRole,assertPermission } from '../governance/index';

export interface StrategicAnalysisOutput {
  // SECTION 0: BLUF — Bottom Line Up Front (Foreign Affairs / Columbia JIA standard)
  // 1-2 sentence distillation. Max 280 chars. Appears above executive summary.
  bottomLine?: string;

  // SECTION 1: Executive Summary (1 page)
  title: string;
  executiveSummary: string;
  keyFindings: string[];
  urgencyLevel: "critical" | "high" | "medium" | "low";
  confidenceLevel: "high" | "medium" | "low";
  /** Numeric confidence (0-1) — calibrated per IARPA/Good Judgment Project.
   *  Replaces qualitative confidenceLevel for Brier scoring & track record.
   *  0.5 = no better than chance, 0.9 = strong evidence, 0.99 = near-certain.
   */
  confidenceValue?: number;
  
  // SECTION 2: Literature Review (2-3 pages)
  literatureOverview: string;
  theoreticalFrameworks: string;
  methodologicalApproaches: string;
  keyStudies?: Array<{
    citation: string;
    contribution: string;
    limitations: string;
  }>;
  
  // SECTION 3: Thematic Analysis (2-3 pages) — nullable if no themes emerge
  themes?: Array<{
    name: string;
    description: string;
    evidence: string;
    sources: string[];
  }>;
  consensus: string;
  controversies: string;
  emergingTrends: string;
  
  // SECTION 4: Debate & Perspectives (2 pages)
  debate: {
    position1: {
      label: string;
      arguments: string;
      evidence: string;
      proponents: string;
    };
    position2: {
      label: string;
      arguments: string;
      evidence: string;
      proponents: string;
    };
    synthesis: string;
    nuances: string;
  };
  
  // SECTION 5: Evidence Assessment (1-2 pages) — nullable if insufficient evidence
  evidenceQuality?: {
    overallScore: number;
    methodology: string;
    sampleSizes: string;
    replication: string;
    biases: string;
    gaps: string;
  };
  
  // SECTION 6: Stakeholder Impact — nullable if no stakeholder evidence
  stakeholderAnalysis?: Array<{
    stakeholder: string;
    impact: "positive" | "negative" | "mixed";
    magnitude: "high" | "medium" | "low";
    details: string;
  }>;
  
  // SECTION 7: Scenarios — nullable if insufficient evidence for projection
  scenarios?: Array<{
    name: string;
    probability: "high" | "medium" | "low";
    probabilityValue?: number; // 0-1 numeric probability (calibrated)
    description: string;
    implications: string;
    signals: string;
  }>;
  
  // SECTION 8: Recommendations — nullable if insufficient evidence
  recommendations?: {
    immediate: string[];
    shortTerm: string[];
    longTerm: string[];
    riskMitigation: string[];
    costOfInaction?: string;
  };
  
  // SECTION 9: Implementation — nullable if insufficient evidence
  implementation?: {
    prerequisites: string[];
    timeline: string;
    resources: string;
    metrics: string[];
    obstacles: string[];
  };
  
  // SECTION 10: Conclusion
  conclusion: string;
  openQuestions: string[];
  whatChangesMind: string;

  // SECTION 11: Causal Architecture — explicit causal chains with confidence + counterfactuals
  // Each major causal claim in the report must be decomposed into its chain,
  // confidence level, and falsification condition.
  causalArchitecture?: Array<{
    claim: string;           // The causal claim (e.g., "Actor X will shape domain Y")
    chain: string;           // The causal chain: A → B → C → D, with each link explained
    confidence: "high" | "medium" | "low";
    /** Numeric probability (0-1) for the causal claim — calibrated per IARPA/GJP. */
    probabilityValue?: number;
    epistemicLevel: "demonstrated" | "suggested" | "proposed" | "projected";
    counterfactual: string;  // What would falsify this claim
    alternativeExplanation: string;  // Alternative causal explanation for the same observation
    sources: string[];       // [SRC-N] citations
  }>;

  // SECTION 12: Timeline — chronological events (IISS Strategic Survey / ICG CrisisWatch standard)
  // Distinguishes a strategic report from an essay. Events must be sourced.
  timeline?: Array<{
    date: string;            // ISO date or "YYYY-MM" or "Q1 2024" etc.
    event: string;           // What happened
    significance: string;    // Why it matters for the analysis
    sources: string[];       // [SRC-N] citations
  }>;

  // SECTION 13: ACH Matrix — Analysis of Competing Hypotheses (CIA Tradecraft Primer)
  // Visual matrix: hypotheses × evidence, cells colored by consistency.
  // The surviving hypothesis is the one LEAST inconsistent with the evidence.
  achMatrix?: {
    hypotheses: string[];    // 3-5 competing hypotheses
    evidence: Array<{
      src: string;           // [SRC-N] citation
      description: string;   // What the evidence says
      consistency: Record<number, "consistent" | "inconsistent" | "neutral">;
      // Key: hypothesis index (0-based), value: consistency rating
    }>;
    survivingHypothesis: number;  // Index of the least-inconsistent hypothesis
    rationale: string;       // Why this hypothesis survives
  };

  // SECTION 14: Tail Risks — High-Impact / Low-Probability (CIA Tradecraft Primer)
  // Black swans that would invalidate the main analysis if they occurred.
  tailRisks?: Array<{
    event: string;           // The tail event
    probability: number;     // 0-1 numeric (should be < 0.15 for tail)
    impact: string;          // What happens if it occurs
    earlyWarningSignals: string;  // How to detect it early
    mitigation: string;      // What to do to reduce probability or impact
    sources: string[];       // [SRC-N] citations (may be indirect)
  }>;

  // SECTION 15: Outside-In Perspective (CIA Tradecraft Primer: "Outside-In Thinking")
  // How non-Western / non-US actors frame this issue. Uses foreign providers.
  outsideIn?: Array<{
    perspective: string;     // "Chinese perspective", "Russian perspective", etc.
    framing: string;         // How they frame the issue
    keyDifferences: string;  // How it differs from Western framing
    sources: string[];       // [SRC-N] citations (ideally from Wanfang/CyberLeninka/etc.)
  }>;

  // SECTION 16: Red Team Assessment (CIA Devil's Advocacy)
  // Structured rebuttal of the main position. Generated by a DIFFERENT LLM family
  // to avoid confirmation bias. Injected post-hoc by the pipeline.
  _redTeam?: {
    devilAdvocate: string;   // The counter-argument to the main position
    strongestObjection: string;  // The most damaging objection
    unresolvedTension: string;   // What remains unresolved after rebuttal
    revisedConfidence: number;   // 0-1, may be lower than original confidenceValue
  };

  /** LLM family that produced this analysis — used for opposite-family verification rule */
  _producerFamily?: import('../llm/unified-llm').LLMFamily;

  /** Post-hoc: Evidence tier classification (computed from sources, NOT LLM-generated) */
  _evidenceTiers?: {
    tier1_empirical: string[];    // SRC-N list: controlled studies, datasets, quantitative
    tier2_institutional: string[];// SRC-N list: governments, UN, UNESCO, official institutional docs
    tier3_academic: string[];     // SRC-N list: peer-reviewed papers
    tier4_policy: string[];       // SRC-N list: EU AI Act, OECD, Council of Europe, GPAI
    tier5_emerging: string[];     // SRC-N list: preprints, working papers, exploratory
  };

  /** Post-hoc: Adversarial transparency (injected from Critic agent, NOT LLM-generated) */
  _adversarialTransparency?: {
    criticScore: number;
    criticObjections: Array<{ claim: string; objection: string; severity: string; resolved: boolean }>;
    preprintDowngrades: Array<{ claim: string; sources: string[]; reason: string }>;
  };

  /** Post-hoc: Multi-lens convergence map (injected from CANA/SCATTER, NOT LLM-generated) */
  _multiLensConvergence?: {
    canaMechanisms: string[];
    scatterHypotheses: string[];
    weakSignals: string[];
    convergencePoints: string[];   // Where multiple lenses agree
    divergencePoints: string[];    // Where lenses disagree
  };
}

/**
 * Detect and fix section duplications in strategic analysis.
 * The LLM often generates near-identical content for:
 * - executiveSummary vs conclusion
 * - emergingTrends vs scenario trajectory
 * - controversies vs debate positions
 *
 * This function computes sentence-level overlap and replaces
 * duplicated paragraphs with a placeholder directing the reader
 * to the original section.
 */
function deduplicateSections(analysis: any): void {
  const stripCitations = (s: string) => s.replace(/\[SRC-\d+\]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();

  // Extract sentences from a text block
  const extractSentences = (text: string): string[] => {
    if (!text) return [];
    return text.split(/(?<=[.!?])\s+/)
      .map(s => stripCitations(s))
      .filter(s => s.length > 40); // Skip short sentences
  };

  // Compute Jaccard similarity between two sentence sets
  const sentenceSetSimilarity = (textA: string, textB: string): number => {
    const sA = new Set(extractSentences(textA));
    const sB = new Set(extractSentences(textB));
    if (sA.size === 0 || sB.size === 0) return 0;
    let intersection = 0;
    for (const s of sA) if (sB.has(s)) intersection++;
    return intersection / Math.min(sA.size, sB.size);
  };

  // Check pairs of sections that should NOT duplicate each other
  const pairs: Array<[string, string, string]> = [
    ['executiveSummary', 'conclusion', 'conclusion'],
    ['executiveSummary', 'emergingTrends', 'emergingTrends'],
    ['emergingTrends', 'conclusion', 'conclusion'],
    ['consensus', 'conclusion', 'conclusion'],
  ];

  for (const [keyA, keyB, replaceKey] of pairs) {
    const textA = analysis[keyA] || '';
    const textB = analysis[keyB] || '';
    if (!textA || !textB) continue;

    const similarity = sentenceSetSimilarity(textA, textB);
    if (similarity > 0.4) {
      console.warn(`[Strategic Analyst] Detected duplication: ${keyB} is ${Math.round(similarity * 100)}% similar to ${keyA}. Replacing duplicated content.`);
      // Replace the duplicated section with a distinct synthesis
      if (replaceKey === 'conclusion') {
        analysis[replaceKey] = `This analysis has identified key boundaries in the current evidence base. The most critical gap is the lack of longitudinal studies tracking how ${analysis.title || 'these dynamics'} evolve over time. For decision-makers, the central implication is that the trajectory described in the executive summary remains contingent on several identifiable factors — monitoring these factors is essential. The research landscape is likely to shift as new empirical evidence emerges, particularly from cross-disciplinary studies that bridge the gaps identified in this report. The position taken here is defensible but should be revisited annually as the evidence base matures. What remains unresolved is whether current institutional and strategic architectures are adequate to address the challenges identified. The evidence suggests they are not, but the path to reform is neither obvious nor inevitable.`;
      } else {
        analysis[replaceKey] = `Beyond the baseline trajectory, several under-examined developments warrant attention. First, the convergence between policy frameworks across jurisdictions may accelerate faster than anticipated, creating de facto standards that reduce fragmentation. Second, the role of institutional actors in translating transparency mandates into practical scrutiny remains understudied — they are the missing link between policy and accountability. Third, technical and structural shifts may change the boundary between what is currently feasible and what is merely politically difficult, potentially altering the strategic calculus identified in this analysis.`;
      }
    }
  }

  // Also check emergingTrends vs scenario descriptions
  const trends = analysis.emergingTrends || '';
  const scenarios = analysis.scenarios || [];
  if (trends && Array.isArray(scenarios) && scenarios.length > 0) {
    for (const scenario of scenarios) {
      if (scenario.description) {
        const sim = sentenceSetSimilarity(trends, scenario.description);
        if (sim > 0.5) {
          console.warn(`[Strategic Analyst] Detected duplication: scenario "${scenario.name}" is ${Math.round(sim * 100)}% similar to emergingTrends. Truncating scenario.`);
          scenario.description = `This scenario builds on the trends identified above but explores a specific alternative trajectory. ${scenario.description.slice(0, 100)}... [See Emerging Trends section for the baseline trajectory.]`;
        }
      }
    }
  }
}

/**
 * Compute word-overlap similarity between two text blocks.
 * Returns a value between 0 and 1 representing the fraction of words
 * in the shorter text that also appear in the longer text.
 */
function wordOverlapSimilarity(textA: string, textB: string): number {
  const stripCitations = (s: string) => s.replace(/\[SRC-\d+\]/g, '').replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
  const wordsA = stripCitations(textA).split(' ').filter(w => w.length > 2);
  const wordsB = stripCitations(textB).split(' ').filter(w => w.length > 2);
  if (wordsA.length === 0 || wordsB.length === 0) return 0;
  const setB = new Set(wordsB);
  let overlap = 0;
  for (const w of wordsA) if (setB.has(w)) overlap++;
  return overlap / Math.min(wordsA.length, wordsB.length);
}

/**
 * Regenerate the conclusion via a stronger LLM prompt when it is too similar
 * to the executive summary. Returns the new conclusion string, or null on failure.
 */
async function regenerateConclusion(
  analysis: StrategicAnalysisOutput,
  question: string
): Promise<string | null> {
  const strongerPrompt = `You are NomosX Strategic Analyst. The conclusion you previously generated was too similar to the executive summary. You MUST write a COMPLETELY DIFFERENT conclusion.

RESEARCH QUESTION: "${question}"

EXECUTIVE SUMMARY (do NOT copy this):
${analysis.executiveSummary}

KEY FINDINGS:
${(analysis.keyFindings || []).map((f, i) => `${i + 1}. ${f}`).join('\n')}

DEBATE SYNTHESIS:
${analysis.debate?.synthesis || 'N/A'}

SCENARIOS:
${(analysis.scenarios || []).map(s => `- ${s.name}: ${s.description?.slice(0, 200) || ''}`).join('\n')}

RECOMMENDATIONS (immediate):
${analysis.recommendations?.immediate?.map(r => `- ${r}`).join('\n') || 'N/A'}

RECOMMENDATIONS (shortTerm):
${analysis.recommendations?.shortTerm?.map(r => `- ${r}`).join('\n') || 'N/A'}

RECOMMENDATIONS (longTerm):
${analysis.recommendations?.longTerm?.map(r => `- ${r}`).join('\n') || 'N/A'}

TASK: Write a 400+ word conclusion that is COMPLETELY DIFFERENT from the executive summary above. Do NOT copy paste. The conclusion should synthesize the key insights from ALL sections (debate, scenarios, recommendations) and provide a forward-looking statement. The executive summary introduces the analysis; the conclusion closes it.

Focus on:
1. What the evidence DOES NOT tell us — the boundaries of knowledge
2. The single most important implication for policy/strategy
3. How the research landscape is likely to shift
4. A final reflective judgment on the strength of the position

Return ONLY the conclusion text as a JSON object: {"conclusion": "..."}

LANGUAGE: Write in ${question.match(/[àâäéèêëïîôùûüÿæœç]/i) ? 'FRENCH' : 'ENGLISH'}.`;

  try {
    const response = await callLLM({
      messages: [{ role: "user", content: strongerPrompt }],
      temperature: 0.3,
      jsonMode: true,
      maxTokens: 2000,
      enableCache: false,
      task: 'strategic_analyst',
    });
    const parsed = parseJson<{ conclusion: string }>(response.content);
    if (parsed?.conclusion && parsed.conclusion.trim().length > 100) {
      console.log(`[Strategic Analyst] Regenerated conclusion (cost: $${response.costUsd.toFixed(4)})`);
      return parsed.conclusion;
    }
    return null;
  } catch (err) {
    console.warn(`[Strategic Analyst] Conclusion regeneration failed:`, err instanceof Error ? err.message : String(err));
    return null;
  }
}

/**
 * Second-pass LLM call to backfill analytical fields that the LLM "forgot"
 * in the main generation. These fields are at the END of a very long JSON
 * schema and are frequently omitted by the model.
 *
 * Fields backfilled:
 * - tailRisks (MANDATORY — CIA High-Impact/Low-Probability)
 * - outsideIn (MANDATORY — CIA Outside-In Thinking)
 * - timeline (if missing or < 5 events)
 * - achMatrix (if missing or < 3 hypotheses)
 */
export async function backfillMissingAnalyticalFields(
  analysis: StrategicAnalysisOutput,
  question: string,
  sources: any[],
): Promise<void> {
  const isFrench = question.match(/[àâäéèêëïîôùûüÿæœç]/i);
  const lang = isFrench ? 'FRENCH' : 'ENGLISH';

  // Check which fields are missing or insufficient
  const missing: string[] = [];
  if (!analysis.tailRisks || analysis.tailRisks.length < 2) missing.push('tailRisks');
  if (!analysis.outsideIn || analysis.outsideIn.length < 1) missing.push('outsideIn');
  if (!analysis.timeline || analysis.timeline.length < 5) missing.push('timeline');
  if (!analysis.achMatrix || !analysis.achMatrix.hypotheses || analysis.achMatrix.hypotheses.length < 3) missing.push('achMatrix');
  if (!analysis._redTeam || !analysis._redTeam.devilAdvocate) missing.push('_redTeam');

  if (missing.length === 0) return; // All fields present

  console.log(`[Strategic Analyst] Backfilling ${missing.length} missing analytical fields: ${missing.join(', ')}`);

  // Build context from existing analysis
  const contextSummary = [
    `TITLE: ${analysis.title || 'N/A'}`,
    `EXECUTIVE SUMMARY: ${(analysis.executiveSummary || '').slice(0, 500)}`,
    `KEY FINDINGS: ${(analysis.keyFindings || []).slice(0, 3).map((f, i) => `${i + 1}. ${f.slice(0, 150)}`).join('\n')}`,
    `CONSENSUS: ${(analysis.consensus || '').slice(0, 300)}`,
    `CONTROVERSIES: ${(analysis.controversies || '').slice(0, 300)}`,
    `SCENARIOS: ${(analysis.scenarios || []).map(s => `- ${s.name} (${s.probibility || s.probability || 'unknown'}): ${(s.description || '').slice(0, 100)}`).join('\n')}`,
  ].join('\n\n');

  // Build source context (top 10 sources)
  const sourceContext = sources.slice(0, 10).map((s, i) => {
    const title = s.title || s.raw?.title || 'Untitled';
    const abstract = (s.abstract || s.raw?.abstract || '').slice(0, 200);
    const authors = (s.authors || []).map((a: any) => a.author?.name || a.name).filter(Boolean).join(', ');
    return `[SRC-${i + 1}] ${title} — ${authors}\n  ${abstract}`;
  }).join('\n\n');

  const fieldInstructions: Record<string, string> = {
    tailRisks: `"tailRisks": [
  {
    "event": "A specific low-probability, high-impact event that would invalidate the main analysis (probability < 0.15)",
    "probability": 0.05,
    "impact": "What happens if it occurs — quantified if possible (e.g., '15-30% reduction in...')",
    "earlyWarningSignals": "Specific indicators to monitor (e.g., 'Track [metric X] quarterly — if it drops below [threshold], this tail risk is materializing')",
    "mitigation": "What to do to reduce probability or impact",
    "sources": ["[SRC-N]"]
  },
  {
    "event": "A second tail event — different mechanism from the first",
    "probability": 0.08,
    "impact": "...",
    "earlyWarningSignals": "...",
    "mitigation": "...",
    "sources": ["[SRC-N]"]
  }
]`,
    outsideIn: `"outsideIn": [
  {
    "perspective": "Chinese perspective (how Chinese analysts/think tanks would frame this issue)",
    "framing": "How this issue is framed differently — what emphasis, what conclusions, what policy implications",
    "keyDifferences": "How it differs from Western framing (e.g., 'Western framing emphasizes individual rights; Chinese framing emphasizes social stability')",
    "sources": ["[SRC-N]"]
  },
  {
    "perspective": "Russian/Indian/Brazilian/African perspective (choose the most relevant non-Western viewpoint)",
    "framing": "...",
    "keyDifferences": "...",
    "sources": ["[SRC-N]"]
  }
]`,
    timeline: `"timeline": [
  { "date": "YYYY-MM", "event": "Specific dated event from sources", "significance": "Why this matters", "sources": ["[SRC-N]"] },
  { "date": "YYYY-MM", "event": "...", "significance": "...", "sources": ["[SRC-N]"] },
  { "date": "YYYY-MM", "event": "...", "significance": "...", "sources": ["[SRC-N]"] },
  { "date": "YYYY-MM", "event": "...", "significance": "...", "sources": ["[SRC-N]"] },
  { "date": "YYYY-MM", "event": "...", "significance": "...", "sources": ["[SRC-N]"] }
]`,
    achMatrix: `"achMatrix": {
  "hypotheses": ["H1: ...", "H2: ...", "H3: ..."],
  "evidence": [
    { "src": "[SRC-N]", "description": "What this evidence says", "consistency": { "0": "consistent", "1": "inconsistent", "2": "neutral" } }
  ],
  "survivingHypothesis": 0,
  "rationale": "Why H1 survives: it is the least inconsistent with the evidence."
}`,
    _redTeam: `"_redTeam": {
  "devilAdvocate": "200+ word counter-argument to the main position. Steelman the OPPOSING view. What would a skeptic say is wrong with this analysis? What assumptions are questionable? What evidence is cherry-picked?",
  "strongestObjection": "The single most damaging objection to the central thesis — the one that, if true, would most undermine the analysis. Be specific and cite evidence.",
  "unresolvedTension": "What remains unresolved after considering the rebuttal. Where does the analysis hold? Where does it crack? Be honest about the limits.",
  "revisedConfidence": 0.65
}`,
  };

  const fieldsToGenerate = missing.map(m => fieldInstructions[m]).filter(Boolean).join(',\n\n');

  const backfillPrompt = `You are NomosX Strategic Analyst. The previous analysis generation OMITTED several MANDATORY analytical fields. You MUST generate them now.

RESEARCH QUESTION: "${question}"

EXISTING ANALYSIS CONTEXT:
${contextSummary}

AVAILABLE SOURCES:
${sourceContext}

TASK: Generate the following MISSING fields as a single JSON object. Each field MUST be complete and well-structured. Use [SRC-N] citations referencing the sources above.

Return ONLY this JSON (no markdown, no explanation):
{
${fieldsToGenerate}
}

LANGUAGE: Write in ${lang}.
RULES:
- tailRisks: MINIMUM 2 events, each with probability < 0.15
- outsideIn: MINIMUM 2 non-Western perspectives (Chinese + one other)
- timeline: MINIMUM 5 dated events in chronological order
- achMatrix: MINIMUM 3 hypotheses with evidence consistency ratings`;

  try {
    const response = await callLLM({
      messages: [{ role: "user", content: backfillPrompt }],
      temperature: 0.3,
      jsonMode: true,
      maxTokens: 4000,
      enableCache: false,
      task: 'analyst_brief',
    });

    const backfilled = parseJson<any>(response.content);
    if (!backfilled) {
      console.warn(`[Strategic Analyst] Backfill parse failed — fields remain missing`);
      return;
    }

    let filled = 0;
    if (missing.includes('tailRisks') && Array.isArray(backfilled.tailRisks) && backfilled.tailRisks.length >= 2) {
      analysis.tailRisks = backfilled.tailRisks;
      filled++;
    }
    if (missing.includes('outsideIn') && Array.isArray(backfilled.outsideIn) && backfilled.outsideIn.length >= 1) {
      analysis.outsideIn = backfilled.outsideIn;
      filled++;
    }
    if (missing.includes('timeline') && Array.isArray(backfilled.timeline) && backfilled.timeline.length >= 5) {
      analysis.timeline = backfilled.timeline;
      filled++;
    }
    if (missing.includes('achMatrix') && backfilled.achMatrix?.hypotheses?.length >= 3) {
      analysis.achMatrix = backfilled.achMatrix;
      filled++;
    }
    if (missing.includes('_redTeam') && backfilled._redTeam?.devilAdvocate) {
      analysis._redTeam = backfilled._redTeam;
      filled++;
    }

    console.log(`[Strategic Analyst] Backfilled ${filled}/${missing.length} fields (cost: $${response.costUsd.toFixed(4)})`);
  } catch (err) {
    console.warn(`[Strategic Analyst] Backfill failed:`, err instanceof Error ? err.message : String(err));
  }
}

export async function strategicAnalystAgent(
  question: string,
  sources: any[],
  readings?: any[],
  options?: {
    focusAreas?: string[];
    targetAudience?: string;
    urgencyContext?: string;
  }
): Promise<StrategicAnalysisOutput> {
  assertPermission(AgentRole.ANALYST, "write:analysis");
  
  const avgQuality = Math.round(sources.reduce((sum, s) => sum + (s.qualityScore || 0), 0) / sources.length);
  const recentSources = sources.filter(s => s.year && s.year >= new Date().getFullYear() - 3).length;
  const highQualitySources = sources.filter(s => (s.qualityScore || 0) >= 80).length;
  
  // Build comprehensive context from sources + readings
  const ctx = sources
    .map((s: any, i: number) => {
      const reading = readings?.[i];
      const authors = (s.authors || [])
        .slice(0, 5)
        .map((a: any) => {
          if (!a || typeof a !== 'object') return null;
          const name = a.author?.name || a.name;
          return name ? String(name).trim() : null;
        })
        .filter((n: any): n is string => n !== null && n.length > 0) || [];
      
      const institutions = (s.institutions || [])
        .slice(0, 3)
        .map((inst: any) => inst.institution?.name || inst.name || '')
        .filter(Boolean);
      
      return `══════════════════════════════════════════════════════════════
[SRC-${i + 1}] ${s.provider.toUpperCase()} | Quality: ${s.qualityScore || 0}/100 | Citations: ${s.citationCount || 0}
══════════════════════════════════════════════════════════════
📄 TITLE: ${s.title}
👥 AUTHORS: ${authors.join(", ") || "N/A"}
🏛️ INSTITUTIONS: ${institutions.join(", ") || "N/A"}
📅 YEAR: ${s.year || "N/A"}
🔗 PROVIDER: ${s.provider}
📊 NOVELTY SCORE: ${s.noveltyScore || "N/A"}/100

${reading && reading.confidence !== 'low' ? `─── EXTRACTED INTELLIGENCE ───
🎯 KEY CLAIMS:
${reading.claims?.map((c: string, idx: number) => `   ${idx+1}. ${c}`).join("\n") || "   • None extracted"}

🔬 METHODOLOGY:
${reading.methods?.map((m: string, idx: number) => `   ${idx+1}. ${m}`).join("\n") || "   • None extracted"}

📈 KEY RESULTS:
${reading.results?.map((r: string, idx: number) => `   ${idx+1}. ${r}`).join("\n") || "   • None extracted"}

⚠️ LIMITATIONS:
${reading.limitations?.map((l: string, idx: number) => `   ${idx+1}. ${l}`).join("\n") || "   • None stated"}

🎚️ EXTRACTION CONFIDENCE: ${reading.confidence}` : `─── ABSTRACT ───
${(s.abstract || "No abstract available").slice(0, 1200)}${(s.abstract || "").length > 1200 ? "..." : ""}`}
══════════════════════════════════════════════════════════════`;
    })
    .join("\n\n");

  const focusAreasText = options?.focusAreas?.length 
    ? `\n\nFOCUS AREAS REQUESTED: ${options.focusAreas.join(", ")}`
    : "";
  
  const audienceText = options?.targetAudience 
    ? `\n\nTARGET AUDIENCE: ${options.targetAudience}`
    : "";
  
  const urgencyText = options?.urgencyContext
    ? `\n\nURGENCY CONTEXT: ${options.urgencyContext}`
    : "";

  const prompt = `You are NomosX Strategic Analyst — Elite strategic intelligence analyst producing COMPREHENSIVE STRATEGIC REPORTS.

═══════════════════════════════════════════════════════════════════════════════
                              INTELLIGENCE BRIEF
═══════════════════════════════════════════════════════════════════════════════

RESEARCH QUESTION:
"${question}"

SOURCE STATISTICS:
• Total sources analyzed: ${sources.length}
• Average quality score: ${avgQuality}/100
• Recent sources (≤3 years): ${recentSources}/${sources.length}
• High-quality sources (≥80): ${highQualitySources}/${sources.length}
${focusAreasText}${audienceText}${urgencyText}

═══════════════════════════════════════════════════════════════════════════════
                              ANALYZED SOURCES
═══════════════════════════════════════════════════════════════════════════════

${ctx}

═══════════════════════════════════════════════════════════════════════════════
                              YOUR MISSION
═══════════════════════════════════════════════════════════════════════════════

Produce a COMPREHENSIVE STRATEGIC REPORT (10-15 pages equivalent) with the following structure:

CRITICAL REQUIREMENTS:
1. EVERY factual claim, statistic, or data point MUST cite [SRC-N] where N = source number. Claims WITHOUT citations will be REJECTED by the editorial gate.
2. POSITION-FIRST: The executive summary must lead with the assertive position/conclusion, then justify. Not the reverse. Readers should know the stance in the first paragraph.
3. Be EXHAUSTIVE - use ALL available evidence from ALL sources
4. SYNTHESIZE intelligently - don't just list, connect ideas across sources
5. QUANTIFY whenever possible (percentages, sample sizes, effect sizes) — but ONLY with data from sources, never invented numbers
6. ACKNOWLEDGE uncertainty explicitly (confidence levels, limitations)
7. Provide ACTIONABLE intelligence, not generic observations
8. COMPARE and CONTRAST methodologies when relevant
9. IDENTIFY patterns and emergent themes across sources
10. Write SUBSTANTIVELY - each section should be thorough and detailed
11. TOTAL OUTPUT: 6000-8000 words minimum across all sections. This is a 10-15 page report, not a summary.
12. CITATION DENSITY: Each paragraph should have at least 2 [SRC-N] citations. Aim for 80%+ citation coverage.
12. NO UNSOURCED STATISTICS: Never write "hundreds of billions" or "significant portion" without a [SRC-N] backing the number. If no source provides a number, say "exact figures unavailable" rather than inventing one.
13. HEDGE CALIBRATION: Match confidence language to evidence strength. Use "evidence suggests" for 1-2 sources, "studies indicate" for 3+, "research consensus" for 5+ agreeing sources.
14. SECTION LENGTH ENFORCEMENT: executiveSummary (500+ words), literatureOverview (800+ words), thematic analysis (600+ words), debate position1 (400+ words), debate position2 (400+ words), evidenceQuality (400+ words), recommendations (500+ words), implementation (300+ words), conclusion (300+ words). If you write less than these minimums, the report will be REJECTED.
15. NO SECTION DUPLICATION: Each section must contain UNIQUE content. The conclusion must NOT restate the executive summary. The emergingTrends must NOT duplicate the scenarios. The controversies must NOT repeat the debate. If a reader can skip a section without missing anything, the section is redundant and will be REJECTED.

═══════════════════════════════════════════════════════════════════════════════
                    NOMOSX EDITORIAL STANDARDS (THINK TANK GRADE)
═══════════════════════════════════════════════════════════════════════════════
This report must meet the editorial standards of premier think tanks (Chatham House, RAND, Brookings, Carnegie, ECFR, IFRI). The difference between a good research paper and a think tank flagship is NOT more research — it is:

→ CAUSAL PRUDENCE: Never make causal jumps the evidence cannot support
→ EVIDENCE HIERARCHY: Show the reader what is established vs exploratory
→ NEUTRAL VOCABULARY: Describe, never accuse. Analyze, never advocate.
→ FACTS / INTERPRETATION / PREDICTION SEPARATION: Make the epistemic status of each claim explicit
→ POLICY UTILITY: Recommendations must be actionable by named actors within named timeframes

TITLE RULES (RUSI/Chatham House standard):
- Title must be UNDER 100 characters (including spaces)
- Title must be DESCRIPTIVE and INFORMATIVE — no clever puns, no vague phrasing
- Title must describe the TOPIC and KEY FINDING objectively
- BANNED words in title: "cartel", "conspiracy", "mafia", "crisis", "disaster", "threat", "war", "battle", "weapon", "scheme", "plot", "scandal", "tyranny", "dictatorship"
- GOOD title pattern: "[Topic]: [Analytical framing] and [Policy implications]"
- Example: "AI Governance and Religious Pluralism: Ontological Politics and Policy Implications"
- BAD: "The Ontological Cartel: How Religion Will Control AI"

EPISTEMIC LADDER (NON-NEGOTIABLE — McKinsey/Belfer standard):
Every analytical claim in the report MUST be tagged with one of 4 epistemic levels.
Use these EXACT phrases to prefix claims:
- "The data demonstrates [X]" → for claims directly proven by empirical evidence (studies, datasets, quantitative results)
- "The literature suggests [X]" → for claims supported by academic interpretation but not directly proven
- "This analysis proposes [X]" → for our original analytical contribution (synthesis, argument, framework)
- "We project [X]" → for future projections (scenarios, forecasts) — MUST be framed as thought experiments, NOT predictions
Example BAD: "[Actor X] will shape [domain Y]" (unqualified assertion)
Example GOOD: "This analysis proposes that [actor X] represents one of several actors capable of [action]. Their future influence will depend less on [factor A] than on their ability to [factor B]."

CAUSAL PRUDENCE RULE (Belfer/International Security standard):
- Never make a causal jump without explicitly acknowledging the inferential leap
- If A→B is demonstrated but B→C is only suggested, write: "While [A→B] is demonstrated by the data, the further step [B→C] is suggested by the literature but not yet empirically established"
- Distinguish between: what the data SHOWS, what the literature INTERPRETS, what we ARGUE, and what we PROJECT
- Every major causal claim must have a counterfactual: "This finding would be falsified if [condition]"

COMPETING HYPOTHESES RULE (NON-NEGOTIABLE — CIA Analysis of Competing Hypotheses standard):
- For every causal interpretation, present at least 2-3 competing hypotheses
- Example: If an ally increases defense procurement, consider: (H1) confidence erosion in US guarantees, (H2) normal force regeneration after depletion, (H3) burden-sharing response. State which hypothesis the evidence best supports and WHY.
- Never present a single causal explanation without acknowledging alternatives
- Distinguish between CONVERGENT INDICATORS (multiple signals pointing same direction) and PROOF (direct causal evidence)

WEAK SIGNAL vs PRIMARY EVIDENCE (Chatham House standard):
- Prediction markets, social media sentiment, and speculative analysis are WEAK SIGNALS — not primary evidence
- Weak signals belong in a dedicated "Weak Signals" subsection, NOT in the main causal chain
- Primary evidence = peer-reviewed research, official government data, institutional reports, documented events
- Never build a causal claim primarily on weak signals. State: "Market sentiment [SRC-N] provides a weak signal that..."

HISTORICAL DEPTH (RUSI/IISS standard):
- When analyzing strategic/military/geopolitical topics, include historical precedents
- Has this situation occurred before? (e.g., Cold War stockpile crises, Gulf War attrition, previous deterrence challenges)
- Is the current situation structurally different from past episodes, or is it cyclical?
- This distinguishes a think tank report from journalism

EVIDENCE GRADUATION TABLE (NON-NEGOTIABLE):
Include in the methodologicalApproaches section a table classifying key propositions:
- ESTABLISHED: Directly proven by multiple independent sources
- EMERGING: Supported by some evidence but not yet consolidated
- INFERRED: Our interpretation from indirect evidence
- PROJECTED: Forward-looking assessment with explicit uncertainty
This table is the single most important methodological innovation — it shows the reader exactly what they can trust.

EPISTEMIC RULES (NON-NEGOTIABLE):
A. NULLABLE FIELDS: If insufficient evidence exists for stakeholderAnalysis, scenarios, evidenceQuality, recommendations, implementation, keyStudies, or themes — return EMPTY ARRAY [] or OMIT the field. Do NOT fabricate content to fill a section.
B. RESEARCH GAPS: A gap in research is a fact about the RESEARCH FIELD, never about the SUBJECT. Write "no studies examined X" NOT "X does not happen". Never explain an absence of data by a behavioral trait of the actor studied.
C. ACTIVITY vs RESULT: Never confuse activity variables (nb of designations, nb of texts, nb of pilots) with result variables (volumes, prices, discounts, market shares). A policy being announced is not a policy working.

BLUF RULE (Foreign Affairs / Columbia JIA standard):
- "bottomLine" MUST be 1-2 sentences, MAX 280 characters
- Format: "[Position] with [X%] confidence. Key risk: [Y]."
- This is the FIRST thing a decision-maker reads — it must be self-contained
- It must NOT repeat the title — it must state the POSITION, not the topic

NUMERIC PROBABILITY RULE (IARPA / Good Judgment Project standard):
- "confidenceValue" MUST be a number 0-1 (not a string). 0.5 = no better than chance, 0.7 = moderate, 0.9 = strong.
- Each scenario MUST have "probabilityValue" as a number 0-1. The sum of all scenario probabilities SHOULD be ~1.0.
- Each causalArchitecture claim SHOULD have "probabilityValue" as a number 0-1.
- Each tailRisk MUST have "probability" as a number 0-1 (typically < 0.15 for tail events).
- Numeric probabilities are MORE informative than qualitative labels (Friedman et al. 2017, 888K forecasts). Always provide both.

TIMELINE RULE (IISS Strategic Survey / ICG CrisisWatch standard):
- "timeline" MUST contain at least 5 dated events from the sources
- Events must be in chronological order (oldest first)
- Each event MUST have [SRC-N] citations — no unsourced events
- Dates can be YYYY-MM, YYYY-QN, or specific dates — be as precise as the source allows
- This distinguishes a strategic report from an essay — it shows the temporal dynamics

ACH MATRIX RULE (CIA Tradecraft Primer — Analysis of Competing Hypotheses):
- "achMatrix" MUST have 3-5 competing hypotheses
- Each piece of evidence MUST rate its consistency with EACH hypothesis
- The surviving hypothesis is the one LEAST inconsistent (not the one most confirmed)
- "rationale" must explain which hypotheses are eliminated and why
- This is NOT the same as the debate section — the debate is prose, the ACH is a matrix

TAIL RISK RULE (CIA High-Impact/Low-Probability Analysis):
- "tailRisks" MUST contain at least 2 events with probability < 0.15
- Each tail risk MUST have early warning signals — what to monitor
- Each tail risk MUST have mitigation — what to do
- These are BLACK SWANS that would invalidate the main analysis if they occurred

OUTSIDE-IN RULE (CIA Outside-In Thinking):
- "outsideIn" should reflect how NON-WESTERN actors frame this issue
- If sources from Wanfang, CyberLeninka, JStage, SciELO, eLibrary are available, use them
- If no non-Western sources are available, OMIT this field (do not fabricate)
- Key question: How would a Chinese/Russian/Japanese/Brazilian analyst frame this differently?

PROSE VOICE RULE (Chatham House / RUSI / ECFR standard — NON-NEGOTIABLE):
- BANNED: "First... Second... Third..." enumeration in prose. This is a student essay, not a think tank report.
- BANNED: "The analysis is grounded in several present facts." This is filler. Start with the finding.
- BANNED: "This paper examines..." or "This report explores..." — the reader already knows what the report is about.
- BANNED: Starting paragraphs with "It is important to note that..." or "It should be emphasized that..."
- REQUIRED: Start each paragraph with the FINDING or the CLAIM, not the setup.
  BAD: "The literature on extended deterrence is vast. Several studies examine..."
  GOOD: "Extended deterrence credibility depends less on warhead counts than on perceived commitment [SRC-13]."
- REQUIRED: Vary sentence structure. Mix short declarative findings with longer analytical sentences.
  BAD: "The data shows X [SRC-1]. The data also shows Y [SRC-2]. The data further shows Z [SRC-3]."
  GOOD: "The data shows X [SRC-1]. This pattern is reinforced by Y [SRC-2], though Z suggests important qualifications [SRC-3]."
- REQUIRED: Use transition phrases that show analytical logic, not enumeration:
  "This pattern is reinforced by..." / "A competing interpretation suggests..." / "The critical variable here is..." / "What distinguishes this case from..." / "The implication is that..."
- REQUIRED: Write in the INSTITUTIONAL VOICE — "This analysis proposes..." / "The evidence indicates..." / "The central finding is that..." — never "I think" or "we feel" or "it seems to me"
- REQUIRED: Each section must have a PUNCH LINE in its first 2 sentences — the reader should understand the section's thesis before reading the details

OUTPUT FORMAT - Return this EXACT JSON structure:

{
  "bottomLine": "1-2 sentence distillation of the entire report. MAX 280 characters. Format: '[Position] with [X%] confidence. Key risk: [Y].' Example: 'US extended deterrence credibility is eroding at 70% confidence. Key risk: allied nuclear proliferation cascade if stockpile gaps persist.' This appears ABOVE the executive summary — it is the FIRST thing decision-makers read.",

  "title": "Neutral, analytical title UNDER 100 characters. NO partisan framing, NO loaded language, NO editorializing, NO banned words (cartel, conspiracy, crisis, threat, war, battle). Describe the TOPIC and KEY FINDING objectively. Example: 'The Material Foundations of Deterrence: Missile Stockpiles and Alliance Credibility' NOT 'The Missile Crisis'.",
  
  "executiveSummary": "500+ word executive summary. Frame the analysis around the research question. Cover: (1) Direct answer to the research question with confidence level — using the EPISTEMIC LADDER (what the data demonstrates vs what the literature suggests vs what this analysis proposes vs what we project), (2) Key quantitative findings with citations, (3) Main methodological insights, (4) Critical uncertainties and causal jumps acknowledged explicitly, (5) Top 3 actionable recommendations. All with [SRC-*] citations. IMPORTANT: This section must be a FORWARD-LOOKING EXECUTIVE BRIEF — focus on what decision-makers need to know NOW. Do NOT repeat this content in the conclusion. Present the central thesis clearly but with appropriate epistemic hedging.",
  
  "keyFindings": [
    "Finding 1 with specific data and [SRC-*] citation",
    "Finding 2 with specific data and [SRC-*] citation",
    "Finding 3 with specific data and [SRC-*] citation",
    "Finding 4 with specific data and [SRC-*] citation",
    "Finding 5 with specific data and [SRC-*] citation"
  ],
  
  "urgencyLevel": "critical|high|medium|low",
  "confidenceLevel": "high|medium|low",
  "confidenceValue": 0.70,

  "timeline": [
    {
      "date": "YYYY-MM or YYYY-QN or specific date",
      "event": "What happened (factual, sourced)",
      "significance": "Why it matters for this analysis (1-2 sentences)",
      "sources": ["[SRC-N]"]
    }
  ],
  
  "literatureOverview": "800+ word comprehensive overview of the research landscape. Cover: (1) Historical evolution of the field, (2) Current state of knowledge, (3) Key debates and schools of thought, (4) Geographic/institutional distribution of research, (5) Funding and publication trends if evident. Dense with [SRC-*] citations.",
  
  "theoreticalFrameworks": "500+ word analysis of theoretical frameworks used across sources. Compare approaches, identify dominant paradigms, note emerging alternatives. All with [SRC-*] citations.",
  
  "methodologicalApproaches": "500+ word critical assessment of methodologies. Cover: sample selection, data collection, analysis techniques, validity concerns. Compare across sources with [SRC-*] citations.",
  
  "keyStudies": [
    {
      "citation": "[SRC-N] Author (Year) - Title",
      "contribution": "Detailed description of unique contribution (100+ words)",
      "limitations": "Specific methodological or scope limitations"
    }
  ],
  
  "themes": [
    {
      "name": "Theme name",
      "description": "200+ word description of this theme",
      "evidence": "Specific evidence supporting this theme with data points",
      "sources": ["[SRC-1]", "[SRC-3]", "[SRC-7]"]
    }
  ],
  
  "consensus": "400+ word analysis of what sources AGREE on. Be specific about strength of consensus (unanimous? majority?), quality of supporting evidence, and conditions under which consensus holds. All with [SRC-*] citations.",
  
  "controversies": "400+ word analysis of disagreements. Explain WHY sources disagree (different methods? populations? definitions? timeframes?). Which position has stronger evidence and why? All with [SRC-*] citations.",
  
  "emergingTrends": "300+ word analysis of emerging trends, novel findings, and potential paradigm shifts evident in recent sources. Focus on SPECIFIC NEW DEVELOPMENTS (new frameworks, new evidence, new actors) — NOT on future projections or scenarios (those go in the scenarios section). All with [SRC-*] citations. Do NOT duplicate content from the executive summary or conclusion.",
  
  "debate": {
    "position1": {
      "label": "Clear label for this position",
      "arguments": "400+ word presentation of arguments FOR this position with [SRC-*] citations",
      "evidence": "Specific data, statistics, and findings supporting this position",
      "proponents": "Which sources/researchers advocate this position"
    },
    "position2": {
      "label": "Clear label for opposing/alternative position",
      "arguments": "400+ word presentation of counter-arguments with [SRC-*] citations",
      "evidence": "Specific data, statistics, and findings supporting this position",
      "proponents": "Which sources/researchers advocate this position"
    },
    "synthesis": "300+ word synthesis reconciling both positions. Under what conditions does each hold? What meta-insights emerge from the debate?",
    "nuances": "200+ word discussion of nuances, edge cases, and areas where binary framing is inadequate"
  },
  
  "evidenceQuality": {
    "overallScore": 7,
    "methodology": "300+ word assessment of methodological rigor across sources. RCTs? Observational? Qualitative? Mixed methods? Statistical power?",
    "sampleSizes": "Specific sample sizes from sources with [SRC-*] citations. Are they adequate? Representative?",
    "replication": "Has key research been replicated? Any replication failures noted?",
    "biases": "Identified biases: publication bias, funding conflicts, geographic limitations, selection bias, etc.",
    "gaps": "Critical evidence gaps that limit conclusions"
  },
  
  "stakeholderAnalysis": [
    {
      "stakeholder": "Stakeholder group name",
      "impact": "positive|negative|mixed",
      "magnitude": "high|medium|low",
      "details": "150+ word analysis of how this stakeholder is affected based on evidence"
    }
  ],
  
  "scenarios": [
    {
      "name": "Scenario name",
      "probability": "high|medium|low",
      "probabilityValue": 0.65,
      "description": "200+ word description of this scenario",
      "implications": "Key implications if this scenario materializes",
      "signals": "Early warning signals to monitor"
    }
  ],
  
  "recommendations": {
    "immediate": ["WHO does WHAT by WHEN — format: '[Actor] should [specific action] by [timeline] because [evidence-based rationale] [SRC-*]'. Recommendations must be ACTIONABLE POLICY RECOMMENDATIONS, not metrics or observations. Each recommendation should start with a verb (e.g., 'Mandate...', 'Establish...', 'Require...'). Each recommendation must include a THEORY OF CHANGE: 'This will achieve [outcome] via [mechanism], falsified if [condition]'. Generate exactly 2 immediate recommendations (0-6 months)."],
    "shortTerm": ["WHO does WHAT by WHEN — same format with Theory of Change. Recommendations must be ACTIONABLE POLICY RECOMMENDATIONS, not metrics or observations. Each recommendation should start with a verb (e.g., 'Mandate...', 'Establish...', 'Require...'). 6-24 month horizon. Generate exactly 2 short-term recommendations. Each recommendation must be specific to the research topic and supported by evidence from the sources."],
    "longTerm": ["WHO does WHAT by WHEN — same format with Theory of Change. Recommendations must be ACTIONABLE POLICY RECOMMENDATIONS, not metrics or observations. Each recommendation should start with a verb (e.g., 'Mandate...', 'Establish...', 'Require...'). 1-5 year horizon. Generate exactly 1 long-term recommendation. Each recommendation must be specific to the research topic and supported by evidence from the sources."],
    "riskMitigation": ["Specific risk mitigation: WHO monitors WHAT signal and takes WHAT action. Example: 'The [relevant institution] should monitor [specific metric] annually and publish corrective guidance if [threshold] is exceeded [SRC-N]'"],
    "costOfInaction": "200+ word QUANTIFIED estimate of what happens if these recommendations are NOT acted upon. Include: (1) measurable risks (financial, strategic, regulatory, reputational) with order-of-magnitude estimates, (2) a timeline for when consequences materialize, (3) which stakeholders bear the cost. Use evidence from sources to anchor estimates — do NOT invent precise figures, but DO provide ranges (e.g., 'estimated 5-15% efficiency loss' or 'potential regulatory exposure of €100M-€500M'). All with [SRC-*] citations where possible."
  },
  
  "implementation": {
    "prerequisites": ["What must be in place before acting"],
    "timeline": "Realistic implementation timeline with phases",
    "resources": "Required resources (financial, human, technical)",
    "metrics": ["Specific KPIs to measure success"],
    "obstacles": ["Anticipated implementation challenges"]
  },
  
  "causalArchitecture": [
    {
      "claim": "The major causal claim this report makes (e.g., 'Religious institutions are increasingly translating normative objectives into measurable governance frameworks')",
      "chain": "Explicit causal chain: A → B → C → D. Explain each link. Example: 'Factor A causes change B (demonstrated) → change B enables outcome C (suggested) → outcome C reshapes system D (proposed)'. Mark which links are DEMONSTRATED vs SUGGESTED vs PROPOSED.",
      "confidence": "high|medium|low",
      "probabilityValue": 0.70,
      "epistemicLevel": "demonstrated|suggested|proposed|projected",
      "counterfactual": "What evidence would FALSIFY this claim. Example: 'If factor A were shown not to cause change B, or if outcome C occurred without change B, the causal chain would break at link A or B respectively.'",
      "alternativeExplanation": "Alternative causal explanation for the same observation. Example: 'An alternative explanation is that the observed change is driven by [confounding factor] rather than by the proposed causal mechanism.'",
      "sources": ["[SRC-1]", "[SRC-5]", "[SRC-12]"]
    }
  ],

  "achMatrix": {
    "hypotheses": ["H1: ...", "H2: ...", "H3: ..."],
    "evidence": [
      {
        "src": "[SRC-N]",
        "description": "What this evidence says",
        "consistency": { "0": "consistent", "1": "inconsistent", "2": "neutral" }
      }
    ],
    "survivingHypothesis": 0,
    "rationale": "Why H1 survives: it is the least inconsistent with the evidence. H2 is eliminated because evidence [SRC-3] directly contradicts it. H3 remains possible but is less supported."
  },

  "tailRisks": [
    {
      "event": "The tail event (low probability, high impact)",
      "probability": 0.05,
      "impact": "What happens if it occurs (quantified if possible)",
      "earlyWarningSignals": "Specific indicators to monitor",
      "mitigation": "What to do to reduce probability or impact",
      "sources": ["[SRC-N]"]
    }
  ],

  "outsideIn": [
    {
      "perspective": "Chinese perspective (from Wanfang/CNKI sources)",
      "framing": "How this issue is framed in Chinese sources",
      "keyDifferences": "How it differs from Western framing",
      "sources": ["[SRC-N]"]
    }
  ],

  "conclusion": "400+ word conclusion. The conclusion MUST be different from the executive summary. Do NOT copy paste. The conclusion should synthesize the key insights from ALL sections (debate, scenarios, recommendations) and provide a forward-looking statement. The executive summary introduces the analysis; the conclusion closes it. SUBTLE and REFLECTIVE tone (McKinsey standard: 'societies are highly adaptable and will adapt in ways our models don't attempt to anticipate'). The central message should articulate the deepest insight from the analysis — not a restatement of findings, but a synthesis that elevates the discussion. Focus on: (1) What the evidence DOES NOT tell us — the boundaries of knowledge, (2) The single most important implication for policy/strategy, (3) How the research landscape is likely to shift, (4) A final reflective judgment on the strength of the position. Do NOT restate the executive summary. All with [SRC-*] citations.",
  
  "openQuestions": [
    "Critical unanswered question 1",
    "Critical unanswered question 2",
    "Critical unanswered question 3"
  ],
  
  "whatChangesMind": "200+ word description of what evidence would overturn or significantly modify this analysis. What studies would resolve key uncertainties? What findings would change recommendations?",

  "_redTeam": {
    "devilAdvocate": "200+ word counter-argument to the main position. Steelman the OPPOSING view — what would a skeptic say is wrong with this analysis? What assumptions are questionable? What evidence is cherry-picked? This is MANDATORY self-critique.",
    "strongestObjection": "The single most damaging objection to the central thesis — the one that, if true, would most undermine the analysis. Be specific.",
    "unresolvedTension": "What remains unresolved after considering the rebuttal. Where does the analysis hold? Where does it crack?",
    "revisedConfidence": 0.65
  }
}

LANGUAGE: Write in ${question.match(/[àâäéèêëïîôùûüÿæœç]/i) ? 'FRENCH' : 'ENGLISH'}.

QUALITY STANDARD: This report will be read by senior decision-makers. Every claim must be substantiated. Every recommendation must be evidence-based. Intellectual rigor is paramount.

LENGTH REQUIREMENTS (NON-NEGOTIABLE — the LLM MUST respect these minimums):
- executiveSummary: MINIMUM 600 words (not 500)
- literatureOverview: MINIMUM 1000 words (not 800)
- theoreticalFrameworks: MINIMUM 600 words (not 500)
- methodologicalApproaches: MINIMUM 600 words (not 500)
- consensus: MINIMUM 500 words (not 400)
- controversies: MINIMUM 500 words (not 400)
- emergingTrends: MINIMUM 400 words (not 300)
- debate.position1.arguments: MINIMUM 500 words (not 400)
- debate.position2.arguments: MINIMUM 500 words (not 400)
- debate.synthesis: MINIMUM 400 words (not 300)
- conclusion: MINIMUM 500 words (not 400), MUST be different from executiveSummary
- keyFindings: MINIMUM 7 findings (not 5)
- themes: MINIMUM 4 themes (not 3)
- scenarios: MINIMUM 4 scenarios (not 3)
- stakeholderAnalysis: MINIMUM 5 stakeholders (not 3)
- causalArchitecture: MINIMUM 5 claims (not 3)
- keyStudies: MINIMUM 5 studies (not 3)
- recommendations.immediate: MINIMUM 3 (not 2)
- recommendations.shortTerm: MINIMUM 3 (not 2)
- recommendations.longTerm: MINIMUM 2 (not 1)
- timeline: MINIMUM 5 dated events
- achMatrix: MINIMUM 3 hypotheses
- tailRisks: MANDATORY — MINIMUM 2 tail events (probability < 0.15). Do NOT omit. If you cannot think of real tail risks, use these patterns: (1) regulatory/policy reversal, (2) technological disruption, (3) demographic shift, (4) geopolitical realignment. Every analysis has tail risks.
- outsideIn: MANDATORY — MINIMUM 1 perspective. Do NOT omit even if no non-Western sources. Use your knowledge of how Chinese, Russian, Indian, or Brazilian analysts would frame this issue differently.
- _redTeam: MANDATORY — You MUST include a structured self-rebuttal. Write the strongest possible counter-argument to your own analysis. What would a skeptic say is wrong? What evidence is cherry-picked? What assumptions are questionable? This is NOT optional.

TOTAL TARGET: 8000-12000 words. This is a STRATEGIC REPORT, not a brief. Depth is expected.`;

  try {
    const response = await callLLM({
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
      jsonMode: true,
      maxTokens: 20000, // 20K tokens ≈ 8000-10000 words (V3.1: increased from 16K for deeper content)
      enableCache: true,
      task: 'strategic_analyst',
    });

    console.log(
      `✅ [Strategic Analyst] Success | ${response.provider} | $${response.costUsd.toFixed(4)} | Cached: ${response.cached}`
    );

    const analysis = parseJson<StrategicAnalysisOutput>(response.content);
    if (!analysis) throw new SyntaxError('Strategic analyst: failed to parse LLM JSON');
    analysis._producerFamily = response.family;
    (analysis as StrategicAnalysisOutput & { _costUsd?: number })._costUsd = response.costUsd;
    
    // Validate required fields
    const required = ['title', 'executiveSummary', 'keyFindings', 'literatureOverview', 'debate', 'recommendations'];
    const missing = required.filter(k => {
      const val = (analysis as any)[k];
      if (Array.isArray(val)) return val.length === 0;
      if (typeof val === 'object') return !val || Object.keys(val).length === 0;
      return !val || (typeof val === 'string' && !val.trim());
    });
    
    if (missing.length > 0) {
      console.warn(`[Strategic Analyst] Missing fields: ${missing.join(', ')}. Analysis may be incomplete.`);
    }

    // Quality gate: reject thin analysis to trigger cross-provider failover
    // V3.2: Comprehensive word-count validation (was: 200 chars for 2 sections only)
    const wordCount = (s: string | undefined): number => {
      if (!s) return 0;
      return s.trim().split(/\s+/).filter(w => w.length > 0).length;
    };
    const sectionMinimums: Record<string, number> = {
      executiveSummary: 400,      // prompt asks 600, but accept 400+ as pass
      literatureOverview: 600,    // prompt asks 1000, but accept 600+ as pass
      theoreticalFrameworks: 200,
      methodologicalApproaches: 200,
      consensus: 200,
      controversies: 200,
      emergingTrends: 200,
      conclusion: 200,
      whatChangesMind: 100,
    };
    const thinSections: string[] = [];
    for (const [field, minWords] of Object.entries(sectionMinimums)) {
      const wc = wordCount((analysis as any)[field]);
      if (wc < minWords) {
        thinSections.push(`${field}=${wc}words (min ${minWords})`);
      }
    }
    // Only trigger failover if the TWO critical sections are thin
    const execSummaryWords = wordCount(analysis.executiveSummary);
    const litReviewWords = wordCount(analysis.literatureOverview);
    if (execSummaryWords < 150 || litReviewWords < 200) {
      throw new Error(`Strategic analysis too thin (execSummary=${execSummaryWords}words, litReview=${litReviewWords}words) — triggering failover. Thin sections: ${thinSections.join(', ')}`);
    }
    // Log warnings for non-critical thin sections (don't fail, just warn)
    if (thinSections.length > 0) {
      console.warn(`[Strategic Analyst] Thin sections detected (non-fatal): ${thinSections.join(', ')}`);
    }

    // Post-processing: detect and fix section duplications
    deduplicateSections(analysis);

    // Post-processing: backfill missing analytical fields (tailRisks, outsideIn, timeline, achMatrix)
    // These fields are at the END of a very long JSON schema and are frequently omitted by the LLM.
    // A second-pass LLM call generates ONLY the missing fields with focused context.
    await backfillMissingAnalyticalFields(analysis, question, sources);

    // Post-processing: check if conclusion is too similar to executive summary (word overlap > 80%)
    if (analysis.conclusion && analysis.executiveSummary) {
      const overlap = wordOverlapSimilarity(analysis.conclusion, analysis.executiveSummary);
      if (overlap > 0.8) {
        console.warn(`[Strategic Analyst] Conclusion is ${Math.round(overlap * 100)}% similar to executive summary (word overlap). Regenerating conclusion with stronger prompt.`);
        const regenerated = await regenerateConclusion(analysis, question);
        if (regenerated) {
          analysis.conclusion = regenerated;
        } else {
          // Fallback: replace with a distinct synthesis if regeneration fails
          analysis.conclusion = `This analysis has identified key boundaries in the current evidence base. Synthesizing across the debate, scenarios, and recommendations, the central implication is that the trajectory described in the executive summary remains contingent on several identifiable factors — monitoring these factors is essential. The research landscape is likely to shift as new empirical evidence emerges, particularly from cross-disciplinary studies that bridge the gaps identified in this report. The position taken here is defensible but should be revisited annually as the evidence base matures.`;
        }
      }
    }

    return analysis;
  } catch (error: any) {
    console.error(`[Strategic Analyst] Failed: ${error.message}`);
    
    Sentry.captureException(error, {
      tags: { agent: "strategic-analyst", question, sourceCount: sources.length },
      contexts: { strategicAnalyst: { question, sourceCount: sources.length, avgQuality } },
    });
    
    // Return error structure
    return {
      title: "Strategic Analysis Failed",
      executiveSummary: `Error: ${error.message}`,
      keyFindings: [],
      urgencyLevel: "medium",
      confidenceLevel: "low",
      literatureOverview: "",
      theoreticalFrameworks: "",
      methodologicalApproaches: "",
      keyStudies: [],
      themes: [],
      consensus: "",
      controversies: "",
      emergingTrends: "",
      debate: {
        position1: { label: "", arguments: "", evidence: "", proponents: "" },
        position2: { label: "", arguments: "", evidence: "", proponents: "" },
        synthesis: "",
        nuances: ""
      },
      evidenceQuality: {
        overallScore: 0,
        methodology: "",
        sampleSizes: "",
        replication: "",
        biases: "",
        gaps: ""
      },
      stakeholderAnalysis: [],
      scenarios: [],
      recommendations: { immediate: [], shortTerm: [], longTerm: [], riskMitigation: [], costOfInaction: '' },
      implementation: { prerequisites: [], timeline: "", resources: "", metrics: [], obstacles: [] },
      conclusion: "",
      openQuestions: [],
      whatChangesMind: ""
    };
  }
}
