/**
 * CRITIC BLOCK — STEP 7b: critic agent → critic panel → critic repair
 * (re-analysis adopted iff citation coverage holds, then BOTH evaluators
 * re-checked so the gate never consumes stale verdicts) → critic evidence
 * tool → outline critic → second gap-request round → self-correct
 * checkpoint → CoVe.
 *
 * Returns `analysis` (mutated when a repair is adopted), the decremented
 * `reAnalysisBudget`, and `savedCriticResult` (consumed downstream by
 * post-hoc injection).
 */

import type { PipelineStep } from '../pipeline-progress';
import type { GapFillState } from './gap-fill';

export interface CriticBlockDeps {
  /** Shared mutable state — analysis/reAnalysisBudget mutations flow back to the caller. */
  state: GapFillState;
  topSources: any[];
  readings: any[];
  slimReadings: any[];
  stats: Record<string, any>;
  label: string;
  query: string;
  detectedDomain: string;
  positioningBrief: any;
  fullContextBlock: string | undefined;
  isStrategic: boolean;
  isBudgetConstrained: () => boolean;
  orchState: { iteration: number; maxIterations: number };
  analystMultipass: (query: string, sources: any[], readings: any[], opts?: any) => Promise<any>;
  bumpAnalysisArtifact: () => void;
  tagEval: <T extends Record<string, any>>(entry: T, artifact: 'analysis' | 'html') => T;
  addCost: (usd: number | undefined, step: string) => void;
  emitProgress: (runId: string, step: PipelineStep, status: 'completed' | 'started' | 'failed' | 'skipped', message: string, metadata?: Record<string, any>) => void;
  pipelineRunId: string;
  ctx: {
    setAnalystOutput: (a: any) => void;
    requestSourceGap: (query: string, reason: string, origin: string, providers: string[], limit: number) => void;
    addFinding: (agent: string, type: 'gap' | 'warning' | 'insight' | 'recommendation', content: string, metadata?: Record<string, unknown>) => void;
  };
  selfCorrector: any;
  processGapRequests: (origin: string) => Promise<void>;
}

export interface CriticBlockResult {
  analysis: any;
  reAnalysisBudget: number;
  savedCriticResult: any;
}

