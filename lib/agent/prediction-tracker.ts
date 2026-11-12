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
      if (dueAt === null || dueAt.getTime() > now) return false;
      // Recently checked without a verdict: wait before retrying so a few
      // unresolvable predictions cannot monopolize every sweep.
      const pending = typeof c.resolutionNotes === 'string' && c.resolutionNotes.startsWith('Pending:');
      return !(pending && c.updatedAt && now - new Date(c.updatedAt).getTime() < 3 * 86_400_000);
    })
      // Swarm-priced predictions first: they are the ones calibration learns from.
      .sort((x, y) => Number(y.probabilitySource === 'swarm') - Number(x.probabilitySource === 'swarm'))
      .slice(0, limit);
    return due as unknown as Prediction[];
  } catch (error) {
    console.warn('[PredictionTracker] Failed to find due predictions:', error instanceof Error ? error.message : String(error));
    return [];
  }
}

/** Days past due during which an unresolvable prediction stays OPEN and is
 *  retried, before it expires without a verdict. */
export const RESOLUTION_GRACE_DAYS = 30;

export interface ResolutionEvidence {
  title: string;
  snippet: string;
  url: string;
  publishedDate?: string | null;
}

export type ResolutionDecision =
  | { action: 'resolve'; outcome: 'occurred' | 'not_occurred'; status: 'CONFIRMED' | 'REFUTED'; notes: string; evidenceUrl: string }
  | { action: 'retry'; reason: string }
  | { action: 'expire'; reason: string };

/**
 * Turn the judge's answer into a decision. A verdict counts only when it
 * points at a retrieved evidence item: the judge model's own knowledge stops
 * before the prediction was made, so an uncited verdict is a guess.
 */
export function decideResolution(
  parsed: { outcome?: string; evidenceIndex?: number; notes?: string } | null | undefined,
  evidence: ResolutionEvidence[],
  daysPastDue: number,
): ResolutionDecision {
  const giveUp = (reason: string): ResolutionDecision =>
    daysPastDue >= RESOLUTION_GRACE_DAYS ? { action: 'expire', reason } : { action: 'retry', reason };
  if (evidence.length === 0) return giveUp('no evidence retrieved');
  const outcome = String(parsed?.outcome ?? '').toUpperCase();
  if (outcome !== 'CONFIRMED' && outcome !== 'REFUTED') return giveUp('evidence inconclusive');
  const idx = Number(parsed?.evidenceIndex);
  if (!Number.isInteger(idx) || idx < 1 || idx > evidence.length) return giveUp('verdict cites no retrieved evidence');
  return {
    action: 'resolve',
    outcome: outcome === 'CONFIRMED' ? 'occurred' : 'not_occurred',
    status: outcome === 'CONFIRMED' ? 'CONFIRMED' : 'REFUTED',
    notes: String(parsed?.notes ?? outcome).slice(0, 600),
    evidenceUrl: evidence[idx - 1].url,
  };
}

/** Fresh web/news evidence for a claim. Never throws; empty when no search
 *  provider is configured or reachable. */
async function retrieveResolutionEvidence(claim: string): Promise<ResolutionEvidence[]> {
  const query = claim.replace(/^\[[^\]]+\]\s*/, '').replace(/^Central scenario:\s*/i, '').slice(0, 300);
  const toEvidence = (rows: any[]): ResolutionEvidence[] => rows
    .filter(r => r?.url && (r.abstract || r.title))
    .map(r => ({
      title: String(r.title ?? '').slice(0, 200),
      snippet: String(r.abstract ?? '').slice(0, 600),
      url: String(r.url),
      publishedDate: r.publishedDate ?? null,
    }));
  const out: ResolutionEvidence[] = [];
  try {
    const { searchTavily } = await import('../providers/tavily-provider');
    out.push(...toEvidence(await searchTavily(query, 6, { topic: 'news', time_range: 'year' })));
  } catch { /* fall through to the next provider */ }
  if (out.length < 3) {
    try {
      const { searchSearxng } = await import('../providers/searxng');
      out.push(...toEvidence(await searchSearxng(query, 6)));
    } catch { /* no evidence — caller retries later */ }
  }
  const seen = new Set<string>();
  return out.filter(e => !seen.has(e.url) && seen.add(e.url)).slice(0, 8);
}

