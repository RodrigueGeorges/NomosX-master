import { deriveChainScenarios } from '@/lib/agent/chain-scenarios';
import { electScenario } from '@/lib/agent/mc-elector';
import type { CausalLink } from '@/lib/agent/analyst-multipass';
import type { LinkForecast } from '@/lib/agent/swarm-forecaster';

function link(id: number, temporalStatus: CausalLink['temporalStatus'], derivesFrom: number | null = null, extra: Partial<CausalLink> = {}): CausalLink {
  return { id, claim: `claim ${id}`, evidence: '', warrant: '', temporalStatus, derivesFrom, ...extra };
}

describe('deriveChainScenarios (OT-3)', () => {
  it('returns null with fewer than 2 uncertain links', () => {
    const links = [link(1, 'present_fact'), link(2, 'active_mechanism'), link(3, 'present_fact')];
    expect(deriveChainScenarios(links, '2030')).toBeNull();
  });

  it('returns null on short chains', () => {
    expect(deriveChainScenarios([link(1, 'future_extrapolation')], '2030')).toBeNull();
  });

  it('derives mutually exclusive scenario cells from 2 critical uncertainties', () => {
    const links = [
      link(1, 'present_fact'),
      link(2, 'future_extrapolation'),           // u1
      link(3, 'future_extrapolation', 2),        // u2 depends on u1
      link(4, 'active_mechanism', 3),
      link(5, 'present_fact', 4),
    ];
    const out = deriveChainScenarios(links, 'We look to 2030');
    expect(out).not.toBeNull();
    expect(out!.uncertainties.length).toBeGreaterThanOrEqual(2);
    // u2 derives from u1 → the "u2 realized while u1 fails" cell is dropped.
    expect(out!.scenarios.length).toBe(3);
    const ids = out!.scenarios.map(s => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    // Every scenario conditions on both picked uncertainties.
    for (const s of out!.scenarios) {
      expect(Object.keys(s.conditions).length).toBe(2);
      expect(s.observableAt).toContain('2030');
    }
    // No probability is produced at this stage.
    expect((out!.scenarios[0] as any).probability).toBeUndefined();
  });
});

describe('electScenario (OT-5)', () => {
  const mkForecasts = (linkId: number, p: number): LinkForecast => ({
    linkId, claim: `c${linkId}`, probability: p, variance: 0.02, iqr: 0.1,
    validVotes: 15, families: 3, contested: false,
  });
  const scenarios = deriveChainScenarios([
    link(1, 'present_fact'),
    link(2, 'future_extrapolation'),
    link(3, 'future_extrapolation', 2),
    link(4, 'active_mechanism', 3),
    link(5, 'present_fact', 4),
  ], '2030')!.scenarios;

  it('is deterministic — same seed, same election', () => {
    const forecasts = [mkForecasts(2, 0.7), mkForecasts(3, 0.6)];
    const a = electScenario({ scenarios, forecasts, question: 'q', runs: 5000 });
    const b = electScenario({ scenarios, forecasts, question: 'q', runs: 5000 });
    expect(a).not.toBeNull();
    expect(a!.scenarioId).toBe(b!.scenarioId);
    expect(a!.seed).toBe(b!.seed);
    expect(a!.selectedBy).toBe('swarm');
  });

  it('probabilities sum to 1', () => {
    const forecasts = [mkForecasts(2, 0.7), mkForecasts(3, 0.6)];
    const e = electScenario({ scenarios, forecasts, question: 'q', runs: 5000 })!;
    const sum = Object.values(e.probabilities).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 5);
  });

  it('strong majorities concentrate probability on matching cells', () => {
    // Link 3 derives from link 2, so its vote is P(3 | 2): 0.6 × 0.95 = 0.57
    // for the convergent cell, against 0.40 for "neither".
    const forecasts = [mkForecasts(2, 0.6), mkForecasts(3, 0.95)];
    const e = electScenario({ scenarios, forecasts, question: 'q', runs: 8000 })!;
    const top = scenarios.find(s => s.id === e.scenarioId)!;
    expect(top.conditions['u3']).toBe(true);
    expect(e.probability).toBeGreaterThan(0.5);
  });

  it('returns null when a conditioned link lacks a distribution', () => {
    const e = electScenario({ scenarios, forecasts: [mkForecasts(2, 0.7)], question: 'q' });
    expect(e).toBeNull();
  });
});

