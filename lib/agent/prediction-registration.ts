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
import type { CentralScenarioDecision } from './editorial-types';
import { evidenceLikelihoodUpdate } from './leap-aggregation';

interface ExtractedPrediction {
  claim: string;
  horizon: string;
  probability: number | null;
  confidence: ConfidenceTier;
  resolutionCriteria: string;
  whatWouldFalsify: string;
  sourceRefs: number[];
  /** OT-1: 'sentinel' = short-horizon check that produces Brier signal in
   *  weeks; 'strategic' = the note's own horizon. dueAt is authoritative. */
  kind?: 'sentinel' | 'strategic';
  dueAt?: Date;
  linkId?: string;
}

/**
 * Derive a subjective probability (0-1) from the analysis conviction level
 * and the pruning-gate confidence tier. This is a deterministic mapping —
 * not LLM-generated — so predictions remain auditable.
 *
 * Calibration anchors (Brier-score friendly):
 *  - ESTABLISHED + firm    → 0.85 (strong evidence, high conviction)
 *  - ESTABLISHED + tempered→ 0.75
 *  - SUPPORTED  + firm    → 0.70
 *  - SUPPORTED  + tempered→ 0.60
 *  - EMERGING   + firm    → 0.60
 *  - EMERGING   + tempered→ 0.55
 *  - SPECULATIVE + any    → 0.45
 *  - causal_only reduces by 0.10 (mechanism plausible, outcome uncertain)
 */
