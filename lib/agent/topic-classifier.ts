/**
 * NomosX UNIFIED TOPIC CLASSIFIER
 * 
 * Single source of truth for topic → domain → researchers → vertical routing.
 * Replaces the 3 independent keyword-based classification systems:
 * - researcher-ownership.ts detectOwners() 
 * - signal-detector.ts classifyVertical()
 * - smart-provider-selector.ts detectDomain()
 * 
 * Architecture: LLM-based classification with rule-based fast path fallback.
 * The LLM classifier understands nuance (e.g., "AI regulation in the EU" → law + technology).
 * 
 * Design principles (OpenAI Swarm + Anthropic Agent patterns):
 * - Single classification call, multiple consumers
 * - Cached results (same topic = same classification)
 * - Multi-label (a topic can belong to multiple domains)
 * - Confidence-scored (downstream agents can filter by confidence)
 * - Deterministic fallback (rule-based if LLM fails)
 */

import { callLLM } from '../llm/unified-llm';
import { parseJson } from './json-utils';
import { DomainExpertise } from './types';
import { RESEARCHER_REGISTRY, ResearcherProfile, VERTICAL_RESEARCHER_MAP } from './researcher-ownership';

// ============================================================================
// TYPES
// ============================================================================

import type { EditorialDimension } from './editorial-types';
import { formatDomainLabel } from './editorial-types';

export interface TopicClassification {
  /** Primary domain (highest confidence) */
  primaryDomain: DomainExpertise;
  /** All relevant domains with confidence scores */
  domains: DomainDomainScore[];
  /** Cross-domain collision dimensions (editorial V2) */
  dimensions: EditorialDimension[];
  /** One-line detected subject / collision thesis */
  detectedSubject: string;
  /** Matched vertical slug for DB operations */
  verticalSlug: string;
  /** Secondary verticals that may be relevant */
  secondaryVerticals: string[];
  /** Assigned researchers (primary + collaborators) */
  researchers: AssignedResearcher[];
  /** Recommended providers for this topic */
  providers: string[];
  /** Topic urgency assessment */
  urgency: 'critical' | 'high' | 'medium' | 'low';
  /** Recommended pipeline tier */
  recommendedTier: 'standard' | 'premium' | 'strategic';
  /** Whether this topic spans multiple domains (needs cross-domain analysis) */
  isCrossDomain: boolean;
  /** Short reasoning for the classification */
  reasoning: string;
  /** Classification confidence (0-1) */
  confidence: number;
  /** Cost of classification */
  costUsd: number;
  /** Whether this came from cache */
  cached: boolean;
}

export interface DomainDomainScore {
  domain: DomainExpertise;
  confidence: number;
  researcher: ResearcherProfile;
}

export interface AssignedResearcher {
  profile: ResearcherProfile;
  role: 'lead' | 'collaborator' | 'reviewer';
  relevanceScore: number;
}

// ============================================================================
// CLASSIFICATION CACHE — Same topic = same result within TTL
// ============================================================================

const classificationCache = new Map<string, { result: TopicClassification; expiresAt: number }>();
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

function getCached(topic: string): TopicClassification | null {
  const normalized = topic.toLowerCase().trim();
  const entry = classificationCache.get(normalized);
  if (entry && entry.expiresAt > Date.now()) {
    return { ...entry.result, cached: true };
  }
  if (entry) classificationCache.delete(normalized);
  return null;
}

function setCache(topic: string, result: TopicClassification): void {
  const normalized = topic.toLowerCase().trim();
  classificationCache.set(normalized, { result, expiresAt: Date.now() + CACHE_TTL_MS });
  // Evict old entries if cache grows too large
  if (classificationCache.size > 500) {
    const now = Date.now();
    for (const [key, val] of classificationCache) {
      if (val.expiresAt < now) classificationCache.delete(key);
    }
  }
}

// ============================================================================
// DOMAIN → VERTICAL REVERSE MAP (built once)
// ============================================================================

const DOMAIN_TO_VERTICAL: Record<string, string> = {};
for (const [verticalSlug, domains] of Object.entries(VERTICAL_RESEARCHER_MAP)) {
  for (const domain of domains) {
    if (!DOMAIN_TO_VERTICAL[domain]) {
      DOMAIN_TO_VERTICAL[domain] = verticalSlug;
    }
  }
}

// ============================================================================
// DOMAIN → PROVIDER MAP (unified, replaces smart-provider-selector duplicates)
// ============================================================================

