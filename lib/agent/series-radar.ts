/**
 * NomosX SERIES RADAR — Temporal Signal Detection
 *
 * LOT 1.2: Detects structural breaks and correlation shifts in macroeconomic
 * time series from FRED, ECB, and World Bank.
 *
 * For each series pair:
 *   1. ADF test (stationarity check)
 *   2. Rolling correlation (24-month window)
 *   3. Rupture flag if |delta| > 0.3
 *
 * Score: base 50 + |delta_corr| * 30 + recency
 */

import { prisma } from '../db';

// ============================================================================
// TYPES
// ============================================================================

export interface SeriesRupture {
  seriesId: string;
  seriesName: string;
  provider: string;
  ruptureDate: Date;
  deltaCorrelation: number;
  score: number;
  description: string;
}

export interface SeriesRadarResult {
  ruptures: SeriesRupture[];
  stats: {
    seriesChecked: number;
    rupturesFound: number;
    durationMs: number;
  };
}

// ============================================================================
// CONFIGURATION — Key macro series to monitor
// ============================================================================

const FRED_SERIES: { id: string; name: string; fredId: string }[] = [
  { id: 'fred:cpi', name: 'US CPI Inflation', fredId: 'CPIAUCSL' },
  { id: 'fred:fedfunds', name: 'Fed Funds Rate', fredId: 'FEDFUNDS' },
  { id: 'fred:unemployment', name: 'US Unemployment', fredId: 'UNRATE' },
  { id: 'fred:gdp', name: 'US GDP Growth', fredId: 'A191RL1Q225SBEA' },
  { id: 'fred:10y', name: '10-Year Treasury', fredId: 'GS10' },
  { id: 'fred:2y', name: '2-Year Treasury', fredId: 'GS2' },
  { id: 'fred:yield_curve', name: 'Yield Curve (10Y-2Y)', fredId: 'T10Y2Y' },
  { id: 'fred:m2', name: 'M2 Money Supply', fredId: 'M2SL' },
  { id: 'fred:dollar', name: 'Trade-Weighted Dollar', fredId: 'TWEXBPA' },
  { id: 'fred:oil', name: 'WTI Crude Oil', fredId: 'DCOILWTICO' },
  { id: 'fred:vix', name: 'VIX Volatility', fredId: 'VIXCLS' },
  { id: 'fred:indpro', name: 'Industrial Production', fredId: 'INDPRO' },
  { id: 'fred:retail', name: 'Retail Sales', fredId: 'RSAFS' },
  { id: 'fred:housing', name: 'Housing Starts', fredId: 'HOUST' },
];

const ECB_SERIES: { id: string; name: string; ecbKey: string }[] = [
  { id: 'ecb:policy_rate', name: 'ECB Main Refinancing Rate', ecbKey: 'FM.D.U2.EUR.4F.KR.MRR_FR.LEV' },
  { id: 'ecb:hicp', name: 'Euro Area HICP', ecbKey: 'ICP.M.U2.N.000000.4.ANR' },
  { id: 'ecb:unemployment', name: 'Euro Area Unemployment', ecbKey: 'LFSI.M.U2.S.UNEHRT.H0' },
];

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

