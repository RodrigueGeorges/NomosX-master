/**
 * Evidence Bank — the WebWeaver/Perplexity pattern.
 *
 * Instead of letting the writer invent citations at generation time and
 * verifying them post-hoc, we build a bank of extracted evidence AT READING
 * TIME: every claim/method/result the reader extracted from a source becomes
 * a banked entry keyed to that source's [SRC-N] index.
 *
 * The analyst is told: every factual claim must trace to banked evidence.
 * Post-render, we validate that cited sources actually contributed evidence
 * to the bank (a citation to a source with zero extracted claims is a
 * hallucination risk — the model is citing metadata, not content).
 */

export interface EvidenceEntry {
  /** Bank id, e.g. "E12" */
  id: string;
  /** 1-based citation index matching [SRC-N] */
  sourceIndex: number;
  sourceId: string;
  kind: 'claim' | 'method' | 'result' | 'limitation';
  text: string;
  confidence: string;
}

export interface EvidenceBank {
  entries: EvidenceEntry[];
  /** sourceIndex → number of banked entries */
  perSource: Map<number, number>;
}

export interface BankValidation {
  citedCount: number;
  /** citations pointing at sources that contributed ≥1 bank entry */
  bankedCount: number;
  /** [SRC-N] indices cited but whose source yielded no extracted evidence */
  unbankedCitations: number[];
  /** % of banked sources actually cited in the output */
  utilizationPct: number;
  risk: 'low' | 'medium' | 'high';
}

const MAX_ENTRIES_PER_SOURCE = 4;
const MAX_BANK_ENTRIES = 60;

/**
 * Build the evidence bank from reader extracts + ranked sources.
 * `topSources` order defines [SRC-N] numbering (1-based).
 */
export function buildEvidenceBank(
  readings: Array<{
    sourceId: string;
    claims?: string[];
    methods?: string[];
    results?: string[];
    limitations?: string[];
    confidence?: string;
  }>,
  topSources: Array<{ id: string }>,
): EvidenceBank {
  const sourceIndexById = new Map<string, number>();
  topSources.forEach((s, i) => sourceIndexById.set(s.id, i + 1));

  const entries: EvidenceEntry[] = [];
  const perSource = new Map<number, number>();
  let seq = 0;

  const push = (sourceIndex: number, sourceId: string, kind: EvidenceEntry['kind'], text: string, confidence: string) => {
    if (entries.length >= MAX_BANK_ENTRIES) return;
    if ((perSource.get(sourceIndex) ?? 0) >= MAX_ENTRIES_PER_SOURCE) return;
    const clean = text.replace(/\s+/g, ' ').trim();
    if (clean.length < 25) return;
    entries.push({ id: `E${++seq}`, sourceIndex, sourceId, kind, text: clean.slice(0, 300), confidence });
    perSource.set(sourceIndex, (perSource.get(sourceIndex) ?? 0) + 1);
  };

  for (const r of readings) {
    const idx = sourceIndexById.get(r.sourceId);
    if (!idx) continue;
    const conf = r.confidence || 'medium';
    for (const c of (r.claims || []).slice(0, 3)) push(idx, r.sourceId, 'claim', c, conf);
    for (const res of (r.results || []).slice(0, 2)) push(idx, r.sourceId, 'result', res, conf);
    for (const m of (r.methods || []).slice(0, 1)) push(idx, r.sourceId, 'method', m, conf);
    for (const l of (r.limitations || []).slice(0, 1)) push(idx, r.sourceId, 'limitation', l, conf);
  }

  return { entries, perSource };
}

/**
 * Compact prompt block: tells the analyst which evidence exists per source.
 * The writer may only ground factual claims in banked evidence.
 */
export function buildEvidenceBankBlock(bank: EvidenceBank): string {
  if (bank.entries.length === 0) return '';
  const lines: string[] = [
    '## EVIDENCE BANK — VERIFIED EXTRACTED CLAIMS',
    'The reader extracted the following claims from each source. EVERY factual assertion you make must trace to one of these entries (or to source metadata). Do NOT attribute to a source a claim that is not banked below — if you need a claim that is missing, say the evidence is absent rather than fabricating support.',
    '',
  ];
  const bySource = new Map<number, EvidenceEntry[]>();
  for (const e of bank.entries) {
    const arr = bySource.get(e.sourceIndex) ?? [];
    arr.push(e);
    bySource.set(e.sourceIndex, arr);
  }
  for (const [srcIdx, entries] of [...bySource.entries()].sort((a, b) => a[0] - b[0])) {
    lines.push(`### [SRC-${srcIdx}]`);
    for (const e of entries) {
      lines.push(`- (${e.kind}${e.confidence === 'low' ? ', low-conf' : ''}) ${e.text}`);
    }
  }
  return lines.join('\n').slice(0, 5000);
}

/**
 * Post-render validation: cited sources should have contributed evidence.
 * A citation to a source with zero banked entries means the model cited
 * something the reader never extracted — classic citation hallucination.
 */
export function validateCitationsAgainstBank(
  citationNumbers: number[],
  bank: EvidenceBank,
): BankValidation {
  const cited = [...new Set(citationNumbers)];
  const unbanked = cited.filter(n => !bank.perSource.has(n));
  const bankedSources = bank.perSource.size;
  const citedBanked = cited.filter(n => bank.perSource.has(n)).length;
  const utilizationPct = bankedSources > 0 ? Math.round((citedBanked / bankedSources) * 100) : 0;
  const unbankedRatio = cited.length > 0 ? unbanked.length / cited.length : 0;
  return {
    citedCount: cited.length,
    bankedCount: citedBanked,
    unbankedCitations: unbanked,
    utilizationPct,
    risk: unbankedRatio > 0.4 ? 'high' : unbankedRatio > 0.15 ? 'medium' : 'low',
  };
}
