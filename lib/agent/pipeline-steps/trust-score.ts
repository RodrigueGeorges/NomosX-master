/**
 * CANONICAL TRUST SCORE — single deterministic composite consumed by both
 * the post-evaluator scoring (evaluators-trust.ts) and the post-repair
 * re-score (quality-loop.ts). They previously blended different weights and
 * applied different veto sets — the loop could re-inflate a score the
 * canonical pass had capped (missing criticPanel/editorial-floor vetoes).
 *
 * Semantics identical to the evaluators-trust implementation: weighted
 * blend → ordered vetoes → clamp. Callers extract the components (the loop
 * legitimately recomputes coverage/groundedness on repaired HTML) and pass
 * veto state; the arithmetic lives here exactly once.
 */

export interface TrustComponents {
  citationCoverage: number;     // 0–1
  groundedness: number;         // 0–1
  factIntegrity: number;        // 0–100
  nliIntegrity: number;         // 0–100
  sourceCheckIntegrity: number; // 0–100
  diversityScore: number;       // 0–100
  avgQuality: number;           // 0–100
  criticScore: number | null;   // 0–100, null when unevaluated/stale
}

export interface TrustVetoes {
  criticVerdict?: string | null;
  symbolicScore?: number;          // 0–100
  symbolicFailed?: number;
  criticPanelVeto?: boolean;
  criticPanelVetoReasons?: string[];
  editorialScore?: number | null;  // panel 'editorial' dimension, /10
  retracted?: number;
  devilsAdvocateVeto?: boolean;
  providerDiversity?: number;
  hallDetectScore?: number;        // hallucination risk 0–100
  factFatal?: number;              // fact-checker fatal numerical discrepancies
  /** Evidence-independence audit verdict (deterministic embedding clusters). */
  evidenceIndependence?: 'independent' | 'thin' | 'collapsed' | null;
  /** Cited-source count backing the independence verdict. */
  evidenceCitedCount?: number;
}

export interface TrustScoreResult {
  score: number;
  /** Human-readable veto/floor decisions applied, in order. */
  vetoes: string[];
}

