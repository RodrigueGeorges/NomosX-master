/**
 * Evidence Tiering — classifies sources into 5 tiers based on provenance and type.
 *
 * Tier 1 — Empirical: controlled studies, datasets, quantitative research
 * Tier 2 — Institutional: official documents from governments, IGOs, religious institutions
 * Tier 3 — Academic: peer-reviewed papers, systematic reviews
 * Tier 4 — Policy: EU AI Act, OECD, UNESCO, Council of Europe, GPAI, ISO standards
 * Tier 5 — Emerging: preprints, working papers, exploratory research, conference papers
 *
 * Inspired by: WWC (What Works Clearinghouse) Tier 1-3 system,
 * AIDI four-tier evidence hierarchy, Peptide Authority 5-level system.
 */

export interface EvidenceTiers {
  tier1_empirical: Array<{ src: string; title: string; reason: string }>;
  tier2_institutional: Array<{ src: string; title: string; reason: string }>;
  tier3_academic: Array<{ src: string; title: string; reason: string }>;
  tier4_policy: Array<{ src: string; title: string; reason: string }>;
  tier5_emerging: Array<{ src: string; title: string; reason: string }>;
}

/** Providers that are clearly preprint/non-peer-reviewed */
const PREPRINT_PROVIDERS = new Set([
  'arxiv', 'biorxiv', 'medrxiv', 'chemrxiv', 'ssrn', 'preprints.org',
  'openreview', 'hal', 'osf', 'researchsquare'
]);

/** Providers that are institutional/official sources */
const INSTITUTIONAL_PROVIDERS = new Set([
  'vatican', 'holy-see', 'oecd', 'worldbank', 'world-bank', 'imf',
  'un', 'united-nations', 'unesco', 'who', 'world-health-organization',
  'ecb', 'european-central-bank', 'eurostat', 'insee', 'fred',
  'nber', 'cia-foia', 'nara', 'gao', 'congress.gov', 'eur-lex',
  'eu-ai-act', 'coe', 'council-of-europe', 'g7', 'gpai'
]);

/** Providers that are policy frameworks/standards */
const POLICY_KEYWORDS = [
  'ai act', 'aiact', 'eu ai act', 'regulation', 'directive', 'iso',
  'ieee', 'oecd principles', 'unesco recommendation', 'g7 framework',
  'gpai', 'code of conduct', 'white paper', 'green paper', 'action plan',
  'strategy', 'standard', 'guideline', 'framework'
];

/** Providers that are clearly academic/peer-reviewed */
const ACADEMIC_PROVIDERS = new Set([
  'openalex', 'crossref', 'semantic-scholar', 'pubmed', 'scopus',
  'webofscience', 'jstor', 'doaj', 'allenai', 'inria'
]);

/** Keywords suggesting empirical/quantitative research */
const EMPIRICAL_KEYWORDS = [
  'experiment', 'experimental', 'randomized', 'randomised', 'controlled trial',
  'dataset', 'quantitative', 'survey', 'measurement', 'benchmark',
  'empirical', 'statistical analysis', 'regression', 'correlation',
  'sample size', 'n=', 'participants', 'subjects'
];

/**
 * Classify a single source into an evidence tier.
 * Returns the tier number (1-5) and a human-readable reason.
 */
