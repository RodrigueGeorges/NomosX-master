/**
 * Smart Provider Selector
 * 
 * Intelligently selects the best providers and quantities
 * based on domain and question complexity
 * 
 * Best Practices 2026: Context-aware, intelligent defaults
 */

import { prisma } from '../db';

// All providers available in the pipeline (100+ total)
export type Provider = 
  // TIER 1: Academic Core
  | "openalex" | "crossref" | "semanticscholar" | "thesesfr" | "hal" | "pubmed" | "arxiv" | "base"
  // TIER 1B: Extended Academic
  | "core" | "europepmc" | "doaj" | "ssrn" | "repec" | "nber" | "who-gho" | "semantic-scholar-graph"
  // TIER 2: Institutional - Intelligence
  | "odni" | "cia-foia" | "nsa" | "uk-jic"
  // TIER 2: Institutional - Defense
  | "nato" | "eeas" | "sgdsn" | "eda"
  // TIER 2: Institutional - Economic
  | "imf" | "worldbank" | "oecd" | "bis"
  // TIER 2B: Economic Extended
  | "ecb" | "eurostat" | "fred" | "eib"
  // TIER 2: Institutional - Cyber
  | "nist" | "cisa" | "enisa"
  // TIER 2: Institutional - Multilateral
  | "un" | "undp" | "unctad"
  // TIER 2: Energy & Nuclear
  | "iaea" | "irena" | "cea" | "entsoe" | "jrc" | "iea" | "acer" | "entsog"
  | "energy-charts" | "smard" | "rte-france" | "energi-data" | "fingrid"
  // TIER 2: Think Tanks
  | "bruegel"
  // TIER 2: Environmental
  | "eea"
  // TIER 2: Academic Independent APIs
  | "openreview" | "biorxiv" | "papers-with-code" | "mit-dspace" | "harvard-dash"
  | "max-planck-pure"
  // TIER 2: Government Open Data
  | "istat" | "open-primitive" | "treasury-fiscal"
  // TIER 2: Health Extended V2
  | "clinical-trials"
  // TIER 2: Health Extended
  | "ema" | "inserm" | "ecdc" | "cochrane"
  // TIER 2: Environment
  | "inrae" | "ademe"
  // TIER 2: French Institutions
  | "ens" | "insee" | "shift-project" | "data-gouv" | "france-strategie" | "cnrs"
  // TIER 2: Tech Research Institutes
  | "allen-ai" | "max-planck" | "eth-zurich" | "inria"
  // TIER 2: Law & Governance
  | "eur-lex"
  // TIER 2: European Think Tanks
  | "ecfr" | "swp" | "sipri" | "iai"
  // TIER 2: French Policy & Law
  | "iddri" | "terra-nova" | "legifrance" | "vie-publique"
  // TIER 2: Health Extended V2
  | "cdc" | "nih" | "who-direct"
  // TIER 2: Economics Extended V2
  | "oecd-direct"
  // TIER 3: Think Tanks & Policy Labs
  | "lawzero" | "govai" | "iaps" | "caip" | "aipi" | "cset" | "ainow" | "datasociety"
  | "abundance" | "caidp" | "scsp" | "ifp" | "cdt" | "brookings" | "fai" | "cnas"
  | "rand" | "newamerica" | "aspen-digital" | "rstreet"
  // TIER 4: Archives
  | "nara" | "uk-archives" | "archives-fr"
  // TIER 5: Real-Time News & Web
  | "gdelt-news" | "newsapi" | "mediastack" | "thenewsapi" | "gnews" | "eventregistry"
  // TIER 6: Web Search
  | "linkup"
  // TIER 7: AI-Optimised Search & Enriched News (fallback only, not in DOMAIN_PROVIDER_MAP)
  | "tavily" | "exa" | "apitube"
  // TIER 8: Large-scale Academic Databases
  | "dimensions" | "lens" | "springer" | "osti" | "datacite" | "google-books"
  // TIER 9: Open-Access Free APIs (no key)
  | "plos" | "federal-register" | "sec-edgar" | "worldbank-docs" | "cordis"
  // V3.1: Consolidated institutions (batch OpenAlex ROR queries)
  | "consolidated-institutions"
  // V3.1: Global Omniscience Layer — RSS-based providers covering 80+ organizations
  | "global-intelligence" | "global-orgs" | "global-think-tanks" | "global-science";

