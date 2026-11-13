/**
 * Real-time pulse relevance filter — the unfiltered pulse injected ~50
 * cross-domain indicators into every analyst prompt (CTO lever 6).
 */

import { filterPulseForQuery, type RealTimePulse } from '@/lib/agent/realtime-data-hub';

const pulse: RealTimePulse = {
  timestamp: new Date(),
  summary: '',
  durationMs: 0,
  indicators: [
    { provider: 'fred', code: 'DCOILWTICO', name: 'WTI Crude Oil Price', value: 70, unit: 'USD', timestamp: new Date(), category: 'energy' },
    { provider: 'fred', code: 'DCOILBRENTEU', name: 'Brent Crude Oil Price', value: 74, unit: 'USD', timestamp: new Date(), category: 'energy' },
    { provider: 'usgs', code: 'EQ', name: 'Significant Earthquakes (M4.5+)', value: 3, unit: 'count', timestamp: new Date(), category: 'disaster' },
    { provider: 'who', code: 'FLU', name: 'Influenza-like illness rate', value: 2.1, unit: '%', timestamp: new Date(), category: 'disease_outbreak' },
    { provider: 'fred', code: 'FEDFUNDS', name: 'Fed Funds Rate', value: 4.5, unit: '%', timestamp: new Date(), category: 'interest_rate' },
  ],
  alerts: [
    { indicator: 'WTI Crude Oil Price', type: 'spike', severity: 'high', message: 'Oil spike', value: 80, threshold: 75 },
    { indicator: 'Earthquake', type: 'milestone', severity: 'medium', message: 'Major quake detected', value: 7, threshold: 6 },
  ],
};

describe('filterPulseForQuery', () => {
  it('keeps only query-relevant categories on an energy question', () => {
    const out = filterPulseForQuery(pulse, 'How is the global energy transition reshaping geopolitical power dynamics?');
    expect(out.indicators.every(i => i.category === 'energy')).toBe(true);
    expect(out.indicators).toHaveLength(2);
    expect(out.alerts).toHaveLength(1);
    expect(out.alerts[0].indicator).toContain('Oil');
  });

  it('drops the whole pulse when nothing is relevant', () => {
    const out = filterPulseForQuery(pulse, 'What are the diplomatic implications of Arctic shipping lanes?');
    // 'shipping'/'diplomatic'/'arctic' match nothing — energy names don't match.
    expect(out.indicators).toHaveLength(0);
    expect(out.alerts).toHaveLength(0);
  });

  it('matches stemmed variants (geopolitical ↔ geopolitics)', () => {
    const geo: RealTimePulse = {
      ...pulse,
      indicators: [{ provider: 'x', code: 'G', name: 'Geopolitical risk index', value: 1, unit: '', timestamp: new Date(), category: 'geopolitics' }],
      alerts: [],
    };
    const out = filterPulseForQuery(geo, 'geopolitical fragmentation scenarios');
    expect(out.indicators).toHaveLength(1);
  });
});
