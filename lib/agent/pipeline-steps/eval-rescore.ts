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

export async function rescoreStaleAnalysisEvals(deps: EvalRescoreDeps): Promise<void> {
  const {
    stats, analysis, analysisArtifactVersion, query, detectedDomain,
    positioningBrief, topSources, readings, label,
    isBudgetConstrained, addCost, tagEval,
  } = deps;

  const staleKeys = staleAnalysisEvalKeys(stats, analysisArtifactVersion);
  if (staleKeys.length === 0 || isBudgetConstrained()) return;

  console.log(`${label} EVAL RE-SCORE: ${staleKeys.join(', ')} judged a replaced analysis (v${analysisArtifactVersion}) — re-scoring once`);

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

  for (const key of staleKeys) {
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
        const r = await runCritic(rescoreText, rescoreSources, { skipBias: false, skipContradictions: false });
        addCost(r.costUsd, 'CRITIC_RESCORE');
        stats.critic = tagEval({
          verdict: r.verdict, overallScore: r.overallScore,
          groundedness: r.groundedness, claimsCount: r.claims.length,
          contradictions: r.contradictions.length,
          contestedFindings: r.contestedFindings?.length ?? 0,
          biases: r.biases.length,
          citationIssues: r.citationIssues.length, stageResults: r.stageResults,
          costUsd: r.costUsd, durationMs: r.durationMs, rescoredPostMutation: true,
        }, 'analysis');
        deps.onCriticRescored?.(r);
        console.log(`${label} CRITIC RE-SCORE: →${r.overallScore}/100 (${r.verdict})`);
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
      console.warn(`${label} EVAL RE-SCORE ${key} failed (non-blocking):`, evalErr);
    }
  }
}
