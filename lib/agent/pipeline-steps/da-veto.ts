/**
 * DA RE-CHECK VETO RULE — single site for "does the devil's-advocate veto
 * still stand after a recheck?". Shared by the post-sweep recheck
 * (style-sweep-recheck.ts) and the post-repair refresh (pipeline-v2.ts).
 *
 * The previous inline rule — `verdict === 'reject' || (major_revision &&
 * strength < 20)` — had two holes: (a) a degraded recheck LIFTED a standing
 * veto (observed: strength 36→20, fatal 1→2 — `veto LIFTED` on a strictly
 * worse artifact); (b) a recheck clearing the veto while staying below the
 * gate's publishability bar (40) was incoherent — the gate fails it anyway.
 */
export function daVetoStands(
  recheck: {
    verdict: string;
    overallStrength: number;
    publishabilityScore?: number;
    fatalChallenges?: unknown[] | number;
  },
  prior?: {
    overallStrength?: number;
    fatalChallenges?: number;
    veto?: boolean;
  },
): { stands: boolean; reason: string } {
  const fatal = Array.isArray(recheck.fatalChallenges)
    ? recheck.fatalChallenges.length
    : (recheck.fatalChallenges ?? 0);

  if (recheck.verdict === 'reject') {
    return { stands: true, reason: 'recheck verdict is reject' };
  }
  // Gate bar: lifting a veto on an artifact the gate will fail is incoherent.
  if (typeof recheck.publishabilityScore === 'number' && recheck.publishabilityScore < 40) {
    return { stands: true, reason: `publishability ${recheck.publishabilityScore} < 40 gate bar` };
  }
  if (recheck.verdict === 'major_revision' && recheck.overallStrength <= 20) {
    return { stands: true, reason: `major_revision strength ${recheck.overallStrength} ≤ 20` };
  }
  // A standing veto is only lifted by genuine improvement — a degraded or
  // unchanged recheck keeps it.
  if (prior?.veto === true) {
    const notImproved =
      (typeof prior.overallStrength === 'number' && recheck.overallStrength <= prior.overallStrength)
      || (fatal > 0 && typeof prior.fatalChallenges === 'number' && fatal >= prior.fatalChallenges);
    if (notImproved) {
      return {
        stands: true,
        reason: `no improvement on vetoed artifact (strength ${prior.overallStrength ?? '?'}→${recheck.overallStrength}, fatal ${prior.fatalChallenges ?? '?'}→${fatal})`,
      };
    }
  }
  return { stands: false, reason: 'improved and clears gate bars' };
}
