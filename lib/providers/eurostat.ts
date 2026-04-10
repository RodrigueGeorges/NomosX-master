/**
 * Eurostat client for European macro-economic data
 * Official endpoint: https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data
 *
 * Notes:
 * - Eurostat returns a JSON-stat-ish payload where observations are keyed by an integer index
 *   (flattened observation vector), not by the time label.
 * - For our curated indicators we fully specify non-time dimensions so only TIME varies.
 */

import { fetchFromProvider } from '../http-client';
import { env } from '../env';

export interface MacroDataPoint {
  date: Date;
  value: number;
}

export interface MacroSeries {
  provider: string;
  code: string;
  name: string;
  description?: string;
  unit?: string;
  frequency?: string;
  points: MacroDataPoint[];
}

type EurostatIndicator = {
  name: string;
  dataset: string;
  params: Record<string, string>;
  frequency?: string;
  unitLabel?: string;
};

// Curated indicators (robust params that return a single time series)
const EUROSTAT_INDICATORS: Record<string, EurostatIndicator> = {
  // HICP (Euro Area, all items)
  prc_hicp_midx: {
    name: "HICP (EA20) – all items index",
    dataset: "prc_hicp_midx",
    params: { freq: "M", unit: "I15", coicop: "CP00", geo: "EA20" },
    frequency: "monthly",
  },

  // Unemployment rate (Euro Area, total, seasonally adjusted)
  une_rt_m: {
    name: "Unemployment rate (EA20) – total (SA)",
    dataset: "une_rt_m",
    // Age codes available for this dataset include: TOTAL, Y_LT25, Y25-74
    params: { freq: "M", unit: "PC_ACT", sex: "T", age: "TOTAL", geo: "EA20", s_adj: "SA" },
    frequency: "monthly",
  },

  // GDP (Euro Area, real chain-linked volumes) – this dataset is ANNUAL at this endpoint
  nama_10_gdp: {
    name: "GDP (EA20) – real (chain-linked, annual)",
    dataset: "nama_10_gdp",
    params: { freq: "A", unit: "CLV10_MEUR", na_item: "B1GQ", geo: "EA20" },
    frequency: "annual",
  },
};

function parseEurostatPeriod(period: string): Date | null {
  // Typical formats: "YYYY", "YYYY-MM", "YYYY-Q1"
  if (/^\d{4}-\d{2}$/.test(period)) {
    const [y, m] = period.split("-");
    return new Date(Number(y), Number(m) - 1, 1);
  }
  if (/^\d{4}-Q[1-4]$/.test(period)) {
    const y = Number(period.slice(0, 4));
    const q = Number(period.slice(6, 7));
    return new Date(y, (q - 1) * 3, 1);
  }
  if (/^\d{4}$/.test(period)) {
    return new Date(Number(period), 0, 1);
  }
  const d = new Date(period);
  return Number.isNaN(d.getTime()) ? null : d;
}

async function fetchEurostatDataset(dataset: string, params: Record<string, string>) {
  const base = env.EUROSTAT_API.replace(/\/$/, "");
  const sp = new URLSearchParams(params);
  const url = `${base}/${dataset}?${sp.toString()}`;
  return fetchFromProvider<any>("eurostat", url, {
    timeout: 20000,
    retries: 2,
    headers: { Accept: "application/json" },
  });
}

export async function fetchEurostatSeries(code: string): Promise<MacroSeries | null> {
  const indicator = EUROSTAT_INDICATORS[code];
  if (!indicator) {
    console.warn(`[Eurostat] Unknown curated indicator: ${code}`);
    return null;
  }

  try {
    const data: any = await fetchEurostatDataset(indicator.dataset, indicator.params);

    const timeDim = data?.dimension?.time;
    const timeIndex: Record<string, number> = timeDim?.category?.index || {};
    const timeByPos: string[] = [];

    for (const [timeKey, pos] of Object.entries(timeIndex)) {
      timeByPos[Number(pos)] = timeKey;
    }

    const values: Record<string, number> = data?.value || {};

    const points: MacroDataPoint[] = Object.entries(values)
      .map(([obsIndex, v]) => {
        const period = timeByPos[Number(obsIndex)];
        if (!period || v == null) return null;
        const date = parseEurostatPeriod(period);
        if (!date) return null;
        return { date, value: Number(v) };
      })
      .filter((p): p is MacroDataPoint => p !== null)
      .sort((a, b) => a.date.getTime() - b.date.getTime());

    // Best-effort unit label
    const unitCode = indicator.params.unit;
    const unitLabel = unitCode
      ? data?.dimension?.unit?.category?.label?.[unitCode]
      : undefined;

    return {
      provider: "eurostat",
      code,
      name: indicator.name,
      unit: unitLabel || indicator.unitLabel,
      frequency: indicator.frequency,
      points,
    };
  } catch (error: any) {
    console.error(`[Eurostat] Fetch failed for ${code}: ${error.message}`);
    return null;
  }
}

export async function ingestEurostatIndicators(): Promise<MacroSeries[]> {
  const series: MacroSeries[] = [];

  for (const code of Object.keys(EUROSTAT_INDICATORS)) {
    const data = await fetchEurostatSeries(code);
    if (data && data.points.length > 0) {
      series.push(data);
    }
  }

  return series;
}