// Linkup is a complementary web search provider (grey literature, think tank reports,
// government documents, real-time web). Added to domains where it provides unique value.
// Requires LINKUP_API_KEY env var. If not set, scout will silently skip it.
const DOMAIN_PROVIDERS: Record<string, string[]> = {
  // ── CORE DOMAINS ──
  economics: [
    "openalex", "crossref", "repec", "ssrn", "nber", "worldbank", "worldbank-data", "datacommons", "imf", "oecd", "brookings", "base",
    "comtrade", "us-bls", "us-census", "ons-uk", "estat-jp", "kosis",
    "carnegie", "cepr", "bruegel", "mckinsey", "bcg", "deloitte",
    "world-bank-research---development", "center-for-global-development",
    "nature", "science", "gdelt-news", "newsapi", "linkup"
  ],
  technology: [
    "openalex", "arxiv", "semanticscholar", "crossref", "hal", "base", "europepmc",
    "arxiv-cs", "deepmind-research", "openai-research", "google-ai-research",
    "microsoft-research", "amazon-science", "ai-index---stanford-hai", "partnership-on-ai",
    "papers-with-code", "kaggle", "nature", "science",
    "linkup", "gdelt-news", "searxng", "newsapi"
  ],
  policy: [
    "openalex", "ssrn", "crossref", "brookings", "rand", "oecd", "worldbank", "base",
    "political-science", "carnegie", "cfr", "csis", "bruegel", "cepr", "berlin-policy-hub",
    "chatham-house", "dgap", "asteres", "idea-factory",
    "mckinsey", "bcg", "deloitte",
    "linkup", "gdelt-news", "searxng", "newsapi", "eventregistry"
  ],
  health: [
    "pubmed", "openalex", "crossref", "europepmc", "base", "core", "doaj", "worldbank",
    "biology",
    "who", "who-gho", "johns-hopkins", "harvard-chan",
    "the-lancet", "new-england-journal-of-medicine", "nature-medicine",
    "jama---journal-of-american-medical-association",
    "nature", "science", "cell",
    "gdelt-news", "newsapi", "linkup"
  ],
  security: [
    "openalex", "crossref", "rand", "iiss", "brookings", "nato", "nist", "cisa", "ucdp", "acled",
    "chatham-house", "csis", "cfr", "carnegie", "rsis", "cis",
    "linkup", "gdelt-news", "searxng", "newsapi", "eventregistry"
  ],
  law: [
    "openalex", "ssrn", "crossref", "doaj", "base", "brookings", "rand", "core",
    "lawzero", "unodc", "bruegel", "cepr",
    "linkup", "gdelt-news", "searxng", "newsapi"
  ],
  environment: [
    "openalex", "crossref", "base", "europepmc", "worldbank", "worldbank-data", "datacommons", "un", "undp",
    "geography", "fao", "owid",
    "ipcc", "climate-analytics", "wri",
    "iea---international-energy-agency", "irena---international-renewable-energy-agency",
    "nature", "science",
    "linkup", "gdelt-news", "searxng", "newsapi"
  ],
  quantitative: [
    "openalex", "arxiv", "crossref", "ssrn", "semanticscholar", "semantic-scholar-graph", "base", "core",
    "zbmath", "dblp", "papers-with-code", "kaggle", "arxiv-cs",
    "nature", "science", "pnas---proceedings-of-national-academy-of-sciences"
  ],
  finance: [
    "openalex", "ssrn", "repec", "nber", "crossref", "bis", "imf", "brookings", "base",
    "comtrade", "us-bls",
    "blackrock", "vanguard",
    "mckinsey", "bcg", "deloitte",
    "pwc-research-institute", "ey-research", "kpmg-thought-leadership",
    "bain---company-insights", "accenture-research",
    "gdelt-news", "newsapi", "linkup", "worldbank-data", "datacommons"
  ],
  // ── EXTENDED DOMAINS ──
  "social-sciences": [
    "openalex", "ssrn", "crossref", "doaj", "base", "worldbank", "core",
    "sociology", "psychology", "isidore", "persee", "eric",
    "brookings", "carnegie",
    "nature", "science", "hal",
    "linkup", "gdelt-news", "searxng"
  ],
  humanities: [
    "openalex", "crossref", "doaj", "base", "ssrn", "core", "hal",
    "philpapers", "history", "isidore", "persee",
    "nature", "science",
    "linkup", "searxng"
  ],
  "energy-advanced": [
    "openalex", "crossref", "base", "europepmc", "arxiv", "un",
    "iea---international-energy-agency", "irena---international-renewable-energy-agency",
    "rmi---rocky-mountain-institute", "energy-futures-initiative",
    "ipcc", "climate-analytics", "wri",
    "nature", "science",
    "linkup", "gdelt-news", "searxng", "newsapi"
  ],
  geopolitics: [
    "openalex", "crossref", "brookings", "rand", "nato", "eeas", "un",
    "chatham-house", "cfr", "csis", "carnegie", "iiss", "rsis", "cis",
    "bruegel", "dgap", "berlin-policy-hub",
    "saiia---south-african-institute-of-international-affairs",
    "acet---african-center-for-economic-transformation",
    "linkup", "gdelt-news", "searxng", "newsapi", "eventregistry"
  ],
  "digital-society": [
    "openalex", "ssrn", "crossref", "arxiv", "semanticscholar", "base",
    "deepmind-research", "openai-research", "google-ai-research",
    "microsoft-research", "partnership-on-ai",
    "brookings", "rand",
    "linkup", "gdelt-news", "searxng", "newsapi"
  ],
  "cognitive-science": [
    "openalex", "pubmed", "crossref", "arxiv", "europepmc", "semanticscholar",
    "psychology", "nature", "science", "cell",
    "nature-medicine", "pnas---proceedings-of-national-academy-of-sciences"
  ],
  "behavioral-economics": [
    "openalex", "ssrn", "crossref", "base", "repec", "nber", "doaj",
    "brookings", "mckinsey",
    "nature", "science"
  ],
  "urban-studies": [
    "openalex", "crossref", "worldbank", "ssrn", "base", "doaj",
    "brookings", "mckinsey",
    "world-bank-research---development", "undp-research",
    "linkup", "gdelt-news", "searxng"
  ],
  bioethics: [
    "openalex", "pubmed", "crossref", "europepmc", "doaj", "core",
    "who", "who-gho", "the-lancet", "nature-medicine",
    "jama---journal-of-american-medical-association",
    "nature", "science"
  ],
  "complexity-science": [
    "openalex", "arxiv", "crossref", "semanticscholar", "semantic-scholar-graph", "base", "core",
    "arxiv-cs", "papers-with-code",
    "nature", "science", "pnas---proceedings-of-national-academy-of-sciences"
  ],
  "computational-social-science": [
    "openalex", "arxiv", "ssrn", "crossref", "semanticscholar", "semantic-scholar-graph", "base",
    "arxiv-cs", "papers-with-code", "kaggle",
    "nature", "science",
    "linkup", "searxng"
  ],
  "development-economics": [
    "openalex", "ssrn", "repec", "nber", "crossref", "worldbank", "undp", "un",
    "world-bank-research---development", "undp-research",
    "center-for-global-development",
    "acet---african-center-for-economic-transformation",
    "saiia---south-african-institute-of-international-affairs",
    "brookings", "carnegie",
    "gdelt-news", "linkup"
  ],
  "risk-analysis": [
    "openalex", "ssrn", "crossref", "bis", "imf", "rand", "repec", "base",
    "blackrock", "vanguard",
    "mckinsey", "bcg", "deloitte",
    "pwc-research-institute", "kpmg-thought-leadership",
    "brookings", "carnegie",
    "gdelt-news", "eventregistry", "linkup"
  ],
  // ── DEEP-DOMAIN LENSES (anthropology, history, religious studies, non-Western philosophy) ──
  anthropology: [
    "openalex", "crossref", "base", "core", "doaj", "hal",
    "sociology", "isidore", "persee", "ssrn",
    "nature", "science",
    "linkup", "searxng"
  ],
  history: [
    "openalex", "crossref", "base", "core", "doaj", "hal",
    "history", "isidore", "persee", "eric",
    "nature", "science",
    "linkup", "searxng"
  ],
  "religious-studies": [
    "openalex", "crossref", "base", "core", "doaj", "hal",
    "philpapers", "isidore", "persee",
    "nature", "science",
    "linkup", "searxng"
  ],
  "non-western-philosophy": [
    "openalex", "crossref", "base", "core", "doaj", "hal",
    "philpapers", "isidore", "persee",
    "nature", "science",
    "linkup", "searxng"
  ],
  // ── SUB-DISCIPLINE LENSES (Sprint 19) ──
  sociology: [
    "sociology", "isidore", "persee", "openalex", "hal", "core",
    "crossref", "doaj", "worldbank", "worldbank-data", "datacommons", "owid",
    "plos", "linkup", "gdelt-news", "searxng"
  ],
  psychology: [
    "psychology", "pubmed", "semanticscholar", "openalex", "crossref",
    "europepmc", "core", "plos", "biorxiv", "osf",
    "linkup", "searxng"
  ],
  "political-science": [
    "political-science", "openalex", "crossref", "isidore", "persee",
    "mega-thinktanks", "global-think-tanks", "overton", "core",
    "linkup", "gdelt-news", "searxng"
  ],
  demography: [
    "openalex", "crossref", "worldbank", "worldbank-data", "datacommons", "un", "undp", "isidore", "persee",
    "us-census", "unhcr", "ons-uk", "estat-jp", "ibge",
    "core", "plos", "mega-stats", "owid",
    "linkup", "gdelt-news", "searxng"
  ],
  criminology: [
    "unodc", "ucdp", "owid", "openalex", "crossref", "core", "doaj",
    "mega-thinktanks", "overton",
    "linkup", "gdelt-news", "searxng"
  ],
  education: [
    "eric", "openalex", "crossref", "isidore", "oecd", "worldbank", "worldbank-data", "datacommons", "owid",
    "core", "doaj",
    "linkup", "searxng"
  ],
  philosophy: [
    "philpapers", "isidore", "persee", "openalex", "crossref", "hal",
    "core", "doaj",
    "linkup", "searxng"
  ],
  linguistics: [
    "openalex", "crossref", "isidore", "persee", "core", "semanticscholar",
    "hal", "doaj",
    "linkup", "searxng"
  ],
  "media-studies": [
    "openalex", "crossref", "isidore", "core", "doaj",
    "eventregistry", "gdelt-news", "newsapi",
    "linkup", "searxng"
  ],
  epidemiology: [
    "pubmed", "europepmc", "openalex", "crossref", "who-gho", "cdc",
    "nih", "plos", "biorxiv", "owid",
    "linkup", "searxng"
  ],
  "public-health": [
    "pubmed", "europepmc", "openalex", "who-gho", "who-direct", "worldbank", "worldbank-data", "datacommons",
    "nih", "crossref", "doaj", "core", "owid",
    "linkup", "gdelt-news", "searxng"
  ],
  "international-relations": [
    "openalex", "crossref", "mega-thinktanks", "global-think-tanks",
    "global-intelligence", "isidore", "overton", "ucdp", "acled", "worldbank-data", "datacommons", "comtrade",
    "linkup", "gdelt-news", "searxng", "eventregistry"
  ],
  // ── SUB-DISCIPLINE LENSES II (Sprint 19 batch 3) — pipeline-dispatched ids only ──
  "migration-studies": [
    "openalex", "crossref", "sociology", "isidore", "persee",
    "worldbank", "worldbank-data", "datacommons", "undp", "oecd", "mega-stats", "core",
    "unhcr", "acled",
    "linkup", "gdelt-news", "searxng"
  ],
  "science-technology-studies": [
    "openalex", "crossref", "isidore", "philpapers", "core", "hal",
    "arxiv", "hf-papers", "osf",
    "linkup", "searxng"
  ],
  epistemology: [
    "philpapers", "isidore", "persee", "openalex", "crossref",
    "core", "hal",
    "linkup", "searxng"
  ],
  "international-law": [
    "openalex", "crossref", "isidore", "persee", "eur-lex", "overton",
    "un", "mega-eu", "core",
    "linkup", "gdelt-news", "searxng"
  ],
  "conflict-studies": [
    "openalex", "crossref", "political-science", "isidore", "ucdp", "acled",
    "sipri", "ecfr", "swp", "mega-thinktanks", "global-think-tanks",
    "global-intelligence", "linkup", "gdelt-news", "searxng", "eventregistry"
  ],
  "political-economy": [
    "openalex", "crossref", "sociology", "nber", "repec",
    "worldbank", "imf", "oecd", "bis", "mega-thinktanks", "core", "comtrade",
    "linkup", "searxng"
  ],
  "public-administration": [
    "openalex", "crossref", "political-science", "isidore",
    "oecd", "worldbank", "overton", "mega-eu", "core", "us-census", "ons-uk",
    "linkup", "searxng"
  ],
  "gender-studies": [
    "openalex", "crossref", "sociology", "isidore", "persee",
    "core", "doaj", "plos",
    "linkup", "searxng"
  ],
  "area-studies": [
    "openalex", "crossref", "history", "isidore", "persee", "ucdp",
    "ajol", "dialnet", "riss", "shodhganga", "core", "worldbank-data", "datacommons",
    "unhcr", "estat-jp", "kosis", "ibge", "acled",
    "linkup", "gdelt-news", "searxng"
  ],
  "labor-studies": [
    "openalex", "crossref", "sociology", "nber", "repec", "ilostat", "owid",
    "oecd", "worldbank", "worldbank-data", "datacommons", "us-bls", "ons-uk", "core",
    "linkup", "searxng"
  ],
  "ethics-of-technology": [
    "philpapers", "openalex", "crossref", "arxiv", "isidore",
    "hf-papers", "openreview", "core",
    "linkup", "searxng"
  ],
  archaeology: [
    "openalex", "crossref", "isidore", "persee", "hal",
    "core", "openaire", "zenodo",
    "linkup", "searxng"
  ],
  neuroscience: [
    "pubmed", "europepmc", "biorxiv", "openalex", "semanticscholar",
    "plos", "nih", "core",
    "linkup", "searxng"
  ],
  "data-science": [
    "dblp", "arxiv", "openreview", "semanticscholar", "hf-papers",
    "papers-with-code", "openalex", "core",
    "linkup", "searxng"
  ],
  "economic-history": [
    "nber", "repec", "openalex", "crossref", "history",
    "persee", "core", "worldbank",
    "linkup", "searxng"
  ],
  "social-psychology": [
    "psychology", "openalex", "semanticscholar", "crossref", "eric",
    "core",
    "linkup", "searxng"
  ],
  "organizational-studies": [
    "openalex", "crossref", "sociology", "repec", "nber",
    "core", "mega-thinktanks",
    "linkup", "searxng"
  ],
  "science-policy": [
    "global-science", "oecd", "openalex", "overton", "crossref",
    "core", "mega-thinktanks",
    "linkup", "searxng"
  ],
  "development-studies": [
    "worldbank", "worldbank-data", "datacommons", "undp", "oecd", "openalex", "repec",
    "ajol", "dialnet", "core", "unctad", "ilostat", "owid", "comtrade", "unhcr", "ibge",
    "linkup", "gdelt-news", "searxng"
  ],
  "comparative-politics": [
    "political-science", "openalex", "crossref", "overton", "core",
    "mega-thinktanks", "owid", "ucdp", "gdelt-news",
    "linkup", "searxng"
  ],
  "social-theory": [
    "isidore", "persee", "sociology", "philpapers", "openalex",
    "hal", "core",
    "linkup", "searxng"
  ],
  "philosophy-of-science": [
    "philpapers", "openalex", "crossref", "isidore", "core",
    "arxiv",
    "linkup", "searxng"
  ],
  "law-and-economics": [
    "nber", "repec", "eur-lex", "openalex", "crossref",
    "core", "mega-thinktanks",
    "linkup", "searxng"
  ],
  "intelligence-studies": [
    "cia-foia", "odni", "uk-jic", "global-intelligence", "nato",
    "sipri", "openalex", "crossref", "core",
    "linkup", "searxng"
  ],
  "military-studies": [
    "sipri", "nato", "cia-foia", "odni", "uk-jic",
    "global-intelligence", "openalex", "crossref", "core",
    "linkup", "searxng"
  ],
  "futures-studies": [
    "openalex", "crossref", "isidore", "core", "overton",
    "mega-thinktanks",
    "linkup", "searxng"
  ],
  "economic-sociology": [
    "sociology", "openalex", "crossref", "repec", "nber",
    "core", "isidore", "worldbank-data", "datacommons", "owid",
    "linkup", "searxng"
  ],
  "historical-sociology": [
    "sociology", "history", "openalex", "crossref", "isidore",
    "persee", "core",
    "linkup", "searxng"
  ],
  "environmental-economics": [
    "openalex", "crossref", "repec", "nber", "oecd",
    "worldbank", "eea", "owid", "core",
    "linkup", "searxng"
  ],
  "health-economics": [
    "pubmed", "europepmc", "who-gho", "nih", "openalex",
    "repec", "nber", "oecd", "core", "owid", "worldbank-data", "datacommons",
    "linkup", "searxng"
  ],
  "legal-theory": [
    "philpapers", "openalex", "crossref", "eur-lex", "core",
    "isidore",
    "linkup", "searxng"
  ],
  "postcolonial-studies": [
    "isidore", "persee", "openalex", "crossref", "sociology",
    "ajol", "dialnet", "core",
    "linkup", "searxng"
  ],
  "communication-studies": [
    "openalex", "crossref", "sociology", "isidore", "core",
    "gdelt-news",
    "linkup", "searxng"
  ],
  "public-finance": [
    "nber", "repec", "oecd", "worldbank", "worldbank-data", "datacommons", "imf",
    "openalex", "crossref", "core", "insee", "eurostat", "us-bls", "ons-uk", "comtrade",
    "linkup", "searxng"
  ],
  "political-anthropology": [
    "isidore", "persee", "openalex", "crossref", "sociology",
    "ajol", "core", "ucdp",
    "linkup", "searxng"
  ],
  "food-systems": [
    "fao", "worldbank", "worldbank-data", "datacommons", "openalex", "crossref", "oecd",
    "unctad", "ajol", "core", "owid", "gdelt-news",
    "linkup", "searxng"
  ],
};

