/**
 * NomosX PREDICTION REGISTRATION — T10
 *
 * Extracts testable predictions from the analysis output and registers them
 * in the Prediction table for retrospective auditing.
 *
 * A prediction is a claim about the future with:
 * - A horizon (when it will be testable)
 * - Resolution criteria (what observable fact would confirm/refute)
 * - A confidence tier (from pruning gates trust propagation)
 * - Source references (which [SRC-N] support it)
 *
 * Predictions are extracted from:
 * - future_extrapolation links in the causal chain
 * - trajectory.state from the ProspectiveNote
 * - whatToWatch.signals (if they contain testable claims)
 * - rejectedAlternatives (as "what would falsify" anchors)
 */

import { prisma } from '../db';
import type { AnalysisOutput, CausalLink } from './analyst-multipass';
import type { ConfidenceTier, PruningResult } from './pruning-gates';

interface ExtractedPrediction {
  claim: string;
  horizon: string;
  probability: number | null;
  confidence: ConfidenceTier;
  resolutionCriteria: string;
  whatWouldFalsify: string;
  sourceRefs: number[];
}

/**
 * Extract testable predictions from the analysis output.
 * Deterministic — no LLM. Pure structural extraction.
 */
export function extractPredictions(
  analysis: AnalysisOutput,
  pruningResult?: PruningResult
): ExtractedPrediction[] {
  const predictions: ExtractedPrediction[] = [];
  const tiers = pruningResult?.confidenceTiers ?? new Map<number, ConfidenceTier>();

  // 1. Extract from future_extrapolation links in causal chain
  const chain = analysis.causalChain || [];
  for (const link of chain) {
    if (link.temporalStatus !== 'future_extrapolation') continue;

    const tier = tiers.get(link.id) ?? 'SPECULATIVE';
    const sourceRefs = extractSourceRefs(link);

    predictions.push({
      claim: link.claim,
      horizon: analysis.trajectory?.horizon || '1-2 years',
      probability: null,
      confidence: tier,
      resolutionCriteria: buildResolutionCriteria(link, analysis),
      whatWouldFalsify: analysis.whatToWatch?.whatWouldChangeMind || 'Not specified',
      sourceRefs,
    });
  }

  // 2. Extract from trajectory state if it contains a testable claim
  if (analysis.trajectory?.state && analysis.trajectory.horizon) {
    const trajectoryClaim = analysis.trajectory.state;
    const isDuplicate = predictions.some(p =>
      p.claim.slice(0, 80) === trajectoryClaim.slice(0, 80)
    );
    if (!isDuplicate && trajectoryClaim.length > 20) {
      predictions.push({
        claim: trajectoryClaim,
        horizon: analysis.trajectory.horizon,
        probability: null,
        confidence: 'EMERGING',
        resolutionCriteria: `By ${analysis.trajectory.horizon}: ${trajectoryClaim.slice(0, 200)}`,
        whatWouldFalsify: analysis.whatToWatch?.whatWouldChangeMind || 'Not specified',
        sourceRefs: [],
      });
    }
  }

  // 3. Extract from whatToWatch signals if they contain testable claims
  const signals = analysis.whatToWatch?.signals || [];
  for (const signal of signals) {
    const hasDateOrThreshold = /\b(20\d{2}|Q[1-4]|%|\$|billion|million)\b/i.test(signal);
    if (!hasDateOrThreshold) continue;

    predictions.push({
      claim: signal,
      horizon: analysis.trajectory?.horizon || '1-2 years',
      probability: null,
      confidence: 'SUPPORTED',
      resolutionCriteria: `Observable signal: ${signal.slice(0, 200)}`,
      whatWouldFalsify: `Signal does not materialize by ${analysis.trajectory?.horizon || 'horizon'}`,
      sourceRefs: [],
    });
  }

  return predictions;
}

function extractSourceRefs(link: CausalLink): number[] {
  const refs: number[] = [];
  if (typeof link.sourceRef === 'number' && link.sourceRef > 0) {
    refs.push(link.sourceRef);
  }
  const text = `${link.evidence || ''} ${link.claim || ''}`;
  const matches = text.matchAll(/\[SRC-(\d+)\]/g);
  for (const match of matches) {
    const n = parseInt(match[1], 10);
    if (n > 0 && !refs.includes(n)) refs.push(n);
  }
  return refs;
}

function buildResolutionCriteria(link: CausalLink, analysis: AnalysisOutput): string {
  const horizon = analysis.trajectory?.horizon || '1-2 years';
  return `By ${horizon}: ${link.claim.slice(0, 300)}`;
}

/**
 * Register predictions in the database.
 * Non-blocking — failures are logged but don't stop the pipeline.
 */
export async function registerPredictions(
  briefId: string,
  analysis: AnalysisOutput,
  pruningResult?: PruningResult
): Promise<{ registered: number; errors: string[] }> {
  const errors: string[] = [];
  let registered = 0;

  try {
    const predictions = extractPredictions(analysis, pruningResult);

    if (predictions.length === 0) {
      console.log('[PREDICTIONS] No testable predictions extracted from analysis');
      return { registered: 0, errors: [] };
    }

    for (const pred of predictions) {
      try {
        await prisma.prediction.create({
          data: {
            briefId,
            claim: pred.claim.slice(0, 5000),
            horizon: pred.horizon,
            probability: pred.probability,
            confidence: pred.confidence,
            resolutionCriteria: pred.resolutionCriteria.slice(0, 5000),
            whatWouldFalsify: pred.whatWouldFalsify.slice(0, 5000),
            sourceRefs: pred.sourceRefs,
            status: 'OPEN',
          },
        });
        registered++;
      } catch (err: any) {
        errors.push(`Failed to register prediction: ${err.message}`);
      }
    }

    console.log(`[PREDICTIONS] Registered ${registered}/${predictions.length} predictions for brief ${briefId}`);

    // Also log to AgentAuditLog for backward compatibility with prediction-auditor.ts
    await prisma.agentAuditLog.create({
      data: {
        agent: 'ANALYST',
        action: 'PREDICTION_REGISTER',
        resource: analysis.title?.slice(0, 200) || 'unnamed',
        metadata: JSON.stringify({
          briefId,
          count: registered,
          predictions: predictions.map(p => ({
            claim: p.claim.slice(0, 200),
            probability: p.probability,
            timeframe: p.horizon,
            confidence: p.confidence,
          })),
        }) as any,
      },
    }).catch(() => {});
  } catch (err: any) {
    errors.push(`Prediction registration failed: ${err.message}`);
    console.warn('[PREDICTIONS] Registration failed:', err.message);
  }

  return { registered, errors };
}
