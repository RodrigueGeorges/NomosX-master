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

export async function runThesisBindingRepair(
  deps: ThesisBindingDeps,
  opts: { reAnalysisBudget: number; verify: (stage: string) => Promise<void> },
): Promise<{ reAnalysisBudget: number }> {
  const { stats, getAnalysis, setAnalysis, addCost, label, query, topSources, slimReadings, fullContextBlock, detectedDomain, isStrategic, pipelineStart, analystMultipass, bumpAnalysisArtifact } = deps;
  let { reAnalysisBudget } = opts;
  const binding = (stats as any).thesisBinding;
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
