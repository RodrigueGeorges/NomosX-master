import { registerPredictions } from '@/lib/agent/prediction-registration';

const create = jest.fn();
jest.mock('@/lib/db', () => ({
  prisma: {
    prediction: { findFirst: jest.fn().mockResolvedValue(null), create: (...a: unknown[]) => create(...a) },
    agentAuditLog: { create: jest.fn().mockResolvedValue({}) },
  },
}));

const analysis: any = {
  title: 't', convictionLevel: 'firm',
  causalChain: [{ id: 1, claim: 'Something happens by the horizon', evidence: '', warrant: '', temporalStatus: 'future_extrapolation', derivesFrom: null }],
  trajectory: { horizon: '2030', state: '', assumptions: '' },
  whatToWatch: { signals: [], whatWouldChangeMind: 'x' },
};

describe('free-run rehearsal never feeds the track record', () => {
  afterEach(() => { delete process.env.NOMOSX_FREE_RUN; create.mockReset(); });

  it('registers nothing in free-run', async () => {
    process.env.NOMOSX_FREE_RUN = '1';
    const r = await registerPredictions('brief-1', analysis);
    expect(r.registered).toBe(0);
    expect(create).not.toHaveBeenCalled();
  });

  it('registers normally otherwise', async () => {
    create.mockResolvedValue({});
    const r = await registerPredictions('brief-1', analysis);
    expect(r.registered).toBe(1);
  });
});
