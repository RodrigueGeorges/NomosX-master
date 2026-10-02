/**
 * Regression: the Devil's Advocate / debate reviewers judged ONLY the question
 * ("the substantive analysis is omitted") because the analysis payload arrived
 * as a string or in the multipass shape the helper never read.
 */

import { buildAnalysisReviewText } from '../../../lib/agent/analysis-review-text';
import { buildSectionInventory } from '../../../lib/agent/structural-editor';

const QUESTION = 'Will small states retain agency?';

describe('buildAnalysisReviewText', () => {
  it('includes a plain-string analysis verbatim', () => {
    const text = buildAnalysisReviewText('The verdict is: agency survives [SRC-3].', QUESTION);
    expect(text).toContain('The verdict is: agency survives [SRC-3].');
    expect(text).toContain(QUESTION);
  });

  it('parses a JSON-string analysis and includes its fields', () => {
    const analysis = JSON.stringify({ title: 'T', verdict: 'Conditional yes [SRC-1]' });
    const text = buildAnalysisReviewText(analysis, QUESTION);
    expect(text).toContain('VERDICT');
    expect(text).toContain('Conditional yes [SRC-1]');
  });

  it('includes multipass friction-map substance (where citations live)', () => {
    const analysis = {
      title: 'Agency',
      throughLine: 'Small states trade sovereignty for leverage [SRC-2]',
      verdict: 'Qualified yes',
      frictionMap: {
        mechanisms: [{ name: 'coaltion pooling', evidence: '[SRC-5][SRC-9]' }],
        collisions: [{ clash: 'scale vs autonomy' }],
        dataLandscape: 'GDP data [SRC-11]',
      },
    };
    const text = buildAnalysisReviewText(analysis as any, QUESTION);
    expect(text).toContain('THROUGH LINE');
    expect(text).toContain('MECHANISMS');
    expect(text).toContain('coaltion pooling');
    expect(text).toContain('COLLISIONS');
  });

  it('never returns only the question for an unrecognized object shape', () => {
    const text = buildAnalysisReviewText({ someFutureField: 'payload' } as any, QUESTION);
    expect(text).toContain('someFutureField');
    expect(text.length).toBeGreaterThan(QUESTION.length + 30);
  });

  it('handles top-level multipass fields', () => {
    const text = buildAnalysisReviewText(
      { verdict: 'v', dataLandscape: 'stats [SRC-4]', quantitativeFindings: ['f1'], activeDynamics: ['d1'] } as any,
      QUESTION,
    );
    expect(text).toContain('DATA LANDSCAPE');
    expect(text).toContain('QUANTITATIVE FINDINGS');
    expect(text).toContain('ACTIVE DYNAMICS');
  });
});

describe('buildSectionInventory', () => {
  it('inventories multipass fields, not just the legacy schema', () => {
    const inventory = buildSectionInventory({
      title: 'Agency',
      throughLine: 'A long through line about agency and leverage [SRC-2] '.repeat(10),
      verdict: 'Yes, conditionally',
      causalChain: [{ step: 'a', then: 'b' }],
      keyFindings: ['f1', 'f2'],
      frictionMap: { mechanisms: [{ name: 'm1' }], collisions: [{ c: 'x' }] },
      whatToWatch: 'Election cycles [SRC-7]',
    });
    expect(inventory).toContain('Through Line');
    expect(inventory).toContain('Verdict');
    expect(inventory).toContain('Causal Chain');
    expect(inventory).toContain('Friction Map');
    expect(inventory).toContain('1 mechanisms');
    expect(inventory).toContain('What To Watch');
  });

  it('still inventories the legacy schema', () => {
    const inventory = buildSectionInventory({
      title: 'T',
      summary: 'A summary with enough words to matter [SRC-1]',
      consensus: 'Everyone agrees',
      debate: { pro: 'for', con: 'against', synthesis: 'both' },
    });
    expect(inventory).toContain('Executive Summary');
    expect(inventory).toContain('Consensus');
    expect(inventory).toContain('Debate');
  });

  it('produces a non-trivial inventory for a real multipass payload', () => {
    const inventory = buildSectionInventory({
      throughLine: 'x '.repeat(40),
      verdict: 'v',
      frictionMap: { mechanisms: [{ a: 1 }, { a: 2 }, { a: 3 }], collisions: [] },
    });
    // An empty inventory was the prod bug — reviewer scored ~25/100 on nothing
    expect(inventory.split('──').length).toBeGreaterThan(3);
  });
});
