/**
 * DEBATE (meta-analysis suppressed) + DEVIL'S ADVOCATE blocks.
 * Extracted from pipeline-v2.ts — identical semantics.
 *
 * These were closures capturing `runDebateStep`/`runDevilsAdvocateStep` flags
 * and writing to outer `debateResult`/`debateContext`. As steps they take the
 * flag as a call-time snapshot and RETURN the debate outputs — pipeline-v2
 * owns `debateResult`/`debateContext` because the arbiter and the render step
 * read them at call time, long after this block runs.
 */

import type { DebateResult } from '../debate-agent';
import { emitProgress } from '../pipeline-progress';
import { recordExperience } from '../knowledge-infrastructure';
import { recordDegradedStep } from '../degraded-steps';

export interface DebateAdvocateDeps {
  query: string;
  topSources: any[];
  readings: any[];
  detectedDomain?: string;
  isStrategic: boolean;
  label: string;
  stats: Record<string, any>;
  pipelineRunId: string;
  /** Live PipelineContext — the DA step posts `substance_weak` signals. */
  pipelineCtx: { postSignal: (...args: any[]) => void };
  addCost: (usd: number | undefined, step: string) => void;
  tagEval: <T extends Record<string, any>>(entry: T, artifact: 'analysis' | 'html') => T;
}

export interface DebateOutcome {
  debateResult?: DebateResult;
  debateContext?: string;
}

const debateContextOf = (d: DebateResult) => [
  `Debate dominant thesis: ${d.dominantThesis}`,
  `Counter-position: ${d.position2?.label || "N/A"}`,
  `Confidence in dominant: ${d.confidenceInDominant}/100`,
  `Steel-man already addressed: ${d.synthesis?.slice(0, 200) || "N/A"}`,
].join("\n");