export async function runSeriesRadar(): Promise<SeriesRadarResult> {
  const start = Date.now();
  const ruptures: SeriesRupture[] = [];

  // Fetch FRED and ECB series in parallel
  const [fredData, ecbData] = await Promise.allSettled([
    fetchFREDSeries(),
    fetchECBSeries(),
  ]);

  const allSeries: { id: string; name: string; provider: string; values: number[]; dates: Date[] }[] = [];

  if (fredData.status === 'fulfilled') {
    allSeries.push(...fredData.value);
  }
  if (ecbData.status === 'fulfilled') {
    allSeries.push(...ecbData.value);
  }

  // Check each series for stationarity breaks
  for (const series of allSeries) {
    if (series.values.length < 36) continue; // Need at least 3 years of data

    const adfResult = augmentedDickeyFuller(series.values);
    if (!adfResult.stationary) {
      // Non-stationary series — check for structural break via rolling mean shift
      const breakPoint = detectRollingBreak(series.values, 24);
      if (breakPoint) {
        const score = clampScore(50 + Math.abs(breakPoint.delta) * 30 + recencyBonus(breakPoint.index, series.values.length));
        ruptures.push({
          seriesId: series.id,
          seriesName: series.name,
          provider: series.provider,
          ruptureDate: series.dates[breakPoint.index] || new Date(),
          deltaCorrelation: breakPoint.delta,
          score,
          description: `Structural break in ${series.name}: rolling mean shifted by ${breakPoint.delta.toFixed(2)}`,
        });
      }
    }

    // Check correlation shifts between pairs
    for (const other of allSeries) {
      if (other.id <= series.id || other.values.length < 36) continue;
      const corrShift = detectCorrelationShift(series.values, other.values, 24);
      if (corrShift && Math.abs(corrShift.delta) > 0.3) {
        const score = clampScore(50 + Math.abs(corrShift.delta) * 30 + 10);
        ruptures.push({
          seriesId: `${series.id}__vs__${other.id}`,
          seriesName: `${series.name} vs ${other.name}`,
          provider: series.provider,
          ruptureDate: series.dates[corrShift.index] || new Date(),
          deltaCorrelation: corrShift.delta,
          score,
          description: `Correlation shift between ${series.name} and ${other.name}: Δ=${corrShift.delta.toFixed(2)}`,
        });
      }
    }
  }

  // Deduplicate by seriesId (keep highest score)
  const seen = new Map<string, SeriesRupture>();
  for (const r of ruptures) {
    const existing = seen.get(r.seriesId);
    if (!existing || r.score > existing.score) {
      seen.set(r.seriesId, r);
    }
  }

  const result = [...seen.values()].sort((a, b) => b.score - a.score).slice(0, 15);

  const elapsed = Date.now() - start;
  console.log(`[SERIES RADAR] ${allSeries.length} series checked, ${result.length} ruptures found in ${elapsed}ms`);

  return {
    ruptures: result,
    stats: {
      seriesChecked: allSeries.length,
      rupturesFound: result.length,
      durationMs: elapsed,
    },
  };
}

// ============================================================================
// DATA FETCHERS
// ============================================================================

async function fetchFREDSeries(): Promise<{ id: string; name: string; provider: string; values: number[]; dates: Date[] }[]> {
  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) {
    console.warn('[SERIES RADAR] FRED_API_KEY not set, skipping FRED series');
    return [];
  }

  const out: { id: string; name: string; provider: string; values: number[]; dates: Date[] }[] = [];

  // Fetch 3 series at a time to respect rate limits
  const BATCH = 3;
  for (let i = 0; i < FRED_SERIES.length; i += BATCH) {
    const batch = FRED_SERIES.slice(i, i + BATCH);
    const promises = batch.map(async (s) => {
      try {
        const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${s.fredId}&api_key=${apiKey}&file_type=json&limit=120&sort_order=desc`;
        const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (!res.ok) return null;
        const data = await res.json();
        const observations = (data.observations || []).filter((o: any) => o.value !== '.');
        const values = observations.map((o: any) => parseFloat(o.value)).reverse();
        const dates = observations.map((o: any) => new Date(o.date)).reverse();
        return { id: s.id, name: s.name, provider: 'fred', values, dates };
      } catch {
        return null;
      }
    });
    const results = await Promise.allSettled(promises);
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value) out.push(r.value);
    }
  }

  return out;
}

async function fetchECBSeries(): Promise<{ id: string; name: string; provider: string; values: number[]; dates: Date[] }[]> {
  const out: { id: string; name: string; provider: string; values: number[]; dates: Date[] }[] = [];

  for (const s of ECB_SERIES) {
    try {
      const url = `https://data-api.ecb.europa.eu/service/data/${s.ecbKey}?format=csvdata&lastNObservations=120`;
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) continue;
      const text = await res.text();
      const lines = text.trim().split('\n');
      const header = lines[0].split(',');
      const valueIdx = header.indexOf('OBS_VALUE');
      const dateIdx = header.indexOf('TIME_PERIOD');
      if (valueIdx < 0 || dateIdx < 0) continue;

      const values: number[] = [];
      const dates: Date[] = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',');
        const v = parseFloat(cols[valueIdx]);
        if (!isNaN(v)) {
          values.push(v);
          dates.push(new Date(cols[dateIdx]));
        }
      }
      if (values.length > 0) out.push({ id: s.id, name: s.name, provider: 'ecb', values, dates });
    } catch {
      // skip
    }
  }

  return out;
}

// ============================================================================
// STATISTICAL HELPERS
// ============================================================================

