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
  probability: number | string; // LLM hypotheses sometimes emit ".10"-style strings
  horizon?: string;
  domain?: string;
  predictionType?: Prediction['predictionType'];
  secondOrderEffects?: string[];
}): Promise<void> {
  try {
    // Adapt to existing Prediction schema which uses:
    // claim (not hypothesis), confidence (not predictionType),
    // resolutionCriteria, whatWouldFalsify, sourceRefs (required fields)
    // probability arrives from LLM-produced hypotheses — coerce strings like
    // ".10" (Prisma Float rejects them) and clamp to the 0-1 contract.
    const p = typeof params.probability === 'number' ? params.probability : parseFloat(String(params.probability));
    const probability = Number.isFinite(p) ? Math.min(1, Math.max(0, p)) : 0.5;
    await prisma.prediction.create({
      data: {
        briefId: params.briefId,
        claim: `${params.hypothesis} [${params.researchQuestion.slice(0, 80)}]`,
        horizon: params.horizon || '90d',
        probability,
        confidence: params.predictionType || 'scenario',
        resolutionCriteria: `Evaluate whether the following prediction came true: ${params.hypothesis}`,
        whatWouldFalsify: `Evidence that contradicts: ${params.hypothesis}`,
        sourceRefs: [],
        status: 'OPEN',
      },
    });
    console.log(`[PredictionTracker] Stored: ${params.hypothesis.slice(0, 60)}... (p=${probability}, horizon=${params.horizon || '90d'})`);
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
 * Parse a stored horizon string into the date the prediction becomes
 * due for evaluation. Horizons are free text in practice — '30d',
 * '90d', '365d', 'long-term', '1-2 years', '2027-Q2', '2028',
 * '2029-2030' — and the old due-check only matched the four relative
 * literals, so calendar-horizon predictions were NEVER eligible
 * (live: 813 OPEN, 0 resolved). Unparseable → null (never auto-due;
 * fail closed, stays OPEN for manual review).
 */
export function parseHorizonDue(horizon: string, createdAt: Date): Date | null {
  const h = (horizon || '').trim().toLowerCase();
  if (!h) return null;

  const rel = h.match(/^(\d+)\s*d\b/);
  if (rel) return new Date(createdAt.getTime() + Number(rel[1]) * 86_400_000);

  if (/long[-\s]?term|indefini|long\s*term/.test(h)) {
    return new Date(createdAt.getTime() + 365 * 86_400_000);
  }

  const years = h.match(/(\d+(?:\.\d+)?)\s*(?:-|–|to|\+)\s*(\d+(?:\.\d+)?)?\s*(?:years?|ans|y\b)/);
  if (years) {
    const n = years[2] ? Number(years[2]) : Number(years[1]);
    return new Date(createdAt.getTime() + n * 365 * 86_400_000);
  }
  const oneYear = h.match(/(\d+(?:\.\d+)?)\s*(?:year|an|y)\b/);
  if (oneYear) return new Date(createdAt.getTime() + Number(oneYear[1]) * 365 * 86_400_000);

  // Calendar horizons: '2027-Q2' → due at quarter END (Jul 1 = Q3 start);
  // '2028' → Dec 31 2028; '2029-2030' → Jul 1 2030 (mid of the range).
  const cal = h.match(/^(\d{4})(?:\s*[-–]\s*(\d{4}))?(?:-q([1-4]))?$/);
  if (cal) {
    const y1 = Number(cal[1]);
    const y2 = cal[2] ? Number(cal[2]) : null;
    const q = cal[3] ? Number(cal[3]) : null;
    if (y2 !== null) return new Date(Date.UTC(y2, 6, 1)); // mid of range
    if (q !== null) return new Date(Date.UTC(y1, q * 3, 1)); // first day after quarter
    return new Date(Date.UTC(y1, 11, 31)); // end of year
  }
  const calLoose = h.match(/(\d{4})\s*-?\s*q?([1-4])\b/);
  if (calLoose) return new Date(Date.UTC(Number(calLoose[1]), Number(calLoose[2]) * 3, 1));

  // OT-1: prose horizons ("We look to 2030 because…") — last-ditch: the first
  // plausible year becomes the due date (end of that year). Previously these
  // returned null → OPEN forever, unresolvable even after the year passed.
  const anyYear = h.match(/\b(20\d{2})\b/);
  if (anyYear) {
    const y = Number(anyYear[1]);
    if (y >= createdAt.getUTCFullYear()) return new Date(Date.UTC(y, 11, 31));
  }

  return null;
}

/**
 * Find OPEN predictions whose horizon has elapsed. Fetches a bounded
 * candidate set and filters by parsed due date — horizon is free text,
 * so SQL can't express the predicate.
 */
export async function findPredictionsDueForEvaluation(limit = 50): Promise<Prediction[]> {
  try {
    const candidates = await prisma.prediction.findMany({
      where: { status: 'OPEN', resolvedAt: null },
      orderBy: { createdAt: 'asc' },
      take: 1500,
    });
    const now = Date.now();
    const due = (candidates as any[]).filter(c => {
      // dueAt (ISO, authoritative — OT-1) wins; horizon parsing is fallback.
      const dueAt = c.dueAt ? new Date(c.dueAt) : parseHorizonDue(c.horizon, c.createdAt);
      return dueAt !== null && dueAt.getTime() <= now;
    }).slice(0, limit);
    return due as unknown as Prediction[];
  } catch (error) {
    console.warn('[PredictionTracker] Failed to find due predictions:', error instanceof Error ? error.message : String(error));
    return [];
  }
}

/**
 * Auto-resolve due predictions with one bounded LLM judgment each.
 * Writes schema-valid statuses (CONFIRMED/REFUTED/EXPIRED — the old code
 * wrote 'RESOLVED', outside the documented contract) and embeds the
 * Brier score in resolutionNotes so generateCalibrationReport picks it
 * up. UNCLEAR outcomes expire honestly rather than guess.
 * Bounded: `limit` predictions per call, never throws.
 */
export async function resolveDuePredictions(limit = 10): Promise<{ resolved: number; expired: number; costUsd: number }> {
  const due = await findPredictionsDueForEvaluation(limit);
  if (due.length === 0) return { resolved: 0, expired: 0, costUsd: 0 };

  let resolved = 0, expired = 0, costUsd = 0;
  const { callLLM } = await import('../llm/unified-llm');
  const { parseJson } = await import('./json-utils');

  for (const p of due) {
    const raw = p as any;
    try {
      const res = await callLLM({
        messages: [
          { role: 'system', content: 'You evaluate whether a past analytical prediction came true. Output valid JSON only: {"outcome":"CONFIRMED"|"REFUTED"|"UNCLEAR","notes":"one sentence of evidence"}. CONFIRMED = the claimed development occurred as stated. REFUTED = evidence shows it did not. UNCLEAR = cannot be determined from general knowledge — do not guess.' },
          { role: 'user', content: `PREDICTION: ${raw.claim}\nHORIZON: ${raw.horizon}\nRESOLUTION CRITERIA: ${raw.resolutionCriteria || 'n/a'}\nFALSIFIER: ${raw.whatWouldFalsify || 'n/a'}` },
        ],
        task: 'fact_check',
        temperature: 0.1,
        maxTokens: 300,
        jsonMode: true,
      });
      costUsd += res.costUsd ?? 0;
      const parsed = parseJson<{ outcome?: string; notes?: string }>(res.content);
      const outcome = String(parsed?.outcome || 'UNCLEAR').toUpperCase();
      const prob = raw.probability ?? 0.5;
      const actual = outcome === 'CONFIRMED' ? 1 : outcome === 'REFUTED' ? 0 : 0.5;
      const brier = Math.pow(prob - actual, 2);
      const status = outcome === 'CONFIRMED' ? 'CONFIRMED' : outcome === 'REFUTED' ? 'REFUTED' : 'EXPIRED';
      await prisma.prediction.update({
        where: { id: raw.id },
        data: {
          status,
          resolvedAt: new Date(),
          outcome: outcome === 'UNCLEAR' ? 'unclear' : outcome === 'CONFIRMED' ? 'occurred' : 'not_occurred',
          resolutionNotes: `${parsed?.notes || outcome} [Brier: ${brier.toFixed(3)}]`,
        },
      });
      if (status === 'EXPIRED') expired++; else resolved++;
    } catch {
      expired++; // unresolvable → expire honestly rather than retry forever
      await prisma.prediction.update({
        where: { id: raw.id },
        data: { status: 'EXPIRED', resolvedAt: new Date(), outcome: 'unclear', resolutionNotes: 'Resolver error — expired without verdict' },
      }).catch(() => {});
    }
  }
  console.log(`[PredictionTracker] Resolved ${resolved} confirmed/refuted, ${expired} expired (${due.length} due, $${costUsd.toFixed(4)})`);
  return { resolved, expired, costUsd };
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
        // Schema contract: OPEN|CONFIRMED|REFUTED|EXPIRED|SUPERSEDED —
        // 'RESOLVED' was outside it and broke status-based queries.
        status: outcome === 'occurred' ? 'CONFIRMED' : outcome === 'not_occurred' ? 'REFUTED' : 'EXPIRED',
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
      // OT-7: real breakdowns — domain from registration, kind (strategic vs
      // sentinel) as the type axis, and horizon bucketed by dueAt distance so
      // "90d" and "2027-Q1" land in comparable bins.
      const domain = (p as any).domain || 'general';
      const dueAt = (p as any).dueAt ? new Date((p as any).dueAt) : null;
      const createdAt = (p as any).createdAt ? new Date((p as any).createdAt) : null;
      // Designed horizon = dueAt − createdAt (resolutions happen near dueAt,
      // so "days until due from now" would collapse every bucket).
      const horizonDays = dueAt && createdAt
        ? Math.round((dueAt.getTime() - createdAt.getTime()) / 86400000)
        : null;
      const horizon = horizonDays == null
        ? (p.horizon || 'unknown')
        : horizonDays <= 45 ? '<=45d' : horizonDays <= 120 ? '<=120d' : horizonDays <= 400 ? '<=400d' : '>400d';
      const type = (p as any).kind || 'strategic';

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

// ─── OT-7: calibration feedback into forecasting ────────────────────────────

/**
 * Derive a probability-shrink factor from the resolved track record.
 *
 * Systematic overconfidence shows up as average Brier > ~0.25 (worse than
 * coin-flip). When enough predictions have resolved, shrink every forecast
 * probability toward 0.5 — the standard recalibration move — bounded so a
 * thin or noisy record can never dominate the swarm's evidence.
 *
 * factor = 1 → no adjustment. factor < 1 → shrink toward 0.5.
 * Requires ≥ 20 resolved predictions before trusting the signal.
 */
export async function getCalibrationShrink(): Promise<{
  factor: number;
  resolved: number;
  avgBrier: number | null;
}> {
  try {
    const report = await generateCalibrationReport();
    if (report.evaluatedPredictions < 20 || report.averageBrierScore == null) {
      return { factor: 1, resolved: report.evaluatedPredictions, avgBrier: report.averageBrierScore };
    }
    // Brier 0.20 ≈ acceptable; each 0.05 of excess costs 10% shrink, floor 0.70.
    const excess = Math.max(0, report.averageBrierScore - 0.20);
    const factor = Math.max(0.70, 1 - excess * 2);
    return { factor, resolved: report.evaluatedPredictions, avgBrier: report.averageBrierScore };
  } catch (err) {
    console.warn('[PredictionTracker] Calibration shrink unavailable:', err instanceof Error ? err.message : String(err));
    return { factor: 1, resolved: 0, avgBrier: null };
  }
}
