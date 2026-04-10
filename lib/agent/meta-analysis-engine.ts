/**
 * NomosX META-ANALYSIS ENGINE
 * 
 * Statistical aggregation of effect sizes across multiple sources.
 * This is what separates a real think tank from a glorified summarizer:
 * 
 * 1. Collects quantitative data from READER V3 outputs
 * 2. Standardizes effect sizes (Cohen's d, Hedges' g, odds ratios → common scale)
 * 3. Computes weighted pooled estimates (inverse-variance weighting)
 * 4. Assesses heterogeneity (I², Q-statistic, tau²)
 * 5. Detects publication bias (funnel plot asymmetry via Egger's test proxy)
 * 6. Produces forest-plot-ready data structures
 * 7. LLM-assisted interpretation of statistical findings
 * 
 * All computations are deterministic (no LLM) except final interpretation.
 */

import { callLLM } from '../llm/unified-llm';
import { AgentRole, assertPermission } from '../governance/index';

// ============================================================================
// TYPES
// ============================================================================

export interface EffectSizeEntry {
  sourceId: string;
  sourceLabel: string;
  measure: string;
  value: number;
  ci95Lower?: number;
  ci95Upper?: number;
  pValue?: number;
  sampleSize?: number;
  standardError?: number;
  weight?: number;
  context: string;
}

export interface PooledEstimate {
  value: number;
  ci95Lower: number;
  ci95Upper: number;
  standardError: number;
  zScore: number;
  pValue: number;
  model: "fixed" | "random";
}

export interface HeterogeneityStats {
  Q: number;
  df: number;
  pValue: number;
  I2: number;
  tau2: number;
  interpretation: "low" | "moderate" | "substantial" | "considerable";
}

export interface PublicationBiasAssessment {
  eggerIntercept: number;
  eggerPValue: number;
  biasDetected: boolean;
  trimAndFillAdjustment?: number;
  interpretation: string;
}

export interface ForestPlotEntry {
  label: string;
  effectSize: number;
  ci95Lower: number;
  ci95Upper: number;
  weight: number;
  sampleSize?: number;
}

export interface MetaAnalysisResult {
  question: string;
  effectMeasure: string;
  k: number;
  totalN: number;
  fixedEffect: PooledEstimate;
  randomEffects: PooledEstimate;
  recommended: "fixed" | "random";
  heterogeneity: HeterogeneityStats;
  publicationBias: PublicationBiasAssessment;
  forestPlot: ForestPlotEntry[];
  leaveOneOut: Array<{
    excluded: string;
    pooledWithout: number;
    changePercent: number;
  }>;
  interpretation: string;
  caveats: string[];
  costUsd: number;
}

// ============================================================================
// STATISTICAL FUNCTIONS (Pure, deterministic)
// ============================================================================

function seFromCI(lower: number, upper: number): number {
  return (upper - lower) / (2 * 1.96);
}

function seFromN(d: number, n: number): number {
  return Math.sqrt((4 / n) + (d * d) / (2 * n));
}

function orToD(or: number): number {
  return Math.log(or) * (Math.sqrt(3) / Math.PI);
}

function rToD(r: number): number {
  return (2 * r) / Math.sqrt(1 - r * r);
}

function standardizeEffectSize(entry: EffectSizeEntry): { d: number; se: number } {
  let d: number;
  let se: number;
  const measure = entry.measure.toLowerCase();

  if (measure.includes("cohen") || measure.includes("hedges") || measure === "d" || measure === "g") {
    d = entry.value;
  } else if (measure.includes("odds") || measure === "or") {
    d = orToD(entry.value);
  } else if (measure.includes("correlation") || measure === "r") {
    d = rToD(entry.value);
  } else if (measure.includes("risk ratio") || measure === "rr") {
    d = orToD(entry.value);
  } else if (measure.includes("hazard") || measure === "hr") {
    d = orToD(entry.value);
  } else if (measure.includes("percent")) {
    d = entry.value / 100;
  } else {
    d = entry.value;
  }

  if (entry.standardError) {
    se = entry.standardError;
  } else if (entry.ci95Lower !== undefined && entry.ci95Upper !== undefined) {
    se = seFromCI(entry.ci95Lower, entry.ci95Upper);
  } else if (entry.sampleSize) {
    se = seFromN(d, entry.sampleSize);
  } else {
    se = seFromN(d, 100);
  }

  return { d, se: Math.max(se, 0.001) };
}