/** Simplified Augmented Dickey-Fuller test — returns true if series appears stationary */
function augmentedDickeyFuller(values: number[]): { statistic: number; stationary: boolean } {
  const n = values.length;
  if (n < 10) return { statistic: 0, stationary: true };

  // Compute first differences
  const diffs: number[] = [];
  for (let i = 1; i < n; i++) diffs.push(values[i] - values[i - 1]);

  // Regress diff on lagged level: Δy_t = α + β*y_{t-1} + ε
  // If β is significantly negative → stationary
  const meanLevel = values.slice(0, n - 1).reduce((s, v) => s + v, 0) / (n - 1);
  const meanDiff = diffs.reduce((s, v) => s + v, 0) / diffs.length;

  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < diffs.length; i++) {
    const laggedDev = values[i] - meanLevel;
    const diffDev = diffs[i] - meanDiff;
    numerator += laggedDev * diffDev;
    denominator += laggedDev * laggedDev;
  }

  const beta = denominator > 0 ? numerator / denominator : 0;
  // Approximate t-statistic (simplified — no Newey-West correction)
  const residuals: number[] = [];
  for (let i = 0; i < diffs.length; i++) {
    residuals.push(diffs[i] - meanDiff - beta * (values[i] - meanLevel));
  }
  const residualVar = residuals.reduce((s, r) => s + r * r, 0) / (residuals.length - 2);
  const seBeta = denominator > 0 ? Math.sqrt(residualVar / denominator) : 1;
  const tStat = seBeta > 0 ? beta / seBeta : 0;

  // Critical value approx -2.86 (5% McKinnon)
  return { statistic: tStat, stationary: tStat < -2.86 };
}

/** Detect rolling mean break — returns index and delta if break found */
function detectRollingBreak(values: number[], windowSize: number): { index: number; delta: number } | null {
  if (values.length < windowSize * 2) return null;

  let maxDelta = 0;
  let breakIndex = -1;

  for (let i = windowSize; i < values.length - windowSize; i++) {
    const before = values.slice(i - windowSize, i);
    const after = values.slice(i, i + windowSize);
    const meanBefore = before.reduce((s, v) => s + v, 0) / windowSize;
    const meanAfter = after.reduce((s, v) => s + v, 0) / windowSize;
    const delta = meanAfter - meanBefore;
    if (Math.abs(delta) > Math.abs(maxDelta)) {
      maxDelta = delta;
      breakIndex = i;
    }
  }

  if (breakIndex >= 0 && Math.abs(maxDelta) > 0) {
    // Normalize by standard deviation
    const allValues = values.slice(Math.max(0, breakIndex - windowSize), breakIndex + windowSize);
    const mean = allValues.reduce((s, v) => s + v, 0) / allValues.length;
    const stdDev = Math.sqrt(allValues.reduce((s, v) => s + (v - mean) ** 2, 0) / allValues.length);
    const normalizedDelta = stdDev > 0 ? maxDelta / stdDev : 0;
    if (Math.abs(normalizedDelta) > 1.5) {
      return { index: breakIndex, delta: normalizedDelta };
    }
  }

  return null;
}

/** Detect correlation shift between two series — rolling window */
function detectCorrelationShift(a: number[], b: number[], windowSize: number): { index: number; delta: number } | null {
  const minLen = Math.min(a.length, b.length);
  if (minLen < windowSize * 2) return null;

  const correlations: number[] = [];
  for (let i = 0; i <= minLen - windowSize; i++) {
    const corr = pearsonCorrelation(a.slice(i, i + windowSize), b.slice(i, i + windowSize));
    correlations.push(corr);
  }

  let maxDelta = 0;
  let breakIndex = -1;
  for (let i = 1; i < correlations.length; i++) {
    const delta = correlations[i] - correlations[i - 1];
    if (Math.abs(delta) > Math.abs(maxDelta)) {
      maxDelta = delta;
      breakIndex = i;
    }
  }

  if (breakIndex >= 0 && Math.abs(maxDelta) > 0.3) {
    return { index: breakIndex, delta: maxDelta };
  }

  return null;
}

/** Pearson correlation coefficient */
function pearsonCorrelation(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 3) return 0;

  const meanX = x.slice(0, n).reduce((s, v) => s + v, 0) / n;
  const meanY = y.slice(0, n).reduce((s, v) => s + v, 0) / n;

  let num = 0, denomX = 0, denomY = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - meanX;
    const dy = y[i] - meanY;
    num += dx * dy;
    denomX += dx * dx;
    denomY += dy * dy;
  }

  const denom = Math.sqrt(denomX * denomY);
  return denom > 0 ? num / denom : 0;
}

// ============================================================================
// SCORING HELPERS
// ============================================================================

function clampScore(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function recencyBonus(index: number, length: number): number {
  // More recent breaks get higher bonus
  const recencyRatio = index / length;
  if (recencyRatio > 0.8) return 15;
  if (recencyRatio > 0.6) return 10;
  if (recencyRatio > 0.4) return 5;
  return 0;
}
