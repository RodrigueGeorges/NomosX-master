/**
 * POST-ANALYST CHECKS — output guardrails + local judge → witness observe +
 * metaLoop (actuator: cuts optional downstream phases) → self-play → PRM
 * scoring → self-correct checkpoint → post-analyst diagnostic → blackboard
 * ANALYST→SCOUT gap detection → topic consistency → terminal distance →
 * orchestrator assess → self-correction (Reflexion retry, budget-capped).
 *
 * `analysis` flows in/out (self-correction may adopt a retried version);
 * `reAnalysisBudget` is created here and handed to the gap-fill stage.
 */

import { prisma } from '../../db';
import { guardOutput } from '../output-guard';
import { judge } from '../local-judge';
import { buildObservation, type WitnessContext } from '../witness/integration';
import { runSelfPlayRound } from '../self-play/adversarial';
import { extractFeatures, scoreStep, persistProcessStep, type ProcessStep, type PRMModel } from '../prm/process-reward-model';
import { selfCorrectAnalyst } from '../self-correction-integration';
import type { PipelineStep } from '../pipeline-progress';

export interface PostAnalystChecksDeps {
  analysis: any;
  query: string;
  topSources: any[];
  slimReadings: any[];
  fullContextBlock: string | undefined;
  detectedDomain: string;
  isStrategic: boolean;
  analystCostUsd: number | undefined;
  stats: Record<string, any>;
  label: string;
  pipelineRunId: string;
  pipelineStart: number;
  emitProgress: (runId: string, step: PipelineStep, status: 'completed' | 'started' | 'failed' | 'skipped', message: string, metadata?: Record<string, any>) => void;
  addCost: (usd: number | undefined, step: string) => void;
  useOutputGuard: boolean;
  useLocalJudge: boolean;
  useSelfPlay: boolean;
  usePRM: boolean;
  prmModel: PRMModel | null;
  witnessCtx: WitnessContext | null;
  witnessReducedScope: boolean;
  runDevilsAdvocateStep: boolean;
  runDebateStep: boolean;
  runDeliberationStep: boolean;
  selfCorrector: any;
  selfCorrectRetries: number;
  analystMultipass: (query: string, topSources: any[], readings: any[], opts: any) => Promise<any>;
  bumpAnalysisArtifact: () => void;
  validateTopicConsistency: (query: string, topSources: any[], analysis: any) => Promise<{ isValid: boolean; issues: string[] }>;
  assessAfterAnalyst: (state: any) => any;
  recordDecision: (state: any, decision: any) => void;
  orchState: Record<string, any>;
  ctx: {
    addFinding: (agent: string, type: 'gap' | 'warning' | 'insight' | 'recommendation', content: string, metadata?: Record<string, unknown>) => void;
    requestSourceGap: (query: string, reason: string, agent: string, providers?: string[], minResults?: number) => void;
    skipStep: (step: string) => void;
    setAnalystOutput: (analysis: any) => void;
    getSummary: () => unknown;
  };
}

export interface PostAnalystChecksResult {
  analysis: any;
  reAnalysisBudget: number;
  analystDecision: any;
  witnessReducedScope: boolean;
  runDevilsAdvocateStep: boolean;
  runDebateStep: boolean;
  runDeliberationStep: boolean;
  selfCorrectRetries: number;
}

