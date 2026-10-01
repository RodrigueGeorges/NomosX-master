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
const MAX_BANK_ENTRIES = 120;

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

  const queues = readings.map(r => ({
    reading: r,
    candidates: [
      ...(r.results || []).slice(0, 1).map(text => ({ kind: 'result' as const, text })),
      ...(r.limitations || []).slice(0, 1).map(text => ({ kind: 'limitation' as const, text })),
      ...(r.claims || []).slice(0, 3).map(text => ({ kind: 'claim' as const, text })),
      ...(r.methods || []).slice(0, 1).map(text => ({ kind: 'method' as const, text })),
      ...(r.results || []).slice(1, 2).map(text => ({ kind: 'result' as const, text })),
    ].filter(e => typeof e.text === 'string' && e.text.replace(/\s+/g, ' ').trim().length >= 25),
  }));
  for (let round = 0; round < MAX_ENTRIES_PER_SOURCE; round++) {
    for (const { reading: r, candidates } of queues) {
      const idx = sourceIndexById.get(r.sourceId);
      const entry = candidates[round];
      if (idx && entry) push(idx, r.sourceId, entry.kind, entry.text, r.confidence || 'medium');
    }
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
    '## EVIDENCE BANK — READER EXTRACTS (NOT INDEPENDENT VERIFICATION)',
    'These entries are reader extractions, not proof that every claim is correct. Trace factual assertions to the supplied evidence, preserve limitations, and distinguish extracted findings from inferences. Missing entries may reflect the context budget, not missing research. Never invent support.',
    '',
  ];
  const bySource = new Map<number, EvidenceEntry[]>();
  for (const e of bank.entries) {
    const arr = bySource.get(e.sourceIndex) ?? [];
    arr.push(e);
    bySource.set(e.sourceIndex, arr);
  }
  let block = lines.join('\n') + '\n';
  const groups = [...bySource.entries()].sort((a, b) => a[0] - b[0]);
  for (let round = 0; round < MAX_ENTRIES_PER_SOURCE; round++) {
    for (const [srcIdx, entries] of groups) {
      const e = entries[round];
      if (!e) continue;
      const line = `- (${e.id}) [SRC-${srcIdx}] (${e.kind}${e.confidence === 'low' ? ', low-conf' : ''}) ${e.text}\n`;
      if (block.length + line.length <= 9000) block += line;
    }
  }
  return block;
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
