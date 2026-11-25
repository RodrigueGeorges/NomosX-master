import {
  applyPlatt, fitPlatt, brierScore, calibrateFamily, getFamilyPlatt,
  PLATT_IDENTITY, MIN_FIT_SAMPLES,
} from '@/lib/agent/platt-calibration';

describe('applyPlatt', () => {
  it('identity params are a no-op', () => {
    expect(applyPlatt(0.3, PLATT_IDENTITY)).toBeCloseTo(0.3, 5);
    expect(applyPlatt(0.3, undefined)).toBeCloseTo(0.3, 5);
  });

  it('softening params pull extreme probabilities toward 0.5', () => {
    const soft = { a: 0.5, b: 0, n: 100 };
    expect(applyPlatt(0.9, soft)).toBeLessThan(0.9);
    expect(applyPlatt(0.9, soft)).toBeGreaterThan(0.5);
    expect(applyPlatt(0.1, soft)).toBeGreaterThan(0.1);
  });
});

describe('fitPlatt', () => {
  it('returns null below MIN_FIT_SAMPLES', () => {
    const pairs = Array.from({ length: MIN_FIT_SAMPLES - 1 }, (_, i) => ({ p: 0.5, y: (i % 2) as 0 | 1 }));
    expect(fitPlatt(pairs)).toBeNull();
  });

  it('softens systematically overconfident forecasts', () => {
    // Forecaster always says 0.9 but truth is ~55% — Platt must soften.
    const pairs = Array.from({ length: 200 }, (_, i) => ({
      p: 0.9,
      y: (i % 20 < 11 ? 1 : 0) as 0 | 1, // 55% base rate
    }));
    const fit = fitPlatt(pairs)!;
    expect(fit).not.toBeNull();
    expect(fit.a).toBeLessThan(1);
    const cal = applyPlatt(0.9, fit);
    expect(cal).toBeLessThan(0.9);
    // Calibrated output should land near the empirical 55% rate.
    expect(cal).toBeGreaterThan(0.5);
    expect(cal).toBeLessThan(0.75);
  });

  it('sharpens systematically underconfident forecasts', () => {
    // Forecaster says 0.6, truth is ~85% — Platt must sharpen.
    const pairs = Array.from({ length: 200 }, (_, i) => ({
      p: 0.6,
      y: (i % 20 < 17 ? 1 : 0) as 0 | 1, // 85% base rate
    }));
    const fit = fitPlatt(pairs)!;
    expect(fit.b).toBeGreaterThan(0);
  });

  it('keeps params near identity on well-calibrated data', () => {
    // p=0.5 with 50% outcomes, p=0.9 with 90%, p=0.1 with 10% — already
    // calibrated; the fit must not invent miscalibration.
    const pairs = [
      ...Array.from({ length: 60 }, (_, i) => ({ p: 0.9, y: (i % 10 < 9 ? 1 : 0) as 0 | 1 })),
      ...Array.from({ length: 60 }, (_, i) => ({ p: 0.5, y: (i % 2 === 0 ? 1 : 0) as 0 | 1 })),
      ...Array.from({ length: 60 }, (_, i) => ({ p: 0.1, y: (i % 10 === 0 ? 1 : 0) as 0 | 1 })),
    ];
    const fit = fitPlatt(pairs)!;
    expect(fit).not.toBeNull();
    expect(Math.abs(fit.a - 1)).toBeLessThan(0.6);
    expect(Math.abs(fit.b)).toBeLessThan(0.6);
  });
});

describe('calibrateFamily / registry', () => {
  it('keeps identity below the sample floor and registers above it', () => {
    const fam = `testfam-${Date.now()}`;
    const few = Array.from({ length: 10 }, () => ({ p: 0.7, y: 1 as const }));
    expect(calibrateFamily(fam, few)).toBeNull();
    expect(getFamilyPlatt(fam)).toEqual(PLATT_IDENTITY);

    const many = Array.from({ length: 100 }, (_, i) => ({ p: 0.8, y: (i % 10 < 8 ? 1 : 0) as 0 | 1 }));
    const fit = calibrateFamily(fam, many);
    expect(fit).not.toBeNull();
    expect(getFamilyPlatt(fam).n).toBe(100);
  });
});

describe('brierScore', () => {
  it('scores perfect and useless forecasts', () => {
    expect(brierScore([{ p: 1, y: 1 }, { p: 0, y: 0 }])).toBe(0);
    expect(brierScore([{ p: 0.5, y: 1 }, { p: 0.5, y: 0 }])).toBeCloseTo(0.25, 5);
    expect(brierScore([{ p: 0.9, y: 0 }])).toBeCloseTo(0.81, 5);
  });
});
