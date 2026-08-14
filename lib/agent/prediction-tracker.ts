/**
 * Prediction Tracker & Calibration — NomosX
 *
 * Inspired by:
 * - Forecasting Agent (NYU Agentic Learning Lab, +0.18 info coefficient)
 * - predict-raven (Polymarket live agent)
 * - Outcome-based RL for Forecasting (14B model matche o1, beats on calibration)
 * - ConfidenceBench (2026): Calibration benchmark for LLMs
 * - Scenario Lab (MCTS for branching futures)
 *
 * Architecture:
 * - Store each SCATTER hypothesis/prediction with timestamp + probability
 * - 30/90/365 days later, evaluate if the prediction came true
 * - Compute Brier score per domain and per prediction type
 * - Feed calibration data back into SCATTER to adjust future probabilities
 *
 * Integration:
 * - scenario-engine.ts: call storePrediction() when generating hypotheses
 * - pipeline-v2.ts: call evaluatePastPredictions() at pipeline start
 * - context-primer.ts: include calibration data in context block
 */

import { prisma } from '../db';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface Prediction {
  id: string;
  briefId: string;
  researchQuestion: string;
  hypothesis: string;
  probability: number; // 0-1 (predicted probability of occurrence)
  horizon: string; // '30d' | '90d' | '365d' | 'long-term'
  domain: string;
  predictionType: 'scenario' | 'trend' | 'breakthrough' | 'risk' | 'opportunity';
  secondOrderEffects?: string[];
  createdAt: Date;
  // Evaluation (populated when evaluated)
  evaluatedAt?: Date;
  outcome?: 'occurred' | 'not_occurred' | 'partially_occurred' | 'unclear';
  outcomeEvidence?: string;
  brierScore?: number;
}

export interface CalibrationReport {
  totalPredictions: number;
  evaluatedPredictions: number;
  pendingPredictions: number;
  averageBrierScore: number;
  calibrationByDomain: Record<string, { count: number; brierScore: number }>;
  calibrationByHorizon: Record<string, { count: number; brierScore: number }>;
  calibrationByType: Record<string, { count: number; brierScore: number }>;
  overconfidentDomains: string[];
  underconfidentDomains: string[];
  recommendations: string[];
}

// ─── Storage ────────────────────────────────────────────────────────────────

/**
 * Store a prediction from SCATTER or analyst output.
 */
export async function storePrediction(params: {
  briefId: string;
  researchQuestion: string;
  hypothesis: string;
  probability: number;
  horizon?: string;
  domain?: string;
  predictionType?: Prediction['predictionType'];
  secondOrderEffects?: string[];
}): Promise<void> {
  try {
    // Adapt to existing Prediction schema which uses:
    // claim (not hypothesis), confidence (not predictionType),
    // resolutionCriteria, whatWouldFalsify, sourceRefs (required fields)
    await prisma.prediction.create({
      data: {
        briefId: params.briefId,
        claim: `${params.hypothesis} [${params.researchQuestion.slice(0, 80)}]`,
        horizon: params.horizon || '90d',
        probability: params.probability,
        confidence: params.predictionType || 'scenario',
        resolutionCriteria: `Evaluate whether the following prediction came true: ${params.hypothesis}`,
        whatWouldFalsify: `Evidence that contradicts: ${params.hypothesis}`,
        sourceRefs: [],
        status: 'OPEN',
      },
    });
    console.log(`[PredictionTracker] Stored: ${params.hypothesis.slice(0, 60)}... (p=${params.probability}, horizon=${params.horizon || '90d'})`);
  } catch (error) {
    // Non-blocking — if table doesn't exist, just log
    console.warn(`[PredictionTracker] Failed to store prediction (non-blocking):`, error instanceof Error ? error.message : String(error));
  }
}

/**
 * Batch store predictions from SCATTER hypotheses.
 */
export async function storePredictionsFromHypotheses(
  briefId: string,
  researchQuestion: string,
  hypotheses: Array<{
    name: string;
    description: string;
    probability: number;
    horizon?: string;
    secondOrderEffects?: string[];
  }>,
  domain?: string,
): Promise<void> {
  for (const h of hypotheses) {
    await storePrediction({
      briefId,
      researchQuestion,
      hypothesis: `${h.name}: ${h.description}`,
      probability: h.probability,
      horizon: h.horizon || '90d',
      domain: domain || 'general',
      predictionType: 'scenario',
      secondOrderEffects: h.secondOrderEffects,
    });
  }
}

