/**
 * Claim-ledger verification — the adversarial check on the EVIDENCE LEDGER
 * before pass 2/3 write it into prose (audit étape 2).
 *
 * The pass-1 friction map IS the claim ledger: every mechanism asserts a
 * claim and cites its supporting sources as [SRC-N]. The deterministic
 * claim→passage contract (Sprint 46) validates that citations point at
 * grounded sources; it cannot tell whether the cited passage actually
 * SUPPORTS the claim — that gap surfaced in calibration as the dominant
 * devil's-advocate kill shot ("non_evidence: no source supports this").
 *
 * This module resolves each mechanism's cited passages (reader extractions
 * preferred — they are the citable substance — else the best matching
 * window of abstract/full text) and asks an independent model whether each
 * passage supports the claim as written. Mechanisms that fail are injected
 * into the shared context as a directive: pass 2 stress-tests them as
 * unverified and pass 3 may not assert them. The register is repaired
 * mid-flight — before drafting, not after.
 *
 * Fail-open: a verifier error returns null and the passes proceed unchanged.
 * Budget: one call, ≤15 mechanisms × ≤2 passages.
 */

import { callLLM } from '../llm/unified-llm';
import { parseJson } from './json-utils';
import { bestPassage } from './devils-advocate';
import type { FrictionMap } from './analyst-multipass';

export interface ClaimLedgerResult {
  /** Mechanisms with at least one resolvable cited passage that were checked */
  checked: number;
  /** Mechanism ids the verifier ruled unsupported by their cited passages */
  unsupportedIds: number[];
  /** Mechanism ids only partially supported — qualify, don't assert */
  partialIds: number[];
  /** Mechanism ids with no cited [SRC-N] — unverifiable by construction */
  uncitedIds: number[];
  /** Directive appended to the shared analyst context ('' when clean) */
  directive: string;
  costUsd: number;
}

const SRC_RE = /\[?SRC-(\d+)\]?/g;

function citedIndexes(...texts: Array<string | undefined>): number[] {
  const out = new Set<number>();
  for (const t of texts) {
    if (!t) continue;
    for (const m of t.matchAll(SRC_RE)) out.add(Number(m[1]) - 1);
  }
  return [...out].sort((a, b) => a - b);
}

/** The citable substance for a corpus source: reader extractions first,
 *  else the window of abstract/full text closest to the claim. */
function passageFor(source: any, reading: any, claim: string): string {
  if (reading && reading.confidence !== 'low') {
    const extr = [
      ...(Array.isArray(reading.claims) ? reading.claims.slice(0, 4) : []),
      ...(Array.isArray(reading.results) ? reading.results.slice(0, 3) : []),
    ].map((x: any) => String(x).slice(0, 220)).join(' | ');
    if (extr.length >= 80) return extr.slice(0, 700);
  }
  const raw = String(source?.fullText ?? source?.abstract ?? source?.excerpt ?? '').trim();
  return raw.length >= 120 ? bestPassage(raw, claim, 700) : '';
}

export async function verifyClaimLedger(opts: {
  question: string;
  mechanisms: FrictionMap['mechanisms'];
  sources: any[];
  readings?: any[];
}): Promise<ClaimLedgerResult | null> {
  const mechanisms = (opts.mechanisms ?? []).slice(0, 15);
  if (mechanisms.length === 0) return null;

  const readingById = new Map<string, any>();
  for (const r of opts.readings ?? []) {
    if (r?.sourceId) readingById.set(r.sourceId, r);
  }

  const items: Array<{ id: number; claim: string; passages: string[] }> = [];
  const uncitedIds: number[] = [];
  for (const m of mechanisms) {
    const claim = String(m.description ?? '').trim();
    if (claim.length < 20) continue;
    const idxs = citedIndexes(...(Array.isArray(m.sources) ? m.sources : []), claim, ...(Array.isArray(m.dataPoints) ? m.dataPoints : []))
      .filter(i => i >= 0 && i < opts.sources.length);
    if (idxs.length === 0) { uncitedIds.push(m.id); continue; }
    const passages = idxs.slice(0, 2).map(i =>
      `[SRC-${i + 1}] ${passageFor(opts.sources[i], readingById.get(opts.sources[i]?.id), claim)}`
    ).filter(p => p.length > 30);
    if (passages.length === 0) { uncitedIds.push(m.id); continue; }
    items.push({ id: m.id, claim, passages });
  }
  if (items.length === 0) return null;

  try {
    const res = await callLLM({
      task: 'fact_check',
      jsonMode: true,
      temperature: 0,
      maxTokens: 1500,
      traceName: 'claim_ledger_verification',
      messages: [
        {
          role: 'system',
          content: `You verify an evidence ledger before a research note is drafted. For each numbered CLAIM, judge whether its CITED PASSAGES support it as written:
- "supported": the passages state or directly entail the claim.
- "partial": the passages support a narrower or weaker version only — the claim overstates, generalizes, or adds causality/scale the passage does not carry.
- "unsupported": the passages do not support the claim, or are unrelated.
Judge the passage text shown, not plausibility. Output strict JSON: {"verdicts":[{"id":0,"verdict":"supported|partial|unsupported","reason":"one short sentence"}]}`,
        },
        {
          role: 'user',
          content: `RESEARCH QUESTION: ${opts.question.slice(0, 400)}\n\n${items.map(it => `CLAIM ${it.id}: ${it.claim.slice(0, 400)}\nCITED PASSAGES:\n${it.passages.join('\n')}`).join('\n\n---\n\n')}`,
        },
      ],
    });
    const parsed = parseJson<{ verdicts?: Array<{ id?: number; verdict?: string }> }>(res.content);

    const itemIds = new Set(items.map(i => i.id));
    const unsupportedIds: number[] = [];
    const partialIds: number[] = [];
    for (const v of parsed?.verdicts ?? []) {
      if (typeof v?.id !== 'number' || !itemIds.has(v.id)) continue;
      if (v.verdict === 'unsupported') unsupportedIds.push(v.id);
      else if (v.verdict === 'partial') partialIds.push(v.id);
    }

    const parts: string[] = [];
    if (unsupportedIds.length) parts.push(`mechanisms #${unsupportedIds.join(', #')} are NOT supported by their cited passages — do not assert them; drop or recast as open questions`);
    if (partialIds.length) parts.push(`mechanisms #${partialIds.join(', #')} are only partially supported — assert only the narrower version the passages carry`);
    if (uncitedIds.length) parts.push(`mechanisms #${uncitedIds.join(', #')} cite no [SRC-N] — treat as unverified background, never as established evidence`);
    const directive = parts.length
      ? `CLAIM-LEDGER VERIFICATION (mandatory): ${parts.join('; ')}.`.slice(0, 900)
      : '';

    console.log(`[CLAIM LEDGER] ${items.length} mechanisms checked — ${unsupportedIds.length} unsupported, ${partialIds.length} partial, ${uncitedIds.length} uncited`);
    return {
      checked: items.length,
      unsupportedIds,
      partialIds,
      uncitedIds,
      directive,
      costUsd: res.costUsd ?? 0,
    };
  } catch (err) {
    console.warn('[CLAIM LEDGER] verification failed (non-blocking):', err instanceof Error ? err.message : err);
    return null;
  }
}