export function computeTrustScore(c: TrustComponents, v: TrustVetoes = {}): TrustScoreResult {
  // P1-D (GroundEval 2026): groundedness carries the most weight — whether
  // the text actually uses the evidence beats how much it cites.
  const W_COVERAGE = Number(process.env.TRUST_W_COVERAGE ?? 15);
  const W_GROUNDEDNESS = Number(process.env.TRUST_W_GROUNDEDNESS ?? 22);
  const W_FACT = Number(process.env.TRUST_W_FACT ?? 12);
  const W_NLI = Number(process.env.TRUST_W_NLI ?? 12);
  const W_SOURCE_CHECK = Number(process.env.TRUST_W_SOURCE_CHECK ?? 8);
  const W_DIVERSITY = Number(process.env.TRUST_W_DIVERSITY ?? 9);
  const W_QUALITY = Number(process.env.TRUST_W_QUALITY ?? 12);
  const W_CRITIC = Number(process.env.TRUST_W_CRITIC ?? 10);

  let score = Math.round(
    c.citationCoverage * W_COVERAGE +
    c.groundedness * W_GROUNDEDNESS +
    (c.factIntegrity / 100) * W_FACT +
    (c.nliIntegrity / 100) * W_NLI +
    (c.sourceCheckIntegrity / 100) * W_SOURCE_CHECK +
    (c.diversityScore / 100) * W_DIVERSITY +
    (c.avgQuality / 100) * W_QUALITY +
    (c.criticScore !== null ? (c.criticScore / 100) * W_CRITIC : 7)
  );

  const vetoes: string[] = [];
  const cap = (ceiling: number, reason: string) => {
    if (score > ceiling) { score = ceiling; vetoes.push(reason); }
  };

  // Symbolic verification veto — arithmetic/temporal errors found.
  if ((v.symbolicFailed ?? 0) > 0 && (v.symbolicScore ?? 100) < 70) {
    cap(55, `symbolic veto — ${v.symbolicFailed} arithmetic/temporal errors (score ${v.symbolicScore}%)`);
  }

  // Critic verdict/score vetoes — reject, then tiered severity bands.
  if (v.criticVerdict === 'reject') {
    cap(50, `critic reject veto`);
  }
  if (c.criticScore !== null && c.criticScore < 10) {
    cap(40, `critic HARD veto — score ${c.criticScore}/100`);
  } else if (c.criticScore !== null && c.criticScore < 25) {
    cap(55, `critic veto — score ${c.criticScore}/100`);
  } else if (c.criticScore !== null && c.criticScore < 60) {
    const penaltyPct = Math.round((60 - c.criticScore) * 0.37);
    const adjusted = Math.round(score * (100 - penaltyPct) / 100);
    if (adjusted < score) {
      vetoes.push(`critic penalty — score ${c.criticScore}/100, -${penaltyPct}%`);
      score = adjusted;
    }
  }

  // Critic-panel mustFix veto + editorial floor (≤4/10 is unpublishable).
  if (v.criticPanelVeto) {
    cap(55, `critic panel veto — ${(v.criticPanelVetoReasons ?? []).join('; ')}`);
  }
  if (typeof v.editorialScore === 'number' && v.editorialScore > 0 && v.editorialScore <= 4) {
    cap(60, `editorial floor — panel editorial ${v.editorialScore}/10 ≤ 4`);
  }

  // Retraction veto — any retracted source caps at 50.
  if ((v.retracted ?? 0) > 0) {
    cap(50, `retraction veto — ${v.retracted} retracted source(s)`);
  }

  // Quality floor — high-quality well-cited corpus floors at 60.
  if (c.avgQuality > 80 && c.citationCoverage > 0.60) {
    score = Math.max(score, 60);
  }

  // Grounding vetoes — <15% is the true hallucination floor, <40% caps at 55.
  if (c.groundedness < 0.15) {
    cap(45, `grounding veto — groundedness ${Math.round(c.groundedness * 100)}%`);
  } else if (c.groundedness < 0.40) {
    cap(55, `grounding warning — groundedness ${Math.round(c.groundedness * 100)}% < 40%`);
  }

  // Citation integrity veto — NLI integrity < 70% post-repair.
  if (c.nliIntegrity < 70) {
    cap(55, `citation integrity veto — NLI ${c.nliIntegrity}% < 70%`);
  }

  // Fact-integrity veto — fatal numerical discrepancies on a <50% integrity
  // artifact cap at 55 (12-point weight alone let 11 fatals ship at trust 82).
  if ((v.factFatal ?? 0) > 0 && c.factIntegrity < 50) {
    cap(55, `fact integrity veto — ${v.factFatal} fatal numerical discrepancies (integrity ${c.factIntegrity}%)`);
  }

  // Evidence-independence veto — cited documents collapsing into very few
  // embedding clusters means the evidence base is illusory breadth (same
  // study recycled under different IDs). Requires ≥4 citations so small
  // briefs aren't punished for a thin-but-honest corpus.
  if (v.evidenceIndependence === 'collapsed' && (v.evidenceCitedCount ?? 0) >= 4) {
    cap(55, `evidence independence veto — ${v.evidenceCitedCount} cited sources collapse to few independent clusters`);
  }

  // Devil's Advocate fragility veto.
  if (v.devilsAdvocateVeto) {
    cap(40, `devil's advocate veto — MAJOR_REVISION strength < 20`);
  }

  // Provider diversity veto — <3 providers is not robust evidence.
  if ((v.providerDiversity ?? 99) < 3) {
    cap(60, `diversity veto — ${v.providerDiversity} provider(s)`);
  }

  // HallDetect hallucination-risk veto.
  if ((v.hallDetectScore ?? 0) > 70 && score > 50) {
    cap(50, `HallDetect veto — risk ${v.hallDetectScore}/100`);
  }

  return { score: Math.min(100, Math.max(0, score)), vetoes };
}

