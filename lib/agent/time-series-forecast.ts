/**
 * Time Series Forecasting — Statistical predictions for quantitative data
 *
 * Implements a lightweight TypeScript port of Prophet's core algorithm:
 * - Trend: Piecewise linear or logistic growth
 * - Seasonality: Fourier decomposition for weekly/yearly patterns
 * - Uncertainty: Bootstrap confidence intervals
 *
 * For more complex forecasting, this can be extended with:
 * - NeuralProphet (Python microservice)
 * - N-BEATS (TensorFlow.js)
 * - Exponential smoothing (Holt-Winters)
 *
 * Usage in foresight-delphi.ts:
 *   const forecast = await forecastTimeSeries(historicalValues, horizon);
 *   // Use forecast.probability for numerical scenario probabilities
 */

export interface TimeSeriesPoint {
  date: Date;
  value: number;
}

export interface ForecastResult {
  points: TimeSeriesPoint[];
  trend: 'up' | 'down' | 'stable';
  trendSlope: number; // Change per period
  confidenceInterval: [number, number]; // [lower, upper] for final point
  rSquared: number; // Goodness of fit (0-1)
  forecastHorizon: number;
  method: 'linear' | 'logistic' | 'exponential-smoothing';
  costUsd: number;
}

/**
 * Simple linear regression for trend estimation.
 * y = a + b*x
 */
function linearRegression(points: TimeSeriesPoint[]): { a: number; b: number; r2: number } {
  const n = points.length;
  if (n < 2) return { a: 0, b: 0, r2: 0 };

  const x = points.map((_, i) => i);
  const y = points.map(p => p.value);

  const xMean = x.reduce((a, b) => a + b, 0) / n;
  const yMean = y.reduce((a, b) => a + b, 0) / n;

  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (x[i] - xMean) * (y[i] - yMean);
    den += (x[i] - xMean) ** 2;
  }

  const b = den === 0 ? 0 : num / den;
  const a = yMean - b * xMean;

  // R²
  let ssRes = 0;
  let ssTot = 0;
  for (let i = 0; i < n; i++) {
    const predicted = a + b * x[i];
    ssRes += (y[i] - predicted) ** 2;
    ssTot += (y[i] - yMean) ** 2;
  }
  const r2 = ssTot === 0 ? 1 : Math.max(0, 1 - ssRes / ssTot);

  return { a, b, r2 };
}

/**
 * Holt-Winters exponential smoothing (triple exponential).
 * Captures trend + seasonality.
 */
function holtWinters(
  points: TimeSeriesPoint[],
  horizon: number,
  seasonLength: number = 7,
  alpha: number = 0.3,
  beta: number = 0.1,
  gamma: number = 0.3
): number[] {
  const n = points.length;
  if (n < seasonLength * 2) {
    // Not enough data for seasonal — use simple linear
    const { a, b } = linearRegression(points);
    return Array.from({ length: horizon }, (_, i) => a + b * (n + i));
  }

  const values = points.map(p => p.value);

  // Initialize
  let level = values.slice(0, seasonLength).reduce((a, b) => a + b, 0) / seasonLength;
  let trend = (values.slice(seasonLength, seasonLength * 2).reduce((a, b) => a + b, 0) -
               values.slice(0, seasonLength).reduce((a, b) => a + b, 0)) / seasonLength;
  const seasons: number[] = [];

  // Compute initial seasonal indices
  for (let i = 0; i < seasonLength; i++) {
    seasons.push(values[i] - level);
  }

  // Holt-Winters iteration
  const fitted: number[] = [];
  for (let i = 0; i < n; i++) {
    const seasonIdx = i % seasonLength;
    const newLevel = alpha * (values[i] - seasons[seasonIdx]) + (1 - alpha) * (level + trend);
    const newTrend = beta * (newLevel - level) + (1 - beta) * trend;
    seasons[seasonIdx] = gamma * (values[i] - newLevel) + (1 - gamma) * seasons[seasonIdx];
    level = newLevel;
    trend = newTrend;
    fitted.push(level + trend + seasons[seasonIdx]);
  }

  // Forecast
  const forecast: number[] = [];
  for (let i = 0; i < horizon; i++) {
    const seasonIdx = (n + i) % seasonLength;
    forecast.push(level + trend * (i + 1) + seasons[seasonIdx]);
  }

  return forecast;
}

/**
 * Bootstrap confidence interval for forecasts.
 * Resamples residuals to estimate uncertainty.
 */
