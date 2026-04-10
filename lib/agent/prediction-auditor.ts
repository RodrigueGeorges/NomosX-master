/**
 * NomosX PREDICTION AUDITOR — Retrospective Accuracy Tracking
 *
 * P2-G: Each PhD researcher makes predictions with probability + timeframe.
 * This agent checks whether past predictions have been validated or falsified
 * by new evidence arriving in subsequent pipeline runs.
 *
 * Flow:
 * 1. Load all stored predictions from AgentAuditLog (type: "prediction")
 * 2. For each prediction past its timeframe, search new sources for evidence
 * 3. Use LLM to assess: confirmed / falsified / inconclusive
 * 4. Update researcher identity with accuracy score
 * 5. Feed accuracy back into AgentMemory calibration
 *
 * This closes the epistemic loop: researchers are held accountable.
 */

import { prisma } from '../db';
import { callLLM } from '../llm/unified-llm';

// ============================================================================
// TYPES
// ============================================================================

export interface PredictionAuditResult {
  predictionId: string;
  researcherId: string;
  claim: string;
  originalProbability: number;
  timeframe: string;
  verdict: "confirmed" | "falsified" | "inconclusive" | "too_early";
  confidence: number; // 0-100 how confident we are in the verdict
  evidence: string;   // What new evidence supports the verdict
  accuracyScore: number; // 0-100 (100 = perfectly calibrated)
  costUsd: number;
}

export interface PredictionAuditOutput {
  audited: number;
  confirmed: number;
  falsified: number;
  inconclusive: number;
  tooEarly: number;
  avgAccuracyScore: number;
  results: PredictionAuditResult[];
  costUsd: number;
}

// ============================================================================
// MAIN AUDITOR
// ============================================================================

export async function runPredictionAuditor(
  options: {
    researcherId?: string;
    lookbackDays?: number;
    minProbability?: number;
  } = {}
): Promise<PredictionAuditOutput> {
  const { lookbackDays = 365, minProbability = 0.5 } = options;
  const start = Date.now();
  let totalCost = 0;

  console.log(`[PREDICTION AUDITOR] Starting retrospective accuracy check...`);

  // Load stored predictions from AgentAuditLog
  const whereClause: any = {
    agent: { startsWith: "phd:" },
    timestamp: { gte: new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000) },
  };
  if (options.researcherId) {
    whereClause.agent = `phd:${options.researcherId}`;
  }

  const logs = await prisma.agentAuditLog.findMany({
    where: whereClause,
    select: { id: true, agent: true, resource: true, metadata: true, timestamp: true },
    orderBy: { timestamp: "asc" },
    take: 200,
  });

  // Extract predictions from metadata
  const predictions: Array<{
    logId: string;
    researcherId: string;
    question: string;
    claim: string;
    probability: number;
    timeframe: string;
    falsifiableBy: string;
    createdAt: Date;
  }> = [];

  for (const log of logs) {
    const meta = log.metadata as any;
    const preds = meta?.predictions || [];
    for (const pred of preds) {
      if ((pred.probability || 0) >= minProbability) {
        predictions.push({
          logId: log.id,
          researcherId: log.agent.replace("phd:", ""),
          question: log.resource || "",
          claim: pred.claim || pred.prediction || "",
          probability: pred.probability || 0.5,
          timeframe: pred.timeframe || "1-2 years",
          falsifiableBy: pred.falsifiable_by || pred.falsifiableBy || "",
          createdAt: log.timestamp,
        });
      }
    }
  }

  console.log(`[PREDICTION AUDITOR] Found ${predictions.length} predictions to audit`);

  if (predictions.length === 0) {
    return {
      audited: 0, confirmed: 0, falsified: 0, inconclusive: 0, tooEarly: 0,
      avgAccuracyScore: 0, results: [], costUsd: 0,
    };
  }

  // For each prediction, find recent sources that might validate/falsify it
  const results: PredictionAuditResult[] = [];

  for (const pred of predictions.slice(0, 30)) { // Cap at 30 to control cost
    const result = await auditSinglePrediction(pred);
    totalCost += result.costUsd;
    results.push(result);

    // Update researcher identity with accuracy feedback (non-blocking)
    if (result.verdict !== "too_early" && result.verdict !== "inconclusive") {
      updateResearcherAccuracy(pred.researcherId, result).catch(err =>
        console.warn(`[PREDICTION AUDITOR] Accuracy update failed:`, err)
      );
    }
  }

  const confirmed = results.filter(r => r.verdict === "confirmed").length;
  const falsified = results.filter(r => r.verdict === "falsified").length;
  const inconclusive = results.filter(r => r.verdict === "inconclusive").length;
  const tooEarly = results.filter(r => r.verdict === "too_early").length;
  const scored = results.filter(r => r.verdict !== "too_early");
  const avgAccuracyScore = scored.length > 0
    ? Math.round(scored.reduce((s, r) => s + r.accuracyScore, 0) / scored.length)
    : 0;

  console.log(`[PREDICTION AUDITOR] ✅ Audited ${results.length}: ${confirmed} confirmed, ${falsified} falsified, ${inconclusive} inconclusive, avg accuracy: ${avgAccuracyScore}/100`);

  return {
    audited: results.length,
    confirmed,
    falsified,
    inconclusive,
    tooEarly,
    avgAccuracyScore,
    results,
    costUsd: totalCost,
  };
}

