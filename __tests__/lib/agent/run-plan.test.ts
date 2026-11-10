/**
 * Run plan — the orchestrator's up-front execution governor. Verifies the
 * profile matrix: degraded providers and tight scopes must shrink corpus,
 * downgrade P2, extend the tail reserve, and degrade fact-check/debate —
 * the reactive per-stage guards used to discover starvation too late.
 */

import { computeRunPlan } from '@/lib/agent/run-plan';

const base = { isStrategic: true, depth: 'strategic', aliveLlmProviders: 4 };

describe('computeRunPlan', () => {
  it('full profile with healthy providers and ample scope', () => {
    const p = computeRunPlan({ ...base, scopeBudgetMs: 75 * 60_000 });
    expect(p.profile).toBe('full');
    expect(p.corpusCap).toBe(60);
    expect(p.p2Tier).toBe('full');
    expect(p.tailReserveMs).toBe(30 * 60_000);
    expect(p.factCheckMode).toBe('full');
    expect(p.debateMode).toBe('always');
    expect(p.rationale).toHaveLength(0);
  });

  it('degraded providers → compact profile (live glm-only evidence)', () => {
    const p = computeRunPlan({ ...base, aliveLlmProviders: 1, scopeBudgetMs: 75 * 60_000 });
    expect(p.profile).toBe('compact');
    expect(p.corpusCap).toBe(40);
    expect(p.p2Tier).toBe('compact');
    expect(p.tailReserveMs).toBe(40 * 60_000);
    expect(p.factCheckMode).toBe('partial');
    expect(p.debateMode).toBe('on-demand');
    expect(p.rationale.length).toBeGreaterThan(0);
  });

  it('degraded + tight scope → minimal profile', () => {
    const p = computeRunPlan({ ...base, aliveLlmProviders: 1, scopeBudgetMs: 35 * 60_000 });
    expect(p.profile).toBe('minimal');
    expect(p.corpusCap).toBe(30);
    expect(p.p2Tier).toBe('skip');
    expect(p.factCheckMode).toBe('deterministic');
    expect(p.debateMode).toBe('skip');
  });

  it('tight scope alone → compact (bounded regen)', () => {
    const p = computeRunPlan({ ...base, aliveLlmProviders: 4, scopeBudgetMs: 35 * 60_000 });
    expect(p.profile).toBe('compact');
    expect(p.p2Tier).toBe('compact');
  });

  it('non-strategic depths get smaller caps', () => {
    const p = computeRunPlan({ isStrategic: false, depth: 'brief', aliveLlmProviders: 4, scopeBudgetMs: 65 * 60_000 });
    expect(p.corpusCap).toBe(45);
    const d = computeRunPlan({ isStrategic: false, depth: 'brief', aliveLlmProviders: 1, scopeBudgetMs: 65 * 60_000 });
    expect(d.corpusCap).toBe(32);
  });

  it('env override is respected by callers via ANALYST_CORPUS_CAP (plan stays pure)', () => {
    // computeRunPlan has no env reads — determinism is the contract.
    const p1 = computeRunPlan(base);
    const p2 = computeRunPlan(base);
    expect(p1).toEqual(p2);
  });
});
