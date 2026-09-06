/**
 * Self-Correct Module — Hybrid CHARM + Overseer
 *
 * Inspired by:
 * - CHARM (Cascading Hallucination in Agentic RAG) — cross-stage consistency tracking,
 *   cascade detection, confidence propagation monitoring, rollback
 * - Overseer — verifier-first architecture with auto-feedback injection on retry
 *
 * This module wraps existing pipeline stages with:
 * 1. Checkpoints — snapshot each stage's output + verifier results
 * 2. Cross-stage consistency — TF-IDF cosine drift between consecutive stages
 * 3. Cascade detection — aggregate verifier signals, detect cascading errors
 * 4. Auto-feedback injection — when a verifier fails, inject its reasons into retry prompt
 * 5. Rollback — restore last clean stage snapshot if cascade detected
 *
 * Retrofit-friendly: does NOT replace existing pipeline logic. It wraps it.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export type VerifierVerdict = 'pass' | 'fail' | 'retry' | 'escalate';

export interface VerifierResult {
  verifierId: string;
  verdict: VerifierVerdict;
  score: number; // 0-1
  reasons: string[]; // human-readable feedback for retry injection
}

export interface StageSnapshot {
  stage: string;
  timestamp: number;
  outputDigest: string;       // first 500 chars for debugging
  tfidfVector: Map<string, number>;
  verifierResults: VerifierResult[];
  confidenceScore: number;     // 0-1
  clean: boolean;              // all verifiers passed
  retryCount: number;
}

export interface CheckpointResult {
  verdict: VerifierVerdict;
  score: number;
  drift: number;               // cosine drift from previous stage (0=identical, 1=completely different)
  cascadeDetected: boolean;
  feedback: string[];          // aggregated reasons for retry injection
  shouldRetry: boolean;
  shouldRollback: boolean;
  rollbackTarget: string | null;
}

export interface CascadeResult {
  detected: boolean;
  severity: number;            // 0-1
  failedStages: string[];
  rollbackTarget: string | null;
  reasons: string[];
}

export interface SelfCorrectorConfig {
  driftThreshold: number;      // max cosine drift before flagging (CHARM default: 0.18)
  cascadeThreshold: number;    // aggregate score below which cascade is declared (CHARM default: 0.55)
  maxRetriesPerStage: number;  // max auto-retries before escalating (Overseer default: 3)
  confidenceInflationDelta: number; // max confidence jump between stages (CHARM CPM)
  enableRollback: boolean;
  enableAutoRetry: boolean;
  // ── DISC (arXiv 2606.21724) ──
  enableJudgmentGate: boolean;   // binary gate: only correct if a specific mistake is found
  discMinContradictionScore: number; // min evidence contradiction score to allow correction (default: 0.6)
  // ── EIR/ECR Stability (Feedback Control arXiv 2026) ──
  enableStabilityThreshold: boolean; // stop iterating if ECR/EIR < stability ratio
  stabilityRatio: number;       // min ECR/EIR ratio to continue iterating (default: 1.5)
  // ── Version Buffer + Rollback (CyberCorrect arXiv 2026) ──
  enableVersionBuffer: boolean; // keep previous versions, rollback if correction degrades
  maxVersionHistory: number;    // max versions per stage (default: 3)
}

export const DEFAULT_SELF_CORRECT_CONFIG: SelfCorrectorConfig = {
  driftThreshold: 0.18,
  cascadeThreshold: 0.55,
  maxRetriesPerStage: 3,
  confidenceInflationDelta: 0.25,
  enableRollback: true,
  enableAutoRetry: true,
  // DISC: binary judgment gate blocks degrading rewrites
  enableJudgmentGate: true,
  discMinContradictionScore: 0.6,
  // EIR/ECR: formal stability threshold for iteration
  enableStabilityThreshold: true,
  stabilityRatio: 1.5,
  // Version Buffer: rollback if correction degrades quality
  enableVersionBuffer: true,
  maxVersionHistory: 3,
};

// ─── DISC Judgment Gate (arXiv 2606.21724) ───────────────────────────────────

export interface JudgmentGateResult {
  hasSpecificMistake: boolean;     // true only if a specific contradiction/error is found
  contradictionScore: number;     // 0-1, confidence that a real mistake exists
  flaggedIssues: string[];        // specific issues with evidence
  rationale: string;              // why correction is (or isn't) warranted
}

/**
 * DISC judgment gate: determines whether a correction is warranted.
 * Key insight: only correct if a *specific* mistake is found, not just "score is low".
 * This prevents degrading already-correct answers (precision over recall).
 */