// ============================================================================
// ALL DOMAIN NAMES (for LLM prompt)
// ============================================================================

const ALL_DOMAINS = Object.keys(RESEARCHER_REGISTRY) as DomainExpertise[];

const DOMAIN_DESCRIPTIONS: Record<string, string> = {};
for (const [domain, researcher] of Object.entries(RESEARCHER_REGISTRY)) {
  DOMAIN_DESCRIPTIONS[domain] = `${researcher.name} — ${researcher.title} (${researcher.institution}). Focus: ${researcher.focusAreas.join('; ')}`;
}

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

/**
 * Classify a topic into domains, assign researchers, and determine routing.
 * This is THE single function all systems should use for topic classification.
 * 
 * @param topic - The topic/question/signal title to classify
 * @param context - Optional additional context (abstract, signal summary, etc.)
 * @returns Full classification with domains, researchers, vertical, providers
 */
export async function classifyTopic(
  topic: string,
  context?: string
): Promise<TopicClassification> {
  // Check cache first
  const cached = getCached(topic);
  if (cached) return cached;

  // Try LLM classification (primary path)
  let result: TopicClassification;
  try {
    result = await classifyWithLLM(topic, context);
  } catch (err) {
    console.warn('[TOPIC CLASSIFIER] LLM classification failed, using rule-based fallback:', err);
    result = classifyWithRules(topic);
  }

  // Cache and return
  setCache(topic, result);
  return result;
}

