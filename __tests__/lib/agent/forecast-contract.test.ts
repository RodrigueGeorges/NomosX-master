/**
 * forecast_contract gate regressions — Claude §1.6 (run-12): every step
 * contract is a deterministic hard-fail motif. A forecast note must BE the
 * forecast: origin 'forecast' + probability in [0.10, 0.90], a parseable
 * future horizon ≤ 5y, ≤ 3 500 words, and the asked question displayed.
 */
import { evaluatePublicationGate } from '@/lib/agent/publication-gate';

const SOURCE_IDS = Array.from({ length: 20 }, (_, i) => `src-${i + 1}`);
const FQ = 'Will the ICJ rule on the Kuwait drone strike within 18 months?';
const para = Array.from({ length: 300 }, (_, i) =>
  `Sentence ${i + 1} reports a documented development in the region <sup class="cite"><a href="#ref-${(i % 20) + 1}">${(i % 20) + 1}</a></sup>.`
).join(' ');
const HTML = `<article><h1>${FQ}</h1><p>${para}</p></article>`;
const HTML_NO_QUESTION = `<article><h1>Regional developments</h1><p>${para}</p></article>`;

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

const GOOD_CONTRACT = {
  thesisOrigin: 'forecast',
  probability: 0.42,
  horizon: FQ, // "within 18 months" → parseable future horizon
  question: FQ,
};

const contractCheck = (g: ReturnType<typeof evaluatePublicationGate>) =>
  g.checks.find(c => c.checkType === 'forecast_contract');

describe('evaluatePublicationGate — forecast_contract (§1.6)', () => {
  it('check absent when no forecastQuestion reached the run (fail-open)', () => {
    const g = evaluatePublicationGate({ ...BASE_INPUT });
    expect(contractCheck(g)).toBeUndefined();
  });

  it('passes when every contract holds', () => {
    const g = evaluatePublicationGate({ ...BASE_INPUT, forecastContract: GOOD_CONTRACT });
    expect(contractCheck(g)?.passed).toBe(true);
    expect(g.decision).toBe('publish');
  });

  it('hard-fails with thesis_origin_not_forecast when the thesis stayed descriptive', () => {
    const g = evaluatePublicationGate({
      ...BASE_INPUT,
      forecastContract: { ...GOOD_CONTRACT, thesisOrigin: 'corpus_derived' },
    });
    const c = contractCheck(g);
    expect(c?.passed).toBe(false);
    expect(c?.details).toContain('thesis_origin_not_forecast');
    expect(g.decision).toBe('hold');
  });

  it('hard-fails on missing or out-of-band probability', () => {
    for (const probability of [undefined, 0.03, 0.97]) {
      const g = evaluatePublicationGate({
        ...BASE_INPUT,
        forecastContract: { ...GOOD_CONTRACT, probability },
      });
      expect(contractCheck(g)?.passed).toBe(false);
      expect(contractCheck(g)?.details).toMatch(/probability/);
      expect(g.decision).toBe('hold');
    }
  });

  it('hard-fails on a past or unparseable horizon', () => {
    const past = evaluatePublicationGate({
      ...BASE_INPUT,
      forecastContract: { ...GOOD_CONTRACT, horizon: 'by end of 2020' },
    });
    expect(contractCheck(past)?.details).toMatch(/horizon_not_future|horizon_unparseable/);
    expect(past.decision).toBe('hold');

    const garbage = evaluatePublicationGate({
      ...BASE_INPUT,
      forecastContract: { ...GOOD_CONTRACT, horizon: 'soon-ish' },
    });
    expect(contractCheck(garbage)?.details).toContain('horizon_unparseable');
    expect(garbage.decision).toBe('hold');
  });

  it('hard-fails above the 3 500-word cap', () => {
    const bigPara = Array.from({ length: 900 }, (_, i) =>
      `Sentence ${i + 1} reports a documented development <sup class="cite"><a href="#ref-${(i % 20) + 1}">${(i % 20) + 1}</a></sup>.`
    ).join(' ');
    const g = evaluatePublicationGate({
      ...BASE_INPUT,
      html: `<article><h1>${FQ}</h1><p>${bigPara}</p></article>`,
      forecastContract: GOOD_CONTRACT,
    });
    expect(contractCheck(g)?.details).toContain('word_cap_exceeded');
    expect(g.decision).toBe('hold');
  });

  it('hard-fails when the question is not displayed in the note', () => {
    const g = evaluatePublicationGate({
      ...BASE_INPUT,
      html: HTML_NO_QUESTION,
      forecastContract: GOOD_CONTRACT,
    });
    expect(contractCheck(g)?.details).toContain('question_not_displayed');
    expect(g.decision).toBe('hold');
  });
});
