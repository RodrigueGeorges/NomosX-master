/**
 * Branch evidence binding — deterministic per-branch evaluator.
 * S33 live-run finding: aggregate pool looked rich (56 ranked) while
 * individual plan branches sat at 0-2 ranked sources → the analyst wrote
 * unsupported claims on them → critic reject. Modeled on CRAG's per-question
 * retrieval evaluation and GPT Researcher's per-section evidence binding.
 */

import { auditBranchCoverage, auditBranchCitations, evidenceNotesFor, type PlanBranch } from '@/lib/agent/pipeline-steps/branch-coverage';

const nodes = (over: Partial<PlanBranch>[] = []): PlanBranch[] => [
  { subQuestion: 'Military balance', status: 'done', sourceIds: ['s1', 's2', 's3', 's4', 's5'] },
  { subQuestion: 'Energy transmission', status: 'done', sourceIds: ['s6', 's7'] },
  { subQuestion: 'Alliance realignment', status: 'done', sourceIds: ['s8', 's9', 's10'] },
  { subQuestion: 'Failed branch', status: 'failed', sourceIds: ['s11'] },
  ...over,
];

const pool = (ids: string[]) => ids.map(id => ({ id }));

describe('auditBranchCoverage', () => {
  it('verdicts each branch on ranked-pool survival, not raw scout count', () => {
    const cov = auditBranchCoverage(nodes(), pool(['s1', 's2', 's3', 's4', 's5', 's6', 's8', 'other1', 'other2']));
    expect(cov.entries.find(e => e.subQuestion === 'Military balance')).toMatchObject({ rankedSources: 5, verdict: 'strong' });
    expect(cov.entries.find(e => e.subQuestion === 'Energy transmission')).toMatchObject({ rankedSources: 1, verdict: 'weak' });
    expect(cov.entries.find(e => e.subQuestion === 'Alliance realignment')).toMatchObject({ rankedSources: 1, verdict: 'weak' });
    // Failed nodes are excluded — a dead branch is not a coverage obligation
    expect(cov.entries.find(e => e.subQuestion === 'Failed branch')).toBeUndefined();
    expect(cov).toMatchObject({ strong: 1, weak: 2, unsupported: 0 });
  });

  it('flags a branch whose evidence was entirely filtered out of the ranked pool', () => {
    const cov = auditBranchCoverage(
      [{ subQuestion: 'Niche angle', status: 'done', sourceIds: ['n1', 'n2', 'n3'] }],
      pool(['other']),
    );
    expect(cov.unsupported).toBe(1);
    expect(cov.entries[0].verdict).toBe('unsupported');
  });

  it('returns an empty audit when no plan nodes exist (flat scout)', () => {
    const cov = auditBranchCoverage([], pool(['a']));
    expect(cov.entries).toEqual([]);
  });
});

describe('auditBranchCitations', () => {
  it('maps [SRC-N] markers back to branches via positional topSources ids', () => {
    // Pool order defines SRC indices: s1→SRC-1, s6→SRC-2, s8→SRC-3
    const analysis = { verdict: 'Conclusion [SRC-1] and more [SRC-3]' };
    const audit = auditBranchCitations(nodes(), pool(['s1', 's6', 's8']), analysis);
    expect(audit.cited).toEqual(['Military balance', 'Alliance realignment']);
    expect(audit.uncited).toEqual(['Energy transmission']);
  });

  it('treats out-of-range markers and string analyses safely', () => {
    const audit = auditBranchCitations(nodes(), pool(['s1']), 'plain text [SRC-99] no refs');
    expect(audit.uncited.length).toBe(3);
  });
});

describe('evidenceNotesFor', () => {
  it('annotates weak and unsupported branches, leaves strong clean', () => {
    const cov = auditBranchCoverage(nodes(), pool(['s1', 's2', 's3', 's4', 's5', 's6']));
    const notes = evidenceNotesFor(cov);
    expect(notes.has('Military balance')).toBe(false);
    expect(notes.get('Energy transmission')).toContain('thin evidence');
    const cov2 = auditBranchCoverage(nodes(), pool(['s1', 's2', 's3', 's4', 's5']));
    expect(evidenceNotesFor(cov2).get('Alliance realignment')).toContain('NO ranked evidence');
  });
});
