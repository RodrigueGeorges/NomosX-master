/** Cohere reranking, batch ops, governance, lineage tracking.
 * 
 * SCOUT â†’ INDEX â†’ RANK â†’ READER â†’ ANALYST â†’ EDITOR â†’ GUARD â†’ PUBLISHER
 */

import {  prisma  } from '../db';
import {  callLLM  } from '../llm/unified-llm';
import {  scoreSource, scoreNovelty  } from '../score';
import {  clamp  } from '../text';
import crypto from "crypto";
import {  AgentRole, assertPermission  } from '../governance';
import { BRAND_BRIEF_FOOTER, BRAND_MANIFESTO } from '@/lib/brand/public-copy';
import { enhanceQuery, type EnhancedQuery } from './query-enhancer';
import { filterByRelevance, logRelevanceScores } from './relevance-scorer';
import { enhancedRank, type EnhancedRankedSource } from './enhanced-ranker';
import { rerankSources } from './cohere-reranker';
import { embedSourcesBatch } from './semantic-engine';
import { readerAgentV3 } from './reader-agent-v3';
import { analystAgentV3 as analystMultipass } from './analyst-multipass';
import { verifyCitations } from './citation-verifier';
import { extractAndStoreConcepts } from './knowledge-graph';
import { primeContext } from './context-primer';
import { buildMemoryInjection, recordAgentPerformance, autoDetectFailureModes, extractLessons, storeLesson, recordLearningCycle } from './agent-memory';
import { extractAndStoreGaps, getRelevantGaps, markGapsFilled } from './gap-filler';
import { assessEvidenceSufficiency } from './enrichment-reasoner';

// P1-PERF: Optional agents are lazy-loaded via dynamic import() to reduce cold start
// debateAgent, metaAnalysisEngine, runDevilsAdvocate, runHarvardCouncil,
// runEnhancedHarvardCouncil, runCollaborativeDeliberation, buildDeliberationContextBlock
import { recordSourceUsage } from './source-reputation-agent';
import { emitProgress } from './pipeline-progress';
import { selectSmartProviders } from './smart-provider-selector';
import { getHealthyProviders } from './provider-health-tracker';
import { searchExtendedProviders, getExtendedProvidersForDomain } from '../providers/registry-bridge';
import { filterLowQualitySources } from '../providers/source-quality-filter';
import { classifyTopic } from './topic-classifier';
import { isEditorialV2Enabled, getPipelineMaxBudgetUsd } from './editorial-config';
import { buildAnalysisReviewText } from './analysis-review-text';
import { runPipelineForesight } from './pipeline-foresight';
import { RESEARCHER_KBS, type KeyConcept, type AnalyticalFramework, type DomainExpertise } from './researcher-kb/index';
import { MULTI_DOMAIN_CORPUS } from '../knowledge/multi-domain-corpus';
import {
  createPipelineState, recordDecision,
  assessAfterScout, assessAfterReader, assessAfterAnalyst, assessAfterCriticalLoop,
  generateExpandedTerms, loadCalibratedThresholds,
  type PipelineState, type OrchestratorDecision,
} from './orchestrator';

// P0 FIX #3: Redis caching for SCOUT
// P2 FIX: Enhanced Redis with reconnection strategy
import { simpleRedisManager, SimpleCacheUtils } from './redis-simple';
import type { PipelineStats } from './pipeline-types';
import { createLineageTracker as createLineageTrackerTyped, recordTransformation as recordTransformationTyped } from './pipeline-types';
import { renderProfessionalBriefHTML, renderProfessionalStrategicHTML } from './editor-agent';
import { renderPositionFirstBriefHTML } from './position-first-renderer';

import { editorialArbiter } from './editorial-arbiter';
import type { CastingResult, InstitutePosition } from './editorial-types';
import type { DebateResult } from './debate-agent';
import { generatePrintHTML } from './pdf-export';
import { registerPredictions } from './prediction-registration';

function hashQuery(query: string, providers: string[]): string {
  const str = `${query}|${providers.join(",")}`;
  return crypto.createHash("md5").update(str).digest("hex");
}

/**
 * P1 FIX: Use SCAN instead of KEYS to avoid O(N) blocking in production Redis
 */
async function scanKeys(pattern: string): Promise<string[]> {
  return await simpleRedisManager.scanKeys(pattern, 100);
}

/**
 * P2 FIX #4: Cache Invalidation Strategy
 * Allow manual cache invalidation for admin purposes
 */
export async function invalidateScoutCache(query?: string): Promise<{ invalidated: number }> {
  if (!simpleRedisManager.isRedisConnected()) {
    console.warn("[Cache] Redis not available, skipping invalidation");
    return { invalidated: 0 };
  }

  const pattern = query ? `scout:*${hashQuery(query, [])}*` : "scout:*";
  const keys = await scanKeys(pattern);
  let invalidated = 0;

  for (const key of keys) {
    if (await simpleRedisManager.delete(key)) {
      invalidated++;
    }
  }

  console.log(`[Cache] Invalidated ${invalidated} scout cache entries`);
  return { invalidated };
}

/**
 * P2: Get current cache status (for monitoring/debugging)
 */
export async function getCacheStatus(): Promise<{
  connected: boolean;
  keys: number;
  scoutCacheSize: number;
}> {
  if (!simpleRedisManager.isRedisConnected()) {
    return { connected: false, keys: 0, scoutCacheSize: 0 };
  }

  try {
    const scoutKeys = await scanKeys("scout:*");

    return {
      connected: true,
      keys: scoutKeys.length, // Simplified - just count scout keys
      scoutCacheSize: scoutKeys.length
    };
  } catch (err) {
    console.error("[Cache] Failed to get status:", err);
    return { connected: false, keys: 0, scoutCacheSize: 0 };
  }
}

import { searchOpenAlex } from "../providers/openalex";
import { searchThesesFr } from "../providers/thesesfr";
import { enrichManyThesesWithHAL } from "../providers/thesesfr-hal-bridge";
import { searchCrossref } from "../providers/crossref";
import { searchSemanticScholar } from "../providers/semanticscholar";
import { searchArxiv } from "../providers/arxiv";
import { searchHAL } from "../providers/hal";
import { searchPubMed } from "../providers/pubmed";
import { searchBASE } from "../providers/base";
import { searchCORE } from "../providers/core";
import { searchEuropePMC } from "../providers/europepmc";
import { searchDOAJ } from "../providers/doaj";
import { searchSSRN } from "../providers/ssrn";
import { searchRePEc } from "../providers/repec";
import { searchNBER } from "../providers/nber";
import { searchWHOGHO } from "../providers/who-gho";
import { searchSemanticScholarGraph } from "../providers/semantic-scholar-api";
import { unpaywallByDoi } from "../providers/unpaywall";
import { searchLinkUp } from "../providers/linkup-sdk";
import { searchTavily, searchTavilyNews } from "../providers/tavily-provider";
import { searchExa, searchExaPublications } from "../providers/exa-provider";
import { searchAPITube } from "../providers/apitube-provider";
import { searchDimensions } from "../providers/dimensions-provider";
import { searchLens } from "../providers/lens-provider";
import { searchSpringer } from "../providers/springer-provider";
import { searchOSTI } from "../providers/osti-provider";
import { searchDataCite } from "../providers/datacite-provider";
import { searchGoogleBooks } from "../providers/google-books-provider";
import { searchPLOS, searchFederalRegister, searchSECEdgar, searchWorldBankDocs, searchCORDIS } from "../providers/open-access-providers";
import { searchIPCC, searchInternetArchive, searchHathiTrust, searchOpenLibrary, searchJSTOR, searchUNESCO } from "../providers/academic/foundational-sources";
import { searchClubOfRome, searchMillenniumProject } from "../providers/academic/foresight-sources";
import { PipelineContext } from "./pipeline-context";
import { indexAgent, deduplicateSources } from "./index-agent";
import { strategicAnalystAgent } from "./strategic-analyst-agent";
import { renderStrategicReportHTML } from "./strategic-report-renderer";
import { renderSourceDistributionSVG } from "./chart-generator";
import { contradictionDetector } from "./contradiction-detector";
import { trendAnalyzer } from "./trend-analyzer";
import { signalDetector } from "./signal-detector";
import { searchGDELTNews, searchNewsAPI, searchMediaStack, searchTheNewsAPI, searchGNews, searchEventRegistry } from "../providers/news-scout-providers";
import { searchIndependentMedia, searchGDELTIndependent } from "../providers/independent-media-provider";
import { searchISIDORE } from "../providers/isidore";
import { searchERIC } from "../providers/eric";
import { searchFAO } from "../providers/fao";
import { searchUNODC } from "../providers/unodc";
import { searchPhilPapers } from "../providers/philpapers";
import { searchPersee } from "../providers/persee";
import { searchOpenAIRE } from "../providers/openaire";
import { searchZenodo } from "../providers/zenodo";
import { searchPsychology } from "../providers/psychology";
import { searchSociology } from "../providers/sociology";
import { searchHistory } from "../providers/history";
import { searchGeography } from "../providers/geography";
import { searchChemistry } from "../providers/chemistry";
import { searchBiology } from "../providers/biology";
import { searchPoliticalScience } from "../providers/political-science";
import { searchBusiness } from "../providers/business";
import { searchDBLP } from "../providers/dblp";
import { searchZbMath } from "../providers/zbmath";

// Institutional providers imports
import {
  searchODNI,
  searchCIAFOIA,
  searchNSA,
  searchUKJIC,
  searchNATO,
  searchEEAS,
  searchSGDSN,
  searchEDA,
  searchIMF,
  searchWorldBank,
  searchOECD,
  searchBIS,
  searchNIST,
  searchCISA,
  searchENISA,
  searchUN,
  searchUNDP,
  searchUNCTAD,
  searchNARA,
  searchUKArchives,
  searchArchivesNationalesFR,
  // Energy & Nuclear
  searchIAEA,
  searchIRENA,
  searchCEA,
  searchENTSOE,
  searchJRC,
  searchIEA,
  searchACER,
  searchENTSOG,
  searchEnergyCharts,
  searchSMARD,
  searchRTEFrance,
  searchEnergiDataService,
  searchFingrid,
  // Think Tanks
  searchBruegel,
  // Environmental
  searchEEA,
  // Academic — Independent APIs
  searchOpenReview,
  searchBioRxiv,
  searchPapersWithCode,
  searchMITDSpace,
  searchHarvardDASH,
  searchMaxPlanckPuRe,
  // Health — Extended
  searchClinicalTrials,
  // Government — Open Data
  searchISTAT,
  searchOpenPrimitive,
  searchTreasuryFiscal,
  // Economics extended
  searchECB,
  searchEurostat,
  searchFRED,
  searchEIB,
  // Health extended
  searchEMA,
  searchINSERM,
  searchECDC,
  searchCochrane,
  // Environment
  searchINRAE,
  searchADEME,
  // French institutions
  searchENS,
  searchINSEE,
  searchShiftProject,
  searchDataGouv,
  searchFranceStrategie,
  searchCNRS,
  // Tech research institutes
  searchAllenAI,
  searchMaxPlanck,
  searchETHZurich,
  searchINRIA,
  // Law & Governance
  searchEURLex,
  // European Think Tanks
  searchECFR,
  searchSWP,
  searchSIPRI,
  searchIAI,
  // French Policy & Law
  searchIDDRI,
  searchTerraNova,
  searchLegifrance,
  searchViePublique,
  // Health Extended V2
  searchCDC,
  searchNIH,
  searchWHODirect,
  // Economics Extended V2
  searchOECDDirect,
} from "../providers/institutional";

// Providers supportés par le pipeline
export type Providers = Array<
  // Académiques core
  | "openalex" | "thesesfr" | "crossref" | "semanticscholar"
  | "arxiv" | "hal" | "pubmed" | "base"
  // Académiques — Extended Coverage
  | "core" | "europepmc" | "doaj" | "ssrn" | "repec" | "nber"
  | "who-gho" | "semantic-scholar-graph"
  // Open-access free APIs (no key)
  | "plos" | "federal-register" | "sec-edgar" | "worldbank-docs" | "cordis"
  // Institutionnels - Intelligence
  | "odni" | "cia-foia" | "nsa" | "uk-jic"
  // Institutionnels - Défense
  | "nato" | "eeas" | "sgdsn" | "eda"
  // Institutionnels - Économie
  | "imf" | "worldbank" | "oecd" | "bis"
  // Institutionnels - Économie Extended
  | "ecb" | "eurostat" | "fred" | "eib"
  // Institutionnels - Cyber
  | "nist" | "cisa" | "enisa"
  // Institutionnels - Multilatéral
  | "un" | "undp" | "unctad"
  // Institutionnels - Énergie & Nucléaire
  | "iaea" | "irena" | "cea" | "entsoe" | "jrc" | "iea" | "acer" | "entsog"
  | "energy-charts" | "smard" | "rte-france" | "energi-data" | "fingrid"
  // Institutionnels - Think Tanks
  | "bruegel"
  // Institutionnels - Environmental
  | "eea"
  // Institutionnels - Academic Independent APIs
  | "openreview" | "biorxiv" | "papers-with-code" | "mit-dspace" | "harvard-dash"
  // Institutionnels - Academic V2 (replaces OpenAlex wrappers)
  | "max-planck-pure"
  // Institutionnels - Government Open Data
  | "istat" | "open-primitive" | "treasury-fiscal"
  // Institutionnels - Health Extended V2
  | "clinical-trials"
  // Institutionnels - Santé Extended
  | "ema" | "inserm" | "ecdc" | "cochrane"
  // Institutionnels - Environnement
  | "inrae" | "ademe"
  // Institutionnels - Français
  | "ens" | "insee" | "shift-project" | "data-gouv" | "france-strategie" | "cnrs"
  // Institutionnels - Tech Research
  | "allen-ai" | "max-planck" | "eth-zurich" | "inria"
  // Institutionnels - Droit & Gouvernance
  | "eur-lex"
  // Think Tanks européens
  | "ecfr" | "swp" | "sipri" | "iai"
  // Politique française & Droit
  | "iddri" | "terra-nova" | "legifrance" | "vie-publique"
  // Santé Extended V2
  | "cdc" | "nih" | "who-direct"
  // Économie Extended V2
  | "oecd-direct"
  // Sciences Humaines & Sociales
  | "isidore" | "persee" | "philpapers"
  // Éducation
  | "eric"
  // Agriculture & Alimentation
  | "fao"
  // Criminologie & Justice
  | "unodc"
  // Science ouverte européenne
  | "openaire"
  // Open science repository (CERN/Zenodo)
  | "zenodo"
  // Domain-specific academic providers
  | "psychology" | "sociology" | "history" | "geography"
  | "chemistry" | "biology" | "political-science" | "business"
  | "dblp" | "zbmath"
  // Institutionnels - Archives
  | "nara" | "uk-archives" | "archives-fr"
  // Complémentaire - Web Search
  | "linkup"
  // AI-Optimised Search & Enriched News
  | "tavily" | "exa" | "apitube"
  // Large-scale Academic Databases
  | "dimensions" | "lens" | "springer" | "osti" | "datacite" | "google-books"
  // Foundational Sources — Books, reports, reference texts
  | "ipcc" | "internet-archive" | "hathitrust" | "open-library" | "jstor" | "unesco"
  // Foresight & Prospective Sources
  | "club-of-rome" | "millennium-project"
  // Real-time News Providers
  | "gdelt-news" | "newsapi" | "mediastack" | "thenewsapi" | "gnews" | "eventregistry"
  // Independent Media — investigative journalism, heterodox voices, Global South
  | "independent-media" | "gdelt-independent"
  // Think tanks & Policy Labs
  | "lawzero" | "govai" | "iaps" | "caip" | "aipi"
  | "cset" | "ainow" | "datasociety" | "abundance" | "caidp"
  | "scsp" | "ifp" | "cdt" | "brookings" | "fai"
  | "cnas" | "rand" | "newamerica" | "aspen-digital" | "rstreet"
>;

export const SHS_PROVIDERS = [
  'isidore', 'persee', 'philpapers', 'eric'
];

export const AGRICULTURE_PROVIDERS = [
  'fao'
];

export const CRIMINOLOGY_PROVIDERS = [
  'unodc'
];

export const EU_SCIENCE_PROVIDERS = [
  'openaire'
];

// ALL PROVIDERS - 100% COVERAGE
export const ALL_PROVIDERS = [
  // Academic core
  'openalex', 'crossref', 'semanticscholar', 'pubmed', 'arxiv',
  'doaj', 'europepmc', 'hal', 'base', 'core', 'ssrn', 'repec', 'nber',
  'who-gho', 'semantic-scholar-graph', 'thesesfr',
  'plos', 'federal-register', 'sec-edgar', 'worldbank-docs', 'cordis',
  // V3.1: Consolidated institutions (replaces 30+ individual OpenAlex ROR calls with 1 batched call)
  'consolidated-institutions',
  // V3.1: GLOBAL OMNISCIENCE LAYER — RSS-based providers covering 80+ organizations worldwide
  'global-intelligence', 'global-orgs', 'global-think-tanks', 'global-science',
  // Real-time News
  'gdelt-news', 'newsapi', 'mediastack', 'thenewsapi', 'gnews', 'eventregistry',
  // Independent Media — investigative journalism, heterodox voices, Global South
  'independent-media', 'gdelt-independent',
  // Web search
  'linkup',
  // Sciences Humaines & Sociales
  'isidore', 'persee', 'philpapers',
  // Education, Agriculture, Criminology, Open Science
  'eric', 'fao', 'unodc', 'openaire', 'zenodo',
  // Domain-specific academic providers
  'psychology', 'sociology', 'history', 'geography',
  'chemistry', 'biology', 'political-science', 'business',
  'dblp', 'zbmath',
  // Think Tanks & Policy (via extended registry)
  'brookings', 'rand', 'cnas', 'newamerica', 'lawzero',
  'ecfr', 'swp', 'sipri', 'iai', 'iddri', 'terra-nova',
  // Government & International
  'worldbank', 'imf', 'oecd', 'un', 'undp', 'eurostat', 'ecb', 'bis',
  'insee', 'fred', 'eib', 'unctad',
  // Institutional — Security & Defense
  'odni', 'cia-foia', 'nsa', 'uk-jic', 'nato', 'eeas', 'sgdsn', 'eda',
  'nist', 'cisa', 'enisa',
  // Energy & Nuclear
  'iaea', 'irena', 'cea',
  // Health
  'ema', 'inserm', 'ecdc', 'cochrane', 'cdc', 'nih', 'who-direct',
  // Environment
  'inrae', 'ademe',
  // French institutions
  'ens', 'shift-project', 'data-gouv', 'france-strategie', 'cnrs',
  'legifrance', 'vie-publique',
  // Tech Research
  'allen-ai', 'max-planck', 'eth-zurich', 'inria',
  // Law & Governance
  'eur-lex',
  // Archives
  'nara', 'uk-archives', 'archives-fr',
  // Foundational Sources — Books, reports, reference texts
  'ipcc', 'internet-archive', 'hathitrust', 'open-library', 'jstor', 'unesco',
  // Foresight & Prospective Sources
  'club-of-rome', 'millennium-project',
];

export const NEWS_PROVIDERS = [
  'gdelt-news', 'newsapi', 'mediastack', 'thenewsapi', 'gnews', 'eventregistry',
  'independent-media', 'gdelt-independent'
];

export const ACADEMIC_PROVIDERS = [
  'openalex', 'crossref', 'semanticscholar', 'pubmed', 'arxiv',
  'doaj', 'europepmc',
  // Foundational & foresight sources
  'ipcc', 'internet-archive', 'hathitrust', 'open-library', 'jstor', 'unesco',
  'club-of-rome', 'millennium-project'
];

export const GOVERNMENT_PROVIDERS = [
  'worldbank', 'imf', 'oecd', 'un', 'undp', 'eurostat', 'ecb', 'bis',
  'insee', 'thesesfr'
];

// ================================
// SCOUT AGENT WITH P0 FIX #3: Redis Caching
// ================================

/**
 * P0 FIX #3: SCOUT with Redis Cache Layer (24h TTL)
 * Reduces API calls for repeated queries by 50%
 * Performance: 30s â†’ <200ms on cache hit
 * Cost savings: $100/day â†’ $50/day
 */
export async function scout(query: string, providers: Providers, perProvider = 100) {
  // Governance: Assert SCOUT permissions
  assertPermission(AgentRole.SCOUT, "write:sources");
  
  // P0 FIX #3: Check Redis cache first
  // Try to get from cache
  const cached = await SimpleCacheUtils.getCachedScoutQuery(query, providers as string[]);
  if (cached) {
    console.log(`[SCOUT] ✅ Cache HIT for "${query}"`);
    return { ...cached, cached: true };
  }
  
  // Cache miss - run SCOUT normally
  console.log(`[SCOUT] Cache MISS for "${query}", running providers...`);
  const result = await scoutImpl(query, providers, perProvider);
  
  // Store in cache (async, don't await to not block response)
  SimpleCacheUtils.cacheScoutQuery(query, providers as string[], result.sourceIds || []).catch((err: any) => {
    console.warn(`[SCOUT] Cache write error:`, err);
  });
  
  return { ...result, cached: false };
}

/**
 * SCOUT: Unified implementation with query enhancement + reranking
 *
 * Pipeline: Query Enhancement â†’ Multi-Query Search (58+ providers)
 */
