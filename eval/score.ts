/**
 * NomosX Eval Scoring — toutes les métriques sont déterministes.
 * Aucun LLM ne participe au scoring.
 *
 * Métriques interdites (auto-référentielles) : trustScore, qualityScore,
 * publishability, overallStrength.
 */

import type { CorpusTopic } from "./corpus";
import { classifyDomain } from "./domain-tiers";

// ─── Types ────────────────────────────────────────────────────────

export interface EvalMetrics {
  groundingRate: number | null; // numéraux avec citation / total numéraux (null si 0 numéral)
  primarySourceRatio: number; // sources tier 1-2 / total classifié
  tier4Ratio: number; // sources tier 4 / total classifié
  unclassifiedRatio: number; // non classifié / total
  channelCoverage: number; // canaux couverts / canaux de la carte (stub: 0)
  gapResolutionRate: number; // gaps fermés / gaps ouverts (stub: 0)
  hypothesisResolved: number; // hypothèses supported+refuted / total
  inconclusiveRate: number; // hypothèses inconclusive / total
  partialRate: number; // hypothèses partially_supported / total
  refusalCorrectness: boolean; // refuse sur topic 2, ne refuse pas sur topic 1
  internalConsistency: number; // incohérences arithmétiques (doit = 0)
  costUsd: number;
  durationMs: number;
}

export interface MetricStats {
  mean: number;
  stddev: number;
  min: number;
  max: number;
  n: number;
}

export interface TopicEvalResult {
  topicId: string;
  status: string;
  metrics: EvalMetrics;
  rawHtml: string;
  sourceCount: number;
  wordCount: number;
  error?: string;
}

export interface TopicAggregate {
  topicId: string;
  statuses: string[];
  metricStats: Record<string, MetricStats>;
  refusalCorrectnessRate: number;
  runs: TopicEvalResult[];
}

export interface EvalSnapshot {
  timestamp: string;
  gitSha: string;
  gitBranch: string;
  pipelineConfig: Record<string, unknown>;
  fast: boolean;
  repeats: number;
  topicAggregates: TopicAggregate[];
  aggregate: {
    avgGroundingRate: number;
    avgPrimarySourceRatio: number;
    avgTier4Ratio: number;
    avgUnclassifiedRatio: number;
    avgHypothesisResolved: number;
    avgInconclusiveRate: number;
    avgPartialRate: number;
    refusalAccuracy: number;
    totalCostUsd: number;
    totalDurationMs: number;
    internalConsistencyViolations: number;
  };
}

// ─── Numeral extraction ────────────────────────────────────────────

interface NumeralOccurrence {
  value: string;
  sentence: string;
  hasCitation: boolean;
}

/**
 * Extract significant numerals from HTML text.
 * Excludes: dates, section numbers, IDs, years alone.
 * Includes: percentages, dollar amounts, amounts with units, effect sizes, p-values, sample sizes.
 *
 * Accepts BOTH citation formats:
 *   [SRC-N]  — pre-STEP-14 analysis
 *   [E-N]    — post-STEP-14 published HTML
 *   <sup class="cite">  — post-STEP-14 published HTML (rendered form)
 */
