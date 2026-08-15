/**
 * ANALYST ReAct — NomosX
 *
 * Version agentique de l'ANALYST : au lieu de recevoir toutes les sources
 * et de produire une analyse en une passe, l'agent ReAct peut :
 * - Chercher des sources supplémentaires en cours de raisonnement
 * - Lire des sources spécifiques pour vérifier des claims
 * - Demander un débat structuré quand des sources se contredisent
 * - Explorer le knowledge graph pour des connexions cross-domain
 * - Décider lui-même quand il a assez d'évidence
 *
 * C'est le saut qualitatif : d'un "synthétiseur passif" à un "analyste actif".
 *
 * Patterns :
 * - ReAct (Yao et al., 2023) : Thought → Action → Observation
 * - StateAct (ACL 2025 REALM) : self-prompting + state tracking
 * - ReflAct (EMNLP 2025) : goal-state reflection
 * - Perplexity Agent API : bounded loop
 *
 * Intégration dans le pipeline :
 * - Activé quand l'option `useReAct: true` est passée à analystMultipass
 * - Sinon, l'ANALYST multipass classique est utilisé (backward compatible)
 * - Le résultat est converti au même format MultiPassAnalysis pour que le
 *   reste du pipeline (renderer, trust scoring, etc.) n'ait pas besoin de changements
 */

import { reactLoop, type ReActConfig, type ReActResult } from './react-loop';
import { ANALYST_TOOLS, executeTool, type ToolExecutionContext } from './tool-registry';
import { callLLM } from '../llm/unified-llm';
import { parseJson } from './json-utils';

/** Detect if text is primarily French (simple heuristic — matches analyst-multipass.ts) */
function detectLanguage(text: string): string {
  const frenchIndicators = [' le ', ' la ', ' les ', ' des ', ' une ', ' est ', ' sont ', ' dans ', ' pour ', ' sur ', ' avec ', ' par ', ' que ', ' qui ', ' ne ', ' pas '];
  const lower = ` ${text.toLowerCase()} `;
  const frenchCount = frenchIndicators.filter(w => lower.includes(w)).length;
  return frenchCount >= 3 ? 'fr' : 'en';
}

// ─── Types ──────────────────────────────────────────────────────────────────

export interface AnalystReActOptions {
  /** Max reasoning steps. Default: 8 (keeps cost bounded) */
  maxSteps?: number;
  /** Budget cap for the ReAct loop in USD. Default: 0.30 */
  maxCostUsd?: number;
  /** Domain for domain-aware prompting */
  domain?: string;
  /** Depth: "brief" or "strategic" */
  depth?: 'brief' | 'strategic';
  /** Context block (institutional memory, etc.) */
  contextBlock?: string;
  /** Label for logging */
  label?: string;
}

export interface AnalystReActResult {
  /** The final analysis (same shape as MultiPassAnalysis from analyst-multipass) */
  analysis: any;
  /** ReAct loop trace (for debugging and dashboard) */
  trace: ReActResult;
  /** Total cost */
  costUsd: number;
  /** New source IDs discovered during reasoning */
  discoveredSourceIds: string[];
}

// ─── Main Entry Point ───────────────────────────────────────────────────────

/**
 * Run the ANALYST as a ReAct agent.
 *
 * @param question - The research question
 * @param sources - Initial sources (from SCOUT + RANK)
 * @param readings - READER output (claims per source)
 * @param options - Configuration
 * @param toolCtx - Tool execution context (search, read, debate, kg functions)
 */
