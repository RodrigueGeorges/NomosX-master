/**
 * CHRONOS CLIENT — zero-shot quantile forecasts via quant-service.
 *
 * Amazon Chronos-2 (Apache 2.0) forecasts a univariate primary-data series
 * with no training. The reader's quant-agent already produces such series
 * (energy prices, macro indicators); the forecast is emitted as a
 * [MODEL-N] result — median + q10/q90 range — in the computed exhibit.
 *
 * Requires QUANT_SERVICE_URL + NOMOSX_CHRONOS=1. Any failure returns null;
 * the pipeline falls back to the non-forecast exhibit.
 */

import axios from "axios";
import { quantServiceUrl } from "./figaro-client";
import type { ModelResult } from "./types";

const TIMEOUT_MS = 120_000; // first call pays model load; CPU inference ~seconds

export interface ChronosForecastPoint {
  horizon: number;
  q10: number;
  q50: number;
  q90: number;
}

export interface ChronosForecastResult {
  model: string;
  quantileLevels: number[];
  horizon: number;
  points: ChronosForecastPoint[];
  durationMs: number;
}

export function chronosEnabled(): boolean {
  return process.env.NOMOSX_CHRONOS === "1" && !!quantServiceUrl();
}

export async function chronosForecast(
  values: number[],
  predictionLength = 12,
): Promise<ChronosForecastResult | null> {
  const base = quantServiceUrl();
  if (!base || process.env.NOMOSX_CHRONOS !== "1") return null;
  if (values.length < 3) return null;
  try {
    const resp = await axios.post(
      `${base}/v1/forecast`,
      { values, predictionLength },
      { timeout: TIMEOUT_MS },
    );
    const d = resp.data;
    if (!Array.isArray(d?.points) || d.points.length === 0) return null;
    return {
      model: String(d.model ?? "chronos-2"),
      quantileLevels: Array.isArray(d.quantileLevels) ? d.quantileLevels : [0.1, 0.5, 0.9],
      horizon: Number(d.horizon ?? predictionLength),
      points: d.points as ChronosForecastPoint[],
      durationMs: Number(d.durationMs ?? 0),
    };
  } catch {
    return null;
  }
}

/**
 * Render a forecast as a ModelResult — median trajectory + q10/q90 band,
 * plus endpoint summary rows. Reproducible: same series → same forecast.
 */
export function chronosForecastToModelResult(
  series: { label: string; unit: string; provider: string; points: Array<{ t: string; v: number }> },
  forecast: ChronosForecastResult,
  modelRef: number,
): ModelResult {
  const last = series.points[series.points.length - 1];
  const horizon = forecast.points.length;
  const first = forecast.points[0];
  const lastP = forecast.points[horizon - 1];
  const changePct = first && lastP && first.q50 !== 0
    ? ((lastP.q50 - first.q50) / Math.abs(first.q50)) * 100
    : null;

  const rows: ModelResult["rows"] = [
    {
      label: `Median forecast — horizon +${horizon}`,
      value: lastP?.q50 ?? 0,
      unit: series.unit,
      low: lastP?.q10,
      high: lastP?.q90,
      note: `from ${last?.t ?? "latest"} = ${last?.v ?? "?"}`,
    },
    {
      label: "Projected change over horizon",
      value: changePct ?? 0,
      unit: "%",
      low: first && lastP ? ((lastP.q10 - first.q90) / Math.abs(first.q90 || 1)) * 100 : undefined,
      high: first && lastP ? ((lastP.q90 - first.q10) / Math.abs(first.q10 || 1)) * 100 : undefined,
      note: "q10–q90 band on endpoint",
    },
  ];

  return {
    modelRef,
    kind: "chronos-forecast",
    name: `Zero-shot forecast — ${series.label}`,
    methodology: `Amazon ${forecast.model} zero-shot quantile forecasting (no task-specific training). ${series.points.length} historical observations → ${horizon}-step-ahead median with q10/q90 prediction interval.`,
    dataSources: [`${series.provider} primary series: ${series.label}`],
    parameters: [
      { name: "history_points", value: series.points.length, source: `${series.provider} API` },
      { name: "horizon", value: horizon, source: "caller" },
      { name: "quantiles", value: forecast.quantileLevels.join("/"), source: "model" },
    ],
    rows,
    caveats: [
      "Zero-shot statistical forecast — captures trend/seasonality, NOT causal drivers or regime changes.",
      "q10–q90 band is the model's own uncertainty; treat as indicative, not a confidence guarantee.",
      "Horizon is short by design; extrapolation beyond it is unsupported.",
    ],
    computedAt: new Date().toISOString(),
    durationMs: forecast.durationMs,
  };
}