export async function runCriticBlock(deps: CriticBlockDeps): Promise<CriticBlockResult> {
  const {
    topSources, readings, slimReadings, stats, label, query, detectedDomain,
    positioningBrief, fullContextBlock, isStrategic, isBudgetConstrained,
    orchState, analystMultipass, bumpAnalysisArtifact, tagEval, addCost,
    emitProgress, pipelineRunId, ctx, selfCorrector, processGapRequests,
  } = deps;
  let analysis = deps.state.analysis;
  let reAnalysisBudget = deps.state.reAnalysisBudget;

  // ── STEP 7b: CRITIC AGENT — Multi-stage verification ──
  // Decomposes analysis into atomic claims, grounds each against sources,
  // detects contradictions, bias, and citation issues.
  // Can force a retry of ANALYST with targeted repair instructions.
  let savedCriticResult: any = null;
  try {
    const { runCritic } = await import('../critic-agent');
    // CRITICAL: Only pass factual analysis fields to the critic.
    // Speculative fields (rejectedAlternatives, whatToWatch, trajectory, evidenceAssessment)
    // and meta fields (_meta, _deliberationContext, _harvardCouncil) produce claims that
    // are unverifiable by design → they get flagged as "unsupported" and "biased",
    // collapsing the critic score from ~61 (v3) to ~9-38 (after integrations).
    // The critic should only evaluate claims that are meant to be factually grounded.
    const criticAnalysisObj = typeof analysis === 'string'
      ? JSON.parse(analysis)
      : { ...analysis };
    const SPECULATIVE_OR_META_KEYS = new Set([
      '_meta', '_deliberationContext', '_harvardCouncil',
      'rejectedAlternatives', 'whatToWatch', 'trajectory',
      'evidenceAssessment', 'convictionLevel',
    ]);
    const criticFiltered: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(criticAnalysisObj)) {
      if (!SPECULATIVE_OR_META_KEYS.has(key)) {
        criticFiltered[key] = value;
      }
    }
    // CRITICAL: Normalize [E-N] evidence IDs to [SRC-N] format.
    // The critic's decomposition prompt expects [SRC-N] citations to extract sourceIndex.
    // If the analysis uses [E-N] (from replaceSrcWithEvidenceIds), the critic can't
    // match claims to sources → all claims become "unverifiable" → groundedness collapses
    // from ~100% (v3) to ~0-67% (after integrations).
    let analysisText = JSON.stringify(criticFiltered);
    analysisText = analysisText.replace(/\[E(\d+)\]/g, '[SRC-$1]');
    // Attach reader-extracted full text so the critic verifies claims against
    // what the analyst actually read — not just the abstract. Without this,
    // claims synthesized from PDF page 40 are judged "unsupported" and
    // groundedness collapses (~23% observed → HELD on a well-sourced run).
    const readingsById = new Map<string, any>(
      (Array.isArray(readings) ? readings : []).map((r: any) => [r.sourceId, r])
    );
    const criticSources = topSources.map((s: any, i: number) => ({
      index: i + 1,
      title: s.title || '',
      abstract: s.abstract || '',
      fullText: readingsById.get(s.id)?.extractedText || null,
      provider: s.provider || '',
      year: s.year || undefined,
    }));

    const criticResult = await runCritic(analysisText, criticSources, { skipBias: false, skipContradictions: false });
    savedCriticResult = criticResult;
    stats.critic = tagEval({
      verdict: criticResult.verdict,
      overallScore: criticResult.overallScore,
      groundedness: criticResult.groundedness,
      claimsCount: criticResult.claims.length,
      contradictions: criticResult.contradictions.length,
      biases: criticResult.biases.length,
      citationIssues: criticResult.citationIssues.length,
      stageResults: criticResult.stageResults,
      costUsd: criticResult.costUsd,
      durationMs: criticResult.durationMs,
    }, 'analysis');

    console.log(`${label} CRITIC: verdict=${criticResult.verdict}, score=${criticResult.overallScore}, groundedness=${Math.round(criticResult.groundedness * 100)}%, ${criticResult.contradictions.length} contradictions, ${criticResult.biases.length} biases`);

    // If critic says repair, inject repair instructions into the analysis context
    if (criticResult.verdict === 'repair' && criticResult.repairInstructions) {
      console.log(`${label} CRITIC: repair instructions generated (${criticResult.repairTargetClaims?.length || 0} claims to fix)`);
      // Store for potential retry — the pipeline can use this to re-run ANALYST
      (stats as any).criticRepairInstructions = criticResult.repairInstructions;
    }

    // If critic says reject, log but continue (the trust score will handle it)
    if (criticResult.verdict === 'reject') {
      console.warn(`${label} CRITIC: REJECTED — score=${criticResult.overallScore}, consider re-running with different sources`);
    }

    // S14-E: Make Critic actionable — if verdict is "repair" and score is very low,
    // inject repair instructions into the analysis context for the HTML renderer.
    // The repair instructions are already stored in stats.criticRepairInstructions,
    // but we also inject them as a context hint for the editorial phase.
    if (criticResult.verdict === 'repair' && criticResult.overallScore < 40 && criticResult.repairInstructions) {
      console.warn(`${label} CRITIC: ACTIONABLE REPAIR — score ${criticResult.overallScore} < 40, injecting repair instructions into editorial context`);
      // The editorial phase will pick this up and add a quality warning
      (stats as any).criticActionableRepair = true;
    }
  } catch (err) {
    console.warn(`${label} CRITIC: failed (non-blocking):`, err instanceof Error ? err.message : String(err));
  }

  // ── CRITIC PANEL (G-Eval rubric, 4 dimensions) — complements the scalar
  // critic score with per-dimension verdicts: methodology / coverage /
  // epistemic calibration / editorial. A veto fires only when a reviewer
  // documents a REPAIRABLE severe defect — replacing opaque low-score caps. ──
  let savedPanelResult: any = null;
  try {
    const { runCriticPanel } = await import('../critic-panel');
    const panelText = typeof analysis === 'string' ? analysis : JSON.stringify(analysis);
    const panelResult = await runCriticPanel(panelText, query, {
      domain: detectedDomain, // S21: domain checklist (qualityCriteria + biases) injected into methodology reviewer
      fieldContext: positioningBrief ? {
        fieldCoverage: positioningBrief.fieldCoverage,
        uncoveredDimensions: positioningBrief.uncoveredDimensions,
        weakClaims: positioningBrief.weakClaims,
        strongestPiece: positioningBrief.strongestPiece,
      } : undefined,
    });
    addCost(panelResult.costUsd, 'CRITIC_PANEL');
    savedPanelResult = panelResult;
    stats.criticPanel = tagEval({
      overallScore: panelResult.overallScore,
      dimensions: panelResult.dimensions.map((d: any) => ({
        dimension: d.dimension, score: d.score,
        findings: d.findings.slice(0, 4), mustFix: d.mustFix,
      })),
      veto: panelResult.veto,
      vetoReasons: panelResult.vetoReasons,
      costUsd: panelResult.costUsd,
      durationMs: panelResult.durationMs,
    }, 'analysis');
  } catch (err) {
    console.warn(`${label} CRITIC PANEL: failed (non-blocking):`, err instanceof Error ? err.message : String(err));
  }

  // ── ORCHESTRATOR ACTION: CRITIC REPAIR — instructions were generated but never
  // consumed. NOW ACTED: a single targeted re-analysis with the repair instructions
  // injected, kept only if it doesn't degrade citation coverage.
  // S23+: the critic PANEL's mustFix/weak findings are folded into the repair
  // block — methodology/coverage/editorial defects trigger revision too, not
  // just claim-level failures (CogWriter-style monitor→revise loop). ──
  const panelWeakFindings = savedPanelResult
    ? savedPanelResult.dimensions
        .filter((d: any) => d.mustFix || d.score <= 4)
        .flatMap((d: any) => d.findings.slice(0, 3).map((f: string) => `[${d.dimension}] ${f}`))
        .slice(0, 6)
    : [];
  const repairTrigger = savedCriticResult?.verdict === 'repair' && savedCriticResult.repairInstructions &&
    savedCriticResult.overallScore < 65;
  const panelTrigger = savedPanelResult?.veto === true && panelWeakFindings.length > 0;
  if ((repairTrigger || panelTrigger) && !isBudgetConstrained() &&
      orchState.iteration < orchState.maxIterations && reAnalysisBudget > 0) {
    reAnalysisBudget--;
    deps.state.reAnalysisBudget = reAnalysisBudget;
    try {
      const panelBlock = panelWeakFindings.length > 0
        ? '\n\n## EDITORIAL PANEL FINDINGS (must fix)\nThe review panel documented these defects:\n' +
          panelWeakFindings.map((f: string) => `- ${f}`).join('\n')
        : '';
      const instructions = (savedCriticResult?.repairInstructions || '') + panelBlock;
      console.log(`${label} CRITIC REPAIR: re-running ANALYST (critic=${savedCriticResult?.overallScore ?? 'n/a'}/100, panelFindings=${panelWeakFindings.length})`);
      emitProgress(pipelineRunId, "ANALYST", "started", `Repairing analysis per critic instructions...`);
      const repaired = await analystMultipass(query, topSources, slimReadings, {
        contextBlock: fullContextBlock + '\n\n## CRITIC REPAIR INSTRUCTIONS (mandatory)\nThe critic identified defects in the previous analysis that MUST be fixed:\n' + instructions,
        domain: detectedDomain,
        depth: isStrategic ? "strategic" : "brief",
      });
      const repStr = typeof repaired === 'string' ? repaired : JSON.stringify(repaired);
      const repCitations = new Set((repStr.match(/\[SRC-\d+\]/g) || []).map((m: string) => m)).size;
      const origStr = typeof analysis === 'string' ? analysis : JSON.stringify(analysis);
      const origCitations = new Set((origStr.match(/\[SRC-\d+\]/g) || []).map((m: string) => m)).size;
      // Repair targets defects, not citation count — accept if coverage didn't regress
      if (repCitations >= origCitations) {
        analysis = repaired;
        deps.state.analysis = analysis;
        bumpAnalysisArtifact();
        ctx.setAnalystOutput(analysis);
        orchState.iteration++;
        stats.orchestrator = stats.orchestrator ?? { decisions: [] };
        stats.orchestrator.criticRepairApplied = true;
        addCost(typeof repaired._meta?.totalCostUsd === "number" ? repaired._meta.totalCostUsd : 0, 'CRITIC_REPAIR');
        console.log(`${label} CRITIC REPAIR: re-analysis applied (citations ${origCitations} → ${repCitations})`);

        // CRITIC + PANEL RE-CHECK: the verdicts above describe the ORIGINAL,
        // defective analysis. Now that the repaired text was adopted, those
        // verdicts are stale — the trust vetoes (critic reject cap, panel
        // findings) would punish defects that no longer exist. Re-run both
        // evaluators once on the repaired analysis; their fresh verdicts
        // unconditionally replace the stale ones (honest: the artifact being
        // published is the repaired text — if the repair regressed, the worse
        // verdict is the truthful one).
        try {
          const repText = typeof repaired === 'string' ? repaired : JSON.stringify(repaired);
          const recheckReadingsById = new Map<string, any>(
            (Array.isArray(readings) ? readings : []).map((r: any) => [r.sourceId, r])
          );
          const recheckSources = topSources.map((s: any, i: number) => ({
            index: i + 1,
            title: s.title || '',
            abstract: s.abstract || '',
            fullText: recheckReadingsById.get(s.id)?.extractedText || null,
            provider: s.provider || '',
            year: s.year || undefined,
          }));
          const { runCritic: recheckCritic } = await import('../critic-agent');
          const criticRecheck = await recheckCritic(repText, recheckSources, { skipBias: false, skipContradictions: false });
          addCost(criticRecheck.costUsd, 'CRITIC_RECHECK');
          console.log(`${label} CRITIC RE-CHECK: ${savedCriticResult?.overallScore ?? '?'}→${criticRecheck.overallScore}/100 (${savedCriticResult?.verdict ?? '?'}→${criticRecheck.verdict})`);
          savedCriticResult = criticRecheck;
          stats.critic = tagEval({
            verdict: criticRecheck.verdict,
            overallScore: criticRecheck.overallScore,
            groundedness: criticRecheck.groundedness,
            claimsCount: criticRecheck.claims.length,
            contradictions: criticRecheck.contradictions.length,
            biases: criticRecheck.biases.length,
            citationIssues: criticRecheck.citationIssues.length,
            stageResults: criticRecheck.stageResults,
            costUsd: criticRecheck.costUsd,
            durationMs: criticRecheck.durationMs,
          }, 'analysis');
          (stats as any).criticRecheckedPostRepair = true;
        } catch (rcErr) {
          console.warn(`${label} CRITIC RE-CHECK failed (non-blocking):`, rcErr);
        }
        try {
          const { runCriticPanel: recheckPanel } = await import('../critic-panel');
          const repPanelText = typeof repaired === 'string' ? repaired : JSON.stringify(repaired);
          const panelRecheck = await recheckPanel(repPanelText, query, { domain: detectedDomain });
          addCost(panelRecheck.costUsd ?? 0, 'CRITIC_PANEL_RECHECK');
          if (panelRecheck && typeof panelRecheck.overallScore === 'number') {
            console.log(`${label} PANEL RE-CHECK: ${savedPanelResult?.overallScore ?? '?'}→${panelRecheck.overallScore}/100 (veto: ${panelRecheck.veto})`);
            savedPanelResult = panelRecheck;
            stats.criticPanel = tagEval({
              overallScore: panelRecheck.overallScore,
              dimensions: panelRecheck.dimensions,
              veto: panelRecheck.veto,
              vetoReasons: panelRecheck.vetoReasons,
              costUsd: panelRecheck.costUsd,
              durationMs: panelRecheck.durationMs ?? 0,
            }, 'analysis');
          }
        } catch (rpErr) {
          console.warn(`${label} PANEL RE-CHECK failed (non-blocking):`, rpErr);
        }
      } else {
        console.log(`${label} CRITIC REPAIR: retry lost citations (${origCitations} → ${repCitations}) — keeping original`);
      }
      emitProgress(pipelineRunId, "ANALYST", "completed", `Critic repair complete`);
    } catch (err) {
      console.warn(`${label} CRITIC REPAIR: failed (non-blocking):`, err);
    }
  }

  // ── CRITIC EVIDENCE TOOL (item 7): when the critic flags unsupported
  // claims, convert them into targeted evidence requests on the blackboard.
  // This gives the critic a real actuator — it can pull evidence, not just
  // complain about its absence. Consumed by processGapRequests below. ──
  if (savedCriticResult && !isBudgetConstrained() && orchState.iteration < orchState.maxIterations) {
    try {
      const unsupportedClaims = (savedCriticResult.claims || [])
        .filter((c: any) => c.verdict === 'unsupported')
        .slice(0, 3);
      const citationIssues = (savedCriticResult.citationIssues || [])
        .filter((i: any) => i.issue === 'missing' || i.issue === 'vague')
        .slice(0, 2);
      const evidenceTargets = [...unsupportedClaims.map((c: any) => c.text || ''),
                               ...citationIssues.map((i: any) => i.explanation || '')]
        .filter((t: string) => typeof t === 'string' && t.length > 20)
        .slice(0, 3);
      if (evidenceTargets.length > 0) {
        const { generateGapQueries } = await import('../gap-aware-append');
        const syntheticGaps = evidenceTargets.map((t: string) => ({
          section: 'unsupported_claim',
          coverage: 0,
          citationCount: 0,
          sentenceCount: 1,
          suggestedQuery: t.slice(0, 200),
        }));
        const queries = await generateGapQueries(query, syntheticGaps as any);
        let pushed = 0;
        for (const q of (queries || []).slice(0, 3)) {
          if (q && q.length > 10) {
            ctx.requestSourceGap(
              q.slice(0, 300),
              `Critic flagged unsupported claim: ${evidenceTargets[pushed]?.slice(0, 80) ?? 'evidence gap'}`,
              'CRITIC',
              ['openalex', 'crossref', 'semanticscholar', 'ssrn', 'linkup', 'jstor'],
              10,
            );
            pushed++;
          }
        }
        if (pushed > 0) {
          console.log(`${label} CRITIC EVIDENCE TOOL: ${pushed} targeted evidence requests queued from unsupported claims`);
          stats.criticEvidenceRequests = pushed;
        }
      }
    } catch (err) {
      console.warn(`${label} CRITIC EVIDENCE TOOL: failed (non-blocking):`, err);
    }
  }

  // ── OUTLINE CRITIC (WebWeaver ICLR 2026): critique the analysis STRUCTURE
  // before rendering. The claim-level critic asks "are these claims true?";
  // the outline critic asks "did we investigate the right dimensions?".
  // Missing dimensions become targeted retrieval requests on the blackboard. ──
  if (!isBudgetConstrained() && orchState.iteration < orchState.maxIterations) {
    try {
      const { critiqueOutline } = await import('../outline-critic');
      const outlineResult = await critiqueOutline(query, analysis, topSources.length);
      if (outlineResult) {
        addCost(outlineResult.costUsd, 'OUTLINE_CRITIC');
        stats.outlineCritic = {
          coverageScore: outlineResult.coverageScore,
          missingDimensions: outlineResult.missingDimensions,
          weakSections: outlineResult.weakSections,
          queriesEmitted: outlineResult.targetedQueries.length,
          rationale: outlineResult.rationale,
        };
        console.log(`${label} OUTLINE CRITIC: coverage ${outlineResult.coverageScore}/100 — ${outlineResult.missingDimensions.length} missing dimensions, ${outlineResult.targetedQueries.length} queries`);

        // Low structural coverage → push targeted retrieval requests
        if (outlineResult.coverageScore < 70 && outlineResult.targetedQueries.length > 0) {
          for (const q of outlineResult.targetedQueries.slice(0, 3)) {
            ctx.requestSourceGap(
              q.slice(0, 300),
              `Missing dimension: ${outlineResult.missingDimensions[0] ?? 'structural coverage gap'}`,
              'OUTLINE_CRITIC',
              ['openalex', 'crossref', 'semanticscholar', 'ssrn', 'jstor', 'internet-archive', 'linkup'],
              12,
            );
          }
          ctx.addFinding('OUTLINE_CRITIC', 'gap',
            `Structural coverage ${outlineResult.coverageScore}/100 — missing: ${outlineResult.missingDimensions.slice(0, 3).join('; ')}`);
        }
      }
    } catch (err) {
      console.warn(`${label} OUTLINE CRITIC: failed (non-blocking):`, err);
    }
  }

  // Second consumption round — critic evidence requests + outline-critic queries.
  // The processor mutates the shared state (re-analysis, budget, source pool) —
  // refresh the local copies so CoVe and the return value see the current artifact.
  await processGapRequests('CRITIC/OUTLINE');
  analysis = deps.state.analysis;
  reAnalysisBudget = deps.state.reAnalysisBudget;

  // SELF-CORRECT CHECKPOINT: CRITIC
  try {
    const criticScore = (stats.critic as any)?.overallScore;
    const criticVerdict = (stats.critic as any)?.verdict;
    if (typeof criticScore === 'number') {
      const cpResult = await selfCorrector.checkpoint(
        'critic',
        `Critic verdict: ${criticVerdict}, score: ${criticScore}, contradictions: ${(stats.critic as any)?.contradictions ?? 0}, biases: ${(stats.critic as any)?.biases ?? 0}`,
        [
          {
            id: 'critic_verifier',
            check: () => {
              if (criticVerdict === 'reject') {
                return { verifierId: 'critic_verifier', verdict: 'escalate' as const, score: criticScore / 100, reasons: [`Critic rejected analysis (score ${criticScore}/100) — consider re-running with different sources`] };
              }
              if (criticScore < 50) {
                return { verifierId: 'critic_verifier', verdict: 'retry' as const, score: criticScore / 100, reasons: [`Critic score ${criticScore}/100 is low — check contradictions and bias flags`] };
              }
              return { verifierId: 'critic_verifier', verdict: 'pass' as const, score: criticScore / 100, reasons: [] };
            },
          },
        ],
        criticScore / 100,
      );
      if (cpResult.cascadeDetected) {
        console.warn(`${label} SELF-CORRECT: CASCADE detected at CRITIC — severity=${cpResult.score.toFixed(2)}, drift=${cpResult.drift.toFixed(3)}`);
        (stats as any).selfCorrect = { ...((stats as any).selfCorrect ?? {}), criticCheckpoint: cpResult, cascadeDetected: true };
      }
    }
  } catch (scErr) {
    console.warn(`${label} SELF-CORRECT: CRITIC checkpoint failed (non-blocking):`, scErr);
  }

  // S14-H: Chain-of-Verification (CoVe — Meta ACL 2024) — extract claims and generate
  // verification questions for diagnostic purposes. The questions are logged to
  // provide transparency into what should be verified. Full execution (search + NLI)
  // is handled by the existing NLI verifier and claim-grounding layers.
  if (isStrategic) {
    try {
      const { extractClaims, planVerificationQuestions } = await import('../chain-verification');
      const analysisText = typeof analysis === 'string' ? analysis : (analysis as any)?.html ?? JSON.stringify(analysis);
      const { claims, costUsd: extractCost } = await extractClaims(analysisText.slice(0, 6000));
      if (claims.length > 0) {
        const { questions, costUsd: planCost } = await planVerificationQuestions(claims.slice(0, 10), {
          searchFn: async () => ({ sourceIds: [], found: 0 }),
          maxClaims: 10,
          maxQuestionsPerClaim: 2,
          verifyThreshold: 0.7,
        });
        addCost(extractCost + planCost, 'COVE (claim extraction + question planning)');
        console.log(`${label} COVE: extracted ${claims.length} claims, generated ${questions.length} verification questions`);
        stats.chainVerification = { claimsExtracted: claims.length, questionsGenerated: questions.length };
      }
    } catch (coveErr) {
      console.warn(`${label} COVE: failed (non-blocking):`, coveErr instanceof Error ? coveErr.message : String(coveErr));
    }
  }

  return { analysis, reAnalysisBudget, savedCriticResult };
}
