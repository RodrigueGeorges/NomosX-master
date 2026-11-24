// pipeline-steps/eval-rescore.ts — stale-verdict re-scoring.
//
// Any analysis mutation AFTER the evaluators ran (critic repair adoption,
// post-critic gap-fill re-analysis) leaves verdict-bearing evals attached to a
// replaced artifact. collectStaleEvaluations marks them stale →
// evaluation_freshness hard-fails the run regardless of quality — a
// systematic, infrastructure-induced HOLD cause.
//
// This step re-judges each stale analysis-tagged evaluator ONCE on the adopted
// analysis (~$0.05 total across critic + panel + structural). The gate then
// sees verdicts on the artifact actually being rendered, not a replaced draft.

import { recordDegradedStep } from '../degraded-steps';
export interface EvalRescoreDeps {
  stats: Record<string, any>;
  analysis: any;
  analysisArtifactVersion: number;
  query: string;
  detectedDomain: string;
  positioningBrief: {
    fieldCoverage: any;
    uncoveredDimensions: any;
    weakClaims: any;
    strongestPiece: any;
  } | null;
  topSources: any[];
  readings: any[];
  label: string;
  isBudgetConstrained: () => boolean;
  addCost: (usd: number | undefined, step: string) => void;
  tagEval: <T extends Record<string, any>>(entry: T, artifact: 'analysis' | 'html') => T;
  /** DA re-judge context — required only when a stale analysis-tagged
   *  devilsAdvocate verdict needs refreshing (same contract as the
   *  post-mission/post-repair rechecks in pipeline-v2). */
  isStrategic?: boolean;
  debateContext?: string;
  /** The critic result is also consumed downstream (repair instructions,
   * self-correct checkpoint) — returned so the caller can keep its local ref. */
  onCriticRescored?: (result: any) => void;
}

export const SPECULATIVE_OR_META_KEYS = new Set([
  '_meta', '_deliberationContext', '_harvardCouncil',
  'rejectedAlternatives', 'whatToWatch', 'trajectory',
  'evidenceAssessment', 'convictionLevel',
]);

/** Analysis-tagged evals whose verdicts feed the gate or the quality blend. */
const RESCORABLE_KEYS = ['critic', 'criticPanel', 'structuralEditor'] as const;

export function staleAnalysisEvalKeys(stats: Record<string, any>, currentVersion: number): string[] {
  return RESCORABLE_KEYS.filter(k => {
    const e = stats[k];
    return e && typeof e === 'object' && !e.error && !e.skipped
      && typeof e.artifactVersion === 'number' && e.artifactVersion !== currentVersion;
  });
}

/** Evals that crashed or returned incomplete — a transient provider failure
 *  hard-fails `evaluation_availability` regardless of artifact quality. The
 *  gate is a router: a fallen evaluator is re-invoked once on the live
 *  artifact. (`skipped` is excluded — a deliberate skip is not a failure.) */
export function failedAnalysisEvalKeys(stats: Record<string, any>): string[] {
  return RESCORABLE_KEYS.filter(k => {
    const e = stats[k];
    return e && typeof e === 'object' && !e.skipped
      && (e.error || e.evaluationComplete === false);
  });
}

