/**
 * NomosX HYPOTHESIS ENGINE — Framing + Judgment
 *
 * Transforms the pipeline from "critique downstream" to "hypothesis upstream",
 * the working method of elite consultancies (McKinsey's hypothesis-driven
 * problem solving, RAND's analytic tradecraft):
 *
 * 1. FRAMING (before analysis): decompose the question into 3-5 testable
 *    hypotheses, each with explicit evidence requirements.
 * 2. JUDGE (after reading): assess each hypothesis against actual evidence
 *    → supported / refuted / inconclusive, with confidence and citations.
 *
 * The verdict table is injected into the ANALYST prompt, forcing a
 * position-first, calibrated structure — the analysis can no longer be vague
 * because it must answer precise, pre-registered hypotheses.
 */

import { callLLM } from '../llm/unified-llm';
import { parseJson } from './json-utils';

// ============================================================================
// TYPES
// ============================================================================

export interface Hypothesis {
  id: string;                 // "H1"
  statement: string;          // Falsifiable claim
  rationale: string;          // Why this hypothesis matters for the question
  evidenceNeeded: string[];   // What evidence would confirm/refute it
}

export interface FramingOutput {
  hypotheses: Hypothesis[];
  keyUnknowns: string[];      // Things no source is likely to answer
  costUsd: number;
}

export interface HypothesisVerdict {
  id: string;
  statement: string;
  verdict: 'supported' | 'refuted' | 'partially_supported' | 'inconclusive';
  confidence: number;         // 0-100
  supportingEvidence: string[]; // [SRC-N] citations with one-line summary
  contraryEvidence: string[];
  reasoning: string;          // Short justification of verdict
}

export interface JudgeOutput {
  verdicts: HypothesisVerdict[];
  verdictBlock: string;       // Ready-to-inject prompt block for ANALYST
  costUsd: number;
}

// ============================================================================
// 1. FRAMING AGENT
// ============================================================================

export async function framingAgent(query: string): Promise<FramingOutput> {
  console.log(`[FRAMING] Decomposing question into testable hypotheses: "${query.slice(0, 80)}"`);

  try {
    const response = await callLLM({
      messages: [{
        role: 'system',
        content: `You are a senior research director at an elite think tank, trained in hypothesis-driven analysis (McKinsey problem structuring, RAND analytic tradecraft). Decompose research questions into precise, FALSIFIABLE hypotheses before any evidence is collected. This prevents confirmation bias and vague conclusions.`,
      }, {
        role: 'user',
        content: `RESEARCH QUESTION: ${query}

TASK: Produce 3-5 testable hypotheses that, once judged against evidence, will fully answer this question.

Rules:
1. Each hypothesis must be FALSIFIABLE — a specific claim that evidence could confirm or refute
2. Cover the main causal claim, the magnitude/timing, at least one counter-hypothesis, and one second-order effect
3. State precisely what evidence would be needed to judge each one
4. Include key unknowns that sources likely CANNOT answer (epistemic honesty)

Return JSON:
{
  "hypotheses": [
    {
      "id": "H1",
      "statement": "Specific falsifiable claim",
      "rationale": "Why this matters for the question",
      "evidenceNeeded": ["Type of evidence needed", "..."]
    }
  ],
  "keyUnknowns": ["What no source will likely answer"]
}`,
      }],
      temperature: 0.2,
      jsonMode: true,
      maxTokens: 2500,
      enableCache: true,
      task: 'topic_classification',
    });

    const parsed = parseJson(response.content) as any;
    const hypotheses: Hypothesis[] = (parsed?.hypotheses ?? []).slice(0, 5).map((h: any, i: number) => ({
      id: h.id || `H${i + 1}`,
      statement: String(h.statement || ''),
      rationale: String(h.rationale || ''),
      evidenceNeeded: Array.isArray(h.evidenceNeeded) ? h.evidenceNeeded.map(String) : [],
    })).filter((h: Hypothesis) => h.statement.length > 10);

    console.log(`[FRAMING] ${hypotheses.length} hypotheses framed`);
    return {
      hypotheses,
      keyUnknowns: Array.isArray(parsed?.keyUnknowns) ? parsed.keyUnknowns.map(String) : [],
      costUsd: response.costUsd ?? 0,
    };
  } catch (err: any) {
    console.warn(`[FRAMING] Failed (non-blocking): ${err.message}`);
    return { hypotheses: [], keyUnknowns: [], costUsd: 0 };
  }
}

// ============================================================================
// 2. HYPOTHESIS JUDGE
// ============================================================================