/**
 * Synchronous rule-based classification for hot paths where async is not possible.
 * Uses keyword density scoring (improved version of the old 3 systems, unified).
 */
export function classifyTopicSync(topic: string): TopicClassification {
  const cached = getCached(topic);
  if (cached) return cached;

  const result = classifyWithRules(topic);
  setCache(topic, result);
  return result;
}

// ============================================================================
// LLM-BASED CLASSIFICATION (primary)
// ============================================================================

function buildDimensionsFromParsed(
  raw: unknown,
  scoredDomains: DomainDomainScore[],
  topic: string
): EditorialDimension[] {
  const fromLlm = Array.isArray(raw)
    ? raw
        .slice(0, 4)
        .map((d: Record<string, unknown>) => ({
          domain: String(d.domain ?? ''),
          label: String(d.label ?? formatDomainLabel(String(d.domain ?? ''))),
          angle: String(d.angle ?? ''),
          confidence: Math.max(0, Math.min(1, Number(d.confidence) || 0.5)),
        }))
        .filter((d) => d.domain && RESEARCHER_REGISTRY[d.domain as DomainExpertise])
    : [];

  if (fromLlm.length > 0) return fromLlm;

  return scoredDomains.slice(0, 3).map((d) => ({
    domain: d.domain,
    label: formatDomainLabel(d.domain),
    angle: d.researcher.focusAreas[0] ?? `Lens on ${formatDomainLabel(d.domain)}`,
    confidence: d.confidence,
  }));
}

