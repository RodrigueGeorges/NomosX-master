/**
 * Foresight integrity — sentinel validation, swarm-priced prediction
 * extraction, bounded resolution decisions, and conservative calibration
 * shrink. Pure functions only; no prisma, no LLM.
 */

import { validateSentinel, SENTINEL_VOTE_ID_BASE } from '@/lib/agent/sentinel-writer';
import { extractPredictions } from '@/lib/agent/prediction-registration';
import { decideResolution, bestShrinkFactor, RESOLUTION_GRACE_DAYS } from '@/lib/agent/prediction-tracker';

const VALID_SENTINEL = {
  statement: 'GCC sovereign fund announces a new renewable-energy joint venture by the stated deadline',
  dueInDays: 60,
  resolutionCriteria: 'A joint venture or MoU is publicly announced before 2026-12-01',
  resolutionSource: 'Official ministry press release',
  linkId: 3,
};

describe('validateSentinel', () => {
  const allowed = [1, 3, 7];

  it('accepts a well-formed sentinel', () => {
    expect(validateSentinel(VALID_SENTINEL, allowed)).toEqual([]);
  });

  it('rejects windows outside 30/60/90', () => {
    expect(validateSentinel({ ...VALID_SENTINEL, dueInDays: 45 }, allowed)).toContain('dueInDays must be 30, 60 or 90');
    expect(validateSentinel({ ...VALID_SENTINEL, dueInDays: 365 }, allowed)).toContain('dueInDays must be 30, 60 or 90');
  });

  it('rejects criteria without a number, threshold or date', () => {
    const issues = validateSentinel({ ...VALID_SENTINEL, resolutionCriteria: 'something happens soon enough' }, allowed);
    expect(issues).toContain('criteria need a number, threshold or date');
  });

  it('rejects a missing resolution source', () => {
    expect(validateSentinel({ ...VALID_SENTINEL, resolutionSource: '' }, allowed)).toContain('no resolution source');
  });

  it('rejects a linkId outside the uncertain set', () => {
    expect(validateSentinel({ ...VALID_SENTINEL, linkId: 99 }, allowed)).toContain('unknown linkId');
  });

  it('rejects statements dated beyond the sentinel window', () => {
    const far = new Date().getFullYear() + 5;
    const issues = validateSentinel({ ...VALID_SENTINEL, statement: `By ${far}, the transition reshapes Gulf power` }, allowed);
    expect(issues).toContain('statement dated beyond the sentinel window');
  });

  it('rejects statements that are too short to be checkable', () => {
    expect(validateSentinel({ ...VALID_SENTINEL, statement: 'oil goes up' }, allowed)).toContain('statement too short');
  });
});

describe('extractPredictions — swarm pricing', () => {
  const baseAnalysis: any = {
    causalChain: [{
      id: 4,
      claim: 'Gulf states will diversify sovereign wealth into renewables',
      temporalStatus: 'future_extrapolation',
      evidence: 'see [SRC-2]',
    }],
    trajectory: { state: 'A multipolar energy order consolidates', horizon: '2030' },
    whatToWatch: { signals: [], whatWouldChangeMind: 'Demand reversal' },
  };

  it('prices chain links from linkProbabilities when swarm-elected', () => {
    const analysis = {
      ...baseAnalysis,
      centralScenario: {
        selectedBy: 'swarm',
        probability: 0.62,
        confidence: 'high',
        description: 'Gulf pivot scenario',
        horizon: '2028',
        resolutionStatement: 'Gulf pivot confirmed by 2028',
        revisionTriggers: ['Saudi output cut deeper than forecast'],
        rationale: 'chain [SRC-2]',
        linkProbabilities: { '4': 0.71 },
      },
    } as any;
    const preds = extractPredictions(analysis);
    const link = preds.find(p => p.linkId === '4');
    expect(link?.probability).toBe(0.71);
    expect(link?.probabilitySource).toBe('swarm');
    const central = preds.find(p => p.claim.startsWith('Central scenario:'));
    expect(central?.probabilitySource).toBe('swarm');
    expect(central?.probability).toBe(0.62);
  });

  it('falls back to tier_table when no swarm price exists for a link', () => {
    const analysis = {
      ...baseAnalysis,
      centralScenario: {
        selectedBy: 'swarm', probability: 0.5, confidence: 'medium',
        description: 'x', horizon: '2028', resolutionStatement: 'x',
        revisionTriggers: [], rationale: '', linkProbabilities: {},
      },
    } as any;
    const preds = extractPredictions(analysis);
    const link = preds.find(p => p.linkId === '4');
    expect(link?.probabilitySource).toBe('tier_table');
  });

  it('swarm sentinels take precedence and are registered as kind=sentinel', () => {
    const analysis = {
      ...baseAnalysis,
      centralScenario: {
        selectedBy: 'swarm', probability: 0.6, confidence: 'high',
        description: 'x', horizon: '2028', resolutionStatement: 'x',
        revisionTriggers: [], rationale: '',
        sentinels: [{
          linkId: 4,
          statement: 'A Gulf sovereign fund files a renewables JV by the deadline',
          dueAt: '2026-12-01',
          probability: 0.58,
          resolutionCriteria: 'JV filing is public before 2026-12-01',
          resolutionSource: 'Official gazette',
        }],
      },
    } as any;
    const preds = extractPredictions(analysis);
    const sentinel = preds.find(p => p.kind === 'sentinel' && p.claim.includes('JV'));
    expect(sentinel).toBeDefined();
    expect(sentinel?.probabilitySource).toBe('swarm');
    expect(sentinel?.dueAt).toBeInstanceOf(Date);
    expect(sentinel?.linkId).toBe('4');
    // Precedence: no heuristic [30d sentinel] copies alongside swarm ones.
    expect(preds.filter(p => p.claim.startsWith('[30d sentinel]'))).toHaveLength(0);
  });

  it('drops signals dated beyond the sentinel window from heuristic sentinels', () => {
    const far = new Date().getFullYear() + 5;
    const analysis = {
      ...baseAnalysis,
      whatToWatch: { signals: [`Breakthrough announced by ${far}`], whatWouldChangeMind: 'x' },
    } as any;
    const preds = extractPredictions(analysis);
    expect(preds.filter(p => String(p.claim).includes('sentinel'))).toHaveLength(0);
  });
});

