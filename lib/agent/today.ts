/**
 * TODAY — single source of truth for "what day is it" inside prompts and
 * validators. Every prompt that asks a model to write a date MUST inject
 * this value: models otherwise guess the year from their training cutoff
 * (observed live: sentinels dated "By 23 February 2026" written as if the
 * present were late 2025).
 *
 * Routed through captureInputSync('time:today-iso') so record/replay cassettes
 * stay deterministic — a replay serves the recorded date, never wall-clock.
 */

import { captureInputSync } from './frozen-inputs';

/** ISO date (YYYY-MM-DD) for prompt injection and date validation. */
export function todayIso(now?: Date): string {
  // An explicit `now` (tests, injectable clocks) bypasses the freeze channel.
  if (now) return now.toISOString().slice(0, 10);
  return captureInputSync('time:today-iso', () => new Date().toISOString().slice(0, 10));
}

const MONTHS = ['january','february','march','april','may','june','july','august','september','october','november','december'];

/** Parse plausible dates in text: YYYY-MM-DD and "D Month YYYY". */
export function extractDates(text: string): Date[] {
  const out: Date[] = [];
  for (const m of text.matchAll(/\b(20\d{2})-(\d{2})-(\d{2})\b/g)) {
    const d = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`);
    if (!isNaN(d.getTime())) out.push(d);
  }
  for (const m of text.matchAll(/\b(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(20\d{2})\b/gi)) {
    const month = MONTHS.indexOf(m[2].toLowerCase()) + 1;
    const d = new Date(Date.UTC(Number(m[3]), month - 1, Number(m[1])));
    if (!isNaN(d.getTime())) out.push(d);
  }
  return out;
}