export async function hypothesisJudge(
  hypotheses: Hypothesis[],
  sources: any[],
  readings?: any[],
  quantEvidence?: string,
): Promise<JudgeOutput> {
  if (hypotheses.length === 0) {
    return { verdicts: [], verdictBlock: '', costUsd: 0 };
  }
  console.log(`[HYPOTHESIS JUDGE] Judging ${hypotheses.length} hypotheses against ${sources.length} sources`);

  const sourceContext = sources.slice(0, 25).map((s: any, i: number) => {
    const reading = readings?.[i];
    const claims = reading?.claims?.slice(0, 3).join('; ') || s.abstract?.slice(0, 300) || 'No content';
    return `[SRC-${i + 1}] ${s.title} (${s.year || 'N/A'}, ${s.provider})\n  Key content: ${claims}`;
  }).join('\n');

  const hypothesisList = hypotheses.map(h =>
    `${h.id}: "${h.statement}"\n  Evidence needed: ${h.evidenceNeeded.join('; ')}`
  ).join('\n\n');

  try {
    const response = await callLLM({
      messages: [{
        role: 'system',
        content: `You are an impartial evidence judge at an elite research institution. You assess pre-registered hypotheses STRICTLY against the provided evidence. You never let a hypothesis pass without concrete supporting citations. "Inconclusive" is a respectable verdict — false certainty is not.`,
      }, {
        role: 'user',
        content: `PRE-REGISTERED HYPOTHESES:
${hypothesisList}

EVIDENCE BASE:
${sourceContext}
${quantEvidence ? `\n${quantEvidence}\n` : ''}
TASK: Judge each hypothesis against the evidence.

Rules:
1. verdict = "supported" requires ≥2 independent sources pointing the same direction
2. verdict = "refuted" requires clear contrary evidence, not mere absence
3. Absence of evidence → "inconclusive" (never fabricate support)
4. Every citation must be a real [SRC-N] from the evidence base
5. Confidence reflects evidence quality AND quantity (max 85 for observational-only evidence)

Return JSON:
{
  "verdicts": [
    {
      "id": "H1",
      "statement": "restate hypothesis",
      "verdict": "supported|refuted|partially_supported|inconclusive",
      "confidence": 0-100,
      "supportingEvidence": ["[SRC-2] one-line summary of what it shows"],
      "contraryEvidence": ["[SRC-7] one-line summary"],
      "reasoning": "2-3 sentence justification"
    }
  ]
}`,
      }],
      temperature: 0.15,
      jsonMode: true,
      maxTokens: 4000,
      enableCache: false,
      task: 'elenchus',
    });

    const parsed = parseJson(response.content) as any;
    const verdicts: HypothesisVerdict[] = (parsed?.verdicts ?? []).map((v: any) => ({
      id: String(v.id || ''),
      statement: String(v.statement || ''),
      verdict: ['supported', 'refuted', 'partially_supported', 'inconclusive'].includes(v.verdict) ? v.verdict : 'inconclusive',
      confidence: Math.max(0, Math.min(100, Number(v.confidence) || 0)),
      supportingEvidence: Array.isArray(v.supportingEvidence) ? v.supportingEvidence.map(String) : [],
      contraryEvidence: Array.isArray(v.contraryEvidence) ? v.contraryEvidence.map(String) : [],
      reasoning: String(v.reasoning || ''),
    }));

    // Build injection block for ANALYST
    const verdictBlock = verdicts.length > 0 ? [
      '═══ HYPOTHESIS VERDICTS (pre-registered, judged against evidence) ═══',
      ...verdicts.map(v =>
        `${v.id} [${v.verdict.toUpperCase()} @ ${v.confidence}%]: ${v.statement}\n  Reasoning: ${v.reasoning}\n  For: ${v.supportingEvidence.join(' | ') || 'none'}\n  Against: ${v.contraryEvidence.join(' | ') || 'none'}`
      ),
      '',
      'RULES: Structure your analysis around these verdicts. Lead with what is SUPPORTED.',
      'Explicitly acknowledge INCONCLUSIVE hypotheses as open questions — do not paper over them.',
      'Your stated confidence must not exceed the judged confidence for each claim.',
    ].join('\n') : '';

    const summary = verdicts.map(v => `${v.id}=${v.verdict}@${v.confidence}`).join(', ');
    console.log(`[HYPOTHESIS JUDGE] Verdicts: ${summary}`);
    return { verdicts, verdictBlock, costUsd: response.costUsd ?? 0 };
  } catch (err: any) {
    console.warn(`[HYPOTHESIS JUDGE] Failed (non-blocking): ${err.message}`);
    return { verdicts: [], verdictBlock: '', costUsd: 0 };
  }
}