function fixedEffectMA(effects: Array<{ d: number; se: number }>): PooledEstimate {
  const weights = effects.map(e => 1 / (e.se * e.se));
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const pooled = effects.reduce((sum, e, i) => sum + weights[i] * e.d, 0) / totalWeight;
  const pooledSE = Math.sqrt(1 / totalWeight);
  const z = pooled / pooledSE;
  const p = 2 * (1 - normalCDF(Math.abs(z)));

  return {
    value: round(pooled, 4),
    ci95Lower: round(pooled - 1.96 * pooledSE, 4),
    ci95Upper: round(pooled + 1.96 * pooledSE, 4),
    standardError: round(pooledSE, 4),
    zScore: round(z, 3),
    pValue: round(p, 6),
    model: "fixed",
  };
}

function randomEffectsMA(effects: Array<{ d: number; se: number }>): { estimate: PooledEstimate; tau2: number } {
  const k = effects.length;
  const weights = effects.map(e => 1 / (e.se * e.se));
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const fixedPooled = effects.reduce((sum, e, i) => sum + weights[i] * e.d, 0) / totalWeight;

  const Q = effects.reduce((sum, e, i) => sum + weights[i] * Math.pow(e.d - fixedPooled, 2), 0);
  const C = totalWeight - effects.reduce((sum, _, i) => sum + weights[i] * weights[i], 0) / totalWeight;
  const tau2 = Math.max(0, (Q - (k - 1)) / C);

  const reWeights = effects.map(e => 1 / (e.se * e.se + tau2));
  const reTotalWeight = reWeights.reduce((a, b) => a + b, 0);
  const pooled = effects.reduce((sum, e, i) => sum + reWeights[i] * e.d, 0) / reTotalWeight;
  const pooledSE = Math.sqrt(1 / reTotalWeight);
  const z = pooled / pooledSE;
  const p = 2 * (1 - normalCDF(Math.abs(z)));

  return {
    estimate: {
      value: round(pooled, 4),
      ci95Lower: round(pooled - 1.96 * pooledSE, 4),
      ci95Upper: round(pooled + 1.96 * pooledSE, 4),
      standardError: round(pooledSE, 4),
      zScore: round(z, 3),
      pValue: round(p, 6),
      model: "random",
    },
    tau2,
  };
}

function computeHeterogeneity(effects: Array<{ d: number; se: number }>, tau2: number): HeterogeneityStats {
  const k = effects.length;
  const weights = effects.map(e => 1 / (e.se * e.se));
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const fixedPooled = effects.reduce((sum, e, i) => sum + weights[i] * e.d, 0) / totalWeight;

  const Q = effects.reduce((sum, e, i) => sum + weights[i] * Math.pow(e.d - fixedPooled, 2), 0);
  const df = k - 1;
  const I2 = Math.max(0, ((Q - df) / Q) * 100);
  const pValue = 1 - chiSquaredCDF(Q, df);

  let interpretation: HeterogeneityStats["interpretation"];
  if (I2 < 25) interpretation = "low";
  else if (I2 < 50) interpretation = "moderate";
  else if (I2 < 75) interpretation = "substantial";
  else interpretation = "considerable";

  return { Q: round(Q, 3), df, pValue: round(pValue, 6), I2: round(I2, 1), tau2: round(tau2, 4), interpretation };
}