async function classifyWithLLM(topic: string, context?: string): Promise<TopicClassification> {
  const domainList = ALL_DOMAINS.map(d => `- "${d}": ${DOMAIN_DESCRIPTIONS[d]}`).join('\n');
  
  const userContent = context 
    ? `TOPIC: "${topic}"\nCONTEXT: ${context.slice(0, 500)}`
    : `TOPIC: "${topic}"`;

  const systemPrompt = `You are the editorial director of NomosX, a strategic intelligence think tank.
Your task: classify an incoming topic to the correct research domain(s) and assess urgency.

AVAILABLE DOMAINS AND RESEARCHERS:
${domainList}

RULES:
1. A topic can belong to 1-3 domains (multi-label). Rank by relevance.
2. Urgency: "critical" = breaking news/crisis, "high" = time-sensitive (days), "medium" = important (weeks), "low" = evergreen
3. Pipeline tier: "strategic" = complex/multi-domain/high-stakes, "premium" = important single-domain, "standard" = routine monitoring
4. Be precise: "AI regulation" → law + technology, not just technology

Return JSON:
{
  "domains": [
    {"domain": "domain_id", "confidence": 0.0-1.0},
    ...max 3
  ],
  "dimensions": [
    {"domain": "domain_id", "label": "Short lens label", "angle": "What this dimension contributes to the collision", "confidence": 0.0-1.0}
  ],
  "detectedSubject": "One sentence: the cross-domain collision or signal detected (A × B × C)",
  "urgency": "critical|high|medium|low",
  "tier": "standard|premium|strategic",
  "reasoning": "one sentence explaining classification"
}

IMPORTANT: dimensions are COLLISION AXES, not silos. Example: "EU AI Act" → dimensions for regulation, grid infrastructure, labor markets — not three versions of "AI".`;

  let result = await callLLM({
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent }
    ],
    temperature: 0.1,
    maxTokens: 600,
    jsonMode: true,
    enableCache: true,
    task: 'topic_classification',
  });

  let parsed: any;
  parsed = parseJson<any>(result.content);
  if (!parsed) {
    // Retry with higher maxTokens and no cache
    console.warn('[TOPIC CLASSIFIER] First LLM response was not valid JSON, retrying with more tokens...');
    result = await callLLM({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent }
      ],
      temperature: 0.1,
      maxTokens: 1000,
      jsonMode: true,
      task: 'topic_classification',
    });
    parsed = parseJson<any>(result.content);
    if (!parsed) {
      console.warn('[TOPIC CLASSIFIER] LLM classification failed, using rule-based fallback');
      return classifyWithRules(topic);
    }
  }
  
  // Validate and enrich domains
  const scoredDomains: DomainDomainScore[] = [];
  for (const d of (parsed.domains || [])) {
    const domain = d.domain as DomainExpertise;
    if (RESEARCHER_REGISTRY[domain]) {
      scoredDomains.push({
        domain,
        confidence: Math.max(0, Math.min(1, d.confidence || 0.5)),
        researcher: RESEARCHER_REGISTRY[domain],
      });
    }
  }

  // Fallback if LLM returned no valid domains
  if (scoredDomains.length === 0) {
    return classifyWithRules(topic);
  }

  const primaryDomain = scoredDomains[0].domain;
  const isCrossDomain = scoredDomains.length >= 2 && scoredDomains[1].confidence >= 0.4;

  // Build researcher assignments
  const researchers: AssignedResearcher[] = [];
  researchers.push({
    profile: scoredDomains[0].researcher,
    role: 'lead',
    relevanceScore: scoredDomains[0].confidence,
  });
  for (let i = 1; i < scoredDomains.length; i++) {
    researchers.push({
      profile: scoredDomains[i].researcher,
      role: isCrossDomain ? 'collaborator' : 'reviewer',
      relevanceScore: scoredDomains[i].confidence,
    });
  }

  // Determine vertical
  const verticalSlug = DOMAIN_TO_VERTICAL[primaryDomain] || 'tech-innovation';
  const secondaryVerticals = scoredDomains.slice(1)
    .map(d => DOMAIN_TO_VERTICAL[d.domain])
    .filter((v): v is string => !!v && v !== verticalSlug);

  // Merge providers from all relevant domains
  const providerSet = new Set<string>();
  for (const d of scoredDomains) {
    const domainProviders = DOMAIN_PROVIDERS[d.domain] || [];
    domainProviders.forEach(p => providerSet.add(p));
  }

  // Map tier string
  const tier = (['standard', 'premium', 'strategic'].includes(parsed.tier) ? parsed.tier : 'standard') as 'standard' | 'premium' | 'strategic';
  const urgency = (['critical', 'high', 'medium', 'low'].includes(parsed.urgency) ? parsed.urgency : 'medium') as 'critical' | 'high' | 'medium' | 'low';

  const dimensions = buildDimensionsFromParsed(parsed.dimensions, scoredDomains, topic);
  const detectedSubject = String(parsed.detectedSubject ?? parsed.reasoning ?? topic).trim();

  return {
    primaryDomain,
    domains: scoredDomains,
    dimensions,
    detectedSubject,
    verticalSlug,
    secondaryVerticals: [...new Set(secondaryVerticals)],
    researchers,
    providers: Array.from(providerSet).slice(0, 12),
    urgency,
    recommendedTier: tier,
    isCrossDomain,
    reasoning: parsed.reasoning || '',
    confidence: scoredDomains[0].confidence,
    costUsd: result.costUsd,
    cached: false,
  };
}

