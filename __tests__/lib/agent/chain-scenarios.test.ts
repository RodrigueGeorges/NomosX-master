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
    // u2 (link 3) near-certain realized → cells with conditions.u3=true dominate.
    const forecasts = [mkForecasts(2, 0.5), mkForecasts(3, 0.95)];
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