export interface SmartSelection {
  providers: Provider[];
  quantity: number;
  reasoning: string;
  estimatedTime: string;
  estimatedSources: number;
}

/**
 * Domain → Multi-Provider Strategy (Tiered with A+ Relevance Filtering)
 * 
 * TIER 1 (Core Academic): Always included for baseline
 * TIER 2 (Institutional): Domain-specific official sources
 * TIER 3 (Think Tanks): Cutting-edge policy & innovation
 * TIER 4 (Archives): Historical & declassified docs
 * 
 * A+ LEVEL: Exclude irrelevant providers by domain to prevent topic drift
 * Strategy: 8-12 RELEVANT providers per domain for editorial robustness
 */

/**
 * A+ LEVEL: Detect query domain and filter irrelevant providers
 */
function detectQueryDomain(query: string): string {
  const queryLower = query.toLowerCase();
  
  if (queryLower.includes('artificial intelligence') || queryLower.includes('ai') || queryLower.includes('machine learning')) {
    if (queryLower.includes('employment') || queryLower.includes('job') || queryLower.includes('work')) {
      return 'ai employment';
    }
  }
  
  if (queryLower.includes('cyber') || queryLower.includes('security') || queryLower.includes('vulnerability')) {
    return 'cybersecurity';
  }
  
  if (queryLower.includes('crispr') || queryLower.includes('genetic') || queryLower.includes('biotech')) {
    return 'biotechnology';
  }
  
  if (queryLower.includes('carbon') || queryLower.includes('climate') || queryLower.includes('tax')) {
    return 'climate economics';
  }
  
  if (queryLower.includes('quantum') || queryLower.includes('entanglement')) {
    return 'quantum';
  }
  
  return 'general';
}

/**
 * LOT 1.5: Domain inclusion is handled by DOMAIN_PROVIDER_MAP (whitelist).
 * No exclusion filter needed — if domain is found, only its mapped providers are used.
 * If domain is not found, fallback to default provider set.
 */
function filterProvidersByDomain(providers: Provider[], domain: string): Provider[] {
  // DOMAIN_PROVIDER_MAP already provides the inclusion list for each domain.
  // No additional exclusion filtering needed.
  return providers;
}

