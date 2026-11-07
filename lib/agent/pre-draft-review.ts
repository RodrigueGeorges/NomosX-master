/**
 * Pre-draft scope review — the "short thesis/outline review BEFORE full
 * drafting" called for by the source-to-publication audit.
 *
 * The 3-pass analyst is the most expensive stage (~7-10min, bulk of run
 * cost). Today scope/causality defects are only caught AFTER all three
 * passes: thesis adherence post-analyst, outline critique post-analyst,
 * DA at the tail. A verdict that exceeds the evidence-bound thesis then
 * costs a full re-analysis to repair.
 *
 * This module reviews the PASS-1 friction map — the emerging thesis
 * direction — with one cheap call BEFORE pass 2 invests in it. When the
 * direction exceeds the bound thesis or asserts causality the corpus
 * cannot carry, it emits a directive appended to the shared source
 * context: pass 2 stress-tests against it and pass 3 synthesizes under
 * it. Scope/causality is repaired mid-flight, not only at the gate.
 *
 * Fail-open: a review error returns null and the passes proceed unchanged.
 */

import { callLLM } from '../llm/unified-llm';
import { parseJson } from './json-utils';
import type { FrictionMap } from './analyst-multipass';

export interface PreDraftReviewResult {
  /** false = the pass-1 direction exceeds what the evidence/thesis supports */
  withinScope: boolean;
  /** Human-readable defects found (bounded) */
  violations: string[];
  /** Directive text appended to the analyst context — '' when clean */
  directive: string;
  costUsd: number;
}

const REVIEW_PROMPT = `You are a research director reviewing the DRAFT DIRECTION of a 3-pass analysis — before the expensive synthesis passes run. You are not judging prose; you are judging whether the emerging causal thesis stays inside what the evidence can carry.

RESEARCH QUESTION:
{QUESTION}
{BOUND_THESIS}
PASS-1 FRICTION MAP (emerging mechanisms + cross-domain collisions):
{MAP}

EVIDENCE BASE: {NSOURCES} sources in corpus.

TASK — adversarial scope review:
1. SCOPE: If a bound thesis is given, does the mechanism set imply a verdict STRONGER or BROADER than it? Flag mechanisms whose description asserts causation, scale, or domains the bound thesis does not cover.
2. CAUSALITY: Which mechanisms assert causal claims (X causes Y) where the map itself only supports correlation or co-occurrence? Temporal status "present_fact" cannot ground "future_extrapolation" claims.
3. EVIDENCE: Which mechanisms rest on thin sourcing — few sources, or sources listed that cannot plausibly support the described mechanism?

Return JSON:
{
  "withinScope": true|false,
  "violations": ["mechanism #N asserts causation the map only supports as correlation", "..."],
  "directive": "2-4 sentences of mandatory correction for the next analysis passes — concrete, naming the mechanism ids and the required downgrade (e.g. 'treat #3/#7 as correlation_only, do not extrapolate')"
}

Rules: at most 6 violations, most severe first. withinScope=false requires at least one violation. directive must be imperative and under 900 characters. If the direction is sound, return withinScope=true, violations=[], directive="".`;

function summarizeMap(map: FrictionMap): string {
  const mech = (map.mechanisms ?? []).slice(0, 20).map(m =>
    `#${m.id} [${m.temporalStatus}] ${m.domain}: ${(m.description ?? '').slice(0, 180)} — sources: ${(m.sources ?? []).length}, trajectory: ${(m.trajectoryHint ?? 'none').slice(0, 80)}`
  ).join('\n');
  const coll = (map.collisions ?? []).slice(0, 10).map(c =>
    `COLLISION ${c.domainA}×${c.domainB}: ${(c.friction ?? '').slice(0, 140)}`
  ).join('\n');
  return `${mech}${coll ? '\n' + coll : ''}`.slice(0, 6000);
}

/**
 * Review the pass-1 direction. Returns null on failure or trivial input —
 * callers treat null as "no directive".
 */
export async function reviewDraftDirection(opts: {
  question: string;
  frictionMap: FrictionMap;
  boundThesis?: string;
  sourceCount: number;
}): Promise<PreDraftReviewResult | null> {
  const mapText = summarizeMap(opts.frictionMap);
  if (mapText.length < 80) return null;

  const boundBlock = opts.boundThesis
    ? `\nBOUND THESIS (the verdict the corpus was contracted to support — the analysis may go NARROWER, never broader):\n"${opts.boundThesis.slice(0, 600)}"\n`
    : '';

  const prompt = REVIEW_PROMPT
    .replace('{QUESTION}', opts.question.slice(0, 500))
    .replace('{BOUND_THESIS}', boundBlock)
    .replace('{MAP}', mapText)
    .replace('{NSOURCES}', String(opts.sourceCount));

  try {
    const response = await callLLM({
      messages: [{ role: 'user', content: prompt }],
      temperature: 0,
      jsonMode: true,
      maxTokens: 900,
      enableCache: true,
      task: 'critique',
    });
    const costUsd = typeof response.costUsd === 'number' ? response.costUsd : 0;
    const parsed = parseJson<Partial<PreDraftReviewResult>>(response.content);
    if (!parsed || typeof parsed.withinScope !== 'boolean') return null;

    const violations = (parsed.violations ?? [])
      .filter((v): v is string => typeof v === 'string' && v.length > 5)
      .slice(0, 6);
    // A clean bill requires BOTH flags — violations listed under
    // withinScope:true still count as defects.
    const withinScope = parsed.withinScope === true && violations.length === 0;
    let directive = typeof parsed.directive === 'string'
      ? parsed.directive.slice(0, 900).trim()
      : '';
    if (!withinScope && !directive && violations.length > 0) {
      directive = `Mandatory correction for the remaining passes: ${violations.slice(0, 4).join(' | ')}`.slice(0, 900);
    }

    return {
      withinScope,
      violations,
      // Only inject a directive when there is something to correct —
      // an empty directive would just burn pass-2/3 context.
      directive: withinScope ? '' : directive,
      costUsd,
    };
  } catch (err) {
    console.warn('[PreDraftReview] failed (non-blocking):', String(err).slice(0, 120));
    return null;
  }
}
