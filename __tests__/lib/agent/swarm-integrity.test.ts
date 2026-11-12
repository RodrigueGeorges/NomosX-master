import { assessSwarmHealth, type LinkForecast } from '@/lib/agent/swarm-forecaster';
import { bestShrinkFactor } from '@/lib/agent/prediction-tracker';
import { extractPredictions } from '@/lib/agent/prediction-registration';

jest.mock('@/lib/db', () => ({ prisma: {} }));

const fc = (linkId: number, over: Partial<LinkForecast> = {}): LinkForecast => ({
  linkId, claim: '', probability: 0.6, variance: 0.01, iqr: 0.1, validVotes: 14, families: 3, contested: false, ...over,
});

describe('assessSwarmHealth', () => {
  it('passes a broad, agreeing vote', () => {
    expect(assessSwarmHealth([fc(1), fc(2)], [1, 2]).healthy).toBe(true);
  });
  it('fails thin, single-family, split or missing votes', () => {
    expect(assessSwarmHealth([fc(1, { validVotes: 4 }), fc(2)], [1, 2]).healthy).toBe(false);
    expect(assessSwarmHealth([fc(1, { families: 1 }), fc(2)], [1, 2]).healthy).toBe(false);
    expect(assessSwarmHealth([fc(1, { iqr: 0.5 }), fc(2)], [1, 2]).healthy).toBe(false);
    expect(assessSwarmHealth([fc(1)], [1, 2]).issues[0]).toContain('link 2');
  });
});

describe('bestShrinkFactor', () => {
  it('shrinks overconfident forecasts', () => {
    const pairs = Array.from({ length: 40 }, (_, i) => ({ p: 0.9, outcome: (i % 2) as 0 | 1 }));
    expect(bestShrinkFactor(pairs).factor).toBe(0.7);
  });
  it('leaves well-calibrated or timid forecasts alone', () => {
    const good = Array.from({ length: 40 }, (_, i) => ({ p: 0.8, outcome: (i % 5 === 0 ? 0 : 1) as 0 | 1 }));
    expect(bestShrinkFactor(good).factor).toBe(1);
    const timid = Array.from({ length: 40 }, () => ({ p: 0.6, outcome: 1 as const }));
    expect(bestShrinkFactor(timid).factor).toBe(1);
  });
});

describe('extractPredictions — swarm probabilities', () => {
  const analysis: any = {
    convictionLevel: 'firm',
    causalChain: [
      { id: 2, claim: 'Link two happens', evidence: '', warrant: '', temporalStatus: 'future_extrapolation', derivesFrom: null },
    ],
    trajectory: { horizon: '2030', state: '', assumptions: '' },
    whatToWatch: { signals: ['Regulator publishes the 2030 target review'], whatWouldChangeMind: 'x' },
    centralScenario: {
      name: 'Chain scenario 1', description: 'Both links hold by 2030', rationale: 'r [SRC-3]', horizon: '2030-12-31',
      implications: [], revisionTriggers: ['Link #2 fails'], confidence: 'medium', selectedBy: 'swarm',
      simulationDisagrees: false, probability: 0.42, linkProbabilities: { '2': 0.7 },
    },
  };
  const preds = extractPredictions(analysis);

  it('registers the elected scenario with its computed probability', () => {
    const central = preds.find(p => p.claim.startsWith('Central scenario:'))!;
    expect(central.probability).toBe(0.42);
    expect(central.probabilitySource).toBe('swarm');
  });
  it('prices chain links with the swarm vote, not the tier table', () => {
    const l = preds.find(p => p.linkId === '2')!;
    expect(l.probability).toBe(0.7);
    expect(l.probabilitySource).toBe('swarm');
  });
  it('emits no sentinel for a signal dated beyond the sentinel window', () => {
    expect(preds.some(p => p.kind === 'sentinel')).toBe(false);
  });
});

import { decideResolution, RESOLUTION_GRACE_DAYS } from '@/lib/agent/prediction-tracker';
import { validateSentinel } from '@/lib/agent/sentinel-writer';
import { pinScenariosToCells } from '@/lib/agent/editorial-arbiter';

jest.mock('@/lib/llm/unified-llm', () => ({ callLLM: jest.fn() }));

describe('decideResolution', () => {
  const ev = [{ title: 't', snippet: 's', url: 'https://example.org/a' }];
  it('resolves only on a verdict that cites retrieved evidence', () => {
    const d = decideResolution({ outcome: 'CONFIRMED', evidenceIndex: 1, notes: 'n' }, ev, 0);
    expect(d).toMatchObject({ action: 'resolve', outcome: 'occurred', evidenceUrl: 'https://example.org/a' });
    expect(decideResolution({ outcome: 'REFUTED', evidenceIndex: 1 }, ev, 0)).toMatchObject({ outcome: 'not_occurred' });
  });
  it('retries, then expires, when there is no evidence or no cited verdict', () => {
    expect(decideResolution({ outcome: 'CONFIRMED' }, [], 2).action).toBe('retry');
    expect(decideResolution({ outcome: 'CONFIRMED', evidenceIndex: 4 }, ev, 2).action).toBe('retry');
    expect(decideResolution({ outcome: 'UNCLEAR' }, ev, 2).action).toBe('retry');
    expect(decideResolution({ outcome: 'UNCLEAR' }, ev, RESOLUTION_GRACE_DAYS).action).toBe('expire');
  });
});