export async function analystReAct(
  question: string,
  sources: any[],
  readings: any[],
  options: AnalystReActOptions = {},
  toolCtx: Omit<ToolExecutionContext, 'sources' | 'readings' | 'query'>,
): Promise<AnalystReActResult> {
  const label = options.label || 'AnalystReAct';
  const lang = detectLanguage(question);
  const isFrench = lang === 'fr';
  const depth = options.depth || 'brief';
  const isStrategic = depth === 'strategic';

  console.log(`[${label}] Starting ReAct analysis: ${sources.length} sources, ${depth} mode, lang=${lang}`);

  // Build the system prompt
  const systemPrompt = buildAnalystSystemPrompt(question, sources, readings, options, isFrench, isStrategic);

  // Build the initial input (what the agent sees first)
  const initialInput = buildInitialInput(question, sources, readings, isFrench, isStrategic);

  // Configure the ReAct loop
  const config: ReActConfig = {
    systemPrompt,
    tools: ANALYST_TOOLS,
    maxSteps: options.maxSteps ?? (isStrategic ? 12 : 8),
    maxCostUsd: options.maxCostUsd ?? (isStrategic ? 0.50 : 0.30),
    task: isStrategic ? 'strategic_analysis' : 'analyst_brief',
    temperature: 0.3,
    maxTokens: isStrategic ? 8000 : 4000,
    label,
  };

  // Build the full tool context
  const fullToolCtx: ToolExecutionContext = {
    ...toolCtx,
    query: question,
    sources,
    readings,
  };

  // Run the loop
  const trace = await reactLoop(config, initialInput, fullToolCtx);

  console.log(`[${label}] Completed: ${trace.steps.length} steps, $${trace.totalCostUsd.toFixed(4)}, stop=${trace.stopReason}`);

  // Parse the final answer into the MultiPassAnalysis shape
  const analysis = parseAnalysisOutput(trace.finalAnswer, question, sources, isStrategic);

  // Attach ReAct metadata
  analysis._meta = {
    ...analysis._meta,
    reactTrace: {
      steps: trace.steps.length,
      stopReason: trace.stopReason,
      toolCallsTotal: trace.steps.reduce((sum, s) => sum + (s.toolCalls?.length || 0), 0),
      discoveredSources: trace.discoveredSourceIds.length,
      totalCostUsd: trace.totalCostUsd,
      totalDurationMs: trace.totalDurationMs,
    },
    totalCostUsd: trace.totalCostUsd,
  };

  return {
    analysis,
    trace,
    costUsd: trace.totalCostUsd,
    discoveredSourceIds: trace.discoveredSourceIds,
  };
}

// ─── System Prompt Builder ──────────────────────────────────────────────────