// ─── Evaluation ─────────────────────────────────────────────────────────────

/**
 * Find predictions that are due for evaluation (horizon has elapsed).
 */
export async function findPredictionsDueForEvaluation(): Promise<Prediction[]> {
  try {
    const now = new Date();
    // Adapt to existing schema: uses status='OPEN' and resolvedAt IS NULL
    const predictions = await prisma.prediction.findMany({
      where: {
        status: 'OPEN',
        resolvedAt: null,
        OR: [
          { horizon: '30d', createdAt: { lt: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) } },
          { horizon: '90d', createdAt: { lt: new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000) } },
          { horizon: '365d', createdAt: { lt: new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000) } },
          { horizon: 'long-term', createdAt: { lt: new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000) } },
        ],
      },
      take: 50,
    });
    return predictions as unknown as Prediction[];
  } catch (error) {
    console.warn('[PredictionTracker] Failed to find due predictions:', error instanceof Error ? error.message : String(error));
    return [];
  }
}

/**
 * Evaluate a prediction's outcome.
 * In production, this would use LLM + web search to determine if the prediction came true.
 * For now, it's a placeholder that marks predictions for manual review.
 */
export async function evaluatePrediction(predictionId: string, outcome: Prediction['outcome'], evidence: string): Promise<void> {
  try {
    // Adapt to existing schema: uses resolvedAt, outcome, resolutionNotes, status
    const prediction = await prisma.prediction.findUnique({
      where: { id: predictionId },
      select: { probability: true },
    });

    if (!prediction) return;

    const prob = prediction.probability ?? 0.5;
    const actualOutcome = outcome === 'occurred' ? 1 : outcome === 'not_occurred' ? 0 : 0.5;
    const brierScore = Math.pow(prob - actualOutcome, 2);

    // Use existing schema fields: resolvedAt, outcome, resolutionNotes, status
    await prisma.prediction.update({
      where: { id: predictionId },
      data: {
        resolvedAt: new Date(),
        outcome,
        resolutionNotes: `${evidence} [Brier score: ${brierScore.toFixed(3)}]`,
        status: 'RESOLVED',
      },
    });

    console.log(`[PredictionTracker] Evaluated ${predictionId}: ${outcome} (Brier=${brierScore.toFixed(3)})`);
  } catch (error) {
    console.warn('[PredictionTracker] Failed to evaluate prediction:', error instanceof Error ? error.message : String(error));
  }
}

// ─── Calibration Report ─────────────────────────────────────────────────────

/**
 * Generate a calibration report from evaluated predictions.
 * Brier score: 0 = perfect, 0.25 = random guessing, 1 = worst possible.
 */