export async function runDebateMetaBlock(
  deps: DebateAdvocateDeps,
  runDebate: boolean,
  debateHtmlContext?: string,
): Promise<DebateOutcome> {
  const { stats, label, query, topSources, readings, detectedDomain, pipelineRunId, addCost } = deps;
  // META-ANALYSIS + CHAIN PROBABILITY: SUPPRESSED — unreliable stats on heterogeneous sources, $0.05/run saved
  stats.metaAnalysis = { skipped: true, reason: 'suppressed — heterogeneous non-clinical sources' };
  if (!runDebate) {
    console.log(`${label} DEBATE: skipped (tier=standard)`);
    stats.debate = { skipped: true };
    return {};
  }
  // Debate-on-demand (SELENE SDI pattern, EACL 2026): skip the adversarial
  // debate when independent upstream evaluators already agree the analysis
  // is sound — confidence-likelihood aligned means debate adds little but
  // costs a full elenchus pass. Conservative: requires critic AND panel
  // AND trust all strong; DA still runs later as the hard adversarial gate.
  // Opt-in via NOMOSX_DEBATE_ON_DEMAND=1 — enabling changes recorded call
  // streams, so fixtures must be re-recorded before flipping in production.
  if (process.env.NOMOSX_DEBATE_ON_DEMAND === '1') {
    const critic = (stats.critic as any) ?? {};
    const panel = (stats.criticPanel as any) ?? {};
    const aligned =
      Number(critic.overallScore) >= 70 &&
      Number(critic.groundedness) >= 80 &&
      critic.verdict !== 'reject' &&
      Number(panel.overallScore) >= 65 &&
      Number((stats as any).trustScore ?? (stats as any).deterministicTrust?.score ?? 0) >= 55;
    if (aligned) {
      console.log(`${label} DEBATE: skipped (on-demand — critic=${critic.overallScore}, panel=${panel.overallScore}, signals aligned)`);
      stats.debate = { skipped: true, reason: 'on_demand_aligned' };
      return {};
    }
    console.log(`${label} DEBATE: running — signals not aligned (critic=${critic.overallScore ?? 'n/a'}, panel=${panel.overallScore ?? 'n/a'})`);
  }
  emitProgress(pipelineRunId, "DEBATE", "started", "Running debate...");
  console.log(`${label} DEBATE: running (meta-analysis suppressed)`);
  const [debateSettled] = await Promise.allSettled([
    import('../debate-agent').then(m => m.debateAgent(query, topSources, readings, debateHtmlContext, { domain: detectedDomain })),
  ]);

  if (debateSettled.status !== "fulfilled") {
    console.warn(`${label} DEBATE: failed (non-blocking):`, debateSettled.reason);
    recordDegradedStep(stats, 'DEBATE', debateSettled.reason);
    return {};
  }

  const debate = debateSettled.value;
  let debateResult = debate;
  let debateContext = debateContextOf(debate);
  stats.debate = {
    confidenceInDominant: debate.confidenceInDominant,
    steelManStrength: String(debate.debateQuality.steelManStrength),
    nuances: debate.nuances?.length ?? 0,
    costUsd: debate.costUsd,
  };
  console.log(`${label} DEBATE: confidence=${debate.confidenceInDominant}%, steel-man=${debate.debateQuality.steelManStrength}`);
  addCost(debate.costUsd, "DEBATE");

  // P1-F: Debate quality gate (D3 EACL 2026 pattern)
  // If steel-man strength < 50, the adversarial testing was weak.
  // Re-run with a more aggressive prompt to get a stronger counter-position.
  const steelManScore = Number(debate.debateQuality.steelManStrength) || 0;
  if (steelManScore < 50) {
    console.log(`${label} DEBATE: steel-man strength ${steelManScore} < 50 — re-running with adversarial boost`);
    try {
      const [retrySettled] = await Promise.allSettled([
        import('../debate-agent').then(m => m.debateAgent(query, topSources, readings, debateHtmlContext + '\n\nADVERSARIAL BOOST: The previous steel-man was too weak. Generate a MUCH stronger counter-position. Attack every assumption. Find the weakest link in the dominant thesis.', { domain: detectedDomain })),
      ]);
      if (retrySettled.status === "fulfilled") {
        const retryDebate = retrySettled.value;
        const retrySteelMan = Number(retryDebate.debateQuality.steelManStrength) || 0;
        if (retrySteelMan > steelManScore) {
          console.log(`${label} DEBATE: retry improved steel-man ${steelManScore} → ${retrySteelMan}, accepting retry`);
          debateResult = retryDebate;
          debateContext = debateContextOf(retryDebate);
          stats.debate = {
            confidenceInDominant: retryDebate.confidenceInDominant,
            steelManStrength: String(retryDebate.debateQuality.steelManStrength),
            nuances: retryDebate.nuances?.length ?? 0,
            costUsd: debate.costUsd + retryDebate.costUsd,
          };
          addCost(retryDebate.costUsd, "DEBATE_RETRY");
        } else {
          console.log(`${label} DEBATE: retry did not improve steel-man (${retrySteelMan} ≤ ${steelManScore}), keeping original`);
        }
      }
    } catch (retryErr) {
      console.warn(`${label} DEBATE: retry failed (non-blocking):`, retryErr);
      recordDegradedStep(stats, 'DEBATE_RETRY', retryErr);
    }
  }
  // R2-MAD debate memory: bank the outcome so future debates on related
  // questions see whether this thesis pattern already survived (or failed)
  // adversarial testing. Success metric = confidence in the dominant
  // thesis; the pattern carries the steel-man verdict for calibration.
  try {
    const final = debateResult ?? debate;
    recordExperience(
      query.slice(0, 100),
      query,
      'debate',
      `Debate: confidence=${final.confidenceInDominant}%, steelMan=${final.debateQuality?.steelManStrength}, evidenceBalance=${final.debateQuality?.evidenceBalance}`,
      `${String(final.dominantThesis ?? '').slice(0, 200)} [steel-man ${final.debateQuality?.steelManStrength}/100]`,
      Math.min(1, Math.max(0, (final.confidenceInDominant ?? 50) / 100)),
      `domain=${detectedDomain ?? 'general'}; steel-man strength ${final.debateQuality?.steelManStrength}/100`,
    );
  } catch { /* memory write is advisory */ }
  return { debateResult, debateContext };
}

