/**
 * POST-RENDER CITATION + GROUNDING block.
 * Extracted from pipeline-v2.ts — identical semantics. Deterministic chain:
 * citation repair → NLI claim grounding (remove mode) → re-grounding if the
 * removal improved the score → quant SVG injection → citation filter.
 *
 * Returns the mutated HTML. The trailing `void generatePrintHTML` +
 * `runPostRenderQualityGates` stay with the caller — the quality-gates
 * closure reads the pipeline's own `html` variable, which must be assigned
 * from the return value BEFORE it runs.
 */

import { generatePrintHTML } from '../pdf-export';

export interface CitationGroundingDeps {
  html: string;
  analysis: Record<string, any>;
  topSources: any[];
  readings: any[];
  stats: Record<string, any>;
  label: string;
  /** Live PipelineContext — grounding posts `claim_unverifiable` signals. */
  pipelineCtx: { postSignal: (...args: any[]) => void };
  bumpHtmlArtifact: () => void;
  tagEval: <T extends Record<string, any>>(entry: T, artifact: 'analysis' | 'html') => T;
  chartData: any[];
}

export async function runPostRenderCitationAndGrounding(deps: CitationGroundingDeps): Promise<string> {
  const { analysis, topSources, readings, stats, label, pipelineCtx, bumpHtmlArtifact, tagEval } = deps;
  let html = deps.html;

  // CITATION REPAIR: deterministically backfill missing [SRC-N] from analyst JSON
  try {
    const { repairCitations } = await import('../citation-repair');
    const repairResult = repairCitations(html, analysis, topSources);
    if (repairResult.citationsBackfilled + repairResult.citationsInjected + repairResult.numbersSanitized > 0) {
      html = repairResult.html;
      bumpHtmlArtifact();
      console.log(`${label} CITATION REPAIR: +${repairResult.citationsBackfilled} backfilled, +${repairResult.citationsInjected} injected, ${repairResult.numbersSanitized} numbers sanitized`);
      stats.citationRepair = {
        backfilled: repairResult.citationsBackfilled,
        injected: repairResult.citationsInjected,
        sanitized: repairResult.numbersSanitized,
      };
    }
  } catch (repairErr) {
    console.warn(`${label} CITATION REPAIR: failed (non-blocking):`, repairErr);
  }

  // CLAIM GROUNDING: deterministically verify each claim against its cited source (NLI, CPU-only)
  try {
    const { groundClaimsWithNLI } = await import('../claim-grounding');
    const groundingResult = await groundClaimsWithNLI(html, topSources, { mode: 'remove', readings });
    if (groundingResult.removedClaims > 0 || groundingResult.unsupported > 0) {
      html = groundingResult.html;
      bumpHtmlArtifact();
    }
    console.log(`${label} CLAIM GROUNDING: ${groundingResult.supported} supported, ${groundingResult.partial} partial, ${groundingResult.unsupported} unsupported, ${groundingResult.uncited} uncited → groundedness ${Math.round(groundingResult.groundedness * 100)}%, ${groundingResult.removedClaims} removed`);
    // Emit unverifiable claims as signals — collective awareness that
    // evidence is missing (resolvable by re-search at sweep checkpoints).
    if (groundingResult.unsupported > 0 || groundingResult.contradicted > 0) {
      pipelineCtx.postSignal('claim_unverifiable',
        `${groundingResult.unsupported} unsupported + ${groundingResult.contradicted} contradicted claims survived removal`,
        {
          postedBy: 'CLAIM_GROUNDING',
          intensity: Math.min(1, 0.4 + (groundingResult.unsupported + groundingResult.contradicted) * 0.05),
          ttlMs: 30 * 60 * 1000,
          payload: {
            unsupported: groundingResult.unsupported,
            contradicted: groundingResult.contradicted,
            claims: (groundingResult.claims ?? []).filter((c: any) => c.verdict === 'unsupported' || c.verdict === 'contradicted').slice(0, 5).map((c: any) => String(c.text ?? '').slice(0, 200)),
          },
        });
    }
    stats.claimGrounding = tagEval({
      supported: groundingResult.supported,
      partial: groundingResult.partial,
      unsupported: groundingResult.unsupported,
      uncited: groundingResult.uncited,
      contradicted: groundingResult.contradicted,
      groundedness: Math.round(groundingResult.groundedness * 100),
      flagged: groundingResult.removedClaims,
    }, 'html');

    // Fix 2: Re-run grounding after removal to get clean score (bad claims are now gone)
    if (groundingResult.removedClaims > 0 && groundingResult.groundedness < 0.80) {
      console.log(`${label} CLAIM GROUNDING: ${groundingResult.removedClaims} claims removed — re-running grounding on clean HTML`);
      const reGrounding = await groundClaimsWithNLI(html, topSources, { mode: 'remove', readings });
      if (reGrounding.groundedness > groundingResult.groundedness) {
        html = reGrounding.html;
        bumpHtmlArtifact();
        stats.claimGrounding = tagEval({
          supported: reGrounding.supported,
          partial: reGrounding.partial,
          unsupported: reGrounding.unsupported,
          uncited: reGrounding.uncited,
          contradicted: reGrounding.contradicted,
          groundedness: Math.round(reGrounding.groundedness * 100),
          flagged: groundingResult.removedClaims + reGrounding.removedClaims,
        }, 'html');
        console.log(`${label} CLAIM GROUNDING: re-grounding improved ${Math.round(groundingResult.groundedness * 100)}% → ${Math.round(reGrounding.groundedness * 100)}%`);
      }
    }
  } catch (groundErr) {
    console.warn(`${label} CLAIM GROUNDING: failed (non-blocking):`, groundErr);
  }

  // QUANT: inject SVG charts from primary data
  if (deps.chartData.length > 0) {
    try {
      const { injectQuantSection } = await import('../svg-charts');
      html = injectQuantSection(html, deps.chartData);
      stats.quantCharts = deps.chartData.length;
      console.log(`${label} QUANT CHARTS: ${deps.chartData.length} SVG charts injected into HTML`);
    } catch (err) {
      console.warn(`${label} QUANT CHARTS: injection failed (non-blocking):`, err);
    }
  }
  stats.htmlLength = html.length;

  // P1.1: Post-generation citation filter — back-track implicit citations + flag uncited claims
  try {
    const { applyCitationFilter } = await import('../citation-filter');
    const filterResult = applyCitationFilter(html);
    if (filterResult.backtrackedClaims > 0 || filterResult.removedSentences > 0) {
      html = filterResult.filteredHtml;
      bumpHtmlArtifact();
      console.log(`${label} CITATION FILTER: +${filterResult.backtrackedClaims} backtracked, -${filterResult.removedSentences} removed, coverage ${filterResult.citationCoverageBefore * 100 | 0}%→${filterResult.citationCoverageAfter * 100 | 0}%`);
    }
    stats.citationFilter = {
      backtracked: filterResult.backtrackedClaims,
      removed: filterResult.removedSentences,
      coverageBefore: Math.round(filterResult.citationCoverageBefore * 100),
      coverageAfter: Math.round(filterResult.citationCoverageAfter * 100),
    };
  } catch (err) {
    console.warn(`${label} CITATION FILTER: failed (non-blocking):`, err);
  }
  void generatePrintHTML(html);

  return html;
}