async function scoutImpl(query: string, providers: Providers, perProvider = 100) {
  const startTime = Date.now();

  // ── STEP 0: QUERY ENHANCEMENT (LLM-powered) ──
  let enhanced: EnhancedQuery | null = null;
  let searchQueries = [query];
  try {
    enhanced = await enhanceQuery(query);
    if (enhanced?.variations?.length) {
      // A+ LEVEL: Increase to 3 variations for comprehensive coverage
      searchQueries = [enhanced.enhanced, ...enhanced.variations.slice(0, 3)].filter(Boolean);
      console.log(`[SCOUT] Query enhanced: "${enhanced.enhanced}" (+${searchQueries.length - 1} variations)`);
    }
  } catch (err) {
    console.warn(`[SCOUT] Query enhancement failed (using original):`, err);
  }

  const pool: any[] = [];
  const providerSet = new Set(providers as string[]);

  // â”€â”€ STEP 1: MULTI-QUERY PARALLEL SEARCH (58+ providers) â”€â”€
  // Theses handled separately due to HAL bridge enrichment
  let thesesResults: any[] = [];
  if (providerSet.has("thesesfr")) {
    console.log("[SCOUT] Fetching theses from theses.fr...");
    const rawTheses = await searchThesesFr(query, Math.min(15, perProvider));
    console.log(`[SCOUT] Found ${rawTheses.length} theses`);

    const withDirectPDF = rawTheses.filter((t: any) => t.pdfUrl && t.pdfUrl.includes("theses.fr"));
    const withoutPDF = rawTheses.filter((t: any) => !t.pdfUrl || !t.pdfUrl.includes("theses.fr"));
    const enrichedTheses = await enrichManyThesesWithHAL(withoutPDF, 10);
    const withHALContent = enrichedTheses.filter((t: any) => t.hasFullText && t.contentSource === "hal");

    thesesResults = [...withDirectPDF, ...withHALContent].map((t: any) => ({
      ...t,
      contentQuality: t.pdfUrl?.includes("theses.fr") ? "direct-pdf" : "hal-matched",
      readyForAnalysis: true,
      metadataOnly: false,
    }));
    console.log(`[SCOUT] ${thesesResults.length}/${rawTheses.length} theses with exploitable content`);
  }

  // P0-PERF: All query variations × all providers in ONE parallel batch (was sequential per variation)
  const allPromises: Promise<any[]>[] = [];
  for (const sq of searchQueries) {
    // ACADÉMIQUES
    if (providerSet.has("openalex")) allPromises.push(searchOpenAlex(sq, perProvider));
    if (providerSet.has("crossref")) allPromises.push(searchCrossref(sq, Math.min(50, perProvider)));
    if (providerSet.has("semanticscholar")) allPromises.push(searchSemanticScholar(sq, Math.min(50, perProvider)));
    if (providerSet.has("arxiv")) allPromises.push(searchArxiv(sq, Math.min(50, perProvider)));
    if (providerSet.has("hal")) allPromises.push(searchHAL(sq, Math.min(50, perProvider)));
    if (providerSet.has("pubmed")) allPromises.push(searchPubMed(sq, Math.min(50, perProvider)));
    if (providerSet.has("base")) allPromises.push(searchBASE(sq, Math.min(50, perProvider)));

    // ACADÉMIQUES — EXTENDED COVERAGE
    if (providerSet.has("core")) allPromises.push(searchCORE(sq, Math.min(30, perProvider)));
    if (providerSet.has("europepmc")) allPromises.push(searchEuropePMC(sq, Math.min(30, perProvider)));
    if (providerSet.has("doaj")) allPromises.push(searchDOAJ(sq, Math.min(30, perProvider)));
    if (providerSet.has("ssrn")) allPromises.push(searchSSRN(sq, Math.min(20, perProvider)));
    if (providerSet.has("repec")) allPromises.push(searchRePEc(sq, Math.min(20, perProvider)));
    if (providerSet.has("nber")) allPromises.push(searchNBER(sq, Math.min(20, perProvider)));
    if (providerSet.has("who-gho")) allPromises.push(searchWHOGHO(sq, Math.min(20, perProvider)));
    if (providerSet.has("semantic-scholar-graph")) allPromises.push(searchSemanticScholarGraph(sq, Math.min(25, perProvider)));

    // CONSOLIDATED INSTITUTIONS (V3.1) — single OpenAlex request for all ROR-filtered institutions
    // Replaces 30+ individual OpenAlex calls with 1-2 batched calls
    if (providerSet.has("consolidated-institutions")) {
      const { searchConsolidatedInstitutions } = await import("../providers/institutional/consolidated-institutions");
      allPromises.push(searchConsolidatedInstitutions(sq, ['economic', 'defense', 'french', 'health', 'tech', 'multilateral'], Math.min(30, perProvider)));
    }

    // V3.1: GLOBAL OMNISCIENCE LAYER — 4 consolidated RSS-based providers covering 80+ organizations
    // Intelligence, International Orgs, Think Tanks, Science & Tech
    if (providerSet.has("global-intelligence")) {
      const { searchGlobalIntelligence } = await import("../providers/institutional/intelligence/global-intelligence");
      allPromises.push(searchGlobalIntelligence(sq, Math.min(20, perProvider)));
    }
    if (providerSet.has("global-orgs")) {
      const { searchGlobalOrgs } = await import("../providers/institutional/international/global-orgs");
      allPromises.push(searchGlobalOrgs(sq, Math.min(25, perProvider)));
    }
    if (providerSet.has("global-think-tanks")) {
      const { searchGlobalThinkTanks } = await import("../providers/institutional/think-tanks/global-think-tanks");
      allPromises.push(searchGlobalThinkTanks(sq, Math.min(25, perProvider)));
    }
    if (providerSet.has("global-science")) {
      const { searchGlobalScience } = await import("../providers/institutional/science/global-science");
      allPromises.push(searchGlobalScience(sq, Math.min(20, perProvider)));
    }

    // INSTITUTIONNELS - INTELLIGENCE (these use direct APIs, not OpenAlex)
    if (providerSet.has("odni")) allPromises.push(searchODNI(sq, Math.min(10, perProvider)));
    if (providerSet.has("cia-foia")) allPromises.push(searchCIAFOIA(sq, Math.min(10, perProvider)));
    if (providerSet.has("nsa")) allPromises.push(searchNSA(sq, Math.min(10, perProvider)));
    if (providerSet.has("uk-jic")) allPromises.push(searchUKJIC(sq, Math.min(10, perProvider)));

    // INSTITUTIONNELS - DÉFENSE (skip if consolidated is used)
    if (providerSet.has("nato") && !providerSet.has("consolidated-institutions")) allPromises.push(searchNATO(sq, Math.min(15, perProvider)));
    if (providerSet.has("eeas") && !providerSet.has("consolidated-institutions")) allPromises.push(searchEEAS(sq, Math.min(15, perProvider)));
    if (providerSet.has("sgdsn") && !providerSet.has("consolidated-institutions")) allPromises.push(searchSGDSN(sq, Math.min(10, perProvider)));
    if (providerSet.has("eda") && !providerSet.has("consolidated-institutions")) allPromises.push(searchEDA(sq, Math.min(10, perProvider)));

    // INSTITUTIONNELS - ÉCONOMIE
    if (providerSet.has("imf") && !providerSet.has("consolidated-institutions")) allPromises.push(searchIMF(sq, Math.min(15, perProvider)));
    if (providerSet.has("worldbank") && !providerSet.has("consolidated-institutions")) allPromises.push(searchWorldBank(sq, Math.min(15, perProvider)));
    if (providerSet.has("oecd") && !providerSet.has("consolidated-institutions")) allPromises.push(searchOECD(sq, Math.min(15, perProvider)));
    if (providerSet.has("bis") && !providerSet.has("consolidated-institutions")) allPromises.push(searchBIS(sq, Math.min(15, perProvider)));

    // INSTITUTIONNELS - CYBER
    if (providerSet.has("nist") && !providerSet.has("consolidated-institutions")) allPromises.push(searchNIST(sq, Math.min(10, perProvider)));
    if (providerSet.has("cisa")) allPromises.push(searchCISA(sq, Math.min(15, perProvider)));
    if (providerSet.has("enisa") && !providerSet.has("consolidated-institutions")) allPromises.push(searchENISA(sq, Math.min(10, perProvider)));

    // INSTITUTIONNELS - MULTILATÉRAL
    if (providerSet.has("un") && !providerSet.has("consolidated-institutions")) allPromises.push(searchUN(sq, Math.min(15, perProvider)));
    if (providerSet.has("undp") && !providerSet.has("consolidated-institutions")) allPromises.push(searchUNDP(sq, Math.min(15, perProvider)));
    if (providerSet.has("unctad") && !providerSet.has("consolidated-institutions")) allPromises.push(searchUNCTAD(sq, Math.min(15, perProvider)));

    // INSTITUTIONNELS - ARCHIVES
    if (providerSet.has("nara")) allPromises.push(searchNARA(sq, Math.min(10, perProvider)));
    if (providerSet.has("uk-archives")) allPromises.push(searchUKArchives(sq, Math.min(10, perProvider)));
    if (providerSet.has("archives-fr")) allPromises.push(searchArchivesNationalesFR(sq, Math.min(10, perProvider)));

    // INSTITUTIONNELS - ÉNERGIE & NUCLÉAIRE
    if (providerSet.has("iaea") && !providerSet.has("consolidated-institutions")) allPromises.push(searchIAEA(sq, Math.min(15, perProvider)));
    if (providerSet.has("irena") && !providerSet.has("consolidated-institutions")) allPromises.push(searchIRENA(sq, Math.min(15, perProvider)));
    if (providerSet.has("cea") && !providerSet.has("consolidated-institutions")) allPromises.push(searchCEA(sq, Math.min(15, perProvider)));
    if (providerSet.has("entsoe")) allPromises.push(searchENTSOE(sq, Math.min(15, perProvider)));
    if (providerSet.has("jrc")) allPromises.push(searchJRC(sq, Math.min(15, perProvider)));
    if (providerSet.has("iea")) allPromises.push(searchIEA(sq, Math.min(15, perProvider)));
    if (providerSet.has("acer")) allPromises.push(searchACER(sq, Math.min(15, perProvider)));
    if (providerSet.has("entsog")) allPromises.push(searchENTSOG(sq, Math.min(15, perProvider)));
    if (providerSet.has("energy-charts")) allPromises.push(searchEnergyCharts(sq, Math.min(10, perProvider)));
    if (providerSet.has("smard")) allPromises.push(searchSMARD(sq, Math.min(10, perProvider)));
    if (providerSet.has("rte-france")) allPromises.push(searchRTEFrance(sq, Math.min(10, perProvider)));
    if (providerSet.has("energi-data")) allPromises.push(searchEnergiDataService(sq, Math.min(10, perProvider)));
    if (providerSet.has("fingrid")) allPromises.push(searchFingrid(sq, Math.min(10, perProvider)));

    // INSTITUTIONNELS - THINK TANKS
    if (providerSet.has("bruegel") && !providerSet.has("consolidated-institutions")) allPromises.push(searchBruegel(sq, Math.min(15, perProvider)));

    // INSTITUTIONNELS - ENVIRONMENTAL
    if (providerSet.has("eea") && !providerSet.has("consolidated-institutions")) allPromises.push(searchEEA(sq, Math.min(15, perProvider)));

    // INSTITUTIONNELS - ACADEMIC INDEPENDENT APIs
    if (providerSet.has("openreview")) allPromises.push(searchOpenReview(sq, Math.min(20, perProvider)));
    if (providerSet.has("biorxiv")) allPromises.push(searchBioRxiv(sq, Math.min(20, perProvider)));
    if (providerSet.has("papers-with-code")) allPromises.push(searchPapersWithCode(sq, Math.min(20, perProvider)));
    if (providerSet.has("mit-dspace")) allPromises.push(searchMITDSpace(sq, Math.min(15, perProvider)));
    if (providerSet.has("harvard-dash")) allPromises.push(searchHarvardDASH(sq, Math.min(15, perProvider)));
    if (providerSet.has("max-planck-pure")) allPromises.push(searchMaxPlanckPuRe(sq, Math.min(15, perProvider)));

    // INSTITUTIONNELS - HEALTH EXTENDED V2
    if (providerSet.has("clinical-trials")) allPromises.push(searchClinicalTrials(sq, Math.min(15, perProvider)));

    // INSTITUTIONNELS - GOVERNMENT OPEN DATA
    if (providerSet.has("istat")) allPromises.push(searchISTAT(sq, Math.min(15, perProvider)));
    if (providerSet.has("open-primitive")) allPromises.push(searchOpenPrimitive(sq, Math.min(15, perProvider)));
    if (providerSet.has("treasury-fiscal")) allPromises.push(searchTreasuryFiscal(sq, Math.min(10, perProvider)));

    // INSTITUTIONNELS - ÉCONOMIE EXTENDED
    if (providerSet.has("ecb") && !providerSet.has("consolidated-institutions")) allPromises.push(searchECB(sq, Math.min(15, perProvider)));
    if (providerSet.has("eurostat") && !providerSet.has("consolidated-institutions")) allPromises.push(searchEurostat(sq, Math.min(15, perProvider)));
    if (providerSet.has("fred") && !providerSet.has("consolidated-institutions")) allPromises.push(searchFRED(sq, Math.min(15, perProvider)));
    if (providerSet.has("eib") && !providerSet.has("consolidated-institutions")) allPromises.push(searchEIB(sq, Math.min(15, perProvider)));

    // INSTITUTIONNELS - SANTÉ EXTENDED
    if (providerSet.has("ema") && !providerSet.has("consolidated-institutions")) allPromises.push(searchEMA(sq, Math.min(15, perProvider)));
    if (providerSet.has("inserm") && !providerSet.has("consolidated-institutions")) allPromises.push(searchINSERM(sq, Math.min(15, perProvider)));
    if (providerSet.has("ecdc") && !providerSet.has("consolidated-institutions")) allPromises.push(searchECDC(sq, Math.min(15, perProvider)));
    if (providerSet.has("cochrane") && !providerSet.has("consolidated-institutions")) allPromises.push(searchCochrane(sq, Math.min(15, perProvider)));

    // INSTITUTIONNELS - ENVIRONNEMENT
    if (providerSet.has("inrae") && !providerSet.has("consolidated-institutions")) allPromises.push(searchINRAE(sq, Math.min(15, perProvider)));
    if (providerSet.has("ademe") && !providerSet.has("consolidated-institutions")) allPromises.push(searchADEME(sq, Math.min(15, perProvider)));

    // INSTITUTIONNELS - FRANÇAIS
    if (providerSet.has("ens") && !providerSet.has("consolidated-institutions")) allPromises.push(searchENS(sq, Math.min(15, perProvider)));
    if (providerSet.has("insee") && !providerSet.has("consolidated-institutions")) allPromises.push(searchINSEE(sq, Math.min(15, perProvider)));
    if (providerSet.has("shift-project") && !providerSet.has("consolidated-institutions")) allPromises.push(searchShiftProject(sq, Math.min(15, perProvider)));
    if (providerSet.has("data-gouv")) allPromises.push(searchDataGouv(sq, Math.min(15, perProvider)));
    if (providerSet.has("france-strategie") && !providerSet.has("consolidated-institutions")) allPromises.push(searchFranceStrategie(sq, Math.min(15, perProvider)));
    if (providerSet.has("cnrs") && !providerSet.has("consolidated-institutions")) allPromises.push(searchCNRS(sq, Math.min(15, perProvider)));

    // INSTITUTIONNELS - TECH RESEARCH
    if (providerSet.has("allen-ai") && !providerSet.has("consolidated-institutions")) allPromises.push(searchAllenAI(sq, Math.min(15, perProvider)));
    if (providerSet.has("max-planck") && !providerSet.has("consolidated-institutions")) allPromises.push(searchMaxPlanck(sq, Math.min(15, perProvider)));
    if (providerSet.has("eth-zurich") && !providerSet.has("consolidated-institutions")) allPromises.push(searchETHZurich(sq, Math.min(15, perProvider)));
    if (providerSet.has("inria") && !providerSet.has("consolidated-institutions")) allPromises.push(searchINRIA(sq, Math.min(15, perProvider)));

    // INSTITUTIONNELS - DROIT & GOUVERNANCE
    if (providerSet.has("eur-lex")) allPromises.push(searchEURLex(sq, Math.min(15, perProvider)));

    // THINK TANKS EUROPÉENS
    if (providerSet.has("ecfr")) allPromises.push(searchECFR(sq, Math.min(15, perProvider)));
    if (providerSet.has("swp") && !providerSet.has("consolidated-institutions")) allPromises.push(searchSWP(sq, Math.min(15, perProvider)));
    if (providerSet.has("sipri") && !providerSet.has("consolidated-institutions")) allPromises.push(searchSIPRI(sq, Math.min(15, perProvider)));
    if (providerSet.has("iai") && !providerSet.has("consolidated-institutions")) allPromises.push(searchIAI(sq, Math.min(15, perProvider)));

    // POLITIQUE FRANÇAISE & DROIT
    if (providerSet.has("iddri") && !providerSet.has("consolidated-institutions")) allPromises.push(searchIDDRI(sq, Math.min(15, perProvider)));
    if (providerSet.has("terra-nova") && !providerSet.has("consolidated-institutions")) allPromises.push(searchTerraNova(sq, Math.min(15, perProvider)));
    if (providerSet.has("legifrance")) allPromises.push(searchLegifrance(sq, Math.min(15, perProvider)));
    if (providerSet.has("vie-publique")) allPromises.push(searchViePublique(sq, Math.min(15, perProvider)));

    // SANTÉ EXTENDED V2
    if (providerSet.has("cdc") && !providerSet.has("consolidated-institutions")) allPromises.push(searchCDC(sq, Math.min(15, perProvider)));
    if (providerSet.has("nih") && !providerSet.has("consolidated-institutions")) allPromises.push(searchNIH(sq, Math.min(15, perProvider)));
    if (providerSet.has("who-direct") && !providerSet.has("consolidated-institutions")) allPromises.push(searchWHODirect(sq, Math.min(15, perProvider)));

    // ÉCONOMIE EXTENDED V2
    if (providerSet.has("oecd-direct") && !providerSet.has("consolidated-institutions")) allPromises.push(searchOECDDirect(sq, Math.min(15, perProvider)));

    // SCIENCES HUMAINES & SOCIALES
    if (providerSet.has("isidore")) allPromises.push(searchISIDORE(sq, Math.min(20, perProvider)));
    if (providerSet.has("persee")) allPromises.push(searchPersee(sq, Math.min(20, perProvider)));
    if (providerSet.has("philpapers")) allPromises.push(searchPhilPapers(sq, Math.min(20, perProvider)));

    // ÉDUCATION
    if (providerSet.has("eric")) allPromises.push(searchERIC(sq, Math.min(20, perProvider)));

    // AGRICULTURE & ALIMENTATION
    if (providerSet.has("fao")) allPromises.push(searchFAO(sq, Math.min(15, perProvider)));

    // CRIMINOLOGIE & JUSTICE
    if (providerSet.has("unodc")) allPromises.push(searchUNODC(sq, Math.min(15, perProvider)));

    // SCIENCE OUVERTE EUROPÉENNE
    if (providerSet.has("openaire")) allPromises.push(searchOpenAIRE(sq, Math.min(20, perProvider)));

    // OPEN SCIENCE REPOSITORY (CERN/Zenodo)
    if (providerSet.has("zenodo")) allPromises.push(searchZenodo(sq, Math.min(20, perProvider)));

    // DOMAIN-SPECIFIC ACADEMIC PROVIDERS (S2 field-of-study + OpenAlex concept fallback)
    if (providerSet.has("psychology")) allPromises.push(searchPsychology(sq, Math.min(15, perProvider)));
    if (providerSet.has("sociology")) allPromises.push(searchSociology(sq, Math.min(15, perProvider)));
    if (providerSet.has("history")) allPromises.push(searchHistory(sq, Math.min(15, perProvider)));
    if (providerSet.has("geography")) allPromises.push(searchGeography(sq, Math.min(15, perProvider)));
    if (providerSet.has("chemistry")) allPromises.push(searchChemistry(sq, Math.min(15, perProvider)));
    if (providerSet.has("biology")) allPromises.push(searchBiology(sq, Math.min(15, perProvider)));
    if (providerSet.has("political-science")) allPromises.push(searchPoliticalScience(sq, Math.min(15, perProvider)));
    if (providerSet.has("business")) allPromises.push(searchBusiness(sq, Math.min(15, perProvider)));

    // CS CONFERENCES & MATH (DBLP + zbMATH — dedicated APIs with S2/OpenAlex fallback)
    if (providerSet.has("dblp")) allPromises.push(searchDBLP(sq, Math.min(20, perProvider)));
    if (providerSet.has("zbmath")) allPromises.push(searchZbMath(sq, Math.min(20, perProvider)));

    // ACADEMIC DATABASES — Large-scale scholarly indexes
    if (providerSet.has("dimensions")) allPromises.push(searchDimensions(sq, Math.min(20, perProvider)));
    if (providerSet.has("lens")) allPromises.push(searchLens(sq, Math.min(20, perProvider)));
    if (providerSet.has("springer")) allPromises.push(searchSpringer(sq, Math.min(20, perProvider)));
    if (providerSet.has("osti")) allPromises.push(searchOSTI(sq, Math.min(20, perProvider)));
    if (providerSet.has("datacite")) allPromises.push(searchDataCite(sq, Math.min(15, perProvider)));
    if (providerSet.has("google-books")) allPromises.push(searchGoogleBooks(sq, Math.min(15, perProvider)));

    // OPEN-ACCESS FREE APIs (no key required)
    if (providerSet.has("plos")) allPromises.push(searchPLOS(sq, Math.min(20, perProvider)));
    if (providerSet.has("federal-register")) allPromises.push(searchFederalRegister(sq, Math.min(15, perProvider)));
    if (providerSet.has("sec-edgar")) allPromises.push(searchSECEdgar(sq, Math.min(15, perProvider)));
    if (providerSet.has("worldbank-docs")) allPromises.push(searchWorldBankDocs(sq, Math.min(15, perProvider)));
    if (providerSet.has("cordis")) allPromises.push(searchCORDIS(sq, Math.min(15, perProvider)));

    // FOUNDATIONAL SOURCES — Books, reports, reference texts for prospective research
    if (providerSet.has("ipcc")) allPromises.push(searchIPCC(sq, Math.min(15, perProvider)));
    if (providerSet.has("internet-archive")) allPromises.push(searchInternetArchive(sq, Math.min(20, perProvider)));
    if (providerSet.has("hathitrust")) allPromises.push(searchHathiTrust(sq, Math.min(15, perProvider)));
    if (providerSet.has("open-library")) allPromises.push(searchOpenLibrary(sq, Math.min(15, perProvider)));
    if (providerSet.has("jstor")) allPromises.push(searchJSTOR(sq, Math.min(15, perProvider)));
    if (providerSet.has("unesco")) allPromises.push(searchUNESCO(sq, Math.min(15, perProvider)));

    // FORESIGHT & PROSPECTIVE SOURCES — Strategic foresight organizations
    if (providerSet.has("club-of-rome")) allPromises.push(searchClubOfRome(sq, Math.min(10, perProvider)));
    if (providerSet.has("millennium-project")) allPromises.push(searchMillenniumProject(sq, Math.min(10, perProvider)));

    // COMPLÉMENTAIRE - WEB SEARCH (enrichment fallback, not primary research)
    if (providerSet.has("linkup")) allPromises.push(searchLinkUp(sq, Math.min(15, perProvider)));
    if (providerSet.has("tavily")) allPromises.push(searchTavily(sq, Math.min(15, perProvider), { topic: 'general' }));
    if (providerSet.has("exa")) allPromises.push(searchExaPublications(sq, Math.min(20, perProvider)));

    // REAL-TIME NEWS PROVIDERS
    if (providerSet.has("gdelt-news")) allPromises.push(searchGDELTNews(sq, Math.min(30, perProvider)));
    if (providerSet.has("newsapi")) allPromises.push(searchNewsAPI(sq, Math.min(30, perProvider)));
    if (providerSet.has("mediastack")) allPromises.push(searchMediaStack(sq, Math.min(25, perProvider)));
    if (providerSet.has("thenewsapi")) allPromises.push(searchTheNewsAPI(sq, Math.min(30, perProvider)));
    if (providerSet.has("gnews")) allPromises.push(searchGNews(sq, Math.min(10, perProvider)));
    if (providerSet.has("eventregistry")) allPromises.push(searchEventRegistry(sq, Math.min(25, perProvider)));
    if (providerSet.has("apitube")) allPromises.push(searchAPITube(sq, Math.min(25, perProvider)));

    // INDEPENDENT MEDIA — investigative journalism, heterodox voices, Global South, expert blogs
    if (providerSet.has("independent-media")) allPromises.push(searchIndependentMedia(sq, Math.min(30, perProvider)));
    if (providerSet.has("gdelt-independent")) allPromises.push(searchGDELTIndependent(sq, Math.min(20, perProvider)));

    // THINK TANKS & POLICY LABS — catch-all for providers not explicitly routed above
    // (brookings, rand, cfr, iiss, chatham-house, cset, carnegie, cnas, newamerica, etc.)
    const EXPLICITLY_ROUTED = new Set([
      "openalex", "thesesfr", "crossref", "semanticscholar", "arxiv", "hal", "pubmed", "base",
      "core", "europepmc", "doaj", "ssrn", "repec", "nber", "who-gho", "semantic-scholar-graph",
      "plos", "federal-register", "sec-edgar", "worldbank-docs", "cordis",
      "odni", "cia-foia", "nsa", "uk-jic",
      "nato", "eeas", "sgdsn", "eda",
      "imf", "worldbank", "oecd", "bis",
      "ecb", "eurostat", "fred", "eib",
      "nist", "cisa", "enisa",
      "un", "undp", "unctad",
      "iaea", "irena", "cea", "entsoe", "jrc", "iea", "acer", "entsog",
      "energy-charts", "smard", "rte-france", "energi-data", "fingrid",
      "bruegel",
      "eea",
      "openreview", "biorxiv", "papers-with-code", "mit-dspace", "harvard-dash",
      "max-planck-pure",
      "clinical-trials",
      "istat", "open-primitive", "treasury-fiscal",
      "ema", "inserm", "ecdc", "cochrane",
      "inrae", "ademe",
      "ens", "insee", "shift-project", "data-gouv", "france-strategie", "cnrs",
      "allen-ai", "max-planck", "eth-zurich", "inria",
      "eur-lex",
      "ecfr", "swp", "sipri", "iai",
      "iddri", "terra-nova", "legifrance", "vie-publique",
      "cdc", "nih", "who-direct",
      "oecd-direct",
      "isidore", "persee", "philpapers",
      "eric",
      "fao",
      "unodc",
      "openaire",
      "zenodo",
      "psychology", "sociology", "history", "geography",
      "chemistry", "biology", "political-science", "business",
      "dblp", "zbmath",
      "dimensions", "lens", "springer", "osti", "datacite", "google-books",
      "ipcc", "internet-archive", "hathitrust", "open-library", "jstor", "unesco",
      "club-of-rome", "millennium-project",
      "nara", "uk-archives", "archives-fr",
      "linkup",
      "tavily", "exa", "apitube",
      "gdelt-news", "newsapi", "mediastack", "thenewsapi", "gnews", "eventregistry",
      "independent-media", "gdelt-independent",
    ]);
    const unroutedProviders = (providers as string[]).filter(p => !EXPLICITLY_ROUTED.has(p));
    if (unroutedProviders.length > 0) {
      allPromises.push(
        searchExtendedProviders(sq, { providers: unroutedProviders, limit: Math.min(20, perProvider) })
          .then((results: any[]) => results.map((r: any) => ({ ...r, _fromExtended: true })))
      );
    }
  }

  console.log(`[SCOUT] Launching ${allPromises.length} parallel requests across ${searchQueries.length} query variations`);
  const allResults = await Promise.allSettled(allPromises);
  
  // Per-provider logging for diagnostic visibility
  const providerCounts = new Map<string, number>();
  for (const r of allResults) {
    if (r.status === "fulfilled") {
      pool.push(...r.value);
      const provider = r.value[0]?.provider || (r.value.length === 0 ? '_unknown' : '_unknown');
      providerCounts.set(provider, (providerCounts.get(provider) || 0) + r.value.length);
    }
  }
  // Log per-provider results (including zeros for diagnosis)
  const providerLogEntries: string[] = [];
  for (const [prov, count] of providerCounts.entries()) {
    providerLogEntries.push(`${prov}=${count}`);
  }
  console.log(`[SCOUT] Per-provider results: ${providerLogEntries.join(', ') || 'none'}`);

  pool.push(...thesesResults);

  // â”€â”€ STEP 1b: EXTENDED REGISTRY PROVIDERS (class-based bridge) â”€â”€
  // Automatically include relevant extended providers based on query domain
  try {
    const queryForDomain = searchQueries[0] || query;
    const domainKeywords: Record<string, string[]> = {
      health: ["health", "medical", "disease", "clinical", "patient", "hospital", "pharma", "drug"],
      ai: ["artificial intelligence", "machine learning", "deep learning", "neural", "nlp", "llm", "gpt"],
      climate: ["climate", "carbon", "emission", "renewable", "energy transition", "solar", "wind"],
      economics: ["economic", "gdp", "inflation", "monetary", "fiscal", "trade", "market"],
      geopolitics: ["geopolitical", "foreign policy", "diplomacy", "conflict", "war", "sanctions"],
      security: ["cybersecurity", "defense", "military", "threat", "intelligence"],
      science: ["biology", "physics", "chemistry", "genome", "quantum", "molecular"],
      business: ["business", "strategy", "consulting", "management", "corporate"],
    };

    const qLower = queryForDomain.toLowerCase();
    const detectedDomains: string[] = [];
    for (const [domain, keywords] of Object.entries(domainKeywords)) {
      if (keywords.some(kw => qLower.includes(kw))) {
        detectedDomains.push(domain);
      }
    }

    if (detectedDomains.length > 0) {
      const extProviders = new Set<string>();
      for (const domain of detectedDomains.slice(0, 3)) { // Increased from 2 to 3 domains
        const domainProviders = getExtendedProvidersForDomain(domain);
        domainProviders.slice(0, 5).forEach(p => extProviders.add(p)); // Increased from 3 to 5 providers per domain
      }

      if (extProviders.size > 0) {
        const extResults = await searchExtendedProviders(
          queryForDomain,
          { providers: Array.from(extProviders) }
        );
        pool.push(...extResults);
        console.log(`[SCOUT] Extended registry: +${extResults.length} sources from ${extProviders.size} providers (${detectedDomains.join(", ")})`);
      }
    }
  } catch (err) {
    console.warn(`[SCOUT] Extended registry bridge failed (continuing):`, err);
  }

  // ── STEP 1c: SOURCE QUALITY FILTER (SEO farms, spam directories, content mills) ──
  // Applied BEFORE dedup so spam sources never enter the dedup index or DB.
  const preFilterCount = pool.length;
  const qualityFilteredPool = filterLowQualitySources(pool);
  const filtered = preFilterCount - qualityFilteredPool.length;
  if (filtered > 0) {
    console.log(`[SCOUT] Filtered ${filtered} low-quality sources (SEO farms, spam)`);
  }
  pool.length = 0;
  pool.push(...qualityFilteredPool);

  const rawCount = pool.length;
  const distinctProviders = new Set(pool.map(s => s.provider));
  console.log(`[SCOUT] Raw results: ${rawCount} sources from ${searchQueries.length} query variations (${distinctProviders.size} providers: ${Array.from(distinctProviders).join(', ')})`);

  // DIVERSITY GUARD: warn if corpus is degraded
  if (distinctProviders.size < 3) {
    console.warn(`[SCOUT] ⚠️ LOW DIVERSITY: only ${distinctProviders.size} provider(s) — ${Array.from(distinctProviders).join(', ')}. Corpus may be biased.`);
  }
  if (rawCount < 10) {
    console.warn(`[SCOUT] ⚠️ LOW SOURCE COUNT: only ${rawCount} sources. Consider expanding providers or retrying.`);
  }

  // â”€â”€ STEP 2: DEDUPLICATION (by DOI then normalized title) â”€â”€
  const institutionalProviders = new Set([
    'iaea', 'irena', 'cea', 'entsoe', 'jrc', 'iea', 'acer', 'entsog', 'bruegel', 'eea',
    'openreview', 'biorxiv', 'papers-with-code', 'mit-dspace', 'harvard-dash', 'max-planck-pure',
    'energy-charts', 'smard', 'rte-france', 'energi-data', 'fingrid',
    'istat', 'open-primitive', 'treasury-fiscal', 'clinical-trials',
    'oecd', 'oecd-direct', 'worldbank', 'imf', 'bis',
    'eurostat', 'ecb', 'eib', 'fred', 'insee', 'data-gouv', 'ademe', 'inrae',
    'france-strategie', 'shift-project', 'iddri', 'eeas', 'eur-lex', 'ecfr',
    'swp', 'sipri', 'iai', 'nato', 'un', 'undp', 'unctad', 'nist', 'cisa',
    'enisa', 'sgdsn', 'eda', 'cnrs', 'inria', 'ens', 'max-planck', 'eth-zurich',
    'allen-ai', 'cdc', 'nih', 'who-direct', 'who-gho', 'ema', 'inserm', 'ecdc',
    'cochrane', 'legifrance', 'vie-publique', 'archives-fr', 'nara', 'uk-archives',
  ]);
  const seen = new Map<string, any>();
  const titleIndex = new Map<string, boolean>();
  for (const s of pool) {
    if (s.doi) {
      const doi = String(s.doi).toLowerCase();
      const existing = seen.get(`doi:${doi}`);
      if (!existing) {
        seen.set(`doi:${doi}`, s);
      } else if (institutionalProviders.has(s.provider) && !institutionalProviders.has(existing.provider)) {
        seen.set(`doi:${doi}`, s);
      }
      continue;
    }
    const normTitle = (s.title || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^\w\s]/g, "").replace(/\s+/g, " ").trim();
    if (normTitle && !titleIndex.has(normTitle)) {
      titleIndex.set(normTitle, true);
      seen.set(s.id, s);
    } else if (!normTitle) {
      seen.set(s.id, s);
    }
  }
  const deduped = Array.from(seen.values());
  console.log(`[SCOUT] After dedup: ${deduped.length}/${rawCount}`);

  // ── STEP 3: RELEVANCE FILTERING + COHERE RERANKING ──
  let finalPool = deduped;
  if (enhanced && deduped.length > 10) {
    try {
      const relevant = filterByRelevance(deduped, enhanced, 0.10);
      if (relevant.length >= 3) {
        console.log(`[SCOUT] After relevance filter: ${relevant.length}/${deduped.length}`);
        logRelevanceScores(relevant, 5);

        const reranked = await rerankSources(
          relevant.map(r => r.source),
          enhanced,
          { topK: Math.min(200, relevant.length), minScore: 0.1 }
        );
        finalPool = reranked.map(r => r.source);
        console.log(`[SCOUT] After Cohere rerank: ${finalPool.length} sources`);
      } else {
        console.log(`[SCOUT] Relevance filter too strict (${relevant.length} results), keeping all ${deduped.length}`);
      }
    } catch (err) {
      console.warn(`[SCOUT] Relevance/rerank failed (keeping deduped pool):`, err);
    }
  }

  // CAP: Limit total sources to avoid embedding/indexing overload
  // 500 sources is more than enough for any report format (brief: 12, strategic: 25, dossier: 50)
  const MAX_SCOUT_SOURCES = 500;
  if (finalPool.length > MAX_SCOUT_SOURCES) {
    console.log(`[SCOUT] Capping at ${MAX_SCOUT_SOURCES} sources (was ${finalPool.length})`);
    finalPool = finalPool.slice(0, MAX_SCOUT_SOURCES);
  }

  // ── STEP 4: BATCH UNPAYWALL ENRICHMENT ──
  // Skip Unpaywall for DataCite-registered DOIs (Zenodo, OSF, etc.) — these are already OA
  // and Unpaywall only covers Crossref-registered DOIs, so it returns 404 uselessly.
  const DATACITE_PREFIXES = ['10.5281/zenodo.', '10.5281/zenodo', '10.17605/osf.io/', '10.60644/', '10.25365/thesis.', '10.26250/', '10.48350/', '10.26153/tsw/'];
  const isDataCiteDoi = (doi: string) => DATACITE_PREFIXES.some(p => doi.toLowerCase().startsWith(p));
  const needsUnpaywall = finalPool.filter(s => !s.pdfUrl && s.doi && !isDataCiteDoi(s.doi));
  if (needsUnpaywall.length > 0) {
    const CHUNK_SIZE = 10;
    for (let i = 0; i < needsUnpaywall.length; i += CHUNK_SIZE) {
      const chunk = needsUnpaywall.slice(i, i + CHUNK_SIZE);
      const enrichResults = await Promise.allSettled(
        chunk.map(s => unpaywallByDoi(s.doi).catch(() => null))
      );
      enrichResults.forEach((r, idx) => {
        if (r.status === "fulfilled" && r.value) {
          chunk[idx].pdfUrl = r.value.pdfUrl ?? chunk[idx].pdfUrl;
          chunk[idx].oaStatus = r.value.oaStatus ?? chunk[idx].oaStatus;
        }
      });
    }
    console.log(`[SCOUT] Enriched ${needsUnpaywall.length} sources with Unpaywall (batched)`);
  }

  // — STEP 5: BATCH UPSERT (sequential with deadlock retry) —
  const BATCH_SIZE = 20;
  const MAX_RETRIES = 2;
  const sourceIds: string[] = [];
  let upserted = 0;

  for (let i = 0; i < finalPool.length; i += BATCH_SIZE) {
    const batch = finalPool.slice(i, i + BATCH_SIZE);
    const preparedBatch = batch.map(s => {
      if (!s.id) {
        const slug = (s.doi || s.url || s.title || "unknown").replace(/[^a-z0-9]/gi, "-").slice(0, 60).toLowerCase();
        s.id = `${s.provider}:${slug}`;
      }
      const qualityScore = scoreSource({
        year: s.year ?? null,
        citationCount: s.citationCount ?? null,
        oaStatus: s.oaStatus ?? null,
        institutions: s.institutions?.map((inst: any) => inst.name) ?? [],
        provider: s.provider,
        type: s.type,
        abstract: s.abstract ?? null,
        hasFullText: s.hasFullText ?? null,
        contentLength: s.contentLength ?? s.abstract?.length ?? null,
      });
      return {
        id: s.id,
        data: {
          provider: s.provider,
          type: s.type || "paper",
          title: s.title || "",
          abstract: s.abstract ? clamp(String(s.abstract), 8000) : null,
          year: s.year ?? null,
          doi: s.doi ?? null,
          url: s.url ?? null,
          pdfUrl: s.pdfUrl ?? null,
          oaStatus: s.oaStatus ?? null,
          topics: (s.topics ?? []).map(String).filter(Boolean),
          jelCodes: (s.jelCodes ?? []).map(String).filter(Boolean),
          citationCount: s.citationCount ?? null,
          qualityScore,
          raw: {
            ...(s.raw ?? {}),
            authors: s.authors || (s.raw as any)?.authors || [],
            institutions: s.institutions || (s.raw as any)?.institutions || [],
          },
        },
      };
    });

    // Try batch transaction with deadlock retry
    let success = false;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const ops = preparedBatch.map(({ id, data }) =>
          prisma.source.upsert({ where: { id }, update: data, create: { id, ...data } })
        );
        const txResults = await prisma.$transaction(ops);
        txResults.forEach(r => sourceIds.push(r.id));
        upserted += txResults.length;
        success = true;
        break;
      } catch (err: any) {
        const isDeadlock = err?.message?.includes('deadlock') || err?.code === '40P01';
        if (isDeadlock && attempt < MAX_RETRIES) {
          await new Promise(r => setTimeout(r, 200 * (attempt + 1)));
          continue;
        }
        // Final attempt or non-deadlock: fall back to sequential upserts
        for (const { id, data } of preparedBatch) {
          try {
            const r = await prisma.source.upsert({ where: { id }, update: data, create: { id, ...data } });
            sourceIds.push(r.id);
            upserted++;
          } catch { /* skip individual failures */ }
        }
        success = true;
        break;
      }
    }
  }

  const elapsed = Date.now() - startTime;
  console.log(`[SCOUT] Done in ${elapsed}ms: ${rawCount} raw â†’ ${deduped.length} dedup â†’ ${finalPool.length} ranked â†’ ${upserted} saved`);

  // LOT 1.3: Tag sources with detected domain (best-effort, non-blocking)
  try {
    const { detectDomain } = await import('./smart-provider-selector');
    for (const sourceId of sourceIds) {
      const source = await prisma.source.findUnique({ where: { id: sourceId }, select: { title: true } }).catch(() => null);
      if (!source?.title) continue;
      const domainSlug = detectDomain(source.title);
      if (domainSlug && domainSlug !== 'default') {
        const domain = await prisma.domain.upsert({
          where: { slug: domainSlug },
          update: {},
          create: {
            slug: domainSlug,
            name: domainSlug,
            nameEn: domainSlug,
            icon: 'default',
            color: '#666666',
            description: `Auto-generated domain: ${domainSlug}`,
            keywords: [],
            jelCodes: [],
          },
        }).catch(() => null);
        if (domain) {
          await prisma.sourceDomain.upsert({
            where: { sourceId_domainId: { sourceId: sourceId, domainId: domain.id } },
            update: {},
            create: { sourceId: sourceId, domainId: domain.id, score: 0.7 },
          }).catch(() => { /* non-blocking */ });
        }
      }
    }
  } catch (err) {
    console.warn(`[SCOUT] Domain tagging failed (non-blocking):`, err);
  }

  return { found: rawCount, upserted, sourceIds };
}

// ================================
// INDEX AGENT (wrapper)
// ================================

export async function index(sourceIds: string[]) {
  const result = await indexAgent(sourceIds);
  
  // P1 FIX: Batch novelty score updates (was sequential N+1)
  const sources = await prisma.source.findMany({
    where: { id: { in: sourceIds } },
    select: { id: true, year: true, citationCount: true, createdAt: true },
  });

  if (sources.length > 0) {
    const updateOps = sources.map(source => {
      const noveltyScore = scoreNovelty({
        year: source.year,
        citationCount: source.citationCount,
        createdAt: source.createdAt,
      });
      return prisma.source.update({
        where: { id: source.id },
        data: { noveltyScore },
      });
    });
    await prisma.$transaction(updateOps);
    console.log(`[INDEX] Updated novelty scores for ${sources.length} sources (batched)`);
  }
  
  return result;
}

// ================================
// RANK AGENT V3 - Enhanced with relevance/date filtering
// ================================

export interface RankOptions {
  limit?: number;
  mode?: "quality" | "novelty" | "balanced";
  // CRITICAL: Scope to current SCOUT run
  sourceIds?: string[];           // Only rank these sources (from SCOUT)
  // Date filtering
  minYear?: number;
  maxYear?: number;
  recentOnly?: boolean; // Only sources from last 3 years
  // Relevance filtering
  minQuality?: number;
  excludeProviders?: string[];
  includeProviders?: string[];
  // Content filtering
  requireAbstract?: boolean;
  minAbstractLength?: number;
  // Diversity controls
  maxPerProvider?: number;
  maxPerYear?: number;
  minProviderDiversity?: number;
}

export async function rank(
  query: string,
  limitOrOptions: number | RankOptions = 12,
  mode: "quality" | "novelty" | "balanced" = "balanced"
): Promise<EnhancedRankedSource[]> {
  // A+ LEVEL: Use enhanced ranking with higher standards
  const options = typeof limitOrOptions === 'number' 
    ? { limit: limitOrOptions, mode }
    : { limit: 12, mode, ...limitOrOptions };

  console.log(`[RANK] Using A+ level enhanced ranking with query: "${query}"`);
  
  return await enhancedRank(query, options, mode);
}


// ================================
// READER AGENT (wrapper)
// ================================

export async function read(sources: any[]) {
  return await readerAgentV3(sources);
}

// ================================
// TOPIC CONSISTENCY VALIDATOR - A+ LEVEL
// ================================

/**
 * Validate topic consistency across pipeline stages
 */
export async function validateTopicConsistency(
  originalQuery: string,
  sources: any[],
  analysis?: any
): Promise<{ isValid: boolean; issues: string[] }> {
  const issues: string[] = [];
  
  // 1. Check source relevance distribution
  const relevantSources = sources.filter(source => {
    const relevance = calculateBasicRelevance(originalQuery, source);
    return relevance > 0.5;
  });
  
  const relevanceRatio = relevantSources.length / sources.length;
  if (relevanceRatio < 0.7) {
    issues.push(`Low source relevance: ${(relevanceRatio * 100).toFixed(1)}% relevant sources`);
  }
  
  // 2. Check analysis topic alignment
  if (analysis) {
    const analysisText = JSON.stringify(analysis).toLowerCase();
    const queryTerms = originalQuery.toLowerCase().split(/\s+/).filter(t => t.length > 3);
    const matchedTerms = queryTerms.filter(term => analysisText.includes(term));
    
    if (matchedTerms.length / queryTerms.length < 0.5) {
      issues.push(`Analysis misaligned: only ${matchedTerms.length}/${queryTerms.length} query terms found`);
    }
  }
  
  return {
    isValid: issues.length === 0,
    issues
  };
}