const DOMAIN_PROVIDER_MAP: Record<string, Provider[]> = {
  // Health & Medicine
  health: ["pubmed", "europepmc", "semanticscholar", "core", "crossref", "openalex", "consolidated-institutions", "base", "doaj", "biorxiv", "clinical-trials", "plos", "dimensions", "lens", "springer", "datacite", "google-books", "global-intelligence", "global-orgs", "global-think-tanks", "global-science", "tavily", "exa", "linkup"],
  medical: ["pubmed", "europepmc", "openalex", "core", "semanticscholar", "crossref", "consolidated-institutions", "base", "doaj", "biorxiv", "clinical-trials", "dimensions", "lens", "springer", "datacite", "google-books", "global-intelligence", "global-orgs", "global-think-tanks", "global-science", "tavily", "exa", "linkup"],

  // Exact sciences
  physics: ["arxiv", "semanticscholar", "crossref", "core", "openalex", "hal", "base", "doaj", "max-planck", "max-planck-pure", "eth-zurich", "cea", "cset", "ifp", "mit-dspace", "harvard-dash", "openreview", "dimensions", "lens", "springer", "osti", "datacite", "google-books", "global-intelligence", "global-orgs", "global-think-tanks", "global-science", "tavily", "exa", "linkup"],
  mathematics: ["arxiv", "semanticscholar", "crossref", "core", "openalex", "hal", "base", "doaj", "max-planck", "max-planck-pure", "eth-zurich", "cset", "abundance", "mit-dspace", "harvard-dash", "dimensions", "lens", "springer", "google-books", "global-intelligence", "global-orgs", "global-think-tanks", "global-science", "tavily", "exa", "linkup"],
  computer_science: ["semanticscholar", "arxiv", "openalex", "crossref", "hal", "core", "allen-ai", "inria", "eth-zurich", "cset", "ainow", "datasociety", "openreview", "papers-with-code", "mit-dspace", "harvard-dash", "max-planck-pure", "dimensions", "lens", "springer", "datacite", "global-intelligence", "global-orgs", "global-think-tanks", "global-science", "tavily", "exa", "linkup"],

  // Social sciences & Economics
  economics: ["crossref", "openalex", "nber", "core", "ssrn", "repec", "consolidated-institutions", "worldbank-docs", "treasury-fiscal", "open-primitive", "sec-edgar", "dimensions", "lens", "google-books", "global-intelligence", "global-orgs", "global-think-tanks", "global-science", "tavily", "exa", "linkup"],
  finance: ["crossref", "openalex", "nber", "core", "ssrn", "repec", "consolidated-institutions", "worldbank-docs", "treasury-fiscal", "open-primitive", "sec-edgar", "dimensions", "lens", "google-books", "global-intelligence", "global-orgs", "global-think-tanks", "global-science", "tavily", "exa", "linkup"],
  social_sciences: ["crossref", "openalex", "ssrn", "core", "hal", "semanticscholar", "doaj", "consolidated-institutions", "dimensions", "lens", "google-books", "global-intelligence", "global-orgs", "global-think-tanks", "global-science", "tavily", "exa", "linkup"],

  // Environment & Climate
  climate: ["crossref", "openalex", "consolidated-institutions", "core", "hal", "doaj", "biorxiv", "dimensions", "lens", "springer", "osti", "datacite", "google-books", "global-intelligence", "global-orgs", "global-think-tanks", "global-science", "tavily", "exa", "linkup"],
  environment: ["crossref", "openalex", "consolidated-institutions", "core", "hal", "doaj", "biorxiv", "dimensions", "lens", "springer", "osti", "datacite", "google-books", "global-intelligence", "global-orgs", "global-think-tanks", "global-science", "tavily", "exa", "linkup"],

  // Energy (enriched with European providers)
  energy: ["crossref", "openalex", "iea", "core", "iaea", "irena", "cea", "entsoe", "jrc", "acer", "entsog", "energy-charts", "smard", "rte-france", "energi-data", "fingrid", "shift-project", "worldbank", "oecd", "oecd-direct", "hal", "eurostat", "data-gouv", "ademe", "inrae", "france-strategie", "iddri", "insee", "eib", "ecb", "eur-lex", "eeas", "ecfr", "swp", "bruegel", "eea", "brookings", "rand", "newamerica", "rstreet", "dimensions", "lens", "springer", "osti", "datacite", "gdelt-news", "newsapi", "global-intelligence", "global-orgs", "global-think-tanks", "global-science", "tavily", "exa", "linkup"],

  // Cross-domain: Energy × Technology (AI datacenters, smart grid, etc.)
  energy_technology: ["crossref", "openalex", "semanticscholar", "core", "arxiv", "hal", "iea", "iaea", "irena", "cea", "entsoe", "jrc", "acer", "entsog", "energy-charts", "smard", "rte-france", "energi-data", "fingrid", "shift-project", "worldbank", "oecd", "oecd-direct", "eurostat", "data-gouv", "ademe", "france-strategie", "iddri", "inria", "allen-ai", "cset", "ainow", "datasociety", "ecfr", "swp", "bruegel", "eea", "openreview", "papers-with-code", "mit-dspace", "harvard-dash", "max-planck-pure", "brookings", "rand", "dimensions", "lens", "springer", "osti", "datacite", "gdelt-news", "newsapi", "global-intelligence", "global-orgs", "global-think-tanks", "global-science", "tavily", "exa", "linkup"],

  // Politics & Law
  politics: ["crossref", "openalex", "ssrn", "core", "hal", "consolidated-institutions", "federal-register", "dimensions", "lens", "google-books", "gdelt-news", "newsapi", "global-intelligence", "global-orgs", "global-think-tanks", "global-science", "tavily", "exa", "linkup"],
  law: ["crossref", "openalex", "ssrn", "core", "hal", "lawzero", "eur-lex", "legifrance", "consolidated-institutions", "federal-register", "dimensions", "lens", "google-books", "gdelt-news", "newsapi", "global-intelligence", "global-orgs", "global-think-tanks", "global-science", "tavily", "exa", "linkup"],

  // Technology & Innovation
  technology: ["semanticscholar", "openalex", "arxiv", "crossref", "hal", "core", "consolidated-institutions", "openreview", "papers-with-code", "mit-dspace", "harvard-dash", "biorxiv", "dimensions", "lens", "springer", "datacite", "google-books", "gdelt-news", "newsapi", "global-intelligence", "global-orgs", "global-think-tanks", "global-science", "tavily", "exa", "linkup"],
  ai: ["semanticscholar", "openalex", "arxiv", "crossref", "core", "consolidated-institutions", "openreview", "papers-with-code", "mit-dspace", "harvard-dash", "biorxiv", "dimensions", "lens", "springer", "datacite", "gdelt-news", "newsapi", "global-intelligence", "global-orgs", "global-think-tanks", "global-science", "tavily", "exa", "linkup"],

  // Defense & Security
  defense: ["crossref", "openalex", "consolidated-institutions", "core", "ssrn", "dimensions", "lens", "google-books", "gdelt-news", "newsapi", "global-intelligence", "global-orgs", "global-think-tanks", "global-science", "tavily", "exa", "linkup"],
  security: ["crossref", "openalex", "semanticscholar", "core", "consolidated-institutions", "dimensions", "lens", "google-books", "gdelt-news", "newsapi", "global-intelligence", "global-orgs", "global-think-tanks", "global-science", "tavily", "exa", "linkup"],

  // Cybersecurity
  cyber: ["semanticscholar", "openalex", "arxiv", "consolidated-institutions", "core", "openreview", "papers-with-code", "dimensions", "lens", "springer", "gdelt-news", "newsapi", "global-intelligence", "global-orgs", "global-think-tanks", "global-science", "tavily", "exa", "linkup"],

  // Intelligence & Geopolitics
  intelligence: ["crossref", "openalex", "consolidated-institutions", "core", "nara", "dimensions", "lens", "google-books", "gdelt-news", "ssrn", "global-intelligence", "global-orgs", "global-think-tanks", "global-science", "tavily", "exa", "linkup"],
  geopolitics: ["crossref", "openalex", "semanticscholar", "core", "consolidated-institutions", "dimensions", "lens", "google-books", "gdelt-news", "ssrn", "global-intelligence", "global-orgs", "global-think-tanks", "global-science", "tavily", "exa", "linkup"],

  // France (enriched)
  france: ["thesesfr", "hal", "crossref", "core", "openalex", "consolidated-institutions", "legifrance", "vie-publique", "archives-fr", "dimensions", "lens", "google-books", "gdelt-news", "newsapi", "global-intelligence", "global-orgs", "global-think-tanks", "global-science", "tavily", "exa", "linkup"],

  // Statistics & Data (new domain)
  statistics: ["crossref", "openalex", "consolidated-institutions", "core", "worldbank-docs", "treasury-fiscal", "dimensions", "lens", "datacite", "gdelt-news", "newsapi", "global-intelligence", "global-orgs", "global-think-tanks", "global-science", "tavily", "exa", "linkup"],

  // Default (multi-disciplinary)
  // European think tanks / foreign policy
  european_policy: ["crossref", "openalex", "consolidated-institutions", "core", "eur-lex", "cordis", "dimensions", "lens", "google-books", "gdelt-news", "newsapi", "global-intelligence", "global-orgs", "global-think-tanks", "global-science", "tavily", "exa", "linkup"],
  foreign_policy: ["crossref", "openalex", "consolidated-institutions", "core", "dimensions", "lens", "google-books", "gdelt-news", "global-intelligence", "global-orgs", "global-think-tanks", "global-science", "tavily", "exa", "linkup"],

  default: ["semanticscholar", "crossref", "openalex", "core", "hal", "thesesfr", "nber", "ssrn", "consolidated-institutions", "global-intelligence", "global-orgs", "global-think-tanks", "global-science", "openreview", "biorxiv", "papers-with-code", "mit-dspace", "harvard-dash", "clinical-trials", "plos", "worldbank-docs", "dimensions", "lens", "springer", "datacite", "google-books", "gdelt-news", "newsapi", "tavily", "exa", "linkup"],
};

