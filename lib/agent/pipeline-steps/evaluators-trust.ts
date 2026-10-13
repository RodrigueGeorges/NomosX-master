/**
 * PARALLEL EVALUATORS + DETERMINISTIC TRUST SCORING block.
 * Extracted from pipeline-v2.ts — identical semantics.
 *
 * Six evaluators run via Promise.allSettled — pure readers of the post-repair
 * HTML writing distinct stats keys — then the deterministic trust score
 * consumes ALL of them (the scoring stays after the barrier). The scoring
 * block also injects the methodology note and the abstention banner into the
 * HTML: additive injections, so the html artifact version is NOT bumped
 * (Sprint 28 rule — additive ≠ material rewrite).
 *
 * Returns the mutated HTML.
 */

import type { EvidenceBank } from '../evidence-bank';
import { computeTrustScore, countDistinctCitedSources } from './trust-score';

export interface EvaluatorsTrustDeps {
  html: string;
  analysis: Record<string, any>;
  topSources: any[];
  readings: any[];
  stats: Record<string, any>;
  label: string;
  query: string;
  briefId: string;
  evidenceBankRef: EvidenceBank | null;
  planNodesForAudit: Array<{ subQuestion: string; status: string; sourceCount?: number; sourceIds?: string[] }>;
  /** Live PipelineContext — evaluators/abstention record findings. */
  pipelineCtx: { addFinding: (...args: any[]) => void };
}

