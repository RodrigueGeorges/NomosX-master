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
      const loopCitedSources = new Set<number>();
      for (const m of ctx.html.matchAll(/\[SRC-(\d+)\]/g)) loopCitedSources.add(parseInt(m[1], 10));
      for (const m of ctx.html.matchAll(/data-evidence="E(\d+)"/g)) loopCitedSources.add(parseInt(m[1], 10));
      for (const m of ctx.html.matchAll(/href="#ref-(\d+)"/g)) loopCitedSources.add(parseInt(m[1], 10));
      const loopCoverageTarget = Math.min(40, Math.max(15, Math.ceil(topSources.length * 0.35)));
      const loopCitationCoverage = loopCoverageTarget > 0 ? Math.min(1, loopCitedSources.size / loopCoverageTarget) : 0;
      const loopGroundedness = loopGrounding.groundedness;

      const loopFactIntegrity = (stats.factChecker as any)?.integrityScore ?? 80;
      const loopNliIntegrity = stats.citationVerifier?.integrity ?? 80;
      const loopDiversityScore = Math.min(100, new Set(topSources.map((s: any) => s.provider)).size * 15);
      const loopAvgQuality = topSources.length > 0
        ? topSources.reduce((sum: number, s: any) => sum + (s.qualityScore || 0), 0) / topSources.length
        : 50;

      let loopTrustScore = Math.round(
        loopCitationCoverage * 25 +
        loopGroundedness * 20 +
        (loopFactIntegrity / 100) * 15 +
        (loopNliIntegrity / 100) * 15 +
        (loopDiversityScore / 100) * 10 +
        (loopAvgQuality / 100) * 15
      );

      // Quality floor
      if (loopAvgQuality > 80 && loopCitationCoverage > 0.60) {
        loopTrustScore = Math.max(loopTrustScore, 60);
      }
      // Grounding veto
      if (loopGroundedness < 0.15) {
        loopTrustScore = Math.min(loopTrustScore, 45);
      }
      if (loopGroundedness >= 0.15 && loopGroundedness < 0.40) {
        loopTrustScore = Math.min(loopTrustScore, 55);
      }

      // ── VETO PARITY — the loop must not bypass the deterministic vetoes ──
      // Without this, the quality loop inflated 45→75 while the critic veto
      // had capped at 50 (confidence-inflation cascade flagged by SelfCorrect).
      // P0/1: vetoes only apply to evaluations attached to the CURRENT artifact
      // — a verdict on a replaced artifact (post-sweep/loop mutations) is invalid.
      ctx.collectStaleEvaluations();
      const loopCriticScore = stats.critic?.stale ? null : (stats.critic?.overallScore ?? null);
      const loopCriticVerdict = stats.critic?.stale ? null : (stats.critic?.verdict ?? null);
      const loopSymbolicScore = stats.symbolicVerifier?.score ?? 100;
      const loopSymbolicFailed = stats.symbolicVerifier?.failed ?? 0;
      const loopProviderDiversity = new Set(topSources.map((s: any) => s.provider)).size;

      if (loopSymbolicFailed > 0 && loopSymbolicScore < 70) {
        loopTrustScore = Math.min(loopTrustScore, 55);
        console.log(`${label_} QUALITY LOOP: symbolic veto reapplied (cap 55)`);
      }
      if (loopCriticVerdict === 'reject') {
        loopTrustScore = Math.min(loopTrustScore, 50);
        console.log(`${label_} QUALITY LOOP: critic reject veto reapplied (cap 50)`);
      }
      if (loopCriticScore !== null && loopCriticScore < 10) {
        loopTrustScore = Math.min(loopTrustScore, 40);
      } else if (loopCriticScore !== null && loopCriticScore < 25) {
        loopTrustScore = Math.min(loopTrustScore, 55);
      } else if (loopCriticScore !== null && loopCriticScore < 60) {
        const penaltyPct = Math.round((60 - loopCriticScore) * 0.37);
        loopTrustScore = Math.round(loopTrustScore * (100 - penaltyPct) / 100);
      }
      if ((stats.sourceCheck as any)?.retracted > 0) {
        loopTrustScore = Math.min(loopTrustScore, 50);
      }
      if (loopNliIntegrity < 70) {
        loopTrustScore = Math.min(loopTrustScore, 55);
      }
      if ((stats as any).devilsAdvocateVeto && !(stats.devilsAdvocate as any)?.stale) {
        loopTrustScore = Math.min(loopTrustScore, 40);
      }
      if (loopProviderDiversity < 3) {
        loopTrustScore = Math.min(loopTrustScore, 60);
      }
      const loopHallScore = (stats as any).hallDetect?.score ?? 0;
      if (loopHallScore > 70) {
        loopTrustScore = Math.min(loopTrustScore, 50);
      }
      loopTrustScore = Math.min(100, Math.max(0, loopTrustScore));

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
