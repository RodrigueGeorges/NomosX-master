/**
 * Prediction horizon parsing — the due-check used to match only four
 * relative literals ('30d','90d','365d','long-term') while registration
 * stores free-text horizons ('2027-Q2', '1-2 years', '2028'), so calendar
 * predictions were NEVER eligible for resolution (813 OPEN / 0 resolved).
 */

import { parseHorizonDue } from '@/lib/agent/prediction-tracker';

const created = new Date('2026-01-15T00:00:00Z');

describe('parseHorizonDue', () => {
  it('relative day horizons add days to createdAt', () => {
    expect(parseHorizonDue('30d', created)!.getTime()).toBe(created.getTime() + 30 * 86400_000);
    expect(parseHorizonDue('90d', created)!.getTime()).toBe(created.getTime() + 90 * 86400_000);
  });

  it('year ranges like "1-2 years" resolve to the far bound', () => {
    const due = parseHorizonDue('1-2 years', created)!;
    expect(due.getTime()).toBeGreaterThan(created.getTime() + 300 * 86400_000);
  });

  it('calendar year "2028" resolves to end of that year', () => {
    const due = parseHorizonDue('2028', created)!;
    expect(due.toISOString().slice(0, 10)).toBe('2028-12-31');
  });

  it('calendar quarter "2027-Q2" resolves mid-quarter', () => {
    const due = parseHorizonDue('2027-Q2', created)!;
    expect(due.getFullYear()).toBe(2027);
    expect(due.getMonth()).toBe(6); // July
  });

  it('year range "2029-2030" resolves mid-range', () => {
    const due = parseHorizonDue('2029-2030', created)!;
    expect(due.getFullYear()).toBe(2030);
  });

  it('long-term resolves ~1 year out', () => {
    const due = parseHorizonDue('long-term', created)!;
    expect(due.getTime()).toBeGreaterThan(created.getTime() + 300 * 86400_000);
  });

  it('unparseable horizon → null (never auto-due, fail closed)', () => {
    expect(parseHorizonDue('soon-ish', created)).toBeNull();
    expect(parseHorizonDue('', created)).toBeNull();
  });
});
