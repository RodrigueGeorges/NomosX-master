/**
 * Thesis-binding adherence — verify + routed repair.
 *
 * The central claim was contracted FROM the corpus upstream (best-supported
 * judged hypothesis). A verdict that exceeds it is speculation-as-thesis:
 * exactly what the DA later kills. `verifyThesisBindingStage` is a cheap
 * check; non-adherence is recorded on stats.thesisBinding and surfaced to
 * the gate diagnostics without blocking.
 *
 * `runThesisBindingRepair` (post-analyst only) consumes one re-analysis
 * slot to re-run the analyst under the binding contract, then re-verifies.
 * A still-breached verdict reaches the gate's thesis_adherence hard check.
 * Extracted from pipeline-v2 (was ~80 lines inline); behaviour identical.
 */
import { assertExecutionActive } from '../../worker/execution-scope';
import { hasRunHeadroomWithReserve } from './time-budget';

export interface ThesisBindingDeps {
  stats: Record<string, any>;
  getAnalysis: () => any;
  setAnalysis: (a: any) => void;
  addCost: (usd: number | undefined, step: string) => void;
  ctx?: any;
  label: string;
  query: string;
  topSources: any[];
  slimReadings: any;
  fullContextBlock?: string;
  detectedDomain: any;
  isStrategic: boolean;
  pipelineStart: number;
  analystMultipass: any;
  bumpAnalysisArtifact: () => void;
}

export async function verifyThesisBindingStage(deps: ThesisBindingDeps, stage: string): Promise<void> {
  const { stats, getAnalysis, addCost, ctx, label } = deps;
  const bound = (stats as any).thesisBinding;
  const current = getAnalysis();
  const verdict = typeof current?.verdict === 'string' ? current.verdict : '';
  if (!bound?.statement || verdict.trim().length < 20) return;
  if (bound.checkedVerdict === verdict) return; // unchanged verdict — no re-spend
  try {
    const { checkThesisAdherence } = await import('../hypothesis-engine');
    const adh = await checkThesisAdherence(verdict, bound.statement);
    addCost(adh.costUsd, 'THESIS BINDING');
    bound.checkedVerdict = adh.evaluationComplete ? verdict : undefined;
    bound.adhered = adh.adhered;
    bound.evaluationComplete = adh.evaluationComplete;
    bound.adherenceReason = adh.reason.slice(0, 200);
    if (!adh.evaluationComplete) {
      console.warn(`${label} THESIS BINDING (${stage}): evaluation unavailable`);
      ctx?.addFinding?.('THESIS_BINDING', 'warning', `[${stage}] Adherence evaluation unavailable`);
    } else if (adh.adhered) {
      console.log(`${label} THESIS BINDING (${stage}): verdict within bound hypothesis "${bound.id}"`);
    } else {
      console.warn(`${label} THESIS BINDING (${stage}): verdict exceeds bound hypothesis — ${adh.reason}`);
      ctx?.addFinding?.('THESIS_BINDING', 'warning', `[${stage}] Analyst verdict exceeds bound thesis: ${adh.reason.slice(0, 200)}`);
    }
  } catch {
    // Non-blocking — but never swallow a scope abort: if the error came
    // from a dead/cancelled execution scope it must propagate (S38
    // cancellation contract), not surface as a benign check failure.
    assertExecutionActive();
  }
}

/**
 * Verdict-scoped adherence repair — the cheap path. The observed breach mode
 * is verdict-level overclaim (causal attributions, forecasts, necessity
 * claims beyond the bound descriptive thesis). One bounded rewrite of the
 * verdict field under the binding contract costs ~$0.005 vs ~$0.4 for a
 * full re-analysis — and often achieves adherence on its own. The result
 * is re-verified by the caller; a still-breached verdict falls through to
 * the full re-analysis path unchanged.
 */
async function attemptVerdictNarrowingRepair(deps: ThesisBindingDeps): Promise<boolean> {
  const { getAnalysis, setAnalysis, addCost, bumpAnalysisArtifact, label } = deps;
  const binding = (deps.stats as any).thesisBinding;
  const analysis = getAnalysis();
  const verdict = typeof analysis?.verdict === 'string' ? analysis.verdict : '';
  if (!binding?.statement || verdict.trim().length < 20) return false;
  try {
    const { callLLM } = await import('../../llm/unified-llm');
    const { parseJson } = await import('../json-utils');
    const response = await callLLM({
      messages: [
        {
          role: 'system',
          content:
            'You are a senior analyst narrowing a verdict to its evidence-bound thesis. ' +
            'Output valid JSON only: {"verdict":"..."}. ' +
            'Rules: the verdict must assert ONLY what the bound thesis supports — or a strictly narrower version of it. ' +
            'Remove causal attributions, forecasts, numerical claims, and necessity claims the thesis does not make. ' +
            'Prefer a hedged-but-supported formulation over a strong-but-unsupported one. ' +
            'Preserve every [SRC-N] citation token from the original verdict. Never add facts, numbers, or citations. ' +
            'Keep it one paragraph, same language as the input.',
        },
        {
          role: 'user',
          content:
            `BOUND THESIS (the only claim the corpus contracted to support):\n"${binding.statement}"\n\n` +
            `VIOLATION FOUND BY ADHERENCE CHECK:\n${binding.adherenceReason || 'verdict claims more than the bound thesis supports'}\n\n` +
            `THROUGH-LINE (context — do not expand beyond the bound thesis):\n${String(analysis?.throughLine ?? '').slice(0, 500)}\n\n` +
            `CURRENT VERDICT (overclaims — rewrite it narrower):\n${verdict.slice(0, 3000)}`,
        },
      ],
      task: 'reader_v3',
      temperature: 0.2,
      maxTokens: 1500,
      jsonMode: true,
      enableCache: false,
    });
    addCost(response.costUsd, 'THESIS BINDING');
    const parsed = parseJson<{ verdict?: string }>(response.content);
    const narrowed = typeof parsed?.verdict === 'string' ? parsed.verdict.trim() : '';
    if (narrowed.length < 20 || narrowed === verdict.trim()) return false;
    analysis.verdict = narrowed;
    setAnalysis(analysis);
    bumpAnalysisArtifact();
    binding.verdictNarrowing = { attempted: true, costUsd: response.costUsd };
    console.log(`${label} THESIS BINDING: verdict narrowed in-place ($${response.costUsd.toFixed(4)}) — re-verifying adherence`);
    return true;
  } catch (err) {
    assertExecutionActive();
    binding.verdictNarrowing = { attempted: true, reason: 'narrowing_error' };
    console.warn(`${label} THESIS BINDING: verdict narrowing failed (non-blocking):`, err);
    return false;
  }
}

