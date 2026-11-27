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
import { captureInputSync } from './frozen-inputs';

export interface ChainUncertainty {
  linkId: number;
  claim: string;
  kind: 'future_extrapolation' | 'weak_mechanism';
  downstream: number; // links that transitively derive from this one
  /** Set on the second uncertainty when it derives from the first: its
   *  forecast must then be read as P(this | dependsOn holds). */
  dependsOn?: number;
}

export interface RejectedAxis {
  linkId: number;
  claim: string;
  reason: 'compound_axis' | 'conditional_axis' | 'out_of_horizon';
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

/** Lot 1 axis validation: a scenario axis must be a single proposition
 *  about the question's horizon. Compound ("X but Y"), conditional
 *  ("if … then", "le cas échéant") and out-of-horizon claims make bad
 *  axes — the swarm would be voting on a bundle, not a proposition.
 *  The causal-effect-on-question check needs the question text and lives
 *  in the caller; here we enforce what is decidable from the claim. */
const COMPOUND_RE = /\bmais\b|\bcependant\b|\btoutefois\b|\bhowever\b|\bnevertheless\b|\bnonetheless\b|\bbut\b/i;
const CONDITIONAL_RE = /\ble cas échéant\b|\bsous réserve\b|\bsi et seulement si\b|\bà condition que\b|\bprovided that\b|\bif and only if\b|\bunless\b|\bconditioned on\b/i;

function axisRejection(claim: string, horizon: string | undefined): RejectedAxis['reason'] | null {
  if (COMPOUND_RE.test(claim)) return 'compound_axis';
  if (CONDITIONAL_RE.test(claim)) return 'conditional_axis';
  // Out-of-horizon: the claim anchors on a year beyond the note's horizon
  // (grace: horizon year itself or earlier is in-scope).
  const horizonYear = (horizon ?? '').match(/(20\d{2})/)?.[1];
  if (horizonYear) {
    for (const m of claim.matchAll(/\b(20\d{2})\b/g)) {
      if (parseInt(m[1], 10) > parseInt(horizonYear, 10)) return 'out_of_horizon';
    }
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
): { scenarios: ChainScenario[]; uncertainties: ChainUncertainty[]; rejectedAxes?: RejectedAxis[] } | null {
  if (!links || links.length < 3) return null;

  const down = downstreamCounts(links);
  const rejectedAxes: RejectedAxis[] = [];
  const uncertain: ChainUncertainty[] = links
    .map(l => {
      const kind = isUncertain(l);
      if (!kind) return null;
      const rejection = axisRejection(l.claim, horizon);
      if (rejection) {
        rejectedAxes.push({ linkId: l.id, claim: l.claim, reason: rejection });
        return null;
      }
      return { linkId: l.id, claim: l.claim, kind, downstream: down.get(l.id) ?? 0 };
    })
    .filter((u): u is ChainUncertainty => u !== null)
    // Criticality: downstream dependents first, then chain order.
    .sort((a, b) => b.downstream - a.downstream || a.linkId - b.linkId);

  if (rejectedAxes.length > 0) {
    console.log(`[chain-scenarios] rejected ${rejectedAxes.length} axis candidate(s): ${rejectedAxes.map(r => `link${r.linkId}:${r.reason}`).join(', ')}`);
  }
  if (uncertain.length < 2) return null;
  const [u1, u2] = uncertain;

  // Observable horizon: trajectory horizon text → ISO date when parseable,
  // else +12 months. Scenarios are checked AT the note's horizon.
  const horizonMatch = (horizon ?? '').match(/(20\d{2})/);
  const observableAt = horizonMatch
    ? `${horizonMatch[1]}-12-31`
    // Frozen channel: wall-clock here drifts record vs replay prompts.
    : captureInputSync('time:chain-horizon', () =>
        new Date(Date.now() + 365 * 86_400_000).toISOString().slice(0, 10)
      );

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

  return {
    scenarios,
    uncertainties: [u1, u2dependsOnU1 ? { ...u2, dependsOn: u1.linkId } : u2],
    rejectedAxes: rejectedAxes.length ? rejectedAxes : undefined,
  };
}
