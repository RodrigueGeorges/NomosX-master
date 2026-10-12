/**
 * Thesis-adherence gate regressions — S39b forensic: `stats.thesisBinding.
 * adhered` was computed but advisory-only; a verdict that added causal
 * claims to a descriptive binding sailed to publication. Contract now:
 * the shipped verdict must stay inside the evidence-bound thesis —
 * breach (or unavailable certification) hard-fails the gate.
 */
import { evaluatePublicationGate } from '@/lib/agent/publication-gate';
import { diagnoseGateResult } from '@/lib/agent/gate-diagnosis';

const SOURCE_IDS = Array.from({ length: 20 }, (_, i) => `src-${i + 1}`);

// ~1500 words of plain prose, most sentences carrying an in-range citation —
// enough to clear word_count / citation_density / source_depth without
// tripping style or scenario requirements.
const HTML = `<article><p>${Array.from({ length: 140 }, (_, i) =>
  `Sentence ${i + 1} reports a documented development in the region <sup class="cite"><a href="#ref-${(i % 20) + 1}">${(i % 20) + 1}</a></sup>.`
).join(' ')}</p></article>`;

const BASE_INPUT = {
  format: 'brief',
  html: HTML,
  sourceIds: SOURCE_IDS,
  trustScore: 80,
  qualityScore: 72,
  citationCoverage: 0.9,
  devilsAdvocateScore: 62,
  fatalChallenges: 0,
};

describe('evaluatePublicationGate — thesis_adherence check', () => {
  it('does not emit the check when no thesis was bound', () => {
    const g = evaluatePublicationGate({ ...BASE_INPUT });
    expect(g.checks.some(c => c.checkType === 'thesis_adherence')).toBe(false);
  });

  it('passes when the verdict stays within the bound thesis', () => {
    const g = evaluatePublicationGate({
      ...BASE_INPUT,
      thesisAdherence: { adhered: true, evaluationComplete: true },
    });
    const c = g.checks.find(c => c.checkType === 'thesis_adherence');
    expect(c?.passed).toBe(true);
  });

  it('hard-fails on a breach — a verdict exceeding the bound thesis cannot publish', () => {
    const base = evaluatePublicationGate({ ...BASE_INPUT });
    const breached = evaluatePublicationGate({
      ...BASE_INPUT,
      thesisAdherence: { adhered: false, evaluationComplete: true, reason: 'adds causal claim beyond descriptive binding' },
    });
    const c = breached.checks.find(c => c.checkType === 'thesis_adherence');
    expect(c?.passed).toBe(false);
    expect(c?.details).toContain('causal claim');
    // Hard failure: whatever the baseline decision was, a breach must hold.
    expect(breached.decision).toBe('hold');
    if (base.decision === 'publish' || base.decision === 'revise') {
      expect(breached.decision).not.toBe(base.decision);
    }
  });

  it('fails closed when the adherence evaluation is incomplete', () => {
    const g = evaluatePublicationGate({
      ...BASE_INPUT,
      thesisAdherence: { adhered: undefined, evaluationComplete: false },
    });
    const c = g.checks.find(c => c.checkType === 'thesis_adherence');
    expect(c?.passed).toBe(false);
    expect(c?.details).toContain('not certified');
    expect(g.decision).toBe('hold');
  });

  it('produces a typed THESIS_BREACH diagnosis routed at correction', () => {
    const g = evaluatePublicationGate({
      ...BASE_INPUT,
      thesisAdherence: { adhered: false, evaluationComplete: true, reason: 'overclaims' },
    });
    const d = g.diagnoses?.find(d => d.checkType === 'thesis_adherence');
    expect(d?.code).toBe('THESIS_BREACH');
    expect(d?.category).toBe('evidence');
    expect(d?.fix).toContain('bound thesis');
  });
});
