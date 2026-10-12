/**
 * POST-RENDER QUALITY LOOP (Karpathy Loop pattern, inspired by Cortis).
 * Extracted from pipeline-v2.ts — identical semantics, unit-testable boundary.
 *
 * If trust score is below publication threshold after all quality gates,
 * retry citation repair + claim grounding with more aggressive settings.
 * This prevents HELD on reports that are just under the threshold (trust 55-64).
 * Cost: $0 (deterministic, CPU-only). Only 1 retry to avoid infinite loops.
 */

import type { TailStepContext } from './types';
import { computeTrustScore, countDistinctCitedSources } from './trust-score';

export async function runPostRenderQualityLoop(ctx: TailStepContext): Promise<void> {
  const { stats, topSources, readings, orchState, label } = ctx;
  const label_ = label;
  try {
    const currentTrust = stats.criticalLoop?.finalScore ?? 0;
    const currentGroundedness = stats.claimGrounding?.groundedness ?? 100;
    const PUBLISH_THRESHOLD = 65;
    const MIN_VIABLE_TRUST = 55;
    const GROUNDEDNESS_THRESHOLD = 80;

    if (currentTrust > 0 && (currentTrust < PUBLISH_THRESHOLD || currentGroundedness < GROUNDEDNESS_THRESHOLD)) {
      console.log(`${label_} QUALITY LOOP: trust ${currentTrust} < ${PUBLISH_THRESHOLD} or groundedness ${currentGroundedness}% < ${GROUNDEDNESS_THRESHOLD}% — retrying citation repair with aggressive settings`);

      // Retry 1: More aggressive citation repair (inject citations for ANY claim matching a source)
      const { repairCitations } = await import('../citation-repair');
      const aggressiveRepair = repairCitations(ctx.html, ctx.analysis, topSources);
      if (aggressiveRepair.citationsBackfilled + aggressiveRepair.citationsInjected > 0) {
        ctx.html = aggressiveRepair.html;
        ctx.bumpHtmlArtifact();
        console.log(`${label_} QUALITY LOOP: aggressive citation repair +${aggressiveRepair.citationsBackfilled} backfilled, +${aggressiveRepair.citationsInjected} injected`);
        // Update stats
        if (stats.citationRepair) {
          (stats.citationRepair as any).loopBackfilled = aggressiveRepair.citationsBackfilled;
          (stats.citationRepair as any).loopInjected = aggressiveRepair.citationsInjected;
        }
        // Re-apply evidence IDs to the newly injected citations so they get data-evidence="EN"
        // (repairCitations produces <sup> without data-evidence; replaceSrcWithEvidenceIds adds it)
        try {
          const { replaceSrcWithEvidenceIds } = await import('../evidence-registry');
          ctx.html = replaceSrcWithEvidenceIds(ctx.html, ctx.evidenceRegistry);
        } catch (eErr) {
          console.warn(`${label_} QUALITY LOOP: evidence ID re-application failed (non-blocking):`, eErr);
        }
      }

      // Re-run claim grounding on repaired HTML (NLI-enhanced)
      const { groundClaimsWithNLI } = await import('../claim-grounding');
      const loopGrounding = await groundClaimsWithNLI(ctx.html, topSources, { mode: 'remove', readings });
      if (loopGrounding.removedClaims > 0) {
        ctx.html = loopGrounding.html;
        ctx.bumpHtmlArtifact();
      }
      console.log(`${label_} QUALITY LOOP: re-grounding → ${loopGrounding.supported} supported, ${loopGrounding.unsupported} unsupported → groundedness ${Math.round(loopGrounding.groundedness * 100)}%`);
      stats.claimGrounding = ctx.tagEval({
        supported: loopGrounding.supported,
        partial: loopGrounding.partial,
        unsupported: loopGrounding.unsupported,
        uncited: loopGrounding.uncited,
        contradicted: loopGrounding.contradicted,
        groundedness: Math.round(loopGrounding.groundedness * 100),
        flagged: loopGrounding.removedClaims,
      }, 'html');

      // Re-calculate trust score with new grounding + coverage
      const loopCoverageTarget = Math.min(40, Math.max(15, Math.ceil(topSources.length * 0.35)));
      const loopCitationCoverage = loopCoverageTarget > 0 ? Math.min(1, countDistinctCitedSources(ctx.html) / loopCoverageTarget) : 0;
      const loopGroundedness = loopGrounding.groundedness;

      const loopFactIntegrity = (stats.factChecker as any)?.integrityScore ?? 80;
      const loopNliIntegrity = stats.citationVerifier?.integrity ?? 80;
      const loopSourceCheckIntegrity = (stats.sourceCheck as any)?.integrityScore ?? 85;
      const loopDiversityScore = Math.min(100, new Set(topSources.map((s: any) => s.provider)).size * 15);
      const loopAvgQuality = topSources.length > 0
        ? topSources.reduce((sum: number, s: any) => sum + ((s.qualityScore || 0) > 0 ? s.qualityScore : (s.sourceQuality?.overall || 0)), 0) / topSources.length
        : 50;

      // ── CANONICAL RE-SCORE — single arithmetic site (trust-score.ts). ──
      // The loop previously blended different weights and omitted the
      // criticPanel/editorial-floor vetoes — it could re-inflate a score the
      // canonical pass had capped. P0/1 preserved: vetoes only apply to
      // evaluations attached to the CURRENT artifact (stale → null).
      ctx.collectStaleEvaluations();
      const loopCriticScore = stats.critic?.stale ? null : (stats.critic?.overallScore ?? null);
      const loopCriticVerdict = stats.critic?.stale ? null : (stats.critic?.verdict ?? null);
      const loopPanel = stats.criticPanel?.stale ? null : (stats.criticPanel as any);
      const loopTrust = computeTrustScore(
        {
          citationCoverage: loopCitationCoverage,
          groundedness: loopGroundedness,
          factIntegrity: loopFactIntegrity,
          nliIntegrity: loopNliIntegrity,
          sourceCheckIntegrity: loopSourceCheckIntegrity,
          diversityScore: loopDiversityScore,
          avgQuality: loopAvgQuality,
          criticScore: loopCriticScore,
        },
        {
          criticVerdict: loopCriticVerdict,
          symbolicScore: stats.symbolicVerifier?.score ?? 100,
          symbolicFailed: stats.symbolicVerifier?.failed ?? 0,
          criticPanelVeto: loopPanel?.veto === true,
          criticPanelVetoReasons: loopPanel?.vetoReasons,
          editorialScore: (loopPanel?.dimensions ?? []).find((d: any) => d.dimension === 'editorial')?.score,
          retracted: (stats.sourceCheck as any)?.retracted,
          devilsAdvocateVeto: (stats as any).devilsAdvocateVeto === true && !(stats.devilsAdvocate as any)?.stale,
          providerDiversity: new Set(topSources.map((s: any) => s.provider)).size,
          hallDetectScore: (stats as any).hallDetect?.score ?? 0,
        },
      );
      const loopTrustScore = loopTrust.score;
      for (const vetoReason of loopTrust.vetoes) {
        console.log(`${label_} QUALITY LOOP: ${vetoReason} reapplied`);
      }

      const trustImprovement = loopTrustScore - currentTrust;
      console.log(`${label_} QUALITY LOOP: trust ${currentTrust} → ${loopTrustScore} (+${trustImprovement}) — coverage ${Math.round(loopCitationCoverage * 100)}%, groundedness ${Math.round(loopGroundedness * 100)}%`);

      // Update trust score in stats
      stats.criticalLoop = {
        ...(stats.criticalLoop as any),
        finalScore: loopTrustScore,
        needsHumanReview: loopTrustScore < MIN_VIABLE_TRUST,
        loopRetried: true,
        loopImprovement: trustImprovement,
      };
      orchState.trustScore = loopTrustScore;

      // Re-inject methodology note with updated trust score
      if (ctx.html.includes('Indice de confiance :')) {
        ctx.html = ctx.html.replace(
          /Indice de confiance : <strong>\d+\/100<\/strong>/,
          `Indice de confiance : <strong>${loopTrustScore}/100</strong>`
        );
      }

      stats.qualityLoop = {
        attempted: true,
        trustBefore: currentTrust,
        trustAfter: loopTrustScore,
        improvement: trustImprovement,
        citationsBackfilled: aggressiveRepair.citationsBackfilled,
        citationsInjected: aggressiveRepair.citationsInjected,
      };
    } else {
      stats.qualityLoop = { attempted: false, reason: `trust ${currentTrust} ≥ ${PUBLISH_THRESHOLD}` };
    }
  } catch (loopErr) {
    console.warn(`${label_} QUALITY LOOP: failed (non-blocking):`, loopErr);
    stats.qualityLoop = { attempted: true, error: String(loopErr) };
  }
}