export async function runDevilsAdvocateBlock(
  deps: DebateAdvocateDeps,
  runDevilsAdvocate: boolean,
  contentForReview: string,
  debateContext?: string,
  /** Which artifact the content actually is — the staleness tracker compares
   * the verdict against THAT artifact's version. Pass 'html' when the DA is
   * judging rendered HTML: post-verdict repairs (quality loop, grounding)
   * then correctly stale the verdict instead of leaving it frozen-fresh. */
  artifact: 'analysis' | 'html' = 'analysis',
): Promise<void> {
  const { stats, label, query, topSources, detectedDomain, isStrategic, pipelineRunId, pipelineCtx, addCost, tagEval } = deps;
  // DEVIL'S ADVOCATE — all formats (like positioning since S21).
  // Runs as ADVISORY epistemic challenge — identifies fatal challenges,
  // kill shots, and future vulnerabilities. Does NOT modify trust score
  // (deterministic) except the documented veto below. Briefs need the
  // adversarial check too: a short piece can still carry a killable claim.
  if (!runDevilsAdvocate) {
    stats.devilsAdvocate = { skipped: true, reason: 'disabled by LAS gate' };
    console.log(`${label} DEVIL'S ADVOCATE: skipped (LAS gate)`);
    return;
  }
  emitProgress(pipelineRunId, "DEVILS_ADVOCATE", "started", "Adversarial epistemic challenge...");
  try {
    const { runDevilsAdvocate } = await import('../devils-advocate');
    const daResult = await runDevilsAdvocate(
      query,
      contentForReview,
      topSources.map((s: any) => ({ title: s.title, provider: s.provider, year: s.year })),
      {
        mode: isStrategic ? 'strategic' : 'brief',
        domain: detectedDomain,
        debateContext,
      },
    );
    stats.devilsAdvocate = tagEval({
      verdict: daResult.verdict,
      evaluationComplete: daResult.evaluationComplete,
      overallStrength: daResult.overallStrength,
      publishabilityScore: daResult.publishabilityScore,
      fatalChallenges: daResult.fatalChallenges?.length || 0,
      majorChallenges: daResult.majorChallenges?.length || 0,
      killShot: daResult.killShot?.slice(0, 400) || '',
      // Keep the actual challenge texts — the adversarial review is rendered
      // as an editorial section, not just a counter in stats.
      topChallenges: [...(daResult.fatalChallenges || []), ...(daResult.majorChallenges || [])]
        .slice(0, 3)
        .map((c: any) => ({ type: c.challengeType || c.type || 'challenge', text: String(c.challenge || c.text || '').slice(0, 300) })),
      vulnerabilityTexts: (daResult.futureVulnerabilities || []).slice(0, 3).map((v: any) => String(v).slice(0, 200)),
      futureVulnerabilities: daResult.futureVulnerabilities?.length || 0,
      costUsd: daResult.costUsd,
    }, artifact);
    addCost(daResult.costUsd, "DEVILS_ADVOCATE");
    console.log(`${label} DEVIL'S ADVOCATE: verdict=${daResult.verdict}, strength=${daResult.overallStrength}/100, fatal=${daResult.fatalChallenges?.length || 0}, major=${daResult.majorChallenges?.length || 0}`);

    // Emit adversarial objections as signals — resolvers (revision editor)
    // sense them at the post-render sweep, no hardcoded wiring needed.
    for (const c of [...(daResult.fatalChallenges || []), ...(daResult.majorChallenges || [])].slice(0, 4)) {
      pipelineCtx.postSignal('substance_weak', String(c.challenge || '').slice(0, 300), {
        postedBy: 'DEVILS_ADVOCATE',
        intensity: c.severity === 'fatal' ? 0.95 : 0.7,
        ttlMs: 60 * 60 * 1000,
        payload: { type: c.challengeType, requiredAction: c.requiredAction, suggestedRevision: c.suggestedRevision },
      });
    }
    emitProgress(pipelineRunId, "DEVILS_ADVOCATE", "completed", `Verdict: ${daResult.verdict} (${daResult.overallStrength}/100)`);

    // Devil's Advocate veto: if MAJOR_REVISION with strength < 20, cap trust at 40
    if (daResult.verdict === 'major_revision' && daResult.overallStrength < 20) {
      (stats as any).devilsAdvocateVeto = true;
      console.warn(`${label} DEVIL'S ADVOCATE VETO: verdict=major_revision, strength=${daResult.overallStrength}/100 — analysis is fragile, trust will be capped at 40`);
    }
  } catch (err) {
    console.warn(`${label} DEVIL'S ADVOCATE: failed (non-blocking):`, err);
    recordDegradedStep(stats, 'DEVILS_ADVOCATE', err);
    stats.devilsAdvocate = { error: String(err) };
  }
}
