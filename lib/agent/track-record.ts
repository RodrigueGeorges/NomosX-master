/**
 * Track Record — Brier score display and historical accuracy.
 *
 * Inspired by:
 * - IARPA Good Judgment Project: superforecaster calibration tracking
 * - Friedman et al. 2017 (888K forecasts): numeric probabilities are more informative
 * - Tetlock: "the assertion-to-evidence ratio" matters
 *
 * This module renders the historical track record of NomosX predictions,
 * showing calibration (Brier score) and accuracy by confidence level.
 */

import { prisma } from '../db';

export interface TrackRecordStats {
  total: number;
  resolved: number;
  confirmed: number;
  refuted: number;
  expired: number;
  brierScore: number | null;     // Lower is better (0 = perfect, 0.25 = random, 1 = worst)
  calibrationByBucket: Array<{
    bucket: string;              // "0-20%", "20-40%", etc.
    total: number;
    confirmed: number;
    actualRate: number;          // confirmed / total
    expectedRate: number;        // midpoint of bucket
  }>;
  accuracyByHorizon: Array<{
    horizon: string;
    total: number;
    confirmed: number;
    accuracy: number;
  }>;
}

/**
 * Compute track record stats from resolved predictions.
 */
export async function computeTrackRecordStats(): Promise<TrackRecordStats | null> {
  try {
    const predictions = await prisma.prediction.findMany({
      where: {
        status: { in: ['CONFIRMED', 'REFUTED', 'EXPIRED'] },
        probability: { not: null },
      },
      select: {
        probability: true,
        status: true,
        horizon: true,
      },
    });

    if (predictions.length === 0) return null;

    const total = predictions.length;
    const confirmed = predictions.filter(p => p.status === 'CONFIRMED').length;
    const refuted = predictions.filter(p => p.status === 'REFUTED').length;
    const expired = predictions.filter(p => p.status === 'EXPIRED').length;

    // Brier score: average of (p - outcome)^2 where outcome = 1 if confirmed, 0 otherwise
    // Expired predictions are treated as 0 (did not happen)
    const brierSum = predictions.reduce((sum, p) => {
      const outcome = p.status === 'CONFIRMED' ? 1 : 0;
      const prob = p.probability ?? 0.5;
      return sum + Math.pow(prob - outcome, 2);
    }, 0);
    const brierScore = brierSum / total;

    // Calibration by probability bucket
    const buckets = [
      { label: '0-20%', min: 0, max: 0.2 },
      { label: '20-40%', min: 0.2, max: 0.4 },
      { label: '40-60%', min: 0.4, max: 0.6 },
      { label: '60-80%', min: 0.6, max: 0.8 },
      { label: '80-100%', min: 0.8, max: 1.01 },
    ];
    const calibrationByBucket = buckets.map(b => {
      const inBucket = predictions.filter(p => {
        const prob = p.probability ?? 0.5;
        return prob >= b.min && prob < b.max;
      });
      const bucketConfirmed = inBucket.filter(p => p.status === 'CONFIRMED').length;
      return {
        bucket: b.label,
        total: inBucket.length,
        confirmed: bucketConfirmed,
        actualRate: inBucket.length > 0 ? bucketConfirmed / inBucket.length : 0,
        expectedRate: (b.min + b.max) / 2,
      };
    }).filter(b => b.total > 0);

    // Accuracy by horizon
    const horizonGroups: Record<string, typeof predictions> = {};
    for (const p of predictions) {
      const h = p.horizon || 'unknown';
      if (!horizonGroups[h]) horizonGroups[h] = [];
      horizonGroups[h].push(p);
    }
    const accuracyByHorizon = Object.entries(horizonGroups).map(([horizon, preds]) => ({
      horizon,
      total: preds.length,
      confirmed: preds.filter(p => p.status === 'CONFIRMED').length,
      accuracy: preds.length > 0 ? preds.filter(p => p.status === 'CONFIRMED').length / preds.length : 0,
    }));

    return {
      total,
      resolved: total,
      confirmed,
      refuted,
      expired,
      brierScore,
      calibrationByBucket,
      accuracyByHorizon,
    };
  } catch (err) {
    console.warn('[TrackRecord] Failed to compute stats:', String(err).slice(0, 100));
    return null;
  }
}

/**
 * Render the track record as an HTML section.
 * Shows Brier score, calibration table, and accuracy by horizon.
 */