export async function generateCalibrationReport(): Promise<CalibrationReport> {
  try {
    // Adapt to existing schema: uses resolvedAt, outcome, probability
    // Brier score is computed on-the-fly from probability and outcome
    const evaluatedRaw = await prisma.prediction.findMany({
      where: {
        resolvedAt: { not: null },
        outcome: { not: null },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });

    // Compute Brier scores on-the-fly
    const evaluated = evaluatedRaw.map((p: any) => {
      const prob = p.probability ?? 0.5;
      const actual = p.outcome === 'occurred' ? 1 : p.outcome === 'not_occurred' ? 0 : 0.5;
      return { ...p, brierScore: Math.pow(prob - actual, 2) };
    });

    if (!evaluated || evaluated.length === 0) {
      return {
        totalPredictions: 0,
        evaluatedPredictions: 0,
        pendingPredictions: 0,
        averageBrierScore: 0,
        calibrationByDomain: {},
        calibrationByHorizon: {},
        calibrationByType: {},
        overconfidentDomains: [],
        underconfidentDomains: [],
        recommendations: ['No evaluated predictions yet — calibration data will be available after predictions mature.'],
      };
    }

    const totalPredictions = await prisma.prediction.count();
    const evaluatedPredictions = evaluated.length;
    const pendingPredictions = totalPredictions - evaluatedPredictions;

    // Average Brier score
    const avgBrier = evaluated.reduce((sum: number, p: any) => sum + Number(p.brierScore), 0) / evaluated.length;

    // Calibration by domain
    const byDomain: Record<string, { count: number; brierScore: number }> = {};
    const byHorizon: Record<string, { count: number; brierScore: number }> = {};
    const byType: Record<string, { count: number; brierScore: number }> = {};

    for (const p of evaluated) {
      // Adapt to existing schema: no domain field, use 'general'
      // confidence field maps to predictionType
      const domain = 'general';
      const horizon = p.horizon || '90d';
      const type = p.confidence || 'scenario';

      if (!byDomain[domain]) byDomain[domain] = { count: 0, brierScore: 0 };
      byDomain[domain].count++;
      byDomain[domain].brierScore += Number(p.brierScore);

      if (!byHorizon[horizon]) byHorizon[horizon] = { count: 0, brierScore: 0 };
      byHorizon[horizon].count++;
      byHorizon[horizon].brierScore += Number(p.brierScore);

      if (!byType[type]) byType[type] = { count: 0, brierScore: 0 };
      byType[type].count++;
      byType[type].brierScore += Number(p.brierScore);
    }

    // Average the Brier scores
    for (const d of Object.keys(byDomain)) byDomain[d].brierScore /= byDomain[d].count;
    for (const h of Object.keys(byHorizon)) byHorizon[h].brierScore /= byHorizon[h].count;
    for (const t of Object.keys(byType)) byType[t].brierScore /= byType[t].count;

    // Identify overconfident (Brier > 0.25) and underconfident (Brier < 0.10) domains
    const overconfidentDomains = Object.entries(byDomain)
      .filter(([, v]) => v.brierScore > 0.25 && v.count >= 3)
      .map(([k]) => k);
    const underconfidentDomains = Object.entries(byDomain)
      .filter(([, v]) => v.brierScore < 0.10 && v.count >= 3)
      .map(([k]) => k);

    // Recommendations
    const recommendations: string[] = [];
    if (avgBrier > 0.25) {
      recommendations.push('Overall calibration is poor (Brier > 0.25). Predictions are overconfident — consider lowering probability estimates.');
    } else if (avgBrier < 0.15) {
      recommendations.push('Overall calibration is good (Brier < 0.15). Predictions are well-calibrated.');
    }
    for (const domain of overconfidentDomains) {
      recommendations.push(`Overconfident in ${domain} — reduce probability estimates for this domain.`);
    }
    for (const domain of underconfidentDomains) {
      recommendations.push(`Underconfident in ${domain} — can increase probability estimates for this domain.`);
    }

    return {
      totalPredictions,
      evaluatedPredictions,
      pendingPredictions,
      averageBrierScore: avgBrier,
      calibrationByDomain: byDomain,
      calibrationByHorizon: byHorizon,
      calibrationByType: byType,
      overconfidentDomains,
      underconfidentDomains,
      recommendations,
    };
  } catch (error) {
    console.warn('[PredictionTracker] Failed to generate calibration report:', error instanceof Error ? error.message : String(error));
    return {
      totalPredictions: 0,
      evaluatedPredictions: 0,
      pendingPredictions: 0,
      averageBrierScore: 0,
      calibrationByDomain: {},
      calibrationByHorizon: {},
      calibrationByType: {},
      overconfidentDomains: [],
      underconfidentDomains: [],
      recommendations: ['Calibration report unavailable.'],
    };
  }
}

/**
 * Format calibration data for injection into SCATTER prompt.
 * This helps SCATTER adjust its probability estimates based on past performance.
 */
export function formatCalibrationContext(report: CalibrationReport): string {
  if (report.evaluatedPredictions === 0) return '';

  const lines: string[] = ['=== PREDICTION CALIBRATION DATA ==='];
  lines.push(`Past predictions: ${report.evaluatedPredictions} evaluated | Average Brier score: ${report.averageBrierScore.toFixed(3)} (0=perfect, 0.25=random)`);

  if (report.overconfidentDomains.length > 0) {
    lines.push(`Overconfident domains (reduce probability estimates): ${report.overconfidentDomains.join(', ')}`);
  }
  if (report.underconfidentDomains.length > 0) {
    lines.push(`Underconfident domains (can increase probability estimates): ${report.underconfidentDomains.join(', ')}`);
  }

  if (Object.keys(report.calibrationByHorizon).length > 0) {
    lines.push('\nCalibration by time horizon:');
    for (const [horizon, data] of Object.entries(report.calibrationByHorizon)) {
      lines.push(`  ${horizon}: Brier=${data.brierScore.toFixed(3)} (${data.count} predictions)`);
    }
  }

  lines.push('\n=== END CALIBRATION DATA ===\n');
  return lines.join('\n');
}