function buildAnalystSystemPrompt(
  question: string,
  sources: any[],
  readings: any[],
  options: AnalystReActOptions,
  isFrench: boolean,
  isStrategic: boolean,
): string {
  const lang = isFrench ? 'fr' : 'en';
  const depthInstruction = isStrategic
    ? isFrench
      ? 'Produisez une analyse stratégique approfondie (10-15 pages équivalent) avec tous les détails, scénarios, et recommandations.'
      : 'Produce a comprehensive strategic analysis (10-15 page equivalent) with full detail, scenarios, and recommendations.'
    : isFrench
      ? 'Produisez une analyse concise mais rigoureuse (3-5 pages équivalent).'
      : 'Produce a concise but rigorous analysis (3-5 page equivalent).';

  const sourceList = sources.slice(0, 20).map((s, i) => {
    const title = s.title || s.rawTitle || 'Untitled';
    const year = s.year || s.publishedYear || '';
    const abstract = (s.abstract || '').slice(0, 300);
    return `[SRC-${i + 1}] ${title} (${year})\n  ${abstract}`;
  }).join('\n\n');

  const readingsBlock = readings.length > 0
    ? `\n\n## READER OUTPUT (pre-extracted claims)\n${readings.slice(0, 15).map((r: any) => {
        const idx = sources.findIndex(s => s.id === r.sourceId || s.sourceId === r.sourceId) + 1;
        return `[SRC-${idx}] Claims: ${(r.claims || []).join('; ')}`;
      }).join('\n')}`
    : '';

  return `You are NomosX's senior research analyst — a rigorous, evidence-grounded analyst who produces decision-ready analyses for policy makers and strategists.

## YOUR TASK
Analyze the research question below using the provided sources. You can use tools to search for more sources, read specific sources in detail, request debates on contradictions, and query the knowledge graph.

## RESEARCH QUESTION
${question}

## AVAILABLE SOURCES (pre-loaded)
${sourceList}${readingsBlock}

${options.contextBlock ? `## INSTITUTIONAL MEMORY\n${options.contextBlock}` : ''}

## OUTPUT FORMAT
Your final answer MUST be valid JSON with this structure:
{
  "title": "Analytical, specific title (not just the question rephrased)",
  "summary": "Executive summary — 200-400 words. The key takeaway for a busy decision-maker. Must include [SRC-N] citations.",
  "consensus": "What the sources agree on. Cite [SRC-N] for each point.",
  "disagreements": "Where sources conflict or diverge. Be specific about the nature of the disagreement.",
  "debate": {
    "pro": "Strongest arguments for position A, with [SRC-N] citations",
    "con": "Strongest arguments for position B, with [SRC-N] citations",
    "synthesis": "How to reconcile the disagreement — what the evidence actually supports"
  },
  "evidence": "Assessment of evidence quality: methodological strength, sample sizes, potential biases, gaps",
  "implications": "Strategic implications for decision-makers",
  "risks": "Key risks and uncertainties",
  "open_questions": "What we still don't know — questions for further research",
  "what_changes_mind": "What evidence would change this analysis"
}

${depthInstruction}

## RULES
1. Every factual claim MUST have a [SRC-N] citation. Uncited claims are unacceptable.
2. If you don't have enough evidence for a claim, say so explicitly — do NOT fabricate.
3. Use tools proactively: if you notice a gap, search for sources. If sources contradict, request a debate.
4. Be intellectually honest: acknowledge uncertainty, present both sides, don't force a conclusion.
5. Write in ${isFrench ? 'French' : 'English'}.
6. When you have sufficient evidence and have resolved contradictions, call "finish".

## REASONING APPROACH
1. First, assess what you have: are the sources sufficient? Are there obvious gaps?
2. If gaps exist, use search_sources or request_more_sources to fill them.
3. Read key sources in detail with read_source to verify specific claims.
4. If sources disagree on a key point, use request_debate to structure the disagreement.
5. When you have a comprehensive view, produce the final JSON analysis.`;
}

// ─── Initial Input Builder ──────────────────────────────────────────────────

function buildInitialInput(
  question: string,
  sources: any[],
  readings: any[],
  isFrench: boolean,
  isStrategic: boolean,
): string {
  if (isFrench) {
    return `Analysez la question suivante en utilisant les sources fournies. Si les sources sont insuffisantes, utilisez les outils pour en chercher d'autres. Quand vous avez assez d'évidence, produisez l'analyse finale en JSON.

Question: ${question}

Vous avez ${sources.length} sources pré-chargées. Commencez par évaluer si elles sont suffisantes pour répondre à la question, puis utilisez les outils si nécessaire.`;
  }
  return `Analyze the following question using the provided sources. If sources are insufficient, use tools to search for more. When you have enough evidence, produce the final JSON analysis.

Question: ${question}

You have ${sources.length} pre-loaded sources. Start by assessing whether they are sufficient to answer the question, then use tools if needed.`;
}

// ─── Parse the final answer into MultiPassAnalysis shape ────────────────────

function parseAnalysisOutput(
  finalAnswer: string,
  question: string,
  sources: any[],
  isStrategic: boolean,
): any {
  // Try to parse as JSON first
  try {
    const parsed = parseJson<any>(finalAnswer);
    if (parsed && parsed.title) {
      // Ensure all required fields exist
      return {
        title: parsed.title || question.slice(0, 80),
        summary: parsed.summary || '',
        consensus: parsed.consensus || '',
        disagreements: parsed.disagreements || '',
        debate: parsed.debate || { pro: '', con: '', synthesis: '' },
        evidence: parsed.evidence || parsed.evidenceAssessment || '',
        implications: parsed.implications || parsed.strategicImplications || '',
        risks: parsed.risks || '',
        open_questions: parsed.open_questions || parsed.openQuestions || '',
        what_changes_mind: parsed.what_changes_mind || parsed.whatChangesMind || '',
        causalChain: parsed.causalChain || [],
        _meta: {},
      };
    }
  } catch {
    // Not JSON — try to extract JSON from the text
    const jsonMatch = finalAnswer.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = parseJson<any>(jsonMatch[0]);
        if (parsed && parsed.title) {
          return normalizeAnalysis(parsed, question);
        }
      } catch {}
    }
  }

  // Fallback: treat the whole thing as a summary
  console.warn('[AnalystReAct] Could not parse structured output — using raw text as summary');
  return {
    title: question.slice(0, 80),
    summary: finalAnswer.slice(0, 5000),
    consensus: '',
    disagreements: '',
    debate: { pro: '', con: '', synthesis: '' },
    evidence: '',
    implications: '',
    risks: '',
    open_questions: '',
    what_changes_mind: '',
    causalChain: [],
    _meta: { parseWarning: 'Could not extract structured JSON — using raw text' },
  };
}

function normalizeAnalysis(parsed: any, question: string): any {
  return {
    title: parsed.title || question.slice(0, 80),
    summary: parsed.summary || '',
    consensus: parsed.consensus || '',
    disagreements: parsed.disagreements || '',
    debate: parsed.debate || { pro: '', con: '', synthesis: '' },
    evidence: parsed.evidence || parsed.evidenceAssessment || '',
    implications: parsed.implications || parsed.strategicImplications || '',
    risks: parsed.risks || '',
    open_questions: parsed.open_questions || parsed.openQuestions || '',
    what_changes_mind: parsed.what_changes_mind || parsed.whatChangesMind || '',
    causalChain: parsed.causalChain || [],
    _meta: {},
  };
}