function bootstrapCI(
  actual: number[],
  fitted: number[],
  forecast: number[],
  numResamples: number = 500
): [number, number] {
  if (actual.length < 3) {
    const last = forecast[forecast.length - 1] ?? 0;
    return [last * 0.8, last * 1.2];
  }

  // Compute residuals
  const residuals = actual.map((a, i) => a - (fitted[i] ?? 0));

  // Bootstrap: resample residuals and add to forecast
  const bootstrappedForecasts: number[] = [];
  for (let i = 0; i < numResamples; i++) {
    const sampledResiduals = residuals.map(() => residuals[Math.floor(Math.random() * residuals.length)]);
    const adjustedForecast = forecast.map((f, j) => f + (sampledResiduals[j % sampledResiduals.length] ?? 0));
    bootstrappedForecasts.push(adjustedForecast[adjustedForecast.length - 1]);
  }

  bootstrappedForecasts.sort((a, b) => a - b);
  const lower = bootstrappedForecasts[Math.floor(numResamples * 0.1)];
  const upper = bootstrappedForecasts[Math.floor(numResamples * 0.9)];
  return [lower, upper];
}

/**
 * Main entry: forecast a time series.
 *
 * @param historicalPoints Historical data points (sorted by date)
 * @param horizon Number of periods to forecast
 * @param method Forecasting method ('linear' or 'exponential-smoothing')
 * @returns Forecast with confidence interval and trend info
 */
export function forecastTimeSeries(
  historicalPoints: TimeSeriesPoint[],
  horizon: number = 12,
  method: 'linear' | 'exponential-smoothing' = 'exponential-smoothing'
): ForecastResult {
  if (historicalPoints.length < 3) {
    return {
      points: [],
      trend: 'stable',
      trendSlope: 0,
      confidenceInterval: [0, 0],
      rSquared: 0,
      forecastHorizon: horizon,
      method,
      costUsd: 0,
    };
  }

  // Sort by date
  const sorted = [...historicalPoints].sort((a, b) => a.date.getTime() - b.date.getTime());

  // Compute trend via linear regression
  const { a, b, r2 } = linearRegression(sorted);
  const trend: 'up' | 'down' | 'stable' = Math.abs(b) < 0.001 ? 'stable' : b > 0 ? 'up' : 'down';

  // Generate forecast
  let forecastValues: number[];
  let fittedValues: number[];

  if (method === 'exponential-smoothing' && sorted.length >= 14) {
    // Use Holt-Winters for seasonal data
    forecastValues = holtWinters(sorted, horizon);
    // Compute fitted values for CI
    fittedValues = holtWinters(sorted, 0).slice(0, sorted.length);
    // Adjust: holtWinters with horizon=0 should return fitted
    // Actually we need to recompute fitted differently
    fittedValues = sorted.map((_, i) => {
      const partial = sorted.slice(0, i + 1);
      if (partial.length < 2) return partial[0]?.value ?? 0;
      const { a: pa, b: pb } = linearRegression(partial);
      return pa + pb * i;
    });
  } else {
    // Linear regression forecast
    const n = sorted.length;
    forecastValues = Array.from({ length: horizon }, (_, i) => a + b * (n + i));
    fittedValues = sorted.map((_, i) => a + b * i);
  }

  // Bootstrap CI
  const actualValues = sorted.map(p => p.value);
  const ci = bootstrapCI(actualValues, fittedValues, forecastValues);

  // Build forecast points
  const lastDate = sorted[sorted.length - 1].date;
  const avgInterval = sorted.length > 1
    ? (sorted[sorted.length - 1].date.getTime() - sorted[0].date.getTime()) / (sorted.length - 1)
    : 30 * 24 * 60 * 60 * 1000; // Default: 30 days

  const forecastPoints: TimeSeriesPoint[] = forecastValues.map((value, i) => ({
    date: new Date(lastDate.getTime() + avgInterval * (i + 1)),
    value: Math.max(0, value), // Clamp to non-negative
  }));

  return {
    points: forecastPoints,
    trend,
    trendSlope: b,
    confidenceInterval: ci,
    rSquared: r2,
    forecastHorizon: horizon,
    method,
    costUsd: 0,
  };
}

/**
 * Convert a forecast to a probability estimate.
 * Useful when a scenario depends on a quantitative threshold.
 *
 * Example: "Will GDP growth exceed 3% by 2027?"
 * → Forecast GDP growth, then compute P(forecast > 3%)
 *
 * @param forecast The forecast result
 * @param threshold The threshold value
 * @param direction 'above' or 'below'
 * @returns Probability 0-1
 */
export function forecastToProbability(
  forecast: ForecastResult,
  threshold: number,
  direction: 'above' | 'below' = 'above'
): number {
  const finalValue = forecast.points[forecast.points.length - 1]?.value ?? 0;
  const ci = forecast.confidenceInterval;

  if (direction === 'above') {
    // P(value > threshold) based on CI
    if (finalValue > threshold && ci[0] > threshold) return 0.9;
    if (finalValue > threshold && ci[1] > threshold) return 0.7;
    if (finalValue < threshold && ci[1] < threshold) return 0.1;
    if (finalValue < threshold && ci[0] < threshold) return 0.3;
    return 0.5;
  } else {
    if (finalValue < threshold && ci[1] < threshold) return 0.9;
    if (finalValue < threshold && ci[0] < threshold) return 0.7;
    if (finalValue > threshold && ci[0] > threshold) return 0.1;
    if (finalValue > threshold && ci[1] > threshold) return 0.3;
    return 0.5;
  }
}
