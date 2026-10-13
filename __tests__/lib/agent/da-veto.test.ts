/**
 * DA re-check veto rule — a degraded recheck must not lift a standing veto.
 * Regression: post-sweep recheck observed `strength 36→20, fatal 1→2 — veto
 * LIFTED` because `strength < 20` failed on exactly 20. Single rule shared by
 * the sweep recheck and the post-repair DA refresh.
 */
import { daVetoStands } from '@/lib/agent/pipeline-steps/da-veto';

describe('daVetoStands', () => {
  it('live case: prior veto, recheck major_revision strength 20 fatal 2 publishability 35 — stands', () => {
    const r = daVetoStands(
      { verdict: 'major_revision', overallStrength: 20, publishabilityScore: 35, fatalChallenges: [{}, {}] },
      { overallStrength: 36, fatalChallenges: 1, veto: true },
    );
    expect(r.stands).toBe(true);
    expect(r.reason).toBeTruthy();
  });

  it('prior veto lifted when the recheck genuinely improved', () => {
    const r = daVetoStands(
      { verdict: 'major_revision', overallStrength: 55, publishabilityScore: 60, fatalChallenges: 0 },
      { overallStrength: 36, fatalChallenges: 1, veto: true },
    );
    expect(r.stands).toBe(false);
    expect(r.reason).toBe('improved and clears gate bars');
  });

  it('publishability below the gate bar (40) keeps the veto even at strength 70', () => {
    const r = daVetoStands(
      { verdict: 'minor_revision', overallStrength: 70, publishabilityScore: 30 },
      { overallStrength: 36, fatalChallenges: 1, veto: true },
    );
    expect(r.stands).toBe(true);
    expect(r.reason).toContain('publishability');
  });

  it('no prior veto — a middling recheck does not create one', () => {
    const r = daVetoStands(
      { verdict: 'major_revision', overallStrength: 45, publishabilityScore: 55 },
      { veto: false },
    );
    expect(r.stands).toBe(false);
  });

  it('prior veto, strength improved but fatal count did not — stands', () => {
    const r = daVetoStands(
      { verdict: 'major_revision', overallStrength: 40, publishabilityScore: 50, fatalChallenges: 1 },
      { overallStrength: 36, fatalChallenges: 1, veto: true },
    );
    expect(r.stands).toBe(true);
    expect(r.reason).toContain('no improvement');
  });
});
