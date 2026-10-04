/**
 * STYLE GATES → COPY EDITOR → SIGNAL SWEEP → DA RE-CHECK.
 * Extracted from pipeline-v2.ts — identical semantics, one cohesive unit.
 *
 * Coupling rationale (why these three stay together): style gates post
 * `style_violation` signals consumed by the sweep; the sweep's revision editor
 * mutates html; the DA re-check re-judges the corrected artifact. Splitting
 * them would re-introduce the stale-evaluator class the S28 versioning fixed.
 */

import type { TailStepContext } from './types';
import type { AgentSignal } from '../signals';

export async function runStyleSweepRecheck(ctx: TailStepContext): Promise<void> {
  const { stats, topSources, query, label } = ctx;
  const pipelineCtx = ctx.pipelineCtx;
  const isBudgetConstrained = ctx.isBudgetConstrained ?? (() => false);
  const addCost = ctx.addCost ?? (() => {});

  // LOT 5.1/5.7: Style gates + numerical gate on final HTML
  try {
    const { runStyleGates, runNumericalGate } = await import('../style-gates');
    const styleResult = runStyleGates(ctx.html);
    const numResult = runNumericalGate(ctx.html, topSources.length);
    stats.styleGates = {
      violations: styleResult.violations.length,
      passed: styleResult.passed,
      gateDetails: styleResult.violations.slice(0, 10).map(v => ({ gate: v.gate, match: v.match, suggestion: v.suggestion })),
    };
    stats.numericalGate = {
      violations: numResult.violations.length,
      passed: numResult.passed,
      details: numResult.violations.slice(0, 10).map(v => ({ match: v.match, suggestion: v.suggestion })),
    };
    if (styleResult.violations.length > 0) {
      console.log(`${label} STYLE GATES: ${styleResult.violations.length} violations (G1-G10)`);
      // Emit as signals — resolvable at sweep checkpoints, not just inline.
      for (const v of styleResult.violations.slice(0, 10)) {
        pipelineCtx.postSignal('style_violation', `${v.gate}: "${v.match}" → ${v.suggestion}`, {
          postedBy: 'STYLE_GATES', intensity: 0.4, ttlMs: 20 * 60 * 1000,
          payload: { gate: v.gate, match: v.match, suggestion: v.suggestion },
        });
      }
    }

    // ── COPY EDITOR — the missing newsroom role: detection existed (style gates,
    // editorial panel reviewer) but nothing FIXED the prose. Surgical edit-list
    // contract: LLM returns {find, replace} pairs, applied only after verbatim +
    // citation-preservation verification (see copy-editor.ts). Triggers on style
    // violations OR a weak editorial panel score with concrete findings.
    const editorialFindings = ((stats.criticPanel as any)?.dimensions ?? [])
      .filter((d: any) => d.dimension === 'editorial' && d.score < 7)
      .flatMap((d: any) => (d.findings ?? []).slice(0, 3));
    if ((styleResult.violations.length > 0 || editorialFindings.length > 0) && !isBudgetConstrained()) {
      try {
        const { copyEditHtml } = await import('../copy-editor');
        const ce = await copyEditHtml(ctx.html, { violations: styleResult.violations, editorialFindings });
        addCost(ce.costUsd, 'COPY_EDITOR');
        if (ce.applied > 0) {
          ctx.html = ce.html;
          const after = runStyleGates(ctx.html);
          console.log(`${label} COPY EDITOR: ${ce.applied} edits applied (${ce.skipped} rejected) → violations ${styleResult.violations.length} → ${after.violations.length}`);
          stats.copyEditor = { applied: ce.applied, skipped: ce.skipped, violationsBefore: styleResult.violations.length, violationsAfter: after.violations.length, costUsd: ce.costUsd };
          stats.styleGates.violations = after.violations.length;
          stats.styleGates.passed = after.passed;
        } else {
          stats.copyEditor = { applied: 0, skipped: ce.skipped, costUsd: ce.costUsd };
        }
      } catch (ceErr) {
        console.warn(`${label} COPY EDITOR: failed (non-blocking):`, ceErr);
      }
    }
    if (numResult.violations.length > 0) {
      console.log(`${label} NUMERICAL GATE: ${numResult.violations.length} unsourced numbers (first 5: ${numResult.violations.slice(0, 5).map(v => v.match).join(', ')})`);
      // Flag in stats for downstream inspection — if > 20 violations, log a warning
      if (numResult.violations.length > 20) {
        console.warn(`${label} NUMERICAL GATE: WARNING — ${numResult.violations.length} unsourced numbers is high. Consider reviewing the analyst output for missing citations on empirical claims.`);
      }
    }
  } catch (err) {
    console.warn(`${label} STYLE GATES: failed (non-blocking):`, err);
  }

  // ── SIGNAL SWEEP (post-render): the collective deliberation checkpoint. ──
  // Signals posted during the run (DA objections → substance_weak, grounding
  // gaps → claim_unverifiable, style → style_violation) are drained in
  // mission-priority order to their resolvers. substance_weak is resolved by
  // the revision editor — surgical edits that address adversarial objections
  // in the final HTML BEFORE the gate ever sees them.
  let sweepResolvedSubstance = false;
  try {
    if (!isBudgetConstrained()) {
      pipelineCtx.signals.registerResolver('substance_weak', async (sigs: AgentSignal[]) => {
        const daStats = stats.devilsAdvocate as any;
        const { reviseForFindings } = await import('../revision-editor');
        const weakFindings = ((stats.criticPanel as any)?.dimensions ?? [])
          .filter((d: any) => d.mustFix || d.score <= 4)
          .flatMap((d: any) => (d.findings ?? []).slice(0, 3).map((f: string) => `[${d.dimension}] ${f}`));
        const rev = await reviseForFindings(ctx.html, {
          gateReasons: [],
          daChallenges: sigs.map((s: AgentSignal) => ({ type: String(s.payload?.type ?? 'challenge'), text: s.content })),
          killShot: daStats?.killShot,
          weakFindings,
        });
        addCost(rev.costUsd, 'REVISION_EDITOR');
        if (rev.applied > 0) { ctx.html = rev.html; ctx.bumpHtmlArtifact(); return { resolved: true, note: `${rev.applied} edit(s) — ${rev.skipped} rejected` }; }
        return { resolved: false, note: `0 edits applied (${rev.skipped} rejected)` };
      }, { batch: true });

      const sweep = await pipelineCtx.signals.sweep({
        mission: pipelineCtx.mission,
        metrics: {
          trust: stats.criticalLoop?.finalScore ?? 0,
          groundedness: stats.claimGrounding?.groundedness ?? 100,
          citationCoverage: 0,
          sourceCount: topSources.length,
          qualityScore: 0,
          centralScenarioOk: true,
        },
        maxResolutions: 3,
      });
      if (sweep.resolved > 0 || sweep.failed > 0) {
        sweepResolvedSubstance = sweep.results.some(
          (r: { signal: AgentSignal; res: { resolved: boolean } }) => r.signal.type === 'substance_weak' && r.res.resolved
        );
        (stats as Record<string, unknown>).signalSweep = { resolved: sweep.resolved, failed: sweep.failed, remaining: sweep.remaining };
        console.log(`${label} SIGNAL SWEEP: ${sweep.resolved} resolved, ${sweep.failed} failed, ${sweep.remaining} open — ${sweep.results.map((r: { signal: AgentSignal; res: { resolved: boolean } }) => `${r.signal.type}=${r.res.resolved ? 'ok' : 'no'}`).join(', ')}`);
      }
    }
  } catch (sweepErr) {
    console.warn(`${label} SIGNAL SWEEP: failed (non-blocking):`, sweepErr);
  }

  // ── DA RE-CHECK (post-sweep): if the devil's advocate failed the analysis
  // (veto, reject verdict, or a publishability score below the gate's 40
  // threshold) and the sweep's revision editor resolved its substance_weak
  // objections in the HTML, the verdict must be re-evaluated on the CORRECTED
  // artifact — otherwise the gate and the trust cap punish defects that no
  // longer exist and the correction loop is cosmetic. One re-check (~$0.02),
  // skipped when budget-constrained. The fresh verdict replaces the stored one
  // either way: it describes the adopted artifact, which is what the gate must
  // judge. ──
  try {
    const daStats = stats.devilsAdvocate as Record<string, unknown> | undefined;
    const daGateFailing = (stats as any).devilsAdvocateVeto === true
      || daStats?.verdict === 'reject'
      || (typeof daStats?.publishabilityScore === 'number' && daStats.publishabilityScore < 40);
    if (daGateFailing && sweepResolvedSubstance && !isBudgetConstrained()) {
      const { runDevilsAdvocate } = await import('../devils-advocate');
      const recheck = await runDevilsAdvocate(
        query,
        ctx.html,
        topSources.map((s: any) => ({ title: s.title, provider: s.provider, year: s.year })),
        { mode: ctx.isStrategic ? 'strategic' : 'brief', domain: ctx.detectedDomain, debateContext: ctx.debateContext },
      );
      addCost(recheck.costUsd, 'DEVILS_ADVOCATE_RECHECK');
      const recheckFatal = recheck.fatalChallenges?.length ?? 0;
      const stillVetoWorthy = recheck.verdict === 'reject'
        || (recheck.verdict === 'major_revision' && recheck.overallStrength < 20);
      console.log(`${label} DA RE-CHECK: strength ${daStats?.overallStrength ?? '?'}→${recheck.overallStrength}/100, fatal ${daStats?.fatalChallenges ?? '?'}→${recheckFatal} — veto ${stillVetoWorthy ? 'STANDS' : 'LIFTED'}`);
      (stats as any).devilsAdvocateRecheck = {
        verdict: recheck.verdict,
        overallStrength: recheck.overallStrength,
        publishabilityScore: recheck.publishabilityScore,
        fatalChallenges: recheckFatal,
        vetoLifted: !stillVetoWorthy && (stats as any).devilsAdvocateVeto === true,
        costUsd: recheck.costUsd,
      };
      (stats as any).devilsAdvocateVeto = stillVetoWorthy;
      stats.devilsAdvocate = ctx.tagEval({
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
    }
  } catch (recheckErr) {
    console.warn(`${label} DA RE-CHECK failed (non-blocking):`, recheckErr);
  }
}
