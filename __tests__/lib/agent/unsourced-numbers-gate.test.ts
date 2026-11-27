/**
 * unsourced_numbers gate regressions — Claude §1.5 (run-12): statistical
 * numbers surviving the final deterministic sanitize must hard-fail the
 * publication barrier. 0 unsourced numbers in a published note.
 */
import { evaluatePublicationGate } from '@/lib/agent/publication-gate';

const SOURCE_IDS = Array.from({ length: 20 }, (_, i) => `src-${i + 1}`);
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

describe('evaluatePublicationGate — unsourced_numbers check', () => {
  it('check absent when the numerical gate never ran (fail-open)', () => {
    const g = evaluatePublicationGate({ ...BASE_INPUT });
    expect(g.checks.some(c => c.checkType === 'unsourced_numbers')).toBe(false);
  });

  it('passes with 0 remaining violations', () => {
    const g = evaluatePublicationGate({ ...BASE_INPUT, unsourcedNumberCount: 0 });
    const c = g.checks.find(c => c.checkType === 'unsourced_numbers');
    expect(c?.passed).toBe(true);
  });

  it('hard-fails on any remaining unsourced number — published notes carry 0', () => {
    const g = evaluatePublicationGate({ ...BASE_INPUT, unsourcedNumberCount: 3 });
    const c = g.checks.find(c => c.checkType === 'unsourced_numbers');
    expect(c?.passed).toBe(false);
    expect(c?.details).toContain('3');
    expect(g.decision).toBe('hold');
  });
});
