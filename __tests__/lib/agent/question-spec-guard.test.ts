/**
 * P0-D regressions (run-11):
 * 1. checkQuestionSubstitution crashed on `spec.resolvable` when the caller's
 *    `spec?.resolvable !== false` guard passed undefined through
 *    (`undefined !== false` === true).
 * 2. embedBatch's zero-vector failure sentinel must never be persisted —
 *    isZeroEmbedding is the write-site guard.
 */
import { checkQuestionSubstitution } from '@/lib/agent/question-spec';
import { isZeroEmbedding } from '@/lib/agent/semantic-engine';

describe('checkQuestionSubstitution spec guard', () => {
  it('returns null — never throws — when spec is undefined', async () => {
    await expect(
      checkQuestionSubstitution({ question: 'q?', spec: undefined, verdict: 'A verdict long enough to pass the length guard.' })
    ).resolves.toBeNull();
  });

  it('returns null when spec is null or unresolvable', async () => {
    await expect(
      checkQuestionSubstitution({ question: 'q?', spec: null, verdict: 'A verdict long enough to pass the length guard.' })
    ).resolves.toBeNull();
    await expect(
      checkQuestionSubstitution({
        question: 'q?',
        spec: { resolution: 'x'.repeat(30), resolvable: false },
        verdict: 'A verdict long enough to pass the length guard.',
      })
    ).resolves.toBeNull();
  });
});

describe('isZeroEmbedding', () => {
  it('detects the embedBatch failure sentinel', () => {
    expect(isZeroEmbedding(new Array(1536).fill(0))).toBe(true);
    expect(isZeroEmbedding([])).toBe(true);
    expect(isZeroEmbedding(null)).toBe(true);
    expect(isZeroEmbedding(undefined)).toBe(true);
  });

  it('accepts real vectors', () => {
    const v = new Array(1536).fill(0);
    v[7] = 0.0123;
    expect(isZeroEmbedding(v)).toBe(false);
  });
});
