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
 * - Funding bias (conflict of interest — sources funded by interested parties)
 * - Institutional bias (source-type-specific biases: intelligence threat inflation,
 *   NGO advocacy framing, think-tank political orientation, international-org
 *   consensus-seeking, AI-lab commercial capability inflation)
 */

export interface BiasFinding {
  biasType: "selection" | "geographic" | "temporal" | "methodological" | "publication" | "funding" | "institutional";
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
 * Known conflict-of-interest funders.
 * Sources funded by these organizations should be flagged when the research
 * topic overlaps with the funder's commercial interests.
 *
 * Based on Crossref Funder Registry + manual curation of well-documented COI cases.
 */
const COI_FUNDERS: Array<{ name: string; patterns: string[]; industry: string }> = [
  // Tobacco industry
  { name: 'Philip Morris', patterns: ['philip morris', 'pmi', 'altria'], industry: 'tobacco' },
  { name: 'British American Tobacco', patterns: ['british american tobacco', 'bat'], industry: 'tobacco' },
  { name: 'Japan Tobacco', patterns: ['japan tobacco', 'jti'], industry: 'tobacco' },
  { name: 'RJ Reynolds', patterns: ['rj reynolds', 'rjr'], industry: 'tobacco' },
  // Fossil fuel
  { name: 'ExxonMobil', patterns: ['exxon', 'exxonmobil'], industry: 'fossil fuel' },
  { name: 'Shell', patterns: ['shell oil', 'royal dutch shell'], industry: 'fossil fuel' },
  { name: 'BP', patterns: ['bp oil', 'british petroleum'], industry: 'fossil fuel' },
  { name: 'Chevron', patterns: ['chevron'], industry: 'fossil fuel' },
  { name: 'Koch Foundation', patterns: ['koch', 'charles koch'], industry: 'fossil fuel' },
  { name: 'American Petroleum Institute', patterns: ['american petroleum institute', 'api'], industry: 'fossil fuel' },
  // Pharmaceuticals
  { name: 'Pfizer', patterns: ['pfizer'], industry: 'pharmaceutical' },
  { name: 'Johnson & Johnson', patterns: ['johnson & johnson', 'j&j'], industry: 'pharmaceutical' },
  { name: 'Novartis', patterns: ['novartis'], industry: 'pharmaceutical' },
  { name: 'Merck', patterns: ['merck'], industry: 'pharmaceutical' },
  // Chemical / agribusiness
  { name: 'Monsanto/Bayer', patterns: ['monsanto', 'bayer crop'], industry: 'agribusiness' },
  { name: 'Syngenta', patterns: ['syngenta'], industry: 'agribusiness' },
  // Tech
  { name: 'Google/Alphabet', patterns: ['google', 'alphabet'], industry: 'tech' },
  { name: 'Meta/Facebook', patterns: ['meta ', 'facebook'], industry: 'tech' },
  { name: 'Microsoft', patterns: ['microsoft'], industry: 'tech' },
];

/**
 * Institutional source-type registry.
 * Maps NomosX providers to their source type and characteristic institutional
 * biases. Used to detect corpus-level institutional bias patterns.
 */
interface SourceTypeProfile {
  type: string;
  patterns: string[];
  biasName: string;
  biasDescription: string;
  recommendation: string;
}

const INSTITUTIONAL_SOURCE_TYPES: SourceTypeProfile[] = [
  {
    type: 'intelligence',
    patterns: ['mi5', 'gchq', 'europol', 'interpol', 'bellingcat', 'cia-foia', 'cia', 'nsa', 'fbi', 'mossad', 'dgse', 'bnd'],
    biasName: 'Intelligence threat inflation',
    biasDescription: 'Intelligence agencies have institutional incentives to overstate threats (budget/mandate justification). Classification bias means only declassified fragments are visible. National perspective bias frames threats through the agency\'s government priorities.',
    recommendation: 'Cross-check intelligence threat claims against academic and NGO field evidence. Note that absence of declassified data does not equal absence of activity.',
  },
  {
    type: 'ngo',
    patterns: ['amnesty', 'human rights watch', 'hrw', 'transparency international', 'doctors without borders', 'msf', 'oxfam', 'save the children', 'reporters without borders', 'rsf'],
    biasName: 'NGO advocacy framing',
    biasDescription: 'NGOs have a mission mandate to highlight violations. Advocacy-oriented framing may overrepresent severity relative to baseline and underreport contexts where violations are absent.',
    recommendation: 'Corroborate NGO violation reports with international-org statistics or academic field studies for scale validation.',
  },
  {
    type: 'think-tank-conservative',
    patterns: ['heritage', 'american enterprise institute', 'aei', 'hoover', 'manhattan institute'],
    biasName: 'Conservative think-tank orientation',
    biasDescription: 'Conservative think tanks frame analyses through free-market, limited-government, and traditionalist lenses. Policy recommendations skew toward deregulation and security.',
    recommendation: 'Balance with progressive or centrist think-tank analysis on the same topic.',
  },
  {
    type: 'think-tank-libertarian',
    patterns: ['cato', 'reason foundation', 'mercatus'],
    biasName: 'Libertarian think-tank orientation',
    biasDescription: 'Libertarian think tanks frame analyses through individual-liberty and minimal-state lenses. May underweight collective-action problems and market failures.',
    recommendation: 'Balance with analyses that account for externalities and public-goods dimensions.',
  },
  {
    type: 'think-tank-progressive',
    patterns: ['center for american progress', 'cap ', 'brookings', 'economic policy institute', 'epi'],
    biasName: 'Progressive think-tank orientation',
    biasDescription: 'Progressive think tanks frame analyses through equity, regulation, and social-justice lenses. May overweight structural explanations and underweight individual-agency factors.',
    recommendation: 'Balance with conservative or libertarian perspectives on the same topic.',
  },
  {
    type: 'think-tank-centrist',
    patterns: ['carnegie', 'chatham house', 'ifri', 'iris', 'csis', 'rand'],
    biasName: 'Centrist/establishment think-tank orientation',
    biasDescription: 'Centrist think tanks tend toward establishment consensus and may underrepresent heterodox or radical perspectives. Foreign-policy-focused institutes may reflect their nation\'s strategic interests.',
    recommendation: 'Include heterodox and non-Western think-tank perspectives to challenge establishment consensus.',
  },
  {
    type: 'international-org',
    patterns: ['wto', 'icc', 'unhcr', 'ilo', 'un ', 'who', 'unesco', 'world bank', 'imf', 'oecd', 'nato', 'fao', 'unicef'],
    biasName: 'International organization consensus-seeking',
    biasDescription: 'International organizations use diplomatic language and seek consensus among member states, which may downplay conflicts between members. Official positions reflect the lowest common denominator, not the strongest analysis.',
    recommendation: 'Supplement official positions with independent academic and NGO assessments that are not constrained by diplomatic consensus.',
  },
  {
    type: 'ai-lab',
    patterns: ['openai', 'deepmind', 'anthropic', 'meta ai', 'google ai', 'mistral', 'cohere', 'stability ai'],
    biasName: 'AI lab commercial capability inflation',
    biasDescription: 'AI labs have commercial incentives to overstate capabilities (to attract investment and users) and may engage in "safety theater" (overstating risks to favor regulatory moats that entrench incumbents). Capability claims may not be independently reproduced.',
    recommendation: 'Verify AI-lab capability claims against peer-reviewed academic benchmarks. Distinguish marketing claims from published results. Note potential regulatory-capture motives in safety-risk framing.',
  },
];

/**
 * Classify a source's provider into an institutional source type.
 */
function classifySourceType(provider: string): SourceTypeProfile | null {
  const lower = (provider || '').toLowerCase();
  for (const profile of INSTITUTIONAL_SOURCE_TYPES) {
    if (profile.patterns.some(p => lower.includes(p))) {
      return profile;
    }
  }
  return null;
}

/**
 * Check if a funder name matches a known conflict-of-interest funder.
 */
function matchCOIFunder(funderName: string): { name: string; industry: string } | null {
  const lower = funderName.toLowerCase();
  for (const coi of COI_FUNDERS) {
    if (coi.patterns.some(p => lower.includes(p))) {
      return { name: coi.name, industry: coi.industry };
    }
  }
  return null;
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
    funders?: Array<{ name: string; doi?: string | null; award?: string | null }>;
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

  // 6. FUNDING BIAS — conflict of interest detection
  // Checks if sources are funded by organizations with known commercial interests
  // in the research topic. Uses Crossref Funder Registry data (already in raw metadata).
  const coiFindings: Array<{ sourceTitle: string; funder: string; industry: string }> = [];
  for (const s of sources) {
    if (!s.funders || s.funders.length === 0) continue;
    for (const funder of s.funders) {
      const match = matchCOIFunder(funder.name);
      if (match) {
        coiFindings.push({
          sourceTitle: s.title?.slice(0, 60) || s.id,
          funder: match.name,
          industry: match.industry,
        });
      }
    }
  }
  if (coiFindings.length > 0) {
    // Group by industry
    const byIndustry: Record<string, number> = {};
    for (const c of coiFindings) {
      byIndustry[c.industry] = (byIndustry[c.industry] || 0) + 1;
    }
    const topIndustry = Object.entries(byIndustry).sort((a, b) => b[1] - a[1])[0];
    const severity = coiFindings.length >= 3 ? "high" : coiFindings.length >= 2 ? "medium" : "low";
    biases.push({
      biasType: "funding",
      severity,
      description: `Conflict of interest: ${coiFindings.length} source(s) funded by ${topIndustry[0]} industry entities`,
      evidence: coiFindings.slice(0, 5).map(c => `"${c.sourceTitle}..." funded by ${c.funder} (${c.industry})`).join("; "),
      recommendation: "Disclose funding sources in the analysis. Consider seeking independently-funded sources on the same topic.",
    });
  }

  // NomosX: 7. INSTITUTIONAL BIAS — Western-centric sources, elite institution dominance
  const westernCountries = new Set([
    'US', 'United States', 'USA', 'GB', 'United Kingdom', 'UK', 'DE', 'Germany',
    'FR', 'France', 'CA', 'Canada', 'AU', 'Australia', 'NL', 'Netherlands',
    'SE', 'Sweden', 'CH', 'Switzerland', 'NO', 'Norway', 'DK', 'Denmark',
    'FI', 'Finland', 'BE', 'Belgium', 'AT', 'Austria', 'IE', 'Ireland',
  ]);
  const globalSouthCountries = new Set([
    'CN', 'China', 'IN', 'India', 'BR', 'Brazil', 'ZA', 'South Africa',
    'NG', 'Nigeria', 'KE', 'Kenya', 'EG', 'Egypt', 'MA', 'Morocco',
    'MX', 'Mexico', 'AR', 'Argentina', 'CL', 'Chile', 'CO', 'Colombia',
    'ID', 'Indonesia', 'VN', 'Vietnam', 'TH', 'Thailand', 'PH', 'Philippines',
    'BD', 'Bangladesh', 'PK', 'Pakistan', 'TR', 'Turkey', 'IR', 'Iran',
    'SA', 'Saudi Arabia', 'AE', 'UAE', 'DZ', 'Algeria', 'TN', 'Tunisia',
    'SN', 'Senegal', 'GH', 'Ghana', 'ET', 'Ethiopia', 'TZ', 'Tanzania',
  ]);
  let westernCount = 0;
  let globalSouthCount = 0;
  let totalKnownGeo = 0;
  for (const s of sources) {
    const countries = s.institutions?.map((i) => i.country).filter(Boolean) || [];
    for (const c of countries) {
      if (c) {
        totalKnownGeo++;
        if (westernCountries.has(c)) westernCount++;
        if (globalSouthCountries.has(c)) globalSouthCount++;
      }
    }
  }
  if (totalKnownGeo > 5) {
    const westernShare = westernCount / totalKnownGeo;
    if (westernShare > 0.75) {
      biases.push({
        biasType: "geographic",
        severity: westernShare > 0.90 ? "high" : "medium",
        description: `Western-centric source base: ${Math.round(westernShare * 100)}% of known-affiliated sources are from Western countries. Global South perspectives (${globalSouthCount}/${totalKnownGeo}) are underrepresented.`,
        evidence: `Western: ${westernCount}, Global South: ${globalSouthCount}, Other: ${totalKnownGeo - westernCount - globalSouthCount}`,
        recommendation: "Actively seek sources from Global South institutions, non-Western think tanks, and independent researchers to balance the perspective.",
      });
    }
  }

  // NomosX: 8. VIEWPOINT DIVERSITY — check if independent/dissident sources are represented
  const independentProviders = new Set(['independent-media', 'gdelt-independent']);
  const independentCount = sources.filter(s => independentProviders.has(s.provider || '')).length;
  if (totalSources > 10 && independentCount === 0) {
    biases.push({
      biasType: "selection",
      severity: "low",
      description: `No independent media sources in the pool. All sources are from mainstream academic or institutional providers.`,
      evidence: `0/${totalSources} sources from independent media providers`,
      recommendation: "Include independent journalism and heterodox perspectives to challenge institutional consensus.",
    });
  }

  // NomosX: 9. INSTITUTIONAL BIAS — source-type-specific bias detection
  // Detects characteristic biases of intelligence agencies, NGOs, think tanks,
  // international organizations, and AI labs based on provider classification.
  const sourceTypeCounts: Record<string, { count: number; providers: Set<string> }> = {};
  for (const s of sources) {
    const profile = classifySourceType(s.provider || '');
    if (profile) {
      if (!sourceTypeCounts[profile.type]) {
        sourceTypeCounts[profile.type] = { count: 0, providers: new Set<string>() };
      }
      sourceTypeCounts[profile.type].count++;
      sourceTypeCounts[profile.type].providers.add(s.provider || 'unknown');
    }
  }

  for (const [stype, data] of Object.entries(sourceTypeCounts)) {
    const profile = INSTITUTIONAL_SOURCE_TYPES.find(p => p.type === stype);
    if (!profile) continue;
    const share = data.count / totalSources;
    // Flag if a single institutional source type dominates or is heavily represented
    if (share >= 0.25 && totalSources >= 4) {
      const severity = share > 0.5 ? "high" : share > 0.35 ? "medium" : "low";
      biases.push({
        biasType: "institutional",
        severity,
        description: `${profile.biasName}: ${data.count} of ${totalSources} sources (${Math.round(share * 100)}%) are from ${stype} providers (${Array.from(data.providers).slice(0, 3).join(", ")}${data.providers.size > 3 ? "..." : ""}). ${profile.biasDescription}`,
        evidence: `${stype}: ${data.count} sources from ${data.providers.size} provider(s) — ${Array.from(data.providers).join(", ")}`,
        recommendation: profile.recommendation,
      });
    }
  }

  // NomosX: 9b. INSTITUTIONAL BIAS — think-tank political orientation skew
  // If multiple think tanks are present but all from the same political orientation,
  // flag the ideological monoculture.
  const thinkTankOrientations = ['think-tank-conservative', 'think-tank-libertarian', 'think-tank-progressive', 'think-tank-centrist'];
  const presentOrientations = thinkTankOrientations.filter(o => sourceTypeCounts[o]);
  const thinkTankTotal = presentOrientations.reduce((sum, o) => sum + sourceTypeCounts[o].count, 0);
  if (thinkTankTotal >= 3 && presentOrientations.length === 1) {
    const profile = INSTITUTIONAL_SOURCE_TYPES.find(p => p.type === presentOrientations[0]);
    biases.push({
      biasType: "institutional",
      severity: thinkTankTotal >= 5 ? "high" : "medium",
      description: `Think-tank ideological monoculture: all ${thinkTankTotal} think-tank sources are from a single political orientation (${presentOrientations[0].replace('think-tank-', '')}). ${profile?.biasDescription || ''}`,
      evidence: `${presentOrientations[0]}: ${thinkTankTotal} sources, 0 from other orientations`,
      recommendation: "Include think-tank analysis from across the political spectrum (conservative, libertarian, progressive, centrist) to avoid ideological echo chamber.",
    });
  }

  // NomosX: 9c. INSTITUTIONAL BIAS — intelligence-only threat assessment warning
  // If intelligence sources are present but no academic/NGO corroboration exists,
  // flag the uncorroborated threat assessment.
  const hasIntelligence = sourceTypeCounts['intelligence']?.count > 0;
  const hasAcademic = sources.some(s => {
    const p = (s.provider || '').toLowerCase();
    return p.includes('openalex') || p.includes('crossref') || p.includes('semantic scholar') || p.includes('arxiv') || p.includes('pubmed');
  });
  const hasNGO = sourceTypeCounts['ngo']?.count > 0;
  if (hasIntelligence && !hasAcademic && !hasNGO && totalSources >= 3) {
    biases.push({
      biasType: "institutional",
      severity: "medium",
      description: `Uncorroborated intelligence assessment: ${sourceTypeCounts['intelligence'].count} intelligence source(s) present with no academic or NGO corroboration. Intelligence threat assessments without independent verification carry elevated threat-inflation risk.`,
      evidence: `Intelligence: ${sourceTypeCounts['intelligence'].count}, Academic: 0, NGO: 0`,
      recommendation: "Seek academic studies or NGO field reports that independently verify or contextualize the intelligence threat claims.",
    });
  }

  // NomosX: 9d. INSTITUTIONAL BIAS — AI lab capability claims without academic verification
  const hasAILab = sourceTypeCounts['ai-lab']?.count > 0;
  if (hasAILab && !hasAcademic && totalSources >= 3) {
    biases.push({
      biasType: "institutional",
      severity: "medium",
      description: `AI lab capability claims without academic verification: ${sourceTypeCounts['ai-lab'].count} AI-lab source(s) present with no peer-reviewed academic sources. Commercial capability inflation risk is elevated.`,
      evidence: `AI labs: ${sourceTypeCounts['ai-lab'].count}, Academic: 0`,
      recommendation: "Include peer-reviewed academic benchmark evaluations to independently verify AI-lab capability and safety claims.",
    });
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
