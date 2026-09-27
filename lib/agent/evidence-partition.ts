/**
 * EVIDENCE PARTITION — designed information asymmetry (InfoDelphi, arXiv 2607.01661)
 *
 * Finding: when every agent in a panel sees identical evidence, deliberation
 * collapses into herding — correlated errors, no real belief revision. The fix
 * is to partition the corpus into a SHARED pool (common ground) plus DISJOINT
 * private slices per agent. Each participant holds exclusive knowledge that can
 * only reach the others through their verdict — inter-agent error correlation
 * drops, and the aggregated judgment improves (+12-18% Brier in the paper).
 *
 * Deterministic, zero-LLM. Same inputs → same partition (stable across
 * iterations of the critical loop so a critic's private slice is consistent).
 *
 * Safety rule: below `minSources`, everyone sees everything — with a thin
 * corpus the coverage loss outweighs the decorrelation gain.
 */

export interface EvidencePartition<T> {
  /** Common ground every participant sees. */
  shared: T[];
  /** Disjoint private slices — privates[i] is exclusive to participant i. */
  privates: T[][];
  /** What participant i receives: shared ∪ privates[i]. */
  forParticipant: (i: number) => T[];
  /** True when the corpus was too small to partition — privates are empty. */
  degenerate: boolean;
}

export interface PartitionOptions<T> {
  /** Fraction of the corpus placed in the shared pool. Default 0.5. */
  sharedFraction?: number;
  /** Minimum corpus size before partitioning is attempted. Default 8. */
  minSources?: number;
  /** Stable ordering key — defaults to identity position. */
  key?: (item: T, index: number) => string;
}

/** Deterministic FNV-1a hash — tiny, stable across runs/processes. */
function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export function partitionEvidence<T>(items: T[], participants: number, opts: PartitionOptions<T> = {}): EvidencePartition<T> {
  const sharedFraction = Math.min(0.8, Math.max(0.2, opts.sharedFraction ?? 0.5));
  const minSources = opts.minSources ?? 8;
  const n = Math.max(1, participants);

  if (items.length < minSources) {
    return {
      shared: items.slice(),
      privates: Array.from({ length: n }, () => []),
      forParticipant: () => items.slice(),
      degenerate: true,
    };
  }

  // Deterministic order: hash each item's stable key, sort — corpus order is
  // provider-dependent, hash order is not.
  const keyed = items.map((item, index) => ({
    item,
    rank: fnv1a(opts.key ? opts.key(item, index) : String(index)),
  }));
  keyed.sort((a, b) => a.rank - b.rank);
  const ordered = keyed.map((k) => k.item);

  const sharedCount = Math.max(1, Math.round(items.length * sharedFraction));
  const shared = ordered.slice(0, sharedCount);
  const remainder = ordered.slice(sharedCount);

  // Round-robin the remainder across private slices — disjoint by construction.
  const privates: T[][] = Array.from({ length: n }, () => []);
  remainder.forEach((item, i) => privates[i % n].push(item));

  return {
    shared,
    privates,
    forParticipant: (i: number) => [...shared, ...(privates[i] ?? [])],
    degenerate: false,
  };
}

/**
 * Render a participant's evidence view as prompt text. The PRIVATE block
 * carries the exclusivity marker — the paper's mechanism works because the
 * agent knows this evidence is theirs alone.
 */
export function formatPartitionedSources(
  shared: string[],
  privates: string[],
): string {
  const blocks = [`SHARED EVIDENCE (all reviewers see this):\n${shared.join("\n\n")}`];
  if (privates.length > 0) {
    blocks.push(
      `YOUR PRIVATE EVIDENCE (exclusive to you — other reviewers did NOT see these sources; findings grounded here are your unique contribution to the panel):\n${privates.join("\n\n")}`,
    );
  }
  return blocks.join("\n\n");
}
