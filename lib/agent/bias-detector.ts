/**
 * Bias Detector — systematic detection of common biases in the source corpus
 * and generated analysis.
 *
 * This is a deterministic, LLM-free check that flags:
 * - Provider concentration (selection bias)
 * - Geographic skew (sources from one region only)
 * - Temporal skew (all sources from same year/period)
 * - Methodological monoculture (all sources same type)
 * - Publication bias (only positive results reported)
 */

export interface BiasFinding {
  biasType: "selection" | "geographic" | "temporal" | "methodological" | "publication";
  severity: "low" | "medium" | "high";
  description: string;
  evidence: string;
  recommendation: string;
}

export interface BiasReport {
  biases: BiasFinding[];
  overallBiasRisk: number; // 0-1, higher = more biased
  sourceDiversityScore: number; // 0-1
}

/**
 * Detect biases in the source corpus.
 *
 * @param sources Array of sources with metadata
 * @param analysisText The generated analysis text (for publication bias check)
 */
export function detectBiases(
  sources: Array<{
    id: string;
    provider?: string | null;
    year?: number | null;
    type?: string | null;
    title?: string | null;
    abstract?: string | null;
    institutions?: Array<{ country?: string | null }>;
  }>,
  analysisText?: string
): BiasReport {
  const biases: BiasFinding[] = [];
  const totalSources = sources.length;

  if (totalSources < 3) {
    return {
      biases: [],
      overallBiasRisk: 0,
      sourceDiversityScore: 1,
    };
  }

  // 1. SELECTION BIAS — provider concentration
  const providerCounts: Record<string, number> = {};
  for (const s of sources) {
    const p = s.provider || "unknown";
    providerCounts[p] = (providerCounts[p] || 0) + 1;
  }
  const topProviderShare = Math.max(...Object.values(providerCounts)) / totalSources;
  if (topProviderShare > 0.5) {
    const topProvider = Object.entries(providerCounts).find(([, c]) => c / totalSources === topProviderShare)?.[0];
    biases.push({
      biasType: "selection",
      severity: topProviderShare > 0.7 ? "high" : "medium",
      description: `Provider concentration: ${topProvider} accounts for ${Math.round(topProviderShare * 100)}% of sources`,
      evidence: `${Object.entries(providerCounts).map(([p, c]) => `${p}: ${c}`).join(", ")}`,
      recommendation: "Diversify source providers to reduce selection bias",
    });
  }

  // 2. GEOGRAPHIC SKEW — country distribution
  const countryCounts: Record<string, number> = {};
  for (const s of sources) {
    const countries = s.institutions?.map((i) => i.country).filter(Boolean) || [];
    if (countries.length === 0) {
      countryCounts["unknown"] = (countryCounts["unknown"] || 0) + 1;
    } else {
      for (const c of countries) {
        if (c) countryCounts[c] = (countryCounts[c] || 0) + 1;
      }
    }
  }
  const knownCountries = Object.entries(countryCounts).filter(([c]) => c !== "unknown");
  if (knownCountries.length > 0) {
    const topCountryShare = Math.max(...knownCountries.map(([, c]) => c)) / knownCountries.reduce((a, [, c]) => a + c, 0);
    if (topCountryShare > 0.6 && knownCountries.length > 1) {
      const topCountry = knownCountries.find(([, c]) => c / knownCountries.reduce((a, [, cc]) => a + cc, 0) === topCountryShare)?.[0];
      biases.push({
        biasType: "geographic",
        severity: topCountryShare > 0.8 ? "high" : "medium",
        description: `Geographic skew: ${topCountry} dominates with ${Math.round(topCountryShare * 100)}% of known-affiliated sources`,
        evidence: knownCountries.map(([c, n]) => `${c}: ${n}`).join(", "),
        recommendation: "Include sources from other geographic regions for balance",
      });
    }
  }

  // 3. TEMPORAL SKEW — year distribution
  const yearCounts: Record<number, number> = {};
  for (const s of sources) {
    if (s.year) yearCounts[s.year] = (yearCounts[s.year] || 0) + 1;
  }
  const years = Object.keys(yearCounts).map(Number);
  if (years.length > 0) {
    const yearSpan = Math.max(...years) - Math.min(...years);
    const topYearShare = Math.max(...Object.values(yearCounts)) / totalSources;
    if (yearSpan <= 2 && totalSources > 5) {
      biases.push({
        biasType: "temporal",
        severity: "medium",
        description: `Temporal skew: all sources from ${Math.min(...years)}–${Math.max(...years)} (${yearSpan + 1} year span)`,
        evidence: years.map((y) => `${y}: ${yearCounts[y]}`).join(", "),
        recommendation: "Include older sources for historical context and longitudinal perspective",
      });
    } else if (topYearShare > 0.4) {
      const topYear = Object.entries(yearCounts).find(([, c]) => c / totalSources === topYearShare)?.[0];
      biases.push({
        biasType: "temporal",
        severity: "low",
        description: `Temporal concentration: ${topYear} accounts for ${Math.round(topYearShare * 100)}% of sources`,
        evidence: `Year ${topYear}: ${yearCounts[Number(topYear)]} of ${totalSources} sources`,
        recommendation: "Spread source selection across more years",
      });
    }
  }

  // 4. METHODOLOGICAL MONOCULTURE — source type distribution
  const typeCounts: Record<string, number> = {};
  for (const s of sources) {
    const t = s.type || "unknown";
    typeCounts[t] = (typeCounts[t] || 0) + 1;
  }
  const knownTypes = Object.entries(typeCounts).filter(([t]) => t !== "unknown");
  if (knownTypes.length === 1 && totalSources > 5) {
    biases.push({
      biasType: "methodological",
      severity: "medium",
      description: `Methodological monoculture: all sources are type "${knownTypes[0][0]}"`,
      evidence: `${knownTypes[0][0]}: ${knownTypes[0][1]} sources`,
      recommendation: "Include sources with diverse methodological approaches (RCTs, observational, theoretical, etc.)",
    });
  }

  // 5. PUBLICATION BIAS — only positive/significant results in analysis
  if (analysisText) {
    const lowerText = analysisText.toLowerCase();
    const positiveWords = ["significant", "positive", "effective", "successful", "confirmed", "proven", "demonstrated"];
    const negativeWords = ["insignificant", "negative", "ineffective", "unsuccessful", "refuted", "failed", "no effect", "null result"];
    const positiveCount = positiveWords.reduce((acc, w) => acc + (lowerText.match(new RegExp(w, "g")) || []).length, 0);
    const negativeCount = negativeWords.reduce((acc, w) => acc + (lowerText.match(new RegExp(w, "g")) || []).length, 0);
    if (positiveCount > 5 && negativeCount === 0) {
      biases.push({
        biasType: "publication",
        severity: "low",
        description: `Possible publication bias: analysis mentions ${positiveCount} positive terms and 0 negative/null-result terms`,
        evidence: `Positive: ${positiveCount}, Negative: ${negativeCount}`,
        recommendation: "Acknowledge null or negative findings if they exist in the source corpus",
      });
    }
  }

  // Compute overall risk
  const severityWeights = { low: 0.2, medium: 0.4, high: 0.7 };
  const overallBiasRisk = biases.length > 0
    ? Math.min(1, biases.reduce((acc, b) => acc + severityWeights[b.severity], 0) / biases.length)
    : 0;

  // Source diversity score (inverse of bias risk)
  const providerDiversity = Object.keys(providerCounts).length / totalSources;
  const yearDiversity = years.length > 0 ? years.length / (Math.max(...years) - Math.min(...years) + 1) : 1;
  const sourceDiversityScore = Math.min(1, (providerDiversity + yearDiversity) / 2);

  return {
    biases,
    overallBiasRisk,
    sourceDiversityScore,
  };
}
