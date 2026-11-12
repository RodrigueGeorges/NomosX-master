import { synthesizeCausalChainFromMaps } from '@/lib/agent/analyst-multipass';
import { deriveChainScenarios } from '@/lib/agent/chain-scenarios';
import type { FrictionMap, StressTestMap } from '@/lib/agent/analyst-multipass';

function friction(mechanisms: FrictionMap['mechanisms']): FrictionMap {
  return {
    mechanisms,
    collisions: [],
    dataLandscape: { totalDataPoints: 0, quantitativeFindings: [], activeDynamics: [], projectionsInLiterature: [] },
  };
}

function mech(id: number, temporalStatus: 'present_fact' | 'active_mechanism', extra: Partial<FrictionMap['mechanisms'][number]> = {}) {
  return {
    id,
    description: `mechanism ${id} description`,
    domain: 'law',
    crossDomainEffects: '',
    sources: [`[SRC-${id + 1}]`],
    dataPoints: [`data point for ${id} [SRC-${id + 1}]`],
    temporalStatus,
    trajectoryHint: '',
    ...extra,
  };
}

function stress(over: Partial<StressTestMap> = {}): StressTestMap {
  return {
    mechanismAssessments: [],
    collisionAssessments: [],
    survivingMechanisms: [],
    strongestChain: { presentFactIds: [], mechanismIds: [], projectedFuture: '' },
    ...over,
  };
}

describe('synthesizeCausalChainFromMaps', () => {
  it('returns empty chain when no mechanisms exist', () => {
    expect(synthesizeCausalChainFromMaps(friction([]), stress())).toEqual([]);
  });

  it('builds a single-root ordered chain with derivesFrom edges', () => {
    const links = synthesizeCausalChainFromMaps(
      friction([mech(2, 'active_mechanism'), mech(1, 'present_fact'), mech(3, 'active_mechanism')]),
      stress({ survivingMechanisms: [1, 2, 3] }),
    );
    expect(links).toHaveLength(3);
    expect(links[0].temporalStatus).toBe('present_fact');
    expect(links[0].derivesFrom).toBeNull();
    expect(links[1].derivesFrom).toBe(1);
    expect(links[2].derivesFrom).toBe(2);
    expect(links.every(l => l.sourceRef !== undefined)).toBe(true);
  });

  it('filters to surviving mechanisms when P2 ran', () => {
    const links = synthesizeCausalChainFromMaps(
      friction([mech(1, 'present_fact'), mech(2, 'active_mechanism'), mech(3, 'active_mechanism')]),
      stress({ survivingMechanisms: [1, 3] }),
    );
    expect(links.map(l => l.id)).toEqual([1, 2]);
    expect(links[1].derivesFrom).toBe(1);
  });

  it('appends a future_extrapolation link from strongestChain.projectedFuture', () => {
    const links = synthesizeCausalChainFromMaps(
      friction([mech(1, 'present_fact'), mech(2, 'active_mechanism')]),
      stress({
        survivingMechanisms: [1, 2],
        strongestChain: { presentFactIds: [1], mechanismIds: [2], projectedFuture: 'market consolidates by 2028' },
      }),
    );
    const last = links[links.length - 1];
    expect(last.temporalStatus).toBe('future_extrapolation');
    expect(last.derivesFrom).toBe(links.length - 1);
    expect(last.claim).toContain('market consolidates');
  });

  it('tags weak mechanisms honestly (stress-test rejection or thin evidence)', () => {
    const links = synthesizeCausalChainFromMaps(
      friction([
        mech(1, 'present_fact'),
        mech(2, 'active_mechanism', { dataPoints: [], sources: ['[SRC-9]'] }),
        mech(3, 'active_mechanism'),
      ]),
      stress({
        survivingMechanisms: [1, 2, 3],
        mechanismAssessments: [
          { mechanismId: 3, verdict: 'holds', reasoning: '', canSupportExtrapolation: false, hostileExpertObjection: '', temporalChain: { anchoredIn: '', mechanism: '', projectsTo: '' } },
        ],
      }),
    );
    const byId = new Map(links.map(l => [l.id, l]));
    // link ids are positional (1,2,3), mechanisms filtered to survivors
    expect(byId.get(2)!.passageVerdict).toBe('weak'); // thin evidence
    expect(byId.get(3)!.passageVerdict).toBe('weak'); // canSupportExtrapolation=false
    expect(byId.get(1)!.passageVerdict).toBeUndefined(); // present_fact untouched
  });

  it('feeds deriveChainScenarios: weak mechanism + extrapolation = 2 uncertainties', () => {
    const links = synthesizeCausalChainFromMaps(
      friction([mech(1, 'present_fact'), mech(2, 'active_mechanism', { dataPoints: [], sources: ['[SRC-9]'] })]),
      stress({
        survivingMechanisms: [1, 2],
        strongestChain: { presentFactIds: [1], mechanismIds: [2], projectedFuture: 'consolidation follows' },
      }),
    );
    const derived = deriveChainScenarios(links, '2027-2029');
    expect(derived).not.toBeNull();
    expect(derived!.uncertainties.length).toBeGreaterThanOrEqual(2);
    expect(derived!.scenarios.length).toBeGreaterThanOrEqual(3);
  });
});