describe('decideResolution', () => {
  const evidence = [
    { title: 'A', snippet: 's', url: 'https://a.example' },
    { title: 'B', snippet: 's', url: 'https://b.example' },
  ];

  it('resolves CONFIRMED only when it cites retrieved evidence', () => {
    const d = decideResolution({ outcome: 'CONFIRMED', evidenceIndex: 2, notes: 'seen' }, evidence, 5);
    expect(d.action).toBe('resolve');
    if (d.action === 'resolve') {
      expect(d.outcome).toBe('occurred');
      expect(d.status).toBe('CONFIRMED');
      expect(d.evidenceUrl).toBe('https://b.example');
    }
  });

  it('retries inconclusive verdicts, expires after the grace window', () => {
    expect(decideResolution({ outcome: 'UNCLEAR' }, evidence, 5).action).toBe('retry');
    expect(decideResolution(null, [], 5).action).toBe('retry');
    expect(decideResolution({ outcome: 'UNCLEAR' }, evidence, RESOLUTION_GRACE_DAYS).action).toBe('expire');
  });

  it('rejects verdicts citing evidence that was not retrieved', () => {
    expect(decideResolution({ outcome: 'CONFIRMED', evidenceIndex: 9 }, evidence, 5).action).toBe('retry');
    expect(decideResolution({ outcome: 'CONFIRMED', evidenceIndex: 0 }, evidence, 5).action).toBe('retry');
  });
});

describe('bestShrinkFactor', () => {
  it('returns identity on empty input', () => {
    expect(bestShrinkFactor([])).toEqual({ factor: 1, brier: null });
  });

  it('shrinks overconfident predictions toward 0.5 when it improves Brier', () => {
    // All predicted 0.9, all resolved not_occurred → badly overconfident.
    const pairs = Array.from({ length: 10 }, () => ({ p: 0.9, outcome: 0 as const }));
    const { factor, brier } = bestShrinkFactor(pairs);
    expect(factor).toBeLessThan(1);
    // Shrunk Brier must beat the identity Brier.
    const shrunk = pairs.reduce((a, { p, outcome }) => a + (0.5 + (p - 0.5) * factor - outcome) ** 2, 0) / pairs.length;
    expect(shrunk).toBeLessThan(brier!);
  });

  it('keeps factor=1 when predictions are already calibrated', () => {
    const pairs = [
      { p: 0.8, outcome: 1 as const },
      { p: 0.7, outcome: 1 as const },
      { p: 0.4, outcome: 0 as const },
      { p: 0.3, outcome: 0 as const },
    ];
    expect(bestShrinkFactor(pairs).factor).toBe(1);
  });
});

describe('SENTINEL_VOTE_ID_BASE', () => {
  it('keeps sentinel vote ids clear of real chain link ids', () => {
    expect(SENTINEL_VOTE_ID_BASE).toBeGreaterThanOrEqual(9000);
  });
});