export function judgmentGate(
  verifierResults: VerifierResult[],
  drift: number,
  config: SelfCorrectorConfig,
): JudgmentGateResult {
  // Collect specific, evidence-backed failures (not just "low score")
  const specificFailures = verifierResults.filter(
    (r) => r.verdict === 'fail' && r.reasons.length > 0 && r.score < 0.5,
  );
  const retryIssues = verifierResults.filter(
    (r) => r.verdict === 'retry' && r.reasons.length > 0,
  );

  // A specific mistake requires: a verifier found a concrete issue WITH evidence
  const flaggedIssues: string[] = [];
  for (const f of specificFailures) {
    flaggedIssues.push(...f.reasons);
  }
  for (const r of retryIssues) {
    flaggedIssues.push(...r.reasons);
  }

  // Contradiction score: how confident are we that a real mistake exists?
  const failScores = specificFailures.map((f) => 1 - f.score);
  const avgFailScore = failScores.length > 0
    ? failScores.reduce((a, b) => a + b, 0) / failScores.length
    : 0;
  const driftSignal = drift > config.driftThreshold ? 0.3 : 0;
  const contradictionScore = Math.min(1, avgFailScore + driftSignal);

  const hasSpecificMistake = contradictionScore >= config.discMinContradictionScore && flaggedIssues.length > 0;

  return {
    hasSpecificMistake,
    contradictionScore,
    flaggedIssues,
    rationale: hasSpecificMistake
      ? `Specific mistake detected (contradiction=${contradictionScore.toFixed(2)}): ${flaggedIssues.slice(0, 3).join('; ')}`
      : `No specific mistake found (contradiction=${contradictionScore.toFixed(2)}). Correction would risk degrading correct content.`,
  };
}

// ─── EIR/ECR Stability (Feedback Control arXiv 2026) ─────────────────────────

export interface StabilityMetrics {
  errorIntroductionRate: number;  // EIR: fraction of iterations that introduced new errors
  errorCorrectionRate: number;   // ECR: fraction of iterations that corrected existing errors
  stabilityRatio: number;        // ECR/EIR — if < threshold, stop iterating
  shouldContinue: boolean;       // formal decision: iterate or stop
}

/**
 * Compute EIR/ECR stability metrics across self-correction iterations.
 * If ECR/EIR < stabilityRatio, further iteration is counterproductive.
 * Formula: iterate only if ECR/EIR > Acc/(1-Acc) where Acc is current accuracy.
 */
export function computeStability(
  iterationScores: number[],  // quality scores per iteration (0-100)
  config: SelfCorrectorConfig,
): StabilityMetrics {
  if (iterationScores.length < 2) {
    return { errorIntroductionRate: 0, errorCorrectionRate: 0, stabilityRatio: Infinity, shouldContinue: true };
  }

  let corrections = 0;  // iterations where score improved
  let introductions = 0; // iterations where score degraded

  for (let i = 1; i < iterationScores.length; i++) {
    const delta = iterationScores[i] - iterationScores[i - 1];
    if (delta > 2) corrections++;
    else if (delta < -2) introductions++;
  }

  const totalIterations = iterationScores.length - 1;
  const errorCorrectionRate = totalIterations > 0 ? corrections / totalIterations : 0;
  const errorIntroductionRate = totalIterations > 0 ? introductions / totalIterations : 0;
  const stabilityRatio = errorIntroductionRate === 0
    ? Infinity
    : errorCorrectionRate / errorIntroductionRate;

  // Formal decision: continue only if corrections outpace introductions
  const currentAcc = iterationScores[iterationScores.length - 1] / 100;
  const accThreshold = currentAcc / (1 - currentAcc + 0.01);
  const shouldContinue = config.enableStabilityThreshold
    ? stabilityRatio >= config.stabilityRatio && stabilityRatio >= accThreshold
    : true;

  return { errorIntroductionRate, errorCorrectionRate, stabilityRatio, shouldContinue };
}

