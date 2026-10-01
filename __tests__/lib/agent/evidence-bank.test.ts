import { buildEvidenceBank, buildEvidenceBankBlock } from '@/lib/agent/evidence-bank';

const sources = Array.from({ length: 40 }, (_, i) => ({ id: `source-${i}` }));
const readings = sources.map(s => ({
  sourceId: s.id,
  confidence: 'high',
  claims: ['A reported finding with sufficient context for extraction.'.repeat(4)],
  results: ['The measured outcome differed between the two study groups.'],
  methods: ['An observational study with a matched comparison group.'],
  limitations: ['Residual confounding prevents a causal interpretation.'],
}));

describe('evidence bank context allocation', () => {
  it('allocates entries across the whole corpus before filling early sources', () => {
    const bank = buildEvidenceBank(readings, sources);
    expect(bank.entries.length).toBeLessThanOrEqual(120);
    expect(bank.perSource.size).toBe(40);
    for (const source of sources) {
      expect(bank.entries.some(e => e.sourceId === source.id && e.kind === 'limitation')).toBe(true);
    }
  });

  it('keeps whole entries under the prompt budget and exposes stable evidence IDs', () => {
    const bank = buildEvidenceBank(readings, sources);
    const block = buildEvidenceBankBlock(bank);
    expect(block.length).toBeLessThanOrEqual(9000);
    expect(block.endsWith('\n')).toBe(true);
    expect(block).toContain('[SRC-40]');
    for (const line of block.split('\n').filter(l => l.startsWith('- '))) {
      const id = line.match(/\((E\d+)\)/)?.[1];
      const entry = bank.entries.find(e => e.id === id);
      expect(entry).toBeDefined();
      expect(line.endsWith(entry!.text)).toBe(true);
    }
  });
});
