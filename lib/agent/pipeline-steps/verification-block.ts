/**
 * POST-RENDER VERIFICATION block: symbolic verifier → NLI citation verifier →
 * active repair loop → LLM deep-check → fact-checker (+ fatal sanitization).
 * Extracted from pipeline-v2.ts — identical semantics.
 *
 * Returns the (possibly repaired) HTML. Repairs bump the html artifact
 * version through the injected `bumpHtmlArtifact`; every evaluator result is
 * tagged via `tagEval` so stale verdicts stay detectable (Sprint 28).
 */

import { verifyCitations, repairWithInnovations } from '../citation-verifier';

export interface VerificationBlockDeps {
  html: string;
  analysis: Record<string, any>;
  topSources: any[];
  readings: any[];
  stats: Record<string, any>;
  label: string;
  bumpHtmlArtifact: () => void;
  tagEval: <T extends Record<string, any>>(entry: T, artifact: 'analysis' | 'html') => T;
  /** When true the paid fact-repair revision edit is skipped (legacy sanitize only). */
  isBudgetConstrained?: () => boolean;
  addCost?: (usd: number | undefined, step: string) => void;
}

export async function runVerificationBlock(deps: VerificationBlockDeps): Promise<string> {
  const { analysis, topSources, readings, stats, label, bumpHtmlArtifact, tagEval } = deps;
  let html = deps.html;

  // Opposite-family rule: verifiers must run on a DIFFERENT LLM family than the
  // one that produced the analysis text (anti blind-spot). Extract producer
  // family from either analyst format (multipass._meta or strategic._producerFamily).
  const producerFamily =
    (analysis as any)?._meta?.producerFamily ??
    (analysis as any)?._producerFamily ??
    undefined;

  // S14-A: Symbolic verification (NSRSA 2026) — deterministic, free, catches arithmetic/temporal/comparative errors
  try {
    const { verifySymbolically } = await import('../symbolic-verifier');
    const symbolicResult = verifySymbolically(html);
    if (symbolicResult.failed > 0) {
      console.log(`${label} SYMBOLIC VERIFY: ${symbolicResult.passed} passed, ${symbolicResult.failed} failed (score ${symbolicResult.score}%)`);
      stats.symbolicVerifier = tagEval({
        score: symbolicResult.score,
        passed: symbolicResult.passed,
        failed: symbolicResult.failed,
        flagged: symbolicResult.flagged.length,
      }, 'html');
    } else if (symbolicResult.passed > 0) {
      console.log(`${label} SYMBOLIC VERIFY: ${symbolicResult.passed} checks passed, 0 failed`);
      stats.symbolicVerifier = tagEval({ score: 100, passed: symbolicResult.passed, failed: 0, flagged: 0 }, 'html');
    }
  } catch (symErr) {
    console.warn(`${label} SYMBOLIC VERIFY: failed (non-blocking):`, symErr);
  }

  console.log(`${label} CITATION VERIFIER: NLI semantic check`);
  try {
    // P1.3: Use NLI verifier as primary (fast, free) — falls back to LLM for flagged claims
    const { verifyCitationsNLI } = await import('../nli-verifier');
    const verification = await verifyCitationsNLI(html, topSources, {
      maxConcurrency: 10,
      maxClaims: 80,
      readings,
    });
    stats.citationVerifier = tagEval({
      integrity: verification.overallIntegrity,
      supported: verification.supported,
      flagged: verification.flaggedClaims.length,
    }, 'html');
    console.log(`${label} CITATION VERIFIER: NLI integrity ${verification.overallIntegrity}% (${verification.flaggedClaims.length} flagged)`);

    // ── ACTIVE REPAIR LOOP — runs FIRST, before the slow LLM deep-check ──
    // If integrity is below 85%, actively repair using CiteGuard (replace bad citations)
    // and FRANQ (remove hallucinations, add missing citations). Loop until quality is met.
    // This runs BEFORE the LLM deep-check because:
    // 1. NLI is fast and free — we have the result immediately
    // 2. Active repair is also fast (deterministic HTML edits + targeted LLM calls)
    // 3. LLM deep-check is slow (30+ kimi calls, ~5 min) — only run if repair wasn't enough
    const currentIntegrity = stats.citationVerifier?.integrity ?? 100;
    if (currentIntegrity < 85) {
      console.log(`${label} ACTIVE REPAIR: integrity ${currentIntegrity}% < 85% — launching repair loop (CiteGuard + FRANQ + NLI)`);
      try {
        // Pass NLI flagged claims directly to the repair function for immediate correction
        const nliFlagged = verification.flaggedClaims.map((fc: any) => ({
          srcIndex: fc.srcIndex,
          claim: fc.claim,
          verdict: fc.verdict,
          sourceTitle: fc.sourceTitle || '',
          explanation: fc.explanation || '',
        }));
        const repairResult = await repairWithInnovations(
          html,
          topSources.map((s: any) => ({
            id: s.id || s.doi || s.url || '',
            title: s.title || '',
            abstract: typeof s.abstract === 'string' ? s.abstract : '',
            fullText: typeof s.fullText === 'string' ? s.fullText : '',
          })),
          currentIntegrity,
          { minIntegrity: 85, maxIterations: 3, removeHallucinations: true, replaceMisattributed: true },
          nliFlagged,
        );
        // P0-A FIX: Always propagate integrity, even if HTML didn't change.
        // The re-verification inside the repair loop may show a different
        // integrity than the initial value (e.g. NLI thresholds changed,
        // or the re-verification is more lenient). Failing to propagate
        // leaves a stale integrity in stats, which then flows into the
        // trust score calculation.
        if (repairResult.html !== html) {
          html = repairResult.html;
          bumpHtmlArtifact();
        }
        // Always update integrity — the repair loop re-verifies internally
        // (re-verified post-repair html → tagged with the bumped version)
        stats.citationVerifier = tagEval({
          integrity: repairResult.integrityAfter,
          supported: stats.citationVerifier?.supported ?? 0,
          flagged: Math.max(0, (stats.citationVerifier?.flagged ?? 0) - repairResult.citationsReplaced - repairResult.hallucinationsRemoved),
        }, 'html');
        stats.activeRepair = {
          iterations: repairResult.iterations,
          citationsReplaced: repairResult.citationsReplaced,
          hallucinationsRemoved: repairResult.hallucinationsRemoved,
          citationsAdded: repairResult.citationsAdded,
          hedgesInjected: repairResult.hedgesInjected,
          integrityBefore: repairResult.integrityBefore,
          integrityAfter: repairResult.integrityAfter,
          qualityThresholdMet: repairResult.qualityThresholdMet,
        };
        console.log(`${label} ACTIVE REPAIR: ${repairResult.integrityBefore}% → ${repairResult.integrityAfter}% (${repairResult.iterations} iterations, ${repairResult.citationsReplaced} citations replaced, ${repairResult.hallucinationsRemoved} hallucinations removed, ${repairResult.citationsAdded} citations added)`);
        if (repairResult.qualityThresholdMet) {
          console.log(`${label} ACTIVE REPAIR: ✅ Quality threshold met (${repairResult.integrityAfter}% >= 85%)`);
        } else {
          console.warn(`${label} ACTIVE REPAIR: ⚠️ Quality threshold NOT met after ${repairResult.iterations} iterations (${repairResult.integrityAfter}% < 85%) — will try LLM deep-check`);
        }
      } catch (repairErr) {
        console.warn(`${label} ACTIVE REPAIR: failed (non-blocking):`, repairErr);
      }
    }

    // LLM deep-check — only if integrity is still low after active repair
    // (previously ran unconditionally, consuming 5+ minutes of budget)
    const postRepairIntegrity = stats.citationVerifier?.integrity ?? 100;
    if (postRepairIntegrity < 85 && verification.flaggedClaims.length > 5 && verification.flaggedClaims.length < 30) {
      console.log(`${label} CITATION VERIFIER: LLM deep-check on ${verification.flaggedClaims.length} flagged claims (post-repair integrity still ${postRepairIntegrity}%)`);
      try {
        const llmVerification = await verifyCitations(html, topSources, { maxConcurrency: 8, maxClaims: 30, producerFamily, readings });
        // Use LLM result if it found fewer issues (NLI is more aggressive)
        if (llmVerification.overallIntegrity > postRepairIntegrity) {
          stats.citationVerifier = tagEval({
            integrity: llmVerification.overallIntegrity,
            supported: llmVerification.supported,
            flagged: llmVerification.flaggedClaims.length,
          }, 'html');
          console.log(`${label} CITATION VERIFIER: LLM corrected integrity to ${llmVerification.overallIntegrity}%`);
        }
      } catch (llmErr) {
        console.warn(`${label} CITATION VERIFIER: LLM fallback failed, keeping NLI result`, llmErr);
      }
    } else if (postRepairIntegrity >= 85) {
      console.log(`${label} CITATION VERIFIER: skipping LLM deep-check (integrity ${postRepairIntegrity}% >= 85% after active repair)`);
    }
  } catch (err) {
    console.warn(`${label} CITATION VERIFIER: NLI failed, falling back to LLM:`, err);
    try {
      const verification = await verifyCitations(html, topSources, { maxConcurrency: 8, maxClaims: 50, producerFamily, readings });
      stats.citationVerifier = tagEval({
        integrity: verification.overallIntegrity,
        supported: verification.supported,
        flagged: verification.flaggedClaims.length,
      }, 'html');
      console.log(`${label} CITATION VERIFIER: LLM integrity ${verification.overallIntegrity}%`);
    } catch (llmErr) {
      console.warn(`${label} CITATION VERIFIER: LLM also failed (non-blocking):`, llmErr);
    }
  }

  try {
    const { factChecker } = await import('../fact-checker');
    const runFactCheckPass = async (htmlToCheck: string) => {
      const r = await factChecker(htmlToCheck, topSources, producerFamily, readings);
      stats.factChecker = tagEval({
        totalClaims: r.totalClaims,
        verified: r.verified,
        majorIssues: r.majorIssues,
        fatalIssues: r.fatalIssues,
        integrityScore: r.integrityScore,
        citance: r.citance
          ? {
              total: r.citance.total,
              supported: r.citance.supported,
              contradicted: r.citance.contradicted,
              nei: r.citance.nei,
              supportRate: r.citance.supportRate,
              evaluationComplete: r.citance.evaluationComplete,
            }
          : undefined,
      }, 'html');
      return r;
    };
    const factResult = await runFactCheckPass(html);
    console.log(`${label} FACT-CHECKER: ${factResult.totalClaims} claims, ${factResult.verified} verified, ${factResult.majorIssues} major, ${factResult.fatalIssues} fatal → integrity ${factResult.integrityScore}%`);
    if (factResult.fatalIssues > 0) {
      console.error(`${label} FACT-CHECKER: ${factResult.fatalIssues} FATAL numerical discrepancies detected — repairing/sanitizing HTML`);
      stats.factCheckerFatalFlagged = true;

      // Reconciliation (Sprint 42): a mutation that REPLACES the html orphans
      // the factChecker/citationVerifier/symbolicVerifier evals tagged to the
      // pre-mutation version — evaluation_freshness hard-fails with no rescore
      // path (rescoreStaleAnalysisEvals only covers analysis-tagged evals).
      // Re-verify the artifact actually persisted (fact-checker once, the free
      // verifiers unconditionally); a re-check failure keeps the eval stale —
      // an unverifiable artifact must not pass on its pre-mutation verdict.
      const reverifyAfterMutation = async (reason: string): Promise<{ fatalIssues: number; integrityScore: number } | null> => {
        let recheckResult: { fatalIssues: number; integrityScore: number } | null = null;
        try {
          const recheck = await runFactCheckPass(html);
          recheckResult = { fatalIssues: recheck.fatalIssues, integrityScore: recheck.integrityScore };
          console.log(`${label} FACT-CHECKER RECHECK (${reason}): integrity ${recheck.integrityScore}% (${recheck.fatalIssues} fatal remain)`);
        } catch (recheckErr) {
          console.warn(`${label} FACT-CHECKER RECHECK (${reason}) failed — eval stays stale (fail-closed):`, recheckErr);
        }
        try {
          const { verifySymbolically } = await import('../symbolic-verifier');
          const sym = verifySymbolically(html);
          stats.symbolicVerifier = tagEval({
            score: sym.score, passed: sym.passed, failed: sym.failed, flagged: sym.flagged.length,
          }, 'html');
        } catch { /* keep stale — see above */ }
        try {
          const { verifyCitationsNLI } = await import('../nli-verifier');
          const v = await verifyCitationsNLI(html, topSources, { maxConcurrency: 10, maxClaims: 80, readings });
          stats.citationVerifier = tagEval({
            integrity: v.overallIntegrity,
            supported: v.supported,
            flagged: v.flaggedClaims.length,
          }, 'html');
        } catch { /* keep stale — see above */ }
        return recheckResult;
      };

      // REPAIR BEFORE HELD: the fact-checker returns per-claim
      // {claim, number, sourceRef, sourceSays, fix} — the anchored repairer
      // corrects the figure to what the source says (or drops the
      // unsupported figure) instead of shipping fatal discrepancies.
      // Skipped when budget-constrained.
      let fatalNow = factResult.fatalIssues;
      if (!(deps.isBudgetConstrained?.() ?? false)) {
        try {
          const { repairFactualDiscrepancies } = await import('../fact-repair');
          const rev = await repairFactualDiscrepancies(
            html,
            (factResult.results ?? [])
              .filter((r: any) => r.severity === 'fatal')
              .slice(0, 8)
              .map((r: any) => ({ claim: r.claim, number: r.number, sourceRef: r.sourceRef, sourceSays: r.sourceSays, fix: r.fix })),
            { producerFamily },
          );
          deps.addCost?.(rev.costUsd, 'FACT_REPAIR');
          if (rev.applied > 0) {
            html = rev.html;
            bumpHtmlArtifact();
            const recheck = await reverifyAfterMutation('post-fact-repair');
            stats.factCheckerRepair = {
              fatalBefore: factResult.fatalIssues,
              applied: rev.applied,
              skipped: rev.skipped,
              skippedReasons: rev.skippedReasons,
              fatalAfter: recheck?.fatalIssues ?? factResult.fatalIssues,
              integrityBefore: factResult.integrityScore,
              integrityAfter: recheck?.integrityScore ?? factResult.integrityScore,
            };
            if (recheck) fatalNow = recheck.fatalIssues;
          } else {
            stats.factCheckerRepair = {
              fatalBefore: factResult.fatalIssues,
              applied: 0,
              skipped: rev.skipped,
              skippedReasons: rev.skippedReasons,
              fatalAfter: factResult.fatalIssues,
              integrityBefore: factResult.integrityScore,
              integrityAfter: factResult.integrityScore,
            };
          }
          // Always log — an applied=0 repair that stays silent is how this
          // defect shipped invisibly the first time.
          console.log(`${label} FACT-CHECKER REPAIR: ${rev.applied} applied / ${rev.skipped} skipped [${rev.skippedReasons.join(', ') || 'none'}] → fatal ${stats.factCheckerRepair.fatalBefore}→${stats.factCheckerRepair.fatalAfter}, integrity ${stats.factCheckerRepair.integrityBefore}%→${stats.factCheckerRepair.integrityAfter}%`);
        } catch (repairErr) {
          console.warn(`${label} FACT-CHECKER REPAIR: failed (non-blocking):`, repairErr);
        }
      }

      // Sanitize (legacy fallback): run citation repair to remove/flag
      // unsourced numbers — decided on the POST-REPAIR fatal count.
      if (fatalNow > 0) try {
        const { repairCitations } = await import('../citation-repair');
        const factRepair = repairCitations(html, analysis, topSources);
        if (factRepair.numbersSanitized > 0) {
          html = factRepair.html;
          bumpHtmlArtifact();
          console.log(`${label} FACT-CHECKER REPAIR: sanitized ${factRepair.numbersSanitized} suspicious numbers`);
          const recheck = await reverifyAfterMutation('post-sanitize');
          if (recheck) {
            stats.factCheckerResanitize = {
              sanitized: factRepair.numbersSanitized,
              integrityBefore: factResult.integrityScore,
              integrityAfter: recheck.integrityScore,
            };
          }
        }
      } catch (repairErr) {
        console.warn(`${label} FACT-CHECKER REPAIR: failed (non-blocking):`, repairErr);
      }
    }
  } catch (err) {
    console.warn(`${label} FACT-CHECKER: failed (non-blocking):`, err);
    stats.factChecker = { error: String(err) };
  }

  return html;
}
