/**
 * PRE-CRITIC GATES — STEP 6a + 7 + 7a: structural editor review, citation
 * guard, deterministic claim-binding preflight. Sequential: the structural
 * editor may append feedback to fullContextBlock; the guard result is
 * returned for downstream citation counts.
 */

export interface PreCriticGatesDeps {
  analysis: any;
  topSources: any[];
  readings: any[];
  stats: Record<string, any>;
  label: string;
  query: string;
  quantModelCount: number;
  fullContextBlock: string | undefined;
  tagEval: <T extends Record<string, any>>(entry: T, artifact: 'analysis' | 'html') => T;
  addCost: (usd: number | undefined, step: string) => void;
  citationGuard: (analysis: any, sourceCount: number, modelCount: number) => any;
  ctx: {
    postSignal: (type: any, content: string, opts: { postedBy: string; intensity?: number; ttlMs?: number; payload?: Record<string, unknown> }) => unknown;
  };
}

export interface PreCriticGatesResult {
  fullContextBlock: string | undefined;
  guard: any;
}

export async function runPreCriticGates(deps: PreCriticGatesDeps): Promise<PreCriticGatesResult> {
  const {
    analysis, topSources, readings, stats, label, query, quantModelCount,
    tagEval, addCost, citationGuard, ctx,
  } = deps;
  let fullContextBlock = deps.fullContextBlock;

  // ── STEP 6a: STRUCTURAL EDITOR (all formats since S23) ──
  // Reviews narrative structure (Pyramid Principle, SCR, governing thoughts)
  // BEFORE rendering to HTML. Assessment only — does not rewrite. Cheap
  // (~1 LLM call); briefs benefit from the <40 feedback injection too.
  stats.harvardCouncil = { skipped: true };
  stats.deliberation = { skipped: true };
  {
    try {
      const { structuralEditorReview } = await import('../structural-editor');
      const structuralResult = await structuralEditorReview(analysis, query);
      stats.structuralEditor = tagEval({
        overallStructure: structuralResult.overallStructure,
        narrativeArcValid: structuralResult.narrativeArcValid,
        sectionsWithIssues: structuralResult.sectionReviews?.filter((s: any) => s.issues?.length > 0).length || 0,
        logicalGaps: structuralResult.logicalGaps?.length || 0,
        suggestions: structuralResult.restructuringSuggestions?.length || 0,
        costUsd: structuralResult.costUsd,
      }, 'analysis');
      addCost(structuralResult.costUsd, 'STRUCTURAL_EDITOR');
      console.log(`${label} STRUCTURAL EDITOR: structure=${structuralResult.overallStructure}/100, arc=${structuralResult.narrativeArcValid}, ${structuralResult.logicalGaps?.length || 0} gaps, ${structuralResult.sectionReviews?.filter((s: any) => s.issues?.length > 0).length || 0} sections with issues`);

      // If structural issues are critical (score < 40), inject suggestions into context for re-render
      if (structuralResult.overallStructure < 40 && structuralResult.restructuringSuggestions?.length > 0) {
        const structuralFeedback = `\n## STRUCTURAL EDITOR FEEDBACK (inject into rendering)\nThe narrative structure scored ${structuralResult.overallStructure}/100. Key issues:\n${structuralResult.restructuringSuggestions.slice(0, 3).map((s: string) => `- ${s}`).join('\n')}\nLogical gaps:\n${structuralResult.logicalGaps.slice(0, 3).map((g: string) => `- ${g}`).join('\n')}`;
        fullContextBlock = (fullContextBlock || '') + '\n\n---\n\n' + structuralFeedback;
        console.warn(`${label} STRUCTURAL EDITOR: critical structure score (${structuralResult.overallStructure}/100) — feedback injected for rendering`);
      }
    } catch (err) {
      console.warn(`${label} STRUCTURAL EDITOR: failed (non-blocking):`, err);
      stats.structuralEditor = { error: String(err) };
    }
  }

  // ── STEP 7: CITATION GUARD ──
  console.log(`${label} GUARD: validate citations`);
  const guard = citationGuard(analysis, topSources.length, quantModelCount);
  stats.guard = guard;
  if (!guard.ok) {
    console.warn(`${label} Citation guard warning: ${guard.usedCount} citations, ${guard.invalid.length} invalid, ${guard.invalidModels.length} invalid model refs (non-fatal, proceeding with degraded quality)`);
    stats.citationGuardDegraded = true;
  }

  // ── STEP 7a: CLAIM-BINDING PREFLIGHT (deterministic, no LLM) ──
  // Citation laundering: the analyst can attach [SRC-N] to a claim the source
  // never supports. The critic catches it at $0.01 — this catches it for free:
  // a claim whose key terms are absent from the cited source's text is bound
  // to nothing. Weak bindings are surfaced as claim_unverifiable signals so
  // the repair machinery can act on them before render.
  try {
    const analysisObj: any = typeof analysis === 'string' ? JSON.parse(analysis) : analysis;
    const chain: any[] = analysisObj?.causalChain ?? [];
    const readingsByIdPre = new Map<string, any>(
      (Array.isArray(readings) ? readings : []).map((r: any) => [r.sourceId, r])
    );
    let boundCount = 0, weakCount = 0;
    const weakLinks: { id: number; overlap: number }[] = [];
    for (const link of chain) {
      const srcRef = typeof link?.sourceRef === 'string'
        ? parseInt(String(link.sourceRef).replace(/\D/g, ''), 10)
        : (typeof link?.sourceRef === 'number' ? link.sourceRef : null);
      if (!srcRef || srcRef < 1 || srcRef > topSources.length) continue;
      const src = topSources[srcRef - 1];
      const srcText = `${src?.title || ''} ${src?.abstract || ''} ${readingsByIdPre.get(src?.id)?.extractedText || ''}`.toLowerCase();
      if (srcText.length < 100) continue; // can't verify against empty source
      const claimText = `${link?.claim || ''} ${link?.evidence || ''}`.toLowerCase();
      const claimTerms = new Set(
        claimText.replace(/[^\w\s]/g, ' ').split(/\s+/).filter((w: string) => w.length > 4)
      );
      if (claimTerms.size === 0) continue;
      const srcWords = new Set(srcText.replace(/[^\w\s]/g, ' ').split(/\s+/));
      let hits = 0;
      for (const t of claimTerms) if (srcWords.has(t)) hits++;
      const overlap = hits / claimTerms.size;
      boundCount++;
      if (overlap < 0.15) {
        weakCount++;
        weakLinks.push({ id: link.id ?? boundCount, overlap: Math.round(overlap * 100) });
      }
    }
    stats.claimBinding = { links: boundCount, weak: weakCount };
    if (weakCount > 0) {
      console.warn(`${label} CLAIM BINDING: ${weakCount}/${boundCount} causal-chain links cite sources that don't cover their claim (laundering risk) — links: ${weakLinks.map(w => `#${w.id}@${w.overlap}%`).join(', ')}`);
      ctx.postSignal('claim_unverifiable', `${weakCount} causal-chain links have weak claim-source binding: ${weakLinks.map(w => `link #${w.id}`).join(', ')}`, {
        postedBy: 'CLAIM_BINDING',
        intensity: Math.min(0.95, 0.4 + weakCount * 0.15),
        ttlMs: 60 * 60 * 1000,
        payload: { weakLinks },
      });
    } else if (boundCount > 0) {
      console.log(`${label} CLAIM BINDING: ${boundCount} links verified against cited sources (all bound)`);
    }
  } catch (bindErr) {
    console.warn(`${label} CLAIM BINDING: check failed (non-blocking):`, bindErr);
  }

  return { fullContextBlock, guard };
}
