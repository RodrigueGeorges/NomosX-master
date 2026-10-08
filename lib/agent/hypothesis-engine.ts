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
import { assertExecutionActive } from '../worker/execution-scope';

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
  /** Best evidence-supported hypothesis — the thesis the analyst is bound to.
   *  The pipeline forms the thesis FROM the corpus (radar → sources →
   *  judged hypotheses → thesis), not the reverse: the central claim must
   *  stay within what the readings already support. */
  boundThesis?: HypothesisVerdict;
  /** How the bound thesis was chosen — 'registered' (a pre-posed hypothesis
   *  won) or 'corpus_derived' (no registered hypothesis was supported, so
   *  the corpus itself was asked what it defensibly claims). */
  thesisOrigin?: 'registered' | 'corpus_derived';
  /** True when registered verdicts AND corpus derivation both found nothing
   *  supportable — the corpus cannot yield a defensible position. The
   *  pipeline should refuse early rather than spend the analyst tail on a
   *  guaranteed-weak thesis (the HELD factory). */
  thesisAbsent?: boolean;
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

    // Select the bound thesis: the hypothesis the corpus supports BEST.
    // Ranking = verdict weight (supported 2 / partially 1 / else 0) ×
    // confidence, requiring ≥1 direct supporting source. This is the
    // source-first thesis contract: the analyst's central claim must stay
    // within it — anything bolder is speculation, not thesis.
    // Only PRE-REGISTERED hypotheses are bindable: a verdict carrying an id
    // the framing step never emitted is a post-hoc invention — binding to it
    // would defeat the anti-motivated-reasoning point of registration. The
    // bound statement is the ORIGINAL registered text, not the judge's
    // paraphrase: the contract is the posed hypothesis, not its restatement.
    const byId = new Map(hypotheses.map(h => [h.id, h]));
    const foreign = verdicts.filter(v => !byId.has(v.id));
    if (foreign.length > 0) {
      console.warn(`[HYPOTHESIS JUDGE] ${foreign.length} verdict(s) with unregistered id(s) ignored for binding: ${foreign.map(v => v.id).join(', ')}`);
    }
    const weight = (v: HypothesisVerdict) =>
      (v.verdict === 'supported' ? 2 : v.verdict === 'partially_supported' ? 1 : 0) * v.confidence;
    const winningVerdict = verdicts
      .filter(v => byId.has(v.id) && v.supportingEvidence.length > 0 && weight(v) > 0)
      .sort((a, b) => weight(b) - weight(a))[0];
    let derivedCostUsd = 0;
    let boundThesis = winningVerdict
      ? { ...winningVerdict, statement: byId.get(winningVerdict.id)!.statement }
      : undefined;
    let thesisOrigin: JudgeOutput['thesisOrigin'];
    let thesisAbsent = false;
    if (boundThesis) {
      thesisOrigin = 'registered';
    } else if (verdicts.length > 0) {
      // Bottom-up fallback: the top-down hypotheses were all inconclusive —
      // maybe the corpus supports a DIFFERENT claim. Ask it directly before
      // declaring the item unpublishable. This is the source-first contract
      // completed: the thesis comes from the evidence, not the question.
      // Errors degrade open (unknown ≠ empty); an explicit "nothing
      // defensible" marks the corpus thesis_absent for early refusal.
      try {
        const derived = await deriveThesisFromCorpus(sources, readings);
        derivedCostUsd = derived?.costUsd ?? 0;
        if (derived && derived.defensible !== false && derived.claim && derived.supportingEvidence.length >= 2) {
          boundThesis = {
            id: 'T1', statement: derived.claim,
            verdict: derived.confidence >= 50 ? 'supported' : 'partially_supported',
            confidence: Math.min(derived.confidence, 85),
            supportingEvidence: derived.supportingEvidence,
            contraryEvidence: derived.contraryEvidence ?? [],
            reasoning: `[corpus-derived] ${derived.reasoning}`,
          };
          thesisOrigin = 'corpus_derived';
          console.log(`[HYPOTHESIS JUDGE] Corpus-derived thesis bound: "${derived.claim.slice(0, 100)}" (${derived.supportingEvidence.length} sources)`);
        } else {
          thesisAbsent = true;
          console.warn(`[HYPOTHESIS JUDGE] No supportable thesis — registered verdicts inconclusive AND corpus derivation found nothing defensible`);
        }
      } catch {
        assertExecutionActive(); // dead scope aborts, does not read as "empty corpus"
        // Derivation failed open — unknown is not empty; proceed unbound.
      }
    }

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
      // The mandatory THESIS BINDING is NOT emitted here — it is re-injected
      // post-SARA from stats.thesisBinding (analyst-context), the single
      // injection point that compression can never drop. Duplicating it in
      // this compressible block would waste ~350 chars × every analyst pass.
    ].join('\n') : '';

    const summary = verdicts.map(v => `${v.id}=${v.verdict}@${v.confidence}`).join(', ');
    console.log(`[HYPOTHESIS JUDGE] Verdicts: ${summary}${boundThesis ? ` | bound: ${boundThesis.id} (${boundThesis.supportingEvidence.length} sources)` : ''}`);
    return { verdicts, verdictBlock, boundThesis, thesisOrigin, thesisAbsent, costUsd: (response.costUsd ?? 0) + derivedCostUsd };
  } catch (err: any) {
    assertExecutionActive(); // cancelled scope must abort, not degrade to "unbound"
    console.warn(`[HYPOTHESIS JUDGE] Failed (non-blocking): ${err.message}`);
    return { verdicts: [], verdictBlock: '', costUsd: 0 };
  }
}

