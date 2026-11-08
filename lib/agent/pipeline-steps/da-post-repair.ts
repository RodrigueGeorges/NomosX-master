/**
 * POST-REPAIR DA REFRESH — extracted from pipeline-v2.ts (Sprint 47).
 *
 * The quality loop / self-correct can materially rewrite html AFTER the
 * sweep's DA verdict (aggressive citation repair, re-grounding). A verdict
 * tagged to a replaced artifact version is stale → the gate's
 * evaluation_freshness hard-fails, i.e. every run that needed a repair
 * auto-HELD regardless of quality. Re-judge the corrected artifact ONCE
 * (bounded ~$0.03) so the gate sees a verdict on what actually ships.
 * A worse verdict legitimately re-imposes the veto — this re-evaluates
 * the standard, never relaxes it.
 */

export interface DaPostRepairDeps {
  label: string;
  query: string;
  html: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  topSources: any[];
  detectedDomain?: string;
  isStrategic: boolean;
  debateContext?: string;
  stats: Record<string, any>;
  htmlArtifactVersion: number;
  isBudgetConstrained: () => boolean;
  addCost: (usd: number, label: string) => void;
  tagEval: <T extends Record<string, any>>(entry: T, artifact: 'analysis' | 'html') => T;
}

export async function runDaPostRepairRecheck(deps: DaPostRepairDeps): Promise<void> {
  const {
    label, query, html, topSources, detectedDomain, isStrategic,
    debateContext, stats, htmlArtifactVersion, isBudgetConstrained, addCost, tagEval,
  } = deps;

  const daEval = stats.devilsAdvocate as Record<string, unknown> | undefined;
  const daStale = daEval && !daEval.error && daEval.evaluatedArtifact === 'html'
    && typeof daEval.artifactVersion === 'number' && daEval.artifactVersion !== htmlArtifactVersion;
  if (!daStale || stats.devilsAdvocatePostRepair || isBudgetConstrained()) return;

  try {
    const { runDevilsAdvocate } = await import('../devils-advocate');
    const recheck = await runDevilsAdvocate(
      query,
      html,
      topSources.map((s) => ({ title: s.title, provider: s.provider, year: s.year })),
      { mode: isStrategic ? 'strategic' : 'brief', domain: detectedDomain, debateContext },
    );
    addCost(recheck.costUsd, 'DEVILS_ADVOCATE_POSTREPAIR');
    const recheckFatal = recheck.fatalChallenges?.length ?? 0;
    const { daVetoStands } = await import('./da-veto');
    const vetoCheck = daVetoStands(
      { verdict: recheck.verdict, overallStrength: recheck.overallStrength, publishabilityScore: recheck.publishabilityScore, fatalChallenges: recheckFatal },
      { overallStrength: daEval?.overallStrength as number | undefined, fatalChallenges: daEval?.fatalChallenges as number | undefined, veto: stats.devilsAdvocateVeto === true },
    );
    const stillVetoWorthy = vetoCheck.stands;
    stats.devilsAdvocateVeto = stillVetoWorthy;
    stats.devilsAdvocatePostRepair = {
      verdict: recheck.verdict,
      overallStrength: recheck.overallStrength,
      publishabilityScore: recheck.publishabilityScore,
      fatalChallenges: recheckFatal,
      reason: 'stale_after_quality_tail',
      vetoReason: vetoCheck.reason,
      costUsd: recheck.costUsd,
    };
    stats.devilsAdvocate = tagEval({
      evaluationComplete: recheck.evaluationComplete,
      verdict: recheck.verdict,
      overallStrength: recheck.overallStrength,
      publishabilityScore: recheck.publishabilityScore,
      fatalChallenges: recheckFatal,
      majorChallenges: recheck.majorChallenges?.length ?? 0,
      killShot: recheck.killShot?.slice(0, 400) ?? '',
      topChallenges: [...(recheck.fatalChallenges || []), ...(recheck.majorChallenges || [])]
        .slice(0, 3)
        .map((c: any) => ({ type: c.challengeType || c.type || 'challenge', text: String(c.challenge || c.text || '').slice(0, 300) })),
      vulnerabilityTexts: (recheck.futureVulnerabilities || []).slice(0, 3).map((v: any) => String(v).slice(0, 200)),
      futureVulnerabilities: recheck.futureVulnerabilities?.length || 0,
      costUsd: recheck.costUsd,
    }, 'html');
    console.log(`${label} DA POST-REPAIR RECHECK: strength ${recheck.overallStrength}/100, fatal ${recheckFatal} — verdict refreshed on the corrected artifact (veto ${stillVetoWorthy ? 'STANDS' : 'not warranted'} — ${vetoCheck.reason})`);
  } catch (daErr) {
    console.warn(`${label} DA POST-REPAIR RECHECK failed (non-blocking):`, daErr);
  }
}