function classifySource(source: any, index: number): { tier: 1 | 2 | 3 | 4 | 5; reason: string } {
  const provider = String(source.provider || '').toLowerCase();
  const title = String(source.title || '').toLowerCase();
  const abstract = String(source.abstract || '').toLowerCase();
  const text = `${title} ${abstract}`;
  const srcLabel = `[SRC-${index + 1}]`;

  // Tier 4: Policy frameworks/standards — check first because policy docs may also be institutional
  for (const kw of POLICY_KEYWORDS) {
    if (text.includes(kw)) {
      return { tier: 4, reason: `Policy document (keyword: "${kw}")` };
    }
  }

  // Tier 2: Institutional sources (governments, IGOs, religious institutions)
  if (INSTITUTIONAL_PROVIDERS.has(provider)) {
    return { tier: 2, reason: `Institutional source (${provider})` };
  }
  // Check for religious institution keywords in title
  const religiousKw = ['vatican', 'pope', 'pontifical', 'council of mosques', 'islamic council',
    'buddhist council', 'world council of churches', 'anglican communion', 'rabbinical'];
  for (const kw of religiousKw) {
    if (title.includes(kw)) {
      return { tier: 2, reason: `Religious institutional source (keyword: "${kw}")` };
    }
  }

  // Tier 5: Preprints and emerging research
  if (PREPRINT_PROVIDERS.has(provider)) {
    return { tier: 5, reason: `Preprint/non-peer-reviewed (${provider})` };
  }
  // Check for preprint indicators in text
  const preprintKw = ['preprint', 'working paper', 'not peer-reviewed', 'forthcoming',
    'under review', 'submitted to', 'draft'];
  for (const kw of preprintKw) {
    if (text.includes(kw)) {
      return { tier: 5, reason: `Emerging research (keyword: "${kw}")` };
    }
  }

  // Tier 1: Empirical/quantitative research — check before academic because empirical papers are also academic
  let empiricalHits = 0;
  for (const kw of EMPIRICAL_KEYWORDS) {
    if (text.includes(kw)) empiricalHits++;
  }
  if (empiricalHits >= 3) {
    return { tier: 1, reason: `Empirical study (${empiricalHits} quantitative indicators)` };
  }
  // Also check for high citation count + academic provider → likely empirical
  if (ACADEMIC_PROVIDERS.has(provider) && (source.citationCount || 0) > 100) {
    return { tier: 1, reason: `Highly-cited empirical research (${source.citationCount} citations, ${provider})` };
  }

  // Tier 3: Academic/peer-reviewed (default for academic providers)
  if (ACADEMIC_PROVIDERS.has(provider)) {
    return { tier: 3, reason: `Peer-reviewed academic source (${provider})` };
  }

  // Default: Tier 3 (academic) for anything with a DOI
  if (source.doi) {
    return { tier: 3, reason: 'Peer-reviewed (has DOI)' };
  }

  // Fallback: Tier 5 (emerging/uncategorized)
  return { tier: 5, reason: `Uncategorized source (${provider || 'unknown'})` };
}

/**
 * Classify all sources into 5 evidence tiers.
 * @param sources Array of source objects (must have provider, title, abstract, doi, citationCount)
 * @returns EvidenceTiers object with arrays of {src, title, reason} per tier
 */
export function computeEvidenceTiers(sources: any[]): EvidenceTiers {
  const tiers: EvidenceTiers = {
    tier1_empirical: [],
    tier2_institutional: [],
    tier3_academic: [],
    tier4_policy: [],
    tier5_emerging: [],
  };

  for (let i = 0; i < sources.length; i++) {
    const source = sources[i];
    const { tier, reason } = classifySource(source, i);
    const entry = {
      src: `[SRC-${i + 1}]`,
      title: String(source.title || '').slice(0, 120),
      reason,
    };

    switch (tier) {
      case 1: tiers.tier1_empirical.push(entry); break;
      case 2: tiers.tier2_institutional.push(entry); break;
      case 3: tiers.tier3_academic.push(entry); break;
      case 4: tiers.tier4_policy.push(entry); break;
      case 5: tiers.tier5_emerging.push(entry); break;
    }
  }

  return tiers;
}

/**
 * Render evidence tiers as a summary string for logging/debugging.
 */
export function summarizeEvidenceTiers(tiers: EvidenceTiers): string {
  return `Tier 1 (Empirical): ${tiers.tier1_empirical.length} | ` +
    `Tier 2 (Institutional): ${tiers.tier2_institutional.length} | ` +
    `Tier 3 (Academic): ${tiers.tier3_academic.length} | ` +
    `Tier 4 (Policy): ${tiers.tier4_policy.length} | ` +
    `Tier 5 (Emerging): ${tiers.tier5_emerging.length}`;
}