export async function runPostAnalystChecks(deps: PostAnalystChecksDeps): Promise<PostAnalystChecksResult> {
  const {
    query, topSources, slimReadings, fullContextBlock, detectedDomain,
    isStrategic, analystCostUsd, stats, label, pipelineRunId, pipelineStart,
    emitProgress, addCost, useOutputGuard, useLocalJudge, useSelfPlay, usePRM,
    prmModel, witnessCtx, selfCorrector, analystMultipass,
    bumpAnalysisArtifact, validateTopicConsistency, assessAfterAnalyst,
    recordDecision, orchState, ctx,
  } = deps;
  let analysis = deps.analysis;
  let witnessReducedScope = deps.witnessReducedScope;
  let runDevilsAdvocateStep = deps.runDevilsAdvocateStep;
  let runDebateStep = deps.runDebateStep;
  let runDeliberationStep = deps.runDeliberationStep;
  let selfCorrectRetries = deps.selfCorrectRetries;

  // ── OUTPUT GUARDRAILS + LOCAL JUDGE (Sprint 6) ──
  if (useOutputGuard) {
    try {
      const analysisStr = typeof analysis === 'string' ? analysis : JSON.stringify(analysis);
      const guardResult = guardOutput(analysisStr, {
        requireCitations: true,
        validateCitationRanges: true,
        sourceCount: topSources.length,
        checkPII: true,
        checkSafety: true,
        maxPiiCount: 0,
        confidenceMode: 'cautious',
        requiredFormat: 'json',
      });
      (stats as any).outputGuard = { outcome: guardResult.outcome, score: guardResult.score, violations: guardResult.violations.length };
      console.log(`${label} OUTPUT GUARD: ${guardResult.outcome} (score=${guardResult.score}, violations=${guardResult.violations.length})`);
    } catch (err) {
      console.warn(`${label} OUTPUT GUARD: failed (non-blocking):`, err);
    }
  }
  if (useLocalJudge) {
    try {
      const analysisStr = typeof analysis === 'string' ? analysis : JSON.stringify(analysis);
      const judgeResult = await judge(analysisStr);
      (stats as any).localJudge = { score: judgeResult.overallScore, rubrics: judgeResult.rubrics, feedback: judgeResult.feedback.slice(0, 200) };
      console.log(`${label} LOCAL JUDGE: score=${judgeResult.overallScore.toFixed(2)}, usedLocal=${judgeResult.usedLocalJudge}`);

      // S16-06: JudgeArena calibration — compare judge score vs deterministic trust as ground truth
      try {
        const { calibrateLocalJudge } = await import('../local-judge');
        const trustAsGroundTruth = (stats.criticalLoop?.finalScore ?? 70) / 100;
        const judgeScore = judgeResult.overallScore;
        const calibration = await calibrateLocalJudge([judgeScore], [trustAsGroundTruth]);
        (stats as any).localJudgeCalibration = {
          kappa: calibration.kappa,
          rho: calibration.rho,
          reliability: calibration.reliability,
        };
        if (calibration.reliability === 'low') {
          console.warn(`${label} JUDGE CALIBRATION: low reliability (κ=${calibration.kappa.toFixed(2)}) — judge may need recalibration`);
        }
      } catch (calErr) { /* non-blocking */ }
    } catch (err) {
      console.warn(`${label} LOCAL JUDGE: failed (non-blocking):`, err);
    }
  }

  // ── WITNESS: Observe ANALYST step ──
  if (witnessCtx) {
    try {
      const analysisStr = typeof analysis === 'string' ? analysis : JSON.stringify(analysis);
      const citations = new Set((analysisStr.match(/\[SRC-\d+\]/g) || []).map((m: string) => m)).size;
      await witnessCtx.observe(buildObservation('analyst', {
        success: true,
        costUsd: analystCostUsd || 0.20,
        durationMs: Date.now() - pipelineStart,
        outputSummary: analysisStr.slice(0, 500),
        metrics: {
          citations,
          sourceCount: topSources.length,
          citationCoverage: citations / Math.max(1, topSources.length),
        },
        errors: [],
      }, pipelineStart));
      // Run meta-loop to check overall health — Witness is an actuator, not just
      // an observer: 'abort'/'reduce_scope' cut optional downstream phases.
      const metaResult = await witnessCtx.metaLoop();
      if (metaResult.recommendation !== 'continue') {
        console.warn(`${label} WITNESS: ${metaResult.recommendation.toUpperCase()} — ${metaResult.reason}`);
        (stats as any).witnessDirective = { recommendation: metaResult.recommendation, reason: metaResult.reason };
        ctx.addFinding('WITNESS', 'warning', `${metaResult.recommendation}: ${metaResult.reason}`);
        if (metaResult.recommendation === 'reduce_scope' || metaResult.recommendation === 'abort') {
          witnessReducedScope = true;
          runDevilsAdvocateStep = false;
          ctx.skipStep('devils-advocate');
          if (metaResult.recommendation === 'abort') {
            runDebateStep = false;
            runDeliberationStep = false;
            ctx.skipStep('debate');
            ctx.skipStep('deliberation');
          }
          console.log(`${label} WITNESS: ${metaResult.recommendation} applied — optional phases cut (self-play, DA${metaResult.recommendation === 'abort' ? ', debate, deliberation' : ''})`);
        }
      }
    } catch (err) {
      console.warn(`${label} WITNESS: analyst observation failed:`, err);
    }
  }

  // ── SELF-REFLECTION: SUPPENDED — redundant with 3-pass analyst, $0.05/run saved ──
  // LLM self-evaluation is unreliable (FlowVerify 2026: calibration drift, position bias).
  // The analyst multipass already has exploration → stress-test → synthesis.
  stats.selfReflection = { skipped: true, reason: 'suppressed — redundant with 3-pass analyst' };

  // ── SELF-PLAY: Adversarial testing — attack the analysis to find weaknesses ──
  if (useSelfPlay && analysis && !witnessReducedScope) {
    try {
      const analysisText = typeof analysis === 'string' ? analysis :
        (analysis.summary || '') + '\n' + (analysis.consensus || '') + '\n' + (analysis.debate?.synthesis || '');
      const spResult = await runSelfPlayRound(
        query,
        analysisText,
        topSources.map((s: any) => ({ id: s.id, title: s.title, abstract: s.abstract })),
      );
      console.log(`${label} SELF_PLAY: ${spResult.attacks.length} attacks, ${spResult.verdicts.filter(v => v.attackSucceeded).length} succeeded, robustness=${spResult.robustnessScore.toFixed(2)}`);
      (stats as any).selfPlay = {
        attacks: spResult.attacks.length,
        succeeded: spResult.verdicts.filter(v => v.attackSucceeded).length,
        robustnessScore: spResult.robustnessScore,
        lessons: spResult.lessons.length,
      };
    } catch (err) {
      console.warn(`${label} SELF_PLAY: failed:`, err);
    }
  }

  // ── PRM: Score the analyst step ──
  if (usePRM && prmModel && analysis) {
    try {
      const analysisText = typeof analysis === 'string' ? analysis : JSON.stringify(analysis);
      const features = extractFeatures({
        phase: 'analyst',
        subStep: 'final',
        action: 'Analysis synthesis',
        output: analysisText,
        runId: pipelineRunId,
        timestamp: Date.now(),
      } as any);
      const prediction = scoreStep(features, prmModel);
      console.log(`${label} PRM: analyst step scored ${prediction.predictedReward.toFixed(3)} (recommendation: ${prediction.recommendation})`);

      // Persist the step for future training
      const step: ProcessStep = {
        id: `step_${pipelineRunId}_analyst`,
        phase: 'analyst',
        subStep: 'final',
        action: 'Analysis synthesis',
        output: analysisText.slice(0, 500),
        features,
        reward: prediction.predictedReward,
        runId: pipelineRunId,
        timestamp: Date.now(),
      };
      await persistProcessStep(step);
      (stats as any).prm = { analystScore: prediction.predictedReward, recommendation: prediction.recommendation };
    } catch (err) {
      console.warn(`${label} PRM: scoring failed:`, err);
    }
  }

  emitProgress(pipelineRunId, "ANALYST", "completed", `${isStrategic ? "Strategic" : "Multi-pass"} analysis complete`, { blackboard: ctx.getSummary() });

  // SELF-CORRECT CHECKPOINT: ANALYST
  try {
    const analysisText = typeof analysis === 'string' ? analysis : JSON.stringify(analysis).slice(0, 8000);
    const { citationCoverageVerifier } = await import('../self-correct');
    const cpResult = await selfCorrector.checkpoint(
      'analyst',
      analysisText,
      [
        citationCoverageVerifier('citation_coverage', topSources.length, 0.35),
        {
          id: 'internal_consistency',
          check: (output: string) => {
            const contradictions = (output.match(/\bhowever\b[\s\S]*?\bhowever\b/gi) || []).length;
            const hedgeDensity = (output.match(/\b(may|might|could|perhaps|possibly|seemingly|allegedly)\b/gi) || []).length;
            const wordCount = output.split(/\s+/).length;
            const hedgeRate = wordCount > 0 ? hedgeDensity / (wordCount / 1000) : 0;
            if (contradictions > 3) {
              return { verifierId: 'internal_consistency', verdict: 'retry' as const, score: 0.4, reasons: [`${contradictions} "however" transitions detected — possible contradiction cascade`] };
            }
            if (hedgeRate > 15) {
              return { verifierId: 'internal_consistency', verdict: 'retry' as const, score: 0.5, reasons: [`Hedge density ${hedgeRate.toFixed(1)}/1K words — analyst is uncertain, check evidence quality`] };
            }
            return { verifierId: 'internal_consistency', verdict: 'pass' as const, score: 0.9, reasons: [] };
          },
        },
      ],
      (analysis as any)?.confidence ?? 0.65,
    );
    if (cpResult.shouldRetry && cpResult.feedback.length > 0) {
      selfCorrectRetries++;
      console.log(`${label} SELF-CORRECT: ANALYST checkpoint triggered retry — feedback: ${cpResult.feedback.length} items`);
      (stats as any).selfCorrect = { ...((stats as any).selfCorrect ?? {}), analystCheckpoint: cpResult };
    }
    if (cpResult.cascadeDetected) {
      console.warn(`${label} SELF-CORRECT: CASCADE detected at ANALYST — severity=${cpResult.score.toFixed(2)}`);
    }
  } catch (scErr) {
    console.warn(`${label} SELF-CORRECT: ANALYST checkpoint failed (non-blocking):`, scErr);
  }

  // ── POST-ANALYST DIAGNOSTIC — log quality signals but NEVER skip downstream ──
  // Previous logic skipped debate/DA/critical-loop on weak analysis. Anti-pattern:
  // skipping QA hides problems instead of fixing them. Deterministic gates always run.
  {
    const analysisObj = analysis as Record<string, unknown>;
    const causalChainLen = Array.isArray(analysisObj?.causalChain) ? (analysisObj as any).causalChain.length : 0;
    const keyFindingsLen = Array.isArray(analysisObj?.keyFindings) ? (analysisObj as any).keyFindings.length : 0;
    const verdictLen = typeof analysisObj?.verdict === 'string' ? (analysisObj as any).verdict.length : 0;
    const verdictText = typeof analysisObj?.verdict === 'string' ? (analysisObj as any).verdict : '';
    const citationCount = (verdictText.match(/\[SRC-\d+\]/g) || []).length;
    const citationDensity = verdictLen > 0 ? citationCount / (verdictLen / 1000) : 0;

    console.log(`${label} DIAGNOSTIC: chain=${causalChainLen}, findings=${keyFindingsLen}, verdict=${verdictLen}ch, citDensity=${citationDensity.toFixed(1)}/1K`);
    stats.qualityGate = { skipped: [], reason: 'diagnostic only — no agents skipped' };
  }

  // ── BLACKBOARD: ANALYST→SCOUT feedback loop ──
  // Detect specific evidence gaps in the analysis and request targeted re-search.
  // This is the cross-agent feedback pattern: ANALYST identifies what's missing,
  // SCOUT fills the gap with targeted queries — without re-running the whole pipeline.
  if (!isStrategic || (isStrategic && topSources.length < 40)) {
    try {
      const analysisObj = analysis as Record<string, unknown>;
      const openQ = (analysisObj?.openQuestions as string) || '';
      const risks = (analysisObj?.risks as string) || '';
      const evidence = (analysisObj?.evidence as string) || '';
      const combinedText = `${openQ} ${risks} ${evidence}`.toLowerCase();

      // Detect gap signals — phrases that indicate missing evidence
      const gapSignals = [
        { pattern: /limited (data|evidence|research|studies)/, query_prefix: '' },
        { pattern: /insufficient (data|evidence|research)/, query_prefix: '' },
        { pattern: /no (studies|data|evidence) (have|were|are) (yet|currently|directly)/, query_prefix: '' },
        { pattern: /further (research|studies|analysis|data) (is|are) (needed|required|warranted)/, query_prefix: '' },
        { pattern: /remains (unclear|uncertain|unknown|unexplored)/, query_prefix: '' },
        { pattern: /gap in (the )?(literature|evidence|research|data|knowledge)/, query_prefix: '' },
      ];

      const detectedGaps: string[] = [];
      for (const sig of gapSignals) {
        const matches = combinedText.match(new RegExp(sig.pattern, 'gi'));
        if (matches && matches.length > 0) {
          // Extract the sentence containing the gap signal
          const sentences = combinedText.split(/[.!?]/);
          for (const s of sentences) {
            if (sig.pattern.test(s)) {
              detectedGaps.push(s.trim().slice(0, 200));
            }
          }
        }
      }

      if (detectedGaps.length > 0 && detectedGaps.length <= 5) {
        ctx.addFinding('ANALYST', 'gap', `${detectedGaps.length} evidence gaps detected in analysis`, { gaps: detectedGaps });
        console.log(`${label} BLACKBOARD: ${detectedGaps.length} evidence gaps detected by ANALYST — requesting targeted re-search`);

        // Request targeted re-search for each gap
        for (const gap of detectedGaps.slice(0, 3)) {
          const gapQuery = `${query} ${gap}`.slice(0, 300);
          ctx.requestSourceGap(gapQuery, `ANALYST identified evidence gap: "${gap.slice(0, 100)}"`, 'ANALYST',
            ['crossref', 'semanticscholar', 'europepmc', 'ipcc', 'internet-archive', 'jstor'], 10);
        }
      }
    } catch (err) {
      console.warn(`${label} BLACKBOARD: gap detection failed (non-blocking):`, err);
    }
  }

  // CRITICAL: A+ LEVEL - Validate topic consistency after analysis
  const topicValidation = await validateTopicConsistency(query, topSources, analysis);
  if (!topicValidation.isValid) {
    console.warn(`${label} TOPIC CONSISTENCY ISSUES DETECTED:`);
    topicValidation.issues.forEach(issue => console.warn(`  - ${issue}`));

    // If major consistency issues, flag for revision
    if (topicValidation.issues.length >= 2) {
      console.error(`${label} CRITICAL: Topic consistency failure - analysis may be irrelevant`);
      stats.topicConsistency = { passed: false, issues: topicValidation.issues };
    } else {
      stats.topicConsistency = { passed: true, issues: topicValidation.issues };
    }
  } else {
    console.log(`${label} Topic consistency validated: all components aligned`);
    stats.topicConsistency = { passed: true, issues: [] };
  }

  // ── TERMINAL DISTANCE CHECK: detect analogical leaps in causal chain ──
  const chain = (analysis as Record<string, unknown>)?.causalChain as Array<Record<string, unknown>> | undefined;
  if (chain && chain.length >= 3) {
    const firstDomain = (chain[0].temporalStatus as string) || detectedDomain;
    const lastDomain = (chain[chain.length - 1].temporalStatus as string) || detectedDomain;
    if (chain.length > 5 && firstDomain === lastDomain) {
      stats.terminalDistanceWarning = `Causal chain starts and ends in ${firstDomain} — check for analogical leap`;
      console.warn(`${label} TERMINAL DISTANCE: chain of ${chain.length} links starts and ends in ${firstDomain}`);
    }
  }

  const analystDecision = assessAfterAnalyst(orchState);
  recordDecision(orchState, analystDecision);
  stats.orchestrator = stats.orchestrator || { decisions: [] };
  stats.orchestrator.decisions.push(analystDecision);

  // Re-analysis budget: a single full 3-pass analyst run costs ~7min/$0.5 on
  // reasoning models — cap total re-analyses (self-correct + orchestrator +
  // gap-fill) so repair loops cannot stack into a pipeline timeout.
  let reAnalysisBudget = isStrategic ? 2 : 1;

  // ── SELF-CORRECTION: ANALYST — assess quality, retry if low (Reflexion pattern) ──
  try {
    const analysisStr = typeof analysis === 'string' ? analysis : JSON.stringify(analysis);
    const analysisCitations = new Set((analysisStr.match(/\[SRC-\d+\]/g) || []).map((m: string) => m)).size;
    const scResult = await selfCorrectAnalyst({
      query,
      analysis,
      sourceCount: topSources.length,
      citationCount: analysisCitations,
      maxRetries: 1,
      retryFn: async (feedback: string) => {
        // Re-run analyst with feedback injected — subject to run budget
        if (reAnalysisBudget <= 0) {
          console.log(`${label} SELF-CORRECTION (ANALYST): retry skipped — re-analysis budget exhausted`);
          return analysis;
        }
        reAnalysisBudget--;
        const reAnalysis = await analystMultipass(query, topSources, slimReadings, {
          contextBlock: (fullContextBlock ?? '') + '\n\n' + feedback,
          domain: detectedDomain,
          depth: isStrategic ? "strategic" : "brief",
        });
        return reAnalysis;
      },
    });
    if (scResult.stats.triggered) {
      stats.selfCorrection = stats.selfCorrection || {};
      (stats.selfCorrection as any).analyst = scResult.stats;
      addCost(scResult.stats.costUsd, 'SELF-CORRECTION (ANALYST)');
      if (scResult.stats.improved) {
        analysis = scResult.analysis;
        bumpAnalysisArtifact();
        ctx.setAnalystOutput(analysis);
        console.log(`${label} SELF-CORRECTION (ANALYST): ${scResult.stats.originalScore} → ${scResult.stats.finalScore} after ${scResult.stats.retries} retry`);
      }
      // Log to AgentAuditLog for dashboard visibility
      prisma.agentAuditLog.create({
        data: {
          agent: 'analyst',
          action: 'SELF_CORRECTION',
          metadata: JSON.stringify({
            phase: 'analyst',
            originalScore: scResult.stats.originalScore,
            finalScore: scResult.stats.finalScore,
            retries: scResult.stats.retries,
            improved: scResult.stats.improved,
            issues: scResult.stats.issues.slice(0, 3),
          }),
        },
      }).catch(() => {}); // non-blocking
    }
  } catch (err) {
    console.warn(`${label} SELF-CORRECTION (ANALYST): failed (non-blocking):`, err);
  }

  return {
    analysis, reAnalysisBudget, analystDecision,
    witnessReducedScope, runDevilsAdvocateStep, runDebateStep,
    runDeliberationStep, selfCorrectRetries,
  };
}