// ============================================================================
// SINGLE PREDICTION AUDIT
// ============================================================================

async function auditSinglePrediction(pred: {
  logId: string;
  researcherId: string;
  question: string;
  claim: string;
  probability: number;
  timeframe: string;
  falsifiableBy: string;
  createdAt: Date;
}): Promise<PredictionAuditResult> {
  // Check if timeframe has elapsed
  const monthsElapsed = (Date.now() - pred.createdAt.getTime()) / (1000 * 60 * 60 * 24 * 30);
  const timeframeMonths = parseTimeframeToMonths(pred.timeframe);

  if (monthsElapsed < timeframeMonths * 0.5) {
    return {
      predictionId: pred.logId,
      researcherId: pred.researcherId,
      claim: pred.claim,
      originalProbability: pred.probability,
      timeframe: pred.timeframe,
      verdict: "too_early",
      confidence: 100,
      evidence: `Only ${Math.round(monthsElapsed)} months elapsed, timeframe is ${pred.timeframe}`,
      accuracyScore: 50,
      costUsd: 0,
    };
  }

  // Find recent sources that might address this prediction
  const recentSources = await prisma.source.findMany({
    where: {
      createdAt: { gte: pred.createdAt },
      abstract: { not: null },
    },
    select: { id: true, title: true, abstract: true, year: true, provider: true },
    orderBy: { qualityScore: "desc" },
    take: 10,
  });

  if (recentSources.length === 0) {
    return {
      predictionId: pred.logId,
      researcherId: pred.researcherId,
      claim: pred.claim,
      originalProbability: pred.probability,
      timeframe: pred.timeframe,
      verdict: "inconclusive",
      confidence: 30,
      evidence: "No new sources found to evaluate this prediction",
      accuracyScore: 50,
      costUsd: 0,
    };
  }

  const sourceContext = recentSources.map((s, i) =>
    `[SRC-${i + 1}] ${s.title} (${s.year || "N/A"}, ${s.provider})\n${(s.abstract || "").slice(0, 400)}`
  ).join("\n\n");

  try {
    const response = await callLLM({
      messages: [{
        role: "user",
        content: `You are evaluating whether a research prediction has been confirmed or falsified by new evidence.

ORIGINAL PREDICTION (made ${Math.round(monthsElapsed)} months ago):
"${pred.claim}"
Original probability: ${Math.round(pred.probability * 100)}%
Timeframe: ${pred.timeframe}
Would be falsified by: ${pred.falsifiableBy || "N/A"}

NEW EVIDENCE (sources published after the prediction):
${sourceContext}

Assess whether the new evidence confirms, falsifies, or is inconclusive about this prediction.

Return JSON:
{
  "verdict": "confirmed" | "falsified" | "inconclusive",
  "confidence": 0-100,
  "evidence": "specific evidence from the sources supporting your verdict",
  "accuracyScore": 0-100 (100 = prediction was perfectly calibrated given the probability stated)
}

Accuracy scoring:
- If confirmed AND probability was high (>70%): 90-100
- If confirmed AND probability was low (<50%): 60-75 (lucky)
- If falsified AND probability was low (<30%): 85-95 (well-calibrated)
- If falsified AND probability was high (>70%): 10-30 (overconfident)
- Inconclusive: 50`,
      }],
      temperature: 0.1,
      jsonMode: true,
      maxTokens: 800,
      enableCache: true,
    });

    const parsed = JSON.parse(response.content);
    return {
      predictionId: pred.logId,
      researcherId: pred.researcherId,
      claim: pred.claim,
      originalProbability: pred.probability,
      timeframe: pred.timeframe,
      verdict: parsed.verdict || "inconclusive",
      confidence: parsed.confidence || 50,
      evidence: parsed.evidence || "",
      accuracyScore: parsed.accuracyScore || 50,
      costUsd: response.costUsd,
    };
  } catch {
    return {
      predictionId: pred.logId,
      researcherId: pred.researcherId,
      claim: pred.claim,
      originalProbability: pred.probability,
      timeframe: pred.timeframe,
      verdict: "inconclusive",
      confidence: 0,
      evidence: "LLM evaluation failed",
      accuracyScore: 50,
      costUsd: 0,
    };
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function parseTimeframeToMonths(timeframe: string): number {
  const t = timeframe.toLowerCase();
  if (t.includes("year")) {
    const match = t.match(/(\d+)/);
    return match ? parseInt(match[1]) * 12 : 24;
  }
  if (t.includes("month")) {
    const match = t.match(/(\d+)/);
    return match ? parseInt(match[1]) : 6;
  }
  return 18; // default: 18 months
}

async function updateResearcherAccuracy(
  researcherId: string,
  result: PredictionAuditResult
): Promise<void> {
  try {
    await prisma.agentAuditLog.create({
      data: {
        agent: `phd:${researcherId}`,
        action: "PREDICTION_AUDIT",
        resource: result.claim.slice(0, 200),
        metadata: JSON.stringify({
          type: "prediction_audit",
          verdict: result.verdict,
          confidence: result.confidence,
          evidence: result.evidence,
          originalProbability: result.originalProbability,
          accuracyScore: result.accuracyScore,
        }),
      },
    });
  } catch (err) {
    console.warn(`[PREDICTION AUDITOR] Failed to store accuracy update:`, err);
  }
}
