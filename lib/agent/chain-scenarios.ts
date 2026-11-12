/**
 * CHAIN-DERIVED SCENARIOS — OT-3.
 *
 * Scenarios must be a mechanical consequence of the causal chain, not an LLM
 * re-narration. This module marks which links are genuinely uncertain,
 * picks the two critical uncertainties (the ones the most downstream links
 * depend on), crosses them into exclusive scenario cells, and emits scenario
 * skeletons with observable conditions — no probabilities here. Probability
 * is the swarm/Monte Carlo's job (OT-4/5); naming and narrative belong to
 * the arbiter.
 *
 * Hard rule (enforced by callers): fewer than two derivable uncertainties
 * holds the run — never fall back to a 50/30/20 template.
 */

import type { CausalLink } from './analyst-multipass';

export interface ChainUncertainty {
  linkId: number;
  claim: string;
  kind: 'future_extrapolation' | 'weak_mechanism';
  downstream: number; // links that transitively derive from this one
}

export interface ChainScenario {
  /** Stable id — election and tie-breaking key (OT-5). */
  id: string;
  /** Which uncertainty resolved which way: linkId → realized? */
  conditions: Record<string, boolean>;
  name: string; // deterministic skeleton name — arbiter may rewrite for prose
  description: string;
  observableAt: string; // ISO horizon
  uncertaintyIds: number[];
}

/** A link is uncertain if it projects the future, or if its mechanism is
 *  weakly supported (no passage grounding / flagged unsupported). */
function isUncertain(link: CausalLink): 'future_extrapolation' | 'weak_mechanism' | null {
  if (link.temporalStatus === 'future_extrapolation') return 'future_extrapolation';
  if (link.temporalStatus === 'active_mechanism' && (link.unsupported || link.passageVerdict === 'weak' || link.passageVerdict === 'none')) {
    return 'weak_mechanism';
  }
  return null;
}

/** Count transitive downstream dependents via derivesFrom edges. */
function downstreamCounts(links: CausalLink[]): Map<number, number> {
  const byId = new Map(links.map(l => [l.id, l]));
  const counts = new Map<number, number>();
  for (const l of links) {
    let cur: CausalLink | undefined = l;
    const seen = new Set<number>();
    while (cur?.derivesFrom != null && !seen.has(cur.derivesFrom)) {
      seen.add(cur.derivesFrom);
      counts.set(cur.derivesFrom, (counts.get(cur.derivesFrom) ?? 0) + 1);
      cur = byId.get(cur.derivesFrom);
    }
  }
  return counts;
}

/**
 * Derive scenario skeletons from the causal chain.
 * Returns null when fewer than two critical uncertainties exist — caller
 * must hold the run rather than fabricate a template.
 */
export function deriveChainScenarios(
  links: CausalLink[] | undefined,
  horizon: string | undefined,
): { scenarios: ChainScenario[]; uncertainties: ChainUncertainty[] } | null {
  if (!links || links.length < 3) return null;

  const down = downstreamCounts(links);
  const uncertain: ChainUncertainty[] = links
    .map(l => {
      const kind = isUncertain(l);
      return kind ? { linkId: l.id, claim: l.claim, kind, downstream: down.get(l.id) ?? 0 } : null;
    })
    .filter((u): u is ChainUncertainty => u !== null)
    // Criticality: downstream dependents first, then chain order.
    .sort((a, b) => b.downstream - a.downstream);

  if (uncertain.length < 2) return null;
  const [u1, u2] = uncertain;

  // Observable horizon: trajectory horizon text → ISO date when parseable,
  // else +12 months. Scenarios are checked AT the note's horizon.
  const horizonMatch = (horizon ?? '').match(/(20\d{2})/);
  const observableAt = horizonMatch
    ? `${horizonMatch[1]}-12-31`
    : new Date(Date.now() + 365 * 86_400_000).toISOString().slice(0, 10);

  const u1id = `u${u1.linkId}`, u2id = `u${u2.linkId}`;
  const combos: Array<{ a: boolean; b: boolean; tag: string }> = [
    { a: true,  b: true,  tag: 'convergent' },
    { a: true,  b: false, tag: 'u1-only' },
    { a: false, b: true,  tag: 'u2-only' },
    { a: false, b: false, tag: 'neither' },
  ];

  // Incoherence rule (deterministic): if u2 derives from u1, the "u2 realized
  // while u1 fails" cell is causally incoherent — u2 cannot outrun its
  // premise. Drop it; the remaining three cells stay mutually exclusive.
  const u2link = links.find(l => l.id === u2.linkId);
  const u2dependsOnU1 = (() => {
    let cur: CausalLink | undefined = u2link;
    const seen = new Set<number>();
    while (cur?.derivesFrom != null && !seen.has(cur.derivesFrom)) {
      if (cur.derivesFrom === u1.linkId) return true;
      seen.add(cur.derivesFrom);
      cur = links.find(l => l.id === cur!.derivesFrom);
    }
    return false;
  })();

  const kept = combos.filter(c => !(u2dependsOnU1 && !c.a && c.b));
  const cells = kept.length >= 3 ? kept : combos.slice(0, 3);

  const scenarios: ChainScenario[] = cells.map((c, i) => ({
    id: `scn-${u1id}-${u2id}-${c.tag}`,
    conditions: { [u1id]: c.a, [u2id]: c.b },
    name: `Chain scenario ${i + 1} (${c.tag})`,
    description:
      `If "${u1.claim.slice(0, 140)}" is ${c.a ? 'confirmed' : 'not confirmed'} ` +
      `and "${u2.claim.slice(0, 140)}" is ${c.b ? 'confirmed' : 'not confirmed'} ` +
      `by ${observableAt}, the chain resolves along this branch.`,
    observableAt,
    uncertaintyIds: [u1.linkId, u2.linkId],
  }));

  return { scenarios, uncertainties: [u1, u2] };
}