export async function runThesisBindingRepair(
  deps: ThesisBindingDeps,
  opts: { reAnalysisBudget: number; verify: (stage: string) => Promise<void> },
): Promise<{ reAnalysisBudget: number }> {
  const { stats, getAnalysis, setAnalysis, addCost, label, query, topSources, slimReadings, fullContextBlock, detectedDomain, isStrategic, pipelineStart, analystMultipass, bumpAnalysisArtifact } = deps;
  let { reAnalysisBudget } = opts;
  const binding = (stats as any).thesisBinding;
  // Cheap path first — independent of reAnalysisBudget/headroom: a verdict
  // that cannot be narrowed cheaply would not survive a full re-analysis
  // budget check either, and this is the difference between a $0.005 fix
  // and a skipped repair routed straight to the gate.
  // Opt-in (NOMOSX_THESIS_VERDICT_REPAIR=1): the narrowing call changes the
  // recorded call stream — fixtures recorded without it would miss.
  const verdictRepairEnabled = process.env.NOMOSX_THESIS_VERDICT_REPAIR === '1';
  if (verdictRepairEnabled && binding?.statement && binding.evaluationComplete === true && binding.adhered === false) {
    const narrowed = await attemptVerdictNarrowingRepair(deps);
    if (narrowed) {
      await opts.verify('adherence-verdict-narrowing');
      if (binding.adhered === true) {
        binding.repair = { attempted: true, mode: 'verdict_narrowing' };
        return { reAnalysisBudget };
      }
      console.warn(`${label} THESIS BINDING: narrowed verdict still exceeds bound thesis — escalating to full re-analysis`);
    }
  }
  if (binding?.statement && binding.evaluationComplete === true && binding.adhered === false && reAnalysisBudget > 0) {
    const rerunMs = Number(process.env.ANALYST_RERUN_BUDGET_MS ?? 900_000);
    if (!hasRunHeadroomWithReserve(pipelineStart, isStrategic, rerunMs)) {
      binding.repair = { attempted: false, reason: 'insufficient_headroom' };
      console.warn(`${label} THESIS BINDING: verdict exceeds bound thesis — re-analysis would eat the repair reserve; breach routed to the gate`);
    } else {
      reAnalysisBudget--;
      console.warn(`${label} THESIS BINDING: verdict exceeds bound thesis — re-analysing under binding contract (re-analysis budget left: ${reAnalysisBudget})`);
      try {
        const directive = `\n\n## THESIS BINDING CONTRACT (mandatory correction)\n` +
          `Your previous verdict exceeded the evidence-bound thesis.\n` +
          `BOUND THESIS: "${binding.statement}"\n` +
          `VIOLATION: ${binding.adherenceReason || 'verdict claims more than the bound thesis supports'}\n` +
          `Re-issue the verdict strictly within — or narrower than — the bound thesis. ` +
          `Drop causal/scope claims the corpus does not support; prefer a hedged-but-supported formulation over a strong-but-unsupported one.`;
        const reAnalysis = await analystMultipass(query, topSources, slimReadings, {
          contextBlock: (fullContextBlock || '') + directive,
          domain: detectedDomain,
          depth: isStrategic ? 'strategic' : 'brief',
          boundThesis: binding.statement,
        });
        addCost((reAnalysis as any)?._meta?.totalCostUsd, 'THESIS BINDING');
        if (reAnalysis && !(reAnalysis as any)?._meta?.failed) {
          setAnalysis(reAnalysis);
          bumpAnalysisArtifact();
          binding.repair = { attempted: true };
        } else {
          binding.repair = { attempted: true, reason: 'reanalysis_failed' };
        }
      } catch (repairErr) {
        assertExecutionActive();
        binding.repair = { attempted: true, reason: 'reanalysis_error' };
        console.warn(`${label} THESIS BINDING repair re-analysis failed (non-blocking):`, repairErr);
      }
      await opts.verify('adherence-repair');
    }
  }
  return { reAnalysisBudget };
}