/**
 * Canonical component extraction + re-score, shared by the post-render
 * quality loop and the persistence-tail integrity re-verify so the
 * arithmetic site stays single. `stats` is the pipeline stats bag; verdicts
 * marked `.stale` are nulled out (same rule as quality-loop). `groundedness`
 * override (0–1) is used when the caller just re-ran claim grounding and the
 * stats entry is not the freshest measurement. `citationCoverage` override
 * (0–1) lets callers probe the optimistic bound without mutating the HTML.
 */
export function rescoreTrustFromStats(
  stats: Record<string, any>,
  html: string,
  topSources: any[],
  opts?: { groundedness?: number; citationCoverage?: number },
): TrustScoreResult {
  const coverageTarget = Math.min(40, Math.max(15, Math.ceil(topSources.length * 0.35)));
  const citationCoverage = opts?.citationCoverage ?? (coverageTarget > 0 ? Math.min(1, countDistinctCitedSources(html) / coverageTarget) : 0);
  const groundedness = opts?.groundedness ?? ((stats.claimGrounding?.groundedness ?? 75) / 100);
  const factStats = stats.factChecker as any;
  const factIntegrity = factStats?.integrityScore ?? 80;
  const nliIntegrity = stats.citationVerifier?.integrity ?? 80;
  const sourceCheckIntegrity = (stats.sourceCheck as any)?.integrityScore ?? 85;
  const providerDiversity = new Set(topSources.map((s: any) => s.provider)).size;
  const diversityScore = Math.min(100, providerDiversity * 15);
  const avgQuality = topSources.length > 0
    ? topSources.reduce((sum: number, s: any) => sum + ((s.qualityScore || 0) > 0 ? s.qualityScore : (s.sourceQuality?.overall || 0)), 0) / topSources.length
    : 50;
  const criticScore = stats.critic?.stale ? null : (stats.critic?.overallScore ?? null);
  const criticVerdict = stats.critic?.stale ? null : (stats.critic?.verdict ?? null);
  const panel = stats.criticPanel?.stale ? null : (stats.criticPanel as any);
  const factFatal = (factStats?.error || factStats?.stale) ? 0 : (factStats?.fatalIssues ?? 0);
  return computeTrustScore(
    {
      citationCoverage, groundedness, factIntegrity, nliIntegrity,
      sourceCheckIntegrity, diversityScore, avgQuality, criticScore,
    },
    {
      criticVerdict,
      symbolicScore: stats.symbolicVerifier?.score ?? 100,
      symbolicFailed: stats.symbolicVerifier?.failed ?? 0,
      criticPanelVeto: panel?.veto === true,
      criticPanelVetoReasons: panel?.vetoReasons,
      editorialScore: (panel?.dimensions ?? []).find((d: any) => d.dimension === 'editorial')?.score,
      retracted: (stats.sourceCheck as any)?.retracted,
      devilsAdvocateVeto: (stats as any).devilsAdvocateVeto === true && !(stats.devilsAdvocate as any)?.stale,
      providerDiversity,
      hallDetectScore: (stats as any).hallDetect?.score ?? 0,
      factFatal,
      evidenceIndependence: (stats as any).evidenceIndependence?.verdict ?? null,
      evidenceCitedCount: (stats as any).evidenceIndependence?.citedCount ?? 0,
    },
  );
}

/** Distinct cited source indices — [SRC-N], data-evidence="EN", href="#ref-N". */
export function countDistinctCitedSources(html: string): number {
  const cited = new Set<number>();
  for (const m of html.matchAll(/\[SRC-(\d+)\]/g)) cited.add(parseInt(m[1], 10));
  for (const m of html.matchAll(/data-evidence="E(\d+)"/g)) cited.add(parseInt(m[1], 10));
  for (const m of html.matchAll(/href="#ref-(\d+)"/g)) cited.add(parseInt(m[1], 10));
  return cited.size;
}
