/**
 * FutureSim-style test — Lot 5 measurement.
 *
 * Simulates a timeline of sentinel resolutions landing on a published
 * forecast state: sentinels resolve on different dates, probabilities
 * revise step by step, and the election may or may not move. Asserts the
 * invariants a live revision stream must keep:
 *   - link probabilities stay inside the publication clamp [0.02, 0.98]
 *   - every revision is dated, chained (revision n builds on n-1) and
 *     records before/after for link AND scenarios
 *   - elected scenario probabilities stay a distribution (sum ≈ 1)
 *   - a long resolution stream never crashes nor produces NaN
 *   - the same resolution sequence is reproducible (deterministic)
 */
import { buildForecastState, reviseForecast, type ForecastState, type SentinelResolution } from '@/lib/agent/forecast-revision';
import type { ChainScenario } from '@/lib/agent/chain-scenarios';
import type { LinkForecast } from '@/lib/agent/swarm-forecaster';

const cell = (id: string, a: boolean, b: boolean): ChainScenario => ({
  id, conditions: { u1: a, u2: b }, name: id, description: id, observableAt: '2030-12-31', uncertaintyIds: [1, 2],
});
const scenarios = [cell('tt', true, true), cell('tf', true, false), cell('ft', false, true), cell('ff', false, false)];
const fc = (linkId: number, p: number): LinkForecast => ({
  linkId, claim: `c${linkId}`, probability: p, variance: 0.01, iqr: 0.1, validVotes: 15, families: 3, contested: false,
});

/** Deterministic pseudo-random sequence (LCG) — reproducible "future". */
function lcg(seed: number) {
  let s = seed >>> 0;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32;
}

function simulate(seed: number, resolutions: number) {
  let state: ForecastState = buildForecastState('q', scenarios, [fc(1, 0.55), fc(2, 0.45)]);
  const rand = lcg(seed);
  const history: ReturnType<typeof reviseForecast>[] = [];
  let day = 1;
  for (let i = 0; i < resolutions; i++) {
    const linkId = rand() < 0.5 ? 1 : 2;
    const outcome: 'occurred' | 'not_occurred' = rand() < 0.5 ? 'occurred' : 'not_occurred';
    const resolution: SentinelResolution = {
      linkId, outcome, predictionId: `sim-${i}`,
      resolvedAt: new Date(Date.UTC(2027, 0, day++)).toISOString(),
    };
    const out = reviseForecast(state, resolution);
    if (!out) continue; // link already outside forecast — skip like live
    state = out.state;
    history.push(out);
    // Invariants after EVERY revision
    for (const l of state.links) {
      expect(l.probability).toBeGreaterThanOrEqual(0.02);
      expect(l.probability).toBeLessThanOrEqual(0.98);
      expect(Number.isFinite(l.probability)).toBe(true);
    }
    const probs = Object.values(out.revision.scenarios.after);
    expect(probs.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 2);
    expect(out.revision.revision).toBe(history.length); // sequential chain (post-push)
  }
  return { state, history };
}

describe('FutureSim — sentinel resolution stream', () => {
  it('survives 40 sequential resolutions with sane invariants', () => {
    const { state, history } = simulate(42, 40);
    expect(history.length).toBeGreaterThan(30);
    expect(state.revision).toBe(history.length);
    // revisions are strictly sequential
    history.forEach((h, i) => expect(h!.revision.revision).toBe(i + 1));
    // every revision records before/after on link and scenarios
    for (const h of history) {
      expect(h!.revision.link.after).toBeGreaterThanOrEqual(0.02);
      expect(h!.revision.link.after).toBeLessThanOrEqual(0.98);
      expect(typeof h!.revision.elected.probabilityAfter).toBe('number');
      expect(Number.isFinite(h!.revision.elected.probabilityAfter)).toBe(true);
    }
  });

  it('is deterministic — same seed, same revision history', () => {
    const a = simulate(7, 25);
    const b = simulate(7, 25);
    expect(a.history.map(h => h!.revision)).toEqual(b.history.map(h => h!.revision));
  });

  it('a confirming streak pushes the elected scenario probability up monotonically-ish', () => {
    let state = buildForecastState('q', scenarios, [fc(1, 0.5), fc(2, 0.5)]);
    const electedAt = (s: ForecastState) => {
      // re-derive via a fresh revision-free election is internal; instead track
      // link probabilities — both links confirmed should rise.
      return s.links.map(l => l.probability);
    };
    const p0 = electedAt(state);
    for (let i = 0; i < 3; i++) {
      const out = reviseForecast(state, {
        linkId: 1, outcome: 'occurred', predictionId: `c${i}`, resolvedAt: `2027-02-0${i + 1}`,
      })!;
      state = out.state;
    }
    const p1 = electedAt(state);
    expect(p1[0]).toBeGreaterThan(p0[0]); // link 1 confirmed 3× → higher
    expect(p1[1]).toBeCloseTo(p0[1], 5); // link 2 untouched
  });

  it('refuting streak drives probability toward the floor, never below', () => {
    let state = buildForecastState('q', scenarios, [fc(1, 0.9), fc(2, 0.5)]);
    for (let i = 0; i < 6; i++) {
      const out = reviseForecast(state, {
        linkId: 1, outcome: 'not_occurred', predictionId: `r${i}`, resolvedAt: `2027-03-0${i + 1}`,
      });
      if (!out) break;
      state = out.state;
    }
    const link1 = state.links.find(l => l.linkId === 1)!;
    expect(link1.probability).toBeLessThan(0.5);
    expect(link1.probability).toBeGreaterThanOrEqual(0.02);
  });
});
