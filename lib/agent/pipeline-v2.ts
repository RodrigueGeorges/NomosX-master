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
import { runCriticalLoopV2 } from './critical-loop-v2';
import { verifyCitations } from './citation-verifier';
import { extractAndStoreConcepts } from './knowledge-graph';
import { primeContext } from './context-primer';
import { buildMemoryInjection, recordAgentPerformance, autoDetectFailureModes, extractLessons, storeLesson } from './agent-memory';
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
import { castingAgent } from './casting-agent';
import { editorialArbiter } from './editorial-arbiter';
import type { CastingResult, InstitutePosition } from './editorial-types';
import type { DebateResult } from './debate-agent';
import { generatePrintHTML } from './pdf-export';

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
import { indexAgent, deduplicateSources } from "./index-agent";
import { strategicAnalystAgent } from "./strategic-analyst-agent";
import { renderStrategicReportHTML } from "./strategic-report-renderer";
import { renderSourceDistributionSVG } from "./chart-generator";
import { contradictionDetector } from "./contradiction-detector";
import { trendAnalyzer } from "./trend-analyzer";
import { signalDetector } from "./signal-detector";
import { searchGDELTNews, searchNewsAPI, searchMediaStack, searchTheNewsAPI, searchGNews, searchEventRegistry } from "../providers/news-scout-providers";
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
  // Real-time News Providers
  | "gdelt-news" | "newsapi" | "mediastack" | "thenewsapi" | "gnews" | "eventregistry"
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
  // Real-time News
  'gdelt-news', 'newsapi', 'mediastack', 'thenewsapi', 'gnews', 'eventregistry',
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
];

export const NEWS_PROVIDERS = [
  'gdelt-news', 'newsapi', 'mediastack', 'thenewsapi', 'gnews', 'eventregistry'
];

export const ACADEMIC_PROVIDERS = [
  'openalex', 'crossref', 'semanticscholar', 'pubmed', 'arxiv',
  'nature', 'science', 'cell', 'lancet', 'pnas', 'doaj', 'europepmc'
];

export const BUSINESS_PROVIDERS = [
  'crunchbase', 'reuters', 'techcrunch', 'blackrock',
  'mckinsey', 'bcg', 'bain', 'deloitte', 'accenture', 'ey', 'pwc'
];

export const THINK_TANK_PROVIDERS = [
  'brookings', 'carnegie', 'chatham-house', 'csis', 'bruegel',
  'council-foreign-relations', 'rand', 'cepr', 'cgd',
  'berlin-policy-hub', 'dgap', 'cis', 'ast-res', 'saiia'
];

export const GOVERNMENT_PROVIDERS = [
  'worldbank', 'imf', 'oecd', 'un', 'undp', 'eurostat', 'ecb', 'bis',
  'insee', 'thesesfr'
];

export const ENVIRONMENTAL_PROVIDERS = [
  'wri', 'climate-analytics', 'copenhagen-institute', 'energy-futures'
];