// ─── Root-Cause Attribution (AgentDebugX arXiv 2026) ─────────────────────────

export interface RootCauseAttribution {
  rootStage: string;          // the stage where the cascade originated
  propagationPath: string[];  // stages the error propagated through
  rootCause: string;          // human-readable description
  confidence: number;         // 0-1
}

/**
 * Trace a cascade back to its root cause stage.
 * Uses the snapshot history to find the first stage that failed and propagated.
 */
export function attributeRootCause(snapshots: StageSnapshot[]): RootCauseAttribution | null {
  if (snapshots.length < 2) return null;

  // Find the first dirty (non-clean) stage that has dirty stages after it
  for (let i = 0; i < snapshots.length - 1; i++) {
    if (!snapshots[i].clean) {
      // Check if subsequent stages are also dirty (propagation)
      const propagationPath = [snapshots[i].stage];
      for (let j = i + 1; j < snapshots.length; j++) {
        if (!snapshots[j].clean) {
          propagationPath.push(snapshots[j].stage);
        } else {
          break; // propagation stopped
        }
      }

      if (propagationPath.length >= 2) {
        // This is the root cause — the first dirty stage with propagation
        const rootSnapshot = snapshots[i];
        const topReasons = rootSnapshot.verifierResults
          .filter((r) => r.verdict !== 'pass')
          .flatMap((r) => r.reasons)
          .slice(0, 3);

        return {
          rootStage: rootSnapshot.stage,
          propagationPath,
          rootCause: `Stage ${rootSnapshot.stage} failed (score=${rootSnapshot.confidenceScore.toFixed(2)}, retries=${rootSnapshot.retryCount}). ` +
            `Error propagated through ${propagationPath.length - 1} subsequent stages. ` +
            `Top reasons: ${topReasons.join('; ') || 'no specific reasons recorded'}`,
          confidence: Math.min(1, 0.5 + (propagationPath.length * 0.15)),
        };
      }
    }
  }

  return null;
}

// ─── TF-IDF Lightweight Embedding ────────────────────────────────────────────

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
  'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
  'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'can',
  'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'them',
  'their', 'his', 'her', 'its', 'our', 'your', 'my', 'me', 'him', 'us', 'as', 'if', 'so',
  'not', 'no', 'yes', 'than', 'then', 'also', 'such', 'very', 'more', 'most', 'some', 'any',
  'all', 'each', 'every', 'both', 'few', 'many', 'other', 'one', 'two', 'three', 'about',
  'into', 'through', 'during', 'before', 'after', 'above', 'below', 'up', 'down', 'out',
  'off', 'over', 'under', 'again', 'further', 'here', 'there', 'when', 'where', 'why',
  'how', 'what', 'which', 'who', 'whom', 'whose', 'while', 'between', 'within', 'without',
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/<[^>]*>/g, ' ')
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOP_WORDS.has(t));
}

function computeTfIdf(text: string, idfMap: Map<string, number>): Map<string, number> {
  const tokens = tokenize(text);
  const tf = new Map<string, number>();
  for (const token of tokens) {
    tf.set(token, (tf.get(token) ?? 0) + 1);
  }
  // Normalize TF by document length
  const docLen = tokens.length || 1;
  const tfidf = new Map<string, number>();
  for (const [term, freq] of tf) {
    const idf = idfMap.get(term) ?? Math.log(10); // fallback for unseen terms
    tfidf.set(term, (freq / docLen) * idf);
  }
  return tfidf;
}

