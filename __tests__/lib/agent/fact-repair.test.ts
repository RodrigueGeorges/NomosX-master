/**
 * Anchored fact repair — the generic revision editor could not fix fact-
 * checker fatals (claims come from tag-stripped text; verbatim find never
 * matched raw HTML). applyTolerantEdit bridges the html/tag gap, and
 * repairFactualDiscrepancies is the single-LLM-call driver.
 */

jest.mock('@/lib/llm/unified-llm', () => ({ callLLM: jest.fn() }));

import { applyTolerantEdit, repairFactualDiscrepancies } from '@/lib/agent/fact-repair';
import { callLLM } from '@/lib/llm/unified-llm';

const llmMock = callLLM as jest.Mock;

describe('applyTolerantEdit', () => {
  it('matches across inline tags and &nbsp; and replaces the span', () => {
    const html = '<p>Output rose by <strong>30%</strong> between 2020&nbsp;and 2025 in the region.</p>';
    const r = applyTolerantEdit(html, 'rose by 30% between 2020 and 2025', 'rose by 42% between 2020 and 2025');
    expect(r.ok).toBe(true);
    expect(r.html).toContain('rose by 42% between 2020 and 2025');
    expect(r.html).not.toContain('30%');
  });

  it('two occurrences → ambiguous, html unchanged', () => {
    const html = '<p>rose by 30% sharply</p><p>rose by 30% again</p>';
    const r = applyTolerantEdit(html, 'rose by 30%', 'rose by 42%');
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('ambiguous');
    expect(r.html).toBe(html);
  });

  it('match absorbing a citation <sup> element → spans_boundary', () => {
    const html = '<p>Exports rose by <sup data-evidence="E3">30%</sup> last year.</p>';
    const r = applyTolerantEdit(html, 'rose by 30%', 'rose by 42%');
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('spans_boundary');
    expect(r.html).toBe(html);
  });

  it('find with straight quote matches HTML entity-encoded apostrophe', () => {
    const html = '<p>The bank&rsquo;s reserves rose by 30% in 2024 sharply.</p>';
    const r = applyTolerantEdit(html, "bank's reserves rose by 30%", "bank's reserves rose by 42%");
    expect(r.ok).toBe(true);
    expect(r.html).toContain('reserves rose by 42%');
    expect(r.html).not.toContain('30%');
  });

  it('find with em-dash matches HTML &mdash; entity inside a token', () => {
    const html = '<p>Exports&mdash;once dominant&mdash;fell by 30% in 2024 sharply.</p>';
    const r = applyTolerantEdit(html, 'dominant—fell by 30%', 'dominant—fell by 42%');
    expect(r.ok).toBe(true);
    expect(r.html).toContain('fell by 42% in 2024 sharply');
    expect(r.html).not.toContain('30%');
  });

  it('replace containing a citation token → bad_replace', () => {
    const html = '<p>Exports rose by 30% last year.</p>';
    const r = applyTolerantEdit(html, 'rose by 30%', 'rose by 42% [SRC-9]');
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('bad_replace');
  });
});

describe('repairFactualDiscrepancies', () => {
  const disc = (i: number) => ({
    claim: `Exports rose by ${10 + i}% in 2024`, number: `${10 + i}%`,
    sourceRef: `SRC-${i}`, sourceSays: `source states ${40 + i}%`, fix: `correct to ${40 + i}%`,
  });

  beforeEach(() => jest.clearAllMocks());

  it('applies matching edits, skips non-matching, propagates cost', async () => {
    llmMock.mockResolvedValue({
      content: JSON.stringify({ edits: [
        { i: 1, find: 'rose by 10%', replace: 'rose by 40%' },
        { i: 2, find: 'rose by 11%', replace: 'rose by 41%' },
      ] }),
      costUsd: 0.004,
    });
    const html = '<p>Exports rose by 10% in 2024 sharply.</p><p>Unrelated sentence.</p>';
    const r = await repairFactualDiscrepancies(html, [disc(0), disc(1)]);
    expect(r.applied).toBe(1);
    expect(r.skipped).toBe(1);
    expect(r.skippedReasons).toEqual(['not_found:11%']);
    expect(r.costUsd).toBe(0.004);
    expect(r.html).toContain('rose by 40%');
  });

  it('unparseable LLM output → applied 0, llm_error, never throws', async () => {
    llmMock.mockResolvedValue({ content: 'not json at all', costUsd: 0.002 });
    const r = await repairFactualDiscrepancies('<p>rose by 10%</p>', [disc(0), disc(1)]);
    expect(r.applied).toBe(0);
    expect(r.skippedReasons).toEqual(['llm_error']);
    expect(r.costUsd).toBe(0.002);
    expect(r.html).toBe('<p>rose by 10%</p>');
  });

  it('LLM call failure → llm_error, zero cost, never throws', async () => {
    llmMock.mockRejectedValue(new Error('provider down'));
    const r = await repairFactualDiscrepancies('<p>x</p>', [disc(0)]);
    expect(r.applied).toBe(0);
    expect(r.skippedReasons).toEqual(['llm_error']);
    expect(r.costUsd).toBe(0);
  });
});