describe('electScenario — probability integrity', () => {
  const fc = (linkId: number, p: number, variance = 0.01): LinkForecast => ({
    linkId, claim: `c${linkId}`, probability: p, variance, iqr: 0.1, validVotes: 15, families: 3, contested: false,
  });
  const independent = [
    { id: 'tt', conditions: { u1: true, u2: true } },
    { id: 'tf', conditions: { u1: true, u2: false } },
    { id: 'ft', conditions: { u1: false, u2: true } },
    { id: 'ff', conditions: { u1: false, u2: false } },
  ].map(s => ({ ...s, name: s.id, description: '', observableAt: '2030-12-31', uncertaintyIds: [1, 2] }));

  it('two 60% links give a 36% joint, not a thresholded 62%', () => {
    const e = electScenario({ scenarios: independent, forecasts: [fc(1, 0.6), fc(2, 0.6)], question: 'q', runs: 4000 })!;
    expect(e.scenarioId).toBe('tt');
    expect(e.probability).toBeCloseTo(0.36, 6);
    expect(e.probabilities.ff).toBeCloseTo(0.16, 6);
  });

  it('interval reflects voter uncertainty, not sampling noise', () => {
    const e = electScenario({ scenarios: independent, forecasts: [fc(1, 0.6, 0.03), fc(2, 0.6, 0.03)], question: 'q', runs: 4000 })!;
    expect(e.confidenceInterval[1] - e.confidenceInterval[0]).toBeGreaterThan(0.15);
    expect(e.confidenceInterval[0]).toBeLessThan(e.probability);
    expect(e.confidenceInterval[1]).toBeGreaterThan(e.probability);
  });

  it('a coin-flip election is contested; a clear lead is not', () => {
    const flip = electScenario({ scenarios: independent, forecasts: [fc(1, 0.5), fc(2, 0.5)], question: 'q', runs: 4000 })!;
    expect(flip.contested).toBe(true);
    const clear = electScenario({ scenarios: independent, forecasts: [fc(1, 0.9), fc(2, 0.9)], question: 'q', runs: 4000 })!;
    expect(clear.contested).toBe(false);
    expect(clear.winShare).toBeGreaterThan(0.95);
  });

  it('most sensitive link is the one that moves the leader most', () => {
    // Leader tt = p1*p2. d/dp1 = p2 = 0.55; d/dp2 = p1 = 0.9 → link 2.
    const e = electScenario({ scenarios: independent, forecasts: [fc(1, 0.9), fc(2, 0.55)], question: 'q', runs: 2000 })!;
    expect(e.mostSensitiveLinkId).toBe(2);
  });

  it('dependent link is conditional: "neither" carries the full 1 - P(parent)', () => {
    const derived = deriveChainScenarios([
      link(1, 'present_fact'), link(2, 'future_extrapolation'), link(3, 'future_extrapolation', 2),
      link(4, 'active_mechanism', 3), link(5, 'present_fact', 4),
    ], '2030')!;
    expect(derived.uncertainties[1].dependsOn).toBe(2);
    const e = electScenario({ scenarios: derived.scenarios, forecasts: [fc(2, 0.7), fc(3, 0.6)], question: 'q', runs: 2000 })!;
    const byTag = (tag: string) => e.probabilities[derived.scenarios.find(s => s.id.endsWith(tag))!.id];
    expect(byTag('convergent')).toBeCloseTo(0.42, 6);
    expect(byTag('u1-only')).toBeCloseTo(0.28, 6);
    expect(byTag('neither')).toBeCloseTo(0.30, 6);
  });
});
