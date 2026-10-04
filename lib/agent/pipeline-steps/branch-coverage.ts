// pipeline-steps/branch-coverage.ts — per-branch evidence binding.
//
// Borrowed from the open deep-research stacks' core discipline (CRAG's
// per-question retrieval evaluator; GPT Researcher's per-section evidence
// binding; open_deep_research's isolated sub-agent findings): an aggregate
// pool can look rich while a required branch has near-zero ranked evidence —
// the analyst then writes unsupported claims on that branch (the exact S33
// live failure: 56 ranked sources overall, individual plan branches at 0-2).
//
// All checks here are deterministic — sourceIds already carry the
// branch→source attribution the scout recorded, and [SRC-N] markers map
// positionally onto topSources. Zero LLM cost.

export interface PlanBranch {
  subQuestion: string;
  status: string;
  sourceCount?: number;
  /** Source ids this branch's scout produced — carried from the plan node. */
  sourceIds?: string[];
}

export type BranchVerdict = 'strong' | 'weak' | 'unsupported';

export interface BranchCoverageEntry {
  subQuestion: string;
  /** How many of the branch's scout sources survived into the ranked pool. */
  rankedSources: number;
  verdict: BranchVerdict;
}

export interface BranchCoverage {
  entries: BranchCoverageEntry[];
  strong: number;
  weak: number;
  unsupported: number;
}

const STRONG_MIN = 4;
const WEAK_MIN = 1;

/**
 * Post-rank evaluator: for each required branch, count how many of ITS
 * scout-retrieved sources survived ranking. A branch whose evidence was all
 * filtered out cannot support grounded claims — flag it before the analyst
 * writes on thin air.
 */
export function auditBranchCoverage(
  planNodes: PlanBranch[],
  topSources: Array<{ id?: string }>,
): BranchCoverage {
  const rankedIds = new Set(topSources.map(s => s.id).filter(Boolean));
  const entries: BranchCoverageEntry[] = [];
  for (const node of planNodes) {
    if (!node.subQuestion || node.status === 'failed') continue;
    const rankedSources = (node.sourceIds ?? []).filter(id => rankedIds.has(id)).length;
    entries.push({
      subQuestion: node.subQuestion,
      rankedSources,
      verdict: rankedSources >= STRONG_MIN ? 'strong' : rankedSources >= WEAK_MIN ? 'weak' : 'unsupported',
    });
  }
  return {
    entries,
    strong: entries.filter(e => e.verdict === 'strong').length,
    weak: entries.filter(e => e.verdict === 'weak').length,
    unsupported: entries.filter(e => e.verdict === 'unsupported').length,
  };
}

/**
 * Post-analyst audit: which branches did the analysis actually cite?
 * [SRC-N] markers map positionally to topSources[N-1]; a branch is "cited"
 * when at least one of its scout sources is referenced. Zero-cited branches
 * are the deterministic counterpart of the outline critic's missing
 * dimensions — and they feed the same blackboard retrieval machinery.
 */
export function auditBranchCitations(
  planNodes: PlanBranch[],
  topSources: Array<{ id?: string }>,
  analysis: unknown,
): { cited: string[]; uncited: string[] } {
  const analysisStr = typeof analysis === 'string' ? analysis : JSON.stringify(analysis ?? {});
  const citedIndices = new Set(
    (analysisStr.match(/\[SRC-(\d+)\]/g) ?? [])
      .map(m => Number(m.replace(/\D/g, '')))
      .filter(n => n >= 1 && n <= topSources.length),
  );
  const citedIds = new Set([...citedIndices].map(i => topSources[i - 1]?.id).filter(Boolean));
  const cited: string[] = [];
  const uncited: string[] = [];
  for (const node of planNodes) {
    if (!node.subQuestion || node.status === 'failed') continue;
    const hasCitation = (node.sourceIds ?? []).some(id => citedIds.has(id));
    (hasCitation ? cited : uncited).push(node.subQuestion);
  }
  return { cited, uncited };
}

/**
 * Per-branch evidence annotation for the REQUIRED COVERAGE analyst block.
 * GPT-Researcher-style section binding: the analyst is told where it may
 * assert vs where it must hedge — unsupported branches are declared upfront
 * rather than discovered by the critic 20 minutes later.
 * Returns subQuestion → annotation suffix (empty map entries omitted).
 */
export function evidenceNotesFor(coverage: BranchCoverage): Map<string, string> {
  const notes = new Map<string, string>();
  for (const e of coverage.entries) {
    if (e.verdict === 'unsupported') {
      notes.set(e.subQuestion, ' — NO ranked evidence: hedge heavily or state the evidence gap explicitly; do NOT assert');
    } else if (e.verdict === 'weak') {
      notes.set(e.subQuestion, ` — thin evidence (${e.rankedSources} ranked source${e.rankedSources > 1 ? 's' : ''}): hedge claims`);
    }
  }
  return notes;
}