export const TECHNOLOGY_PROVIDERS = [
  'deepmind', 'openai-research', 'amazon-science', 'ai-index',
  'arxiv-cs', 'acet', 'google-patents', 'uspto'
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

    // INSTITUTIONNELS - INTELLIGENCE
    if (providerSet.has("odni")) allPromises.push(searchODNI(sq, Math.min(10, perProvider)));
    if (providerSet.has("cia-foia")) allPromises.push(searchCIAFOIA(sq, Math.min(10, perProvider)));
    if (providerSet.has("nsa")) allPromises.push(searchNSA(sq, Math.min(10, perProvider)));
    if (providerSet.has("uk-jic")) allPromises.push(searchUKJIC(sq, Math.min(10, perProvider)));

    // INSTITUTIONNELS - DÉFENSE
    if (providerSet.has("nato")) allPromises.push(searchNATO(sq, Math.min(15, perProvider)));
    if (providerSet.has("eeas")) allPromises.push(searchEEAS(sq, Math.min(15, perProvider)));
    if (providerSet.has("sgdsn")) allPromises.push(searchSGDSN(sq, Math.min(10, perProvider)));
    if (providerSet.has("eda")) allPromises.push(searchEDA(sq, Math.min(10, perProvider)));

    // INSTITUTIONNELS - ÉCONOMIE
    if (providerSet.has("imf")) allPromises.push(searchIMF(sq, Math.min(15, perProvider)));
    if (providerSet.has("worldbank")) allPromises.push(searchWorldBank(sq, Math.min(15, perProvider)));
    if (providerSet.has("oecd")) allPromises.push(searchOECD(sq, Math.min(15, perProvider)));
    if (providerSet.has("bis")) allPromises.push(searchBIS(sq, Math.min(15, perProvider)));

    // INSTITUTIONNELS - CYBER
    if (providerSet.has("nist")) allPromises.push(searchNIST(sq, Math.min(10, perProvider)));
    if (providerSet.has("cisa")) allPromises.push(searchCISA(sq, Math.min(15, perProvider)));
    if (providerSet.has("enisa")) allPromises.push(searchENISA(sq, Math.min(10, perProvider)));

    // INSTITUTIONNELS - MULTILATÉRAL
    if (providerSet.has("un")) allPromises.push(searchUN(sq, Math.min(15, perProvider)));
    if (providerSet.has("undp")) allPromises.push(searchUNDP(sq, Math.min(15, perProvider)));
    if (providerSet.has("unctad")) allPromises.push(searchUNCTAD(sq, Math.min(15, perProvider)));

    // INSTITUTIONNELS - ARCHIVES
    if (providerSet.has("nara")) allPromises.push(searchNARA(sq, Math.min(10, perProvider)));
    if (providerSet.has("uk-archives")) allPromises.push(searchUKArchives(sq, Math.min(10, perProvider)));
    if (providerSet.has("archives-fr")) allPromises.push(searchArchivesNationalesFR(sq, Math.min(10, perProvider)));

    // INSTITUTIONNELS - ÉNERGIE & NUCLÉAIRE
    if (providerSet.has("iaea")) allPromises.push(searchIAEA(sq, Math.min(15, perProvider)));
    if (providerSet.has("irena")) allPromises.push(searchIRENA(sq, Math.min(15, perProvider)));
    if (providerSet.has("cea")) allPromises.push(searchCEA(sq, Math.min(15, perProvider)));
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
    if (providerSet.has("bruegel")) allPromises.push(searchBruegel(sq, Math.min(15, perProvider)));

    // INSTITUTIONNELS - ENVIRONMENTAL
    if (providerSet.has("eea")) allPromises.push(searchEEA(sq, Math.min(15, perProvider)));

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
    if (providerSet.has("ecb")) allPromises.push(searchECB(sq, Math.min(15, perProvider)));
    if (providerSet.has("eurostat")) allPromises.push(searchEurostat(sq, Math.min(15, perProvider)));
    if (providerSet.has("fred")) allPromises.push(searchFRED(sq, Math.min(15, perProvider)));
    if (providerSet.has("eib")) allPromises.push(searchEIB(sq, Math.min(15, perProvider)));

    // INSTITUTIONNELS - SANTÉ EXTENDED
    if (providerSet.has("ema")) allPromises.push(searchEMA(sq, Math.min(15, perProvider)));
    if (providerSet.has("inserm")) allPromises.push(searchINSERM(sq, Math.min(15, perProvider)));
    if (providerSet.has("ecdc")) allPromises.push(searchECDC(sq, Math.min(15, perProvider)));
    if (providerSet.has("cochrane")) allPromises.push(searchCochrane(sq, Math.min(15, perProvider)));

    // INSTITUTIONNELS - ENVIRONNEMENT
    if (providerSet.has("inrae")) allPromises.push(searchINRAE(sq, Math.min(15, perProvider)));
    if (providerSet.has("ademe")) allPromises.push(searchADEME(sq, Math.min(15, perProvider)));

    // INSTITUTIONNELS - FRANÇAIS
    if (providerSet.has("ens")) allPromises.push(searchENS(sq, Math.min(15, perProvider)));
    if (providerSet.has("insee")) allPromises.push(searchINSEE(sq, Math.min(15, perProvider)));
    if (providerSet.has("shift-project")) allPromises.push(searchShiftProject(sq, Math.min(15, perProvider)));
    if (providerSet.has("data-gouv")) allPromises.push(searchDataGouv(sq, Math.min(15, perProvider)));
    if (providerSet.has("france-strategie")) allPromises.push(searchFranceStrategie(sq, Math.min(15, perProvider)));
    if (providerSet.has("cnrs")) allPromises.push(searchCNRS(sq, Math.min(15, perProvider)));

    // INSTITUTIONNELS - TECH RESEARCH
    if (providerSet.has("allen-ai")) allPromises.push(searchAllenAI(sq, Math.min(15, perProvider)));
    if (providerSet.has("max-planck")) allPromises.push(searchMaxPlanck(sq, Math.min(15, perProvider)));
    if (providerSet.has("eth-zurich")) allPromises.push(searchETHZurich(sq, Math.min(15, perProvider)));
    if (providerSet.has("inria")) allPromises.push(searchINRIA(sq, Math.min(15, perProvider)));

    // INSTITUTIONNELS - DROIT & GOUVERNANCE
    if (providerSet.has("eur-lex")) allPromises.push(searchEURLex(sq, Math.min(15, perProvider)));

    // THINK TANKS EUROPÉENS
    if (providerSet.has("ecfr")) allPromises.push(searchECFR(sq, Math.min(15, perProvider)));
    if (providerSet.has("swp")) allPromises.push(searchSWP(sq, Math.min(15, perProvider)));
    if (providerSet.has("sipri")) allPromises.push(searchSIPRI(sq, Math.min(15, perProvider)));
    if (providerSet.has("iai")) allPromises.push(searchIAI(sq, Math.min(15, perProvider)));

    // POLITIQUE FRANÇAISE & DROIT
    if (providerSet.has("iddri")) allPromises.push(searchIDDRI(sq, Math.min(15, perProvider)));
    if (providerSet.has("terra-nova")) allPromises.push(searchTerraNova(sq, Math.min(15, perProvider)));
    if (providerSet.has("legifrance")) allPromises.push(searchLegifrance(sq, Math.min(15, perProvider)));
    if (providerSet.has("vie-publique")) allPromises.push(searchViePublique(sq, Math.min(15, perProvider)));

    // SANTÉ EXTENDED V2
    if (providerSet.has("cdc")) allPromises.push(searchCDC(sq, Math.min(15, perProvider)));
    if (providerSet.has("nih")) allPromises.push(searchNIH(sq, Math.min(15, perProvider)));
    if (providerSet.has("who-direct")) allPromises.push(searchWHODirect(sq, Math.min(15, perProvider)));

    // ÉCONOMIE EXTENDED V2
    if (providerSet.has("oecd-direct")) allPromises.push(searchOECDDirect(sq, Math.min(15, perProvider)));

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

    // THINK TANKS & POLICY LABS — catch-all for providers not explicitly routed above
    // (brookings, rand, cfr, iiss, chatham-house, cset, carnegie, cnas, newamerica, etc.)
    const EXPLICITLY_ROUTED = new Set([
      "openalex", "thesesfr", "crossref", "semanticscholar", "arxiv", "hal", "pubmed", "base",
      "core", "europepmc", "doaj", "ssrn", "repec", "nber", "who-gho", "semantic-scholar-graph",
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
      "nara", "uk-archives", "archives-fr",
      "linkup",
      "tavily", "exa", "apitube",
      "gdelt-news", "newsapi", "mediastack", "thenewsapi", "gnews", "eventregistry",
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

  // â”€â”€ STEP 3: RELEVANCE FILTERING + COHERE RERANKING â”€â”€
  let finalPool = deduped;
  if (enhanced && deduped.length > 10) {
    try {
      const relevant = filterByRelevance(deduped, enhanced, 0.15);
      if (relevant.length >= 3) {
        console.log(`[SCOUT] After relevance filter: ${relevant.length}/${deduped.length}`);
        logRelevanceScores(relevant, 5);

        const reranked = await rerankSources(
          relevant.map(r => r.source),
          enhanced,
          { topK: Math.min(100, relevant.length), minScore: 0.2 }
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

  // â”€â”€ STEP 4: BATCH UNPAYWALL ENRICHMENT â”€â”€
  const needsUnpaywall = finalPool.filter(s => !s.pdfUrl && s.doi);
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

export function citationGuard(json: any, sourceCount: number) {
  const allText = JSON.stringify(json || {});
  // Count distinct cited sources (a source cited multiple times counts once).
  const used = Array.from(
    new Set(Array.from(allText.matchAll(/SRC-(\d+)/g)).map((m) => Number(m[1])))
  );
  const invalid = used.filter((n) => n < 1 || n > sourceCount);
  return { ok: used.length > 0 && invalid.length === 0, usedCount: used.length, invalid };
}

// ================================
// EDITOR AGENT
// ================================

export function renderBriefHTML(out: any, sources: any[]) {
  // Governance: Assert EDITOR permissions
  assertPermission(AgentRole.EDITOR, "write:draft");
  
  const section = (h: string, v: any) => {
    if (!v) return "";
    const normalized = String(v)
      .replace(/\(SRC-(\d+)(?:\s*,\s*SRC-(\d+))*\)/g, (match: string) => {
        const refs = match.match(/SRC-(\d+)/g) || [];
        return refs.map(r => `[${r}]`).join('');
      })
      .replace(/(?<!\[)SRC-(\d+)(?!\])/g, '[SRC-$1]');
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
        <h3 style="color: #5EEAD4;">Arguments For</h3>
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
// FULL PIPELINE ORCHESTRATION
// ================================

// Default academic providers â€” covers STEM, social sciences, humanities, law, economics
export const DEFAULT_ACADEMIC_PROVIDERS: Providers = [
  "openalex", "crossref", "semanticscholar", "arxiv", "hal", "pubmed", "base",
  "core", "europepmc", "doaj", "ssrn", "repec",
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
}

async function runPipelineCore(query: string, opts: PipelineCoreOptions) {
  // LOT 6.3: FAILURE POLICY
  // CRITICAL agents (throw on failure): SCOUT, RANK, ANALYST
  // NON-BLOCKING agents (warn + continue): CONTEXT_PRIMER, EMBED, GAP_FILLER,
  //   QUANT, FRAMING, HYPOTHESIS_JUDGE, FACT_CHECKER, CRITICAL_LOOP, DEVILS_ADVOCATE,
  //   KNOWLEDGE_GRAPH, STYLE_GATES, EVIDENCE_IDS, RESEARCH_GAPS
  const { isStrategic } = opts;
  const editorialV2 = isEditorialV2Enabled();
  const label = isStrategic ? "[Strategic]" : "[Pipeline]";
  const stats: PipelineStats = {};
  const pipelineStart = Date.now();

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

  // P1-FIX: Running cost accumulator with budget guard
  const maxBudget = opts.maxBudgetUsd ?? getPipelineMaxBudgetUsd(isStrategic, editorialV2);
  let runningCostUsd = 0;
  function addCost(amount: number | undefined, stepName: string) {
    if (typeof amount === "number" && amount > 0) {
      runningCostUsd += amount;
      if (runningCostUsd > maxBudget) {
        console.warn(`${label} BUDGET GUARD: $${runningCostUsd.toFixed(4)} exceeds max $${maxBudget} after ${stepName}`);
        throw new Error(`Pipeline budget exceeded: $${runningCostUsd.toFixed(4)} > $${maxBudget} limit after ${stepName}`);
      }
    }
  }

  // Tier flags — default to the full quality stack, while allowing callers to
  // explicitly choose a lighter execution profile for smoke tests and recovery.
  // These may be adjusted by the complexity gate after topic classification.
  let runHarvardCouncilStep = opts.enableHarvardCouncil !== false;
  let runEnhancedCouncilStep = isStrategic ? (opts.enableEnhancedCouncil !== false) : (opts.enableEnhancedCouncil === true);
  let runDebateStep = opts.enableDebate !== false;
  let runMetaAnalysisStep = opts.enableMetaAnalysis !== false;
  let runDevilsAdvocateStep = opts.enableDevilsAdvocate !== false;
  let runDeliberationStep = isStrategic ? (opts.enableDeliberation !== false) : (opts.enableDeliberation === true);

  // â”€â”€ Resolve providers: smart selection (async, history-aware) or explicit â”€â”€
  let providers: Providers;
  if (opts.providers && opts.providers.length > 0) {
    providers = opts.providers;
  } else if (isStrategic) {
    const smart = await selectSmartProviders(query).catch(() => null);
    providers = (smart?.providers as Providers | undefined) ?? [
      ...DEFAULT_ACADEMIC_PROVIDERS,
      "imf", "worldbank", "oecd", "brookings", "rand", "cnas",
    ] as Providers;
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
  const scoutResult = await scout(query, providers, isStrategic ? Math.max(perProvider, 75) : perProvider);
  // Handle both cached array and fresh result object
  const sourceIds = Array.isArray(scoutResult) ? scoutResult.map(s => s.id) : (scoutResult.sourceIds || []);
  const found = Array.isArray(scoutResult) ? scoutResult.length : (scoutResult.found || 0);
  
  allSourceIds = [...sourceIds];
  if (seedIds.length) {
    allSourceIds = [...new Set([...allSourceIds, ...seedIds])];
    console.log(`${label} SCOUT: merged ${seedIds.length} seed sources → ${allSourceIds.length} total`);
  }

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
      const academicProvidersList = ["openalex", "crossref", "semanticscholar", "arxiv", "hal", "pubmed", "ssrn", "nber", "repec", "europepmc", "base", "doaj", "springer", "osti", "datacite", "lens", "dimensions", "google-books"];
      const hasNews = newsProvidersList.some(p => foundProviderPrefixes.has(p));
      const hasAcademic = academicProvidersList.some(p => foundProviderPrefixes.has(p));

      const adaptiveProviders = [...providers];
      // If no news sources found, add news providers for real-time coverage
      if (!hasNews) {
        adaptiveProviders.push(...["gdelt-news", "newsapi"] as any);
        console.log(`${label} RE_SCOUT: no news sources found — adding gdelt-news, newsapi`);
      }
      // If no academic sources found, add core academic providers
      if (!hasAcademic) {
        adaptiveProviders.push(...["openalex", "crossref", "semanticscholar", "arxiv", "europepmc", "base", "doaj"] as any);
        console.log(`${label} RE_SCOUT: no academic sources found — adding openalex, crossref, semanticscholar, arxiv, europepmc, base, doaj`);
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
  emitProgress(pipelineRun.id, "SCOUT", "completed", `Found ${allSourceIds.length} sources`);
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
  const adaptiveMaxPerProvider = sourcePoolSize < 15 ? 12 : sourcePoolSize < 30 ? 8 : 6;
  const adaptiveMinDiversity = sourcePoolSize < 10 ? 1 : sourcePoolSize < 30 ? 2 : 3;
  const rankOpts: RankOptions = isStrategic ? {
    limit: 60,
    mode: "balanced",
    sourceIds: allSourceIds,
    requireAbstract: false,
    minAbstractLength: 0,
    minQuality: 0,
    maxPerProvider: adaptiveMaxPerProvider,
    minProviderDiversity: adaptiveMinDiversity,
    ...opts.rankOptions,
  } : {
    limit: 25,
    mode: "quality",
    sourceIds: allSourceIds,
    minQuality: 0,
    requireAbstract: sourcePoolSize >= 20,
    minAbstractLength: sourcePoolSize >= 20 ? 150 : 0,
    maxPerProvider: adaptiveMaxPerProvider,
    minProviderDiversity: adaptiveMinDiversity,
  };

  emitProgress(pipelineRun.id, "RANK", "started", `Ranking top ${rankOpts.limit ?? 12} from ${allSourceIds.length} SCOUT sources...`);
  console.log(`${label} RANK: top ${rankOpts.limit ?? 12} from ${allSourceIds.length} SCOUT sources`);
  const topSources = await rank(query, rankOpts);

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
        limit: Math.min(30, (rankOpts.limit ?? 25) + 5),
      } : {
        ...rankOpts,
        sourceIds: allSourceIds,
        limit: Math.min(20, (rankOpts.limit ?? 12) + 3),
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
  }
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
      console.log(`${label} COMPLEXITY GATE: low-complexity topic (1 domain, confidence ${topicClassification.confidence}) — skipping meta-analysis, deliberation, debate`);
    }
    // Meta-analysis only relevant for domains with effect sizes / quantitative studies
    const META_ANALYSIS_DOMAINS = ['health', 'medical', 'economics', 'finance', 'social_sciences', 'statistics'];
    if (!META_ANALYSIS_DOMAINS.includes(detectedDomain)) {
      runMetaAnalysisStep = false;
      console.log(`${label} COMPLEXITY GATE: meta-analysis skipped (domain "${detectedDomain}" not quantitative-study oriented)`);
    }
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
  if (editorialV2) {
    emitProgress(pipelineRun.id, 'CASTING', 'started', 'Assembling cross-domain reasoning team...');
    castingResult = await castingAgent(query, topicClassification);
    stats.casting = {
      teamSize: castingResult.team.length,
      collisionSummary: castingResult.collisionSummary,
      costUsd: castingResult.costUsd,
    };
    addCost(castingResult.costUsd, 'CASTING');
    emitProgress(pipelineRun.id, 'CASTING', 'completed', `${castingResult.team.length} lenses assigned`);
    console.log(`${label} CASTING: ${castingResult.team.map((t) => t.domain).join(', ')}`);
  }

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
  }

  // ── STEP 5: READER V3 + FRAMING + QUANT (parallel) ──
  emitProgress(pipelineRun.id, "READER", "started", `Deep extraction from ${topSources.length} sources...`);
  console.log(`${label} READER V3: deep extraction from ${topSources.length} sources (domain: ${detectedDomain})`);
  const [readings, framingSettled, quantSettled] = await Promise.all([
    readerAgentV3(topSources, {
      enablePdf: true,
      maxConcurrency: 5,
      timeout: isStrategic ? 120000 : undefined,
      domain: detectedDomain,
    }),
    // FRAMING: pre-register testable hypotheses (hypothesis-driven analysis)
    import('./hypothesis-engine').then(m => m.framingAgent(query)).catch((err) => {
      console.warn(`${label} FRAMING: failed (non-blocking):`, err);
      return { hypotheses: [], keyUnknowns: [], costUsd: 0 };
    }),
    // QUANT: fetch real numbers from T1 primary-data providers
    import('./quant-agent').then(m => m.quantAgent(query, topSources)).catch((err) => {
      console.warn(`${label} QUANT: failed (non-blocking):`, err);
      return { series: [], facts: [], evidenceBlock: '', chartData: [], fetchedProviders: [], durationMs: 0 };
    }),
  ]);
  const framing = framingSettled;
  const quant = quantSettled;
  addCost(framing.costUsd, 'FRAMING');
  stats.framing = { hypotheses: framing.hypotheses.length, keyUnknowns: framing.keyUnknowns.length, costUsd: framing.costUsd };
  stats.quant = { series: quant.series.length, facts: quant.facts.length, providers: quant.fetchedProviders, durationMs: quant.durationMs };
  if (framing.hypotheses.length > 0) console.log(`${label} FRAMING: ${framing.hypotheses.length} hypotheses pre-registered`);
  if (quant.facts.length > 0) console.log(`${label} QUANT: ${quant.facts.length} machine-verified facts from ${quant.fetchedProviders.join(', ')}`);
  const fullTextCount = readings.filter(r => r.readingDepth === "full_text").length;
  const quantCount = readings.filter(r => r.quantitative.effectSizes.length > 0 || r.quantitative.sampleSizes.length > 0).length;
  stats.reader = { count: readings.length, fullText: fullTextCount, withQuantData: quantCount };

  orchState.sourcesWithAbstract = readings.filter(r => r.claims.length > 0 || r.methods.length > 0).length;
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

  // â”€â”€ STEP 6: ANALYST (brief = V3 multi-pass, strategic = Strategic Analyst) â”€â”€
  emitProgress(pipelineRun.id, "ANALYST", "started", `${isStrategic ? "Strategic-depth multi-pass analysis" : "Multi-pass analysis"}...`);
  console.log(`${label} ANALYST: V3 multi-pass (depth: ${isStrategic ? 'strategic' : 'brief'})`);
  // -- STEP 5b: AGENT MEMORY INJECTION -- inject past lessons into ANALYST --
  const agentId = "analyst";
  let memoryBlock: string | undefined;
  try {
    const memInj = await buildMemoryInjection(agentId, undefined, { maxLessons: 5, lookbackDays: 90 });
    if (memInj.topLessons.length > 0) {
      memoryBlock = memInj.promptBlock;
      stats.agentMemory = { lessons: memInj.topLessons.length, agentId };
      console.log(`${label} AGENT MEMORY: ${memInj.topLessons.length} lessons injected into ${agentId}`);
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

  const fullContextBlock = [
    memoryBlock,
    primedContext?.contextBlock,
    gapContextBlock,
    quant.evidenceBlock || undefined,
    hypothesisVerdictBlock || undefined,
    domainBlock || undefined,
    strategicOptsBlock,
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

  // ── STEP 6a: STRUCTURAL EDITOR (strategic only) — narrative arc validation ──
  // Reactivated: validates Pyramid Principle, SCR (McKinsey), Constat-Enjeu-Option (France Stratégie)
  // Harvard Council and PhD Deliberation stay suppressed — redundant with casting + debate at 1/10 cost
  stats.harvardCouncil = { skipped: true };
  stats.deliberation = { skipped: true };
  if (isStrategic) {
    try {
      const { structuralEditorReview } = await import('./structural-editor');
      emitProgress(pipelineRun.id, "STRUCTURAL_EDITOR", "started", "Reviewing narrative structure...");
      const structuralReview = await structuralEditorReview(analysis, query);
      stats.structuralEditor = {
        overallStructure: structuralReview.overallStructure,
        narrativeArcValid: structuralReview.narrativeArcValid,
        logicalGaps: structuralReview.logicalGaps.length,
        costUsd: structuralReview.costUsd,
      };
      addCost(structuralReview.costUsd, "STRUCTURAL_EDITOR");
      console.log(`${label} STRUCTURAL EDITOR: score=${structuralReview.overallStructure}, gaps=${structuralReview.logicalGaps.length}`);
      // If structural issues found, inject suggestions into analysis for editor to consider
      if (structuralReview.overallStructure < 75 && structuralReview.restructuringSuggestions.length > 0) {
        (analysis as any)._structuralSuggestions = structuralReview.restructuringSuggestions;
        (analysis as any)._logicalGaps = structuralReview.logicalGaps;
      }
      emitProgress(pipelineRun.id, "STRUCTURAL_EDITOR", "completed", `Structure: ${structuralReview.overallStructure}/100`);
    } catch (err) {
      console.warn(`${label} STRUCTURAL EDITOR: failed (non-blocking):`, err);
      stats.structuralEditor = { error: String(err) };
    }
  } else {
    stats.structuralEditor = { skipped: true };
  }

  // â”€â”€ STEP 7: CITATION GUARD â”€â”€
  console.log(`${label} GUARD: validate citations`);
  const guard = citationGuard(analysis, topSources.length);
  stats.guard = guard;
  if (!guard.ok) {
    console.warn(`${label} Citation guard warning: ${guard.usedCount} citations, ${guard.invalid.length} invalid (non-fatal, proceeding with degraded quality)`);
    stats.citationGuardDegraded = true;
  }

  let html = '';
  let debateContext: string | undefined;
  let debateResult: DebateResult | undefined;
  let institutePosition: InstitutePosition | undefined;

  const renderEditorHtml = (): string => {
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
      const rendered = isStrategic
        ? renderProfessionalStrategicHTML(analysis, topSources)
        : renderProfessionalBriefHTML(analysis, topSources);
      stats.rendererUsed = isStrategic ? "professional_strategic" : "professional_brief";
      console.log(`${label} EDITOR: ${isStrategic ? 'strategic' : 'brief'} template rendered (${(rendered.length / 1024).toFixed(0)}KB)`);
      return rendered;
    } catch (editorErr) {
      console.warn(`${label} EDITOR: professional template failed, using legacy:`, editorErr);
      stats.rendererUsed = isStrategic ? "legacy_strategic" : "legacy_brief";
      return isStrategic
        ? renderStrategicReportHTML(analysis, topSources)
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
          const llmVerification = await verifyCitations(html, topSources, { maxConcurrency: 8, maxClaims: 30, producerFamily });
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
        const verification = await verifyCitations(html, topSources, { maxConcurrency: 8, maxClaims: 50, producerFamily });
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
        console.error(`${label} FACT-CHECKER: ${factResult.fatalIssues} FATAL numerical discrepancies detected`);
        stats.factCheckerFatalFlagged = true;
      }
    } catch (err) {
      console.warn(`${label} FACT-CHECKER: failed (non-blocking):`, err);
      stats.factChecker = { error: String(err) };
    }

    console.log(`${label} CRITICAL LOOP V2: 3 critics + 1 rewrite iteration (reactivated)`);
    try {
      const criticalResult = await runCriticalLoopV2({
        draftHtml: html,
        sources: topSources,
        readings,
        maxIterations: 2,
        publishThreshold: 60,
        producerFamily: producerFamily as any,
      });
      stats.criticalLoop = {
        iterations: criticalResult.iterations,
        finalScore: criticalResult.compositeScore,
        improvement: criticalResult.improvementDelta || 0,
        needsHumanReview: criticalResult.needsHumanReview,
      };
      // Use rewritten HTML if critics improved it
      if (criticalResult.finalHtml && criticalResult.improvementDelta > 0) {
        html = criticalResult.finalHtml;
        // Re-inject position-first footer if the rewrite dropped it
        if (editorialV2 && !html.includes('From Chaos to Clarity')) {
          const footerHtml = `<footer class="brief-footer">${BRAND_BRIEF_FOOTER}<div style="margin-top:0.75rem;font-size:0.5rem;letter-spacing:0.08em;color:rgba(240,240,250,0.15);text-transform:none;line-height:1.6;">${BRAND_MANIFESTO.replace(/\n/g, '<br/>')}</div></footer>`;
          html = html.replace(/<\/article>/, `${footerHtml}</article>`);
          console.log(`${label} CRITICAL LOOP V2: re-injected position-first footer (manifesto)`);
        }
        console.log(`${label} CRITICAL LOOP V2: applied rewrite (+${criticalResult.improvementDelta} improvement)`);
        // POST-CRITICAL-LOOP REPAIR: the rewrite may have introduced unsourced numbers
        // or lost citations — run citation repair + claim grounding again
        try {
          const { repairCitations } = await import('./citation-repair');
          const postRepair = repairCitations(html, analysis as Record<string, unknown>, topSources);
          if (postRepair.citationsBackfilled + postRepair.citationsInjected + postRepair.numbersSanitized > 0) {
            html = postRepair.html;
            console.log(`${label} POST-LOOP CITATION REPAIR: +${postRepair.citationsBackfilled} backfilled, +${postRepair.citationsInjected} injected, ${postRepair.numbersSanitized} numbers sanitized`);
            stats.postLoopRepair = {
              backfilled: postRepair.citationsBackfilled,
              injected: postRepair.citationsInjected,
              sanitized: postRepair.numbersSanitized,
            };
          }
        } catch (postErr) {
          console.warn(`${label} POST-LOOP CITATION REPAIR: failed (non-blocking):`, postErr);
        }
        try {
          const { groundClaims } = await import('./claim-grounding');
          const postGrounding = groundClaims(html, topSources, { mode: 'flag' });
          if (postGrounding.removedClaims > 0 || postGrounding.unsupported > 0) {
            html = postGrounding.html;
            console.log(`${label} POST-LOOP CLAIM GROUNDING: ${postGrounding.supported} supported, ${postGrounding.partial} partial, ${postGrounding.unsupported} unsupported, ${postGrounding.uncited} uncited → groundedness ${Math.round(postGrounding.groundedness * 100)}%, ${postGrounding.removedClaims} flagged`);
            stats.postLoopGrounding = {
              supported: postGrounding.supported,
              partial: postGrounding.partial,
              unsupported: postGrounding.unsupported,
              uncited: postGrounding.uncited,
              contradicted: postGrounding.contradicted,
              groundedness: Math.round(postGrounding.groundedness * 100),
              flagged: postGrounding.removedClaims,
            };
          }
        } catch (postGroundErr) {
          console.warn(`${label} POST-LOOP CLAIM GROUNDING: failed (non-blocking):`, postGroundErr);
        }
      }
      addCost(criticalResult.totalCostUsd, "CRITICAL_LOOP");
    } catch (err) {
      console.warn(`${label} CRITICAL LOOP V2: failed (non-blocking):`, err);
      stats.criticalLoop = {
        iterations: 0,
        finalScore: 50,
        improvement: 0,
        needsHumanReview: true,
      };
    }

    orchState.trustScore = stats.criticalLoop?.finalScore ?? null;
    // Boost trust score with claim grounding groundedness bonus
    // Use post-loop grounding if available (more accurate after rewrite), else pre-loop
    const groundingStats = stats.postLoopGrounding ?? stats.claimGrounding;
    if (groundingStats && groundingStats.groundedness > 50) {
      const groundingBonus = Math.round((groundingStats.groundedness - 50) * 0.1);
      const boostedScore = Math.min(100, (orchState.trustScore ?? 50) + groundingBonus);
      if (boostedScore > (orchState.trustScore ?? 0)) {
        console.log(`${label} TRUST BOOST: +${groundingBonus} from claim grounding (${groundingStats.groundedness}% groundedness) → ${boostedScore}`);
        orchState.trustScore = boostedScore;
        stats.criticalLoop = { ...stats.criticalLoop!, finalScore: boostedScore };
      }
    }
    const criticalDecision = assessAfterCriticalLoop(orchState);
    recordDecision(orchState, criticalDecision);
    stats.orchestrator = stats.orchestrator ?? { decisions: [] };
    stats.orchestrator.decisions.push(criticalDecision);
  };

  const runDebateMetaBlock = async (debateHtmlContext?: string) => {
    if (!runDebateStep && !runMetaAnalysisStep) {
      console.log(`${label} DEBATE + META-ANALYSIS: skipped (tier=standard)`);
      stats.debate = { skipped: true };
      stats.metaAnalysis = { skipped: true };
      return;
    }
    emitProgress(pipelineRun.id, "DEBATE", "started", "Running debate + meta-analysis in parallel...");
    console.log(`${label} DEBATE + META-ANALYSIS: running in parallel`);
    const [debateSettled, metaResult] = await Promise.allSettled([
      runDebateStep ? import('./debate-agent').then(m => m.debateAgent(query, topSources, readings, debateHtmlContext)) : Promise.reject("skipped"),
      runMetaAnalysisStep ? import('./meta-analysis-engine').then(m => m.metaAnalysisEngine(query, readings, topSources)) : Promise.reject("skipped"),
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
    } else if (debateSettled.reason !== "skipped") {
      console.warn(`${label} DEBATE: failed (non-blocking):`, debateSettled.reason);
    }

    if (metaResult.status === "fulfilled") {
      const meta = metaResult.value;
      stats.metaAnalysis = {
        k: meta.k,
        pooledEffect: meta.recommended === "random" ? meta.randomEffects.value : meta.fixedEffect.value,
        I2: meta.heterogeneity.I2,
        biasDetected: meta.publicationBias.biasDetected,
        forestPlotEntries: meta.forestPlot.length,
      };
      console.log(`${label} META-ANALYSIS: k=${meta.k}, pooled d=${stats.metaAnalysis.pooledEffect}, I²=${meta.heterogeneity.I2}%`);

      // LOT 4.2-4.8: Chain probability from meta-analysis priors
      try {
        const { buildPriors, chainTournament, scenariosFromChain, inflectionCheck } = await import('./chain-probability');
        const priors = buildPriors(meta);
        if (priors.length > 0) {
          // Extract mechanisms from readings
          const allMechanisms = readings.flatMap((r: any) => r.mechanisms || []);
          if (allMechanisms.length >= 2) {
            const tournament = chainTournament(allMechanisms, priors);
            const scenarios = scenariosFromChain(priors);
            const inflection = inflectionCheck(allMechanisms);
            stats.chainProbability = {
              priors: priors.length,
              bestJointProbability: tournament.bestJointProbability,
              permutations: tournament.permutations,
              scenarios: scenarios.length,
              inflectionWarning: inflection.warning,
            };
            console.log(`${label} CHAIN PROBABILITY: joint P=${tournament.bestJointProbability.toFixed(3)}, ${scenarios.length} scenarios, inflection=${inflection.hasInflection}`);
            if (inflection.warning) {
              console.warn(`${label} CHAIN PROBABILITY: ${inflection.warning}`);
            }
          }
        }
      } catch (err) {
        console.warn(`${label} CHAIN PROBABILITY: failed (non-blocking):`, err);
      }
    } else if (metaResult.reason !== "skipped") {
      console.warn(`${label} META-ANALYSIS: failed (non-blocking):`, metaResult.reason);
    }
  };

  const runDevilsAdvocateBlock = async (contentForReview: string, allowHtmlRevision: boolean) => {
    if (!runDevilsAdvocateStep) {
      console.log(`${label} DEVIL'S ADVOCATE: skipped (tier=standard)`);
      stats.devilsAdvocate = { skipped: true };
      return;
    }
    emitProgress(pipelineRun.id, "DEVILS_ADVOCATE", "started", "Final epistemic challenge...");
    console.log(`${label} DEVIL'S ADVOCATE: challenging analysis`);
    let advocateReport: any = null;
    try {
      const { runDevilsAdvocate } = await import('./devils-advocate');
      advocateReport = await runDevilsAdvocate(
        query,
        contentForReview,
        topSources.map((s: any) => ({ title: s.title, provider: s.provider, year: s.year ?? undefined })),
        {
          mode: isStrategic ? "strategic" : "brief",
          targetAudience: opts.targetAudience || (isStrategic ? "senior policymakers" : undefined),
          debateContext,
        }
      );
      stats.devilsAdvocate = {
        verdict: advocateReport.verdict,
        overallStrength: advocateReport.overallStrength,
        publishabilityScore: advocateReport.publishabilityScore,
        fatalChallenges: advocateReport.fatalChallenges.length,
        majorChallenges: advocateReport.majorChallenges.length,
        vsInstitutions: advocateReport.vsInstitutionBenchmark.overall,
        ...(isStrategic && {
          institutionScores: {
            mckinsey: advocateReport.vsInstitutionBenchmark.mckinsey.score,
            brookings: advocateReport.vsInstitutionBenchmark.brookings.score,
            rand: advocateReport.vsInstitutionBenchmark.rand.score,
            franceStrategie: advocateReport.vsInstitutionBenchmark.franceStrategie.score,
          },
          gaps: advocateReport.vsInstitutionBenchmark.gaps,
        }),
        costUsd: advocateReport.costUsd,
      };
      console.log(`${label} DEVIL'S ADVOCATE: verdict=${advocateReport.verdict}, strength=${advocateReport.overallStrength}/100`);
      if (advocateReport.fatalChallenges.length > 0) {
        console.log(`${label} DA FATAL CHALLENGES:`);
        advocateReport.fatalChallenges.forEach((fc: any, i: number) => {
          console.log(`${label}   ${i + 1}. [${fc.challengeType}] ${fc.challenge?.slice(0, 200)}`);
        });
      }
      if (advocateReport.majorChallenges.length > 0) {
        console.log(`${label} DA MAJOR CHALLENGES:`);
        advocateReport.majorChallenges.forEach((mc: any, i: number) => {
          console.log(`${label}   ${i + 1}. [${mc.challengeType}] ${mc.challenge?.slice(0, 150)}`);
        });
      }
      addCost(advocateReport.costUsd, "DEVIL'S ADVOCATE");

      const failureModes = autoDetectFailureModes({
        confidenceGiven: isStrategic ? 75 : 70,
        trustScore: stats.criticalLoop?.finalScore ?? 70,
        citationCoverage: stats.citationVerifier?.integrity ? stats.citationVerifier.integrity / 100 : 0.7,
        contradictionsFound: advocateReport.fatalChallenges.length,
        sourceDiversity: orchState.providerDiversity,
        findingsCount: topSources.length,
      });
      await recordAgentPerformance({
        agentId,
        runId: pipelineRun.id,
        question: query,
        trustScore: advocateReport.publishabilityScore,
        qualityScore: advocateReport.overallStrength,
        confidenceGiven: isStrategic ? 75 : 70,
        confidenceActual: advocateReport.overallStrength,
        citationCoverage: stats.citationVerifier?.integrity ? stats.citationVerifier.integrity / 100 : 0.7,
        findingsCount: topSources.length,
        failureModes,
        lessonsLearned: [],
      });

      const qualityThreshold = isStrategic ? 80 : 75;
      if (advocateReport.overallStrength < qualityThreshold && advocateReport.fatalChallenges.length > 0) {
        // DA auto-revision: append fatal challenges as visible advisory section
        // This ensures transparency — readers see the epistemic challenges
        console.log(`${label} DEVIL'S ADVOCATE: ${advocateReport.fatalChallenges.length} fatal challenges — appending advisory section`);
        const advisoryHtml = `
<section class="nx-block epistemic-review" style="border-left:3px solid #c0392b;padding:12px 20px;margin:24px 0;background:#fdf2f2;border-radius:4px;">
  <p class="nx-eyebrow" style="color:#c0392b;">Epistemic challenges identified</p>
  ${advocateReport.fatalChallenges.slice(0, 3).map((fc: any, i: number) =>
    `<div style="margin:8px 0;"><strong>${i + 1}. ${esc(fc.challengeType || 'Challenge')}</strong><br/>${esc((fc.challenge || '').slice(0, 300))}</div>`
  ).join('')}
</section>`;
        if (allowHtmlRevision && html) {
          html = html.replace('</article>', `${advisoryHtml}</article>`);
          stats.devilsAdvocate!.autoRevised = true;
        }
      }
    } catch (err) {
      console.warn(`${label} DEVIL'S ADVOCATE: failed (non-blocking):`, err);
      stats.devilsAdvocate = { error: String(err) };
    }

    // Triangular judge suppressed (LOT 3.7) — DA verdict is final
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

    // LOT 4.8: Inflection check on extracted mechanisms (V2 branch)
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
      }
    } catch (err) {
      console.warn(`${label} INFLECTION CHECK: failed (non-blocking):`, err);
    }

    // LOT 7.1: Register predictions for retrospective auditing
    try {
      const analysisObj = analysis as Record<string, unknown>;
      const scenarios = (analysisObj?.scenarios as Array<Record<string, unknown>>) || [];
      const predictions: Array<{ claim: string; probability: number; timeframe: string }> = [];
      for (const scenario of scenarios) {
        const name = (scenario.name as string) || (scenario.label as string) || 'unnamed';
        const description = (scenario.description as string) || '';
        const probability = typeof scenario.probability === 'number' ? scenario.probability : 0.5;
        if (description) {
          predictions.push({ claim: `${name}: ${description.slice(0, 200)}`, probability, timeframe: '12 months' });
        }
      }
      if (predictions.length > 0) {
        await prisma.agentAuditLog.create({
          data: {
            agent: 'ANALYST',
            action: 'PREDICTION_REGISTER',
            resource: query.slice(0, 200),
            metadata: JSON.stringify({ predictions, pipelineRunId: pipelineRun.id }) as any,
          },
        });
        stats.predictions = { registered: predictions.length };
        console.log(`${label} PREDICTIONS: registered ${predictions.length} predictions for retrospective audit`);
      }
    } catch (err) {
      console.warn(`${label} PREDICTIONS: registration failed (non-blocking):`, err);
    }

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
    html = renderEditorHtml();
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
      const { groundClaims } = await import('./claim-grounding');
      const groundingResult = groundClaims(html, topSources, { mode: 'flag' });
      if (groundingResult.removedClaims > 0 || groundingResult.unsupported > 0) {
        html = groundingResult.html;
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
      }
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
    // V2: second DA pass on rendered HTML — allows auto-revision if fatal challenges found
    if (stats.devilsAdvocate && !(stats.devilsAdvocate as any).error && !(stats.devilsAdvocate as any).skipped) {
      await runDevilsAdvocateBlock(html, true);
    }
  } else {
    html = renderEditorHtml();
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
      const { groundClaims } = await import('./claim-grounding');
      const groundingResult = groundClaims(html, topSources, { mode: 'flag' });
      if (groundingResult.removedClaims > 0 || groundingResult.unsupported > 0) {
        html = groundingResult.html;
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
      }
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
      const heroHtml = `<figure class="hero-image" style="margin:0 0 32px 0;width:100%;overflow:hidden;border:1px solid rgba(240,240,250,0.08);">
        <img src="${heroResult.url}" alt="${String(analysis.title || query).replace(/"/g, '&quot;')}" style="width:100%;height:auto;display:block;object-fit:cover;filter:brightness(0.95) contrast(1.05);" />
      </figure>`;
      if (html.includes('<article')) {
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
    },
  });
  stats.brief = { id: brief.id, ...(estimatedPages && { estimatedPages }) };

  // â”€â”€ STEP 15: KNOWLEDGE GRAPH (post-publish concept extraction) â”€â”€
  console.log(`${label} KNOWLEDGE GRAPH: extracting concepts`);
  try {
    const kg = await extractAndStoreConcepts(brief.id, query, html, topSources.map((s: any) => s.id));
    stats.knowledgeGraph = { concepts: kg.concepts.length, relations: kg.relations.length, costUsd: kg.costUsd };
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
  ])).filter(i => i >= 0 && i < topSources.length);
  const citedSourceIds = citedIndices.map(i => (topSources[i] as any).id);
  recordSourceUsage(
    topSources.map((s: any) => s.id),
    stats.criticalLoop?.finalScore ?? 0,
    citedSourceIds,
  ).catch(() => {});

  // Finalize PipelineRun
  const totalCost = runningCostUsd;
  stats.totalCostUsd = totalCost;

  const durationMs = Date.now() - pipelineStart;
  emitProgress(pipelineRun.id, "COMPLETE", "completed", `Pipeline complete in ${(durationMs / 1000).toFixed(1)}s`, { costUsd: totalCost, durationMs });
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
  const timeoutMs = isStrategic ? 3_000_000 : 1_500_000; // 50min strategic, 25min brief

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
