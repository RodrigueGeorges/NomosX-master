/**
 * NomosX Trust Score Calibration — ECE, Brier score, reliability diagrams.
 *
 * Inspired by:
 * - reliability-eval (ahmadRahman1993): ECE, Brier, Wilcoxon, Spearman for Node/TS
 * - conf-calib (Tajaddin): Isotonic regression cuts ECE from 0.148 to 0.030
 * - reliably (nischal1234): Bootstrap CIs on every metric, DeLong significance test
 * - pydantic-cal: Calibration layer for LLM evaluation
 *
 * Key insight: A trust score of 65 should mean "65% chance of being correct".
 * Without calibration, the number is just an arbitrary scale.
 *
 * This module provides:
 * 1. ECE (Expected Calibration Error) — measures how well confidence matches accuracy
 * 2. Brier score — measures the accuracy of probabilistic predictions
 * 3. Reliability bins — for diagnostic visualization
 * 4. Temperature scaling — post-hoc calibration to improve future scores
 *
 * Usage:
 * - After each pipeline run, record (trustScore, wasQualityGood) pair
 * - After N runs, compute ECE/Brier to assess calibration
 * - Apply temperature scaling to future trust scores if ECE > 0.10
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CalibrationPair {
  predictedTrust: number; // 0-100, the trust score from the pipeline
  actualQuality: number; // 0-1, ground truth quality (1 = good, 0 = bad)
  // Ground truth can come from: human review, funnel test, or downstream metrics
}

export interface CalibrationResult {
  ece: number; // Expected Calibration Error (0 = perfect, 1 = worst)
  brierScore: number; // Brier score (0 = perfect, 1 = worst)
  mce: number; // Maximum Calibration Error
  ace: number; // Adaptive Calibration Error (equal-mass bins)
  reliabilityBins: ReliabilityBin[];
  recommendedTemperature: number; // Temperature for scaling future scores
  sampleSize: number;
  isCalibrated: boolean; // ECE < 0.10
}

export interface ReliabilityBin {
  range: [number, number]; // Trust score range [min, max]
  avgPredicted: number; // Average predicted trust in this bin
  avgActual: number; // Average actual quality in this bin
  count: number; // Number of samples in this bin
  gap: number; // |avgPredicted - avgActual| — calibration gap
}

// ─── ECE (Expected Calibration Error) ───────────────────────────────────────

/**
 * Compute ECE with equal-width bins.
 * ECE = sum over bins of (bin_size / total) * |avg_confidence - avg_accuracy|
 *
 * @param pairs - Array of (predicted, actual) pairs
 * @param numBins - Number of bins (default: 10)
 * @returns ECE value (0 = perfectly calibrated, 1 = worst)
 */
export function computeECE(pairs: CalibrationPair[], numBins = 10): { ece: number; mce: number; bins: ReliabilityBin[] } {
  if (pairs.length === 0) return { ece: 0, mce: 0, bins: [] };

  const binSize = 100 / numBins;
  const bins: ReliabilityBin[] = [];

  for (let i = 0; i < numBins; i++) {
    const min = i * binSize;
    const max = (i + 1) * binSize;
    const inBin = pairs.filter(p => p.predictedTrust >= min && p.predictedTrust < max);
    if (inBin.length === 0) continue;

    const avgPredicted = inBin.reduce((s, p) => s + p.predictedTrust, 0) / inBin.length;
    const avgActual = inBin.reduce((s, p) => s + p.actualQuality * 100, 0) / inBin.length;
    bins.push({
      range: [min, max],
      avgPredicted,
      avgActual,
      count: inBin.length,
      gap: Math.abs(avgPredicted - avgActual),
    });
  }

  const totalSamples = pairs.length;
  const ece = bins.reduce((sum, b) => sum + (b.count / totalSamples) * b.gap, 0);
  const mce = bins.length > 0 ? Math.max(...bins.map(b => b.gap)) : 0;

  return { ece: ece / 100, mce: mce / 100, bins }; // Normalize to 0-1
}

// ─── ACE (Adaptive Calibration Error) ───────────────────────────────────────

/**
 * Compute ACE with equal-mass bins (adaptive binning).
 * More robust than ECE when the distribution is skewed.
 */