function extractNumerals(html: string): NumeralOccurrence[] {
  // Preserve <sup class="cite"> markers before stripping HTML tags.
  // The published HTML uses <sup class="cite"><a ...>E1</a></sup> which would
  // be destroyed by the tag stripper. Replace with a text marker first.
  const preserved = html.replace(
    /<sup[^>]*class="cite"[^>]*>.*?<\/sup>/gi,
    "[CITE]",
  );
  const text = preserved.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
  const sentences = text.split(/(?<=[.!?])\s+/).filter((s) => s.length > 20);

  const citationRegex = /\[SRC-\d+\]|\[E-\d+\]|\[CITE\]/i;

  const numeralPatterns = [
    /(\d+\.?\d*)\s*%/g,
    /\$\s?(\d+\.?\d*)\s*[BbMmKk]/g,
    /(\d+\.?\d*)\s*(?:billion|million|thousand|trillion)/gi,
    /(?:effect\s*size|cohen|d\s*=\s*)(\d+\.?\d*)/gi,
    /(?:p\s*[<>=]\s*)(\d+\.?\d*)/gi,
    /(?:n\s*=\s*)(\d[\d,]*)/gi,
    /(?:increase|decrease|rise|drop|fall|growth|decline)\s+(?:of\s+)?(\d+\.?\d*)\s*%/gi,
  ];

  const occurrences: NumeralOccurrence[] = [];
  const seen = new Set<string>();

  for (const sentence of sentences) {
    const hasCitation = citationRegex.test(sentence);

    for (const pattern of numeralPatterns) {
      const matches = [...sentence.matchAll(pattern)];
      for (const match of matches) {
        const value = match[0];
        const key = `${sentence.slice(0, 50)}|${value}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const pureYear = /^(\d{4})$/.test(value.trim());
        if (pureYear) {
          const year = parseInt(value.trim(), 10);
          if (year >= 1900 && year <= 2100) continue;
        }

        occurrences.push({ value, sentence: sentence.slice(0, 300), hasCitation });
      }
    }
  }

  return occurrences;
}

// ─── Arithmetic consistency check ──────────────────────────────────

function checkArithmeticConsistency(html: string): number {
  const text = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
  let violations = 0;

  const sentences = text.split(/(?<=[.!?])\s+/);
  for (const sentence of sentences) {
    const pctMatches = [...sentence.matchAll(/(\d+\.?\d*)\s*%/g)];
    if (pctMatches.length >= 2) {
      const values = pctMatches.map((m) => parseFloat(m[1]));
      if (
        sentence.match(/increase|decrease|share|proportion|total|account/i) &&
        Math.max(...values) - Math.min(...values) > 5
      ) {
        violations++;
      }
    }
  }

  const totalPattern = /(?:total|overall|combined)\s*(?:of\s+)?(\d+\.?\d*)\s*%/gi;
  const totalMatches = [...text.matchAll(totalPattern)];
  for (const totalMatch of totalMatches) {
    const claimed = parseFloat(totalMatch[1]);
    const start = Math.max(0, totalMatch.index! - 200);
    const end = Math.min(text.length, totalMatch.index! + 200);
    const context = text.slice(start, end);
    const components = [...context.matchAll(/(\d+\.?\d*)\s*%/g)].map((m) =>
      parseFloat(m[1]),
    );
    const totalIdx = components.indexOf(claimed);
    if (totalIdx >= 0) components.splice(totalIdx, 1);
    if (components.length >= 2) {
      const sum = components.reduce((a, b) => a + b, 0);
      if (Math.abs(sum - claimed) > 2 && Math.abs(sum - 100) > 2) {
        violations++;
      }
    }
  }

  return violations;
}

// ─── Source classification by domain ───────────────────────────────

interface SourceForClassification {
  url?: string;
  doi?: string;
  provider?: string;
}

function classifySources(sources: SourceForClassification[]): {
  tier12: number;
  tier4: number;
  unclassified: number;
  total: number;
} {
  let tier12 = 0;
  let tier4 = 0;
  let unclassified = 0;

  for (const s of sources) {
    if (s.doi && /^10\./.test(s.doi)) {
      tier12++;
      continue;
    }

    if (s.url) {
      try {
        const hostname = new URL(s.url).hostname.replace(/^www\./, "").toLowerCase();
        const tier = classifyDomain(hostname);
        if (tier === 1 || tier === 2) tier12++;
        else if (tier === 4) tier4++;
        else unclassified++;
      } catch {
        unclassified++;
      }
    } else {
      unclassified++;
    }
  }

  return { tier12, tier4, unclassified, total: sources.length };
}

// ─── Hypothesis extraction from stats ──────────────────────────────

function extractHypothesisMetrics(
  stats: Record<string, unknown>,
): { resolved: number; inconclusive: number; partial: number; total: number } {
  const hypothesisJudge = stats.hypothesisJudge as
    | { verdicts?: Array<{ verdict: string }> }
    | undefined;

  if (!hypothesisJudge?.verdicts || !Array.isArray(hypothesisJudge.verdicts)) {
    return { resolved: 0, inconclusive: 0, partial: 0, total: 0 };
  }

  const verdicts = hypothesisJudge.verdicts;
  const total = verdicts.length;
  const supported = verdicts.filter((v) => v.verdict === "supported").length;
  const refuted = verdicts.filter((v) => v.verdict === "refuted").length;
  const partial = verdicts.filter((v) => v.verdict === "partially_supported").length;
  const inconclusive = verdicts.filter((v) => v.verdict === "inconclusive").length;

  return {
    resolved: total > 0 ? (supported + refuted) / total : 0,
    inconclusive: total > 0 ? inconclusive / total : 0,
    partial: total > 0 ? partial / total : 0,
    total,
  };
}

// ─── Main scoring function ─────────────────────────────────────────

export function scoreTopic(
  topic: CorpusTopic,
  pipelineOutput: {
    status: string;
    html: string;
    sources: SourceForClassification[];
    costUsd: number;
    durationMs: number;
    stats: Record<string, unknown>;
  },
): TopicEvalResult {
  const numerals = extractNumerals(pipelineOutput.html);
  const grounded = numerals.filter((n) => n.hasCitation).length;
  const groundingRate = numerals.length > 0 ? grounded / numerals.length : null;

  const { tier12, tier4, unclassified, total } = classifySources(
    pipelineOutput.sources,
  );
  const classified = total - unclassified;
  const primarySourceRatio = classified > 0 ? tier12 / classified : 0;
  const tier4Ratio = classified > 0 ? tier4 / classified : 0;
  const unclassifiedRatio = total > 0 ? unclassified / total : 0;

  const internalConsistency = checkArithmeticConsistency(pipelineOutput.html);

  const refused = ["held", "draft", "review", "error"].includes(
    pipelineOutput.status,
  );
  const refusalCorrectness = topic.shouldRefuse ? refused : !refused;

  const hypo = extractHypothesisMetrics(pipelineOutput.stats);

  const metrics: EvalMetrics = {
    groundingRate,
    primarySourceRatio,
    tier4Ratio,
    unclassifiedRatio,
    channelCoverage: 0, // TODO WO-4: mechanism map
    gapResolutionRate: 0, // TODO WO-3: gap resolver
    hypothesisResolved: hypo.resolved,
    inconclusiveRate: hypo.inconclusive,
    partialRate: hypo.partial,
    refusalCorrectness,
    internalConsistency,
    costUsd: pipelineOutput.costUsd,
    durationMs: pipelineOutput.durationMs,
  };

  return {
    topicId: topic.id,
    status: pipelineOutput.status,
    metrics,
    rawHtml: pipelineOutput.html,
    sourceCount: total,
    wordCount: pipelineOutput.html.replace(/<[^>]*>/g, " ").split(/\s+/).filter(Boolean).length,
  };
}

// ─── Statistical aggregation across repeats ────────────────────────

function computeStats(values: number[]): MetricStats {
  const n = values.length;
  if (n === 0) return { mean: 0, stddev: 0, min: 0, max: 0, n: 0 };
  const mean = values.reduce((s, v) => s + v, 0) / n;
  const variance =
    n > 1
      ? values.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1)
      : 0;
  const stddev = Math.sqrt(variance);
  return { mean, stddev, min: Math.min(...values), max: Math.max(...values), n };
}

const NUMERIC_METRICS: Array<keyof EvalMetrics> = [
  "groundingRate",
  "primarySourceRatio",
  "tier4Ratio",
  "unclassifiedRatio",
  "channelCoverage",
  "gapResolutionRate",
  "hypothesisResolved",
  "inconclusiveRate",
  "partialRate",
  "internalConsistency",
  "costUsd",
  "durationMs",
];

export function aggregateTopicRuns(
  topicId: string,
  runs: TopicEvalResult[],
): TopicAggregate {
  const metricStats: Record<string, MetricStats> = {};

  for (const metric of NUMERIC_METRICS) {
    const values = runs
      .map((r) => r.metrics[metric])
      .filter((v): v is number => typeof v === "number" && v !== null) as number[];
    metricStats[metric] = computeStats(values);
  }

  const refusalCorrectnessRate =
    runs.length > 0
      ? runs.filter((r) => r.metrics.refusalCorrectness).length / runs.length
      : 0;

  return {
    topicId,
    statuses: runs.map((r) => r.status),
    metricStats,
    refusalCorrectnessRate,
    runs: runs.map((r) => ({ ...r, rawHtml: r.rawHtml.slice(0, 500) })),
  };
}

// ─── Aggregate across topics ───────────────────────────────────────

export function aggregateResults(
  topicAggregates: TopicAggregate[],
): EvalSnapshot["aggregate"] {
  const valid = topicAggregates.filter((t) =>
    t.statuses.some((s) => s !== "error"),
  );

  const avgMetric = (key: keyof EvalMetrics): number => {
    const means = valid
      .map((t) => t.metricStats[key]?.mean)
      .filter((v): v is number => v !== undefined && v !== null && Number.isFinite(v)) as number[];
    return means.length > 0
      ? means.reduce((s, v) => s + v, 0) / means.length
      : 0;
  };

  const refusalCorrect = valid.filter(
    (t) => t.refusalCorrectnessRate >= 0.5,
  ).length;

  const totalCost = valid.reduce(
    (s, t) => s + (t.metricStats.costUsd?.mean ?? 0) * (t.metricStats.costUsd?.n ?? 0),
    0,
  );
  const totalDuration = valid.reduce(
    (s, t) =>
      s + (t.metricStats.durationMs?.mean ?? 0) * (t.metricStats.durationMs?.n ?? 0),
    0,
  );
  const consistencyViolations = valid.reduce(
    (s, t) => s + Math.round(t.metricStats.internalConsistency?.mean ?? 0),
    0,
  );

  return {
    avgGroundingRate: avgMetric("groundingRate"),
    avgPrimarySourceRatio: avgMetric("primarySourceRatio"),
    avgTier4Ratio: avgMetric("tier4Ratio"),
    avgUnclassifiedRatio: avgMetric("unclassifiedRatio"),
    avgHypothesisResolved: avgMetric("hypothesisResolved"),
    avgInconclusiveRate: avgMetric("inconclusiveRate"),
    avgPartialRate: avgMetric("partialRate"),
    refusalAccuracy: valid.length > 0 ? refusalCorrect / valid.length : 0,
    totalCostUsd: totalCost,
    totalDurationMs: totalDuration,
    internalConsistencyViolations: consistencyViolations,
  };
}

// ─── Snapshot comparison ───────────────────────────────────────────

export interface MetricDelta {
  metric: string;
  previous: number;
  current: number;
  delta: number;
  twoSigma: number;
  verdict: "SIGNIFICATIF" | "BRUIT";
}

export function compareSnapshots(
  previous: EvalSnapshot,
  current: EvalSnapshot,
): MetricDelta[] {
  const deltas: MetricDelta[] = [];
  const prev = previous.aggregate;
  const curr = current.aggregate;

  const computeTwoSigma = (
    snapshot: EvalSnapshot,
    metric: string,
  ): number => {
    const topicStddevs = snapshot.topicAggregates
      .map((t) => t.metricStats[metric]?.stddev)
      .filter((v) => v !== undefined && Number.isFinite(v)) as number[];
    if (topicStddevs.length === 0) return 0;
    const avgStddev =
      topicStddevs.reduce((s, v) => s + v, 0) / topicStddevs.length;
    return 2 * avgStddev;
  };

  const compare = (metric: string, p: number, c: number): void => {
    const delta = c - p;
    const twoSigma = computeTwoSigma(previous, metric);
    const verdict: MetricDelta["verdict"] =
      twoSigma > 0 && Math.abs(delta) >= twoSigma ? "SIGNIFICATIF" : "BRUIT";
    deltas.push({ metric, previous: p, current: c, delta, twoSigma, verdict });
  };

  compare("avgGroundingRate", prev.avgGroundingRate, curr.avgGroundingRate);
  compare("avgPrimarySourceRatio", prev.avgPrimarySourceRatio, curr.avgPrimarySourceRatio);
  compare("avgTier4Ratio", prev.avgTier4Ratio, curr.avgTier4Ratio);
  compare("avgUnclassifiedRatio", prev.avgUnclassifiedRatio, curr.avgUnclassifiedRatio);
  compare("avgHypothesisResolved", prev.avgHypothesisResolved, curr.avgHypothesisResolved);
  compare("avgInconclusiveRate", prev.avgInconclusiveRate, curr.avgInconclusiveRate);
  compare("avgPartialRate", prev.avgPartialRate ?? 0, curr.avgPartialRate ?? 0);
  compare("refusalAccuracy", prev.refusalAccuracy, curr.refusalAccuracy);
  compare("totalCostUsd", prev.totalCostUsd, curr.totalCostUsd);
  compare("totalDurationMs", prev.totalDurationMs, curr.totalDurationMs);
  compare("internalConsistencyViolations", prev.internalConsistencyViolations, curr.internalConsistencyViolations);

  return deltas;
}