export async function rescoreStaleAnalysisEvals(deps: EvalRescoreDeps): Promise<void> {
  const {
    stats, analysis, analysisArtifactVersion, query, detectedDomain,
    positioningBrief, topSources, readings, label,
    isBudgetConstrained, addCost, tagEval,
  } = deps;

  const staleKeys = staleAnalysisEvalKeys(stats, analysisArtifactVersion);
  const failedKeys = failedAnalysisEvalKeys(stats);
  const keys = [...new Set([...staleKeys, ...failedKeys])];
  if (keys.length === 0 || isBudgetConstrained()) return;

  console.log(`${label} EVAL RE-SCORE: ${[
    staleKeys.length ? `stale(${staleKeys.join(',')})` : null,
    failedKeys.length ? `errored(${failedKeys.join(',')})` : null,
  ].filter(Boolean).join(' + ')} — re-judging once on the live artifact (v${analysisArtifactVersion})`);

  const readingsById = new Map<string, any>(
    (Array.isArray(readings) ? readings : []).map((r: any) => [r.sourceId, r])
  );
  const rescoreSources = topSources.map((s: any, i: number) => ({
    index: i + 1,
    title: s.title || '',
    abstract: s.abstract || '',
    fullText: readingsById.get(s.id)?.extractedText || null,
    provider: s.provider || '',
    year: s.year || undefined,
  }));
  const fieldContext = positioningBrief ? {
    fieldCoverage: positioningBrief.fieldCoverage,
    uncoveredDimensions: positioningBrief.uncoveredDimensions,
    weakClaims: positioningBrief.weakClaims,
    strongestPiece: positioningBrief.strongestPiece,
  } : undefined;

  for (const key of keys) {
    try {
      if (key === 'critic') {
        const { runCritic } = await import('../critic-agent');
        const { criticReviewText } = await import('../analysis-repair');
        // Same preprocessing as the primary critic pass: strip
        // speculative/meta keys and normalize [E-N] → [SRC-N] so the
        // rescore judges the identical claim surface.
        const criticAnalysisObj = typeof analysis === 'string'
          ? JSON.parse(analysis)
          : { ...analysis };
        const filtered: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(criticAnalysisObj)) {
          if (!SPECULATIVE_OR_META_KEYS.has(k)) filtered[k] = v;
        }
        const rescoreText = criticReviewText(filtered).replace(/\[E(\d+)\]/g, '[SRC-$1]');
        const criticOpts = {
          skipBias: false, skipContradictions: false,
          thesisContext: [
            (stats as any)?.thesisBinding?.statement,
            (criticAnalysisObj as any)?.verdict,
            (criticAnalysisObj as any)?.throughLine,
          ].filter(Boolean).join('\n') || undefined,
        };
        const r = await runCritic(rescoreText, rescoreSources, criticOpts);
        addCost(r.costUsd, 'CRITIC_RESCORE');
        // Terminal-reject guard: a reject inside the terminal band (<20) on a
        // single fresh pass is fragile — run v9 flipped identical text
        // 43→15 purely on re-decomposition variance. When the previous
        // judgment was NOT a reject, spend one tie-break pass; majority of
        // {prior, rescore, tie} decides the recorded verdict.
        const priorVerdict = (stats.critic as any)?.verdict;
        let finalCritic = r;
        if (r.verdict === 'reject' && r.overallScore < 20 && priorVerdict && priorVerdict !== 'reject') {
          const tie = await runCritic(rescoreText, rescoreSources, criticOpts);
          addCost(tie.costUsd, 'CRITIC_TIEBREAK');
          const rejectVotes = [priorVerdict, r.verdict, tie.verdict].filter(v => v === 'reject').length;
          finalCritic = rejectVotes >= 2 ? r : tie;
          console.log(`${label} CRITIC TIE-BREAK: prior=${priorVerdict} rescore=reject(${r.overallScore}) tie=${tie.verdict}(${tie.overallScore}) → majority ${finalCritic.verdict}`);
        }
        stats.critic = tagEval({
          verdict: finalCritic.verdict, overallScore: finalCritic.overallScore,
          groundedness: finalCritic.groundedness, claimsCount: finalCritic.claims.length,
          contradictions: finalCritic.contradictions.length,
          contestedFindings: finalCritic.contestedFindings?.length ?? 0,
          biases: finalCritic.biases.length,
          citationIssues: finalCritic.citationIssues.length, stageResults: finalCritic.stageResults,
          costUsd: finalCritic.costUsd, durationMs: finalCritic.durationMs, rescoredPostMutation: true,
        }, 'analysis');
        deps.onCriticRescored?.(finalCritic);
        console.log(`${label} CRITIC RE-SCORE: →${finalCritic.overallScore}/100 (${finalCritic.verdict})`);
      } else if (key === 'criticPanel') {
        const { runCriticPanel } = await import('../critic-panel');
        const panelText = typeof analysis === 'string' ? analysis : JSON.stringify(analysis);
        const p = await runCriticPanel(panelText, query, { domain: detectedDomain, fieldContext });
        addCost(p.costUsd, 'PANEL_RESCORE');
        stats.criticPanel = tagEval({
          overallScore: p.overallScore,
          dimensions: p.dimensions.map((d: any) => ({
            dimension: d.dimension, score: d.score,
            findings: d.findings.slice(0, 4), mustFix: d.mustFix,
          })),
          veto: p.veto, vetoReasons: p.vetoReasons,
          costUsd: p.costUsd, durationMs: p.durationMs ?? 0, rescoredPostMutation: true,
        }, 'analysis');
        console.log(`${label} PANEL RE-SCORE: →${p.overallScore}/100 (veto=${p.veto})`);
      } else {
        const { structuralEditorReview } = await import('../structural-editor');
        const se = await structuralEditorReview(analysis, query);
        addCost(se.costUsd, 'STRUCTURAL_RESCORE');
        if (typeof se.overallStructure === 'number') {
          stats.structuralEditor = tagEval({
            overallStructure: se.overallStructure,
            narrativeArcValid: se.narrativeArcValid,
            sectionsWithIssues: se.sectionReviews?.filter((s: any) => s.issues?.length > 0).length || 0,
            logicalGaps: se.logicalGaps?.length || 0,
            suggestions: se.restructuringSuggestions?.length || 0,
            topSuggestions: se.restructuringSuggestions?.slice(0, 3) ?? [],
            topGaps: se.logicalGaps?.slice(0, 3) ?? [],
            topSectionIssues: se.sectionReviews
              ?.flatMap((s: any) => (s.issues ?? []).slice(0, 2).map((i: string) => `${s.sectionName}: ${i}`))
              .slice(0, 5) ?? [],
            costUsd: se.costUsd, rescoredPostMutation: true,
          }, 'analysis');
          console.log(`${label} STRUCTURAL RE-SCORE: →${se.overallStructure}/100`);
        }
      }
    } catch (evalErr) {
      recordDegradedStep(stats, `EVAL_RESCORE_${String(key).toUpperCase()}`, evalErr);
      console.warn(`${label} EVAL RE-SCORE ${key} failed (non-blocking):`, evalErr);
    }
  }

  // devilsAdvocate is deliberately NOT in RESCORABLE_KEYS (its failed/stale
  // semantics differ — an absent DA is not an availability failure), but a
  // STALE analysis-tagged DA verdict hits the same evaluation_freshness
  // hard-fail. Re-judge it once on the adopted analysis, same bounded cost
  // as the critic/panel rescores above.
  const da = stats.devilsAdvocate;
  const daStaleAnalysis = da && typeof da === 'object' && !da.error && !da.skipped
    && da.evaluatedArtifact === 'analysis'
    && typeof da.artifactVersion === 'number' && da.artifactVersion !== analysisArtifactVersion;
  if (daStaleAnalysis) {
    try {
      const { runDevilsAdvocate } = await import('../devils-advocate');
      const { buildAnalysisReviewText } = await import('../analysis-review-text');
      const reviewText = buildAnalysisReviewText(
        (typeof analysis === 'string' ? JSON.parse(analysis) : analysis) as Record<string, unknown>,
        query,
      );
      const reDa = await runDevilsAdvocate(query, reviewText, topSources.map((s: any) => ({
        title: s.title, provider: s.provider, year: s.year,
        excerpt: String(s.fullText ?? s.abstract ?? '').slice(0, 3000) || undefined,
      })), {
        mode: deps.isStrategic ? 'strategic' : 'brief',
        domain: detectedDomain,
        debateContext: deps.debateContext,
      });
      addCost(reDa.costUsd, 'DEVILS_ADVOCATE_RESCORE');
      const reDaFatal = reDa.fatalChallenges?.length ?? 0;
      stats.devilsAdvocate = tagEval({
        evaluationComplete: reDa.evaluationComplete,
        verdict: reDa.verdict,
        overallStrength: reDa.overallStrength,
        publishabilityScore: reDa.publishabilityScore,
        fatalChallenges: reDaFatal,
        majorChallenges: reDa.majorChallenges?.length ?? 0,
        killShot: reDa.killShot?.slice(0, 400) ?? '',
        topChallenges: [...(reDa.fatalChallenges || []), ...(reDa.majorChallenges || [])]
          .slice(0, 3)
          .map((c: any) => ({ type: c.challengeType || c.type || 'challenge', text: String(c.challenge || c.text || '').slice(0, 300) })),
        vulnerabilityTexts: (reDa.futureVulnerabilities || []).slice(0, 3).map((v: any) => String(v).slice(0, 200)),
        futureVulnerabilities: reDa.futureVulnerabilities?.length || 0,
        costUsd: reDa.costUsd,
        rescoredPostMutation: true,
      }, 'analysis');
      stats.devilsAdvocateVeto = reDa.verdict === 'reject'
        || (reDa.verdict === 'major_revision' && (reDa.overallStrength ?? 100) < 20);
      console.log(`${label} DA RE-SCORE: →publishability ${reDa.publishabilityScore}/100 (${reDa.verdict}) on v${analysisArtifactVersion}`);
    } catch (daErr) {
      recordDegradedStep(stats, 'EVAL_RESCORE_DA', daErr);
      console.warn(`${label} EVAL RE-SCORE devilsAdvocate failed (non-blocking):`, daErr);
    }
  }
}