function assessPublicationBias(effects: Array<{ d: number; se: number }>): PublicationBiasAssessment {
  if (effects.length < 3) {
    return { eggerIntercept: 0, eggerPValue: 1, biasDetected: false, interpretation: "Insufficient studies (k < 3) for bias assessment" };
  }

  const x = effects.map(e => 1 / e.se);
  const y = effects.map(e => e.d / e.se);
  const n = x.length;
  const meanX = x.reduce((a, b) => a + b, 0) / n;
  const meanY = y.reduce((a, b) => a + b, 0) / n;
  const ssXX = x.reduce((sum, xi) => sum + (xi - meanX) ** 2, 0);
  const ssXY = x.reduce((sum, xi, i) => sum + (xi - meanX) * (y[i] - meanY), 0);

  const slope = ssXX > 0 ? ssXY / ssXX : 0;
  const intercept = meanY - slope * meanX;

  const residuals = y.map((yi, i) => yi - (intercept + slope * x[i]));
  const residualSE = Math.sqrt(residuals.reduce((sum, r) => sum + r * r, 0) / (n - 2));
  const interceptSE = residualSE * Math.sqrt(1 / n + meanX ** 2 / ssXX);
  const tStat = interceptSE > 0 ? Math.abs(intercept) / interceptSE : 0;
  const pValue = 2 * (1 - tDistCDF(tStat, n - 2));
  const biasDetected = pValue < 0.1;

  let interpretation: string;
  if (!biasDetected) {
    interpretation = "No significant evidence of publication bias detected (Egger's test p > 0.10)";
  } else if (intercept > 0) {
    interpretation = `Publication bias detected (Egger's intercept = ${round(intercept, 2)}, p = ${round(pValue, 3)}). Small studies tend to show larger positive effects.`;
  } else {
    interpretation = `Asymmetry detected (Egger's intercept = ${round(intercept, 2)}, p = ${round(pValue, 3)}). May reflect genuine heterogeneity rather than bias.`;
  }

  return { eggerIntercept: round(intercept, 3), eggerPValue: round(pValue, 4), biasDetected, interpretation };
}

function leaveOneOutAnalysis(
  effects: Array<{ d: number; se: number }>,
  labels: string[]
): Array<{ excluded: string; pooledWithout: number; changePercent: number }> {
  const fullPooled = randomEffectsMA(effects).estimate.value;

  return effects.map((_, i) => {
    const subset = effects.filter((_, j) => j !== i);
    if (subset.length < 2) return { excluded: labels[i], pooledWithout: 0, changePercent: 0 };
    const subPooled = randomEffectsMA(subset).estimate.value;
    const change = fullPooled !== 0 ? ((subPooled - fullPooled) / Math.abs(fullPooled)) * 100 : 0;
    return { excluded: labels[i], pooledWithout: round(subPooled, 4), changePercent: round(change, 1) };
  });
}

// ============================================================================
// MATH UTILITIES
// ============================================================================

function round(x: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(x * factor) / factor;
}

function normalCDF(x: number): number {
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
  const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.sqrt(2);
  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return 0.5 * (1.0 + sign * y);
}

function chiSquaredCDF(x: number, df: number): number {
  if (df <= 0 || x <= 0) return 0;
  const z = Math.pow(x / df, 1 / 3) - (1 - 2 / (9 * df));
  const denom = Math.sqrt(2 / (9 * df));
  return normalCDF(z / denom);
}

function tDistCDF(t: number, df: number): number {
  if (df > 30) return normalCDF(t);
  const x = df / (df + t * t);
  return 1 - 0.5 * incompleteBeta(df / 2, 0.5, x);
}

function incompleteBeta(a: number, b: number, x: number): number {
  if (x === 0 || x === 1) return x;
  const lnBeta = lgamma(a) + lgamma(b) - lgamma(a + b);
  const front = Math.exp(Math.log(x) * a + Math.log(1 - x) * b - lnBeta) / a;
  let sum = 1, term = 1;
  for (let n = 1; n <= 200; n++) {
    term *= (n - b) * x / (a + n);
    sum += term;
    if (Math.abs(term) < 1e-10) break;
  }
  return Math.min(1, Math.max(0, front * sum));
}

