/**
 * buildRequiredCoverageBlock — the deep-planner branches are the analyst's
 * scope contract. Regression for: a "broader patterns" question answered
 * mono-country because the analyst never saw the decomposition.
 */

import { buildRequiredCoverageBlock } from '@/lib/agent/pipeline-steps/analyst-context';

describe('buildRequiredCoverageBlock', () => {
  it('injects every active branch as a mandatory coverage requirement', () => {
    const block = buildRequiredCoverageBlock([
      { subQuestion: 'How do EU grid policies differ?', status: 'done' },
      { subQuestion: 'What is the US storage trajectory?', status: 'done' },
      { subQuestion: 'Which financing models scale?', status: 'scouting' },
    ]);
    expect(block).toContain('REQUIRED COVERAGE');
    expect(block).toContain('3 investigation branches');
    expect(block).toContain('EU grid policies');
    expect(block).toContain('US storage trajectory');
    expect(block).toContain('financing models');
    expect(block).toContain('MUST address EVERY branch');
  });

  it('excludes failed branches — a dead end must not become a requirement', () => {
    const block = buildRequiredCoverageBlock([
      { subQuestion: 'Covered branch', status: 'done' },
      { subQuestion: 'Branch that found no sources', status: 'failed' },
      { subQuestion: 'Another covered branch', status: 'done' },
    ]);
    expect(block).not.toContain('no sources');
    expect(block).toContain('Covered branch');
    expect(block).toContain('Another covered branch');
    expect(block).toContain('2 investigation branches');
  });

  it('returns empty for a degenerate plan — one branch is the question itself', () => {
    expect(buildRequiredCoverageBlock([{ subQuestion: 'Q', status: 'done' }])).toBe('');
    expect(buildRequiredCoverageBlock([])).toBe('');
    expect(buildRequiredCoverageBlock([
      { subQuestion: '', status: 'done' },
      { status: 'done' },
    ])).toBe('');
  });
});