/**
 * Post-analyst adherence check — one cheap call. The bound thesis is formed
 * FROM the corpus upstream; this verifies the analyst's `verdict` stays
 * inside it (or is strictly narrower). A verdict that exceeds the bound
 * thesis is exactly the failure mode the DA later kills ("no source
 * supports the central claim") — catching it here makes the binding real.
 */
export async function checkThesisAdherence(
  analysisVerdict: string,
  boundStatement: string,
): Promise<{ adhered: boolean; reason: string; costUsd: number }> {
  try {
    const response = await callLLM({
      messages: [{
        role: 'system',
        content: 'You verify that an analyst verdict stays within a pre-bound, evidence-supported thesis. The verdict may be narrower or equal in scope — never broader, never on a different claim. Answer strictly in JSON.',
      }, {
        role: 'user',
        content: `BOUND THESIS (evidence-supported ceiling):\n"${boundStatement}"\n\nANALYST VERDICT:\n"${analysisVerdict}"\n\nDoes the verdict stay within the bound thesis or a strictly narrower formulation of it?\nReturn JSON: {"adhered": true|false, "reason": "one sentence"}`,
      }],
      temperature: 0,
      jsonMode: true,
      maxTokens: 200,
      enableCache: false,
      task: 'elenchus',
    });
    const parsed = parseJson(response.content) as any;
    return {
      adhered: parsed?.adhered !== false,
      reason: String(parsed?.reason ?? ''),
      costUsd: response.costUsd ?? 0,
    };
  } catch (err: any) {
    // A dead scope must abort the run, not masquerade as "adhered".
    assertExecutionActive();
    console.warn(`[THESIS BINDING] adherence check failed (non-blocking): ${err.message}`);
    return { adhered: true, reason: 'check unavailable', costUsd: 0 };
  }
}

/**
 * Bottom-up thesis derivation — the complement of top-down judging. When no
 * pre-registered hypothesis is supported, the corpus itself is asked: "what
 * is the single strongest defensible central claim here?" This completes the
 * source-first contract: hypotheses are *tested* top-down, but the thesis is
 * *found* bottom-up when the test comes back empty.
 *
 * Returns null/undefended explicitly when the evidence supports nothing —
 * that explicit "no" is what lets the pipeline refuse early instead of
 * burning the analyst tail on a guaranteed-weak thesis.
 */
export interface DerivedThesis {
  claim: string;
  supportingEvidence: string[];   // [SRC-N] citations required
  contraryEvidence: string[];
  confidence: number;             // 0-100
  reasoning: string;
  defensible: boolean;            // false = corpus explicitly supports nothing
  costUsd: number;
}

export async function deriveThesisFromCorpus(
  sources: any[],
  readings?: any[],
): Promise<DerivedThesis | null> {
  const sourceContext = sources.slice(0, 25).map((s: any, i: number) => {
    const reading = readings?.[i];
    const claims = reading?.claims?.slice(0, 3).join('; ') || s.abstract?.slice(0, 300) || 'No content';
    return `[SRC-${i + 1}] ${s.title} (${s.year || 'N/A'}, ${s.provider})\n  Key content: ${claims}`;
  }).join('\n');

  const response = await callLLM({
    messages: [{
      role: 'system',
      content: `You are a rigorous research director. Given ONLY an evidence base, you derive the single strongest central claim the evidence can actually defend. You never inflate weak evidence into a thesis — answering "nothing here supports a defensible position" is a valid and respected output.`,
    }, {
      role: 'user',
      content: `EVIDENCE BASE:\n${sourceContext}\n\nTASK: Identify the single strongest defensible central claim this evidence supports.\n\nRules:\n1. The claim must be directly supported by at least 2 independent [SRC-N] sources\n2. Prefer narrower, precise claims over sweeping ones — defensibility beats drama\n3. If no claim meets the 2-source bar, answer defensible=false honestly\n4. Every supporting citation must be a real [SRC-N] from the base\n\nReturn JSON:\n{"defensible": true|false, "claim": "the central claim or empty", "supportingEvidence": ["[SRC-N] what it shows"], "contraryEvidence": ["[SRC-N] what cuts against"], "confidence": 0-100, "reasoning": "two sentences"}`,
    }],
    temperature: 0.1,
    jsonMode: true,
    maxTokens: 1200,
    enableCache: false,
    task: 'elenchus',
  });

  const parsed = parseJson(response.content) as any;
  return {
    claim: String(parsed?.claim ?? '').trim(),
    supportingEvidence: Array.isArray(parsed?.supportingEvidence) ? parsed.supportingEvidence.map(String) : [],
    contraryEvidence: Array.isArray(parsed?.contraryEvidence) ? parsed.contraryEvidence.map(String) : [],
    confidence: Math.max(0, Math.min(100, Number(parsed?.confidence) || 0)),
    reasoning: String(parsed?.reasoning ?? ''),
    defensible: parsed?.defensible !== false,
    costUsd: response.costUsd ?? 0,
  };
}