function lgamma(x: number): number {
  if (x <= 0) return 0;
  const c = [76.18009172947146, -86.50532032941677, 24.01409824083091,
    -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let y = x, tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (let j = 0; j < 6; j++) ser += c[j] / ++y;
  return -tmp + Math.log(2.5066282746310005 * ser / x);
}

// ============================================================================
// EMPTY RESULT FACTORY
// ============================================================================

function createEmptyResult(question: string, k: number): MetaAnalysisResult {
  const empty: PooledEstimate = { value: 0, ci95Lower: 0, ci95Upper: 0, standardError: 0, zScore: 0, pValue: 1, model: "fixed" };
  return {
    question,
    effectMeasure: "Cohen's d (standardized)",
    k,
    totalN: 0,
    fixedEffect: empty,
    randomEffects: { ...empty, model: "random" },
    recommended: "random",
    heterogeneity: { Q: 0, df: 0, pValue: 1, I2: 0, tau2: 0, interpretation: "low" },
    publicationBias: { eggerIntercept: 0, eggerPValue: 1, biasDetected: false, interpretation: "Insufficient data" },
    forestPlot: [],
    leaveOneOut: [],
    interpretation: `Insufficient quantitative data for meta-analysis (k = ${k}). At least 2 studies with extractable effect sizes are required.`,
    caveats: ["Insufficient data for statistical aggregation"],
    costUsd: 0,
  };
}

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

/**
 * Run a meta-analysis on quantitative data extracted by READER V3.
 */
export async function metaAnalysisEngine(
  question: string,
  readings: any[],
  sources: any[]
): Promise<MetaAnalysisResult> {
  assertPermission(AgentRole.ANALYST, "write:analysis");
  console.log(`[META-ANALYSIS] Starting for: "${question.slice(0, 80)}..."`);

  // ── STEP 1: Collect effect sizes from readings ──
  const entries: EffectSizeEntry[] = [];

  for (let i = 0; i < readings.length; i++) {
    const reading = readings[i];
    const source = sources[i];
    const quant = reading?.quantitative;
    if (!quant) continue;

    if (quant.effectSizes?.length) {
      for (const es of quant.effectSizes) {
        entries.push({
          sourceId: reading.sourceId || source?.id || `src-${i}`,
          sourceLabel: `SRC-${i + 1}`,
          measure: es.measure || "unknown",
          value: parseFloat(es.value) || 0,
          ci95Lower: es.ci95 ? parseFloat(es.ci95[0]) : undefined,
          ci95Upper: es.ci95 ? parseFloat(es.ci95[1]) : undefined,
          pValue: es.pValue ? parseFloat(es.pValue) : undefined,
          sampleSize: quant.sampleSizes?.[0]?.n ? parseInt(quant.sampleSizes[0].n) : undefined,
          context: es.context || "",
        });
      }
    }

    if (!quant.effectSizes?.length && quant.keyMetrics?.length) {
      for (const km of quant.keyMetrics) {
        const val = parseFloat(km.value);
        if (!isNaN(val)) {
          entries.push({
            sourceId: reading.sourceId || source?.id || `src-${i}`,
            sourceLabel: `SRC-${i + 1}`,
            measure: "percentage",
            value: val,
            sampleSize: quant.sampleSizes?.[0]?.n ? parseInt(quant.sampleSizes[0].n) : undefined,
            context: `${km.name}: ${km.value}${km.unit || ""}`,
          });
        }
      }
    }
  }

  console.log(`[META-ANALYSIS] Collected ${entries.length} effect sizes from ${readings.length} readings`);

  if (entries.length < 2) {
    console.warn(`[META-ANALYSIS] Insufficient data (${entries.length} effects). Need >= 2.`);
    return createEmptyResult(question, entries.length);
  }

  // ── STEP 2: Standardize ──
  const standardized = entries.map(e => ({
    ...standardizeEffectSize(e),
    label: e.sourceLabel,
    sampleSize: e.sampleSize,
  }));

  const effects = standardized.map(s => ({ d: s.d, se: s.se }));

  // ── STEP 3: Pooled estimates ──
  const fixed = fixedEffectMA(effects);
  const { estimate: random, tau2 } = randomEffectsMA(effects);

  // ── STEP 4: Heterogeneity ──
  const heterogeneity = computeHeterogeneity(effects, tau2);
  const recommended = heterogeneity.I2 > 50 ? "random" as const : "fixed" as const;

  // ── STEP 5: Publication bias ──
  const publicationBias = assessPublicationBias(effects);

  // ── STEP 6: Forest plot data ──
  const totalWeightSum = effects.reduce((sum, e) => sum + 1 / (e.se * e.se + tau2), 0);
  const forestPlot: ForestPlotEntry[] = standardized.map((s, i) => ({
    label: s.label,
    effectSize: round(s.d, 4),
    ci95Lower: round(s.d - 1.96 * s.se, 4),
    ci95Upper: round(s.d + 1.96 * s.se, 4),
    weight: round((1 / (s.se * s.se + tau2)) / totalWeightSum * 100, 1),
    sampleSize: s.sampleSize,
  }));

  // ── STEP 7: Leave-one-out ──
  const labels = standardized.map(s => s.label);
  const leaveOneOut = leaveOneOutAnalysis(effects, labels);

  // ── STEP 8: Total N ──
  const totalN = entries.reduce((sum, e) => sum + (e.sampleSize || 0), 0);

  // ── STEP 9: LLM interpretation ──
  console.log(`[META-ANALYSIS] Generating interpretation...`);
  const recommendedEstimate = recommended === "random" ? random : fixed;
  const maxSensitivity = Math.max(...leaveOneOut.map(l => Math.abs(l.changePercent)), 0);

  let interpretation = "";
  let caveats: string[] = [];
  let costUsd = 0;

  try {
    const llmResponse = await callLLM({
      messages: [{
        role: "system",
        content: `You are a biostatistician interpreting meta-analysis results for a policy audience. Be precise, honest about limitations, and avoid overstating findings.`
      }, {
        role: "user",
        content: `RESEARCH QUESTION: ${question}

META-ANALYSIS RESULTS (k = ${entries.length} studies, total N = ${totalN}):
- Pooled effect (${recommended} effects): d = ${recommendedEstimate.value} [${recommendedEstimate.ci95Lower}, ${recommendedEstimate.ci95Upper}], p = ${recommendedEstimate.pValue}
- Heterogeneity: I² = ${heterogeneity.I2}% (${heterogeneity.interpretation}), Q(${heterogeneity.df}) = ${heterogeneity.Q}, p = ${heterogeneity.pValue}
- Publication bias: ${publicationBias.biasDetected ? "DETECTED" : "Not detected"} (Egger's p = ${publicationBias.eggerPValue})
- Sensitivity: Most influential study removal changes estimate by ${maxSensitivity}%

Effect size context: Cohen's d of 0.2 = small, 0.5 = medium, 0.8 = large

Provide:
1. A 2-3 sentence plain-language interpretation of the pooled effect
2. 3-5 caveats about the reliability of this meta-analysis

Return JSON:
{
  "interpretation": "Plain-language interpretation...",
  "caveats": ["Caveat 1", "Caveat 2", "Caveat 3"]
}`
      }],
      temperature: 0.15,
      jsonMode: true,
      maxTokens: 1500,
      enableCache: true,
    });

    costUsd = llmResponse.costUsd;
    const parsed = JSON.parse(llmResponse.content);
    interpretation = parsed.interpretation || "";
    caveats = parsed.caveats || [];
  } catch (err) {
    console.warn(`[META-ANALYSIS] LLM interpretation failed:`, err);
    interpretation = `Pooled ${recommended}-effects estimate: d = ${recommendedEstimate.value} [${recommendedEstimate.ci95Lower}, ${recommendedEstimate.ci95Upper}], p = ${recommendedEstimate.pValue}. Heterogeneity is ${heterogeneity.interpretation} (I² = ${heterogeneity.I2}%).`;
    caveats = ["LLM interpretation unavailable — raw statistics provided"];
  }

  const result: MetaAnalysisResult = {
    question,
    effectMeasure: "Cohen's d (standardized)",
    k: entries.length,
    totalN,
    fixedEffect: fixed,
    randomEffects: random,
    recommended,
    heterogeneity,
    publicationBias,
    forestPlot,
    leaveOneOut,
    interpretation,
    caveats,
    costUsd,
  };

  console.log(`[META-ANALYSIS] ✅ Complete: k=${result.k}, pooled d=${recommendedEstimate.value}, I²=${heterogeneity.I2}%, bias=${publicationBias.biasDetected}, cost=$${costUsd.toFixed(4)}`);

  return result;
}