/**
 * Keywords by domain (French + English)
 */
const DOMAIN_KEYWORDS: Record<string, string[]> = {
  health: ["santé", "médical", "maladie", "thérapie", "patient", "health", "medical", "disease", "therapy", "clinical"],
  physics: ["physique", "quantum", "particule", "énergie", "physics", "quantum", "particle", "energy"],
  mathematics: ["mathématique", "théorème", "équation", "algorithm", "mathematics", "theorem", "equation"],
  economics: ["économie", "économique", "marché", "commerce", "economics", "market", "trade", "fiscal"],
  finance: ["finance", "financier", "investissement", "banque", "bourse", "investment", "banking", "stock"],
  climate: ["climat", "climatique", "carbone", "émission", "réchauffement", "climate", "carbon", "emission", "warming"],
  environment: ["environnement", "écologie", "pollution", "biodiversité", "environment", "ecology", "pollution", "biodiversity"],
  politics: ["politique", "gouvernement", "démocratie", "élection", "politics", "government", "democracy", "election"],
  law: ["droit", "juridique", "loi", "justice", "legal", "law", "justice", "regulation"],
  technology: ["technologie", "numérique", "digital", "innovation", "technology", "digital", "innovation"],
  ai: ["intelligence artificielle", "ia", "machine learning", "deep learning", "ai", "artificial intelligence", "neural"],
  computer_science: ["informatique", "algorithme", "programmation", "software", "computer science", "algorithm", "programming"],
  social_sciences: ["sociologie", "psychologie", "anthropologie", "sociology", "psychology", "anthropology"],
  // New domains for institutional providers
  defense: ["défense", "militaire", "armée", "stratégie militaire", "defense", "military", "army", "warfare", "strategic"],
  security: ["sécurité", "renseignement", "espionnage", "surveillance", "security", "intelligence", "espionage", "surveillance"],
  cyber: ["cybersécurité", "cyber", "piratage", "malware", "ransomware", "cybersecurity", "hacking", "breach", "vulnerability"],
  intelligence: ["renseignement", "espionnage", "cia", "nsa", "services secrets", "intelligence", "espionage", "classified", "secret"],
  geopolitics: ["géopolitique", "relations internationales", "diplomatie", "conflit", "geopolitics", "international relations", "diplomacy", "conflict"],
  energy: ["énergie", "nucléaire", "renouvelable", "électricité", "pétrole", "gaz", "energy", "nuclear", "renewable", "electricity", "oil", "gas", "power", "grid", "datacenter", "data center", "hyperscaler", "transmission", "transformer", "substation", "load", "capacity", "interconnection"],
  statistics: ["statistiques", "données", "indicateur", "indice", "mesure", "statistics", "data", "indicator", "index", "measure", "dataset"],
  france: ["france", "français", "française", "hexagone", "métropole", "paris", "élysée", "matignon", "sénat", "assemblée"],
  medical: ["médecin", "hôpital", "clinique", "médicament", "vaccin", "pandémie", "épidémie", "physician", "hospital", "drug", "vaccine", "pandemic", "epidemic"],
  european_policy: ["union européenne", "europe", "bruxelles", "commission européenne", "conseil européen", "european union", "eu policy", "brussels", "european commission", "schengen"],
  foreign_policy: ["politique étrangère", "diplomatie", "affaires étrangères", "relations extérieures", "foreign policy", "diplomacy", "international affairs", "bilateral", "multilateral"],
};