describe('validateSentinel', () => {
  const ok = {
    linkId: 2, dueInDays: 60,
    statement: 'The central bank holds its policy rate at the next scheduled meeting',
    resolutionCriteria: 'Policy rate unchanged at 3.50% in the meeting statement',
    resolutionSource: 'Central bank press release',
  };
  it('accepts a checkable sentinel', () => {
    expect(validateSentinel(ok, [2, 3])).toEqual([]);
  });
  it('rejects vague, unsourced, mis-windowed or far-dated sentinels', () => {
    expect(validateSentinel({ ...ok, resolutionCriteria: 'the trend continues over time' }, [2]).length).toBeGreaterThan(0);
    expect(validateSentinel({ ...ok, resolutionSource: '' }, [2]).length).toBeGreaterThan(0);
    expect(validateSentinel({ ...ok, dueInDays: 365 }, [2]).length).toBeGreaterThan(0);
    expect(validateSentinel({ ...ok, linkId: 7 }, [2]).length).toBeGreaterThan(0);
    expect(validateSentinel({ ...ok, statement: 'Adoption exceeds half of all firms by 2035 worldwide' }, [2]).length).toBeGreaterThan(0);
  });
});

describe('pinScenariosToCells', () => {
  const cells = [
    { id: 'a', description: 'cell a', probability: 0.42 },
    { id: 'b', description: 'cell b', probability: 0.28 },
    { id: 'c', description: 'cell c', probability: 0.30 },
  ];
  const out = pinScenariosToCells([
    { name: 'The Long Thaw', probability: '70%', description: 'd', cellId: 'a' },
    { name: 'Invented fourth future', probability: '20%', description: 'x' },
  ], cells, 'a', [0.3, 0.55]);

  it('publishes exactly the chain cells with election probabilities', () => {
    expect(out.map(s => s.cellId)).toEqual(['a', 'c', 'b']);
    expect(out.map(s => s.probability)).toEqual(['42%', '30%', '28%']);
    expect(out[0].name).toBe('The Long Thaw');
    expect(out.some(s => s.name === 'Invented fourth future')).toBe(false);
  });
  it('percentages sum to 100 even when rounding would not', () => {
    const thirds = pinScenariosToCells([], [
      { id: 'x', description: 'x', probability: 1 / 3 },
      { id: 'y', description: 'y', probability: 1 / 3 },
      { id: 'z', description: 'z', probability: 1 / 3 },
    ], 'x', [0.2, 0.5]);
    expect(thirds.reduce((a, s) => a + parseInt(s.probability, 10), 0)).toBe(100);
    expect(new Set(thirds.map(s => s.name)).size).toBe(3);
  });
});

import { buildLinkCards } from '@/lib/agent/swarm-forecaster';

describe('buildLinkCards', () => {
  const links = [{ claim: 'Lithium supply contracts shift toward long-term offtake agreements' }];
  const sources = [
    { id: 'src-aaaaaa', title: 'Prestige review', abstract: 'A broad review of energy policy across regions and decades of reform.', qualityScore: 95 },
    { id: 'src-bbbbbb', title: 'Offtake study', abstract: 'Abstract text about markets in general terms only.', qualityScore: 60 },
  ];
  const readings = [{
    sourceId: 'src-bbbbbb',
    claims: ['Automakers signed long-term lithium offtake agreements covering most supply contracts'],
    results: ['Unrelated result about hydropower capacity additions in the period studied'],
    limitations: ['Sample limited to disclosed lithium supply contracts'],
  }];
  const cards = buildLinkCards(sources, readings, links);

  it('uses reader passages most relevant to the link, not the abstract', () => {
    const b = cards.find(c => c.id === 'src-bbbbbb')!;
    expect(b.excerpt).toContain('offtake agreements');
    expect(b.excerpt.indexOf('offtake agreements')).toBeLessThan(b.excerpt.indexOf('hydropower') === -1 ? Infinity : b.excerpt.indexOf('hydropower'));
  });
  it('ranks an on-topic passage above an off-topic prestigious abstract', () => {
    expect(cards[0].id).toBe('src-bbbbbb');
  });
  it('falls back to the abstract when a source has no reading', () => {
    expect(cards.find(c => c.id === 'src-aaaaaa')!.excerpt).toContain('broad review');
  });
});