function deriveProbability(
  conviction: "firm" | "tempered" | "causal_only" | undefined,
  tier: ConfidenceTier,
): number {
  let base: number;
  switch (tier) {
    case "ESTABLISHED": base = conviction === "firm" ? 0.85 : 0.75; break;
    case "SUPPORTED":   base = conviction === "firm" ? 0.70 : 0.60; break;
    case "EMERGING":    base = conviction === "firm" ? 0.60 : 0.55; break;
    case "SPECULATIVE":
    default:            base = 0.45; break;
  }
  if (conviction === "causal_only") base = Math.max(0.3, base - 0.10);
  // Clamp to [0.05, 0.95] — never claim certainty of 0 or 1.
  return Math.min(0.95, Math.max(0.05, Math.round(base * 100) / 100));
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
  const central = (analysis as AnalysisOutput & { centralScenario?: CentralScenarioDecision }).centralScenario;
  if (central?.selectedBy === 'editorial' && central.description.trim() && central.horizon.trim() && central.revisionTriggers.length) {
    predictions.push({
      claim: `${central.name}: ${central.description}`,
      horizon: central.horizon,
      probability: null,
      confidence: central.confidence === 'high' ? 'SUPPORTED' : central.confidence === 'medium' ? 'EMERGING' : 'SPECULATIVE',
      resolutionCriteria: `By ${central.horizon}: ${central.description}`,
      whatWouldFalsify: central.revisionTriggers.join('; '),
      sourceRefs: [...new Set([...central.rationale.matchAll(/\[SRC-(\d+)\]/g)].map(m => Number(m[1])).filter(n => n > 0))],
    });
  }
  const tiers = pruningResult?.confidenceTiers ?? new Map<number, ConfidenceTier>();
  const conviction = (analysis as any).convictionLevel as "firm" | "tempered" | "causal_only" | undefined;

  // 1. Extract from future_extrapolation links in causal chain
  const chain = analysis.causalChain || [];
  for (const link of chain) {
    if (link.temporalStatus !== 'future_extrapolation') continue;

    const tier = tiers.get(link.id) ?? 'SPECULATIVE';
    const sourceRefs = extractSourceRefs(link);

    predictions.push({
      claim: link.claim,
      horizon: analysis.trajectory?.horizon || '1-2 years',
      probability: deriveProbability(conviction, tier),
      confidence: tier,
      resolutionCriteria: buildResolutionCriteria(link, analysis),
      whatWouldFalsify: analysis.whatToWatch?.whatWouldChangeMind || 'Not specified',
      sourceRefs,
      linkId: String(link.id ?? ''),
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
        probability: deriveProbability(conviction, 'EMERGING'),
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
      probability: deriveProbability(conviction, 'SUPPORTED'),
      confidence: 'SUPPORTED',
      resolutionCriteria: `Observable signal: ${signal.slice(0, 200)}`,
      whatWouldFalsify: `Signal does not materialize by ${analysis.trajectory?.horizon || 'horizon'}`,
      sourceRefs: [],
    });
  }

  // 4. OT-1 SENTINELS — short-horizon (30/60/90d) predictions derived from the
  //    most sensitive near-term observables. Strategic horizons are pluriannual
  //    (first due 2028-07) → zero Brier signal for ~2 years. Sentinels close
  //    that gap: each note emits up to 3 checks on whatToWatch signals and
  //    revision triggers, due within a quarter.
  const SENTINEL_OFFSETS_DAYS = [30, 60, 90] as const;
  const sentinelSources = [
    ...signals.filter(s => /\b(20\d{2}|Q[1-4]|%|\$|billion|million)\b/i.test(s)),
    ...(central?.revisionTriggers ?? []).filter(t => /\b(20\d{2}|Q[1-4]|%|\$|billion|million|sanction|election|summit|deadline|launch|approval)\b/i.test(t)),
  ];
  const seenSentinel = new Set<string>();
  SENTINEL_OFFSETS_DAYS.forEach((days, i) => {
    const src = sentinelSources[i];
    if (!src) return;
    const key = src.slice(0, 120).toLowerCase();
    if (seenSentinel.has(key)) return;
    seenSentinel.add(key);
    const dueAt = new Date(Date.now() + days * 86_400_000);
    predictions.push({
      claim: `[${days}d sentinel] ${src}`,
      horizon: dueAt.toISOString().slice(0, 10),
      probability: deriveProbability(conviction, 'EMERGING'),
      confidence: 'EMERGING',
      resolutionCriteria: `By ${dueAt.toISOString().slice(0, 10)}: observable check — ${src.slice(0, 200)}`,
      whatWouldFalsify: `The named observable does not occur by the sentinel date`,
      sourceRefs: [],
      kind: 'sentinel',
      dueAt,
    });
  });

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
  pruningResult?: PruningResult,
  /** Source list in [SRC-N] order — enables LEAP evidence-likelihood updates. */
  sources?: { qualityScore?: number | null }[],
  /** OT-7: research domain — persisted for calibration-by-domain reports. */
  domain?: string,
): Promise<{ registered: number; errors: string[] }> {
  const errors: string[] = [];
  let registered = 0;

  try {
    const predictions = extractPredictions(analysis, pruningResult);

    // LEAP (arXiv 2609.01337): instead of trusting the monolithic tier-mapped
    // probability alone, fold the claim's cited sources into the prior via
    // per-evidence likelihood updates in log-odds space. Fully deterministic,
    // and each source's contribution stays auditable in the audit log below.
    const leapDetails: { claim: string; prior: number; posterior: number }[] = [];
    if (sources?.length) {
      for (const pred of predictions) {
        if (pred.probability == null || pred.sourceRefs.length === 0) continue;
        const support = pred.sourceRefs
          .map((ref) => ({ ref, qualityScore: sources[ref - 1]?.qualityScore }))
          .filter((s) => s.ref >= 1 && s.ref <= sources.length);
        if (support.length === 0) continue;
        const upd = evidenceLikelihoodUpdate(pred.probability, support);
        if (upd.posterior !== upd.prior) {
          leapDetails.push({ claim: pred.claim.slice(0, 120), prior: upd.prior, posterior: upd.posterior });
          pred.probability = upd.posterior;
        }
      }
    }

    if (predictions.length === 0) {
      console.log('[PREDICTIONS] No testable predictions extracted from analysis');
      return { registered: 0, errors: [] };
    }

    for (const pred of predictions) {
      try {
        const claimKey = pred.claim.slice(0, 5000);
        // Deduplicate: skip if an OPEN prediction with the same claim already
        // exists for this brief (e.g. pipeline re-run). Resolved predictions
        // are preserved — we never overwrite a track-record entry.
        const existing = await prisma.prediction.findFirst({
          where: { briefId, claim: claimKey, status: 'OPEN' },
          select: { id: true },
        });
        if (existing) {
          // Already registered — skip silently.
          continue;
        }
        await prisma.prediction.create({
          data: {
            briefId,
            claim: claimKey,
            horizon: pred.horizon,
            probability: pred.probability,
            confidence: pred.confidence,
            resolutionCriteria: pred.resolutionCriteria.slice(0, 5000),
            whatWouldFalsify: pred.whatWouldFalsify.slice(0, 5000),
            sourceRefs: pred.sourceRefs,
            status: 'OPEN',
            kind: pred.kind ?? 'strategic',
            dueAt: pred.dueAt ?? null,
            linkId: pred.linkId || null,
            domain: domain || null,
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
          leap: leapDetails.length ? leapDetails : undefined,
        }) as any,
      },
    }).catch(() => {});
  } catch (err: any) {
    errors.push(`Prediction registration failed: ${err.message}`);
    console.warn('[PREDICTIONS] Registration failed:', err.message);
  }

  return { registered, errors };
}