/**
 * Detects the main domain of the question
 */
export function detectDomain(question: string): string {
  const q = question.toLowerCase();
  
  // Score per domain
  const scores: Record<string, number> = {};
  
  for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
    scores[domain] = 0;
    for (const keyword of keywords) {
      if (q.includes(keyword.toLowerCase())) {
        scores[domain] += 1;
      }
    }
  }
  
  // Find domain with max score
  let maxScore = 0;
  let bestDomain = "default";
  
  for (const [domain, score] of Object.entries(scores)) {
    if (score > maxScore) {
      maxScore = score;
      bestDomain = domain;
    }
  }
  
  // Cross-domain detection: if query matches both energy and technology/ai keywords,
  // return a combined domain so both provider sets are used
  if (scores['energy'] > 0 && (scores['ai'] > 0 || scores['technology'] > 0 || scores['computer_science'] > 0)) {
    return 'energy_technology';
  }

  return maxScore > 0 ? bestDomain : "default";
}

/**
 * Estimates question complexity
 */
export function estimateComplexity(question: string): "simple" | "moderate" | "complex" {
  const length = question.length;
  const hasMultipleQuestions = (question.match(/\?/g) || []).length > 1;
  const hasComparison = /versus|vs|contre|comparaison|différence/i.test(question);
  const hasMultipleConcepts = question.split(/et|ou|,/).length > 3;
  
  if (hasMultipleQuestions || hasComparison || hasMultipleConcepts || length > 200) {
    return "complex";
  } else if (length > 100 || hasMultipleConcepts) {
    return "moderate";
  } else {
    return "simple";
  }
}