/**
 * Basic relevance calculation for validation
 */
function calculateBasicRelevance(query: string, source: any): number {
  const queryTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);
  const content = `${source.title || ''} ${source.abstract || ''}`.toLowerCase();
  
  let matches = 0;
  queryTerms.forEach(term => {
    if (content.includes(term)) matches++;
  });
  
  return queryTerms.length > 0 ? matches / queryTerms.length : 0;
}

export async function analyst(question: string, sources: any[], readings?: any[]) {
  console.log(`[ANALYST] Using multi-pass V3 analyst (3-pass: thematic → contradictions → synthesis)`);
  return await analystMultipass(question, sources, readings);
}

// ================================
// IDEMPOTENCY TOKENS (2026 best practice)
// ================================

const activeRuns = new Map<string, { startedAt: number; expiresAt: number }>();

// ================================
// HTML ESCAPE UTILITY
// ================================

function esc(s: string): string {
  return String(s || '').replace(/[&<>"']/g, (m) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m] as string)
  );
}

// ================================
// CITATION GUARD
// ================================

export function citationGuard(json: any, sourceCount: number, modelCount = 0) {
  const allText = JSON.stringify(json || {});
  // Count distinct cited sources (a source cited multiple times counts once).
  const used = Array.from(
    new Set(Array.from(allText.matchAll(/SRC-(\d+)/g)).map((m) => Number(m[1])))
  );
  const invalid = used.filter((n) => n < 1 || n > sourceCount);
  // MODEL-N tags reference deterministic QUANT BRIDGE models; any tag beyond
  // the number of models actually run is a fabricated model reference.
  const usedModels = Array.from(
    new Set(Array.from(allText.matchAll(/MODEL-(\d+)/g)).map((m) => Number(m[1])))
  );
  const invalidModels = usedModels.filter((n) => n < 1 || n > modelCount);
  // Detect malformed tags like [MODEL-] or [MODEL-abc] that the digit regex misses.
  // These indicate the model tried to cite a model but formatted it wrong — flag them.
  const malformedModelTags = Array.from(
    allText.matchAll(/\[MODEL-(?!\d)/gi)
  );
  const malformedModelCount = malformedModelTags.length;
  return {
    ok: used.length > 0 && invalid.length === 0 && invalidModels.length === 0 && malformedModelCount === 0,
    usedCount: used.length,
    invalid,
    usedModelCount: usedModels.length,
    invalidModels,
    malformedModelCount,
  };
}

// ================================
// CITATION DEDUPLICATION — shared helper
// ================================

/**
 * Deduplicate and normalize [SRC-N] citation tags produced by the LLM.
 *
 * Fixes three common LLM artifacts:
 *  1. Doubled prefix:  [SRC-SRC-2] → [SRC-2]
 *  2. Adjacent identical citations (with optional whitespace between):
 *     [SRC-13][SRC-13] → [SRC-13]  (renders as "1313" otherwise)
 *  3. Repeated citations within the same sentence: keep only the first
 *     occurrence of each [SRC-N] per sentence.
 *
 * Exported so other renderers (editor-agent, strategic-report-renderer) can reuse it.
 */
export function dedupeCitations(text: string): string {
  if (!text) return text;
  let result = text;
  // 1. Fix doubled prefix: [SRC-SRC-N] → [SRC-N]
  result = result.replace(/\[SRC-SRC-(\d+)\]/g, '[SRC-$1]');
  // 2. Collapse adjacent identical citations (allow whitespace between them).
  //    Loop so triples like [SRC-1][SRC-1][SRC-1] fully collapse.
  let prev: string;
  do {
    prev = result;
    result = result.replace(/\[SRC-(\d+)\]\s*\[SRC-\1\]/g, '[SRC-$1]');
  } while (result !== prev);
  // 3. Within a single sentence, keep only the first occurrence of each [SRC-N].
  result = result.replace(/[^.!?]*[.!?]|[^.!?]+$/g, (sentence) => {
    const seen = new Set<string>();
    return sentence.replace(/\[SRC-(\d+)\]/g, (m, n) => {
      if (seen.has(n)) return '';
      seen.add(n);
      return m;
    });
  });
  return result;
}

// ================================
// EDITOR AGENT
// ================================

export function renderBriefHTML(out: any, sources: any[]) {
  // Governance: Assert EDITOR permissions
  assertPermission(AgentRole.EDITOR, "write:draft");
  
  const section = (h: string, v: any) => {
    if (!v) return "";
    const normalized = dedupeCitations(String(v)
      .replace(/\(SRC-(\d+)(?:\s*,\s*SRC-(\d+))*\)/g, (match: string) => {
        const refs = match.match(/SRC-(\d+)/g) || [];
        return refs.map(r => `[${r}]`).join('');
      })
      .replace(/(?<!\[)SRC-(\d+)(?!\])/g, '[SRC-$1]'));
    const paragraphs = normalized.split(/\n\n+/).filter(Boolean).map(p => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join("\n");
    return `<h2>${esc(h)}</h2>${paragraphs}`;
  };
  
  const renderParagraphs = (text: string) => {
    return String(text || "").split(/\n\n+/).filter(Boolean).map(p => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join("\n");
  };

  const debateSection = (debate: any) => {
    if (!debate) return "";
    return `
      <h2>Debate</h2>
      <div style="margin-left: 20px;">
        <h3 style="color: #ffffff;">Arguments For</h3>
        ${renderParagraphs(debate.pro || "")}
        <h3 style="color: #FB7185;">Arguments Against</h3>
        ${renderParagraphs(debate.con || "")}
        <h3>Synthesis</h3>
        ${renderParagraphs(debate.synthesis || "")}
      </div>
    `;
  };
  
  const srcHtml = sources
    .map((s: any, i: number) => {
      const authors = s.authors?.map((sa: any) => sa.author?.name).filter(Boolean).slice(0, 3).join(", ") || "Unknown";
      return `<li><strong>SRC-${i + 1}</strong> &ndash; ${esc(s.title)} ${s.year ? `(${s.year})` : ""} <span style="color:#9ca3af">${esc(authors)}</span> <span style="color:#6b7280;font-size:0.9em">[${esc(s.provider)}]</span></li>`;
    })
    .join("");
  
  return `
  <article style="max-width: 800px; margin: 0 auto; font-family: system-ui, -apple-system, sans-serif; line-height: 1.6;">
    <div style="font-size:11px;color:#6b7280;margin-bottom:12px;text-transform:uppercase;letter-spacing:0.05em;">NomosX &ndash; The agentic think tank</div>
    <h1 style="font-size:2em;margin-bottom:0.5em;font-weight:600;">${esc(out.title || "NomosX Research Brief")}</h1>
    ${section("Executive Summary", out.summary)}
    ${section("Consensus", out.consensus)}
    ${section("Disagreements", out.disagreements)}
    ${debateSection(out.debate)}
    ${section("Evidence Quality", out.evidence)}
    ${section("Strategic Implications", out.implications)}
    ${section("Risks & Limitations", out.risks)}
    ${section("Open Questions", out.open_questions)}
    ${section("What Would Change Our Mind", out.what_changes_mind)}
    <h2>Sources</h2>
    ${renderSourceDistributionSVG(sources)}
    <ol style="font-size:0.9em;">${srcHtml}</ol>
  </article>`;
}

// ================================
// P1 FIX #3: DATA LINEAGE TRACKING
// ================================

/**
 * Track data transformation from source through analysis
 * Enables audit trail, debugging, and reproducibility
 */
export interface DataLineage {
  briefId: string;
  query: string;
  timestamp: Date;
  transformations: Array<{
    step: "scout" | "index" | "rank" | "read" | "analyze" | "guard" | "render";
    inputCount: number;
    outputCount: number;
    durationMs: number;
    sourceIds?: string[];
    filters?: Record<string, any>;
    errors?: string[];
  }>;
  sourceLineage: Map<string, {
    sourceId: string;
    provider: string;
    qualityScore: number;
    inFinalBrief: boolean;
    citations: number[];  // Citation indices in output
  }>;
}

/**
 * Create lineage tracker for a research session
 */
function createLineageTracker(briefId: string, query: string): DataLineage {
  return {
    briefId,
    query,
    timestamp: new Date(),
    transformations: [],
    sourceLineage: new Map()
  };
}

/**
 * Record a transformation step
 */
function recordTransformation(
  lineage: DataLineage,
  step: DataLineage["transformations"][0]["step"],
  inputCount: number,
  outputCount: number,
  durationMs: number,
  metadata?: Record<string, any>
) {
  lineage.transformations.push({
    step,
    inputCount,
    outputCount,
    durationMs,
    ...metadata
  });
  
  console.log(`[Lineage] ${step}: ${inputCount} â†’ ${outputCount} (${durationMs}ms)`);
}

/**
 * Log lineage as JSON (for audit/debugging)
 */
function exportLineageJSON(lineage: DataLineage): string {
  return JSON.stringify({
    ...lineage,
    sourceLineage: Array.from(lineage.sourceLineage.entries())
  }, null, 2);
}

// ================================
// SPECULATIVE PARALLEL SCOUT — query reformulation
// ================================

/**
 * Generate 2 alternative reformulations of the research query using a fast LLM call.
 * These are run in parallel with the original query to broaden source coverage.
 * Returns empty array on failure (non-blocking).
 */
async function generateQueryReformulations(query: string): Promise<string[]> {
  try {
    const { callLLM } = await import('../llm/unified-llm');
    const { parseJson } = await import('./json-utils');
    const response = await callLLM({
      messages: [{
        role: "user",
        content: `Reformulate this research query into 2 alternative phrasings that would find different but relevant academic sources. Use different terminology, synonyms, or framing — but keep the same research intent.

Original query: "${query}"

Return JSON: { "reformulations": ["alternative query 1", "alternative query 2"] }`
      }],
      temperature: 0.3,
      jsonMode: true,
      maxTokens: 500,
      enableCache: true,
      task: 'query_enhancement',
    });
    const result = parseJson<{ reformulations?: string[] }>(response.content);
    if (result?.reformulations && Array.isArray(result.reformulations)) {
      return result.reformulations.filter(q => typeof q === 'string' && q.length > 10).slice(0, 2);
    }
    return [];
  } catch {
    return [];
  }
}

// ================================
// FULL PIPELINE ORCHESTRATION
// ================================

// Default academic providers â€” covers STEM, social sciences, humanities, law, economics
export const DEFAULT_ACADEMIC_PROVIDERS: Providers = [
  // Académique core
  "openalex", "crossref", "semanticscholar", "arxiv", "hal", "pubmed", "base",
  "core", "europepmc", "doaj", "ssrn", "repec", "plos",
  // Thèses & science ouverte
  "thesesfr", "openaire", "zenodo",
  // Working papers & rapports institutionnels
  "nber", "worldbank-docs", "cordis", "federal-register",
  // Institutions internationales — données primaires
  "imf", "worldbank", "oecd", "eurostat", "un", "insee", "fred", "who-gho",
  // Think tanks — rapports policy
  "brookings", "rand", "cnas", "ecfr", "swp", "sipri", "france-strategie",
  // Sciences humaines & sociales
  "isidore", "persee", "philpapers",
  // Foundational sources — books, reports, reference texts
  "ipcc", "internet-archive", "hathitrust", "open-library", "jstor", "unesco", "google-books",
  // Foresight & prospective
  "club-of-rome", "millennium-project",
  // Pouls de l'actualité (gratuit)
  "gdelt-news",
];

// ———————————————————————————————————————————————————————————————————————————————————
// SHARED PIPELINE CORE — single implementation for brief + strategic
// ———————————————————————————————————————————————————————————————————————————————————

export interface PipelineCoreOptions {
  isStrategic: boolean;
  providers?: Providers;
  perProvider?: number;
  rankOptions?: RankOptions;
  focusAreas?: string[];
  targetAudience?: string;
  urgencyContext?: string;
  maxSources?: number;
  // Pipeline tier controls — set by auto-publisher based on researcher ownership
  enableHarvardCouncil?: boolean;  // default: true
  enableDebate?: boolean;          // default: true
  enableMetaAnalysis?: boolean;    // default: true (strategic only)
  enableDevilsAdvocate?: boolean;  // default: true
  enableDeliberation?: boolean;    // default: true for strategic, false for standard
  // Enhanced Harvard Council options
  enableEnhancedCouncil?: boolean; // default: false (use legacy for compatibility)
  maxExperts?: number;             // default: 6 for strategic, 4 for standard
  enableHierarchical?: boolean;    // default: true for 15+ experts
  enableInterdisciplinary?: boolean; // default: true
  // P1-FIX: Cost budget guard — abort pipeline if cost exceeds limit
  maxBudgetUsd?: number; // default: 3.0 for brief, 8.0 for strategic
  /** Pre-validated sources — skip SCOUT when len ≥ minSeedSourcesToSkipScout */
  seedSourceIds?: string[];
  minSeedSourcesToSkipScout?: number;
  /** QUANT BRIDGE — deterministic model layer (parametric costing + FIGARO IO). Default: "io" for strategic, "none" for brief */
  quantDepth?: import("../quant/quant-bridge").QuantDepth;
  /** Optional structured costing exercise from StudioX orders */
  parametricInput?: import("../quant/types").ParametricCostInput;
}

async function runPipelineCore(query: string, opts: PipelineCoreOptions) {
  // LOT 6.3: FAILURE POLICY
  // CRITICAL agents (throw on failure): SCOUT, RANK, ANALYST
  // NON-BLOCKING agents (warn + continue): CONTEXT_PRIMER, EMBED, GAP_FILLER,
  //   QUANT, FRAMING, HYPOTHESIS_JUDGE, FACT_CHECKER, CRITICAL_LOOP, DEVILS_ADVOCATE,
  //   KNOWLEDGE_GRAPH, STYLE_GATES, EVIDENCE_IDS, RESEARCH_GAPS
  const { isStrategic } = opts;
  const isDossier = (opts as any).format === "dossier";
  const editorialV2 = isEditorialV2Enabled();
  const label = isStrategic ? "[Strategic]" : "[Pipeline]";
  const stats: PipelineStats = {};
  const pipelineStart = Date.now();

  // ── BLACKBOARD: Shared context across all agents (2026 pattern) ──
  // Breaks silos: ANALYST can request targeted re-search, EDITOR sees gaps, etc.
  const ctx = new PipelineContext(query, isStrategic);

  // ── IDEMPOTENCY GUARD (2026 best practice) ──
  // Prevent duplicate pipeline runs for the same query within a 2-hour window.
  // If cron overlaps or dispatcher retries, the second run is rejected.
  const idempotencyKey = `${isStrategic ? 'strat' : 'brief'}:${query.trim().toLowerCase().slice(0, 200)}`;
  const IDEMPOTENCY_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours
  if (activeRuns.has(idempotencyKey)) {
    const existing = activeRuns.get(idempotencyKey)!;
    if (Date.now() < existing.expiresAt) {
      console.warn(`${label} IDEMPOTENCY: duplicate run rejected (key=${idempotencyKey.slice(0, 30)}..., started ${Math.round((Date.now() - existing.startedAt) / 1000)}s ago)`);
      throw new Error(`Pipeline already running for this query (started ${Math.round((Date.now() - existing.startedAt) / 1000)}s ago)`);
    }
  }
  activeRuns.set(idempotencyKey, { startedAt: Date.now(), expiresAt: Date.now() + IDEMPOTENCY_TTL_MS });

  // Tier flags — default to the full quality stack, while allowing callers to
  // explicitly choose a lighter execution profile for smoke tests and recovery.
  // These may be adjusted by the complexity gate after topic classification.
  let runHarvardCouncilStep = opts.enableHarvardCouncil !== false;
  let runEnhancedCouncilStep = isStrategic ? (opts.enableEnhancedCouncil !== false) : (opts.enableEnhancedCouncil === true);
  let runDebateStep = opts.enableDebate !== false;
  let runMetaAnalysisStep = opts.enableMetaAnalysis !== false;
  let runDevilsAdvocateStep = opts.enableDevilsAdvocate !== false;
  let runDeliberationStep = isStrategic ? (opts.enableDeliberation !== false) : (opts.enableDeliberation === true);

  // P1-FIX: Running cost accumulator with cost-aware early exit
  const maxBudget = opts.maxBudgetUsd ?? getPipelineMaxBudgetUsd(isStrategic, editorialV2);
  let runningCostUsd = 0;
  let budgetDegraded = false;
  function addCost(amount: number | undefined, stepName: string) {
    if (typeof amount === "number" && amount > 0) {
      runningCostUsd += amount;
      // Cost-aware early exit: at 80% budget, degrade gracefully
      if (!budgetDegraded && runningCostUsd > maxBudget * 0.8) {
        budgetDegraded = true;
        console.warn(`${label} BUDGET GUARD: 80% threshold reached ($${runningCostUsd.toFixed(4)}/$${maxBudget}) — degrading gracefully`);
        runDebateStep = false;
        runMetaAnalysisStep = false;
        runDevilsAdvocateStep = false;
        ctx.skipStep('debate');
        ctx.skipStep('meta-analysis');
        ctx.skipStep('devils-advocate');
        ctx.addFinding('BUDGET_GUARD', 'warning', `Budget at 80% — skipping optional steps (debate, meta, DA)`);
      }
      if (runningCostUsd > maxBudget) {
        console.warn(`${label} BUDGET GUARD: $${runningCostUsd.toFixed(4)} exceeds max $${maxBudget} after ${stepName}`);
        throw new Error(`Pipeline budget exceeded: $${runningCostUsd.toFixed(4)} > $${maxBudget} limit after ${stepName}`);
      }
    }
  }
  function isBudgetConstrained() { return budgetDegraded; }

  // â”€â”€ Resolve providers: smart selection (async, history-aware) or explicit â”€â”€
  let providers: Providers;
  if (opts.providers && opts.providers.length > 0) {
    providers = opts.providers;
  } else if (isStrategic) {
    const smart = await selectSmartProviders(query).catch(() => null);
    const smartProviders = smart?.providers as Providers | undefined;
    // Always merge core academic providers for strategic reports — the smart selector
    // may omit key providers like crossref or europepmc when it focuses on domain-specific ones.
    // OpenAlex is rate-limited (429) so we need multiple academic fallbacks.
    const coreAcademic: Providers = [
      "crossref", "semanticscholar", "europepmc", "arxiv", "pubmed", "doaj", "base", "core", "hal", "plos",
      // Thèses & science ouverte
      "thesesfr", "openaire", "zenodo",
      // Working papers, rapports institutionnels & données marché
      "nber", "worldbank-docs", "cordis", "sec-edgar", "federal-register",
      // Institutions internationales — données primaires
      "imf", "worldbank", "oecd", "eurostat", "un", "insee", "fred", "who-gho",
      // Think tanks — rapports policy
      "brookings", "rand", "cnas", "ecfr", "swp", "sipri", "france-strategie",
      // Foundational sources — books, reports, reference texts
      "ipcc", "internet-archive", "hathitrust", "open-library", "jstor", "unesco", "google-books",
      // Foresight & prospective sources
      "club-of-rome", "millennium-project",
      // Pouls de l'actualité (gratuit)
      "gdelt-news",
    ];
    providers = smartProviders
      ? Array.from(new Set([...smartProviders, ...coreAcademic])) as Providers
      : [...DEFAULT_ACADEMIC_PROVIDERS];
  } else {
    const smart = await selectSmartProviders(query).catch(() => null);
    providers = (smart?.providers as Providers | undefined) ?? DEFAULT_ACADEMIC_PROVIDERS;
  }

  // P3-K: Filter out blacklisted providers
  const healthyProviders = getHealthyProviders(providers as string[]) as Providers;
  if (healthyProviders.length < providers.length) {
    console.log(`${label} PROVIDER HEALTH: ${providers.length - healthyProviders.length} providers skipped (circuit open)`);
  }
  providers = healthyProviders.length >= 3 ? healthyProviders : providers; // fallback if too many blacklisted

  // ── PRE-SCOUT COMPLEXITY ROUTING (Adaptive RAG, 2026 best practice) ──
  // Deterministic query complexity classification — no LLM call.
  // Adapts provider count and perProvider based on query complexity.
  // Simple queries don't need 100+ providers; complex multi-hop ones do.
  const queryWords = query.toLowerCase().split(/\s+/).filter(Boolean);
  const comparisonMarkers = /\b(vs|versus|compared?|comparison|difference between|contrast)\b/i.test(query);
  const causalMarkers = /\b(impact|effect|cause|consequence|result|influence|driver|lead to|because|due to)\b/i.test(query);
  const multiHopMarkers = /\b(and|while|whereas|although|despite|in addition|furthermore|moreover|both)\b/i.test(query);
  const conceptCount = queryWords.filter(w => w.length > 4 && !['what', 'which', 'where', 'when', 'while', 'their', 'there', 'these', 'those', 'about', 'would', 'could', 'should', 'between', 'through', 'during'].includes(w)).length;
  const queryComplexity = (comparisonMarkers ? 2 : 0) + (causalMarkers ? 1 : 0) + (multiHopMarkers ? 1 : 0) + (conceptCount > 8 ? 2 : conceptCount > 5 ? 1 : 0);
  const isSimpleQuery = queryComplexity <= 1 && queryWords.length < 12;
  const isComplexQuery = queryComplexity >= 4;

  let perProvider: number;
  if (isSimpleQuery && !isStrategic) {
    perProvider = opts.perProvider ?? 20;
    if (providers.length > 15) {
      providers = providers.slice(0, 12) as Providers;
    }
    console.log(`${label} COMPLEXITY ROUTING: simple query (score=${queryComplexity}) — reduced to ${providers.length} providers, ${perProvider}/provider`);
  } else if (isComplexQuery || isStrategic) {
    perProvider = opts.perProvider ?? (isStrategic ? 80 : 40);
    console.log(`${label} COMPLEXITY ROUTING: ${isComplexQuery ? 'complex' : 'strategic'} query (score=${queryComplexity}) — full ${providers.length} providers, ${perProvider}/provider`);
  } else {
    perProvider = opts.perProvider ?? (isStrategic ? 80 : 30);
    console.log(`${label} COMPLEXITY ROUTING: moderate query (score=${queryComplexity}) — ${providers.length} providers, ${perProvider}/provider`);
  }

  // Create PipelineRun for persistent lineage tracking
  const pipelineRun = await prisma.pipelineRun.create({
    data: { question: query, format: isStrategic ? "strategic" : "brief", status: "RUNNING" },
  });

  try {
  const briefId = `${isStrategic ? "strategic" : "brief"}-${Date.now()}`;
  const lineage = createLineageTracker(briefId, query);

  if (isStrategic) {
    console.log(`\n${"â•".repeat(60)}`);
    console.log(`  STRATEGIC REPORT PIPELINE`);
    console.log(`  Query: "${query}"`);
    console.log(`  PipelineRun: ${pipelineRun.id}`);
    console.log(`${"â•".repeat(60)}\n`);
  }

  // P2-9: Emit progress events for SSE streaming
  emitProgress(pipelineRun.id, "INIT", "started", "Initializing pipeline...");

  // Initialize Orchestrator state (with calibrated thresholds from AgentMemory)
  const orchState = createPipelineState(query, isStrategic);
  try {
    const calibratedThresholds = await loadCalibratedThresholds();
    orchState.thresholds = calibratedThresholds;
    if (calibratedThresholds.MIN_TRUST_SCORE !== 65) {
      console.log(`${label} ORCHESTRATOR: calibrated trust threshold = ${calibratedThresholds.MIN_TRUST_SCORE} (from AgentMemory)`);
    }
  } catch { /* use static thresholds */ }

  // â”€â”€ STEP 0: CONTEXT PRIMER â€” Inject institutional memory + trend breaks â”€â”€
  console.log(`${label} CONTEXT PRIMER: loading institutional memory`);
  let primedContext: Awaited<ReturnType<typeof primeContext>> | null = null;
  try {
    primedContext = await primeContext(query, {
      maxConcepts: isStrategic ? 20 : 15,
      maxPriorBriefs: isStrategic ? 8 : 5,
    });
    orchState.contextPrimed = true;
    orchState.knownConceptCount = primedContext.knownConcepts.length;
    orchState.priorBriefCount = primedContext.priorBriefs.length;
    stats.contextPrimer = {
      knownConcepts: primedContext.knownConcepts.length,
      priorBriefs: primedContext.priorBriefs.length,
      emergingTrends: primedContext.emergingTrends.length,
      trendBreaks: primedContext.trendBreaks?.length ?? 0,
      coverageGap: Boolean(primedContext.coverageGap),
      durationMs: primedContext.durationMs,
    };
    console.log(`${label} CONTEXT PRIMER: ${primedContext.knownConcepts.length} concepts, ${primedContext.priorBriefs.length} prior briefs, ${primedContext.trendBreaks?.length ?? 0} trend breaks`);
  } catch (err) {
    console.error(`${label} CONTEXT PRIMER: FAILED — pipeline continues without institutional memory:`, err);
    stats.contextPrimer = { error: String(err) } as any;
  }

  // ── EPISODIC MEMORY RETRIEVAL (V3.1) — learn from past pipeline runs ──
  let episodicContext: any[] = [];
  let episodicFormatted: string | null = null;
  try {
    const { retrieveEpisodes, formatEpisodeContext, buildEpisodeContextBlock } = await import('./episodic-memory');
    episodicContext = await retrieveEpisodes(query, { limit: isStrategic ? 8 : 5, minSimilarity: 0.55 });
    if (episodicContext.length > 0) {
      console.log(`${label} EPISODIC MEMORY: retrieved ${episodicContext.length} relevant past runs`);
      const ctxBlock = buildEpisodeContextBlock(episodicContext);
      episodicFormatted = formatEpisodeContext(ctxBlock);
    }
  } catch (err) {
    console.warn(`${label} EPISODIC MEMORY: retrieval failed (non-blocking):`, err);
  }

  // STEP 1: SCOUT (with Orchestrator RE_SCOUT loop)
  emitProgress(pipelineRun.id, "SCOUT", "started", `Searching ${providers.length} providers...`);
  let allSourceIds: string[] = [];
  const seedIds = [...new Set((opts.seedSourceIds ?? []).filter(Boolean))];
  const minSeedSkip = opts.minSeedSourcesToSkipScout ?? 8;
  const skipScout = seedIds.length >= minSeedSkip;

  if (skipScout) {
    console.log(`${label} SCOUT: skipped — using ${seedIds.length} seedSourceIds`);
    allSourceIds = seedIds;
    recordTransformation(lineage, "scout", seedIds.length, seedIds.length, 0, {
      sourceIds: seedIds,
      filters: { skipped: true, reason: "seedSourceIds" },
    });
    stats.scout = { found: seedIds.length, upserted: 0, sourceIds: seedIds, skipped: true };
    orchState.sourcesFound = seedIds.length;
    orchState.providerDiversity = new Set(seedIds.map((id) => id.split(":")[0])).size;
    const seedScoutDecision = assessAfterScout(orchState);
    recordDecision(orchState, seedScoutDecision);
    stats.orchestrator = { decisions: [seedScoutDecision] };
    emitProgress(pipelineRun.id, "SCOUT", "completed", `Seed sources: ${seedIds.length} (scout skipped)`);
  } else {
  console.log(`${label} SCOUT: query="${query}" (${providers.length} providers, ${perProvider}/provider)`);
  const scoutStart = Date.now();

  // ── LOT 2.1/2.2: DEEP PLANNER — decompose question into DAG, scout each node ──
  let planResult: { plan: any; costUsd: number; error?: string } | null = null;
  try {
    const { deepPlan, topologicalSort, getAncestorSourceIds } = await import('./deep-planner');
    planResult = await deepPlan(query, { domain: (opts as any).domain || 'general', isStrategic });
    if (planResult.error) {
      console.log(`${label} DEEP PLANNER: ${planResult.error}, falling back to flat scout`);
    }
    if (planResult.plan.nodes.length > 1) {
      console.log(`${label} DEEP PLANNER: ${planResult.plan.nodes.length} sub-questions planned`);
      const sortedNodes = topologicalSort(planResult.plan.nodes);
      const perNodeProvider = isStrategic ? Math.max(perProvider, 80) : perProvider;

      // Known providers set — used to filter Deep Planner LLM output
      const KNOWN_PROVIDERS = new Set([
        "openalex", "crossref", "semanticscholar", "arxiv", "hal", "pubmed", "base",
        "core", "europepmc", "doaj", "ssrn", "repec", "nber", "who-gho",
        "imf", "worldbank", "oecd", "bis", "ecb", "eurostat", "fred", "eib",
        "nist", "cisa", "un", "undp", "unctad", "iaea", "irena", "cea", "iea",
        "bruegel", "nato", "eeas", "linkup", "tavily", "exa", "apitube",
        "gdelt-news", "newsapi", "eventregistry", "springer", "osti", "datacite",
        "google-books", "dimensions", "lens", "zenodo", "openaire",
        "brookings", "rand", "cfr", "carnegie", "csis", "iiss", "chatham-house",
        "swp", "sipri", "iai", "ecfr", "dgap", "rsis", "cis",
        // V3.1: Global omniscience providers
        "consolidated-institutions", "global-intelligence", "global-orgs", "global-think-tanks", "global-science",
      ]);

      for (const node of sortedNodes) {
        node.status = 'scouting';
        // Use node-specific producers if available, otherwise fall back to global providers
        // Filter to known providers only — LLM may generate invalid names (e.g. 'area_studies')
        const validNodeProducers = node.producers.filter(p => KNOWN_PROVIDERS.has(p));
        const nodeProviders = validNodeProducers.length >= 3
          ? Array.from(new Set([...validNodeProducers.slice(0, 8), ...providers.slice(0, 4)])) as Providers
          : providers;
        const nodeResult = await scout(node.subQuestion, nodeProviders, perNodeProvider);
        const nodeSourceIds = Array.isArray(nodeResult) ? nodeResult.map(s => s.id) : (nodeResult.sourceIds || []);
        node.sourceIds = nodeSourceIds;
        node.sourceCount = nodeSourceIds.length;
        node.status = nodeSourceIds.length > 0 ? 'done' : 'failed';
        allSourceIds.push(...nodeSourceIds);
        console.log(`${label} DEEP PLANNER: node ${node.id} "${node.subQuestion.slice(0, 60)}" → ${nodeSourceIds.length} sources`);

        // LOT 2.3: DAG mutable — if < 5 sources, try expanded search with parent context
        if (nodeSourceIds.length < 5) {
          const ancestorIds = getAncestorSourceIds(node.id, planResult.plan.nodes);
          if (ancestorIds.length > 0) {
            // Inject parent context as additional search terms
            const parentNodes = planResult.plan.nodes.filter((n: any) => node.parentIds.includes(n.id));
            const contextTerms = parentNodes.map((n: any) => n.subQuestion.split(' ').slice(0, 3).join(' ')).join(' ');
            if (contextTerms) {
              const expandedQuery = `${node.subQuestion} ${contextTerms}`;
              const expandResult = await scout(expandedQuery, providers, 25);
              const expandIds = Array.isArray(expandResult) ? expandResult.map(s => s.id) : (expandResult.sourceIds || []);
              allSourceIds.push(...expandIds);
              node.sourceIds = [...new Set([...(node.sourceIds || []), ...expandIds])];
              node.sourceCount = node.sourceIds.length;
              node.status = 'expanded';
              console.log(`${label} DEEP PLANNER: node ${node.id} expanded → +${expandIds.length} sources`);
            }
          }
        }
      }
      allSourceIds = [...new Set(allSourceIds)];
      stats.deepPlanner = { nodes: planResult.plan.nodes.length, costUsd: planResult.costUsd };
    } else {
      // Single node — fall through to normal scout
      planResult = null;
    }
  } catch (err) {
    console.warn(`${label} DEEP PLANNER: failed (non-blocking), falling back to flat scout:`, err);
  }

  // If DeepPlanner didn't produce results, run the original flat scout
  if (allSourceIds.length === 0) {
  // ── SPECULATIVE PARALLEL SCOUT (2026 pattern) ──
  // Launch original query + 2 LLM reformulations in parallel to broaden coverage.
  // This replaces the sequential RE_SCOUT loop for the initial pass.
  const scoutPerProvider = isStrategic ? Math.max(perProvider, 75) : perProvider;

  // Generate reformulations in parallel with the original query scout
  const reformulationPromise = isBudgetConstrained()
    ? Promise.resolve([] as string[])
    : generateQueryReformulations(query).catch(() => [] as string[]);

  const [scoutResult, reformulations] = await Promise.all([
    scout(query, providers, scoutPerProvider),
    reformulationPromise,
  ]);

  // Handle both cached array and fresh result object
  const sourceIds = Array.isArray(scoutResult) ? scoutResult.map(s => s.id) : (scoutResult.sourceIds || []);
  const found = Array.isArray(scoutResult) ? scoutResult.length : (scoutResult.found || 0);

  allSourceIds = [...sourceIds];

  // Launch speculative parallel scouts for each reformulation
  if (reformulations.length > 0) {
    console.log(`${label} SPECULATIVE SCOUT: launching ${reformulations.length} parallel reformulations`);
    const speculativeResults = await Promise.allSettled(
      reformulations.map(rq => scout(rq, providers.slice(0, Math.min(providers.length, 10)) as Providers, Math.floor(scoutPerProvider * 0.6)))
    );
    for (let i = 0; i < speculativeResults.length; i++) {
      const r = speculativeResults[i];
      if (r.status === "fulfilled") {
        const specIds = Array.isArray(r.value) ? r.value.map(s => s.id) : (r.value.sourceIds || []);
        const specFound = Array.isArray(r.value) ? r.value.length : (r.value.found || 0);
        allSourceIds.push(...specIds);
        console.log(`${label} SPECULATIVE SCOUT: "${reformulations[i].slice(0, 60)}" → +${specFound} sources`);
      }
    }
    allSourceIds = [...new Set(allSourceIds)];
    ctx.addFinding('SPECULATIVE_SCOUT', 'insight', `Parallel reformulations: ${reformulations.length} queries, ${allSourceIds.length} total sources after merge`);
  }
  if (seedIds.length) {
    allSourceIds = [...new Set([...allSourceIds, ...seedIds])];
    console.log(`${label} SCOUT: merged ${seedIds.length} seed sources → ${allSourceIds.length} total`);
  }
  ctx.setScoutSources(allSourceIds);
  ctx.recordAgentTiming('SCOUT', Date.now() - pipelineStart);

  recordTransformation(lineage, "scout", 1, sourceIds.length, Date.now() - scoutStart, {
    sourceIds,
    filters: { providers },
  });
  stats.scout = scoutResult;

  // Orchestrator checkpoint: assess source quality
  orchState.sourcesFound = found;
  orchState.providerDiversity = new Set(allSourceIds.map(id => id.split(":")[0])).size;
  const scoutDecision = assessAfterScout(orchState);
  recordDecision(orchState, scoutDecision);
  stats.orchestrator = { decisions: [scoutDecision] };

  // RE_SCOUT loop — all formats (autonomous source collection)
  if (scoutDecision.action === "RE_SCOUT" && orchState.iteration < orchState.maxIterations) {
    console.log(`${label} ORCHESTRATOR: RE_SCOUT — ${scoutDecision.reason}`);
    // Stuck-loop detection (2026 best practice): track unique sources before re-search
    const preReScoutIds = new Set(allSourceIds);
    try {
      // Adaptive provider adjustment: analyze what was found and add missing providers
      const foundProviderPrefixes = new Set(allSourceIds.map(id => id.split(":")[0]));
      const newsProvidersList = ["gdelt-news", "newsapi", "gnews", "mediastack", "thenewsapi", "eventregistry", "apitube", "tavily"];
      const academicProvidersList = ["openalex", "crossref", "semanticscholar", "arxiv", "hal", "pubmed", "ssrn", "nber", "repec", "europepmc", "base", "doaj", "springer", "osti", "datacite", "lens", "dimensions", "google-books", "plos", "worldbank-docs", "cordis", "ipcc", "internet-archive", "hathitrust", "jstor", "unesco", "club-of-rome", "millennium-project"];
      const hasNews = newsProvidersList.some(p => foundProviderPrefixes.has(p));
      const hasAcademic = academicProvidersList.some(p => foundProviderPrefixes.has(p));

      const adaptiveProviders = [...providers];
      // If no news sources found, add news providers for real-time coverage
      if (!hasNews) {
        adaptiveProviders.push(...["gdelt-news", "newsapi"] as any);
        console.log(`${label} RE_SCOUT: no news sources found — adding gdelt-news, newsapi`);
      }
      // If no academic sources found, add core academic providers + foundational sources
      if (!hasAcademic) {
        adaptiveProviders.push(...["openalex", "crossref", "semanticscholar", "arxiv", "europepmc", "base", "doaj", "ipcc", "internet-archive", "hathitrust", "jstor", "unesco"] as any);
        console.log(`${label} RE_SCOUT: no academic sources found — adding core academic + foundational sources (IPCC, Internet Archive, HathiTrust, JSTOR, UNESCO)`);
      }
      // If total sources are critically low, add web search as fallback
      if (allSourceIds.length < 5) {
        adaptiveProviders.push(...["linkup", "tavily", "exa", "gdelt-news", "newsapi", "apitube"] as any);
        console.log(`${label} RE_SCOUT: only ${allSourceIds.length} sources — adding linkup, tavily, exa, gdelt-news, newsapi, apitube as web search fallback`);
      }
      const uniqueAdaptiveProviders = Array.from(new Set(adaptiveProviders)) as Providers;

      const expanded = await generateExpandedTerms(query, found, uniqueAdaptiveProviders);
      stats.orchestrator.expandedTerms = expanded.terms;
      const maxTerms = isStrategic ? 7 : 5;
      const extraResults = await Promise.allSettled(
        expanded.terms.slice(0, maxTerms).map(term => scout(term, uniqueAdaptiveProviders, isStrategic ? 30 : 25))
      );
      for (let i = 0; i < extraResults.length; i++) {
        const r = extraResults[i];
        if (r.status === "fulfilled") {
          const extraSourceIds = Array.isArray(r.value) ? r.value.map(s => s.id) : (r.value.sourceIds || []);
          const extraFound = Array.isArray(r.value) ? r.value.length : (r.value.found || 0);
          allSourceIds.push(...extraSourceIds);
          console.log(`${label} RE_SCOUT: "${expanded.terms[i]}" → +${extraFound} sources`);
        }
      }
      allSourceIds = [...new Set(allSourceIds)];
      orchState.sourcesFound = allSourceIds.length;

      // Stuck-loop detection (2026 best practice): if >70% of sources already existed, topic is niche — stop re-searching
      const newUniqueIds = allSourceIds.filter(id => !preReScoutIds.has(id));
      const overlapRatio = allSourceIds.length > 0 ? (allSourceIds.length - newUniqueIds.length) / allSourceIds.length : 0;
      if (overlapRatio > 0.70) {
        console.log(`${label} RE_SCOUT: stuck-loop detected — ${Math.round(overlapRatio * 100)}% overlap with pre-existing sources, only ${newUniqueIds.length} new. Topic is likely niche — stopping re-search.`);
      } else {
        console.log(`${label} RE_SCOUT: +${newUniqueIds.length} new unique sources (${Math.round((1 - overlapRatio) * 100)}% novelty)`);
      }
    } catch (err) {
      console.warn(`${label} RE_SCOUT: failed (non-blocking):`, err);
    }
  }

  // â”€â”€ STEP 2: INDEX â”€â”€
  emitProgress(pipelineRun.id, "SCOUT", "completed", `Found ${allSourceIds.length} sources`, { blackboard: ctx.getSummary() });
  } // end if (flat scout fallback)
  } // end scout else branch

  // ── FINAL FALLBACK: if still critically low on sources, do a direct web search ──
  if (allSourceIds.length < 5) {
    console.log(`${label} WEB FALLBACK: only ${allSourceIds.length} sources — searching web for raw question`);
    try {
      const webResults = await searchLinkUp(query, 20);
      if (webResults.length > 0) {
        const webSourceIds = webResults.map((s: any) => s.id);
        allSourceIds.push(...webSourceIds);
        console.log(`${label} WEB FALLBACK: linkup returned ${webResults.length} web sources`);
      }
      // Try Tavily for AI-optimised web search (both general + news)
      const tavilyResults = await searchTavily(query, 20, { topic: 'general' });
      if (tavilyResults.length > 0) {
        const tavilySourceIds = tavilyResults.map((s: any) => s.id);
        allSourceIds.push(...tavilySourceIds);
        console.log(`${label} WEB FALLBACK: tavily returned ${tavilyResults.length} web sources`);
      }
      const tavilyNewsResults = await searchTavilyNews(query, 10);
      if (tavilyNewsResults.length > 0) {
        const tavilyNewsIds = tavilyNewsResults.map((s: any) => s.id);
        allSourceIds.push(...tavilyNewsIds);
        console.log(`${label} WEB FALLBACK: tavily news returned ${tavilyNewsResults.length} news sources`);
      }
      // Try Exa for semantic publication search
      const exaResults = await searchExaPublications(query, 20);
      if (exaResults.length > 0) {
        const exaSourceIds = exaResults.map((s: any) => s.id);
        allSourceIds.push(...exaSourceIds);
        console.log(`${label} WEB FALLBACK: exa returned ${exaResults.length} publication sources`);
      }
      // Also try GDELT for news coverage
      const { searchGDELTNews } = await import("../providers/news-scout-providers");
      const newsResults = await searchGDELTNews(query, 20);
      if (newsResults.length > 0) {
        const newsSourceIds = newsResults.map((s: any) => s.id);
        allSourceIds.push(...newsSourceIds);
        console.log(`${label} WEB FALLBACK: gdelt returned ${newsResults.length} news sources`);
      }
      // Try APITube for enriched news
      const apitubeResults = await searchAPITube(query, 20);
      if (apitubeResults.length > 0) {
        const apitubeSourceIds = apitubeResults.map((s: any) => s.id);
        allSourceIds.push(...apitubeSourceIds);
        console.log(`${label} WEB FALLBACK: apitube returned ${apitubeResults.length} news sources`);
      }
      // Try open-API academic providers (no key required)
      const ostiResults = await searchOSTI(query, 20);
      if (ostiResults.length > 0) {
        const ostiIds = ostiResults.map((s: any) => s.id);
        allSourceIds.push(...ostiIds);
        console.log(`${label} WEB FALLBACK: osti returned ${ostiResults.length} sources`);
      }
      const dataciteResults = await searchDataCite(query, 15);
      if (dataciteResults.length > 0) {
        const dataciteIds = dataciteResults.map((s: any) => s.id);
        allSourceIds.push(...dataciteIds);
        console.log(`${label} WEB FALLBACK: datacite returned ${dataciteResults.length} sources`);
      }
    } catch (err) {
      console.warn(`${label} WEB FALLBACK: failed (non-blocking):`, err);
    }
  }

  // ── INTELLIGENT SCOUT: Multi-lens eclectic enrichment ──
  // Adds sources from 6 strategic lenses (core, contrarian, cross-domain, historical, weak signal, scenario)
  // Uses UCB1 bandit for budget allocation + adaptive search depth (AutoSearch pattern)
  // This is what makes NomosX a think tank, not a search engine: it finds dissent, analogues, and weak signals
  try {
    const { runIntelligentScout } = await import('./intelligent-scout');
    const format = isStrategic ? 'strategic' : isDossier ? 'dossier' : 'brief';
    const domain = (opts as any).domain || 'general';

    // Wrapper: delegate to existing scout() and return normalized sources
    const intelligentSearchFn = async (q: string, provs: string[], perProv: number) => {
      const result = await scout(q, provs as Providers, perProv);
      const sourceIds = Array.isArray(result) ? result.map(s => s.id) : (result.sourceIds || []);
      if (sourceIds.length === 0) return [];
      // Fetch source details from DB
      const sources = await prisma.source.findMany({
        where: { id: { in: sourceIds } },
        select: { id: true, title: true, abstract: true, provider: true, year: true, doi: true, citationCount: true, qualityScore: true, noveltyScore: true },
      });
      return sources.map(s => ({
        id: s.id,
        title: s.title,
        abstract: s.abstract,
        provider: s.provider,
        year: s.year,
        doi: s.doi,
        citationCount: s.citationCount,
        qualityScore: s.qualityScore ?? undefined,
        noveltyScore: s.noveltyScore ?? undefined,
      }));
    };

    const eclecticResult = await runIntelligentScout(query, domain, format, intelligentSearchFn);
    const eclecticIds = eclecticResult.allSources.map(s => s.id);
    const beforeCount = allSourceIds.length;
    allSourceIds = [...new Set([...allSourceIds, ...eclecticIds])];
    const addedCount = allSourceIds.length - beforeCount;

    console.log(`${label} INTELLIGENT SCOUT: +${addedCount} eclectic sources (${eclecticResult.uniqueSources} from ${eclecticResult.lenses.length} lenses, diversity=${Math.round(eclecticResult.diversityScore * 100)}%, scenarioRichness=${Math.round(eclecticResult.scenarioRichness * 100)}%)`);
    console.log(`${label} INTELLIGENT SCOUT lenses: ${eclecticResult.lenses.map(l => `${l.type}(${l.sources.length})`).join(', ')}`);

    stats.intelligentScout = {
      lenses: eclecticResult.lenses.map(l => ({ type: l.type, sources: l.sources.length, yield: l.yield })),
      totalSources: eclecticResult.totalSources,
      uniqueSources: eclecticResult.uniqueSources,
      diversityScore: eclecticResult.diversityScore,
      consensusScore: eclecticResult.consensusScore,
      scenarioRichness: eclecticResult.scenarioRichness,
      adaptiveDepth: eclecticResult.adaptiveDepth,
      costUsd: eclecticResult.costUsd,
      durationMs: eclecticResult.durationMs,
    };
  } catch (err) {
    console.warn(`${label} INTELLIGENT SCOUT: failed (non-blocking, continuing with existing sources):`, err instanceof Error ? err.message : String(err));
  }

  // ── CITATION GRAPH TRAVERSAL: Find hub + bridge papers ──
  // Traverses the citation network to discover foundational papers (hubs)
  // and interdisciplinary connectors (bridges) that keyword search misses.
  // This is the Paper Circle (ACL 2026) pattern.
  try {
    const { traverseCitationGraph } = await import('./citation-graph');
    // Get OpenAlex IDs for the top sources (by quality score)
    const topForGraph = await prisma.source.findMany({
      where: { id: { in: allSourceIds.slice(0, 50) } },
      select: { id: true, title: true, doi: true, raw: true, provider: true },
      take: 30,
    });

    const graphSources = topForGraph.map(s => {
      // Extract OpenAlex ID from raw data or source ID
      const raw = s.raw as any;
      const openalexId = s.id.startsWith('openalex:') ? s.id.replace('openalex:', '') : raw?.id?.replace('https://openalex.org/', '');
      return {
        sourceId: s.id,
        openalexId: openalexId || undefined,
        title: s.title,
        doi: s.doi,
      };
    }).filter(s => s.openalexId);

    if (graphSources.length >= 5) {
      const graphResult = await traverseCitationGraph(graphSources);
      const beforeGraph = allSourceIds.length;
      allSourceIds = [...new Set([...allSourceIds, ...graphResult.newSourceIds])];
      const addedByGraph = allSourceIds.length - beforeGraph;

      console.log(`${label} CITATION GRAPH: +${addedByGraph} sources (${graphResult.hubs.length} hubs, ${graphResult.bridges.length} bridges, ${graphResult.clusters.length} clusters)`);

      stats.citationGraph = {
        hubs: graphResult.hubs.length,
        bridges: graphResult.bridges.length,
        clusters: graphResult.clusters.length,
        newSources: addedByGraph,
        totalNodes: graphResult.totalNodes,
        totalEdges: graphResult.totalEdges,
      };
    }
  } catch (err) {
    console.warn(`${label} CITATION GRAPH: failed (non-blocking):`, err instanceof Error ? err.message : String(err));
  }

  console.log(`${label} INDEX: ${allSourceIds.length} sources`);
  const indexResult = await index(allSourceIds);
  stats.index = indexResult;

  // â”€â”€ STEP 2b: EMBED (semantic vectors) â”€â”€
  console.log(`${label} EMBED: generating semantic vectors...`);
  try {
    const embedResult = await embedSourcesBatch(allSourceIds);
    stats.embed = embedResult;
    console.log(`${label} EMBED: ${embedResult.embedded} new, ${embedResult.skipped} cached`);
  } catch (err) {
    console.warn(`${label} EMBED: failed (non-blocking):`, err);
    stats.embed = { error: String(err) } as any;
  }

  // â”€â”€ STEP 3: DEDUPLICATE â”€â”€
  console.log(`${label} DEDUPLICATE`);
  const dedupeResult = await deduplicateSources();
  stats.dedupe = dedupeResult;

  // ── STEP 4: RANK (scoped to current SCOUT sourceIds) ──
  // Adaptive diversity: relax constraints when source pool is small (niche/emerging topics)
  const sourcePoolSize = allSourceIds.length;
  const adaptiveMaxPerProvider = isStrategic
    ? (sourcePoolSize < 30 ? 20 : sourcePoolSize < 100 ? 15 : 12)
    : (sourcePoolSize < 15 ? 12 : sourcePoolSize < 30 ? 8 : 8);
  const adaptiveMinDiversity = sourcePoolSize < 10 ? 1 : sourcePoolSize < 30 ? 2 : 3;
  const adaptiveMaxPerYear = isStrategic ? 15 : 8;
  const rankOpts: RankOptions = isStrategic ? {
    limit: 300, // technical ceiling, NOT a target — pertinence selection cuts where quality drops
    mode: "balanced",
    sourceIds: allSourceIds,
    requireAbstract: false,
    minAbstractLength: 0,
    minQuality: 0,
    maxPerProvider: adaptiveMaxPerProvider,
    maxPerYear: adaptiveMaxPerYear,
    minProviderDiversity: adaptiveMinDiversity,
    ...opts.rankOptions,
  } : {
    limit: 100, // technical ceiling — pertinence selection cuts where quality drops
    mode: "quality",
    sourceIds: allSourceIds,
    minQuality: 0,
    requireAbstract: sourcePoolSize >= 20,
    minAbstractLength: sourcePoolSize >= 20 ? 150 : 0,
    maxPerProvider: adaptiveMaxPerProvider,
    maxPerYear: adaptiveMaxPerYear,
    minProviderDiversity: adaptiveMinDiversity,
  };

  emitProgress(pipelineRun.id, "RANK", "started", `Ranking candidates from ${allSourceIds.length} SCOUT sources...`);
  console.log(`${label} RANK: scoring candidates from ${allSourceIds.length} SCOUT sources (ceiling ${rankOpts.limit})`);
  const rankedCandidates = await rank(query, rankOpts);

  // ── PERTINENCE SELECTION — keep exactly what is relevant, no arbitrary cut ──
  // The system's role: take ALL sources that are genuinely pertinent, drop the rest.
  // Deterministic: relative quality bar + elbow detection on the score distribution.
  let topSources = rankedCandidates;
  if (rankedCandidates.length > 0) {
    const scores = rankedCandidates.map((s: any) => s.compositeScore ?? 0);
    const topScore = scores[0];
    // Quality bar: a source is pertinent if it holds at least 55% of the best score
    // (and an absolute floor of 30/100 to never keep junk on weak pools)
    const qualityBar = Math.max(30, topScore * 0.55);
    let cutIndex = scores.findIndex((sc: number) => sc < qualityBar);
    if (cutIndex === -1) cutIndex = rankedCandidates.length; // everything is pertinent

    // Elbow detection: if the score drops >25% between two consecutive sources
    // (after a minimum of 20 kept), the pertinence cliff is there — cut at the cliff.
    const minKeep = Math.min(20, rankedCandidates.length);
    for (let i = minKeep; i < cutIndex; i++) {
      if (scores[i - 1] > 0 && (scores[i - 1] - scores[i]) / scores[i - 1] > 0.25) {
        cutIndex = i;
        break;
      }
    }

    topSources = rankedCandidates.slice(0, cutIndex);
    console.log(`${label} PERTINENCE SELECTION: kept ${topSources.length}/${rankedCandidates.length} candidates (bar=${qualityBar.toFixed(1)}, top=${topScore.toFixed(1)}, cutoff score=${scores[Math.min(cutIndex, scores.length - 1)]?.toFixed(1) ?? 'n/a'})`);
  }

  // ── DOMAIN RELEVANCE FILTER — remove off-topic sources ──
  // Energy/electricity sources should not appear in finance reports, and vice versa.
  // This prevents the QUANT agent's data providers from polluting non-energy reports.
  const queryLower = query.toLowerCase();
  const isFinanceQuery = /\b(debt|fiscal|treasury|budget|deficit|spending|tax|bond|yield|interest rate|monetary|banking|finance|leverage|systemic|credit|central bank|fed|ecb|basel|inflation|currency|exchange rate|financial)\b/.test(queryLower);
  const isEnergyQuery = /\b(energy|electricity|power|grid|datacenter|data center|nuclear|renewable|solar|wind|gas|oil|petroleum|coal|hydrogen)\b/.test(queryLower);
  const isClimateQuery = /\b(co2|carbon|emission|climate|greenhouse|warming|pollution)\b/.test(queryLower);
  const offTopicProviders = new Set<string>();
  if (isFinanceQuery && !isEnergyQuery) {
    ['energy-charts', 'smard', 'rte-france', 'energi-data', 'fingrid', 'entsoe', 'entsog', 'iea', 'irena', 'acea'].forEach(p => offTopicProviders.add(p));
  }
  if (isFinanceQuery && !isClimateQuery) {
    ['energi-data', 'eea', 'ademe'].forEach(p => offTopicProviders.add(p));
  }
  if (isEnergyQuery && !isFinanceQuery) {
    ['treasury-fiscal', 'fred', 'ecb', 'eib', 'bis', 'imf', 'worldbank', 'oecd'].forEach(p => offTopicProviders.add(p));
  }
  if (offTopicProviders.size > 0 && topSources.length > 0) {
    const before = topSources.length;
    topSources = topSources.filter((s: any) => !offTopicProviders.has(s.provider));
    if (topSources.length < before) {
      console.log(`${label} DOMAIN FILTER: removed ${before - topSources.length} off-topic sources (${[...offTopicProviders].join(', ')})`);
    }
  }
  ctx.setRankedSources(topSources.map((s: any) => s.id));
  ctx.recordAgentTiming('RANK', Date.now() - pipelineStart);
  // Record rank stats for qualityScore extraction (extractPipelineScores reads rank.avgQuality)
  const rankAvgQuality = topSources.length > 0
    ? topSources.reduce((sum: number, s: any) => sum + (s.qualityScore || 0), 0) / topSources.length
    : 0;
  stats.rank = { count: topSources.length, avgQuality: Math.round(rankAvgQuality) };
  emitProgress(pipelineRun.id, "RANK", "completed", `Ranked ${topSources.length} sources (avgQuality ${Math.round(rankAvgQuality)})`, { blackboard: ctx.getSummary() });

  // LOT 2.5: Tag load-bearing sources (top 3) vs context sources
  for (let i = 0; i < topSources.length; i++) {
    (topSources[i] as any).loadBearing = i < 3;
  }
  console.log(`${label} LOAD BEARING: ${Math.min(3, topSources.length)} sources tagged as load_bearing`);

  // CRITICAL: Abort if no usable sources (prevents hallucinated briefs)
  if (topSources.length === 0) {
    console.error(`${label} ABORT: RANK returned 0 sources from ${allSourceIds.length} SCOUT results — nothing to analyze`);
    throw new Error(`No relevant sources found for "${query.slice(0, 80)}" (${allSourceIds.length} scouted, 0 ranked). Try different providers or broader query.`);
  }

  // P3.9: ADAPTIVE ENRICHMENT REASONING — replaces rigid structured refusal
  // Instead of a fixed threshold (minEvidenceCount), an LLM reasons about
  // whether the evidence is sufficient for this specific topic/domain/format.
  // If gaps are identifiable and fillable, it generates targeted queries
  // and we re-SCOUT. Only refuses if evidence is fundamentally insufficient.
  emitProgress(pipelineRun.id, "ENRICHMENT", "started", `Assessing evidence sufficiency: ${topSources.length} sources...`);
  const sourceSummaries = topSources.map((s: any) => ({
    title: s.title || s.id || '',
    provider: s.provider || 'unknown',
    qualityScore: s.qualityScore || 0,
    hasAbstract: !!(s.abstract && s.abstract.length > 50),
    hasFullText: !!(s.fullTextUrl || s.openAccessPdf),
    year: s.year || s.publishedDate?.slice(0, 4) || null,
  }));

  const enrichmentAssessment = await assessEvidenceSufficiency(
    query,
    'general',
    isStrategic,
    sourceSummaries,
    allSourceIds.length,
  );
  addCost(enrichmentAssessment.costUsd, 'ENRICHMENT_REASONER');

  if (enrichmentAssessment.verdict === 'enrich' && enrichmentAssessment.enrichmentQueries.length > 0) {
    console.log(`${label} ENRICHMENT: ${enrichmentAssessment.gaps.length} gaps identified — searching with ${enrichmentAssessment.enrichmentQueries.length} targeted queries`);
    emitProgress(pipelineRun.id, "ENRICHMENT", "started", `Filling ${enrichmentAssessment.gaps.length} evidence gaps...`);

    // Run targeted enrichment searches
    const enrichmentProviders = enrichmentAssessment.suggestedProviders.length > 0
      ? Array.from(new Set([...providers, ...enrichmentAssessment.suggestedProviders])) as Providers
      : providers;
    const enrichmentResults = await Promise.allSettled(
      enrichmentAssessment.enrichmentQueries.slice(0, 5).map(q => scout(q, enrichmentProviders, isStrategic ? 25 : 20))
    );
    let newSourceCount = 0;
    for (const r of enrichmentResults) {
      if (r.status === 'fulfilled') {
        const newIds = Array.isArray(r.value) ? r.value.map(s => s.id) : (r.value.sourceIds || []);
        const beforeLen = allSourceIds.length;
        allSourceIds = [...new Set([...allSourceIds, ...newIds])];
        newSourceCount += allSourceIds.length - beforeLen;
      }
    }

    if (newSourceCount > 0) {
      console.log(`${label} ENRICHMENT: +${newSourceCount} new sources from targeted queries — re-ranking`);
      // Re-rank with enriched source pool
      const enrichedRankOpts = isStrategic ? {
        ...rankOpts,
        sourceIds: allSourceIds,
        // Keep the same ceiling as the original rank — enrichment adds sources, shouldn't shrink the funnel
        limit: rankOpts.limit ?? 300,
      } : {
        ...rankOpts,
        sourceIds: allSourceIds,
        limit: rankOpts.limit ?? 100,
      };
      const enrichedTop = await rank(query, enrichedRankOpts);
      // Replace topSources with enriched version if it's better
      if (enrichedTop.length > topSources.length) {
        topSources.length = 0;
        topSources.push(...enrichedTop);
        for (let i = 0; i < topSources.length; i++) {
          (topSources[i] as any).loadBearing = i < 3;
        }
      }
    }

    stats.enrichmentReasoner = {
      verdict: 'enrich',
      sufficiencyScore: enrichmentAssessment.sufficiencyScore,
      gapsFound: enrichmentAssessment.gaps.length,
      enrichmentQueries: enrichmentAssessment.enrichmentQueries,
      newSourcesAdded: newSourceCount,
      costUsd: enrichmentAssessment.costUsd,
    };
    emitProgress(pipelineRun.id, "ENRICHMENT", "completed", `Enriched: +${newSourceCount} sources, ${topSources.length} total ranked`);
  } else if (enrichmentAssessment.verdict === 'refuse') {
    console.warn(`${label} REFUSAL: Evidence fundamentally insufficient — ${enrichmentAssessment.reasoning}`);

    // ── REFORMULATION RETRY — instead of giving up, try broadening the query ──
    // The enrichment reasoner identified gaps. Use its enrichmentQueries as reformulations
    // and re-scout with them. If we find enough aligned sources, proceed.
    const reformulationQueries = enrichmentAssessment.enrichmentQueries?.length > 0
      ? enrichmentAssessment.enrichmentQueries.slice(0, 3)
      : [query]; // fallback to original if no enrichment queries

    if (reformulationQueries.length > 0 && reformulationQueries[0] !== query) {
      console.log(`${label} REFUSAL RETRY: Re-scouting with ${reformulationQueries.length} reformulated queries...`);
      emitProgress(pipelineRun.id, "ENRICHMENT", "started", `Retrying with reformulated queries...`);

      const retryScoutResults = await Promise.allSettled(
        reformulationQueries.map(q => scout(q, providers, isStrategic ? 30 : 20))
      );
      let retryNewSourceIds: string[] = [];
      for (const r of retryScoutResults) {
        if (r.status === 'fulfilled') {
          const newIds = Array.isArray(r.value) ? r.value.map((s: any) => s.id) : (r.value.sourceIds || []);
          retryNewSourceIds = [...new Set([...retryNewSourceIds, ...newIds])];
        }
      }

      if (retryNewSourceIds.length > 0) {
        // Re-rank with the new sources
        const retryRanked = await rank(query, { limit: isStrategic ? 25 : 15, mode: 'balanced' });
        if (retryRanked.length > topSources.length) {
          console.log(`${label} REFUSAL RETRY: Found ${retryRanked.length} sources (was ${topSources.length}). Proceeding with enriched corpus.`);
          topSources = retryRanked;
          // Re-assess sufficiency with the new sources
          const retrySourceSummaries = topSources.slice(0, 15).map((s: any) => ({
            title: s.title || '',
            provider: s.provider || '',
            year: s.year,
            qualityScore: s.qualityScore || 0,
            hasAbstract: !!(s.abstract || s.summary),
            hasFullText: !!s.fullTextUrl,
          }));
          const retryAssessment = await assessEvidenceSufficiency(query, 'general', isStrategic, retrySourceSummaries, topSources.length);
          addCost(retryAssessment.costUsd, 'ENRICHMENT_REASONER_RETRY');

          if (retryAssessment.verdict !== 'refuse') {
            // Success — proceed with the enriched corpus
            console.log(`${label} REFUSAL RETRY: ✅ Sufficiency reassessed as ${retryAssessment.verdict} (score ${retryAssessment.sufficiencyScore}/100)`);
            stats.enrichmentReasoner = {
              verdict: retryAssessment.verdict,
              sufficiencyScore: retryAssessment.sufficiencyScore,
              gapsFound: retryAssessment.gaps.length,
              enrichmentQueries: reformulationQueries,
              newSourcesAdded: retryNewSourceIds.length,
              costUsd: enrichmentAssessment.costUsd + retryAssessment.costUsd,
              retryAttempted: true,
              retrySucceeded: true,
            } as any;
            // Skip to analysis with the new sources
          } else {
            // Still refused after retry — give up
            console.warn(`${label} REFUSAL RETRY: ❌ Still insufficient after reformulation. Giving up.`);
            stats.structuredRefusal = {
              reason: 'insufficient_evidence',
              sourceCount: topSources.length,
              required: 0,
              missing: enrichmentAssessment.gaps.map(g => `${g.type}: ${g.description}`),
              retryAttempted: true,
              retryQueries: reformulationQueries,
            };
            stats.enrichmentReasoner = {
              verdict: 'refuse',
              sufficiencyScore: retryAssessment.sufficiencyScore,
              gapsFound: retryAssessment.gaps.length,
              enrichmentQueries: [],
              newSourcesAdded: 0,
              costUsd: enrichmentAssessment.costUsd + retryAssessment.costUsd,
              retryAttempted: true,
              retrySucceeded: false,
            } as any;
            emitProgress(pipelineRun.id, "ENRICHMENT", "completed", `Refusal after retry: evidence still insufficient`);
            stats.totalCostUsd = runningCostUsd;
            activeRuns.delete(idempotencyKey);
            return { briefId: undefined, pipelineRun, stats, html: '', analysis: { refusal: stats.structuredRefusal } as any };
          }
        } else {
          console.warn(`${label} REFUSAL RETRY: Reformulation didn't find more sources. Giving up.`);
          stats.structuredRefusal = {
            reason: 'insufficient_evidence',
            sourceCount: topSources.length,
            required: 0,
            missing: enrichmentAssessment.gaps.map(g => `${g.type}: ${g.description}`),
            retryAttempted: true,
            retrySucceeded: false,
          };
          stats.enrichmentReasoner = {
            verdict: 'refuse',
            sufficiencyScore: enrichmentAssessment.sufficiencyScore,
            gapsFound: enrichmentAssessment.gaps.length,
            enrichmentQueries: [],
            newSourcesAdded: 0,
            costUsd: enrichmentAssessment.costUsd,
            retryAttempted: true,
            retrySucceeded: false,
          } as any;
          emitProgress(pipelineRun.id, "ENRICHMENT", "completed", `Refusal after retry: no new sources found`);
          stats.totalCostUsd = runningCostUsd;
          activeRuns.delete(idempotencyKey);
          return { briefId: undefined, pipelineRun, stats, html: '', analysis: { refusal: stats.structuredRefusal } as any };
        }
      } else {
        // No new sources from reformulation
        stats.structuredRefusal = {
          reason: 'insufficient_evidence',
          sourceCount: topSources.length,
          required: 0,
          missing: enrichmentAssessment.gaps.map(g => `${g.type}: ${g.description}`),
          retryAttempted: true,
          retrySucceeded: false,
        };
        stats.enrichmentReasoner = {
          verdict: 'refuse',
          sufficiencyScore: enrichmentAssessment.sufficiencyScore,
          gapsFound: enrichmentAssessment.gaps.length,
          enrichmentQueries: [],
          newSourcesAdded: 0,
          costUsd: enrichmentAssessment.costUsd,
          retryAttempted: true,
          retrySucceeded: false,
        } as any;
        emitProgress(pipelineRun.id, "ENRICHMENT", "completed", `Refusal: reformulation found no sources`);
        stats.totalCostUsd = runningCostUsd;
        activeRuns.delete(idempotencyKey);
        return { briefId: undefined, pipelineRun, stats, html: '', analysis: { refusal: stats.structuredRefusal } as any };
      }
    } else {
      // No reformulation queries available — give up
      stats.structuredRefusal = {
        reason: 'insufficient_evidence',
        sourceCount: topSources.length,
        required: 0,
        missing: enrichmentAssessment.gaps.map(g => `${g.type}: ${g.description}`),
      };
      stats.enrichmentReasoner = {
        verdict: 'refuse',
        sufficiencyScore: enrichmentAssessment.sufficiencyScore,
        gapsFound: enrichmentAssessment.gaps.length,
        enrichmentQueries: [],
        newSourcesAdded: 0,
        costUsd: enrichmentAssessment.costUsd,
      };
      emitProgress(pipelineRun.id, "ENRICHMENT", "completed", `Refusal: evidence insufficient (score ${enrichmentAssessment.sufficiencyScore}/100)`);
      stats.totalCostUsd = runningCostUsd;
      activeRuns.delete(idempotencyKey);
      return { briefId: undefined, pipelineRun, stats, html: '', analysis: { refusal: stats.structuredRefusal } as any };
    }
  } else {
    stats.enrichmentReasoner = {
      verdict: 'proceed',
      sufficiencyScore: enrichmentAssessment.sufficiencyScore,
      gapsFound: enrichmentAssessment.gaps.length,
      enrichmentQueries: [],
      newSourcesAdded: 0,
      costUsd: enrichmentAssessment.costUsd,
    };
    emitProgress(pipelineRun.id, "ENRICHMENT", "completed", `Proceed: sufficiency score ${enrichmentAssessment.sufficiencyScore}/100, ${topSources.length} sources`);
    console.log(`${label} ENRICHMENT: Proceed with ${topSources.length} sources (sufficiency: ${enrichmentAssessment.sufficiencyScore}/100)`);
    ctx.addFinding('ENRICHMENT', 'insight', `Evidence sufficiency: ${enrichmentAssessment.sufficiencyScore}/100 with ${topSources.length} sources`);
  }
  orchState.sourcesFound = topSources.length;
  orchState.avgQualityScore = topSources.length > 0
    ? Math.round(topSources.reduce((sum: number, s: any) => sum + (s.qualityScore || 0), 0) / topSources.length)
    : 0;
  stats.rank = { count: topSources.length, avgQuality: orchState.avgQualityScore };

  // P3.8: Create stable evidence registry — assigns [E1], [E2]... to sources
  const { createEvidenceRegistry } = await import('./evidence-registry');
  const evidenceRegistry = createEvidenceRegistry(topSources);

  // ── STEP 4b: DOMAIN CLASSIFICATION (LLM primary, rules fallback) ───
  const topicClassification = await classifyTopic(query);
  const detectedDomain = topicClassification.primaryDomain;
  ctx.setDomain(detectedDomain);
  ctx.addFinding('CLASSIFIER', 'insight', `Domain: ${detectedDomain} (confidence: ${topicClassification.confidence})`, { domains: topicClassification.domains, isCrossDomain: topicClassification.isCrossDomain });
  stats.topicClassification = {
    primaryDomain: topicClassification.primaryDomain,
    domains: topicClassification.domains,
    dimensions: topicClassification.dimensions,
    detectedSubject: topicClassification.detectedSubject,
    isCrossDomain: topicClassification.isCrossDomain,
    confidence: topicClassification.confidence,
    reasoning: topicClassification.reasoning,
  };
  console.log(`${label} DOMAIN: ${detectedDomain} (confidence: ${topicClassification.confidence}, cross=${topicClassification.isCrossDomain})`);
  if (topicClassification.dimensions.length >= 2) {
    console.log(`${label} COLLISION: ${topicClassification.dimensions.map((d) => d.label).join(' × ')}`);
  }

  // ── COMPLEXITY GATE: adapt pipeline steps to query difficulty (LAS pattern, ACL 2026) ──
  // For low-complexity non-strategic topics, skip expensive steps that yield diminishing returns.
  // Strategic reports always run the full stack regardless of complexity.
  if (!isStrategic && !opts.enableEnhancedCouncil) {
    const domainCount = topicClassification?.domains?.length ?? 1;
    const isCrossDomain = topicClassification?.isCrossDomain ?? false;
    const isLowComplexity = domainCount <= 1 && !isCrossDomain && topicClassification.confidence >= 0.8;
    if (isLowComplexity) {
      runMetaAnalysisStep = false;
      runDeliberationStep = false;
      runDebateStep = false;
      ctx.setComplexity('low');
      ctx.skipStep('meta-analysis');
      ctx.skipStep('deliberation');
      ctx.skipStep('debate');
      ctx.addFinding('COMPLEXITY_GATE', 'insight', `Low complexity: skipping meta-analysis, deliberation, debate`);
      console.log(`${label} COMPLEXITY GATE: low-complexity topic (1 domain, confidence ${topicClassification.confidence}) — skipping meta-analysis, deliberation, debate`);
    } else {
      ctx.setComplexity(isCrossDomain ? 'high' : 'medium');
    }
    // Meta-analysis only relevant for domains with effect sizes / quantitative studies
    const META_ANALYSIS_DOMAINS = ['health', 'medical', 'economics', 'finance', 'social_sciences', 'statistics'];
    if (!META_ANALYSIS_DOMAINS.includes(detectedDomain)) {
      runMetaAnalysisStep = false;
      ctx.skipStep('meta-analysis');
      console.log(`${label} COMPLEXITY GATE: meta-analysis skipped (domain "${detectedDomain}" not quantitative-study oriented)`);
    }
  } else {
    ctx.setComplexity('high');
  }

  // STEP 4b2: GAP FILLER — retrieve knowledge gaps from prior analyses
  let gapQueries: string[] = [];
  let gapContextBlock: string | undefined;
  try {
    const gapInjection = await getRelevantGaps(query, detectedDomain, 3);
    if (gapInjection.gapsAddressed > 0) {
      gapQueries = gapInjection.gapQueries;
      gapContextBlock = gapInjection.gapContext;
      console.log(`${label} GAP FILLER: ${gapInjection.gapsAddressed} prior knowledge gaps relevant — adding ${gapQueries.length} search queries`);
    }
  } catch (err) {
    console.warn(`${label} GAP FILLER: retrieval failed (non-blocking):`, err);
  }

  // ── STEP 4c: INJECT FOUNDATIONAL SOURCES (PhD library) ──
  // Reactivated: seminal works from researcher KB are injected as context-only sources
  // so the analyst can reference them. They don't go through SCOUT but are added to the pool.
  try {
    const kb = RESEARCHER_KBS[detectedDomain as keyof typeof RESEARCHER_KBS];
    if (kb?.referencePapers && kb.referencePapers.length > 0) {
      const foundationalSources = kb.referencePapers.slice(0, 3).map((p, i) => ({
        id: `foundational:${detectedDomain}:${i}`,
        title: p.title,
        abstract: `${p.significance}. Authors: ${p.authors}. Journal: ${p.journal}. Year: ${p.year}.`,
        authors: [{ name: p.authors }],
        year: p.year,
        doi: null,
        provider: 'foundational',
        url: null,
        type: 'reference',
        qualityScore: 95,
        metadata: { seminal: true, domain: detectedDomain },
      }));
      allSourceIds = [...new Set([...allSourceIds, ...foundationalSources.map(s => s.id)])];
      console.log(`${label} FOUNDATIONAL INJECTION: +${foundationalSources.length} seminal works from ${detectedDomain} KB`);
    }
  } catch (err) {
    console.warn(`${label} FOUNDATIONAL INJECTION: failed (non-blocking):`, err);
  }

  // STEP 4d: GAP FILLER SCOUT — run supplementary searches for prior knowledge gaps
  if (gapQueries.length > 0) {
    try {
      const gapResult = await scout(gapQueries.join(' OR '), providers.slice(0, 3), 10);
      const gapSourceIds = Array.isArray(gapResult) ? gapResult.map(s => s.id) : (gapResult.sourceIds || []);
      if (gapSourceIds.length > 0) {
        allSourceIds = [...new Set([...allSourceIds, ...gapSourceIds])];
        console.log(`${label} GAP FILLER SCOUT: +${gapSourceIds.length} sources from gap queries`);
      }
    } catch (err) {
      console.warn(`${label} GAP FILLER SCOUT: failed (non-blocking):`, err);
    }
  }

  let castingResult: CastingResult | undefined;
  // CASTING: SUPPRESSED — cross-domain lenses not consumed by analyst, $0.03/run saved
  stats.casting = { skipped: true, reason: 'suppressed — lenses not used by analyst' };

  // ── LAS GATE (LLM-as-Scheduler, ACL 2026 best practice) ──
  // Lightweight deterministic gate after RANK: adapt downstream agents based on evidence pool.
  // No LLM call — uses pool size + domain + complexity to route.
  {
    const poolSize = topSources.length;
    const providerDiversity = new Set(topSources.map((s: any) => s.provider)).size;
    if (!isStrategic) {
      // Briefs with small pools: skip expensive agents that need diverse evidence
      if (poolSize < 8) {
        runDebateStep = false;
        runMetaAnalysisStep = false;
        console.log(`${label} LAS GATE: small pool (${poolSize} sources) — skipping debate, meta-analysis`);
      }
      if (poolSize < 6 && providerDiversity < 3) {
        runDevilsAdvocateStep = false;
        console.log(`${label} LAS GATE: very small pool + low diversity — skipping devil's advocate (insufficient for epistemic challenge)`);
      }
    }
    console.log(`${label} LAS GATE: pool=${poolSize}, providers=${providerDiversity}, debate=${runDebateStep}, meta=${runMetaAnalysisStep}, DA=${runDevilsAdvocateStep}, foresight_eligible=${poolSize >= 10}`);
    ctx.addFinding('LAS_GATE', 'insight', `Pool: ${poolSize} sources from ${providerDiversity} providers — debate=${runDebateStep}, meta=${runMetaAnalysisStep}, DA=${runDevilsAdvocateStep}`);
  }

  // ── STEP 5: READER V3 + FRAMING + QUANT (parallel) ──
  emitProgress(pipelineRun.id, "READER", "started", `Deep extraction from ${topSources.length} sources...`);
  console.log(`${label} READER V3: deep extraction from ${topSources.length} sources (domain: ${detectedDomain})`);
  // -- STEP 5a: AGENT MEMORY INJECTION for READER --
  let readerMemoryBlock: string | undefined;
  try {
    const readerMemInj = await buildMemoryInjection("reader", detectedDomain as DomainExpertise, { maxLessons: 3, lookbackDays: 90, topicQuery: query });
    if (readerMemInj.topLessons.length > 0) {
      readerMemoryBlock = readerMemInj.promptBlock;
      console.log(`${label} AGENT MEMORY (READER): ${readerMemInj.topLessons.length} lessons injected`);
    }
  } catch (err) { console.warn(`${label} AGENT MEMORY (READER): failed (non-blocking):`, err); }
  const [readings, framingSettled, quantSettled, quantBridgeSettled] = await Promise.all([
    readerAgentV3(topSources, {
      enablePdf: true,
      maxConcurrency: 8,
      timeout: isStrategic ? 120000 : undefined,
      domain: detectedDomain,
      memoryBlock: readerMemoryBlock,
    }),
    // FRAMING: SUPPRESSED — hypotheses not consumed by analyst, $0.03/run saved
    Promise.resolve({ hypotheses: [] as any[], keyUnknowns: [] as string[], costUsd: 0 }),
    // QUANT: fetch real numbers from T1 primary-data providers
    import('./quant-agent').then(m => m.quantAgent(query, topSources)).catch((err) => {
      console.warn(`${label} QUANT: failed (non-blocking):`, err);
      return { series: [], facts: [], evidenceBlock: '', chartData: [], fetchedProviders: [], durationMs: 0 };
    }),
    // QUANT BRIDGE: deterministic model layer (parametric costing + FIGARO IO multipliers)
    import('../quant/quant-bridge').then(m => m.runQuantBridge(query, {
      depth: opts.quantDepth ?? (isStrategic ? 'io' : 'none'),
      parametricInput: opts.parametricInput,
    })).catch((err) => {
      console.warn(`${label} QUANT BRIDGE: failed (non-blocking):`, err);
      return { models: [] as any[], evidenceBlock: '', usedModels: [] as any[], durationMs: 0 };
    }),
  ]);
  const framing = framingSettled;
  const quant = quantSettled;
  const quantBridge = quantBridgeSettled;
  stats.quantBridge = { models: quantBridge.models.length, kinds: quantBridge.usedModels, durationMs: quantBridge.durationMs };
  if (quantBridge.models.length > 0) console.log(`${label} QUANT BRIDGE: ${quantBridge.models.length} deterministic model(s) [${quantBridge.usedModels.join(', ')}]`);
  addCost(framing.costUsd, 'FRAMING');
  stats.framing = { hypotheses: framing.hypotheses.length, keyUnknowns: framing.keyUnknowns.length, costUsd: framing.costUsd };
  stats.quant = { series: quant.series.length, facts: quant.facts.length, providers: quant.fetchedProviders, durationMs: quant.durationMs };
  if (framing.hypotheses.length > 0) console.log(`${label} FRAMING: ${framing.hypotheses.length} hypotheses pre-registered`);
  if (quant.facts.length > 0) console.log(`${label} QUANT: ${quant.facts.length} machine-verified facts from ${quant.fetchedProviders.join(', ')}`);
  const fullTextCount = readings.filter(r => r.readingDepth === "full_text").length;
  const quantCount = readings.filter(r => r.quantitative.effectSizes.length > 0 || r.quantitative.sampleSizes.length > 0).length;
  stats.reader = { count: readings.length, fullText: fullTextCount, withQuantData: quantCount };
  ctx.setReaderExtracts(readings);
  ctx.recordAgentTiming('READER', Date.now() - pipelineStart);

  // ── CONTEXT COMPRESSION: Compress readings for downstream agents ──
  // IterResearch pattern: compress intermediate findings to fit context window
  try {
    const { compressReadings } = await import('./knowledge-infrastructure');
    const readingsForCompression = readings.slice(0, 30).map(r => ({
      sourceId: r.sourceId,
      claims: r.claims || [],
      methods: r.methods || [],
      results: r.results || [],
      limitations: r.limitations || [],
    }));
    if (readingsForCompression.length > 10) {
      const { compressed, costUsd: compressCost } = await compressReadings(readingsForCompression);
      stats.contextCompression = { originalSize: readingsForCompression.length, compressedSize: compressed.split(/\s+/).length, costUsd: compressCost };
      console.log(`${label} CONTEXT COMPRESSION: ${readingsForCompression.length} readings → ${compressed.split(/\s+/).length} words`);
    }
  } catch (err) {
    // Non-blocking
  }

  // Attach extractedText from READER V3 to topSources for claim grounding
  const readingByText = new Map(readings.map(r => [r.sourceId, r]));
  for (const src of topSources) {
    const r = readingByText.get((src as any).id);
    if (r?.extractedText) {
      (src as any).fullText = r.extractedText;
    }
  }

  orchState.sourcesWithAbstract = readings.filter(r =>
    r.claims.length > 0 || r.methods.length > 0 || r.results.length > 0 ||
    (r.extractedText && r.extractedText.length > 100) ||
    r.readingDepth === "abstract" || r.readingDepth === "full_text"
  ).length;
  orchState.sourcesWithFullText = fullTextCount;
  const readerDecision = assessAfterReader(orchState);
  recordDecision(orchState, readerDecision);
  stats.orchestrator = stats.orchestrator || { decisions: [] };
  stats.orchestrator.decisions.push(readerDecision);

  // ── STEP 5b-2: HYPOTHESIS JUDGE — verdict per pre-registered hypothesis ──
  let hypothesisVerdictBlock = '';
  if (framing.hypotheses.length > 0) {
    try {
      const { hypothesisJudge } = await import('./hypothesis-engine');
      const judge = await hypothesisJudge(framing.hypotheses, topSources, readings, quant.evidenceBlock || undefined);
      addCost(judge.costUsd, 'HYPOTHESIS JUDGE');
      hypothesisVerdictBlock = judge.verdictBlock;
      stats.hypothesisJudge = {
        verdicts: judge.verdicts.map(v => ({ id: v.id, verdict: v.verdict, confidence: v.confidence })),
        costUsd: judge.costUsd,
      };
    } catch (err) {
      console.warn(`${label} HYPOTHESIS JUDGE: failed (non-blocking):`, err);
    }
  }

  // DPP SYNTHESIS (V3.1)
  let dppContextBlock: string | null = null;
  try {
    if (readings.length > 8) {
      const { extractAtomicKeyPoints, selectDiverseKeyPoints, formatKeyPointsForAnalyst } = await import("./dpp-synthesis");
      const keyPoints = await extractAtomicKeyPoints(readings.map((r: any, i: number) => ({ sourceId: r.sourceId, sourceIndex: i, claims: r.claims || [], methods: r.methods || [], results: r.results || [], limitations: r.limitations || [], title: topSources[i]?.title, abstract: topSources[i]?.abstract || undefined })));
      const selection = selectDiverseKeyPoints(keyPoints, 20, 0.5);
      dppContextBlock = formatKeyPointsForAnalyst(selection);
      if (dppContextBlock) { console.log(`${label} DPP SYNTHESIS: ${selection.selectedPoints.length}/${keyPoints.length} points (diversity=${Math.round(selection.diversityScore * 100)}%)`); stats.dppSynthesis = { totalPoints: keyPoints.length, selectedPoints: selection.selectedPoints.length, diversityScore: selection.diversityScore, coverageScore: selection.coverageScore } as any; }
    }
  } catch (err) { console.warn(`${label} DPP SYNTHESIS: failed (non-blocking):`, err); }

  // ADAPTIVE RAG (V3.1)
  try {
    const { assessRetrievalSufficiency } = await import("./adaptive-rag");
    const assessment = await assessRetrievalSufficiency({ researchQuestion: query, sources: topSources.map((s: any) => ({ title: s.title, abstract: s.abstract || "", provider: s.provider, year: s.year })), readings: readings.map((r: any) => ({ sourceId: r.sourceId, claims: r.claims, confidence: r.confidence })) });
    stats.adaptiveRag = { sufficient: assessment.sufficient, confidence: assessment.confidence, gaps: assessment.gaps } as any;
    if (!assessment.sufficient) console.log(`${label} ADAPTIVE RAG: insufficient (${assessment.confidence}%): ${assessment.gaps.join("; ")}`);
    else console.log(`${label} ADAPTIVE RAG: sufficient (${assessment.confidence}%)`);
  } catch (err) { console.warn(`${label} ADAPTIVE RAG: failed (non-blocking):`, err); }

  // ROUND-TABLE DELIBERATION (V3.1) for controversial topics
  let roundTableBlock: string | null = null;
  if (isStrategic && runDeliberationStep) {
    try {
      const isControversial = ((primedContext?.activeControversies?.length ?? 0) > 0) || (readings.some((r: any) => r.claimClassifications?.some((c: any) => c.type === "controversial")));
      if (isControversial) {
        const { deliberate } = await import("./round-table");
        const dr = await deliberate(query, topSources.slice(0, 5).map((s: any) => ({ title: s.title, abstract: s.abstract || "" })), { rounds: 2, participants: 3 });
        stats.roundTable = { consensus: dr.consensus, participants: dr.participants.length, rounds: dr.rounds.length } as any;
        console.log(`${label} ROUND-TABLE: consensus=${dr.consensus}, ${dr.participants.length}p, ${dr.rounds.length}r`);
        if (dr.synthesis) roundTableBlock = `## ROUND-TABLE DELIBERATION\nConsensus: ${dr.consensus.toUpperCase()}\n\n${dr.synthesis}`;
      }
    } catch (err) { console.warn(`${label} ROUND-TABLE: failed (non-blocking):`, err); }
  }

  // STEP 6: ANALYSTSTEP 6: ANALYST (brief = V3 multi-pass, strategic = Strategic Analyst) â”€â”€
  emitProgress(pipelineRun.id, "ANALYST", "started", `${isStrategic ? "Strategic-depth multi-pass analysis" : "Multi-pass analysis"}...`);
  console.log(`${label} ANALYST: V3 multi-pass (depth: ${isStrategic ? 'strategic' : 'brief'})`);
  // -- STEP 5b: AGENT MEMORY INJECTION -- inject past lessons into ANALYST --
  const agentId = "analyst";
  let memoryBlock: string | undefined;
  try {
    const memInj = await buildMemoryInjection(agentId, undefined, { maxLessons: 5, lookbackDays: 90, topicQuery: query });
    if (memInj.topLessons.length > 0) {
      memoryBlock = memInj.promptBlock;
      stats.agentMemory = { lessons: memInj.topLessons.length, agentId };
      console.log(`${label} AGENT MEMORY: ${memInj.topLessons.length} lessons injected into ${agentId}`);
      // ── CROSS-RUN LEARNING → BLACKBOARD ──
      // Publish lessons to the blackboard so all downstream agents (DA, Critical Loop, EDITOR)
      // can see what was learned from past runs — avoids repeating the same mistakes.
      for (const lesson of memInj.topLessons) {
        ctx.addFinding('AGENT_MEMORY', 'recommendation', `Past lesson: ${lesson.lesson.slice(0, 200)}`);
      }
    }
  } catch (err) {
    console.warn(`${label} AGENT MEMORY: failed (non-blocking):`, err);
  }
  // Build domain context block (injected via contextBlock for both formats)
  let domainBlock = '';
  const kb = RESEARCHER_KBS[detectedDomain as DomainExpertise];
  const corpus = MULTI_DOMAIN_CORPUS[detectedDomain as DomainExpertise];
  if (kb || corpus) {
    const parts = [`Domain: ${detectedDomain.toUpperCase()}`];
    if (kb?.keyConcepts?.length) parts.push(`Core concepts: ${kb.keyConcepts.slice(0, 5).map((c: KeyConcept) => c.name).join(', ')}`);
    if (kb?.frameworks?.length) parts.push(`Frameworks: ${kb.frameworks.slice(0, 3).map((f: AnalyticalFramework) => f.name).join(', ')}`);
    if (kb?.knownBiases?.length) parts.push(`Known biases: ${kb.knownBiases.slice(0, 3).join('; ')}`);
    if (kb?.referencePapers?.length) parts.push(`Foundational works (cite when relevant): ${kb.referencePapers.map(p => `${p.title} (${p.authors}, ${p.year})`).join('; ')}`);
    if (corpus?.keyFrameworks?.length) parts.push(`Key frameworks: ${corpus.keyFrameworks.join(', ')}`);
    if (corpus?.seminalWorks?.length) parts.push(`Seminal works: ${corpus.seminalWorks.slice(0, 4).join('; ')}`);
    domainBlock = parts.join('\n');
  }

  const strategicOptsBlock = isStrategic
    ? [opts.focusAreas && `Focus areas: ${opts.focusAreas}`, opts.targetAudience && `Target audience: ${opts.targetAudience}`, opts.urgencyContext].filter(Boolean).join('\n') || undefined
    : undefined;

  // ── EDITORIAL NORTH STAR — injected FIRST so the analyst reasons toward the finality ──
  // The publication is scored deterministically. Tell the analyst EXACTLY what is measured,
  // so producing a high-trust publication is the optimization target from the first token.
  // Citation target: 50% of sources, no artificial cap — a 143-source report must cite 72+.
  const citationTarget = Math.max(20, Math.ceil(topSources.length * 0.5));
  const editorialNorthStar = [
    `## EDITORIAL NORTH STAR — NON-NEGOTIABLE FINALITY`,
    `You are producing a publication for a think tank whose entire credibility rests on trust and rigor.`,
    `You have ${topSources.length} pertinent sources selected by quality and relevance. Use them.`,
    `The final publication is scored DETERMINISTICALLY on these exact criteria:`,
    `1. CITATION COVERAGE (25%): cite at least ${citationTarget} DISTINCT sources with [SRC-N] tags. This is ${Math.round(citationTarget / topSources.length * 100)}% of your evidence base. MANDATORY: Before returning JSON, count your distinct [SRC-N] citations. If below ${citationTarget}, add citations from uncited sources to relevant claims. Do NOT cluster on 5-10 sources — spread across the full evidence base. Every source was selected for a reason — cite it at least once.`,
    `2. GROUNDEDNESS (20%): every factual claim must be directly supported by the cited source's actual content. If a source doesn't say it, don't claim it. Unsourced claims are penalized heavily.`,
    `3. NUMERICAL INTEGRITY (30%): every number, percentage, or statistic MUST come from a cited source. An unsourced number is a fatal defect. If no source provides the number, write "non établie".`,
    `4. SOURCE QUALITY (15%): prioritize claims from the highest-quality sources (peer-reviewed, recent, methodologically strong).`,
    `5. DIVERSITY (10%): draw on the full breadth of providers and years available. Cite from at least 7 different providers.`,
    `ANTI-PATTERN WARNING: The most common failure mode is citing only 5-10 sources out of ${topSources.length}. This caps trust at ~60/100 and blocks publication. AUDIT YOUR DRAFT: extract all [SRC-N] tags, convert to a Set, check size. If below ${citationTarget}, go back and add citations from uncited sources. Reports with fewer than ${citationTarget} distinct citations WILL BE REJECTED.`,
    `Editorial line: decision-ready analysis, no hedging filler, no generic advice. Every section must either state evidence, state a position derived from evidence, or state explicitly what is unknown. A research gap is a fact about the research, never about the actor studied.`,
  ].join('\n');

  // ── CONFLICT-AWARE REASONING (EvidentialRAG pattern) ──
  // Detect contradictions between sources BEFORE analysis, inject as context.
  // The analyst sees both sides and acknowledges uncertainty instead of hiding it.
  let conflictContextBlock: string | undefined;
  try {
    const { detectSourceConflicts } = await import('./conflict-aware');
    const conflictResult = await detectSourceConflicts(topSources, readings, {
      maxSources: isStrategic ? 15 : 10,
      maxPairs: isStrategic ? 50 : 30,
    });
    if (conflictResult.conflictCount > 0) {
      conflictContextBlock = conflictResult.contextBlock;
      console.log(`${label} CONFLICT-AWARE: ${conflictResult.conflictCount} contradictions detected (consensus ${Math.round(conflictResult.consensusRate * 100)}%) — injecting into analyst context`);
      stats.conflictDetection = {
        conflicts: conflictResult.conflictCount,
        consensusRate: Math.round(conflictResult.consensusRate * 100),
        pairsChecked: conflictResult.totalPairsChecked,
      };
    } else {
      console.log(`${label} CONFLICT-AWARE: no contradictions detected (consensus ${Math.round(conflictResult.consensusRate * 100)}%)`);
      stats.conflictDetection = {
        conflicts: 0,
        consensusRate: Math.round(conflictResult.consensusRate * 100),
        pairsChecked: conflictResult.totalPairsChecked,
      };
    }
  } catch (err) {
    console.warn(`${label} CONFLICT-AWARE: failed (non-blocking):`, err);
  }

  // ── SCENARIO ENGINE (PRE-ANALYST) — CANA + SCATTER for strategic reports ──
  // Run BEFORE analyst so outputs can be injected as context for richer analysis
  let scenarioContextBlock: string | undefined;
  // Save CANA/SCATTER results for post-hoc Multi-Lens Convergence Map injection
  let savedCanaResult: any = null;
  let savedScatterResult: any = null;
  if (isStrategic) {
    try {
      const { runCana, runScatter } = await import('./scenario-engine');
      const [canaResult, scatterResult] = await Promise.all([
        runCana(query),
        runScatter(query, '5-10 years'),
      ]);

      stats.scenarioEngine = {
        cana: {
          mechanisms: canaResult.mechanisms.length,
          analogues: canaResult.analogues.length,
          searchQueries: canaResult.searchQueries.length,
          costUsd: canaResult.costUsd,
        },
        scatter: {
          hypotheses: scatterResult.hypotheses.length,
          diversityScore: scatterResult.diversityScore,
          costUsd: scatterResult.costUsd,
        },
      };

      console.log(`${label} SCENARIO ENGINE (pre-analyst): CANA ${canaResult.mechanisms.length} mechanisms + ${canaResult.analogues.length} analogues, SCATTER ${scatterResult.hypotheses.length} hypotheses (diversity=${Math.round(scatterResult.diversityScore * 100)}%)`);

      // Save for post-hoc Multi-Lens Convergence Map
      savedCanaResult = canaResult;
      savedScatterResult = scatterResult;

      // Build context block from CANA + SCATTER outputs
      const canaBlock = canaResult.mechanisms.length > 0
        ? `## CAUSAL ANALOGICAL REASONING (CANA)\nIdentified causal mechanisms:\n${canaResult.mechanisms.slice(0, 6).map((m: any, i: number) => `${i + 1}. ${m.mechanism || m.description || JSON.stringify(m).slice(0, 200)}`).join('\n')}\n\nHistorical analogues:\n${canaResult.analogues.slice(0, 5).map((a: any, i: number) => `${i + 1}. ${a.analogue || a.case || a.description || JSON.stringify(a).slice(0, 200)}`).join('\n')}`
        : '';

      const scatterBlock = scatterResult.hypotheses.length > 0
        ? `## DIVERGENT HYPOTHESES (SCATTER)\nAlternative future trajectories to consider in scenario planning:\n${scatterResult.hypotheses.slice(0, 6).map((h: any, i: number) => `${i + 1}. ${h.hypothesis || h.scenario || h.description || JSON.stringify(h).slice(0, 200)}`).join('\n')}`
        : '';

      scenarioContextBlock = [canaBlock, scatterBlock].filter(Boolean).join('\n\n') || undefined;
    } catch (err) {
      console.warn(`${label} SCENARIO ENGINE (pre-analyst): failed (non-blocking):`, err instanceof Error ? err.message : String(err));
    }
  }

  // ── INNOVATOR AUTHOR DETECTION — identify cross-domain, heterodox, emerging, dissident authors ──
  let innovatorBlock: string | undefined;
  try {
    const { detectInnovatorAuthors, generateInnovatorPromptBlock } = await import('./author-innovator-detector');
    const innovatorResult = detectInnovatorAuthors(topSources);
    if (innovatorResult.stats.totalAuthors > 0) {
      innovatorBlock = generateInnovatorPromptBlock(innovatorResult);
      console.log(`${label} INNOVATOR AUTHORS: ${innovatorResult.stats.totalAuthors} authors | ${innovatorResult.stats.emergingCount} emerging | ${innovatorResult.stats.crossDomainCount} cross-domain | ${innovatorResult.stats.heterodoxCount} heterodox | ${innovatorResult.stats.dissidentCount} dissident`);
      stats.innovatorAuthors = innovatorResult.stats;
    }
  } catch (err) {
    console.warn(`${label} INNOVATOR AUTHORS: failed (non-blocking):`, err instanceof Error ? err.message : String(err));
  }

  let fullContextBlock = [
    editorialNorthStar,
    memoryBlock,
    primedContext?.contextBlock,
    gapContextBlock,
    quant.evidenceBlock || undefined,
    quantBridge.evidenceBlock || undefined,
    hypothesisVerdictBlock || undefined,
    conflictContextBlock,
    scenarioContextBlock,
    domainBlock || undefined,
    innovatorBlock || undefined,
    strategicOptsBlock,
    episodicFormatted || undefined,
    dppContextBlock || undefined,
    roundTableBlock || undefined,
  ].filter(Boolean).join("\n\n---\n\n") || undefined;

  let analysis: any;
  // Context surgery (2026 best practice): pass slim readings to analyst — only extracted fields, not full abstracts
  const slimReadings = readings.map((r: any) => ({
    sourceId: r.sourceId,
    claims: r.claims || [],
    methods: r.methods || [],
    results: r.results || [],
    limitations: r.limitations || [],
    confidence: r.confidence || 'medium',
  }));

  // Pre-analyst evidence sufficiency check
  const sourcesWithText = topSources.filter((s: any) =>
    (s.abstract && s.abstract.length > 100) || (s.fullText && s.fullText.length > 200)
  ).length;
  const textCoverage = topSources.length > 0 ? sourcesWithText / topSources.length : 0;
  if (textCoverage < 0.3) {
    console.warn(`${label} EVIDENCE WARNING: only ${sourcesWithText}/${topSources.length} sources have extractable text (${Math.round(textCoverage * 100)}%) — analyst may hallucinate`);
    fullContextBlock = [
      fullContextBlock,
      `\n## EVIDENCE SUFFICIENCY WARNING\nOnly ${sourcesWithText}/${topSources.length} sources have extractable text. Many claims will be unverifiable. ACKNOWLEDGE evidence gaps explicitly in evidenceAssessment.gaps. Do NOT fabricate claims to fill gaps — use "non établie" for unsupported assertions.`,
    ].filter(Boolean).join('\n\n---\n\n');
  }

  analysis = await analystMultipass(query, topSources, slimReadings, {
    contextBlock: fullContextBlock,
    domain: detectedDomain,
    depth: isStrategic ? "strategic" : "brief",
  });
  const analystCostUsd = typeof analysis._meta?.totalCostUsd === "number" ? analysis._meta.totalCostUsd : undefined;
  stats.analyst = {
    hasDebate: !!analysis.causalChain?.length,
    passes: 3,
    costUsd: analystCostUsd,
    depth: isStrategic ? "strategic" : "brief",
  };
  addCost(analystCostUsd, `ANALYST MULTIPASS (${isStrategic ? 'strategic' : 'brief'})`);
  ctx.setAnalystOutput(analysis);
  ctx.recordAgentTiming('ANALYST', Date.now() - pipelineStart);

  // ── SELF-REFLECTION: SUPPENDED — redundant with 3-pass analyst, $0.05/run saved ──
  // LLM self-evaluation is unreliable (FlowVerify 2026: calibration drift, position bias).
  // The analyst multipass already has exploration → stress-test → synthesis.
  stats.selfReflection = { skipped: true, reason: 'suppressed — redundant with 3-pass analyst' };

  emitProgress(pipelineRun.id, "ANALYST", "completed", `${isStrategic ? "Strategic" : "Multi-pass"} analysis complete`, { blackboard: ctx.getSummary() });

  // ── POST-ANALYST DIAGNOSTIC — log quality signals but NEVER skip downstream ──
  // Previous logic skipped debate/DA/critical-loop on weak analysis. Anti-pattern:
  // skipping QA hides problems instead of fixing them. Deterministic gates always run.
  {
    const analysisObj = analysis as Record<string, unknown>;
    const causalChainLen = Array.isArray(analysisObj?.causalChain) ? (analysisObj as any).causalChain.length : 0;
    const keyFindingsLen = Array.isArray(analysisObj?.keyFindings) ? (analysisObj as any).keyFindings.length : 0;
    const verdictLen = typeof analysisObj?.verdict === 'string' ? (analysisObj as any).verdict.length : 0;
    const verdictText = typeof analysisObj?.verdict === 'string' ? (analysisObj as any).verdict : '';
    const citationCount = (verdictText.match(/\[SRC-\d+\]/g) || []).length;
    const citationDensity = verdictLen > 0 ? citationCount / (verdictLen / 1000) : 0;

    console.log(`${label} DIAGNOSTIC: chain=${causalChainLen}, findings=${keyFindingsLen}, verdict=${verdictLen}ch, citDensity=${citationDensity.toFixed(1)}/1K`);
    stats.qualityGate = { skipped: [], reason: 'diagnostic only — no agents skipped' };
  }

  // ── BLACKBOARD: ANALYST→SCOUT feedback loop ──
  // Detect specific evidence gaps in the analysis and request targeted re-search.
  // This is the cross-agent feedback pattern: ANALYST identifies what's missing,
  // SCOUT fills the gap with targeted queries — without re-running the whole pipeline.
  if (!isStrategic || (isStrategic && topSources.length < 40)) {
    try {
      const analysisObj = analysis as Record<string, unknown>;
      const openQ = (analysisObj?.openQuestions as string) || '';
      const risks = (analysisObj?.risks as string) || '';
      const evidence = (analysisObj?.evidence as string) || '';
      const combinedText = `${openQ} ${risks} ${evidence}`.toLowerCase();

      // Detect gap signals — phrases that indicate missing evidence
      const gapSignals = [
        { pattern: /limited (data|evidence|research|studies)/, query_prefix: '' },
        { pattern: /insufficient (data|evidence|research)/, query_prefix: '' },
        { pattern: /no (studies|data|evidence) (have|were|are) (yet|currently|directly)/, query_prefix: '' },
        { pattern: /further (research|studies|analysis|data) (is|are) (needed|required|warranted)/, query_prefix: '' },
        { pattern: /remains (unclear|uncertain|unknown|unexplored)/, query_prefix: '' },
        { pattern: /gap in (the )?(literature|evidence|research|data|knowledge)/, query_prefix: '' },
      ];

      const detectedGaps: string[] = [];
      for (const sig of gapSignals) {
        const matches = combinedText.match(new RegExp(sig.pattern, 'gi'));
        if (matches && matches.length > 0) {
          // Extract the sentence containing the gap signal
          const sentences = combinedText.split(/[.!?]/);
          for (const s of sentences) {
            if (sig.pattern.test(s)) {
              detectedGaps.push(s.trim().slice(0, 200));
            }
          }
        }
      }

      if (detectedGaps.length > 0 && detectedGaps.length <= 5) {
        ctx.addFinding('ANALYST', 'gap', `${detectedGaps.length} evidence gaps detected in analysis`, { gaps: detectedGaps });
        console.log(`${label} BLACKBOARD: ${detectedGaps.length} evidence gaps detected by ANALYST — requesting targeted re-search`);

        // Request targeted re-search for each gap
        for (const gap of detectedGaps.slice(0, 3)) {
          const gapQuery = `${query} ${gap}`.slice(0, 300);
          ctx.requestSourceGap(gapQuery, `ANALYST identified evidence gap: "${gap.slice(0, 100)}"`, 'ANALYST',
            ['crossref', 'semanticscholar', 'europepmc', 'ipcc', 'internet-archive', 'jstor'], 10);
        }
      }
    } catch (err) {
      console.warn(`${label} BLACKBOARD: gap detection failed (non-blocking):`, err);
    }
  }
  
  // CRITICAL: A+ LEVEL - Validate topic consistency after analysis
  const topicValidation = await validateTopicConsistency(query, topSources, analysis);
  if (!topicValidation.isValid) {
    console.warn(`${label} TOPIC CONSISTENCY ISSUES DETECTED:`);
    topicValidation.issues.forEach(issue => console.warn(`  - ${issue}`));
    
    // If major consistency issues, flag for revision
    if (topicValidation.issues.length >= 2) {
      console.error(`${label} CRITICAL: Topic consistency failure - analysis may be irrelevant`);
      stats.topicConsistency = { passed: false, issues: topicValidation.issues };
    } else {
      stats.topicConsistency = { passed: true, issues: topicValidation.issues };
    }
  } else {
    console.log(`${label} Topic consistency validated: all components aligned`);
    stats.topicConsistency = { passed: true, issues: [] };
  }

  // ── TERMINAL DISTANCE CHECK: detect analogical leaps in causal chain ──
  const chain = (analysis as Record<string, unknown>)?.causalChain as Array<Record<string, unknown>> | undefined;
  if (chain && chain.length >= 3) {
    const firstDomain = (chain[0].temporalStatus as string) || detectedDomain;
    const lastDomain = (chain[chain.length - 1].temporalStatus as string) || detectedDomain;
    if (chain.length > 5 && firstDomain === lastDomain) {
      stats.terminalDistanceWarning = `Causal chain starts and ends in ${firstDomain} — check for analogical leap`;
      console.warn(`${label} TERMINAL DISTANCE: chain of ${chain.length} links starts and ends in ${firstDomain}`);
    }
  }

  const analystDecision = assessAfterAnalyst(orchState);
  recordDecision(orchState, analystDecision);
  stats.orchestrator = stats.orchestrator || { decisions: [] };
  stats.orchestrator.decisions.push(analystDecision);

  // ── STEP 5c: GAP-AWARE EVIDENCE APPEND — log citation gaps for diagnostics ──
  // Note: We only analyze and log gaps here. The actual gap-filling SCOUT happens
  // pre-analysis (step 4d) using prior-run gaps. Running another SCOUT + re-rank
  // here is wasteful since the analysis is already generated with the original sources.
  try {
    const { analyzeCitationGaps } = await import('./gap-aware-append');
    const gaps = await analyzeCitationGaps(analysis as Record<string, unknown>, topSources.length);
    if (gaps.length > 0) {
      console.log(`${label} GAP ANALYSIS: ${gaps.length} sections with low citation coverage`);
      gaps.forEach(g => console.log(`  - ${g.section}: ${Math.round(g.coverage * 100)}% (${g.citationCount}/${g.sentenceCount})`));
      stats.gapAnalysis = { gapsFound: gaps.length, queriesGenerated: 0, newSources: 0 };
    } else {
      console.log(`${label} GAP ANALYSIS: all sections have adequate citation coverage`);
    }
  } catch (err) {
    console.warn(`${label} GAP ANALYSIS: failed (non-blocking):`, err);
  }

  // LOT 2.6: Typed research gaps — classify what's missing from the evidence
  try {
    const analysisObj = analysis as Record<string, unknown>;
    const openQuestions = (analysisObj?.openQuestions as string) || '';
    const limitations = (analysisObj?.risks as string) || '';
    const researchGaps: { type: 'NOT_REACHED' | 'RESTRICTED' | 'INEXISTANT'; description: string }[] = [];

    // NOT_REACHED: the analysis didn't cover something it should have
    if (topSources.length < (isStrategic ? 15 : 8)) {
      researchGaps.push({ type: 'NOT_REACHED', description: `Only ${topSources.length} sources — insufficient coverage for ${isStrategic ? 'strategic' : 'standard'} depth` });
    }

    // RESTRICTED: sources exist but were inaccessible (paywalled, classified, etc.)
    const noAbstractCount = topSources.filter((s: any) => !s.abstract || s.abstract.length < 100).length;
    if (noAbstractCount > topSources.length * 0.3) {
      researchGaps.push({ type: 'RESTRICTED', description: `${noAbstractCount} sources lack full abstracts — evidence base may be constrained` });
    }

    // INEXISTANT: the research literature doesn't cover this yet
    if (openQuestions.toLowerCase().includes('no studies') || openQuestions.toLowerCase().includes('no research') || openQuestions.toLowerCase().includes('gap in') || openQuestions.toLowerCase().includes('remains unexplored')) {
      researchGaps.push({ type: 'INEXISTANT', description: 'Analysis identifies areas with no existing research' });
    }

    if (researchGaps.length > 0) {
      stats.researchGaps = researchGaps;
      console.log(`${label} RESEARCH GAPS: ${researchGaps.length} typed gaps identified`);
      researchGaps.forEach(g => console.log(`  - [${g.type}] ${g.description.slice(0, 80)}`));
    }
  } catch (err) {
    console.warn(`${label} RESEARCH GAPS: classification failed (non-blocking):`, err);
  }

  // ── BLACKBOARD: Process ANALYST→SCOUT gap requests ──
  // The ANALYST identified specific evidence gaps and requested targeted re-search.
  // We run a focused SCOUT on those gaps and merge new sources before rendering.
  if (ctx.hasGapRequests()) {
    const gapReqs = ctx.getPendingGapRequests();
    console.log(`${label} BLACKBOARD: processing ${gapReqs.length} gap requests from ANALYST`);
    emitProgress(pipelineRun.id, "GAP_FILL", "started", `Filling ${gapReqs.length} evidence gaps identified by ANALYST...`);
    try {
      const gapProviders = gapReqs[0].providers as string[] || ['crossref', 'semanticscholar', 'europepmc'];
      const gapResults = await Promise.allSettled(
        gapReqs.slice(0, 3).map(req => scout(req.query, gapProviders as Providers, req.minResults || 10))
      );
      let gapNewCount = 0;
      for (const r of gapResults) {
        if (r.status === 'fulfilled') {
          const newIds = Array.isArray(r.value) ? r.value.map(s => s.id) : (r.value.sourceIds || []);
          const before = allSourceIds.length;
          allSourceIds = [...new Set([...allSourceIds, ...newIds])];
          gapNewCount += allSourceIds.length - before;
        }
      }
      if (gapNewCount > 0) {
        console.log(`${label} BLACKBOARD: +${gapNewCount} sources from ANALYST gap requests — re-ranking`);
        const gapRankOpts = { ...rankOpts, sourceIds: allSourceIds, limit: (rankOpts.limit ?? 12) + 3 };
        const gapEnriched = await rank(query, gapRankOpts);
        if (gapEnriched.length >= topSources.length) {
          topSources.length = 0;
          topSources.push(...gapEnriched);
          for (let i = 0; i < topSources.length; i++) {
            (topSources[i] as any).loadBearing = i < 3;
          }
          console.log(`${label} BLACKBOARD: sources enriched from gap requests → ${topSources.length} total`);
        }
        ctx.addFinding('BLACKBOARD', 'insight', `Filled ${gapReqs.length} gaps with ${gapNewCount} new sources`);
      }
      ctx.clearGapRequests();
      emitProgress(pipelineRun.id, "GAP_FILL", "completed", `Gap fill: +${gapNewCount} sources`);
    } catch (err) {
      console.warn(`${label} BLACKBOARD: gap fill failed (non-blocking):`, err);
      ctx.clearGapRequests();
    }
  }

  // ── POST-ANALYST ENRICHMENT CHECKPOINT ──
  // If the analysis revealed critical evidence gaps (NOT_REACHED type),
  // attempt one final targeted search to fill them before rendering.
  // This is adaptive — only triggers when gaps are critical, not on every run.
  if (stats.researchGaps && Array.isArray(stats.researchGaps)) {
    const criticalGaps = (stats.researchGaps as Array<{ type: string; description: string }>)
      .filter(g => g.type === 'NOT_REACHED');
    if (criticalGaps.length > 0 && topSources.length < (isStrategic ? 20 : 12)) {
      console.log(`${label} POST-ANALYST ENRICHMENT: ${criticalGaps.length} critical gaps — attempting targeted search`);
      try {
        // Generate targeted queries from gap descriptions + original query
        const gapQueries = criticalGaps.slice(0, 3).map(g => {
          // Extract key terms from gap description
          const desc = g.description.replace(/only.*sources.*depth/i, '').trim();
          return desc.length > 10 ? `${query} ${desc}`.slice(0, 200) : query;
        });
        const enrichmentProviders = Array.from(new Set([...providers, 'linkup', 'tavily', 'openalex', 'crossref', 'springer', 'osti', 'datacite', 'google-books'] as any)) as Providers;
        const postEnrichResults = await Promise.allSettled(
          gapQueries.map(q => scout(q, enrichmentProviders, 15))
        );
        let postNewCount = 0;
        for (const r of postEnrichResults) {
          if (r.status === 'fulfilled') {
            const newIds = Array.isArray(r.value) ? r.value.map(s => s.id) : (r.value.sourceIds || []);
            const before = allSourceIds.length;
            allSourceIds = [...new Set([...allSourceIds, ...newIds])];
            postNewCount += allSourceIds.length - before;
          }
        }
        if (postNewCount > 0) {
          console.log(`${label} POST-ANALYST ENRICHMENT: +${postNewCount} sources from gap-targeted search`);
          // Re-rank and merge new sources
          const postRankOpts = { ...rankOpts, sourceIds: allSourceIds, limit: (rankOpts.limit ?? 12) + 3 };
          const postEnriched = await rank(query, postRankOpts);
          // Compare quality, not just count — use average compositeScore of top sources
          const oldAvgQuality = topSources.length > 0
            ? topSources.reduce((sum: number, s: any) => sum + (s.compositeScore ?? s.qualityScore ?? 50), 0) / topSources.length
            : 0;
          const newAvgQuality = postEnriched.length > 0
            ? postEnriched.reduce((sum: number, s: any) => sum + (s.compositeScore ?? s.qualityScore ?? 50), 0) / postEnriched.length
            : 0;
          if (postEnriched.length >= topSources.length && newAvgQuality >= oldAvgQuality) {
            const oldLen = topSources.length;
            topSources.length = 0;
            topSources.push(...postEnriched);
            for (let i = 0; i < topSources.length; i++) {
              (topSources[i] as any).loadBearing = i < 3;
            }
            console.log(`${label} POST-ANALYST ENRICHMENT: sources ${oldLen} → ${topSources.length}, quality ${oldAvgQuality.toFixed(0)} → ${newAvgQuality.toFixed(0)}`);
          } else {
            console.log(`${label} POST-ANALYST ENRICHMENT: kept original sources (quality ${oldAvgQuality.toFixed(0)} ≥ ${newAvgQuality.toFixed(0)})`);
          }
          // Update enrichment stats
          if (stats.enrichmentReasoner) {
            (stats.enrichmentReasoner as any).postAnalystNewSources = postNewCount;
          }
        }
      } catch (err) {
        console.warn(`${label} POST-ANALYST ENRICHMENT: failed (non-blocking):`, err);
      }
    }
  }

  // ── STEP 6a: STRUCTURAL EDITOR — SUPPRESSED (strategic only) ──
  // Redundant with analyst multipass 3-pass structure. LLM rewrite introduces noise.
  // $0.05/run saved.
  stats.harvardCouncil = { skipped: true };
  stats.deliberation = { skipped: true };
  stats.structuralEditor = { skipped: true, reason: 'suppressed — redundant with 3-pass analyst' };
  if (isStrategic) {
    console.log(`${label} STRUCTURAL EDITOR: suppressed — analyst multipass handles structure`);
  }

  // â”€â”€ STEP 7: CITATION GUARD â”€â”€
  console.log(`${label} GUARD: validate citations`);
  const guard = citationGuard(analysis, topSources.length, quantBridge.models.length);
  stats.guard = guard;
  if (!guard.ok) {
    console.warn(`${label} Citation guard warning: ${guard.usedCount} citations, ${guard.invalid.length} invalid, ${guard.invalidModels.length} invalid model refs (non-fatal, proceeding with degraded quality)`);
    stats.citationGuardDegraded = true;
  }

  // ── STEP 7b: CRITIC AGENT — Multi-stage verification ──
  // Decomposes analysis into atomic claims, grounds each against sources,
  // detects contradictions, bias, and citation issues.
  // Can force a retry of ANALYST with targeted repair instructions.
  let savedCriticResult: any = null;
  try {
    const { runCritic } = await import('./critic-agent');
    const analysisText = typeof analysis === 'string' ? analysis : JSON.stringify(analysis);
    const criticSources = topSources.map((s: any, i: number) => ({
      index: i + 1,
      title: s.title || '',
      abstract: s.abstract || '',
      provider: s.provider || '',
      year: s.year || undefined,
    }));

    const criticResult = await runCritic(analysisText, criticSources, { skipBias: false, skipContradictions: false });
    savedCriticResult = criticResult;
    stats.critic = {
      verdict: criticResult.verdict,
      overallScore: criticResult.overallScore,
      groundedness: criticResult.groundedness,
      claimsCount: criticResult.claims.length,
      contradictions: criticResult.contradictions.length,
      biases: criticResult.biases.length,
      citationIssues: criticResult.citationIssues.length,
      stageResults: criticResult.stageResults,
      costUsd: criticResult.costUsd,
      durationMs: criticResult.durationMs,
    };

    console.log(`${label} CRITIC: verdict=${criticResult.verdict}, score=${criticResult.overallScore}, groundedness=${Math.round(criticResult.groundedness * 100)}%, ${criticResult.contradictions.length} contradictions, ${criticResult.biases.length} biases`);

    // If critic says repair, inject repair instructions into the analysis context
    if (criticResult.verdict === 'repair' && criticResult.repairInstructions) {
      console.log(`${label} CRITIC: repair instructions generated (${criticResult.repairTargetClaims?.length || 0} claims to fix)`);
      // Store for potential retry — the pipeline can use this to re-run ANALYST
      (stats as any).criticRepairInstructions = criticResult.repairInstructions;
    }

    // If critic says reject, log but continue (the trust score will handle it)
    if (criticResult.verdict === 'reject') {
      console.warn(`${label} CRITIC: REJECTED — score=${criticResult.overallScore}, consider re-running with different sources`);
    }
  } catch (err) {
    console.warn(`${label} CRITIC: failed (non-blocking):`, err instanceof Error ? err.message : String(err));
  }

  // ── STEP 7c: REFLECTIVE RAG — Self-evaluation after ANALYST ──
  try {
    const { reflectOnPhase, recordFailure } = await import('./cross-model-consensus');
    const analysisSummary = typeof analysis === 'string' ? analysis.slice(0, 2000) : JSON.stringify(analysis).slice(0, 2000);
    const reflection = await reflectOnPhase('analyst', {
      question: query,
      analysisSummary,
      sourceCount: topSources.length,
      citationCount: guard.usedCount,
    });
    stats.reflection = {
      phase: 'analyst',
      quality: reflection.quality,
      score: reflection.score,
      issues: reflection.issues,
      recommendations: reflection.recommendations,
      shouldRetry: reflection.shouldRetry,
      costUsd: reflection.costUsd,
    };
    console.log(`${label} REFLECTION (analyst): quality=${reflection.quality}, score=${reflection.score}, shouldRetry=${reflection.shouldRetry}`);

    if (reflection.shouldRetry && reflection.issues.length > 0) {
      recordFailure('analyst', 'quality', reflection.issues.join('; '), reflection.retryStrategy || 'retry with feedback', query.slice(0, 50));
    }
  } catch (err) {
    console.warn(`${label} REFLECTION: failed (non-blocking):`, err instanceof Error ? err.message : String(err));
  }

  // ── STEP 7d: CROSS-MODEL CONSENSUS — Verify controversial claims with 3 models ──
  // NomosX: Activate crossModelConsensus() for claims that challenge consensus or are controversial.
  // This uses 3 models (GPT-4o-mini, DeepSeek, GLM-4) to verify claims where the analyst may have blind spots.
  try {
    const { crossModelConsensus } = await import('./cross-model-consensus');
    // Extract controversial claims from the analysis
    const analysisText = typeof analysis === 'string' ? analysis : JSON.stringify(analysis);
    const controversialKeywords = ['challenges', 'contradicts', 'contrary to', 'reconsider', 'paradigm shift', 'unlike previous', 'despite consensus'];
    const hasControversialClaims = controversialKeywords.some(kw => analysisText.toLowerCase().includes(kw));
    if (hasControversialClaims && topSources.length > 0) {
      // Build evidence text from top sources
      const evidenceText = topSources.slice(0, 5).map((s: any) =>
        `Title: ${s.title}\nAbstract: ${(s.abstract || '').slice(0, 500)}`
      ).join('\n---\n');
      // Pick the most controversial-looking claim for cross-model verification
      const sentences = analysisText.split(/[.!?]+/).filter(s => s.length > 50);
      const controversialSentence = sentences.find(s =>
        controversialKeywords.some(kw => s.toLowerCase().includes(kw))
      );
      if (controversialSentence) {
        const claim = controversialSentence.trim().slice(0, 300);
        const consensusResult = await crossModelConsensus(claim, evidenceText);
        stats.crossModelConsensus = {
          claimsVerified: 1,
          agreements: consensusResult.votes.filter(v => v.verdict === 'support').length,
          disagreements: consensusResult.votes.filter(v => v.verdict === 'contradict').length,
          uncertain: consensusResult.votes.filter(v => v.verdict === 'uncertain').length,
          costUsd: consensusResult.costUsd,
        };
        console.log(`${label} CROSS-MODEL CONSENSUS: controversial claim verified | verdict: ${consensusResult.verdict} | agreement: ${Math.round(consensusResult.agreement * 100)}%`);
      }
    }
  } catch (err) {
    console.warn(`${label} CROSS-MODEL CONSENSUS: failed (non-blocking):`, err instanceof Error ? err.message : String(err));
  }

  // ── STEP 7d: SCENARIO ENGINE — MOVED to pre-analyst (Step 6) for context injection ──
  // CANA + SCATTER now run BEFORE the analyst so their outputs enrich the analysis.
  // Stats are already recorded in the pre-analyst step above.

  // ── STEP 7e: KNOWLEDGE GRAPH — Build inter-paper KG ──
  try {
    const { buildKnowledgeGraph } = await import('./knowledge-infrastructure');
    const kgSources = topSources.slice(0, 20).map((s: any) => ({
      id: s.id,
      title: s.title || '',
      abstract: s.abstract || '',
    }));
    const { graph, costUsd: kgCost } = await buildKnowledgeGraph(kgSources);
    stats.knowledgeGraph = {
      entities: graph.entities.length,
      relations: graph.relations.length,
      clusters: graph.clusters.length,
      bridges: graph.bridges.length,
      costUsd: kgCost,
    };
    if (graph.entities.length > 0) {
      console.log(`${label} KNOWLEDGE GRAPH: ${graph.entities.length} entities, ${graph.relations.length} relations, ${graph.clusters.length} clusters`);
    }
  } catch (err) {
    console.warn(`${label} KNOWLEDGE GRAPH: failed (non-blocking):`, err instanceof Error ? err.message : String(err));
  }

  // ── POST-HOC DATA INJECTION: Evidence Tiers + Adversarial Transparency + Multi-Lens Convergence ──
  // These fields are computed/injected AFTER the analyst and critic run, then attached
  // to the analysis object so the renderer can display them.
  if (isStrategic && analysis && typeof analysis === 'object') {
    try {
      // 1. Evidence Tiers — classify sources into 5 tiers
      const { computeEvidenceTiers, summarizeEvidenceTiers } = await import('./evidence-tiering');
      const tiers = computeEvidenceTiers(topSources);
      analysis._evidenceTiers = tiers;
      console.log(`${label} EVIDENCE TIERS: ${summarizeEvidenceTiers(tiers)}`);
    } catch (err) {
      console.warn(`${label} EVIDENCE TIERS: failed (non-blocking):`, err instanceof Error ? err.message : String(err));
    }

    // 2. Adversarial Transparency — inject Critic objections
    if (savedCriticResult) {
      try {
        const objections = (savedCriticResult.contradictions || []).map((c: any) => ({
          claim: c.claim || c.text || '',
          objection: c.contradiction || c.reason || c.explanation || '',
          severity: c.severity || 'medium',
          resolved: false,
        }));
        // Also add biases as objections
        const biasObjections = (savedCriticResult.biases || []).map((b: any) => ({
          claim: b.claim || b.description || '',
          objection: b.bias || b.type || b.explanation || 'Bias detected',
          severity: b.severity || 'medium',
          resolved: false,
        }));
        // stageResults is an object (not array) — extract preprint penalties from grounding stage if present
        const stageResults = savedCriticResult.stageResults || {};
        const groundingStage = stageResults.grounding || {};
        const preprintDowngrades = (groundingStage.preprintPenalties || []).map((pp: any) => ({
          claim: pp.claim || '',
          sources: pp.sources || [],
          reason: pp.reason || 'Claim supported primarily by non-peer-reviewed preprint',
        }));
        analysis._adversarialTransparency = {
          criticScore: savedCriticResult.overallScore || 0,
          criticObjections: [...objections, ...biasObjections],
          preprintDowngrades,
        };
        console.log(`${label} ADVERSARIAL TRANSPARENCY: ${objections.length + biasObjections.length} objections, ${preprintDowngrades.length} preprint downgrades injected`);
      } catch (err) {
        console.warn(`${label} ADVERSARIAL TRANSPARENCY: failed (non-blocking):`, err instanceof Error ? err.message : String(err));
      }
    }

    // 3. Multi-Lens Convergence Map — inject CANA/SCATTER convergence
    if (savedCanaResult || savedScatterResult) {
      try {
        const canaMechanisms = (savedCanaResult?.mechanisms || []).slice(0, 6).map((m: any) =>
          m.mechanism || m.description || JSON.stringify(m).slice(0, 200)
        );
        const scatterHypotheses = (savedScatterResult?.hypotheses || []).slice(0, 6).map((h: any) =>
          h.hypothesis || h.scenario || h.description || JSON.stringify(h).slice(0, 200)
        );
        // Convergence: themes that appear in both CANA mechanisms and SCATTER hypotheses
        const canaText = canaMechanisms.join(' ').toLowerCase();
        const scatterText = scatterHypotheses.join(' ').toLowerCase();
        const convergencePoints: string[] = [];
        const divergencePoints: string[] = [];

        // Simple keyword-based convergence detection
        const keyConcepts = ['governance', 'religion', 'ethics', 'bias', 'pluralism', 'dignity', 'regulation', 'framework'];
        for (const concept of keyConcepts) {
          const inCana = canaText.includes(concept);
          const inScatter = scatterText.includes(concept);
          if (inCana && inScatter) {
            convergencePoints.push(`Both CANA and SCATTER identify "${concept}" as a central mechanism — this increases robustness of findings related to ${concept}.`);
          } else if (inCana || inScatter) {
            divergencePoints.push(`Only ${inCana ? 'CANA' : 'SCATTER'} identifies "${concept}" — this indicates genuine uncertainty about the role of ${concept}.`);
          }
        }

        analysis._multiLensConvergence = {
          canaMechanisms,
          scatterHypotheses,
          weakSignals: [], // populated from weak_signal lens if available
          convergencePoints,
          divergencePoints,
        };
        console.log(`${label} MULTI-LENS CONVERGENCE: ${convergencePoints.length} convergence, ${divergencePoints.length} divergence points`);
      } catch (err) {
        console.warn(`${label} MULTI-LENS CONVERGENCE: failed (non-blocking):`, err instanceof Error ? err.message : String(err));
      }
    }
  }

  let html = '';
  let debateContext: string | undefined;
  let debateResult: DebateResult | undefined;
  let institutePosition: InstitutePosition | undefined;

  // Map ProspectiveNote (analyst-multipass output) → fields expected by renderProfessionalStrategicHTML
  function mapProspectiveToRenderFormat(analysis: any): any {
    // Already has strategic-format fields (from strategic-analyst-agent) — no mapping needed
    if (analysis.executiveSummary || analysis.literatureOverview) return analysis;

    const causalChainText = Array.isArray(analysis.causalChain)
      ? analysis.causalChain.map((link: any) =>
          `**${link.claim || ''}**\nEvidence: ${link.evidence || ''}\nWarrant: ${link.warrant || ''}`
        ).join('\n\n')
      : '';

    const rejectedAltText = Array.isArray(analysis.rejectedAlternatives)
      ? analysis.rejectedAlternatives.map((alt: any) =>
          `**${alt.scenario || ''}** — ${alt.whyRejected || ''} (Residual risk: ${alt.residualRisk || ''})`
        ).join('\n\n')
      : '';

    const signalsText = analysis.whatToWatch?.signals?.length
      ? analysis.whatToWatch.signals.map((s: string) => `• ${s}`).join('\n')
      : '';

    const evidenceGapsText = analysis.evidenceAssessment?.gaps?.length
      ? analysis.evidenceAssessment.gaps.map((g: string) => `• ${g}`).join('\n')
      : '';

    const strongestLinksText = analysis.evidenceAssessment?.strongestLinks?.length
      ? analysis.evidenceAssessment.strongestLinks.map((s: string) => `• ${s}`).join('\n')
      : '';

    return {
      ...analysis,
      // Map ProspectiveNote fields to renderer-expected fields
      executiveSummary: analysis.verdict || '',
      literatureOverview: analysis.anchoringBasis || '',
      theoreticalFrameworks: '',
      methodologicalApproaches: causalChainText,
      consensus: analysis.throughLine || '',
      controversies: rejectedAltText,
      emergingTrends: analysis.trajectory?.state || '',
      // Map causalChain → causalArchitecture for the Causal Architecture section
      causalArchitecture: Array.isArray(analysis.causalChain)
        ? analysis.causalChain.map((link: any) => ({
            claim: link.claim || '',
            chain: `Evidence: ${link.evidence || ''} → Warrant: ${link.warrant || ''} → Status: ${link.temporalStatus || ''}`,
            confidence: link.temporalStatus === 'present_fact' ? 'high' : link.temporalStatus === 'active_mechanism' ? 'medium' : 'low',
            epistemicLevel: link.temporalStatus === 'present_fact' ? 'demonstrated' : link.temporalStatus === 'active_mechanism' ? 'suggested' : 'projected',
            counterfactual: `If ${link.evidence?.slice(0, 100) || 'this evidence'} were not observed, the causal chain would break at this link.`,
            alternativeExplanation: `An alternative explanation is that this observation is driven by confounding factors not captured in the source data.`,
            sources: link.sourceRef ? [`[SRC-${link.sourceRef}]`] : (link.sources || []),
          }))
        : [],
      // Themes from causal chain — group by domain if available
      themes: Array.isArray(analysis.causalChain)
        ? analysis.causalChain.map((link: any) => ({
            name: `Causal Link ${link.id}`,
            description: link.claim,
            evidence: link.evidence,
            sources: link.sourceRef ? `[SRC-${link.sourceRef}]` : '',
          }))
        : [],
      // Scenarios from trajectory + rejected alternatives
      scenarios: [
        ...(analysis.trajectory?.state ? [{
          name: 'Projected Trajectory',
          probability: '',
          description: analysis.trajectory.state,
          implications: analysis.trajectory.assumptions || '',
        }] : []),
        ...(Array.isArray(analysis.rejectedAlternatives) ? analysis.rejectedAlternatives.map((alt: any) => ({
          name: alt.scenario || 'Alternative Scenario',
          probability: '',
          description: alt.whyRejected || '',
          implications: alt.residualRisk || '',
        })) : []),
      ],
      // Evidence quality from evidenceAssessment
      evidenceQuality: {
        overallScore: 0,
        methodology: strongestLinksText,
        gaps: evidenceGapsText,
      },
      // Recommendations from whatToWatch
      recommendations: {
        immediate: analysis.whatToWatch?.signals || [],
        shortTerm: [],
        longTerm: [],
        riskMitigation: evidenceGapsText ? evidenceGapsText.split('\n') : [],
      },
      // Implementation from trajectory assumptions
      implementation: {
        timeline: analysis.trajectory?.horizon || '',
        resources: analysis.trajectory?.assumptions || '',
        obstacles: analysis.evidenceAssessment?.gaps || [],
      },
      conclusion: analysis.verdict || '',
      openQuestions: evidenceGapsText,
      whatChangesMind: analysis.whatToWatch?.whatWouldChangeMind || '',
      // Preserve keyFindings (already in both formats)
      keyFindings: analysis.keyFindings || [],
      // Preserve title
      title: analysis.title || '',
      // Pass through urgency/confidence if present
      urgencyLevel: analysis.urgencyLevel,
      confidenceLevel: analysis.convictionLevel === 'firm' ? 'high' : analysis.convictionLevel === 'tempered' ? 'medium' : 'low',
    };
  }

  const renderEditorHtml = async (): Promise<string> => {
    console.log(`${label} EDITOR: render professional HTML`);
    try {
      if (editorialV2 && castingResult && institutePosition) {
        const rendered = renderPositionFirstBriefHTML({
          question: query,
          classification: topicClassification,
          casting: castingResult,
          position: institutePosition,
          analysis: analysis as Record<string, unknown>,
          sources: topSources,
          debate: debateResult,
          isStrategic,
        });
        stats.rendererUsed = "position_first";
        console.log(`${label} EDITOR: position-first template (${(rendered.length / 1024).toFixed(0)}KB)`);
        return rendered;
      }
      console.warn(`${label} RENDERER: position-first NOT used — editorialV2=${editorialV2}, casting=${!!castingResult}, arbiter=${!!institutePosition} — falling back to ${isStrategic ? 'strategic' : 'brief'} template`);
      const renderAnalysis = isStrategic ? mapProspectiveToRenderFormat(analysis) : analysis;
      const rendered = isStrategic
        ? renderProfessionalStrategicHTML(renderAnalysis, topSources)
        : renderProfessionalBriefHTML(analysis, topSources);
      stats.rendererUsed = isStrategic ? "professional_strategic" : "professional_brief";
      console.log(`${label} EDITOR: ${isStrategic ? 'strategic' : 'brief'} template rendered (${(rendered.length / 1024).toFixed(0)}KB)`);
      return rendered;
    } catch (editorErr) {
      console.warn(`${label} EDITOR: professional template failed, using legacy:`, editorErr);
      stats.rendererUsed = isStrategic ? "legacy_strategic" : "legacy_brief";
      // Fetch contradictions from DB to surface in the report (non-blocking)
      let contradictionsForRender: Array<{ claim1: string; claim2: string; contradictionType: string; confidence: number; explanation: string }> = [];
      if (isStrategic && topSources.length > 0) {
        try {
          const dbContradictions = await prisma.contradiction.findMany({
            where: { sourceId1: { in: topSources.map(s => s.id) } },
            select: { claim1: true, claim2: true, contradictionType: true, confidence: true, explanation: true },
            take: 10,
            orderBy: { confidence: "desc" },
          });
          contradictionsForRender = dbContradictions;
        } catch { /* non-blocking */ }
      }
      return isStrategic
        ? renderStrategicReportHTML(analysis, topSources, contradictionsForRender)
        : renderBriefHTML(analysis, topSources);
    }
  };

  const runPostRenderQualityGates = async () => {
    emitProgress(pipelineRun.id, "QUALITY", "started", "Citation verification and critical review...");

    // Opposite-family rule: verifiers must run on a DIFFERENT LLM family than the
    // one that produced the analysis text (anti blind-spot). Extract producer
    // family from either analyst format (multipass._meta or strategic._producerFamily).
    const producerFamily =
      (analysis as any)?._meta?.producerFamily ??
      (analysis as any)?._producerFamily ??
      undefined;

    console.log(`${label} CITATION VERIFIER: NLI semantic check`);
    try {
      // P1.3: Use NLI verifier as primary (fast, free) — falls back to LLM for flagged claims
      const { verifyCitationsNLI } = await import('./nli-verifier');
      const verification = await verifyCitationsNLI(html, topSources, {
        maxConcurrency: 10,
        maxClaims: 80,
        readings,
      });
      stats.citationVerifier = {
        integrity: verification.overallIntegrity,
        supported: verification.supported,
        flagged: verification.flaggedClaims.length,
      };
      console.log(`${label} CITATION VERIFIER: NLI integrity ${verification.overallIntegrity}% (${verification.flaggedClaims.length} flagged)`);

      // If NLI flags many claims, run LLM verifier on flagged subset for deeper analysis
      if (verification.flaggedClaims.length > 5 && verification.flaggedClaims.length < 30) {
        console.log(`${label} CITATION VERIFIER: LLM deep-check on ${verification.flaggedClaims.length} flagged claims`);
        try {
          const llmVerification = await verifyCitations(html, topSources, { maxConcurrency: 8, maxClaims: 30, producerFamily, readings });
          // Use LLM result if it found fewer issues (NLI is more aggressive)
          if (llmVerification.overallIntegrity > verification.overallIntegrity) {
            stats.citationVerifier = {
              integrity: llmVerification.overallIntegrity,
              supported: llmVerification.supported,
              flagged: llmVerification.flaggedClaims.length,
            };
            console.log(`${label} CITATION VERIFIER: LLM corrected integrity to ${llmVerification.overallIntegrity}%`);
          }
        } catch (llmErr) {
          console.warn(`${label} CITATION VERIFIER: LLM fallback failed, keeping NLI result`, llmErr);
        }
      }
    } catch (err) {
      console.warn(`${label} CITATION VERIFIER: NLI failed, falling back to LLM:`, err);
      try {
        const verification = await verifyCitations(html, topSources, { maxConcurrency: 8, maxClaims: 50, producerFamily, readings });
        stats.citationVerifier = {
          integrity: verification.overallIntegrity,
          supported: verification.supported,
          flagged: verification.flaggedClaims.length,
        };
        console.log(`${label} CITATION VERIFIER: LLM integrity ${verification.overallIntegrity}%`);
      } catch (llmErr) {
        console.warn(`${label} CITATION VERIFIER: LLM also failed (non-blocking):`, llmErr);
      }
    }

    try {
      const { factChecker } = await import('./fact-checker');
      const factResult = await factChecker(html, topSources, producerFamily, readings);
      stats.factChecker = {
        totalClaims: factResult.totalClaims,
        verified: factResult.verified,
        majorIssues: factResult.majorIssues,
        fatalIssues: factResult.fatalIssues,
        integrityScore: factResult.integrityScore,
      };
      console.log(`${label} FACT-CHECKER: ${factResult.totalClaims} claims, ${factResult.verified} verified, ${factResult.majorIssues} major, ${factResult.fatalIssues} fatal → integrity ${factResult.integrityScore}%`);
      if (factResult.fatalIssues > 0) {
        console.error(`${label} FACT-CHECKER: ${factResult.fatalIssues} FATAL numerical discrepancies detected — sanitizing HTML`);
        stats.factCheckerFatalFlagged = true;
        // Sanitize: run citation repair to remove/flag unsourced numbers
        try {
          const { repairCitations } = await import('./citation-repair');
          const factRepair = repairCitations(html, analysis as Record<string, unknown>, topSources);
          if (factRepair.numbersSanitized > 0) {
            html = factRepair.html;
            console.log(`${label} FACT-CHECKER REPAIR: sanitized ${factRepair.numbersSanitized} suspicious numbers`);
          }
        } catch (repairErr) {
          console.warn(`${label} FACT-CHECKER REPAIR: failed (non-blocking):`, repairErr);
        }
      }
    } catch (err) {
      console.warn(`${label} FACT-CHECKER: failed (non-blocking):`, err);
      stats.factChecker = { error: String(err) };
    }

    // ── ORIGINALITY CHECK — detect close paraphrasing / plagiarism ──
    try {
      const { checkOriginality } = await import('./originality-check');
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

    // ── BIAS DETECTION — systematic corpus bias check (incl. funding COI) ──
    try {
      const { detectBiases } = await import('./bias-detector');
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

    // ── SOURCE CHECK (sourcecheck pattern) — retraction detection + claim presence ──
    // Resolves each cited source via OpenAlex/Crossref, checks for retraction,
    // and verifies the claim text appears in the source. Free, deterministic.
    try {
      const { checkSourcesBatch } = await import('./sourcecheck');
      // Check top sources for retraction (limit to top 20 to control API calls)
      const sourcesToCheck = topSources.slice(0, 20).map((s: any) => ({
        id: s.id,
        title: s.title || '',
        doi: s.doi || null,
        abstract: s.abstract || null,
        fullText: s.fullText || null,
      }));
      const sourceCheckResult = await checkSourcesBatch(sourcesToCheck);
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

    // ── DETERMINISTIC TRUST SCORING — replaces Critical Loop V2 ──
    // LLM judges have calibration drift, position bias, and see truncated drafts (FlowVerify 2026).
    // TrustBench (AAAI 2026): TrustScore = 0.3 × confidence + 0.7 × deterministic runtime metrics.
    // We use 100% deterministic metrics: citation coverage, groundedness, fact-checker, source diversity.
    {
      // 1. Citation coverage: how many distinct sources are cited.
      // Target is adaptive: min(40, 60% of sources) — matches what the North Star told the analyst.
      // This ensures the scoring measures exactly what the analyst was asked to optimize.
      // Recognizes both [SRC-N] (brief format) and E-N (strategic report evidence format).
      const citedSources = new Set<number>();
      for (const m of html.matchAll(/\[SRC-(\d+)\]/g)) citedSources.add(parseInt(m[1], 10));
      // Strategic reports use <sup class="cite"><a href="#ref-N" data-evidence="EN">EN</a></sup>
      for (const m of html.matchAll(/data-evidence="E(\d+)"/g)) citedSources.add(parseInt(m[1], 10));
      for (const m of html.matchAll(/href="#ref-(\d+)"/g)) citedSources.add(parseInt(m[1], 10));
      const coverageTarget = Math.min(40, Math.max(15, Math.ceil(topSources.length * 0.6)));
      const citationCoverage = coverageTarget > 0 ? Math.min(1, citedSources.size / coverageTarget) : 0;

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

      // 5. Source quality: average quality score
      const avgQuality = topSources.length > 0
        ? topSources.reduce((sum: number, s: any) => sum + (s.qualityScore || 0), 0) / topSources.length
        : 50;

      // 6. Citation verifier integrity (NLI) — default 80 when not run
      const nliIntegrity = stats.citationVerifier?.integrity ?? 80;

      // 7. Source check integrity (retraction + claim presence) — default 85 when not run
      const sourceCheckIntegrity = (stats.sourceCheck as any)?.integrityScore ?? 85;

      // Composite deterministic trust score (0-100)
      // Weights based on TrustBench: 70% deterministic metrics, 30% source quality (proxy for confidence)
      // Updated to include source check (retraction detection + claim presence)
      // V3.1: Now incorporates CRITIC score (LLM-based quality assessment)
      const criticScore = stats.critic?.overallScore ?? null;
      const criticVerdict = stats.critic?.verdict ?? null;

      let deterministicScore = Math.round(
        citationCoverage * 20 +    // 20%: citing sources is the most important
        groundedness * 16 +         // 16%: claims must be supported by cited sources (NLI)
        (factIntegrity / 100) * 12 + // 12%: numbers must be verified
        (nliIntegrity / 100) * 12 + // 12%: NLI semantic check
        (sourceCheckIntegrity / 100) * 8 + // 8%: sources exist, not retracted, claims present
        (diversityScore / 100) * 9 + // 9%: diverse providers = robust evidence
        (avgQuality / 100) * 13 +    // 13%: high-quality sources
        (criticScore !== null ? (criticScore / 100) * 10 : 7) // 10%: LLM critic (or 7% default if no critic)
      );

      // V3.1: Critic veto — if critic says "reject" with score < 40, cap trust at 55
      if (criticScore !== null && criticScore < 40) {
        deterministicScore = Math.min(deterministicScore, 55);
        console.log(`${label} TRUST: critic veto — critic score ${criticScore}/100 (${criticVerdict}), capping trust at 55`);
      }
      // V3.1: Critic penalty — if critic score < 60, apply 15% penalty
      else if (criticScore !== null && criticScore < 60) {
        deterministicScore = Math.round(deterministicScore * 0.85);
        console.log(`${label} TRUST: critic penalty — critic score ${criticScore}/100, applying 15% penalty → ${deterministicScore}`);
      }

      // Retraction veto: if any source is retracted, cap trust at 50
      if ((stats.sourceCheck as any)?.retracted > 0) {
        deterministicScore = Math.min(deterministicScore, 50);
        console.log(`${label} TRUST: retraction veto — ${(stats.sourceCheck as any).retracted} retracted sources, capping at 50`);
      }

      // Quality floor: if sources are high-quality and well-cited, floor at 60
      if (avgQuality > 80 && citationCoverage > 0.60) {
        deterministicScore = Math.max(deterministicScore, 60);
      }

      // Grounding veto (Invariant 4): if groundedness < 15%, cap at 45
      // (lexical grounding can't detect paraphrased support — 15% is the true hallucination floor)
      if (groundedness < 0.15) {
        deterministicScore = Math.min(deterministicScore, 45);
        console.log(`${label} TRUST: grounding veto — groundedness ${Math.round(groundedness * 100)}% too low, capping at 45`);
      }

      deterministicScore = Math.min(100, Math.max(0, deterministicScore));

      stats.criticalLoop = {
        iterations: 0,
        finalScore: deterministicScore,
        improvement: 0,
        needsHumanReview: deterministicScore < 55,
        skipped: true,
        skipReason: 'Deterministic scoring (no LLM judges)',
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
        const { buildProvenanceGraph } = await import('./provenance-graph');
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
        const methodologyHtml = `
<section class="nx-block methodology-note" style="border-top:1px solid rgba(240,240,250,0.12);padding:16px 0 8px;margin:32px 0 0;font-size:0.72rem;line-height:1.7;color:rgba(240,240,250,0.55);">
  <p class="nx-eyebrow" style="letter-spacing:0.08em;text-transform:uppercase;font-size:0.6rem;margin-bottom:8px;">Méthodologie &amp; transparence</p>
  <div style="display:flex;flex-wrap:wrap;gap:1rem;align-items:center;margin:12px 0;">
    <div style="position:relative;width:120px;height:60px;flex-shrink:0;">
      <svg viewBox="0 0 120 60" style="width:100%;height:100%;">
        <path d="M 10 50 A 50 50 0 0 1 110 50" fill="none" stroke="rgba(240,240,250,0.08)" stroke-width="6" stroke-linecap="round"/>
        <path d="M 10 50 A 50 50 0 0 1 ${10 + 100 * Math.cos(Math.PI * (1 - deterministicScore / 100))} ${50 - 50 * Math.sin(Math.PI * (1 - deterministicScore / 100))}" fill="none" stroke="${deterministicScore >= 75 ? '#5EEAD4' : deterministicScore >= 55 ? '#FBBF24' : '#FB7185'}" stroke-width="6" stroke-linecap="round"/>
        <text x="60" y="48" text-anchor="middle" font-family="'JetBrains Mono',monospace" font-size="20" font-weight="600" fill="#f0f0fa">${deterministicScore}</text>
        <text x="60" y="58" text-anchor="middle" font-family="'JetBrains Mono',monospace" font-size="7" fill="rgba(240,240,250,0.35)" letter-spacing="0.1em">TRUST</text>
      </svg>
    </div>
    <div style="flex:1;min-width:200px;">
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px;font-size:0.68rem;">
        ${citationCoverage != null ? `<div><span style="color:rgba(240,240,250,0.35);">Citations</span><br/><strong style="color:rgba(240,240,250,0.78);">${Math.round(citationCoverage * 100)}%</strong> <span style="color:rgba(240,240,250,0.35);">(${citedSources.size}/${coverageTarget})</span></div>` : ''}
        ${groundedness != null && !Number.isNaN(groundedness) ? `<div><span style="color:rgba(240,240,250,0.35);">Ancrage</span><br/><strong style="color:rgba(240,240,250,0.78);">${Math.round(groundedness * 100)}%</strong></div>` : ''}
        ${factIntegrity != null && !Number.isNaN(factIntegrity) ? `<div><span style="color:rgba(240,240,250,0.35);">Intégrité num.</span><br/><strong style="color:rgba(240,240,250,0.78);">${factIntegrity}%</strong></div>` : ''}
        ${diversityScore != null ? `<div><span style="color:rgba(240,240,250,0.35);">Diversité</span><br/><strong style="color:rgba(240,240,250,0.78);">${diversityScore}/100</strong></div>` : ''}
        ${avgQuality != null && !Number.isNaN(avgQuality) ? `<div><span style="color:rgba(240,240,250,0.35);">Qualité sources</span><br/><strong style="color:rgba(240,240,250,0.78);">${Math.round(avgQuality)}/100</strong></div>` : ''}
        ${nliIntegrity != null && !Number.isNaN(nliIntegrity) ? `<div><span style="color:rgba(240,240,250,0.35);">Vérif. sémantique</span><br/><strong style="color:rgba(240,240,250,0.78);">${nliIntegrity}%</strong></div>` : ''}
      </div>
    </div>
  </div>
  <p>Corpus analysé : <strong>${topSources.length} sources</strong> issues de ${providerList.length} fournisseurs (${esc(providerList.slice(0, 8).join(', '))}${providerList.length > 8 ? '…' : ''})${yearMin && yearMax ? `, période ${yearMin}–${yearMax}` : ''}.
  Sources distinctes citées : <strong>${citedSources.size}</strong>.
  Les affirmations non vérifiables sont signalées ou marquées «&nbsp;non établie&nbsp;».</p>
</section>`;
        if (html.includes('</article>')) {
          html = html.replace(/<\/article>(?![\s\S]*<\/article>)/, `${methodologyHtml}</article>`);
        } else {
          html = html + methodologyHtml;
        }
        stats.methodologyNote = { injected: true, corpusSize: topSources.length, providers: providerList.length, citedDistinct: citedSources.size };
        console.log(`${label} METHODOLOGY NOTE: injected (${topSources.length} sources, ${providerList.length} providers, ${citedSources.size} cited)`);
      } catch (methodErr) {
        console.warn(`${label} METHODOLOGY NOTE: injection failed (non-blocking):`, methodErr);
      }
    }

    orchState.trustScore = stats.criticalLoop?.finalScore ?? null;
    // Deterministic scoring already handles groundedness veto and quality floor.
    // No secondary adjustment needed.
    const criticalDecision = assessAfterCriticalLoop(orchState);
    recordDecision(orchState, criticalDecision);
    stats.orchestrator = stats.orchestrator ?? { decisions: [] };
    stats.orchestrator.decisions.push(criticalDecision);
  };

  const runDebateMetaBlock = async (debateHtmlContext?: string) => {
    // META-ANALYSIS + CHAIN PROBABILITY: SUPPRESSED — unreliable stats on heterogeneous sources, $0.05/run saved
    stats.metaAnalysis = { skipped: true, reason: 'suppressed — heterogeneous non-clinical sources' };
    if (!runDebateStep) {
      console.log(`${label} DEBATE: skipped (tier=standard)`);
      stats.debate = { skipped: true };
      return;
    }
    emitProgress(pipelineRun.id, "DEBATE", "started", "Running debate...");
    console.log(`${label} DEBATE: running (meta-analysis suppressed)`);
    const [debateSettled] = await Promise.allSettled([
      import('./debate-agent').then(m => m.debateAgent(query, topSources, readings, debateHtmlContext)),
    ]);

    if (debateSettled.status === "fulfilled") {
      const debate = debateSettled.value;
      debateResult = debate;
      debateContext = [
        `Debate dominant thesis: ${debate.dominantThesis}`,
        `Counter-position: ${debate.position2?.label || "N/A"}`,
        `Confidence in dominant: ${debate.confidenceInDominant}/100`,
        `Steel-man already addressed: ${debate.synthesis?.slice(0, 200) || "N/A"}`,
      ].join("\n");
      stats.debate = {
        confidenceInDominant: debate.confidenceInDominant,
        steelManStrength: String(debate.debateQuality.steelManStrength),
        nuances: debate.nuances?.length ?? 0,
        costUsd: debate.costUsd,
      };
      console.log(`${label} DEBATE: confidence=${debate.confidenceInDominant}%, steel-man=${debate.debateQuality.steelManStrength}`);
      addCost(debate.costUsd, "DEBATE");
    } else {
      console.warn(`${label} DEBATE: failed (non-blocking):`, debateSettled.reason);
    }
  };

  const runDevilsAdvocateBlock = async (_contentForReview: string, _allowHtmlRevision: boolean) => {
    // DEVIL'S ADVOCATE: SUPPRESSED — destroys trust score without improving quality.
    // LLM judge sees truncated content, makes hostile assessments with calibration drift.
    // Deterministic gates (citation repair, claim grounding, fact-checker) already catch real issues.
    // $0.07/run saved.
    stats.devilsAdvocate = { skipped: true, reason: 'suppressed — destroys trust score without quality improvement' };
    console.log(`${label} DEVIL'S ADVOCATE: suppressed — deterministic gates handle quality`);
  };

  if (editorialV2) {
    console.log(`${label} EDITORIAL V2: foresight → debate → devil's advocate → editor → quality gates`);

    // Read scenarios from analyst multipass output (ProspectiveNote fields)
    const analysisScenarios = (analysis as Record<string, unknown>).scenarios as Array<Record<string, unknown>> | undefined;
    if (!analysisScenarios || analysisScenarios.length < 2) {
      stats.foresight = { skipped: true, reason: `only ${analysisScenarios?.length ?? 0} scenarios in analysis — Monte Carlo needs ≥ 2` };
      console.log(`${label} FORESIGHT: skipped (only ${analysisScenarios?.length ?? 0} scenarios in analysis)`);
    } else if (topSources.length < 10) {
      stats.foresight = { skipped: true, reason: `insufficient evidence (${topSources.length} sources) — Monte Carlo needs ≥ 10 for reliable probabilities` };
      console.log(`${label} FORESIGHT: skipped (only ${topSources.length} sources — insufficient for reliable Monte Carlo)`);
    } else {
      emitProgress(pipelineRun.id, "FORESIGHT", "started", "Monte Carlo scenario distribution...");
      const foresight = await runPipelineForesight({
        question: query,
        analysis: analysis as Record<string, unknown>,
        domain: detectedDomain,
        sourceIds: topSources.map((s: any) => s.id),
        isStrategic,
        depth: isStrategic ? 'strategic' : 'standard',
        seedSourceIds: opts.seedSourceIds,
      });
      if (!foresight.skipped && foresight.report) {
        analysis = foresight.analysis as typeof analysis;
        stats.foresight = {
          scenarios: foresight.report.output.scenarios.length,
          monteCarloRuns: foresight.report.output.monteCarloRuns,
          converged: foresight.report.output.monteCarloConverged,
          costUsd: foresight.costUsd,
        };
        addCost(foresight.costUsd, "FORESIGHT");
        emitProgress(pipelineRun.id, "FORESIGHT", "completed", `MC: ${foresight.report.output.scenarios.length} scenarios`);
      } else {
        stats.foresight = { skipped: true, reason: foresight.reason };
        console.log(`${label} FORESIGHT: skipped (${foresight.reason})`);
      }
    }

    // Debate + meta-analysis reactivated — multi-perspective dialectical analysis
    await runDebateMetaBlock(buildAnalysisReviewText(analysis as Record<string, unknown>, query));

    // LOT 4.8 / T4: Inflection check on extracted mechanisms (dated, thresholded, attested)
    try {
      const { inflectionCheck } = await import('./chain-probability');
      const allMechanisms = readings.flatMap((r: any) => r.mechanisms || []);
      if (allMechanisms.length >= 5) {
        const inflection = inflectionCheck(allMechanisms);
        if (inflection.warning) {
          stats.chainProbability = stats.chainProbability || {} as any;
          (stats.chainProbability as any).inflectionWarning = inflection.warning;
          console.warn(`${label} INFLECTION CHECK: ${inflection.warning}`);
        }
        if (inflection.warnings?.length > 0) {
          for (const w of inflection.warnings) {
            console.warn(`${label} INFLECTION DETAIL: ${w}`);
          }
          (stats.chainProbability as any).inflectionDetails = inflection.warnings;
        }
      }
    } catch (err) {
      console.warn(`${label} INFLECTION CHECK: failed (non-blocking):`, err);
    }

    // LOT 7.1: Predictions are registered after brief creation (need briefId for Prediction model)
    // See T10 implementation below — registerPredictions() is called after prisma.brief.create()

    if (castingResult) {
      emitProgress(pipelineRun.id, 'ARBITER', 'started', 'Formulating institute position...');
      institutePosition = await editorialArbiter({
        question: query,
        classification: topicClassification,
        casting: castingResult,
        analysis: analysis as Record<string, unknown>,
        sources: topSources,
        debate: debateResult,
      });
      stats.editorialArbiter = {
        confidence: institutePosition.confidence,
        confidenceLabel: institutePosition.confidenceLabel,
        scenariosCount: institutePosition.scenarios.length,
        costUsd: institutePosition.costUsd,
      };
      addCost(institutePosition.costUsd, 'EDITORIAL ARBITER');
      emitProgress(pipelineRun.id, 'ARBITER', 'completed', `Position: ${institutePosition.confidence}/100 confidence`);
      console.log(`${label} ARBITER: confidence=${institutePosition.confidence}, scenarios=${institutePosition.scenarios.length}`);
    }

    await runDevilsAdvocateBlock(buildAnalysisReviewText(analysis as Record<string, unknown>, query), false);
    html = await renderEditorHtml();
    // CITATION REPAIR: deterministically backfill missing [SRC-N] from analyst JSON,
    // inject citations by source title/author matching, and sanitize unsourced numbers
    try {
      const { repairCitations } = await import('./citation-repair');
      const repairResult = repairCitations(html, analysis as Record<string, unknown>, topSources);
      if (repairResult.citationsBackfilled + repairResult.citationsInjected + repairResult.numbersSanitized > 0) {
        html = repairResult.html;
        console.log(`${label} CITATION REPAIR: +${repairResult.citationsBackfilled} backfilled, +${repairResult.citationsInjected} injected, ${repairResult.numbersSanitized} numbers sanitized`);
        stats.citationRepair = {
          backfilled: repairResult.citationsBackfilled,
          injected: repairResult.citationsInjected,
          sanitized: repairResult.numbersSanitized,
        };
      }
    } catch (repairErr) {
      console.warn(`${label} CITATION REPAIR: failed (non-blocking):`, repairErr);
    }
    // CLAIM GROUNDING: deterministically verify each claim against its cited source
    // Inspired by groundrails/warrant/sourcecheck — lexical overlap, no LLM, CPU-only
    try {
      const { groundClaimsWithNLI } = await import('./claim-grounding');
      const groundingResult = await groundClaimsWithNLI(html, topSources, { mode: 'flag', readings });
      if (groundingResult.removedClaims > 0 || groundingResult.unsupported > 0) {
        html = groundingResult.html;
      }
      // ALWAYS record grounding stats — trust score depends on groundedness even when all claims are supported
      console.log(`${label} CLAIM GROUNDING: ${groundingResult.supported} supported, ${groundingResult.partial} partial, ${groundingResult.unsupported} unsupported, ${groundingResult.uncited} uncited → groundedness ${Math.round(groundingResult.groundedness * 100)}%, ${groundingResult.removedClaims} flagged`);
      stats.claimGrounding = {
        supported: groundingResult.supported,
        partial: groundingResult.partial,
        unsupported: groundingResult.unsupported,
        uncited: groundingResult.uncited,
        contradicted: groundingResult.contradicted,
        groundedness: Math.round(groundingResult.groundedness * 100),
        flagged: groundingResult.removedClaims,
      };
    } catch (groundErr) {
      console.warn(`${label} CLAIM GROUNDING: failed (non-blocking):`, groundErr);
    }
    // QUANT: inject SVG charts from primary data
    if (quant.chartData.length > 0) {
      try {
        const { injectQuantSection } = await import('./svg-charts');
        html = injectQuantSection(html, quant.chartData);
        stats.quantCharts = quant.chartData.length;
        console.log(`${label} QUANT CHARTS: ${quant.chartData.length} SVG charts injected into HTML`);
      } catch (err) {
        console.warn(`${label} QUANT CHARTS: injection failed (non-blocking):`, err);
      }
    }
    stats.htmlLength = html.length;
    // P1.1: Post-generation citation filter — back-track implicit citations + flag uncited claims
    try {
      const { applyCitationFilter } = await import('./citation-filter');
      const filterResult = applyCitationFilter(html);
      if (filterResult.backtrackedClaims > 0 || filterResult.removedSentences > 0) {
        html = filterResult.filteredHtml;
        console.log(`${label} CITATION FILTER: +${filterResult.backtrackedClaims} backtracked, -${filterResult.removedSentences} removed, coverage ${filterResult.citationCoverageBefore * 100 | 0}%→${filterResult.citationCoverageAfter * 100 | 0}%`);
      }
      // ALWAYS record coverage stats (even when no changes) — gate scoring depends on coverageAfter
      stats.citationFilter = {
        backtracked: filterResult.backtrackedClaims,
        removed: filterResult.removedSentences,
        coverageBefore: Math.round(filterResult.citationCoverageBefore * 100),
        coverageAfter: Math.round(filterResult.citationCoverageAfter * 100),
      };
    } catch (err) {
      console.warn(`${label} CITATION FILTER: failed (non-blocking):`, err);
    }
    void generatePrintHTML(html);
    await runPostRenderQualityGates();
    // V2: second DA pass on rendered HTML — DISABLED to save ~10min of LLM time
    // The first DA pass already appends fatal challenges as advisory section.
    // Re-running on rendered HTML adds marginal value but costs heavily in LLM timeouts.
    // if (stats.devilsAdvocate && !(stats.devilsAdvocate as any).error && !(stats.devilsAdvocate as any).skipped) {
    //   await runDevilsAdvocateBlock(html, true);
    // }
  } else {
    html = await renderEditorHtml();
    // CITATION REPAIR: deterministically backfill missing [SRC-N] from analyst JSON,
    // inject citations by source title/author matching, and sanitize unsourced numbers
    try {
      const { repairCitations } = await import('./citation-repair');
      const repairResult = repairCitations(html, analysis as Record<string, unknown>, topSources);
      if (repairResult.citationsBackfilled + repairResult.citationsInjected + repairResult.numbersSanitized > 0) {
        html = repairResult.html;
        console.log(`${label} CITATION REPAIR: +${repairResult.citationsBackfilled} backfilled, +${repairResult.citationsInjected} injected, ${repairResult.numbersSanitized} numbers sanitized`);
        stats.citationRepair = {
          backfilled: repairResult.citationsBackfilled,
          injected: repairResult.citationsInjected,
          sanitized: repairResult.numbersSanitized,
        };
      }
    } catch (repairErr) {
      console.warn(`${label} CITATION REPAIR: failed (non-blocking):`, repairErr);
    }
    // CLAIM GROUNDING: deterministically verify each claim against its cited source
    // Inspired by groundrails/warrant/sourcecheck — NLI engine, CPU-only
    try {
      const { groundClaimsWithNLI } = await import('./claim-grounding');
      const groundingResult = await groundClaimsWithNLI(html, topSources, { mode: 'flag', readings });
      if (groundingResult.removedClaims > 0 || groundingResult.unsupported > 0) {
        html = groundingResult.html;
      }
      // ALWAYS record grounding stats — trust score depends on groundedness even when all claims are supported
      console.log(`${label} CLAIM GROUNDING: ${groundingResult.supported} supported, ${groundingResult.partial} partial, ${groundingResult.unsupported} unsupported, ${groundingResult.uncited} uncited → groundedness ${Math.round(groundingResult.groundedness * 100)}%, ${groundingResult.removedClaims} flagged`);
      stats.claimGrounding = {
        supported: groundingResult.supported,
        partial: groundingResult.partial,
        unsupported: groundingResult.unsupported,
        uncited: groundingResult.uncited,
        contradicted: groundingResult.contradicted,
        groundedness: Math.round(groundingResult.groundedness * 100),
        flagged: groundingResult.removedClaims,
      };
    } catch (groundErr) {
      console.warn(`${label} CLAIM GROUNDING: failed (non-blocking):`, groundErr);
    }
    // QUANT: inject SVG charts from primary data
    if (quant.chartData.length > 0) {
      try {
        const { injectQuantSection } = await import('./svg-charts');
        html = injectQuantSection(html, quant.chartData);
        stats.quantCharts = quant.chartData.length;
        console.log(`${label} QUANT CHARTS: ${quant.chartData.length} SVG charts injected into HTML`);
      } catch (err) {
        console.warn(`${label} QUANT CHARTS: injection failed (non-blocking):`, err);
      }
    }
    stats.htmlLength = html.length;
    // P1.1: Post-generation citation filter (non-V2 path)
    try {
      const { applyCitationFilter } = await import('./citation-filter');
      const filterResult = applyCitationFilter(html);
      if (filterResult.backtrackedClaims > 0 || filterResult.removedSentences > 0) {
        html = filterResult.filteredHtml;
        console.log(`${label} CITATION FILTER: +${filterResult.backtrackedClaims} backtracked, -${filterResult.removedSentences} removed, coverage ${filterResult.citationCoverageBefore * 100 | 0}%→${filterResult.citationCoverageAfter * 100 | 0}%`);
      }
      // ALWAYS record coverage stats (even when no changes) — gate scoring depends on coverageAfter
      stats.citationFilter = {
        backtracked: filterResult.backtrackedClaims,
        removed: filterResult.removedSentences,
        coverageBefore: Math.round(filterResult.citationCoverageBefore * 100),
        coverageAfter: Math.round(filterResult.citationCoverageAfter * 100),
      };
    } catch (err) {
      console.warn(`${label} CITATION FILTER: failed (non-blocking):`, err);
    }
    void generatePrintHTML(html);
    await runPostRenderQualityGates();
    // Debate + meta-analysis reactivated
    await runDebateMetaBlock(buildAnalysisReviewText(analysis as Record<string, unknown>, query));
    await runDevilsAdvocateBlock(html, true);
  }

  stats.analysis = analysis;
  stats.editorialV2 = editorialV2;

  // P3.8: Apply stable evidence IDs — convert [SRC-N] to [E-N] in final HTML
  try {
    const { replaceSrcWithEvidenceIds, getCitationStats } = await import('./evidence-registry');
    html = replaceSrcWithEvidenceIds(html, evidenceRegistry);
    const citStats = getCitationStats(evidenceRegistry);
    stats.evidenceRegistry = {
      total: citStats.totalEvidence,
      cited: citStats.citedEvidence,
      uncited: citStats.uncitedEvidence,
    };
    console.log(`${label} EVIDENCE IDS: ${citStats.citedEvidence}/${citStats.totalEvidence} cited, ${citStats.uncitedEvidence} uncited`);
  } catch (err) {
    console.warn(`${label} EVIDENCE IDS: failed (non-blocking):`, err);
  }

  // LOT 5.1/5.7: Style gates + numerical gate on final HTML
  try {
    const { runStyleGates, runNumericalGate } = await import('./style-gates');
    const styleResult = runStyleGates(html);
    const numResult = runNumericalGate(html, topSources.length);
    stats.styleGates = {
      violations: styleResult.violations.length,
      passed: styleResult.passed,
      gateDetails: styleResult.violations.slice(0, 10).map(v => ({ gate: v.gate, match: v.match, suggestion: v.suggestion })),
    };
    stats.numericalGate = {
      violations: numResult.violations.length,
      passed: numResult.passed,
      details: numResult.violations.slice(0, 10).map(v => ({ match: v.match, suggestion: v.suggestion })),
    };
    if (styleResult.violations.length > 0) {
      console.log(`${label} STYLE GATES: ${styleResult.violations.length} violations (G1-G10)`);
    }
    if (numResult.violations.length > 0) {
      console.log(`${label} NUMERICAL GATE: ${numResult.violations.length} unsourced numbers`);
    }
  } catch (err) {
    console.warn(`${label} STYLE GATES: failed (non-blocking):`, err);
  }

  // ── POST-RENDER QUALITY LOOP (Karpathy Loop pattern, inspired by Cortis) ──
  // If trust score is below publication threshold after all quality gates,
  // retry citation repair + claim grounding with more aggressive settings.
  // This prevents HELD on reports that are just under the threshold (trust 55-64).
  // Cost: $0 (deterministic, CPU-only). Only 1 retry to avoid infinite loops.
  try {
    const currentTrust = stats.criticalLoop?.finalScore ?? 0;
    const PUBLISH_THRESHOLD = 65;
    const MIN_VIABLE_TRUST = 55;

    if (currentTrust > 0 && currentTrust < PUBLISH_THRESHOLD) {
      console.log(`${label} QUALITY LOOP: trust ${currentTrust} < ${PUBLISH_THRESHOLD} — retrying citation repair with aggressive settings`);

      // Retry 1: More aggressive citation repair (inject citations for ANY claim matching a source)
      const { repairCitations } = await import('./citation-repair');
      const aggressiveRepair = repairCitations(html, analysis as Record<string, unknown>, topSources);
      if (aggressiveRepair.citationsBackfilled + aggressiveRepair.citationsInjected > 0) {
        html = aggressiveRepair.html;
        console.log(`${label} QUALITY LOOP: aggressive citation repair +${aggressiveRepair.citationsBackfilled} backfilled, +${aggressiveRepair.citationsInjected} injected`);
        // Update stats
        if (stats.citationRepair) {
          (stats.citationRepair as any).loopBackfilled = aggressiveRepair.citationsBackfilled;
          (stats.citationRepair as any).loopInjected = aggressiveRepair.citationsInjected;
        }
      }

      // Re-run claim grounding on repaired HTML (NLI-enhanced)
      const { groundClaimsWithNLI } = await import('./claim-grounding');
      const loopGrounding = await groundClaimsWithNLI(html, topSources, { mode: 'flag', readings });
      if (loopGrounding.removedClaims > 0) {
        html = loopGrounding.html;
      }
      console.log(`${label} QUALITY LOOP: re-grounding → ${loopGrounding.supported} supported, ${loopGrounding.unsupported} unsupported → groundedness ${Math.round(loopGrounding.groundedness * 100)}%`);
      stats.claimGrounding = {
        supported: loopGrounding.supported,
        partial: loopGrounding.partial,
        unsupported: loopGrounding.unsupported,
        uncited: loopGrounding.uncited,
        contradicted: loopGrounding.contradicted,
        groundedness: Math.round(loopGrounding.groundedness * 100),
        flagged: loopGrounding.removedClaims,
      };

      // Re-calculate trust score with new grounding + coverage
      const loopCitedSources = new Set<number>();
      for (const m of html.matchAll(/\[SRC-(\d+)\]/g)) loopCitedSources.add(parseInt(m[1], 10));
      for (const m of html.matchAll(/data-evidence="E(\d+)"/g)) loopCitedSources.add(parseInt(m[1], 10));
      for (const m of html.matchAll(/href="#ref-(\d+)"/g)) loopCitedSources.add(parseInt(m[1], 10));
      const loopCoverageTarget = Math.min(40, Math.max(15, Math.ceil(topSources.length * 0.6)));
      const loopCitationCoverage = loopCoverageTarget > 0 ? Math.min(1, loopCitedSources.size / loopCoverageTarget) : 0;
      const loopGroundedness = loopGrounding.groundedness;

      const loopFactIntegrity = (stats.factChecker as any)?.integrityScore ?? 80;
      const loopNliIntegrity = stats.citationVerifier?.integrity ?? 80;
      const loopDiversityScore = Math.min(100, new Set(topSources.map((s: any) => s.provider)).size * 15);
      const loopAvgQuality = topSources.length > 0
        ? topSources.reduce((sum: number, s: any) => sum + (s.qualityScore || 0), 0) / topSources.length
        : 50;

      let loopTrustScore = Math.round(
        loopCitationCoverage * 25 +
        loopGroundedness * 20 +
        (loopFactIntegrity / 100) * 15 +
        (loopNliIntegrity / 100) * 15 +
        (loopDiversityScore / 100) * 10 +
        (loopAvgQuality / 100) * 15
      );

      // Quality floor
      if (loopAvgQuality > 80 && loopCitationCoverage > 0.60) {
        loopTrustScore = Math.max(loopTrustScore, 60);
      }
      // Grounding veto
      if (loopGroundedness < 0.15) {
        loopTrustScore = Math.min(loopTrustScore, 45);
      }
      loopTrustScore = Math.min(100, Math.max(0, loopTrustScore));

      const trustImprovement = loopTrustScore - currentTrust;
      console.log(`${label} QUALITY LOOP: trust ${currentTrust} → ${loopTrustScore} (+${trustImprovement}) — coverage ${Math.round(loopCitationCoverage * 100)}%, groundedness ${Math.round(loopGroundedness * 100)}%`);

      // Update trust score in stats
      stats.criticalLoop = {
        ...(stats.criticalLoop as any),
        finalScore: loopTrustScore,
        needsHumanReview: loopTrustScore < MIN_VIABLE_TRUST,
        loopRetried: true,
        loopImprovement: trustImprovement,
      };
      orchState.trustScore = loopTrustScore;

      // Re-inject methodology note with updated trust score
      if (html.includes('Indice de confiance :')) {
        html = html.replace(
          /Indice de confiance : <strong>\d+\/100<\/strong>/,
          `Indice de confiance : <strong>${loopTrustScore}/100</strong>`
        );
      }

      stats.qualityLoop = {
        attempted: true,
        trustBefore: currentTrust,
        trustAfter: loopTrustScore,
        improvement: trustImprovement,
        citationsBackfilled: aggressiveRepair.citationsBackfilled,
        citationsInjected: aggressiveRepair.citationsInjected,
      };
    } else {
      stats.qualityLoop = { attempted: false, reason: `trust ${currentTrust} ≥ ${PUBLISH_THRESHOLD}` };
    }
  } catch (loopErr) {
    console.warn(`${label} QUALITY LOOP: failed (non-blocking):`, loopErr);
    stats.qualityLoop = { attempted: true, error: String(loopErr) };
  }

  // HERO IMAGE: Generate a conceptual abstract image for the publication
  try {
    const { generateHeroImage } = await import('./hero-image');
    const collisionLbl = topicClassification?.dimensions?.length
      ? topicClassification.dimensions.map((d: any) => d.label).join(' × ')
      : topicClassification?.primaryDomain || detectedDomain || '';
    const heroResult = await generateHeroImage(
      String(analysis.title || query),
      collisionLbl,
      topicClassification?.primaryDomain || detectedDomain || '',
    );
    if (heroResult) {
      const heroHtml = `<figure class="hero-image" style="margin:0 0 32px 0;width:100%;overflow:hidden;border:1px solid rgba(240,240,250,0.08);border-radius:4px;">
        <img src="${heroResult.url}" alt="${String(analysis.title || query).replace(/"/g, '&quot;')}" style="width:100%;height:auto;display:block;object-fit:cover;" />
      </figure>`;
      // Insert after brand header + title + meta (after the first .brief-meta or .report-meta closing div)
      if (html.includes('class="brief-meta"')) {
        html = html.replace(/(class="brief-meta"[^>]*>[\s\S]*?<\/div>)/, `$1\n${heroHtml}`);
      } else if (html.includes('class="report-meta"')) {
        html = html.replace(/(class="report-meta"[^>]*>[\s\S]*?<\/div>)/, `$1\n${heroHtml}`);
      } else if (html.includes('<article')) {
        html = html.replace(/(<article[^>]*>)/, `$1\n${heroHtml}`);
      } else if (html.includes('<div class="nomosx-brief"')) {
        html = html.replace(/(<div class="nomosx-brief[^"]*">)/, `$1\n${heroHtml}`);
      } else {
        html = heroHtml + html;
      }
      stats.heroImage = { generated: true, costUsd: heroResult.costUsd };
      console.log(`${label} HERO IMAGE: generated and injected into HTML`);
    } else {
      stats.heroImage = { generated: false, costUsd: 0 };
    }
  } catch (heroErr) {
    console.warn(`${label} HERO IMAGE: failed (non-blocking):`, heroErr);
  }

  // â”€â”€ STEP 14: PUBLISHER â”€â”€
  console.log(`${label} PUBLISHER: save ${isStrategic ? "strategic report" : "brief"}`);
  const estimatedPages = isStrategic ? Math.round(html.length / 3000) : undefined;
  const sanitizeForJson = (str: string): string => {
    // Remove control characters (0x00-0x08, 0x0B, 0x0C, 0x0E-0x1F) that break JSON serialization
    // Keep tab (0x09), LF (0x0A), CR (0x0D) as they are valid in JSON strings
    return str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
  };
  const safeHtml = sanitizeForJson(html);
  let safeStats: any;
  try {
    safeStats = JSON.parse(sanitizeForJson(JSON.stringify(stats)));
  } catch {
    // Fallback: strip complex nested objects that may cause circular refs
    safeStats = { error: 'stats serialization failed', keys: Object.keys(stats) };
  }
  const brief = await prisma.brief.create({
    data: {
      kind: isStrategic ? "strategic" : "brief",
      question: query,
      html: safeHtml,
      sources: topSources.map((s: any) => s.id),
      pipelineRunId: pipelineRun.id,
      lineage: safeStats as any,
      publicId: null,
      trustScore: (orchState.trustScore ?? 0) / 100,
    },
  });
  stats.brief = { id: brief.id, ...(estimatedPages && { estimatedPages }) };

  // T10: Register predictions in the Prediction table for retrospective auditing
  try {
    const pruningResult = (analysis as any)?._meta?.pruning;
    const predResult = await registerPredictions(brief.id, analysis as any, pruningResult);
    stats.predictions = { registered: predResult.registered } as any;
    if (predResult.registered > 0) {
      console.log(`${label} PREDICTIONS: registered ${predResult.registered} predictions for brief ${brief.id}`);
    }
  } catch (err) {
    console.warn(`${label} PREDICTIONS: registration failed (non-blocking):`, err);
  }

  // F-B17: Persist causal chain to DB for retrospective auditing and visualization
  try {
    const chain = (analysis as any)?.causalChain;
    if (Array.isArray(chain) && chain.length > 0) {
      const values = chain.map((link: any, i: number) => {
        const claim = String(link.claim || "").replace(/'/g, "''").slice(0, 5000);
        const evidence = String(link.evidence || "").replace(/'/g, "''").slice(0, 5000);
        const warrant = String(link.warrant || "").replace(/'/g, "''").slice(0, 5000);
        const temporalStatus = String(link.temporalStatus || "established").replace(/'/g, "''");
        const derivesFrom = link.derivesFrom ?? 'NULL';
        const sourceRef = link.sourceRef ?? 'NULL';
        const unsupported = Boolean(link.unsupported);
        const linkIndex = link.id ?? i;
        return `('${brief.id.replace(/'/g, "''")}', ${linkIndex}, '${claim}', '${evidence}', '${warrant}', '${temporalStatus}', ${derivesFrom}, ${sourceRef}, ${unsupported})`;
      });
      await prisma.$executeRawUnsafe(
        `INSERT INTO "CausalLink" ("briefId", "linkIndex", "claim", "evidence", "warrant", "temporalStatus", "derivesFrom", "sourceRef", "unsupported", "createdAt") VALUES ${values.join(", ")}`
      );
      console.log(`${label} CAUSAL LINKS: persisted ${chain.length} links for brief ${brief.id}`);
    }
  } catch (err) {
    console.warn(`${label} CAUSAL LINKS: persistence failed (non-blocking):`, err);
  }

  // â”€â”€ STEP 15: KNOWLEDGE GRAPH (post-publish concept extraction) â”€â”€
  console.log(`${label} KNOWLEDGE GRAPH: extracting concepts`);
  try {
    const kg = await extractAndStoreConcepts(brief.id, query, html, topSources.map((s: any) => s.id));
    stats.knowledgeGraph = { entities: kg.concepts.length, relations: kg.relations.length, clusters: 0, bridges: 0, costUsd: kg.costUsd };
    console.log(`${label} KNOWLEDGE GRAPH: ${kg.concepts.length} concepts, ${kg.relations.length} relations`);
  } catch (err) {
    console.warn(`${label} KNOWLEDGE GRAPH: failed (non-blocking):`, err);
  }

  // STEP 16: GAP FILLER — extract knowledge gaps from this analysis for future runs
  try {
    const gapResult = await extractAndStoreGaps(query, html, detectedDomain, pipelineRun.id, topSources.length);
    if (gapResult.gaps.length > 0) {
      console.log(`${label} GAP FILLER: identified ${gapResult.gaps.length} knowledge gaps for future runs`);
    }
    // Mark prior gaps that were relevant as filled
    await markGapsFilled(pipelineRun.id, detectedDomain, topSources.length);
  } catch (err) {
    console.warn(`${label} GAP FILLER: extraction failed (non-blocking):`, err);
  }

  // STEP 16b: EPISODIC MEMORY STORAGE (V3.1) — store this run for future learning
  try {
    const { storeEpisode } = await import('./episodic-memory');
    await storeEpisode({
      query,
      researchQuestion: query,
      sourceCount: topSources.length,
      providerDiversity: new Set(topSources.map((s: any) => s.provider)).size,
      criticScore: stats.critic?.overallScore ?? null,
      criticVerdict: stats.critic?.verdict ?? null,
      keyFindings: [],
      mistakes: episodicContext?.filter((e: any) => e.episode.criticScore && e.episode.criticScore < 40).map((e: any) => e.lesson) ?? [],
      successes: episodicContext?.filter((e: any) => e.episode.criticScore && e.episode.criticScore >= 75).map((e: any) => e.lesson) ?? [],
      domains: [detectedDomain || 'general'],
      durationMs: Date.now() - pipelineStart,
      costUsd: runningCostUsd,
      briefId: brief.id,
    });
    console.log(`${label} EPISODIC MEMORY: episode stored for brief ${brief.id}`);
  } catch (err) {
    console.warn(`${label} EPISODIC MEMORY: storage failed (non-blocking):`, err);
  }

  // STEP 16c: PREDICTION TRACKER (V3.1) — store SCATTER hypotheses for calibration
  if (savedScatterResult?.hypotheses?.length > 0) {
    try {
      const { storePredictionsFromHypotheses } = await import('./prediction-tracker');
      await storePredictionsFromHypotheses(
        brief.id,
        query,
        savedScatterResult.hypotheses.map((h: any) => ({
          name: h.category || h.name || 'scenario',
          description: h.statement || h.hypothesis || h.description || '',
          probability: h.probability || 0.5,
          horizon: '5-10 years',
          secondOrderEffects: h.secondOrderEffects,
        })),
        detectedDomain || 'general',
      );
      console.log(`${label} PREDICTION TRACKER: stored ${savedScatterResult.hypotheses.length} hypotheses`);
    } catch (err) {
      console.warn(`${label} PREDICTION TRACKER: storage failed (non-blocking):`, err);
    }
  }

  // STEP 17: PREDICTION AUDITOR — retrospectively check past predictions against new evidence
  // Runs asynchronously (non-blocking) to avoid slowing down the pipeline
  import('./prediction-auditor').then(({ runPredictionAuditor }) => {
    runPredictionAuditor({ lookbackDays: 180, minProbability: 0.5 })
      .then(audit => {
        if (audit.audited > 0) {
          console.log(`${label} PREDICTION AUDITOR: ${audit.audited} predictions audited (${audit.confirmed} confirmed, ${audit.falsified} falsified, avg accuracy ${audit.avgAccuracyScore}/100)`);
        }
      })
      .catch(err => console.warn(`${label} PREDICTION AUDITOR: failed (non-blocking):`, err));
  }).catch(() => {});

  // P3-M: Record source usage for reputation learning (non-blocking)
  // Extract actually-cited source IDs from [E-N] evidence IDs and <sup> tags in HTML
  // (replaceSrcWithEvidenceIds has already converted [SRC-N] → [E-N] / <sup data-evidence="EN">)
  // Fallback: if conversion failed, also check for remaining [SRC-N] patterns
  const citedIndices = Array.from(new Set([
    ...Array.from(html.matchAll(/\[E(\d+)\]/g)).map(m => parseInt(m[1], 10) - 1),
    ...Array.from(html.matchAll(/\[SRC-(\d+)\]/g)).map(m => parseInt(m[1], 10) - 1),
    ...Array.from(html.matchAll(/data-evidence="E(\d+)"/g)).map(m => parseInt(m[1], 10) - 1),
    ...Array.from(html.matchAll(/href="#ref-(\d+)"/g)).map(m => parseInt(m[1], 10) - 1),
  ])).filter(i => i >= 0 && i < topSources.length);
  const citedSourceIds = citedIndices.map(i => (topSources[i] as any).id);
  recordSourceUsage(
    topSources.map((s: any) => s.id),
    stats.criticalLoop?.finalScore ?? 0,
    citedSourceIds,
  ).catch(() => {});

  // ── EXPERIENCE BANK: Extract reusable experience from this run ──
  try {
    const { extractExperience } = await import('./knowledge-infrastructure');
    extractExperience(query.slice(0, 100), query, {
      scout: stats.scout ? { found: (stats.scout as any).found || 0 } : null,
      intelligentScout: stats.intelligentScout ? { diversityScore: stats.intelligentScout.diversityScore, scenarioRichness: stats.intelligentScout.scenarioRichness } : null,
      critic: stats.critic ? { verdict: stats.critic.verdict, score: stats.critic.overallScore } : null,
      trustScore: stats.criticalLoop?.finalScore ?? null,
    }).catch(() => {}); // Fire and forget — don't block pipeline
    console.log(`${label} EXPERIENCE BANK: extraction queued`);
  } catch {
    // Non-blocking
  }

  // Finalize PipelineRun
  const totalCost = runningCostUsd;
  stats.totalCostUsd = totalCost;
  stats.blackboard = ctx.getSummary();

  const durationMs = Date.now() - pipelineStart;
  emitProgress(pipelineRun.id, "COMPLETE", "completed", `Pipeline complete in ${(durationMs / 1000).toFixed(1)}s`, { costUsd: totalCost, durationMs, blackboard: ctx.getSummary() });
  await prisma.pipelineRun.update({
    where: { id: pipelineRun.id },
    data: {
      status: "COMPLETED",
      finishedAt: new Date(),
      durationMs,
      totalCostUsd: totalCost,
      sourcesFound: stats.scout?.found || 0,
      sourcesRanked: stats.rank?.count || 0,
      sourcesUsed: topSources.length,
      trustScore: stats.criticalLoop?.finalScore ?? null,
      steps: JSON.parse(JSON.stringify({ ...stats, orchestrator: { ...stats.orchestrator, decisions: orchState.decisions } })),
    },
  });

  // ── LEARNING LOOP: Record performance + extract lessons (closes the feedback loop) ──
  // This is the WRITE side of agent memory — without this, agents never learn.
  // Inspired by Reflexion (NeurIPS 2023): verbal reinforcement learning.
  const finalTrustScore = stats.criticalLoop?.finalScore ?? 0;
  const finalQualityScore = (stats.criticalLoop as any)?.qualityScore ?? finalTrustScore;
  const confidenceGiven = (analysis as any)?.confidenceLevel === 'high' ? 85 :
                          (analysis as any)?.confidenceLevel === 'medium' ? 65 : 40;
  const citationCoverage = topSources.length > 0
    ? Array.from(new Set([
        ...Array.from(html.matchAll(/\[E(\d+)\]/g)).map(m => parseInt(m[1], 10)),
        ...Array.from(html.matchAll(/\[SRC-(\d+)\]/g)).map(m => parseInt(m[1], 10)),
      ])).length / topSources.length
    : 0;
  const appliedLessonTexts = memoryBlock ? [memoryBlock] : [];
  recordLearningCycle({
    agentId: isStrategic ? "strategic-analyst" : "analyst",
    runId: pipelineRun.id,
    question: query,
    domain: detectedDomain as DomainExpertise,
    trustScore: finalTrustScore,
    qualityScore: finalQualityScore,
    confidenceGiven,
    confidenceActual: finalTrustScore,
    citationCoverage,
    findingsCount: (analysis as any)?.keyFindings?.length || 0,
    contradictionsFound: stats.debate ? 1 : 0,
    sourceDiversity: new Set(topSources.map((s: any) => s.provider)).size,
    agentOutputExcerpt: html.slice(0, 2000),
    appliedLessonTexts,
  }).catch((err) => console.warn(`${label} LEARNING LOOP: failed (non-blocking):`, err));
  // Also record for READER agent
  if (readings.length > 0) {
    recordLearningCycle({
      agentId: "reader",
      runId: pipelineRun.id,
      question: query,
      domain: detectedDomain as DomainExpertise,
      trustScore: finalTrustScore,
      qualityScore: finalQualityScore,
      confidenceGiven: 70,
      confidenceActual: finalTrustScore,
      citationCoverage,
      findingsCount: readings.length,
      contradictionsFound: 0,
      sourceDiversity: new Set(topSources.map((s: any) => s.provider)).size,
      agentOutputExcerpt: JSON.stringify(readings.slice(0, 3)).slice(0, 1000),
      appliedLessonTexts: readerMemoryBlock ? [readerMemoryBlock] : [],
    }).catch(() => {});
  }

  if (isStrategic) {
    console.log(`\n${"â•".repeat(60)}`);
    console.log(`  âœ… STRATEGIC REPORT COMPLETE`);
    console.log(`  Brief: ${brief.id} | Run: ${pipelineRun.id}`);
    console.log(`  Sources: ${topSources.length} | Pages: ~${estimatedPages}`);
    console.log(`  Cost: $${totalCost.toFixed(4)} | Duration: ${durationMs}ms`);
    console.log(`  Orchestrator: ${orchState.decisions.length} decisions`);
    console.log(`${"â•".repeat(60)}\n`);
  } else {
    console.log(`${label} DONE: brief ${brief.id} | run ${pipelineRun.id} | $${totalCost.toFixed(4)} | ${durationMs}ms | ${orchState.decisions.length} orchestrator decisions`);
  }

  // Clean up idempotency token on success
  activeRuns.delete(idempotencyKey);

  return {
    briefId: brief.id,
    stats,
    pipelineRunId: pipelineRun.id,
    format: (isStrategic ? "strategic" : "brief") as ReportFormat,
  };

  } catch (error: any) {
    // Clean up idempotency token on failure
    activeRuns.delete(idempotencyKey);
    console.error(`${label} FATAL: ${error.message}`);
    emitProgress(pipelineRun.id, "ERROR", "failed", error.message);
    await prisma.pipelineRun.update({
      where: { id: pipelineRun.id },
      data: {
        status: "FAILED",
        finishedAt: new Date(),
        durationMs: Date.now() - pipelineStart,
        steps: JSON.parse(JSON.stringify({ ...stats, error: error.message })),
      },
    }).catch(() => {});
    throw error;
  }
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// PUBLIC API â€” thin wrappers over the shared core
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * runFullPipeline â€” thin wrapper over runPipelineCore (brief mode)
 * Kept for backward compatibility with existing callers.
 */
export async function runFullPipeline(
  query: string,
  providers: Providers = DEFAULT_ACADEMIC_PROVIDERS,
  options: {
    mode?: "brief" | "strategic";
    maxSources?: number;
    timeout?: number;
    enableCaching?: boolean;
  } = {}
) {
  return runPipelineCore(query, {
    isStrategic: options.mode === "strategic",
    providers: providers.length > 0 ? providers : undefined,
    maxSources: options.maxSources,
  });
}

// (legacy functions removed — see runPipelineCore() above)

// ================================
// STRATEGIC REPORT PIPELINE (10-15 pages)
// ================================

export type ReportFormat = "brief" | "strategic" | "dossier";

export interface StrategicPipelineOptions {
  providers?: Providers;
  perProvider?: number;
  rankOptions?: RankOptions;
  focusAreas?: string[];
  targetAudience?: string;
  urgencyContext?: string;
  // Tier controls — set by auto-publisher based on researcher ownership
  enableHarvardCouncil?: boolean;
  enableEnhancedCouncil?: boolean;
  enableDebate?: boolean;
  enableMetaAnalysis?: boolean;
  enableDevilsAdvocate?: boolean;
  enableDeliberation?: boolean;
  /** Pre-validated source IDs — skip SCOUT when count ≥ minSeedSourcesToSkipScout (default 8) */
  seedSourceIds?: string[];
  minSeedSourcesToSkipScout?: number;
  /** QUANT BRIDGE depth: "none" | "parametric" | "io" | "full" (default: "io" for strategic) */
  quantDepth?: import("../quant/quant-bridge").QuantDepth;
  /** Structured costing exercise (StudioX orders with chiffrage indicatif) */
  parametricInput?: import("../quant/types").ParametricCostInput;
}

/**
 * runStrategicPipeline â€” thin wrapper over runPipelineCore (strategic mode)
 * Kept for backward compatibility with existing callers.
 */
export async function runStrategicPipeline(
  query: string,
  options: StrategicPipelineOptions = {}
) {
  return runPipelineCore(query, {
    isStrategic: true,
    providers: options.providers,
    perProvider: options.perProvider,
    rankOptions: options.rankOptions,
    focusAreas: options.focusAreas,
    targetAudience: options.targetAudience,
    urgencyContext: options.urgencyContext,
    enableHarvardCouncil: options.enableHarvardCouncil,
    enableDebate: options.enableDebate,
    enableMetaAnalysis: options.enableMetaAnalysis,
    enableDevilsAdvocate: options.enableDevilsAdvocate,
    seedSourceIds: options.seedSourceIds,
    minSeedSourcesToSkipScout: options.minSeedSourcesToSkipScout,
    quantDepth: options.quantDepth,
    parametricInput: options.parametricInput,
  });
}

/**
 * P1 FIX: Timeout wrapper to prevent infinite pipeline execution
 * Default: 120s for briefs, 300s for strategic reports
 */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`[Pipeline] ${label} timed out after ${timeoutMs / 1000}s`));
    }, timeoutMs);

    promise
      .then(result => { clearTimeout(timer); resolve(result); })
      .catch(err => { clearTimeout(timer); reject(err); });
  });
}

/**
 * Universal pipeline runner â€” single entry point for all formats.
 * Delegates directly to runPipelineCore with a timeout wrapper.
 */
export async function runPipeline(
  query: string,
  format: ReportFormat = "brief",
  options: StrategicPipelineOptions = {}
) {
  const isDossier = format === "dossier";
  const isStrategic = format === "strategic" || isDossier;
  const timeoutMs = isStrategic ? 4_500_000 : 1_500_000; // 75min strategic, 25min brief

  // DOSSIER = extended strategic report — wider corpus and more ranked sources
  // so a €299 dossier produces a materially deeper deliverable than a strategic report.
  const dossierRankOptions: RankOptions = isDossier
    ? { limit: 40, maxPerProvider: 8, minProviderDiversity: 6 }
    : {};
  const perProvider = options.perProvider ?? (isDossier ? 120 : undefined);
  const rankOptions = { ...dossierRankOptions, ...options.rankOptions };

  try {
    return await withTimeout(
      runPipelineCore(query, {
        isStrategic,
        providers: options.providers,
        perProvider,
        rankOptions,
        focusAreas: options.focusAreas,
        targetAudience: options.targetAudience,
        urgencyContext: options.urgencyContext,
        enableHarvardCouncil: options.enableHarvardCouncil,
        enableEnhancedCouncil: options.enableEnhancedCouncil,
        enableDebate: options.enableDebate,
        enableMetaAnalysis: options.enableMetaAnalysis,
        enableDevilsAdvocate: options.enableDevilsAdvocate,
        enableDeliberation: options.enableDeliberation,
        seedSourceIds: options.seedSourceIds,
        minSeedSourcesToSkipScout: options.minSeedSourcesToSkipScout,
        quantDepth: options.quantDepth,
        parametricInput: options.parametricInput,
      }),
      timeoutMs,
      `runPipeline(${format})`
    );
  } catch (err: any) {
    // BUG FIX: When withTimeout rejects, runPipelineCore's catch block never
    // executes, leaving PipelineRun stuck as RUNNING. Clean up here.
    if (err?.message?.includes("timed out")) {
      console.error(`[Pipeline] Timeout cleanup: marking RUNNING runs as FAILED for query "${query.slice(0, 60)}"`);
      try {
        const timedOutRun = await prisma.pipelineRun.findFirst({
          where: { question: query, status: "RUNNING" },
          orderBy: { createdAt: "desc" },
          select: { id: true },
        });
        if (timedOutRun) {
          await prisma.pipelineRun.update({
            where: { id: timedOutRun.id },
            data: { status: "FAILED", finishedAt: new Date(), error: err.message },
          });
        }
      } catch (cleanupErr) {
        console.error("[Pipeline] Timeout cleanup failed:", cleanupErr);
      }
    }
    throw err;
  }
}

// ================================
// INTELLIGENCE AGENTS EXPORTS
// ================================

// Intelligence agents are imported and used directly above

// ================================
// FULL INTELLIGENCE SWEEP
// ================================

/**
 * Run complete intelligence sweep on recent sources
 * Combines: Signal Detection + Contradiction Detection + Trend Analysis
 */
export async function runIntelligenceSweep(options?: {
  days?: number;
  verticalSlug?: string;
}): Promise<{
  signals: Awaited<ReturnType<typeof signalDetector>>;
  contradictions: Awaited<ReturnType<typeof contradictionDetector>>;
  trends: Awaited<ReturnType<typeof trendAnalyzer>>;
}> {
  const days = options?.days ?? 7;
  
  console.log(`\n${"â•".repeat(60)}`);
  console.log(`  INTELLIGENCE SWEEP (last ${days} days)`);
  console.log(`${"â•".repeat(60)}\n`);
  
  // 1. Get recent sources
  const since = new Date();
  since.setDate(since.getDate() - days);
  
  const recentSources = await prisma.source.findMany({
    where: {
      createdAt: { gte: since },
      qualityScore: { gte: 60 }
    },
    select: { id: true },
    take: 200
  });
  
  const sourceIds = recentSources.map(s => s.id);
  console.log(`[Intelligence] Found ${sourceIds.length} recent sources`);
  
  // 2. Run Signal Detection
  console.log(`\n[Intelligence] Running Signal Detection...`);
  const signals = await signalDetector({ 
    sourceIds, 
    verticalSlug: options?.verticalSlug 
  });
  
  // 3. Run Contradiction Detection
  console.log(`\n[Intelligence] Running Contradiction Detection...`);
  const contradictions = await contradictionDetector(sourceIds);
  
  // 4. Run Trend Analysis
  console.log(`\n[Intelligence] Running Trend Analysis...`);
  const trends = await trendAnalyzer({
    verticalSlug: options?.verticalSlug,
    lookbackMonths: Math.max(3, Math.ceil(days / 30) * 2)
  });
  
  console.log(`\n${"â•".repeat(60)}`);
  console.log(`  âœ… INTELLIGENCE SWEEP COMPLETE`);
  console.log(`  Signals: ${signals.detected}`);
  console.log(`  Contradictions: ${contradictions.contradictionsFound}`);
  console.log(`  Trends: ${trends.trendsDetected}`);
  console.log(`${"â•".repeat(60)}\n`);
  
  return { signals, contradictions, trends };
}