/**
 * Auto-resolve due predictions against retrieved evidence.
 *
 * The judge sees fresh search results and must cite one; with no evidence or
 * no cited verdict the prediction stays OPEN and is retried until
 * RESOLUTION_GRACE_DAYS past due, then expires without a verdict (never
 * scored). Backfilled "[90d milestone]" copies of long-horizon claims are
 * closed as SUPERSEDED: a claim about 2030 cannot be checked at +90 days.
 * Bounded: `limit` predictions per call, never throws.
 */
export async function resolveDuePredictions(limit = 10): Promise<{ resolved: number; expired: number; retried: number; costUsd: number }> {
  const due = await findPredictionsDueForEvaluation(limit);
  if (due.length === 0) return { resolved: 0, expired: 0, retried: 0, costUsd: 0 };

  let resolved = 0, expired = 0, retried = 0, costUsd = 0;
  const { callLLM } = await import('../llm/unified-llm');
  const { parseJson } = await import('./json-utils');

  for (const p of due) {
    const raw = p as any;
    try {
      if (String(raw.claim ?? '').startsWith('[90d milestone]')) {
        await prisma.prediction.update({
          where: { id: raw.id },
          data: { status: 'SUPERSEDED', resolvedAt: new Date(), resolutionNotes: 'Milestone copy of a long-horizon claim — not checkable at this date; the parent prediction remains open.' },
        });
        expired++;
        continue;
      }
      const dueAt: Date | null = raw.dueAt ? new Date(raw.dueAt) : parseHorizonDue(raw.horizon, raw.createdAt);
      const daysPastDue = dueAt ? Math.floor((Date.now() - dueAt.getTime()) / 86_400_000) : RESOLUTION_GRACE_DAYS;
      const evidence = await retrieveResolutionEvidence(String(raw.claim ?? ''));

      let parsed: { outcome?: string; evidenceIndex?: number; notes?: string } | null = null;
      if (evidence.length > 0) {
        const res = await callLLM({
          messages: [
            { role: 'system', content: 'You resolve a forecast using ONLY the numbered evidence items provided. Your own knowledge is out of date: do not use it. Output valid JSON only: {"outcome":"CONFIRMED"|"REFUTED"|"UNCLEAR","evidenceIndex":<number of the single item that settles it>,"notes":"one sentence quoting that item"}. CONFIRMED = an item shows the claimed development occurred as stated by the deadline. REFUTED = an item shows it did not, or the deadline passed with the item showing the opposite state. UNCLEAR = no item settles it.' },
            { role: 'user', content: `PREDICTION: ${raw.claim}\nDEADLINE: ${dueAt ? dueAt.toISOString().slice(0, 10) : raw.horizon}\nRESOLUTION CRITERIA: ${raw.resolutionCriteria || 'n/a'}\nTODAY: ${new Date().toISOString().slice(0, 10)}\n\nEVIDENCE:\n${evidence.map((e, i) => `[${i + 1}] ${e.publishedDate ? `(${String(e.publishedDate).slice(0, 10)}) ` : ''}${e.title} — ${e.snippet} <${e.url}>`).join('\n')}` },
          ],
          task: 'fact_check',
          temperature: 0,
          maxTokens: 300,
          jsonMode: true,
        });
        costUsd += res.costUsd ?? 0;
        parsed = parseJson<{ outcome?: string; evidenceIndex?: number; notes?: string }>(res.content);
      }

      const decision = decideResolution(parsed, evidence, daysPastDue);
      if (decision.action === 'retry') {
        await prisma.prediction.update({
          where: { id: raw.id },
          data: { resolutionNotes: `Pending: ${decision.reason} (checked ${new Date().toISOString().slice(0, 10)})` },
        });
        retried++;
        continue;
      }
      if (decision.action === 'expire') {
        await prisma.prediction.update({
          where: { id: raw.id },
          data: { status: 'EXPIRED', resolvedAt: new Date(), outcome: 'unclear', resolutionNotes: `Expired without verdict: ${decision.reason}` },
        });
        expired++;
        continue;
      }
      const brier = Math.pow((raw.probability ?? 0.5) - (decision.outcome === 'occurred' ? 1 : 0), 2);
      await prisma.prediction.update({
        where: { id: raw.id },
        data: {
          status: decision.status,
          resolvedAt: new Date(),
          outcome: decision.outcome,
          resolutionSource: decision.evidenceUrl,
          resolutionNotes: `${decision.notes} [Brier: ${brier.toFixed(3)}]`,
        },
      });
      resolved++;
    } catch {
      retried++; // transient failure — leave OPEN, the next cycle retries
    }
  }
  console.log(`[PredictionTracker] Resolved ${resolved}, expired ${expired}, left open ${retried} (${due.length} due, $${costUsd.toFixed(4)})`);
  return { resolved, expired, retried, costUsd };
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
        // Only real verdicts are scored; expired/unclear predictions carry
        // no information about calibration.
        outcome: { in: ['occurred', 'not_occurred'] },
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
 * Pick the shrink-toward-0.5 factor that minimizes the Brier score on
 * resolved forecasts. Returns 1 when shrinking does not help: a high Brier
 * alone does not prove overconfidence (the forecasts may be too timid).
 */
export function bestShrinkFactor(pairs: Array<{ p: number; outcome: 0 | 1 }>): { factor: number; brier: number | null } {
  if (pairs.length === 0) return { factor: 1, brier: null };
  const brierAt = (f: number) =>
    pairs.reduce((acc, { p, outcome }) => acc + (0.5 + (p - 0.5) * f - outcome) ** 2, 0) / pairs.length;
  const base = brierAt(1);
  let best = 1, bestBrier = base;
  for (const f of [0.9, 0.8, 0.7]) {
    const b = brierAt(f);
    // Require a real gain (1% relative) before moving off the identity.
    if (b < bestBrier && b < base * 0.99) { best = f; bestBrier = b; }
  }
  return { factor: best, brier: base };
}

/**
 * OT-7 calibration feedback. Learns ONLY from resolved predictions whose
 * probability came from the swarm (probabilitySource='swarm'): predictions
 * priced by the conviction lookup table, and the backfilled "[90d milestone]"
 * copies of long-horizon claims, say nothing about the swarm's calibration.
 */
export async function getCalibrationShrink(): Promise<{
  factor: number;
  resolved: number;
  avgBrier: number | null;
}> {
  try {
    const rows = await prisma.prediction.findMany({
      where: {
        probabilitySource: 'swarm',
        resolvedAt: { not: null },
        outcome: { in: ['occurred', 'not_occurred'] },
        probability: { not: null },
      },
      select: { probability: true, outcome: true },
      orderBy: { resolvedAt: 'desc' },
      take: 500,
    });
    const pairs = rows.map((r: { probability: number | null; outcome: string | null }) => ({
      p: r.probability as number,
      outcome: (r.outcome === 'occurred' ? 1 : 0) as 0 | 1,
    }));
    if (pairs.length < 20) return { factor: 1, resolved: pairs.length, avgBrier: null };
    const { factor, brier } = bestShrinkFactor(pairs);
    return { factor, resolved: pairs.length, avgBrier: brier };
  } catch (err) {
    console.warn('[PredictionTracker] Calibration shrink unavailable:', err instanceof Error ? err.message : String(err));
    return { factor: 1, resolved: 0, avgBrier: null };
  }
}
