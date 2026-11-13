import { recordDegradedStep, degradedStepCount } from '@/lib/agent/degraded-steps';

describe('degraded-step ledger', () => {
  it('records steps with reason and dedupes', () => {
    const stats: Record<string, any> = {};
    recordDegradedStep(stats, 'CRITIC', new Error('provider down'));
    recordDegradedStep(stats, 'CRITIC', new Error('again'));
    recordDegradedStep(stats, 'GAP_FILL');
    expect(stats.degradedSteps).toHaveLength(2);
    expect(stats.degradedSteps[0]).toEqual({ step: 'CRITIC', reason: 'provider down' });
    expect(degradedStepCount(stats)).toBe(2);
  });

  it('is a no-op on null stats', () => {
    expect(() => recordDegradedStep(null, 'X')).not.toThrow();
    expect(degradedStepCount(undefined)).toBe(0);
  });
});
