/**
 * FUTURE-CLAIM BARRIER — deterministic pre-critic scan.
 *
 * Post-run v9 forensics: the analyst wrote unsourced future numbers from
 * memory ("MACF announced 2026" vs "no evidence it reduces emissions by
 * 2030" — two unsourced claims contradicting each other). The critic catches
 * some of these, but only if its decomposition happens to surface them.
 *
 * This barrier scans the analysis text BEFORE the critic: any sentence that
 * (a) references a year after the current one, (b) carries a quantitative
 * claim, and (c) has neither a citation marker nor a projection hedge is
 * flagged. Findings are persisted to stats and appended to the critic's
 * repair instructions so the re-analysis pass must source, label, or delete
 * them — the analyst may not assert future numbers from memory.
 */

import { captureInputSync } from './frozen-inputs';

export interface UnsourcedFutureClaim {
  snippet: string;
}

const CITATION_RE = /\[(?:SRC-|E)\d+\]|\[\d+\]/;
const PROJECTION_HEDGE_RE =
  /\b(project|projects|projected|projection|forecast|forecasts|forecasted|expect|expects|expected|scenario|scenarios|could|may|might|possible|possibly|likely|unlikely|estimate|estimates|estimated|model(?:s|led|ling)?|assess(?:s|ed|ment)?|predict|anticipate|risk|risks|unless|if\b)/i;
const NUMBER_RE = /\d/;
const MAGNITUDE_RE = /%|percent|\$|€|£|\b\d{1,3}(?:,\d{3})+\b|\b\d+(?:\.\d+)?\s?(?:million|billion|trillion|bn|tn|mt|gw|twh|ppm|basis\s+points?|bps|tons?|tonnes?|barrels?|jobs?|households?|companies|firms|plants?|facilities)\b/i;

function currentYear(): number {
  return Number(captureInputSync('time:future-claim-barrier-year', () => new Date().getFullYear()));
}

/** Split into sentence-ish chunks and flag dated-future quantitative claims
 *  with no citation and no projection label. Deterministic, no LLM. */
export function findUnsourcedFutureClaims(text: string, maxFindings = 10): UnsourcedFutureClaim[] {
  if (!text || text.length < 40) return [];
  const year = currentYear();
  const findings: UnsourcedFutureClaim[] = [];
  // Sentence split on ., !, ?, newline — keeps citation tags attached.
  const sentences = text.split(/(?<=[.!?])\s+|\n+/).map(s => s.trim()).filter(s => s.length >= 25);
  for (const s of sentences) {
    if (findings.length >= maxFindings) break;
    if (CITATION_RE.test(s) || PROJECTION_HEDGE_RE.test(s)) continue;
    // Dated future: an explicit year > current, or an explicit horizon word
    // ("by 2030", "in the next decade") combined with a magnitude number.
    const hasFutureYear = /\b(20\d{2})\b/.test(s) && Number(s.match(/\b(20\d{2})\b/)![1]) > year;
    const hasHorizonWord = /\b(next\s+decade|coming\s+decade|by\s+mid-?century|end\s+of\s+(?:the\s+)?decade|over\s+the\s+horizon)\b/i.test(s);
    if (!hasFutureYear && !hasHorizonWord) continue;
    if (!NUMBER_RE.test(s) || !MAGNITUDE_RE.test(s)) continue;
    findings.push({ snippet: s.length > 220 ? `${s.slice(0, 220)}…` : s });
  }
  return findings;
}