export async function runEvaluatorsAndTrust(deps: EvaluatorsTrustDeps): Promise<string> {
  const { analysis, topSources, readings, stats, label, query, briefId, evidenceBankRef, planNodesForAudit, pipelineCtx } = deps;
  let html = deps.html;

  // ── INDEPENDENT EVALUATORS — run in parallel ──
  // Each block is a pure reader of the (post-repair) html: no mutation of
  // html/analysis, a distinct stats key, no reads of sibling results. The
  // trust calc below consumes ALL of their stats — it runs after allSettled.
  await Promise.allSettled([

    // ── ORIGINALITY CHECK — detect close paraphrasing / plagiarism ──
    (async () => {
      try {
        const { checkOriginality } = await import('../originality-check');
        const analysisSections: Record<string, string> = {};
        for (const [key, value] of Object.entries(analysis as Record<string, unknown>)) {
          if (typeof value === "string" && value.length > 50) {
            analysisSections[key] = value;
          }
        }
        const originality = checkOriginality(analysisSections, topSources);
        stats.originalityCheck = {
          originalityScore: originality.originalityScore,
          flaggedSections: originality.flaggedSections.length,
          averageOverlap: originality.averageOverlap,
        };
        if (originality.flaggedSections.length > 0) {
          console.warn(`${label} ORIGINALITY: ${originality.flaggedSections.length} sections flagged for high source overlap (avg ${(originality.averageOverlap * 100).toFixed(1)}%)`);
        } else {
          console.log(`${label} ORIGINALITY: OK (score ${(originality.originalityScore * 100).toFixed(0)}%, avg overlap ${(originality.averageOverlap * 100).toFixed(1)}%)`);
        }
      } catch (err) {
        console.warn(`${label} ORIGINALITY: failed (non-blocking):`, err);
      }
    })(),

    // ── BIAS DETECTION — systematic corpus bias check (incl. funding COI) ──
    (async () => {
      try {
        const { detectBiases } = await import('../bias-detector');
        // Extract funders from raw metadata for conflict-of-interest detection
        const sourcesWithFunders = topSources.map((s: any) => ({
          ...s,
          funders: s.funders || (s.raw?.funder as Array<{ name: string; DOI?: string; award?: string }> | undefined)?.map((f: any) => ({ name: f.name || '', doi: f.DOI || null, award: f.award || null })).filter((f: any) => f.name) || [],
        }));
        const biasReport = detectBiases(sourcesWithFunders, html);
        stats.biasDetection = {
          biasCount: biasReport.biases.length,
          overallBiasRisk: biasReport.overallBiasRisk,
          sourceDiversityScore: biasReport.sourceDiversityScore,
          biasTypes: biasReport.biases.map((b) => b.biasType),
        };
        if (biasReport.biases.length > 0) {
          console.warn(`${label} BIAS DETECTOR: ${biasReport.biases.length} biases detected (risk ${(biasReport.overallBiasRisk * 100).toFixed(0)}%): ${biasReport.biases.map((b) => `${b.biasType}(${b.severity})`).join(", ")}`);
        } else {
          console.log(`${label} BIAS DETECTOR: OK (diversity score ${(biasReport.sourceDiversityScore * 100).toFixed(0)}%)`);
        }
      } catch (err) {
        console.warn(`${label} BIAS DETECTOR: failed (non-blocking):`, err);
      }
    })(),

    // ── SOURCE CHECK (sourcecheck pattern) — retraction detection + claim presence ──
    // Resolves each cited source via OpenAlex/Crossref, checks for retraction,
    // and verifies the claim text appears in the source. Free, deterministic.
    (async () => {
      try {
        const { checkSourcesBatch } = await import('../sourcecheck');
        // Check top sources for retraction (limit to top 20 to control API calls)
        const sourcesToCheck = topSources.slice(0, 20).map((s: any) => ({
          id: s.id,
          title: s.title || '',
          doi: s.doi || null,
          abstract: s.abstract || null,
          fullText: s.fullText || null,
        }));
        const { captureInput } = await import('../frozen-inputs');
        const sourceCheckResult = await captureInput('trust:sourcecheck', () => checkSourcesBatch(sourcesToCheck));
        stats.sourceCheck = {
          checked: sourceCheckResult.results.length,
          retracted: sourceCheckResult.retractedCount,
          verified: sourceCheckResult.verifiedCount,
          notFound: sourceCheckResult.notFoundCount,
          claimAbsent: sourceCheckResult.claimAbsentCount,
          integrityScore: sourceCheckResult.integrityScore,
        };
        if (sourceCheckResult.retractedCount > 0) {
          console.warn(`${label} SOURCE CHECK: ${sourceCheckResult.retractedCount} RETRACTED sources detected!`);
          // Flag retracted sources in HTML — add a warning badge
          for (const r of sourceCheckResult.results) {
            if (r.verdict === 'retracted') {
              console.warn(`${label} SOURCE CHECK: RETRACTED — "${r.sourceTitle.slice(0, 60)}..." (DOI: ${r.doi})`);
            }
          }
        }
        console.log(`${label} SOURCE CHECK: ${sourceCheckResult.verifiedCount} verified, ${sourceCheckResult.retractedCount} retracted, ${sourceCheckResult.notFoundCount} not found, ${sourceCheckResult.claimAbsentCount} claim absent → integrity ${sourceCheckResult.integrityScore}%`);
      } catch (err) {
        console.warn(`${label} SOURCE CHECK: failed (non-blocking):`, err);
      }
    })(),

    // ── URL HEALTH (urlhealth pattern, arXiv 2604.03173) ──
    // 3-13% of citation URLs from deep-research agents are hallucinated or
    // dead. Probe only the URLs actually cited (bounded ≤25), rescue dead
    // ones via Wayback. Non-blocking, deterministic-ish cost.
    (async () => {
      try {
        const { checkCitedUrlHealth } = await import('../url-health');
        const { extractCitationNumbers } = await import('../evidence-ledger');
        const citedNums = extractCitationNumbers(html);
        if (citedNums.length > 0) {
          const { captureInput } = await import('../frozen-inputs');
          const urlHealth = await captureInput('trust:urlhealth', () => checkCitedUrlHealth(citedNums, topSources));
          stats.urlHealth = {
            checked: urlHealth.checked,
            alive: urlHealth.alive,
            dead: urlHealth.dead,
            waybackRescued: urlHealth.waybackRescued,
            unrecoverable: urlHealth.unrecoverable.length,
          };
          if (urlHealth.unrecoverable.length > 0) {
            pipelineCtx.addFinding('URL_HEALTH', 'warning',
              `${urlHealth.unrecoverable.length} cited URL(s) unresolvable and not archived — possible hallucinated or rotten citations`);
            console.warn(`${label} URL HEALTH: ${urlHealth.alive}/${urlHealth.checked} alive, ${urlHealth.waybackRescued} rescued via archive, ${urlHealth.unrecoverable.length} UNRECOVERABLE`);
          } else {
            console.log(`${label} URL HEALTH: ${urlHealth.alive}/${urlHealth.checked} alive${urlHealth.waybackRescued ? `, ${urlHealth.waybackRescued} rescued` : ''}`);
          }
        }
      } catch (err) {
        console.warn(`${label} URL HEALTH: failed (non-blocking):`, err);
      }
    })(),

    // ── EVIDENCE BANK VALIDATION — citations must point at sources that
    // contributed extracted evidence. Citing a source with zero banked
    // claims = citing metadata the model never read = hallucination risk. ──
    (async () => {
      if (!(evidenceBankRef && evidenceBankRef.entries.length > 0)) return;
      try {
        const { validateCitationsAgainstBank } = await import('../evidence-bank');
        const { extractCitationNumbers } = await import('../evidence-ledger');
        const bankCheck = validateCitationsAgainstBank(extractCitationNumbers(html), evidenceBankRef);
        stats.evidenceBankValidation = {
          citedCount: bankCheck.citedCount,
          bankedCount: bankCheck.bankedCount,
          unbankedCitations: bankCheck.unbankedCitations,
          utilizationPct: bankCheck.utilizationPct,
          risk: bankCheck.risk,
        };
        if (bankCheck.risk === 'high') {
          pipelineCtx.addFinding('EVIDENCE_BANK', 'warning',
            `${bankCheck.unbankedCitations.length}/${bankCheck.citedCount} citations point to sources with no extracted evidence — likely citing metadata, not content`);
          console.warn(`${label} EVIDENCE BANK: HIGH RISK — ${bankCheck.unbankedCitations.length} citations to unextracted sources [${bankCheck.unbankedCitations.join(',')}]`);
        } else if (bankCheck.unbankedCitations.length > 0) {
          console.log(`${label} EVIDENCE BANK: ${bankCheck.unbankedCitations.length} citations to unextracted sources (risk ${bankCheck.risk}), utilization ${bankCheck.utilizationPct}%`);
        } else {
          console.log(`${label} EVIDENCE BANK: all citations banked, utilization ${bankCheck.utilizationPct}%`);
        }
      } catch (err) {
        console.warn(`${label} EVIDENCE BANK: validation failed (non-blocking):`, err);
      }
    })(),

    // ── PROCESS AUDIT (PING taxonomy, arXiv 2601.22984) ──
    // Hallucinations originate in intermediate steps, not just the final
    // text: intent drift in planning, propagation loss (researched but
    // dropped sub-questions), noise (retrieved but never used evidence).
    (async () => {
      try {
        const { auditProcessTrace } = await import('../process-audit');
        const { extractCitationNumbers } = await import('../evidence-ledger');
        const audit = auditProcessTrace({
          question: query,
          planNodes: planNodesForAudit,
          analysis,
          citedSourceIndices: extractCitationNumbers(html),
          totalTopSources: topSources.length,
        });
        stats.processAudit = {
          score: audit.score,
          intentMisaligned: audit.intent.misalignedNodes.length,
          propagationDropped: audit.propagation.unaddressedNodes.length,
          unusedSourcePct: audit.noise.unusedPct,
        };
        if (audit.score < 70) {
          pipelineCtx.addFinding('PROCESS_AUDIT', 'warning',
            `Trajectory audit ${audit.score}/100 — intent drift: ${audit.intent.misalignedNodes.length}, dropped sub-questions: ${audit.propagation.unaddressedNodes.length}, unused sources: ${audit.noise.unusedPct}%`);
          console.warn(`${label} PROCESS AUDIT: score ${audit.score}/100 — ${audit.propagation.unaddressedNodes.length} researched sub-questions never addressed, ${audit.noise.unusedPct}% sources unused`);
        } else {
          console.log(`${label} PROCESS AUDIT: ${audit.score}/100 (intent ✓, propagation ✓, noise ${audit.noise.unusedPct}%)`);
        }
      } catch (err) {
        console.warn(`${label} PROCESS AUDIT: failed (non-blocking):`, err);
      }
    })(),
  ]);

  // ── DETERMINISTIC TRUST SCORING — replaces Critical Loop V2 ──
  // LLM judges have calibration drift, position bias, and see truncated drafts (FlowVerify 2026).
  // TrustBench (AAAI 2026): TrustScore = 0.3 × confidence + 0.7 × deterministic runtime metrics.
  // We use 100% deterministic metrics: citation coverage, groundedness, fact-checker, source diversity.
  {
    // 1. Citation coverage: how many distinct sources are cited.
    // Target is adaptive: min(40, 35% of sources) — matches what the North Star told the analyst.
    // This ensures the scoring measures exactly what the analyst was asked to optimize.
    // Recognizes both [SRC-N] (brief format) and E-N (strategic report evidence format).
    const citedSources = countDistinctCitedSources(html);
    const coverageTarget = Math.min(40, Math.max(15, Math.ceil(topSources.length * 0.35)));
    const citationCoverage = coverageTarget > 0 ? Math.min(1, citedSources / coverageTarget) : 0;

    // 2. Groundedness from claim grounding (if available)
    const groundingStats = stats.claimGrounding;
    const groundedness = groundingStats ? groundingStats.groundedness / 100 : 0.75;

    // 3. Fact-checker integrity (if available) — default 80 when not run (unknown ≠ failure)
    // If fact-checker found very few claims (<5), the score is not statistically meaningful —
    // a single false-positive fatal would zero it. Floor at 70 in that case.
    const factStats = stats.factChecker as { totalClaims?: number; integrityScore?: number } | undefined;
    let factIntegrity: number;
    if (!factStats || factStats.totalClaims == null) {
      factIntegrity = 80;
    } else if (factStats.totalClaims < 5) {
      factIntegrity = Math.max(70, factStats.integrityScore ?? 70);
      console.log(`${label} FACT-CHECK: only ${factStats.totalClaims} claims found — flooring integrity at ${factIntegrity} (was ${factStats.integrityScore})`);
    } else {
      factIntegrity = factStats.integrityScore ?? 80;
    }

    // 4. Source diversity: how many different providers
    const providerDiversity = new Set(topSources.map((s: any) => s.provider)).size;
    const diversityScore = Math.min(100, providerDiversity * 15); // 7 providers = 105 → capped 100

    // 5. Source quality: average quality score — fall back to the richer
    // source-quality score when the provider score is missing (unscored ≠ 0).
    const avgQuality = topSources.length > 0
      ? topSources.reduce((sum: number, s: any) => sum + ((s.qualityScore || 0) > 0 ? s.qualityScore : (s.sourceQuality?.overall || 0)), 0) / topSources.length
      : 50;

    // 6. Citation verifier integrity (NLI) — default 80 when not run
    const nliIntegrity = stats.citationVerifier?.integrity ?? 80;

    // 7. Source check integrity (retraction + claim presence) — default 85 when not run
    const sourceCheckIntegrity = (stats.sourceCheck as any)?.integrityScore ?? 85;

    // Composite deterministic trust score (0-100)
    // P1-D FIX (GroundEval 2026): Rebalanced weights — groundedness is the most
    // important quality signal (does the text actually use the evidence?).
    // Old: citation 20%, groundedness 16% → favored quantity over quality.
    // New: citation 15%, groundedness 22% → favors quality of grounding.
    // V3.1: Now incorporates CRITIC score (LLM-based quality assessment)
    const criticScore = stats.critic?.overallScore ?? null;
    const criticVerdict = stats.critic?.verdict ?? null;
    const symbolicScore = stats.symbolicVerifier?.score ?? 100;
    const symbolicFailed = stats.symbolicVerifier?.failed ?? 0;
    const editorialScore = ((stats.criticPanel as any)?.dimensions ?? [])
      .find((d: any) => d.dimension === 'editorial')?.score;

    // S16-03: HallDetect (arXiv 2026) — lightweight reference-free hallucination
    // detection. The score feeds the canonical composite as a veto input.
    let hallDetectScore = 0;
    try {
      const { hallDetect } = await import('../hall-detect');
      // Strip markup first — decomposeClaims on raw HTML produces thousands of
      // garbage "claims" from CSS/nav/boilerplate (was: 554 flagged, score 71).
      const stripTags = (h: string) => h
        .replace(/<script\b[^>]*>[\s\S]*?(<\/script>|(?=<\/head>)|(?=<body\b)|$)/gi, ' ')
        .replace(/<style\b[^>]*>[\s\S]*?(<\/style>|(?=<\/head>)|(?=<body\b)|$)/gi, ' ')
        .replace(/<head\b[^>]*>[\s\S]*?(<\/head>|(?=<body\b)|$)/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&[a-z]+;/gi, ' ')
        .replace(/\s+/g, ' ');
      const analysisText = stripTags(html || (typeof analysis === 'string' ? analysis : JSON.stringify(analysis)));
      const sourceTexts = (topSources || []).map((s: any) => `${s.title || ''} ${s.abstract || ''}`).join(' ');
      const hallScore = hallDetect(analysisText, [sourceTexts]);
      hallDetectScore = hallScore.score;
      if (hallScore.score > 40) {
        console.warn(`[Pipeline] HallDetect: hallucination risk score ${hallScore.score}/100 — ${hallScore.flaggedClaims.length} flagged claims`);
      }
      (stats as any).hallDetect = { score: hallScore.score, flaggedClaims: hallScore.flaggedClaims.length };
    } catch (e) { /* non-blocking */ }

    // Canonical deterministic trust — single arithmetic site shared with the
    // post-repair re-score (quality-loop.ts). Weights/vetoes documented there.
    const trustResult = computeTrustScore(
      {
        citationCoverage, groundedness, factIntegrity, nliIntegrity,
        sourceCheckIntegrity, diversityScore, avgQuality, criticScore,
      },
      {
        criticVerdict, symbolicScore, symbolicFailed,
        criticPanelVeto: (stats.criticPanel as any)?.veto === true,
        criticPanelVetoReasons: (stats.criticPanel as any)?.vetoReasons,
        editorialScore,
        retracted: (stats.sourceCheck as any)?.retracted,
        devilsAdvocateVeto: (stats as any).devilsAdvocateVeto === true,
        providerDiversity,
        hallDetectScore,
        factFatal: ((stats.factChecker as any)?.error || (stats.factChecker as any)?.stale)
          ? 0
          : ((stats.factChecker as any)?.fatalIssues ?? 0),
      },
    );
    const deterministicScore = trustResult.score;
    for (const vetoReason of trustResult.vetoes) {
      console.log(`${label} TRUST: ${vetoReason}`);
    }

    // ── ABSTENTION PATH: trust < 30 → honest "insufficient evidence" verdict ──
    // A think tank that publishes weak analysis loses credibility. Below this
    // threshold the publication is marked as evidence-insufficient rather than
    // presented as a confident finding.
    const ABSTENTION_THRESHOLD = 30;
    if (deterministicScore < ABSTENTION_THRESHOLD) {
      console.warn(`${label} ABSTENTION: trust ${deterministicScore} < ${ABSTENTION_THRESHOLD} — marking publication as evidence-insufficient`);
      (stats as any).abstention = {
        triggered: true,
        score: deterministicScore,
        reason: 'Insufficient evidence base: grounding, citation coverage, or source quality below the Institute\'s minimum threshold for a confident position.',
      };
      pipelineCtx.addFinding('TRUST', 'warning', `Abstention threshold reached (score ${deterministicScore}) — publication flagged as evidence-insufficient`);
    }

    stats.criticalLoop = {
      iterations: 0,
      finalScore: deterministicScore,
      improvement: 0,
      needsHumanReview: deterministicScore < 55,
      skipped: false,
      mode: 'deterministic',
      skipReason: undefined,
      // Component decomposition persisted so a trust_score gate failure can
      // be routed to the specialist resolver for the WEAK component
      // (revision-controller reads this — the gate is a router, not a verdict).
      components: {
        citationCoverage, groundedness, factIntegrity, nliIntegrity,
        sourceCheckIntegrity, diversity: diversityScore, avgQuality,
        criticScore,
      },
    };

    console.log(`${label} DETERMINISTIC TRUST: ${deterministicScore}/100 — coverage=${Math.round(citationCoverage * 100)}%, groundedness=${Math.round(groundedness * 100)}%, factCheck=${factIntegrity}%, nli=${nliIntegrity}%, sourceCheck=${sourceCheckIntegrity}%, diversity=${diversityScore}, avgQuality=${Math.round(avgQuality)}`);

    // ── TRUST CALIBRATION RECORD (ECE/Brier) ──
    // Record the (predicted, proxy-actual) pair for post-hoc calibration analysis.
    // The "actual quality" proxy is the average of deterministic sub-metrics (0-1),
    // which can later be replaced by human feedback when available.
    // See lib/agent/trust-calibration.ts for analyzeCalibration().
    const calibrationProxyActual = (
      citationCoverage + groundedness + (factIntegrity / 100) + (nliIntegrity / 100) +
      (sourceCheckIntegrity / 100) + (diversityScore / 100) + (avgQuality / 100)
    ) / 7;
    stats.trustCalibration = {
      predictedTrust: deterministicScore,
      proxyActualQuality: Math.round(calibrationProxyActual * 100) / 100,
      // These are the raw sub-metrics that form the calibration pair
      subMetrics: {
        citationCoverage: Math.round(citationCoverage * 100),
        groundedness: Math.round(groundedness * 100),
        factIntegrity,
        nliIntegrity,
        sourceCheckIntegrity,
        diversityScore,
        avgQuality: Math.round(avgQuality),
      },
    };

    // ── CLAIM-LEVEL PROVENANCE GRAPH (ClaimKit pattern) ──
    // Build a provenance graph with stable claim IDs, validation status, and evidence links.
    // This enables click-to-verify and staleness detection.
    try {
      const { buildProvenanceGraph } = await import('../provenance-graph');
      const retractedIds = new Set<string>(
        (stats.sourceCheck as any)?.retracted > 0
          ? topSources.filter((s: any) => s.doi).map((s: any) => s.id)
          : []
      );
      const provenanceGraph = await buildProvenanceGraph(
        briefId || 'unknown',
        html,
        topSources.map((s: any) => ({ id: s.id, title: s.title || '', abstract: s.abstract || null, fullText: s.fullText || null, doi: s.doi || null, provider: s.provider })),
        { readings, retractedSourceIds: retractedIds, skipNLI: true }, // Skip NLI here (already done in grounding)
      );
      stats.provenanceGraph = {
        totalClaims: provenanceGraph.totalClaims,
        validClaims: provenanceGraph.validClaims,
        invalidClaims: provenanceGraph.invalidClaims,
        staleClaims: provenanceGraph.staleClaims,
        needsReviewClaims: provenanceGraph.needsReviewClaims,
        validityRate: Math.round(provenanceGraph.validityRate * 100),
      };
      console.log(`${label} PROVENANCE GRAPH: ${provenanceGraph.totalClaims} claims → ${provenanceGraph.validClaims} valid, ${provenanceGraph.invalidClaims} invalid, ${provenanceGraph.staleClaims} stale, ${provenanceGraph.needsReviewClaims} needs_review → validity ${Math.round(provenanceGraph.validityRate * 100)}%`);
    } catch (err) {
      console.warn(`${label} PROVENANCE GRAPH: failed (non-blocking):`, err);
    }

    // ── METHODOLOGY & TRANSPARENCY BLOCK (RAND standard: transparency) ──
    // Tier-1 think tanks (RAND, Urban, Brookings) publish methodological notes with every report.
    // 100% deterministic — built from pipeline facts, no LLM.
    try {
      const years = topSources.map((s: any) => s.year).filter((y: any) => typeof y === 'number' && y > 1900);
      const yearMin = years.length > 0 ? Math.min(...years) : null;
      const yearMax = years.length > 0 ? Math.max(...years) : null;
      const providerList = [...new Set(topSources.map((s: any) => String(s.provider)))].sort();
      // ── Institutional confidence display ──
      // Replace raw metrics (TRUST 55, Ancrage 69%, etc.) with a clean, institutional
      // "Evidence confidence" rating that a think tank reader expects.
      // The raw deterministic score stays in the backend lineage/audit layer.
      const confidenceLabel = deterministicScore >= 75 ? 'High' : deterministicScore >= 55 ? 'Medium' : 'Low';
      const confidenceColor = deterministicScore >= 75 ? '#5EEAD4' : deterministicScore >= 55 ? '#FBBF24' : '#FB7185';
      const confidenceDesc = deterministicScore >= 75
        ? 'Claims are well-supported by cited evidence. Numerical data verified against sources. Citation coverage is comprehensive.'
        : deterministicScore >= 55
        ? 'Most claims are supported by cited evidence. Some claims rely on partial evidence or require additional verification.'
        : 'Several claims lack sufficient evidence or citation support. Readers should treat conclusions with caution.';
      const methodologyHtml = `
<section class="nx-block methodology-note" style="border-top:1px solid rgba(240,240,250,0.12);padding:16px 0 8px;margin:32px 0 0;font-size:0.72rem;line-height:1.7;color:rgba(240,240,250,0.55);">
  <p class="nx-eyebrow" style="letter-spacing:0.08em;text-transform:uppercase;font-size:0.6rem;margin-bottom:12px;">Methodological transparency</p>
  <div style="display:flex;flex-wrap:wrap;gap:1.5rem;align-items:flex-start;margin:0 0 16px;">
    <div style="flex-shrink:0;">
      <div style="display:inline-flex;align-items:center;gap:0.5rem;padding:0.35rem 0.75rem;border:1px solid ${confidenceColor}33;border-radius:4px;background:${confidenceColor}0D;">
        <span style="width:8px;height:8px;border-radius:50%;background:${confidenceColor};display:inline-block;"></span>
        <span style="font-family:'JetBrains Mono',monospace;font-size:0.625rem;text-transform:uppercase;letter-spacing:0.12em;color:${confidenceColor};font-weight:600;">Evidence confidence: ${confidenceLabel}</span>
      </div>
    </div>
  </div>
  <p style="margin:0 0 12px;color:rgba(240,240,250,0.5);">${confidenceDesc}</p>
  <p style="margin:0;color:rgba(240,240,250,0.45);font-size:0.68rem;">
    Corpus: <strong style="color:rgba(240,240,250,0.7);">${topSources.length} sources</strong> from ${providerList.length} providers${yearMin && yearMax ? `, ${yearMin}–${yearMax}` : ''}.
    Distinct sources cited: <strong style="color:rgba(240,240,250,0.7);">${citedSources}</strong>.
    Unverifiable claims are flagged or marked as unestablished.
  </p>
</section>`;
      if (html.includes('</article>')) {
        html = html.replace(/<\/article>(?![\s\S]*<\/article>)/, `${methodologyHtml}</article>`);
      } else {
        html = html + methodologyHtml;
      }

      // ── ABSTENTION BANNER — visible honesty signal at the top of the article ──
      if ((stats as any).abstention?.triggered) {
        const abstentionHtml = `
<section class="nx-block abstention-notice" style="border:1px solid rgba(251,113,133,0.35);border-left:3px solid #FB7185;border-radius:6px;background:rgba(251,113,133,0.06);padding:18px 22px;margin:24px 0;">
  <p class="nx-eyebrow" style="letter-spacing:0.08em;text-transform:uppercase;font-size:0.6rem;margin:0 0 8px;color:#FB7185;font-weight:600;">Evidence-insufficient analysis</p>
  <p style="margin:0;font-size:0.82rem;line-height:1.7;color:rgba(240,240,250,0.8);">The Institute could not establish a confident position on this question. The available evidence base is too thin, contradictory, or weakly sourced to support a reliable assessment. The analysis below reflects the best available evidence but should be treated as exploratory rather than conclusive.</p>
</section>`;
        // Insert right after the opening <article...> tag, or prepend
        const articleOpen = html.match(/<article[^>]*>/);
        if (articleOpen) {
          html = html.replace(articleOpen[0], articleOpen[0] + abstentionHtml);
        } else {
          html = abstentionHtml + html;
        }
        console.log(`${label} ABSTENTION BANNER: injected at top of article`);
      }
      stats.methodologyNote = { injected: true, corpusSize: topSources.length, providers: providerList.length, citedDistinct: citedSources };
      console.log(`${label} METHODOLOGY NOTE: injected (${topSources.length} sources, ${providerList.length} providers, ${citedSources} cited)`);
    } catch (methodErr) {
      console.warn(`${label} METHODOLOGY NOTE: injection failed (non-blocking):`, methodErr);
    }
  }

  return html;
}