function cosineSimilarity(a: Map<string, number>, b: Map<string, number>): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (const [term, valA] of a) {
    normA += valA * valA;
    const valB = b.get(term);
    if (valB !== undefined) dotProduct += valA * valB;
  }
  for (const [, valB] of b) {
    normB += valB * valB;
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

function cosineDrift(a: Map<string, number>, b: Map<string, number>): number {
  return 1 - cosineSimilarity(a, b);
}

// ─── Self-Corrector ──────────────────────────────────────────────────────────

export class SelfCorrector {
  private snapshots = new Map<string, StageSnapshot>();
  private stageOrder: string[] = [];
  private idfMap = new Map<string, number>();
  private documentCount = 0;
  private retryCounts = new Map<string, number>();
  private config: SelfCorrectorConfig;
  private cascadeHistory: CascadeResult[] = [];

  // ── Version Buffer (CyberCorrect): store previous outputs per stage ──
  private versionBuffer = new Map<string, Array<{ output: string; score: number; timestamp: number }>>();
  // ── EIR/ECR: track iteration scores per stage for stability analysis ──
  private iterationScores = new Map<string, number[]>();
  // ── Rewind Memory (AgentRewind): summaries of failed attempts ──
  private rewindMemories: Array<{ stage: string; summary: string; timestamp: number }> = [];

  constructor(config: Partial<SelfCorrectorConfig> = {}) {
    this.config = { ...DEFAULT_SELF_CORRECT_CONFIG, ...config };
  }

  /**
   * Update IDF map with a new document (stage output).
   * This builds the corpus statistics for TF-IDF computation.
   */
  private updateIdf(text: string): void {
    const tokens = new Set(tokenize(text));
    for (const token of tokens) {
      this.idfMap.set(token, (this.idfMap.get(token) ?? 0) + 1);
    }
    this.documentCount++;
    // Recompute IDF values
    for (const [term, docFreq] of this.idfMap) {
      this.idfMap.set(term, Math.log((this.documentCount + 1) / (docFreq + 1)) + 1);
    }
  }

  /**
   * Checkpoint — called after each pipeline stage.
   * Captures a snapshot, runs verifiers, computes drift, detects cascades.
   */
  async checkpoint(
    stage: string,
    output: string,
    verifiers: Array<{ id: string; check: (output: string) => Promise<VerifierResult> | VerifierResult }>,
    confidenceScore: number,
  ): Promise<CheckpointResult> {
    // Update IDF with this stage's output
    this.updateIdf(output);

    // Compute TF-IDF vector
    const tfidfVector = computeTfIdf(output, this.idfMap);

    // Run verifiers
    const verifierResults: VerifierResult[] = [];
    for (const v of verifiers) {
      try {
        const result = await v.check(output);
        verifierResults.push(result);
      } catch (err) {
        console.warn(`[SelfCorrect] Verifier ${v.id} threw:`, err);
        verifierResults.push({
          verifierId: v.id,
          verdict: 'fail',
          score: 0,
          reasons: [`Verifier ${v.id} threw an error: ${String(err).slice(0, 200)}`],
        });
      }
    }

    // Determine overall verdict
    const hasFail = verifierResults.some((r) => r.verdict === 'fail');
    const hasEscalate = verifierResults.some((r) => r.verdict === 'escalate');
    const scores = verifierResults.map((r) => r.score);
    const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 1;
    const overallVerdict: VerifierVerdict = hasEscalate
      ? 'escalate'
      : hasFail
        ? 'fail'
        : avgScore >= 0.75
          ? 'pass'
          : 'retry';

    // Compute drift from previous stage
    const prevStage = this.stageOrder[this.stageOrder.length - 1];
    const prevSnapshot = prevStage ? this.snapshots.get(prevStage) : null;
    const drift = prevSnapshot ? cosineDrift(prevSnapshot.tfidfVector, tfidfVector) : 0;

    // Check confidence inflation (CPM — Confidence Propagation Monitor)
    let confidenceInflated = false;
    if (prevSnapshot) {
      const delta = confidenceScore - prevSnapshot.confidenceScore;
      if (delta > this.config.confidenceInflationDelta) {
        confidenceInflated = true;
        console.warn(
          `[SelfCorrect] CONFIDENCE INFLATION: ${stage} confidence jumped ${delta.toFixed(2)} ` +
          `(from ${prevSnapshot.confidenceScore.toFixed(2)} to ${confidenceScore.toFixed(2)}) — ` +
          `possible cascade signal`,
        );
      }
    }

    // Create snapshot
    const retryCount = this.retryCounts.get(stage) ?? 0;
    const snapshot: StageSnapshot = {
      stage,
      timestamp: Date.now(),
      outputDigest: output.slice(0, 500),
      tfidfVector,
      verifierResults,
      confidenceScore,
      clean: overallVerdict === 'pass',
      retryCount,
    };
    this.snapshots.set(stage, snapshot);
    if (!this.stageOrder.includes(stage)) {
      this.stageOrder.push(stage);
    }

    // Cascade detection
    const cascade = this.detectCascade();
    this.cascadeHistory.push(cascade);

    // Aggregate feedback for retry injection (Overseer pattern)
    const feedback: string[] = [];
    for (const result of verifierResults) {
      if (result.verdict !== 'pass' && result.reasons.length > 0) {
        feedback.push(`[${result.verifierId}] ${result.reasons.join('; ')}`);
      }
    }
    if (drift > this.config.driftThreshold) {
      feedback.push(
        `[consistency] Output drifted ${(drift * 100).toFixed(0)}% from previous stage ` +
        `(threshold: ${(this.config.driftThreshold * 100).toFixed(0)}%) — ` +
        `check for contradictions or topic shifts.`,
      );
    }
    if (confidenceInflated) {
      feedback.push(
        `[confidence] Confidence inflated by more than ${(this.config.confidenceInflationDelta * 100).toFixed(0)}% ` +
        `without corresponding evidence improvement — verify claims are grounded.`,
      );
    }

    // ── DISC Judgment Gate (arXiv 2606.21724) ──
    // Binary gate: only allow retry if a *specific* mistake is found.
    // Prevents degrading already-correct answers (precision over recall).
    const gate = this.config.enableJudgmentGate
      ? judgmentGate(verifierResults, drift, this.config)
      : null;

    // ── Version Buffer (CyberCorrect) ──
    // Store the current output as a version for potential rollback.
    if (this.config.enableVersionBuffer) {
      const versions = this.versionBuffer.get(stage) ?? [];
      versions.push({ output: output.slice(0, 5000), score: avgScore, timestamp: Date.now() });
      // Keep only the last N versions
      if (versions.length > this.config.maxVersionHistory) {
        versions.shift();
      }
      this.versionBuffer.set(stage, versions);
    }

    // ── EIR/ECR: track iteration scores ──
    const iterScores = this.iterationScores.get(stage) ?? [];
    iterScores.push(avgScore);
    this.iterationScores.set(stage, iterScores);

    // ── EIR/ECR Stability Check ──
    const stability = computeStability(iterScores, this.config);

    // Determine actions
    // DISC gate: only retry if judgment gate says there's a specific mistake
    const gatePasses = !this.config.enableJudgmentGate || (gate?.hasSpecificMistake ?? true);
    // Stability: don't retry if EIR/ECR says further iteration is counterproductive
    const stabilityAllows = stability.shouldContinue;

    const shouldRetry =
      this.config.enableAutoRetry &&
      (overallVerdict === 'retry' || overallVerdict === 'fail') &&
      retryCount < this.config.maxRetriesPerStage &&
      !cascade.detected &&
      gatePasses &&
      stabilityAllows;

    const shouldRollback =
      this.config.enableRollback &&
      cascade.detected &&
      cascade.rollbackTarget !== null;

    if (shouldRetry) {
      this.retryCounts.set(stage, retryCount + 1);
    }

    // ── Rewind Memory (AgentRewind) ──
    // If rolling back, generate a rewind memory from the failed attempt.
    let rewindMemory: string | null = null;
    if (shouldRollback) {
      rewindMemory = `Stage ${stage} failed after ${retryCount} retries (score=${avgScore.toFixed(2)}). ` +
        `Issues: ${feedback.slice(0, 3).join('; ')}. ` +
        `Avoid repeating these errors in the next attempt.`;
      this.rewindMemories.push({ stage, summary: rewindMemory, timestamp: Date.now() });
    }

    console.log(
      `[SelfCorrect] CHECKPOINT ${stage}: verdict=${overallVerdict}, score=${avgScore.toFixed(2)}, ` +
      `drift=${drift.toFixed(3)}, cascade=${cascade.detected}, retries=${retryCount}, ` +
      `feedback=${feedback.length} items` +
      (gate ? `, gate=${gate.hasSpecificMistake ? 'OPEN' : 'BLOCKED'} (${gate.contradictionScore.toFixed(2)})` : '') +
      `, stability=${stability.shouldContinue ? 'OK' : 'STOP'}`,
    );

    return {
      verdict: overallVerdict,
      score: avgScore,
      drift,
      cascadeDetected: cascade.detected,
      feedback,
      shouldRetry,
      shouldRollback,
      rollbackTarget: shouldRollback ? cascade.rollbackTarget : null,
      // DISC + stability + rewind metadata
      judgmentGate: gate,
      stability,
      rewindMemory,
    } as CheckpointResult & { judgmentGate: JudgmentGateResult | null; stability: StabilityMetrics; rewindMemory: string | null };
  }

  /**
   * Cascade detection — aggregate signals across all stages (CHARM CRT).
   * A cascade is detected when:
   * 1. Multiple consecutive stages have verifier failures, OR
   * 2. Aggregate weighted score falls below cascade threshold, OR
   * 3. Confidence inflation is detected across 2+ stages
   */
  private detectCascade(): CascadeResult {
    const stages = this.stageOrder
      .map((s) => this.snapshots.get(s)!)
      .filter(Boolean);

    if (stages.length < 2) {
      return { detected: false, severity: 0, failedStages: [], rollbackTarget: null, reasons: [] };
    }

    // Weighted aggregate score (SFV 40%, CSCT 40%, CPM 20% — CHARM defaults)
    const recentStages = stages.slice(-3); // look at last 3 stages

    // SFV: average verifier scores
    const sfvScores: number[] = [];
    for (const s of recentStages) {
      for (const r of s.verifierResults) {
        sfvScores.push(r.score);
      }
    }
    const sfvScore = sfvScores.length > 0
      ? sfvScores.reduce((a, b) => a + b, 0) / sfvScores.length
      : 1;

    // CSCT: average drift between consecutive stages
    const drifts: number[] = [];
    for (let i = 1; i < recentStages.length; i++) {
      drifts.push(cosineDrift(recentStages[i - 1].tfidfVector, recentStages[i].tfidfVector));
    }
    const csctScore = drifts.length > 0
      ? 1 - (drifts.reduce((a, b) => a + b, 0) / drifts.length)
      : 1;

    // CPM: confidence consistency
    const confidences = recentStages.map((s) => s.confidenceScore);
    let cpmScore = 1;
    for (let i = 1; i < confidences.length; i++) {
      const delta = confidences[i] - confidences[i - 1];
      if (delta > this.config.confidenceInflationDelta) {
        cpmScore -= 0.3; // penalize inflation
      }
    }
    cpmScore = Math.max(0, cpmScore);

    // Aggregate
    const aggregateScore = sfvScore * 0.4 + csctScore * 0.4 + cpmScore * 0.2;
    const cascadeDetected = aggregateScore < this.config.cascadeThreshold;

    // Find failed stages
    const failedStages = recentStages
      .filter((s) => !s.clean)
      .map((s) => s.stage);

    // Find rollback target — last clean stage before the first failure
    let rollbackTarget: string | null = null;
    if (cascadeDetected) {
      for (let i = stages.length - 1; i >= 0; i--) {
        if (stages[i].clean) {
          rollbackTarget = stages[i].stage;
          break;
        }
      }
    }

    const reasons: string[] = [];
    if (cascadeDetected) {
      reasons.push(
        `Aggregate score ${aggregateScore.toFixed(2)} < threshold ${this.config.cascadeThreshold} ` +
        `(SFV=${sfvScore.toFixed(2)}, CSCT=${csctScore.toFixed(2)}, CPM=${cpmScore.toFixed(2)})`,
      );
      if (failedStages.length > 0) {
        reasons.push(`Failed stages: ${failedStages.join(' → ')}`);
      }
      if (drifts.some((d) => d > this.config.driftThreshold)) {
        reasons.push(
          `High drift detected: ${drifts.filter((d) => d > this.config.driftThreshold).map((d) => (d * 100).toFixed(0) + '%').join(', ')}`,
        );
      }
    }

    return {
      detected: cascadeDetected,
      severity: 1 - aggregateScore,
      failedStages,
      rollbackTarget,
      reasons,
    };
  }

  /**
   * Build a retry prompt with injected feedback (Overseer pattern).
   * The verifier's reasons are folded into the original prompt as critic_feedback.
   */
  buildRetryPrompt(originalPrompt: string, feedback: string[]): string {
    if (feedback.length === 0) return originalPrompt;

    const feedbackBlock = feedback
      .map((f, i) => `${i + 1}. ${f}`)
      .join('\n');

    return `${originalPrompt}

── CRITIC FEEDBACK (from previous attempt — address ALL issues) ──
${feedbackBlock}

IMPORTANT: The above issues were identified by automated verifiers in your previous attempt.
You MUST address each one. Do not repeat the same errors. Revise your output accordingly.`;
  }

  /**
   * Rollback — get the snapshot of the last clean stage.
   * The pipeline can use this to restore state and re-run from that point.
   * Includes rewind memory (AgentRewind): a summary of what went wrong is
   * available via getRewindMemory() to inject into the retry.
   */
  rollback(targetStage?: string): StageSnapshot | null {
    if (targetStage) {
      return this.snapshots.get(targetStage) ?? null;
    }
    // Find last clean stage
    for (let i = this.stageOrder.length - 1; i >= 0; i--) {
      const snapshot = this.snapshots.get(this.stageOrder[i]);
      if (snapshot?.clean) return snapshot;
    }
    return null;
  }

  /**
   * Get rewind memory — summaries of failed attempts that can be injected
   * into the restored context to guide the retry (AgentRewind pattern).
   */
  getRewindMemory(): string[] {
    return this.rewindMemories.map((m) => `[${m.stage}] ${m.summary}`);
  }

  /**
   * Get version buffer for a stage — previous outputs for rollback comparison.
   * Returns versions sorted by score (best first).
   */
  getVersions(stage: string): Array<{ output: string; score: number; timestamp: number }> {
    const versions = this.versionBuffer.get(stage) ?? [];
    return [...versions].sort((a, b) => b.score - a.score);
  }

  /**
   * Get the best version from the buffer — useful when the latest attempt
   * is worse than a previous one (CyberCorrect overshoot rollback).
   */
  getBestVersion(stage: string): { output: string; score: number } | null {
    const versions = this.getVersions(stage);
    return versions.length > 0 ? versions[0] : null;
  }

  /**
   * Root-cause attribution (AgentDebugX): trace a cascade to its origin.
   * Returns the stage where the error started and how it propagated.
   */
  attributeRootCause(): RootCauseAttribution | null {
    return attributeRootCause(this.getSnapshots());
  }

  /**
   * Get all snapshots for debugging / stats.
   */
  getSnapshots(): StageSnapshot[] {
    return this.stageOrder.map((s) => this.snapshots.get(s)!).filter(Boolean);
  }

  /**
   * Get cascade history for debugging / stats.
   */
  getCascadeHistory(): CascadeResult[] {
    return [...this.cascadeHistory];
  }

  /**
   * Get summary stats for pipeline reporting.
   */
  getStats(): {
    stagesChecked: number;
    totalRetries: number;
    cascadesDetected: number;
    rollbacksPerformed: number;
    avgDrift: number;
    cleanStages: number;
    // DISC + EIR/ECR + root-cause stats
    judgmentGateBlocks: number;
    stabilityStops: number;
    rootCause: RootCauseAttribution | null;
    rewindMemories: number;
  } {
    const snapshots = this.getSnapshots();
    const totalRetries = Array.from(this.retryCounts.values()).reduce((a, b) => a + b, 0);
    const cascadesDetected = this.cascadeHistory.filter((c) => c.detected).length;

    // Compute average drift across consecutive stages
    const drifts: number[] = [];
    for (let i = 1; i < snapshots.length; i++) {
      drifts.push(cosineDrift(snapshots[i - 1].tfidfVector, snapshots[i].tfidfVector));
    }
    const avgDrift = drifts.length > 0
      ? drifts.reduce((a, b) => a + b, 0) / drifts.length
      : 0;

    // Count judgment gate blocks and stability stops
    let judgmentGateBlocks = 0;
    let stabilityStops = 0;
    for (const [stage, scores] of this.iterationScores) {
      const stability = computeStability(scores, this.config);
      if (!stability.shouldContinue) stabilityStops++;
    }

    return {
      stagesChecked: snapshots.length,
      totalRetries,
      cascadesDetected,
      rollbacksPerformed: 0, // tracked by pipeline
      avgDrift,
      cleanStages: snapshots.filter((s) => s.clean).length,
      judgmentGateBlocks,
      stabilityStops,
      rootCause: this.attributeRootCause(),
      rewindMemories: this.rewindMemories.length,
    };
  }

  /**
   * Reset state for a new pipeline run.
   */
  reset(): void {
    this.snapshots.clear();
    this.stageOrder = [];
    this.idfMap.clear();
    this.documentCount = 0;
    this.retryCounts.clear();
    this.cascadeHistory = [];
    this.versionBuffer.clear();
    this.iterationScores.clear();
    this.rewindMemories = [];
  }
}

// ─── Verifier Helpers ────────────────────────────────────────────────────────

/**
 * Create a simple threshold verifier.
 * Passes if score >= threshold, fails if < threshold * 0.5, retry otherwise.
 */
export function thresholdVerifier(
  id: string,
  scoreFn: (output: string) => number,
  threshold: number,
  failReasons: string[] = [],
): { id: string; check: (output: string) => VerifierResult } {
  return {
    id,
    check: (output: string): VerifierResult => {
      const score = scoreFn(output);
      if (score >= threshold) {
        return { verifierId: id, verdict: 'pass', score, reasons: [] };
      }
      if (score < threshold * 0.5) {
        return { verifierId: id, verdict: 'fail', score, reasons: failReasons };
      }
      return { verifierId: id, verdict: 'retry', score, reasons: failReasons };
    },
  };
}

/**
 * Create a contradiction verifier — checks for internal contradictions.
 * Uses simple heuristic: looks for negated claims that share key terms.
 */
export function contradictionVerifier(
  id: string,
  knownContradictions: Array<{ pattern: RegExp; reason: string }>,
): { id: string; check: (output: string) => VerifierResult } {
  return {
    id,
    check: (output: string): VerifierResult => {
      const found: string[] = [];
      for (const { pattern, reason } of knownContradictions) {
        if (pattern.test(output)) {
          found.push(reason);
        }
      }
      if (found.length === 0) {
        return { verifierId: id, verdict: 'pass', score: 1, reasons: [] };
      }
      if (found.length >= 3) {
        return { verifierId: id, verdict: 'fail', score: 0.2, reasons: found };
      }
      return { verifierId: id, verdict: 'retry', score: 0.5, reasons: found };
    },
  };
}

/**
 * Create a citation coverage verifier.
 */
export function citationCoverageVerifier(
  id: string,
  sourceCount: number,
  minCoverage: number = 0.35,
): { id: string; check: (output: string) => VerifierResult } {
  return {
    id,
    check: (output: string): VerifierResult => {
      const citations = new Set<string>();
      const matches = output.match(/\[SRC-\d+\]|\[E-\d+\]|<sup[^>]*>/gi) || [];
      for (const m of matches) {
        const num = m.match(/\d+/);
        if (num) citations.add(num[0]);
      }
      const coverage = sourceCount > 0 ? citations.size / sourceCount : 0;
      if (coverage >= minCoverage) {
        return { verifierId: id, verdict: 'pass', score: coverage, reasons: [] };
      }
      return {
        verifierId: id,
        verdict: coverage < minCoverage * 0.5 ? 'fail' : 'retry',
        score: coverage,
        reasons: [
          `Citation coverage ${(coverage * 100).toFixed(0)}% < required ${(minCoverage * 100).toFixed(0)}%`,
          `Found ${citations.size} unique citations out of ${sourceCount} sources.`,
        ],
      };
    },
  };
}