export function computeACE(pairs: CalibrationPair[], numBins = 10): number {
  if (pairs.length === 0) return 0;

  // Sort by predicted trust
  const sorted = [...pairs].sort((a, b) => a.predictedTrust - b.predictedTrust);
  const binSize = Math.floor(sorted.length / numBins);
  if (binSize === 0) return 0;

  let ace = 0;
  for (let i = 0; i < numBins; i++) {
    const start = i * binSize;
    const end = i === numBins - 1 ? sorted.length : (i + 1) * binSize;
    const bin = sorted.slice(start, end);
    if (bin.length === 0) continue;

    const avgPredicted = bin.reduce((s, p) => s + p.predictedTrust, 0) / bin.length;
    const avgActual = bin.reduce((s, p) => s + p.actualQuality * 100, 0) / bin.length;
    ace += (bin.length / sorted.length) * Math.abs(avgPredicted - avgActual);
  }

  return ace / 100; // Normalize to 0-1
}

// ─── Brier Score ────────────────────────────────────────────────────────────

/**
 * Compute the Brier score.
 * Brier = (1/N) * sum((predicted_prob - actual_outcome)^2)
 *
 * @param pairs - Array of (predicted, actual) pairs
 * @returns Brier score (0 = perfect, 1 = worst)
 */
export function computeBrierScore(pairs: CalibrationPair[]): number {
  if (pairs.length === 0) return 0;
  const sum = pairs.reduce((s, p) => {
    const predictedProb = p.predictedTrust / 100;
    const diff = predictedProb - p.actualQuality;
    return s + diff * diff;
  }, 0);
  return sum / pairs.length;
}

// ─── Temperature Scaling ────────────────────────────────────────────────────

/**
 * Find the optimal temperature for calibrating future trust scores.
 * Temperature scaling: calibrated_score = sigmoid((logit(score) - logit(0.5)) / T)
 * For simplicity, we use a linear approximation:
 *   calibrated = 0.5 + (score - 0.5) / T
 *
 * @param pairs - Calibration pairs
 * @returns Optimal temperature (1.0 = no change, >1 = less confident, <1 = more confident)
 */
export function findOptimalTemperature(pairs: CalibrationPair[]): number {
  if (pairs.length < 10) return 1.0; // Not enough data

  // Grid search over temperature values
  let bestT = 1.0;
  let bestECE = Infinity;

  for (let t = 0.5; t <= 3.0; t += 0.1) {
    const scaled = pairs.map(p => ({
      predictedTrust: Math.max(0, Math.min(100, 50 + (p.predictedTrust - 50) / t)),
      actualQuality: p.actualQuality,
    }));
    const { ece } = computeECE(scaled);
    if (ece < bestECE) {
      bestECE = ece;
      bestT = t;
    }
  }

  return Math.round(bestT * 100) / 100;
}

// ─── Full Calibration Analysis ──────────────────────────────────────────────

/**
 * Run a full calibration analysis on a set of (predicted, actual) pairs.
 *
 * @param pairs - Array of (predictedTrust, actualQuality) pairs
 * @returns Full calibration result with ECE, Brier, ACE, bins, and recommended temperature
 */
export function analyzeCalibration(pairs: CalibrationPair[]): CalibrationResult {
  if (pairs.length === 0) {
    return {
      ece: 0,
      brierScore: 0,
      mce: 0,
      ace: 0,
      reliabilityBins: [],
      recommendedTemperature: 1.0,
      sampleSize: 0,
      isCalibrated: true,
    };
  }

  const { ece, mce, bins } = computeECE(pairs);
  const brier = computeBrierScore(pairs);
  const ace = computeACE(pairs);
  const temp = findOptimalTemperature(pairs);

  return {
    ece,
    brierScore: brier,
    mce,
    ace,
    reliabilityBins: bins,
    recommendedTemperature: temp,
    sampleSize: pairs.length,
    isCalibrated: ece < 0.10,
  };
}

/**
 * Apply temperature scaling to a trust score.
 * Use the recommended temperature from analyzeCalibration to calibrate future scores.
 *
 * @param trustScore - Original trust score (0-100)
 * @param temperature - Temperature parameter (1.0 = no change)
 * @returns Calibrated trust score (0-100)
 */
export function applyTemperatureScaling(trustScore: number, temperature: number): number {
  const calibrated = 50 + (trustScore - 50) / temperature;
  return Math.max(0, Math.min(100, Math.round(calibrated)));
}