export function renderTrackRecordHtml(stats: TrackRecordStats): string {
  const brier = stats.brierScore ?? 0;
  const brierColor = brier <= 0.1 ? 'var(--nx-text-primary)' :
                     brier <= 0.2 ? 'var(--nx-text-secondary)' :
                     'var(--nx-text-tertiary)';
  const brierGrade = brier <= 0.08 ? 'Excellent' :
                     brier <= 0.15 ? 'Good' :
                     brier <= 0.25 ? 'Fair' : 'Poor';

  const calibrationRows = stats.calibrationByBucket.map(b => {
    const gap = Math.abs(b.actualRate - b.expectedRate);
    const gapColor = gap <= 0.05 ? 'var(--nx-text-primary)' :
                     gap <= 0.15 ? 'var(--nx-text-secondary)' :
                     'var(--nx-text-tertiary)';
    return `
      <tr>
        <td style="padding:0.5rem 0.75rem;border-bottom:1px solid var(--nx-border-subtle);font-family:var(--font-mono);font-size:0.75rem;">${b.bucket}</td>
        <td style="padding:0.5rem 0.75rem;border-bottom:1px solid var(--nx-border-subtle);text-align:center;">${b.total}</td>
        <td style="padding:0.5rem 0.75rem;border-bottom:1px solid var(--nx-border-subtle);text-align:center;">${(b.expectedRate * 100).toFixed(0)}%</td>
        <td style="padding:0.5rem 0.75rem;border-bottom:1px solid var(--nx-border-subtle);text-align:center;color:${gapColor};">${(b.actualRate * 100).toFixed(0)}%</td>
      </tr>`;
  }).join('');

  const horizonRows = stats.accuracyByHorizon.map(h => `
    <tr>
      <td style="padding:0.5rem 0.75rem;border-bottom:1px solid var(--nx-border-subtle);font-family:var(--font-mono);font-size:0.75rem;">${h.horizon}</td>
      <td style="padding:0.5rem 0.75rem;border-bottom:1px solid var(--nx-border-subtle);text-align:center;">${h.total}</td>
      <td style="padding:0.5rem 0.75rem;border-bottom:1px solid var(--nx-border-subtle);text-align:center;">${(h.accuracy * 100).toFixed(0)}%</td>
    </tr>`).join('');

  return `
    <section class="brief-section">
      <h2>NomosX Track Record</h2>
      <p style="color:var(--nx-text-tertiary);font-size:0.8125rem;margin-bottom:1rem;">Historical accuracy of NomosX predictions. The Brier score measures calibration (0 = perfect, 0.25 = random chance). This section is auto-generated from resolved predictions in the database.</p>

      <div style="display:flex;gap:2rem;margin-bottom:1.5rem;flex-wrap:wrap;">
        <div style="text-align:center;">
          <div style="font-family:var(--font-mono);font-size:0.5625rem;text-transform:uppercase;letter-spacing:0.14em;color:var(--nx-text-tertiary);margin-bottom:0.25rem;">Brier Score</div>
          <div style="font-size:1.75rem;font-weight:700;color:${brierColor};">${brier.toFixed(3)}</div>
          <div style="font-size:0.6875rem;color:var(--nx-text-secondary);">${brierGrade}</div>
        </div>
        <div style="text-align:center;">
          <div style="font-family:var(--font-mono);font-size:0.5625rem;text-transform:uppercase;letter-spacing:0.14em;color:var(--nx-text-tertiary);margin-bottom:0.25rem;">Resolved</div>
          <div style="font-size:1.75rem;font-weight:700;">${stats.resolved}</div>
          <div style="font-size:0.6875rem;color:var(--nx-text-secondary);">${stats.confirmed} confirmed · ${stats.refuted} refuted</div>
        </div>
      </div>

      ${calibrationRows ? `
      <h3 style="font-size:0.8125rem;margin-bottom:0.5rem;color:var(--nx-text-secondary);">Calibration by Probability Bucket</h3>
      <table style="width:100%;font-size:0.8125rem;border-collapse:collapse;margin-bottom:1.5rem;">
        <thead>
          <tr>
            <th style="text-align:left;padding:0.5rem 0.75rem;color:var(--nx-text-tertiary);font-family:var(--font-mono);text-transform:uppercase;letter-spacing:0.08em;font-size:0.5625rem;border-bottom:1px solid var(--nx-border-medium);">Probability</th>
            <th style="text-align:center;padding:0.5rem 0.75rem;color:var(--nx-text-tertiary);font-family:var(--font-mono);text-transform:uppercase;letter-spacing:0.08em;font-size:0.5625rem;border-bottom:1px solid var(--nx-border-medium);">N</th>
            <th style="text-align:center;padding:0.5rem 0.75rem;color:var(--nx-text-tertiary);font-family:var(--font-mono);text-transform:uppercase;letter-spacing:0.08em;font-size:0.5625rem;border-bottom:1px solid var(--nx-border-medium);">Expected</th>
            <th style="text-align:center;padding:0.5rem 0.75rem;color:var(--nx-text-tertiary);font-family:var(--font-mono);text-transform:uppercase;letter-spacing:0.08em;font-size:0.5625rem;border-bottom:1px solid var(--nx-border-medium);">Actual</th>
          </tr>
        </thead>
        <tbody>${calibrationRows}</tbody>
      </table>` : '<p style="font-size:0.8125rem;color:var(--nx-text-tertiary);margin-bottom:1.5rem;">Insufficient resolved predictions for calibration analysis.</p>'}

      ${horizonRows ? `
      <h3 style="font-size:0.8125rem;margin-bottom:0.5rem;color:var(--nx-text-secondary);">Accuracy by Forecast Horizon</h3>
      <table style="width:100%;font-size:0.8125rem;border-collapse:collapse;">
        <thead>
          <tr>
            <th style="text-align:left;padding:0.5rem 0.75rem;color:var(--nx-text-tertiary);font-family:var(--font-mono);text-transform:uppercase;letter-spacing:0.08em;font-size:0.5625rem;border-bottom:1px solid var(--nx-border-medium);">Horizon</th>
            <th style="text-align:center;padding:0.5rem 0.75rem;color:var(--nx-text-tertiary);font-family:var(--font-mono);text-transform:uppercase;letter-spacing:0.08em;font-size:0.5625rem;border-bottom:1px solid var(--nx-border-medium);">N</th>
            <th style="text-align:center;padding:0.5rem 0.75rem;color:var(--nx-text-tertiary);font-family:var(--font-mono);text-transform:uppercase;letter-spacing:0.08em;font-size:0.5625rem;border-bottom:1px solid var(--nx-border-medium);">Accuracy</th>
          </tr>
        </thead>
        <tbody>${horizonRows}</tbody>
      </table>` : ''}
    </section>`;
}
