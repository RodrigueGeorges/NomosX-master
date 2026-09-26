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
    const factResult = await factChecker(html, topSources, producerFamily, readings);
    stats.factChecker = tagEval({
      totalClaims: factResult.totalClaims,
      verified: factResult.verified,
      majorIssues: factResult.majorIssues,
      fatalIssues: factResult.fatalIssues,
      integrityScore: factResult.integrityScore,
    }, 'html');
    console.log(`${label} FACT-CHECKER: ${factResult.totalClaims} claims, ${factResult.verified} verified, ${factResult.majorIssues} major, ${factResult.fatalIssues} fatal → integrity ${factResult.integrityScore}%`);
    if (factResult.fatalIssues > 0) {
      console.error(`${label} FACT-CHECKER: ${factResult.fatalIssues} FATAL numerical discrepancies detected — sanitizing HTML`);
      stats.factCheckerFatalFlagged = true;
      // Sanitize: run citation repair to remove/flag unsourced numbers
      try {
        const { repairCitations } = await import('../citation-repair');
        const factRepair = repairCitations(html, analysis, topSources);
        if (factRepair.numbersSanitized > 0) {
          html = factRepair.html;
          bumpHtmlArtifact();
          console.log(`${label} FACT-CHECKER REPAIR: sanitized ${factRepair.numbersSanitized} suspicious numbers`);
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