// ============================================================================
// RULE-BASED CLASSIFICATION (fallback)
// ============================================================================

function classifyWithRules(topic: string): TopicClassification {
  const topicLower = topic.toLowerCase();
  const scores: Array<{ domain: DomainExpertise; score: number }> = [];

  for (const [domain, researcher] of Object.entries(RESEARCHER_REGISTRY)) {
    let score = 0;
    for (const keyword of researcher.keywords) {
      if (topicLower.includes(keyword.toLowerCase())) {
        score += keyword.includes(' ') ? 2.0 : 1.0; // Phrase match > word match
      }
    }
    if (score > 0) {
      scores.push({ domain: domain as DomainExpertise, score });
    }
  }

  // Sort by score, normalize
  scores.sort((a, b) => b.score - a.score);
  const maxScore = scores[0]?.score || 1;
  
  const scoredDomains: DomainDomainScore[] = scores.slice(0, 3).map(s => ({
    domain: s.domain,
    confidence: Math.min(1, s.score / maxScore),
    researcher: RESEARCHER_REGISTRY[s.domain],
  }));

  // Fallback if no keywords matched at all
  if (scoredDomains.length === 0) {
    const fallbackDomain: DomainExpertise = 'technology';
    scoredDomains.push({
      domain: fallbackDomain,
      confidence: 0.3,
      researcher: RESEARCHER_REGISTRY[fallbackDomain],
    });
  }

  const primaryDomain = scoredDomains[0].domain;
  const isCrossDomain = scoredDomains.length >= 2 && scoredDomains[1].confidence >= 0.5;

  const researchers: AssignedResearcher[] = scoredDomains.map((d, i) => ({
    profile: d.researcher,
    role: (i === 0 ? 'lead' : 'collaborator') as 'lead' | 'collaborator',
    relevanceScore: d.confidence,
  }));

  const verticalSlug = DOMAIN_TO_VERTICAL[primaryDomain] || 'tech-innovation';
  const secondaryVerticals = scoredDomains.slice(1)
    .map(d => DOMAIN_TO_VERTICAL[d.domain])
    .filter((v): v is string => !!v && v !== verticalSlug);

  const providerSet = new Set<string>();
  for (const d of scoredDomains) {
    (DOMAIN_PROVIDERS[d.domain] || []).forEach(p => providerSet.add(p));
  }

  // Infer urgency from keywords
  let urgency: 'critical' | 'high' | 'medium' | 'low' = 'medium';
  const urgentKeywords = ['crisis', 'war', 'attack', 'emergency', 'pandemic', 'crash', 'collapse', 'breaking'];
  if (urgentKeywords.some(k => topicLower.includes(k))) urgency = 'critical';
  else if (topicLower.includes('announce') || topicLower.includes('new') || topicLower.includes('reform')) urgency = 'high';

  return {
    primaryDomain,
    domains: scoredDomains,
    dimensions: scoredDomains.slice(0, 3).map((d) => ({
      domain: d.domain,
      label: formatDomainLabel(d.domain),
      angle: d.researcher.focusAreas[0] ?? `Lens on ${formatDomainLabel(d.domain)}`,
      confidence: d.confidence,
    })),
    detectedSubject: isCrossDomain
      ? `Cross-domain collision across ${scoredDomains.slice(0, 2).map((d) => formatDomainLabel(d.domain)).join(' and ')}: ${topic}`
      : topic,
    verticalSlug,
    secondaryVerticals: [...new Set(secondaryVerticals)],
    researchers,
    providers: Array.from(providerSet).slice(0, 12),
    urgency,
    recommendedTier: isCrossDomain ? 'premium' : 'standard',
    isCrossDomain,
    reasoning: `Rule-based: matched ${scoredDomains.length} domain(s), primary=${primaryDomain}`,
    confidence: scoredDomains[0].confidence,
    costUsd: 0,
    cached: false,
  };
}

// ============================================================================
// UTILITY EXPORTS — Drop-in replacements for old systems
// ============================================================================

/**
 * Drop-in replacement for signal-detector.ts classifyVertical()
 */
export function classifyVerticalUnified(source: { title?: string; abstract?: string }): string | null {
  const text = `${source.title || ''} ${source.abstract || ''}`;
  if (text.trim().length < 10) return null;
  const result = classifyTopicSync(text);
  return result.verticalSlug;
}

/**
 * Drop-in replacement for smart-provider-selector.ts detectDomain()
 */
export function detectDomainUnified(question: string): string {
  const result = classifyTopicSync(question);
  return result.primaryDomain;
}

/**
 * Drop-in replacement for researcher-ownership.ts getPrimaryOwner()
 */
export function getPrimaryResearcherUnified(topic: string): ResearcherProfile | null {
  const result = classifyTopicSync(topic);
  return result.researchers[0]?.profile || null;
}

/**
 * Get providers for a topic (replaces getProvidersForVertical + selectSmartProviders)
 */
export function getProvidersForTopic(topic: string): string[] {
  const result = classifyTopicSync(topic);
  return result.providers;
}
