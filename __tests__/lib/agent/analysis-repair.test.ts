import { applyAnalysisRepair, criticReviewText, repairImproves } from '@/lib/agent/analysis-repair';

const original = { keyFindings: ['Original finding [SRC-1]'], _meta: { totalCostUsd: 2 }, title: 'Title' };
const patch = { path: ['keyFindings', 0], before: original.keyFindings[0], after: 'Qualified finding [SRC-1]' };

describe('bounded analysis patches', () => {
  it('preserves untouched fields and host-owned costs without mutating the original', () => {
    const result = applyAnalysisRepair(original, { patches: [patch] }, new Set([1]));
    expect(result.keyFindings).toEqual([patch.after]);
    expect(result._meta).toEqual(original._meta);
    expect(result.title).toBe(original.title);
    expect(original.keyFindings[0]).toBe(patch.before);
  });
  it.each([
    { ...patch, path: ['_meta', 'totalCostUsd'] },
    { ...patch, path: ['keyFindings', '__proto__', 'polluted'] },
    { ...patch, before: 'stale version' },
    { ...patch, after: 'Unseen citation [SRC-2]' },
    { ...patch, path: ['keyFindings', 12] },
  ])('rejects invalid or stale edits atomically', invalid => {
    expect(() => applyAnalysisRepair(original, { patches: [invalid] }, new Set([1]))).toThrow();
    expect(original.keyFindings[0]).toBe(patch.before);
  });
  it('does not accept a replacement document or an empty patch', () => {
    expect(() => applyAnalysisRepair(original, original, new Set([1]))).toThrow();
    expect(() => applyAnalysisRepair(original, { patches: [] }, new Set([1]))).toThrow();
  });
});

describe('repair evaluation', () => {
  const before = { overallScore: 50, groundedness: 0.8, verdict: 'repair', contradictions: [1], citationIssues: [1] };
  it('requires improvement without factual regressions', () => {
    expect(repairImproves(before, { ...before, overallScore: 60 })).toBe(true);
    expect(repairImproves(before, before)).toBe(false);
    expect(repairImproves(before, { ...before, overallScore: 90, groundedness: 0.5 })).toBe(false);
    expect(repairImproves(before, { ...before, overallScore: NaN })).toBe(false);
    expect(repairImproves(before, { ...before, overallScore: 60, verdict: 'reject' })).toBe(false);
  });
  it('uses the same factual review scope for original and repaired analyses', () => {
    expect(criticReviewText({ title: 'Evidence [E1]', trajectory: 'Forecast', _meta: { cost: 1 } }))
      .toBe('{"title":"Evidence [SRC-1]"}');
  });
});
