import { buildForecastState, reviseForecast, reviseLinkProbability } from '@/lib/agent/forecast-revision';
import type { ChainScenario } from '@/lib/agent/chain-scenarios';
import type { LinkForecast } from '@/lib/agent/swarm-forecaster';

const cell = (id: string, a: boolean, b: boolean): ChainScenario => ({
  id, conditions: { u1: a, u2: b }, name: id, description: id, observableAt: '2030-12-31', uncertaintyIds: [1, 2],
});
const scenarios = [cell('tt', true, true), cell('tf', true, false), cell('ft', false, true), cell('ff', false, false)];
const fc = (linkId: number, p: number): LinkForecast => ({
  linkId, claim: `c${linkId}`, probability: p, variance: 0.01, iqr: 0.1, validVotes: 15, families: 3, contested: false,
});
const res = (linkId: number, outcome: 'occurred' | 'not_occurred') =>
  ({ linkId, outcome, predictionId: 'p1', evidenceUrl: 'https://example.org/e', resolvedAt: '2027-01-15' });

describe('reviseLinkProbability', () => {
  it('moves 0.6 to 0.818 on a confirming sentinel and to 0.333 on a refuting one', () => {
    expect(reviseLinkProbability(0.6, 'occurred')).toBeCloseTo(0.8182, 4);
    expect(reviseLinkProbability(0.6, 'not_occurred')).toBeCloseTo(0.3333, 4);
  });
  it('never reaches certainty', () => {
    expect(reviseLinkProbability(0.97, 'occurred')).toBeLessThanOrEqual(0.98);
    expect(reviseLinkProbability(0.03, 'not_occurred')).toBeGreaterThanOrEqual(0.02);
  });
});

describe('reviseForecast', () => {
  const state = buildForecastState('q', scenarios, [fc(1, 0.6), fc(2, 0.6), fc(9001, 0.7)]);

  it('snapshots only the links the scenarios condition on', () => {
    expect(state.links.map(l => l.linkId)).toEqual([1, 2]);
    expect(state.revision).toBe(0);
  });

  it('re-elects with the updated link and records before/after', () => {
    const out = reviseForecast(state, res(1, 'occurred'))!;
    expect(out.revision.link).toEqual({ before: 0.6, after: 0.8182 });
    expect(out.revision.scenarios.before.tt).toBeCloseTo(0.36, 4);
    expect(out.revision.scenarios.after.tt).toBeCloseTo(0.4909, 4);
    expect(out.revision.elected).toMatchObject({ before: 'tt', after: 'tt' });
    expect(out.revision.electionChanged).toBe(false);
    expect(out.state.revision).toBe(1);
    expect(state.links[0].probability).toBe(0.6); // input state untouched
  });

  it('flags a changed central scenario', () => {
    const out = reviseForecast(state, res(1, 'not_occurred'))!;
    expect(out.revision.elected.before).toBe('tt');
    expect(out.revision.elected.after).toBe('ft');
    expect(out.revision.electionChanged).toBe(true);
  });

  it('is reproducible and chains', () => {
    const a = reviseForecast(state, res(1, 'occurred'))!;
    const b = reviseForecast(state, res(1, 'occurred'))!;
    expect(a.revision).toEqual(b.revision);
    const second = reviseForecast(a.state, res(2, 'occurred'))!;
    expect(second.revision.revision).toBe(2);
    expect(second.revision.scenarios.after.tt).toBeCloseTo(0.8182 * 0.8182, 3);
  });

  it('ignores a resolution on a link outside the forecast', () => {
    expect(reviseForecast(state, res(42, 'occurred'))).toBeNull();
  });
});
