import { chronosForecastToModelResult, chronosEnabled } from "../chronos-client";
import type { ChronosForecastResult } from "../chronos-client";

const series = {
  label: "Day-ahead price (Germany)",
  unit: "EUR/MWh",
  provider: "energy-charts",
  points: Array.from({ length: 30 }, (_, i) => ({ t: `2026-01-${String(i + 1).padStart(2, "0")}`, v: 50 + i })),
};

const forecast: ChronosForecastResult = {
  model: "amazon/chronos-2",
  quantileLevels: [0.1, 0.5, 0.9],
  horizon: 3,
  points: [
    { horizon: 1, q10: 75, q50: 80, q90: 85 },
    { horizon: 2, q10: 78, q50: 83, q90: 88 },
    { horizon: 3, q10: 80, q50: 85, q90: 90 },
  ],
  durationMs: 1200,
};

describe("chronos-client", () => {
  const env = { ...process.env };
  afterEach(() => { process.env = { ...env }; });

  it("chronosEnabled requires both env vars", () => {
    process.env.QUANT_SERVICE_URL = "https://q.example.com";
    delete process.env.NOMOSX_CHRONOS;
    expect(chronosEnabled()).toBe(false);
    process.env.NOMOSX_CHRONOS = "1";
    delete process.env.QUANT_SERVICE_URL;
    expect(chronosEnabled()).toBe(false);
    process.env.QUANT_SERVICE_URL = "https://q.example.com";
    expect(chronosEnabled()).toBe(true);
  });

  it("forecast → ModelResult carries median + quantile band", () => {
    const m = chronosForecastToModelResult(series, forecast, 2);
    expect(m.kind).toBe("chronos-forecast");
    expect(m.modelRef).toBe(2);
    expect(m.rows[0].value).toBe(85);           // endpoint median q50
    expect(m.rows[0].low).toBe(80);             // q10 band
    expect(m.rows[0].high).toBe(90);            // q90 band
    expect(m.rows[0].unit).toBe("EUR/MWh");
    expect(m.methodology).toContain("zero-shot");
    expect(m.caveats.length).toBeGreaterThan(0);
    expect(m.dataSources[0]).toContain("energy-charts");
  });
});