/**
 * P2-L: Load historically best-performing providers for a domain from AgentAuditLog.
 * Returns a map of provider → avg quality score from past runs.
 */
async function loadProviderPerformance(domain: string): Promise<Map<string, number>> {
  const perfMap = new Map<string, number>();
  try {
    const logs = await prisma.agentAuditLog.findMany({
      where: {
        agent: { in: ["analyst", "strategic-analyst", "publication-generator"] },
        timestamp: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) },
      },
      select: { metadata: true },
      take: 50,
    });

    for (const log of logs) {
      const meta = log.metadata as any;
      if (meta?.providerScores && typeof meta.providerScores === "object") {
        for (const [provider, score] of Object.entries(meta.providerScores)) {
          const current = perfMap.get(provider) || 0;
          const count = perfMap.get(`${provider}__count`) || 0;
          perfMap.set(provider, (current * count + Number(score)) / (count + 1));
          perfMap.set(`${provider}__count`, count + 1);
        }
      }
    }
  } catch { /* non-fatal */ }
  return perfMap;
}

/**
 * Intelligently selects providers and quantities.
 * P2-L: Now async — boosts providers with strong historical performance.
 */
export async function selectSmartProviders(question: string): Promise<SmartSelection> {
  // Use comprehensive domain detection (20 domains) for accurate provider selection
  const domain = detectDomain(question);
  console.log(`[SmartProvider] Detected domain: ${domain}`);
  
  const baseProviders = DOMAIN_PROVIDER_MAP[domain] || DOMAIN_PROVIDER_MAP.default;
  
  // A+ LEVEL: Apply domain-specific filtering to prevent topic drift
  const filteredProviders = filterProvidersByDomain(baseProviders, domain);

  // P2-L: Load historical performance and reorder providers
  const perfMap = await loadProviderPerformance(domain);
  const providers = [...filteredProviders].sort((a, b) => {
    const scoreA = perfMap.get(a) || 50;
    const scoreB = perfMap.get(b) || 50;
    return scoreB - scoreA;
  });

  const complexity = estimateComplexity(question);
  const baseQuantity = { simple: 20, moderate: 30, complex: 40 }[complexity];
  const quantityPerProvider = Math.ceil(baseQuantity / providers.length);
  const estimatedTime = { simple: "45-60s", moderate: "60-90s", complex: "90-120s" }[complexity];
  const estimatedSources = baseQuantity;

  const topPerformers = providers.filter(p => (perfMap.get(p) || 0) > 60).slice(0, 3);
  const perfNote = topPerformers.length > 0 ? ` (boosted: ${topPerformers.join(", ")} from history)` : "";

  const domainLabel = {
    health: "Santé & Médecine",
    medical: "Médecine",
    physics: "Physique",
    mathematics: "Mathématiques",
    economics: "Économie",
    finance: "Finance",
    climate: "Climat & Environnement",
    environment: "Environnement",
    politics: "Politique",
    law: "Droit",
    technology: "Technologie",
    ai: "Intelligence Artificielle",
    computer_science: "Informatique",
    social_sciences: "Sciences Sociales",
    defense: "Défense & Stratégie",
    security: "Sécurité & Renseignement",
    cyber: "Cybersécurité",
    intelligence: "Intelligence & Espionnage",
    geopolitics: "Géopolitique",
    france: "France (Multi-sources)",
    default: "Multi-disciplinaire",
  }[domain] || "Multi-disciplinaire";
  
  const providerLabels: Partial<Record<Provider, string>> = {
    // Academic
    openalex: "OpenAlex", crossref: "CrossRef", semanticscholar: "Semantic Scholar",
    thesesfr: "Thèses.fr", hal: "HAL", pubmed: "PubMed", arxiv: "arXiv", base: "BASE",
    // Institutional - Intelligence
    odni: "ODNI", "cia-foia": "CIA FOIA", nsa: "NSA", "uk-jic": "UK JIC",
    // Institutional - Defense
    nato: "NATO", eeas: "EEAS", sgdsn: "SGDSN", eda: "EDA",
    // Institutional - Economic
    imf: "IMF", worldbank: "World Bank", oecd: "OECD", bis: "BIS",
    // Institutional - Cyber
    nist: "NIST", cisa: "CISA", enisa: "ENISA",
    // Institutional - Multilateral
    un: "UN", undp: "UNDP", unctad: "UNCTAD",
    // Think Tanks
    lawzero: "LawZero", govai: "GovAI", iaps: "IAPS", caip: "CAIP", aipi: "AIPI",
    cset: "CSET", ainow: "AI Now", datasociety: "Data & Society", abundance: "Abundance",
    caidp: "CAIDP", scsp: "SCSP", ifp: "IFP", cdt: "CDT", brookings: "Brookings",
    fai: "FAI", cnas: "CNAS", rand: "RAND", newamerica: "New America",
    "aspen-digital": "Aspen Digital", rstreet: "R Street",
    // Archives
    nara: "NARA", "uk-archives": "UK Archives", "archives-fr": "Archives FR",
  };
  
  // Use 12-18 providers for editorial robustness (was 10, now expanded for domain coverage)
  const selectedProviders = providers.slice(0, 25) as Provider[];
  const providerNames = selectedProviders.map(p => providerLabels[p] || p).join(" + ");
  
  const reasoning = `Domaine : ${domainLabel}. Sources : ${providerNames} (~${estimatedSources} publications).`;
  
  return {
    providers: selectedProviders,
    quantity: quantityPerProvider,
    reasoning,
    estimatedTime,
    estimatedSources,
  };
}

/**
 * Export types and functions
 */
export default selectSmartProviders;
