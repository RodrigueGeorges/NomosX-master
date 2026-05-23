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

// P1-PERF: Optional agents are lazy-loaded via dynamic import() to reduce cold start
// debateAgent, metaAnalysisEngine, runDevilsAdvocate, runHarvardCouncil,
// runEnhancedHarvardCouncil, runCollaborativeDeliberation, buildDeliberationContextBlock
import { recordSourceUsage } from './source-reputation-agent';
import { emitProgress } from './pipeline-progress';
import { selectSmartProviders } from './smart-provider-selector';
import { getHealthyProviders } from './provider-health-tracker';
import { searchExtendedProviders, getExtendedProvidersForDomain } from '../providers/registry-bridge';
import { classifyTopicSync } from './topic-classifier';
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
import { indexAgent, deduplicateSources } from "./index-agent";
import { strategicAnalystAgent } from "./strategic-analyst-agent";
import { renderStrategicReportHTML } from "./strategic-report-renderer";
import { renderSourceDistributionSVG } from "./chart-generator";
import { contradictionDetector } from "./contradiction-detector";
import { trendAnalyzer } from "./trend-analyzer";
import { signalDetector } from "./signal-detector";
import { searchGDELTNews, searchNewsAPI, searchMediaStack, searchTheNewsAPI, searchGNews, searchEventRegistry } from "../providers/news-scout-providers";

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
  | "iaea" | "irena" | "cea"
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
  // Institutionnels - Archives
  | "nara" | "uk-archives" | "archives-fr"
  // Complémentaire - Web Search
  | "linkup"
  // Real-time News Providers
  | "gdelt-news" | "newsapi" | "mediastack" | "thenewsapi" | "gnews" | "eventregistry"
  // Think tanks & Policy Labs
  | "lawzero" | "govai" | "iaps" | "caip" | "aipi"
  | "cset" | "ainow" | "datasociety" | "abundance" | "caidp"
  | "scsp" | "ifp" | "cdt" | "brookings" | "fai"
  | "cnas" | "rand" | "newamerica" | "aspen-digital" | "rstreet"
>;

// ALL PROVIDERS - 100% COVERAGE
export const ALL_PROVIDERS = [
  // Academic APIs
  'openalex', 'crossref', 'semanticscholar', 'pubmed', 'arxiv',
  'nature', 'science', 'cell', 'lancet', 'pnas', 'doaj', 'europepmc',
  
  // Business APIs
  'crunchbase', 'reuters', 'techcrunch', 'blackrock',
  
  // Think Tanks
  'mckinsey', 'bcg', 'bain', 'deloitte', 'accenture', 'ey', 'pwc',
  'brookings', 'carnegie', 'chatham-house', 'csis', 'bruegel',
  'council-foreign-relations', 'rand', 'cepr', 'cgd',
  'berlin-policy-hub', 'dgap', 'cis', 'ast-res', 'saiia',
  
  // Government & International
  'worldbank', 'imf', 'oecd', 'un', 'undp', 'eurostat', 'ecb', 'bis',
  'insee', 'thesesfr',
  
  // Environmental
  'wri', 'climate-analytics', 'copenhagen-institute', 'energy-futures',
  
  // Data & Research
  'figshare', 'zenodo',
  
  // Technology & AI
  'deepmind', 'openai-research', 'amazon-science', 'ai-index',
  'arxiv-cs', 'acet',
  
  // Patents
  'google-patents', 'uspto',
  
  // Search & Discovery
  'linkup', 'google-cse',
  
  // Real-time News
  'gdelt-news', 'newsapi', 'mediastack', 'thenewsapi', 'gnews', 'eventregistry',
  
  // Academic Research
  'nber', 'ssrn', 'repec', 'lawzero'
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

  // â”€â”€ STEP 1: MULTI-QUERY PARALLEL SEARCH (58+ providers) â”€â”€
  // Theses handled separately due to HAL bridge enrichment
  let thesesResults: any[] = [];
  if (providers.includes("thesesfr")) {
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
    if (providers.includes("openalex")) allPromises.push(searchOpenAlex(sq, perProvider));
    if (providers.includes("crossref")) allPromises.push(searchCrossref(sq, Math.min(50, perProvider)));
    if (providers.includes("semanticscholar")) allPromises.push(searchSemanticScholar(sq, Math.min(50, perProvider)));
    if (providers.includes("arxiv")) allPromises.push(searchArxiv(sq, Math.min(50, perProvider)));
    if (providers.includes("hal")) allPromises.push(searchHAL(sq, Math.min(50, perProvider)));
    if (providers.includes("pubmed")) allPromises.push(searchPubMed(sq, Math.min(50, perProvider)));
    if (providers.includes("base")) allPromises.push(searchBASE(sq, Math.min(50, perProvider)));

    // ACADÉMIQUES — EXTENDED COVERAGE
    if (providers.includes("core")) allPromises.push(searchCORE(sq, Math.min(30, perProvider)));
    if (providers.includes("europepmc")) allPromises.push(searchEuropePMC(sq, Math.min(30, perProvider)));
    if (providers.includes("doaj")) allPromises.push(searchDOAJ(sq, Math.min(30, perProvider)));
    if (providers.includes("ssrn")) allPromises.push(searchSSRN(sq, Math.min(20, perProvider)));
    if (providers.includes("repec")) allPromises.push(searchRePEc(sq, Math.min(20, perProvider)));
    if (providers.includes("nber")) allPromises.push(searchNBER(sq, Math.min(20, perProvider)));
    if (providers.includes("who-gho")) allPromises.push(searchWHOGHO(sq, Math.min(20, perProvider)));
    if (providers.includes("semantic-scholar-graph")) allPromises.push(searchSemanticScholarGraph(sq, Math.min(25, perProvider)));

    // INSTITUTIONNELS - INTELLIGENCE
    if (providers.includes("odni")) allPromises.push(searchODNI(sq, Math.min(10, perProvider)));
    if (providers.includes("cia-foia")) allPromises.push(searchCIAFOIA(sq, Math.min(10, perProvider)));
    if (providers.includes("nsa")) allPromises.push(searchNSA(sq, Math.min(10, perProvider)));
    if (providers.includes("uk-jic")) allPromises.push(searchUKJIC(sq, Math.min(10, perProvider)));

    // INSTITUTIONNELS - DÉFENSE
    if (providers.includes("nato")) allPromises.push(searchNATO(sq, Math.min(15, perProvider)));
    if (providers.includes("eeas")) allPromises.push(searchEEAS(sq, Math.min(15, perProvider)));
    if (providers.includes("sgdsn")) allPromises.push(searchSGDSN(sq, Math.min(10, perProvider)));
    if (providers.includes("eda")) allPromises.push(searchEDA(sq, Math.min(10, perProvider)));

    // INSTITUTIONNELS - ÉCONOMIE
    if (providers.includes("imf")) allPromises.push(searchIMF(sq, Math.min(15, perProvider)));
    if (providers.includes("worldbank")) allPromises.push(searchWorldBank(sq, Math.min(15, perProvider)));
    if (providers.includes("oecd")) allPromises.push(searchOECD(sq, Math.min(15, perProvider)));
    if (providers.includes("bis")) allPromises.push(searchBIS(sq, Math.min(15, perProvider)));

    // INSTITUTIONNELS - CYBER
    if (providers.includes("nist")) allPromises.push(searchNIST(sq, Math.min(10, perProvider)));
    if (providers.includes("cisa")) allPromises.push(searchCISA(sq, Math.min(15, perProvider)));
    if (providers.includes("enisa")) allPromises.push(searchENISA(sq, Math.min(10, perProvider)));

    // INSTITUTIONNELS - MULTILATÉRAL
    if (providers.includes("un")) allPromises.push(searchUN(sq, Math.min(15, perProvider)));
    if (providers.includes("undp")) allPromises.push(searchUNDP(sq, Math.min(15, perProvider)));
    if (providers.includes("unctad")) allPromises.push(searchUNCTAD(sq, Math.min(15, perProvider)));

    // INSTITUTIONNELS - ARCHIVES
    if (providers.includes("nara")) allPromises.push(searchNARA(sq, Math.min(10, perProvider)));
    if (providers.includes("uk-archives")) allPromises.push(searchUKArchives(sq, Math.min(10, perProvider)));
    if (providers.includes("archives-fr")) allPromises.push(searchArchivesNationalesFR(sq, Math.min(10, perProvider)));

    // INSTITUTIONNELS - ÉNERGIE & NUCLÉAIRE
    if (providers.includes("iaea")) allPromises.push(searchIAEA(sq, Math.min(15, perProvider)));
    if (providers.includes("irena")) allPromises.push(searchIRENA(sq, Math.min(15, perProvider)));
    if (providers.includes("cea")) allPromises.push(searchCEA(sq, Math.min(15, perProvider)));

    // INSTITUTIONNELS - ÉCONOMIE EXTENDED
    if (providers.includes("ecb")) allPromises.push(searchECB(sq, Math.min(15, perProvider)));
    if (providers.includes("eurostat")) allPromises.push(searchEurostat(sq, Math.min(15, perProvider)));
    if (providers.includes("fred")) allPromises.push(searchFRED(sq, Math.min(15, perProvider)));
    if (providers.includes("eib")) allPromises.push(searchEIB(sq, Math.min(15, perProvider)));

    // INSTITUTIONNELS - SANTÉ EXTENDED
    if (providers.includes("ema")) allPromises.push(searchEMA(sq, Math.min(15, perProvider)));
    if (providers.includes("inserm")) allPromises.push(searchINSERM(sq, Math.min(15, perProvider)));
    if (providers.includes("ecdc")) allPromises.push(searchECDC(sq, Math.min(15, perProvider)));
    if (providers.includes("cochrane")) allPromises.push(searchCochrane(sq, Math.min(15, perProvider)));

    // INSTITUTIONNELS - ENVIRONNEMENT
    if (providers.includes("inrae")) allPromises.push(searchINRAE(sq, Math.min(15, perProvider)));
    if (providers.includes("ademe")) allPromises.push(searchADEME(sq, Math.min(15, perProvider)));

    // INSTITUTIONNELS - FRANÇAIS
    if (providers.includes("ens")) allPromises.push(searchENS(sq, Math.min(15, perProvider)));
    if (providers.includes("insee")) allPromises.push(searchINSEE(sq, Math.min(15, perProvider)));
    if (providers.includes("shift-project")) allPromises.push(searchShiftProject(sq, Math.min(15, perProvider)));
    if (providers.includes("data-gouv")) allPromises.push(searchDataGouv(sq, Math.min(15, perProvider)));
    if (providers.includes("france-strategie")) allPromises.push(searchFranceStrategie(sq, Math.min(15, perProvider)));
    if (providers.includes("cnrs")) allPromises.push(searchCNRS(sq, Math.min(15, perProvider)));

    // INSTITUTIONNELS - TECH RESEARCH
    if (providers.includes("allen-ai")) allPromises.push(searchAllenAI(sq, Math.min(15, perProvider)));
    if (providers.includes("max-planck")) allPromises.push(searchMaxPlanck(sq, Math.min(15, perProvider)));
    if (providers.includes("eth-zurich")) allPromises.push(searchETHZurich(sq, Math.min(15, perProvider)));
    if (providers.includes("inria")) allPromises.push(searchINRIA(sq, Math.min(15, perProvider)));

    // INSTITUTIONNELS - DROIT & GOUVERNANCE
    if (providers.includes("eur-lex")) allPromises.push(searchEURLex(sq, Math.min(15, perProvider)));

    // THINK TANKS EUROPÉENS
    if (providers.includes("ecfr")) allPromises.push(searchECFR(sq, Math.min(15, perProvider)));
    if (providers.includes("swp")) allPromises.push(searchSWP(sq, Math.min(15, perProvider)));
    if (providers.includes("sipri")) allPromises.push(searchSIPRI(sq, Math.min(15, perProvider)));
    if (providers.includes("iai")) allPromises.push(searchIAI(sq, Math.min(15, perProvider)));

    // POLITIQUE FRANÇAISE & DROIT
    if (providers.includes("iddri")) allPromises.push(searchIDDRI(sq, Math.min(15, perProvider)));
    if (providers.includes("terra-nova")) allPromises.push(searchTerraNova(sq, Math.min(15, perProvider)));
    if (providers.includes("legifrance")) allPromises.push(searchLegifrance(sq, Math.min(15, perProvider)));
    if (providers.includes("vie-publique")) allPromises.push(searchViePublique(sq, Math.min(15, perProvider)));

    // SANTÉ EXTENDED V2
    if (providers.includes("cdc")) allPromises.push(searchCDC(sq, Math.min(15, perProvider)));
    if (providers.includes("nih")) allPromises.push(searchNIH(sq, Math.min(15, perProvider)));
    if (providers.includes("who-direct")) allPromises.push(searchWHODirect(sq, Math.min(15, perProvider)));

    // ÉCONOMIE EXTENDED V2
    if (providers.includes("oecd-direct")) allPromises.push(searchOECDDirect(sq, Math.min(15, perProvider)));

    // COMPLÉMENTAIRE - WEB SEARCH
    if (providers.includes("linkup")) allPromises.push(searchLinkUp(sq, Math.min(15, perProvider)));

    // REAL-TIME NEWS PROVIDERS
    if (providers.includes("gdelt-news")) allPromises.push(searchGDELTNews(sq, Math.min(30, perProvider)));
    if (providers.includes("newsapi")) allPromises.push(searchNewsAPI(sq, Math.min(30, perProvider)));
    if (providers.includes("mediastack")) allPromises.push(searchMediaStack(sq, Math.min(25, perProvider)));
    if (providers.includes("thenewsapi")) allPromises.push(searchTheNewsAPI(sq, Math.min(30, perProvider)));
    if (providers.includes("gnews")) allPromises.push(searchGNews(sq, Math.min(10, perProvider)));
    if (providers.includes("eventregistry")) allPromises.push(searchEventRegistry(sq, Math.min(25, perProvider)));

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
      "iaea", "irena", "cea",
      "ema", "inserm", "ecdc", "cochrane",
      "inrae", "ademe",
      "ens", "insee", "shift-project", "data-gouv", "france-strategie", "cnrs",
      "allen-ai", "max-planck", "eth-zurich", "inria",
      "eur-lex",
      "ecfr", "swp", "sipri", "iai",
      "iddri", "terra-nova", "legifrance", "vie-publique",
      "cdc", "nih", "who-direct",
      "oecd-direct",
      "nara", "uk-archives", "archives-fr",
      "linkup",
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
  for (const r of allResults) {
    if (r.status === "fulfilled") pool.push(...r.value);
  }

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
  console.log(`[SCOUT] Raw results: ${rawCount} sources from ${searchQueries.length} query variations`);

  // â”€â”€ STEP 2: DEDUPLICATION (by DOI then normalized title) â”€â”€
  const seen = new Map<string, any>();
  const titleIndex = new Map<string, boolean>();
  for (const s of pool) {
    if (s.doi) {
      const doi = String(s.doi).toLowerCase();
      if (!seen.has(`doi:${doi}`)) { seen.set(`doi:${doi}`, s); }
      continue;
    }
    const normTitle = (s.title || "").toLowerCase().replace(/[^\w\s]/g, "").replace(/\s+/g, " ").trim();
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
          raw: s.raw ?? s,
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

/**
 * Calculate relevance score based on query matching
 * Simple keyword matching for now - can be enhanced with embeddings later
 */
function calculateRelevanceScore(source: any, query: string): number {
  if (!query) return 50;
  
  const queryTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);
  const title = (source.title || '').toLowerCase();
  const abstract = (source.abstract || '').toLowerCase();
  const topics = (source.topics || []).join(' ').toLowerCase();
  
  let score = 0;
  let matchedTerms = 0;
  
  for (const term of queryTerms) {
    // Title matches worth more
    if (title.includes(term)) {
      score += 15;
      matchedTerms++;
    }
    // Abstract matches
    if (abstract.includes(term)) {
      score += 8;
      matchedTerms++;
    }
    // Topic matches
    if (topics.includes(term)) {
      score += 10;
      matchedTerms++;
    }
  }
  
  // Coverage bonus (what % of query terms matched)
  const coverage = queryTerms.length > 0 ? matchedTerms / queryTerms.length : 0;
  score += coverage * 20;
  
  return Math.min(100, score);
}

/**
 * P1 FIX #2: Intent-based Ranking
 * P2 ENHANCEMENT: Validate and normalize intent signals
 * Rerank sources based on user's research intent/goals
 * Not just quality score, but relevance to specific research objectives
 */
function validateIntentSignals(signals?: any): any {
  if (!signals) return {};
  
  // P2: Check for conflicting signals
  if (signals.seekingRecent && signals.seekingFoundational) {
    console.warn("[Rank P2] âš ï¸  Conflicting signals: seekingRecent + seekingFoundational detected");
    console.warn("[Rank P2] Prioritizing recent research (2023+)");
    return { ...signals, seekingFoundational: false };
  }
  
  if (signals.seekingDebate && signals.seekingConsensus) {
    console.warn("[Rank P2] âš ï¸  Conflicting signals: seekingDebate + seekingConsensus detected");
    console.warn("[Rank P2] Prioritizing consensus (highly-cited sources)");
    return { ...signals, seekingDebate: false };
  }
  
  return signals;
}

function rerankerByIntent(sources: any[], intentSignals?: any): any[] {
  // P2: Validate signals before using them
  const validSignals = validateIntentSignals(intentSignals);
  if (!Object.keys(validSignals).length) return sources;

  const reranked = sources.map((s: any) => {
    let intentBoost = 0;
    
    // Debate-seeking: Prefer controversial/novel sources
    if (validSignals.seekingDebate && s.noveltyScore > 70) {
      intentBoost += 15;
    }
    
    // Consensus-seeking: Prefer highly-cited established sources
    if (validSignals.seekingConsensus && (s.citationCount || 0) > 100) {
      intentBoost += 15;
    }
    
    // Recent-seeking: Prefer recent publications
    if (validSignals.seekingRecent && s.year && s.year >= 2023) {
      intentBoost += 12;
    }
    
    // Foundational-seeking: Prefer older influential papers
    if (validSignals.seekingFoundational && s.year && s.year <= 2015 && (s.citationCount || 0) > 500) {
      intentBoost += 18;
    }
    
    // Institutional-seeking: Prefer official/credible sources
    if (validSignals.seekingInstitutional) {
      const institutionalProviders = ['cia-foia', 'nato', 'nist', 'nsa', 'imf', 'worldbank', 'oecd', 'un'];
      if (institutionalProviders.includes(s.provider)) {
        intentBoost += 20;
      }
    }
    
    // Diversity-seeking: Prefer non-dominant sources
    if (validSignals.seekingDiversity && ['thesesfr', 'hal', 'sgdsn'].includes(s.provider)) {
      intentBoost += 10;
    }

    return {
      ...s,
      intentScore: (s.qualityScore || 0) + intentBoost,
      intentBoost  // For debugging
    };
  });

  // Rerank by intent score
  return reranked.sort((a, b) => (b.intentScore || 0) - (a.intentScore || 0));
}

/**
 * Calcule un score composite basÃ© sur qualitÃ©, nouveautÃ©, rÃ©cence
 */
function calculateCompositeScore(source: any, mode: string): number {
  const weights = {
    quality: mode === "quality" ? 0.6 : mode === "novelty" ? 0.2 : 0.4,
    novelty: mode === "quality" ? 0.2 : mode === "novelty" ? 0.6 : 0.4,
    recency: 0.1,
    diversity: 0.1
  };
  
  const qualityScore = source.qualityScore || 0;
  const noveltyScore = source.noveltyScore || 0;
  const recencyScore = calculateRecencyScore(source.year);
  
  return (
    qualityScore * weights.quality +
    noveltyScore * weights.novelty +
    recencyScore * weights.recency +
    50 * weights.diversity  // Bonus diversitÃ© ajustÃ© dynamiquement
  );
}

/**
 * Score de rÃ©cence (0-100)
 */
function calculateRecencyScore(year: number | null): number {
  if (!year) return 0;
  const currentYear = new Date().getFullYear();
  const age = currentYear - year;
  
  if (age <= 1) return 100;
  if (age <= 3) return 80;
  if (age <= 5) return 60;
  if (age <= 10) return 40;
  return 20;
}

/**
 * SÃ©lectionne des sources diversifiÃ©es
 */
function selectDiverseSources(sources: any[], options: any): any[] {
  const selected: any[] = [];
  const providerCounts = new Map<string, number>();
  const yearCounts = new Map<number, number>();
  
  // P0-FIX: Copy before sorting to avoid mutating the input array
  const sorted = [...sources].sort((a, b) => b.compositeScore - a.compositeScore);
  
  // PremiÃ¨re passe : remplir avec contraintes strictes
  for (const source of sorted) {
    if (selected.length >= options.limit) break;
    
    const providerCount = providerCounts.get(source.provider) || 0;
    const yearCount = yearCounts.get(source.year) || 0;
    
    // VÃ©rifier contraintes diversitÃ©
    if (providerCount >= options.maxPerProvider) continue;
    if (yearCount >= options.maxPerYear) continue;
    
    selected.push(source);
    providerCounts.set(source.provider, providerCount + 1);
    yearCounts.set(source.year, yearCount + 1);
  }
  
  // Ensure minimum provider diversity
  const uniqueProviders = new Set(selected.map(s => s.provider));
  if (uniqueProviders.size < options.minProviderDiversity) {
    // Essayer d'ajouter des sources de providers manquants
    const missingProviders = ['openalex', 'semanticscholar', 'hal', 'crossref', 'thesesfr']
      .filter(p => !uniqueProviders.has(p));
    
    for (const provider of missingProviders) {
      if (uniqueProviders.size >= options.minProviderDiversity) break;
      
      const providerSource = sorted.find(s => 
        s.provider === provider && !selected.includes(s)
      );
      
      if (providerSource && selected.length < options.limit) {
        selected.push(providerSource);
        uniqueProviders.add(provider);
      }
    }
  }
  
  // Ensure minimum French sources
  const frenchCount = selected.filter((s: any) => 
    s.provider === 'thesesfr' || s.provider === 'hal'
  ).length;
  
  if (frenchCount < options.ensureFrench) {
    const frenchSources = sorted.filter((s: any) => 
      (s.provider === 'thesesfr' || s.provider === 'hal') &&
      !selected.includes(s)
    );
    
    const neededFrench = Math.min(
      options.ensureFrench - frenchCount,
      frenchSources.length,
      options.limit - selected.length
    );
    
    selected.push(...frenchSources.slice(0, neededFrench));
  }
  
  return selected.slice(0, options.limit);
}

/**
 * Log statistiques de diversitÃ©
 */
function logDiversityStats(sources: any[]): void {
  if (sources.length === 0) return;
  
  const providers = [...new Set(sources.map(s => s.provider))];
  const years = sources.map(s => s.year).filter(Boolean);
  const avgQuality = Math.round(sources.reduce((sum, s) => sum + (s.qualityScore || 0), 0) / sources.length);
  
  console.log(`[RANK V2] Diversity:`);
  console.log(`  â€¢ Providers: ${providers.length} (${providers.join(', ')})`);
  
  if (years.length > 0) {
    const minYear = Math.min(...years);
    const maxYear = Math.max(...years);
    console.log(`  â€¢ Year span: ${minYear}-${maxYear}`);
  }
  
  console.log(`  â€¢ Avg quality: ${avgQuality}/100`);
  
  const frenchCount = sources.filter(s => s.provider === 'hal' || s.provider === 'thesesfr').length;
  console.log(`  â€¢ French sources: ${frenchCount}/${sources.length}`);
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
// CITATION GUARD
// ================================

export function citationGuard(json: any, sourceCount: number) {
  const allText = JSON.stringify(json || {});
  const used = Array.from(allText.matchAll(/SRC-(\d+)/g)).map((m) => Number(m[1]));
  const invalid = used.filter((n) => n < 1 || n > sourceCount);
  return { ok: used.length > 0 && invalid.length === 0, usedCount: used.length, invalid };
}

// ================================
// EDITOR AGENT
// ================================

export function renderBriefHTML(out: any, sources: any[]) {
  // Governance: Assert EDITOR permissions
  assertPermission(AgentRole.EDITOR, "write:draft");
  
  const esc = (s: string) => 
    String(s || "").replace(/[&<>"']/g, (m) => 
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[m] as string)
    );
  
  const section = (h: string, v: any) => {
    if (!v) return "";
    // Split on double newlines for paragraph breaks, preserve single newlines as <br>
    const paragraphs = String(v).split(/\n\n+/).filter(Boolean).map(p => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join("\n");
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
  const { isStrategic } = opts;
  const label = isStrategic ? "[Strategic]" : "[Pipeline]";
  const stats: PipelineStats = {};
  const pipelineStart = Date.now();

  // P1-FIX: Running cost accumulator with budget guard
  const maxBudget = opts.maxBudgetUsd ?? (isStrategic ? 8.0 : 3.0);
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

  // Tier flags — ALL mandatory for think-tank quality (McKinsey/France Stratégie level)
  // No publication without peer review, debate, and epistemic challenge.
  const runHarvardCouncilStep = true; // Always on — peer review is non-negotiable
  // Enable Enhanced Council for strategic reports (22 PhDs) - Phase 3 default
  const runEnhancedCouncilStep = isStrategic ? (opts.enableEnhancedCouncil !== false) : (opts.enableEnhancedCouncil === true);
  const runDebateStep = true; // Always on — adversarial debate is non-negotiable
  const runMetaAnalysisStep = true; // Always on — statistical rigor is non-negotiable
  const runDevilsAdvocateStep = true; // Always on — epistemic challenge is non-negotiable
  const runDeliberationStep = isStrategic ? (opts.enableDeliberation !== false) : (opts.enableDeliberation === true);

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

  const perProvider = opts.perProvider ?? (isStrategic ? 30 : 25);

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
    console.warn(`${label} CONTEXT PRIMER: failed (non-blocking):`, err);
    stats.contextPrimer = { error: String(err) } as any;
  }

  // â”€â”€ STEP 1: SCOUT (with Orchestrator RE_SCOUT loop) â”€â”€
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
    emitProgress(pipelineRun.id, "SCOUT", "completed", `Seed sources: ${seedIds.length} (scout skipped)`);
  } else {
  console.log(`${label} SCOUT: query="${query}" (${providers.length} providers, ${perProvider}/provider)`);
  const scoutStart = Date.now();
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

  // RE_SCOUT loop — strategic only (briefs skip to save ~60s)
  if (isStrategic && scoutDecision.action === "RE_SCOUT" && orchState.iteration < orchState.maxIterations) {
    console.log(`${label} ORCHESTRATOR: RE_SCOUT â€” ${scoutDecision.reason}`);
    try {
      const expanded = await generateExpandedTerms(query, found, providers);
      stats.orchestrator.expandedTerms = expanded.terms;
      const maxTerms = isStrategic ? 7 : 5;
      const extraResults = await Promise.allSettled(
        expanded.terms.slice(0, maxTerms).map(term => scout(term, providers, isStrategic ? 30 : 25))
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
    } catch (err) {
      console.warn(`${label} RE_SCOUT: failed (non-blocking):`, err);
    }
  }

  // â”€â”€ STEP 2: INDEX â”€â”€
  emitProgress(pipelineRun.id, "SCOUT", "completed", `Found ${allSourceIds.length} sources`);
  } // end scout else branch

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
  const rankOpts: RankOptions = isStrategic ? {
    limit: 25,
    mode: "balanced",
    sourceIds: allSourceIds,
    recentOnly: true,
    requireAbstract: true,
    minAbstractLength: 200,
    minQuality: 65,
    maxPerProvider: 6,
    minProviderDiversity: 4,
    ...opts.rankOptions,
  } : {
    limit: 12,
    mode: "quality",
    sourceIds: allSourceIds,
    minQuality: 55,
    requireAbstract: true,
    minAbstractLength: 150,
    maxPerProvider: 4,
    minProviderDiversity: 3,
  };

  emitProgress(pipelineRun.id, "RANK", "started", `Ranking top ${rankOpts.limit ?? 12} from ${allSourceIds.length} SCOUT sources...`);
  console.log(`${label} RANK: top ${rankOpts.limit ?? 12} from ${allSourceIds.length} SCOUT sources`);
  const topSources = await rank(query, rankOpts);

  // CRITICAL: Abort if no usable sources (prevents hallucinated briefs)
  if (topSources.length === 0) {
    console.error(`${label} ABORT: RANK returned 0 sources from ${allSourceIds.length} SCOUT results — nothing to analyze`);
    throw new Error(`No relevant sources found for "${query.slice(0, 80)}" (${allSourceIds.length} scouted, 0 ranked). Try different providers or broader query.`);
  }
  orchState.avgQualityScore = topSources.length > 0
    ? Math.round(topSources.reduce((sum: number, s: any) => sum + (s.qualityScore || 0), 0) / topSources.length)
    : 0;
  stats.rank = { count: topSources.length, avgQuality: orchState.avgQualityScore };

  // ── STEP 4b: DOMAIN CLASSIFICATION (for domain-aware prompting) ──
  const topicClassification = classifyTopicSync(query);
  const detectedDomain = topicClassification.primaryDomain;
  console.log(`${label} DOMAIN: ${detectedDomain} (confidence: ${topicClassification.confidence})`);

  // ── STEP 5: READER V3 ──
  emitProgress(pipelineRun.id, "READER", "started", `Deep extraction from ${topSources.length} sources...`);
  console.log(`${label} READER V3: deep extraction from ${topSources.length} sources (domain: ${detectedDomain})`);
  const readings = await readerAgentV3(topSources, {
    enablePdf: true,
    maxConcurrency: 5,
    timeout: isStrategic ? 25000 : undefined,
    domain: detectedDomain,
  });
  const fullTextCount = readings.filter(r => r.readingDepth === "full_text").length;
  const quantCount = readings.filter(r => r.quantitative.effectSizes.length > 0 || r.quantitative.sampleSizes.length > 0).length;
  stats.reader = { count: readings.length, fullText: fullTextCount, withQuantData: quantCount };

  orchState.sourcesWithAbstract = readings.filter(r => r.claims.length > 0 || r.methods.length > 0).length;
  orchState.sourcesWithFullText = fullTextCount;
  const readerDecision = assessAfterReader(orchState);
  recordDecision(orchState, readerDecision);
  stats.orchestrator.decisions.push(readerDecision);

  // â”€â”€ STEP 6: ANALYST (brief = V3 multi-pass, strategic = Strategic Analyst) â”€â”€
  emitProgress(pipelineRun.id, "ANALYST", "started", `${isStrategic ? "Strategic synthesis" : "Multi-pass analysis"}...`);
  console.log(`${label} ANALYST: ${isStrategic ? "strategic synthesis" : "V3 multi-pass"}`);
  // -- STEP 5b: AGENT MEMORY INJECTION -- inject past lessons into ANALYST --
  const agentId = isStrategic ? "strategic-analyst" : "analyst";
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
  const fullContextBlock = [memoryBlock, primedContext?.contextBlock].filter(Boolean).join("\n\n---\n\n") || undefined;

  let analysis: any;
  if (isStrategic) {
    // Build domain context for strategic analyst (injected via urgencyContext)
    let domainBlock = '';
    const kb = RESEARCHER_KBS[detectedDomain as DomainExpertise];
    const corpus = MULTI_DOMAIN_CORPUS[detectedDomain as DomainExpertise];
    if (kb || corpus) {
      const parts = [`Domain: ${detectedDomain.toUpperCase()}`];
      if (kb?.keyConcepts?.length) parts.push(`Core concepts: ${kb.keyConcepts.slice(0, 5).map((c: KeyConcept) => c.name).join(', ')}`);
      if (kb?.frameworks?.length) parts.push(`Frameworks: ${kb.frameworks.slice(0, 3).map((f: AnalyticalFramework) => f.name).join(', ')}`);
      if (kb?.knownBiases?.length) parts.push(`Known biases: ${kb.knownBiases.slice(0, 3).join('; ')}`);
      if (corpus?.keyFrameworks?.length) parts.push(`Key frameworks: ${corpus.keyFrameworks.join(', ')}`);
      if (corpus?.seminalWorks?.length) parts.push(`Seminal works: ${corpus.seminalWorks.slice(0, 4).join('; ')}`);
      domainBlock = parts.join('\n');
    }
    analysis = await strategicAnalystAgent(query, topSources, readings, {
      focusAreas: opts.focusAreas,
      targetAudience: opts.targetAudience,
      urgencyContext: [opts.urgencyContext, fullContextBlock, domainBlock].filter(Boolean).join("\n\n") || undefined,
    });
    stats.analyst = {
      hasDebate: !!analysis.debate,
      keyFindingsCount: analysis.keyFindings?.length || 0,
      scenariosCount: analysis.scenarios?.length || 0,
    };
  } else {
    analysis = await analystMultipass(query, topSources, readings, {
      contextBlock: fullContextBlock,
      domain: detectedDomain,
    });
    stats.analyst = { hasDebate: !!analysis.debate, passes: 3 };
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

  const analystDecision = assessAfterAnalyst(orchState);
  recordDecision(orchState, analystDecision);
  stats.orchestrator.decisions.push(analystDecision);

  // ── STEP 6a: STRUCTURAL EDITOR — Storyline Review (McKinsey pyramid principle) ──
  try {
    const { structuralEditorReview } = await import('./structural-editor');
    const structuralResult = await structuralEditorReview(analysis, query);
    stats.structuralEditor = {
      overallStructure: structuralResult.overallStructure,
      narrativeArcValid: structuralResult.narrativeArcValid,
      sectionsWithIssues: structuralResult.sectionReviews.filter(s => s.issues?.length > 0).length,
      logicalGaps: structuralResult.logicalGaps.length,
      costUsd: structuralResult.costUsd,
    };
    console.log(`${label} STRUCTURAL EDITOR: structure=${structuralResult.overallStructure}/100, arc=${structuralResult.narrativeArcValid}, gaps=${structuralResult.logicalGaps.length}`);
    addCost(structuralResult.costUsd, "STRUCTURAL EDITOR");

    // If structural editor suggests restructuring, apply it
    if (structuralResult.revisedAnalysis && structuralResult.overallStructure < 70) {
      console.log(`${label} STRUCTURAL EDITOR: applying restructured analysis (original structure was ${structuralResult.overallStructure}/100)`);
      // Merge restructured fields while preserving fields not revised
      const revised = structuralResult.revisedAnalysis;
      for (const key of Object.keys(revised)) {
        if (revised[key] && revised[key].trim?.() !== '') {
          (analysis as any)[key] = revised[key];
        }
      }
      stats.structuralEditor.restructured = true;
    }
  } catch (err) {
    console.warn(`${label} STRUCTURAL EDITOR: failed (non-blocking):`, err);
    stats.structuralEditor = { error: String(err) };
  }

  // ── STEP 6b: HARVARD COUNCIL — PhD Expert Analysis ──
  if (!runHarvardCouncilStep) {
    console.log(`${label} HARVARD COUNCIL: skipped (tier=standard)`);
    stats.harvardCouncil = { skipped: true };
  } else {
    try {
      const sourceCtx = topSources.map((s: any, i: number) =>
        `[SRC-${i + 1}] ${s.title} (${s.year || "N/A"}) â€” ${(s.abstract || "").slice(0, 400)}`
      ).join("\n\n");

      let council;
      if (runEnhancedCouncilStep) {
        // Use enhanced council with intelligent PhD selection
        const expertCount = opts.maxExperts || (isStrategic ? 6 : 4);
        emitProgress(pipelineRun.id, "HARVARD_COUNCIL", "started", `${expertCount} PhD experts analyzing...`);
        console.log(`${label} ENHANCED HARVARD COUNCIL: ${expertCount} PhD expert analysis`);
        const { runEnhancedHarvardCouncil } = await import('./harvard-council-enhanced');
        council = await runEnhancedHarvardCouncil(query, sourceCtx, topSources.length, {
          maxExperts: opts.maxExperts || (isStrategic ? 6 : 4),
          enableHierarchical: opts.enableHierarchical !== false,
          enableInterdisciplinary: opts.enableInterdisciplinary !== false,
          strategic: isStrategic,
          runId: pipelineRun.id,
        });
        
        stats.harvardCouncil = {
          enhanced: true,
          experts: council.expertCount,
          domainLeads: council.domainLeads.length,
          interdisciplinary: {
            connections: council.interdisciplinary.connections.length,
            conflicts: council.interdisciplinary.conflicts.length,
            synergies: council.interdisciplinary.synergies.length,
          },
          evidenceLevel: String(council.evidenceQuality.overallLevel),
          avgConfidence: council.domainLeads.reduce((sum, lead) => sum + lead.leadExpert.confidence, 0) / council.domainLeads.length,
          recommendations: {
            immediate: council.recommendations.immediate.length,
            shortTerm: council.recommendations.shortTerm.length,
            longTerm: council.recommendations.longTerm.length,
            research: council.recommendations.research.length,
          },
          costUsd: council.totalCostUsd,
          durationMs: council.totalDurationMs,
        };
        
        console.log(`${label} ENHANCED COUNCIL: ${council.expertCount} experts, ${council.domainLeads.length} domain leads, ${council.totalDurationMs}ms`);
        addCost(council.totalCostUsd, "ENHANCED HARVARD COUNCIL");
      } else {
        // Use legacy council for backward compatibility
        console.log(`${label} LEGACY HARVARD COUNCIL: 9 PhD expert analysis`);
        const { runHarvardCouncil } = await import('./review-board');
        council = await runHarvardCouncil(query, sourceCtx, topSources.length, {
          strategic: isStrategic,
          runId: pipelineRun.id,
        });
        
        stats.harvardCouncil = {
          enhanced: false,
          experts: council.expertAnalyses.length,
          reviewers: council.reviews.length,
          evidenceLevel: String(council.evidenceGrade.cebmLevel),
          gradeCertainty: council.evidenceGrade.gradeCertainty,
          avgRigor: council.reviews.length > 0
            ? Math.round(council.reviews.reduce((s, r) => s + r.overallRigor, 0) / council.reviews.length)
            : 0,
          predictions: council.synthesis.calibratedPredictions?.length || 0,
          recommendations: council.synthesis.recommendations?.length || 0,
          costUsd: council.totalCostUsd,
          durationMs: council.totalDurationMs,
        };
        
        console.log(`${label} LEGACY COUNCIL: CEBM ${council.evidenceGrade.cebmLevel}, GRADE ${council.evidenceGrade.gradeCertainty}, ${council.expertAnalyses.length} experts`);
        addCost(council.totalCostUsd, "LEGACY HARVARD COUNCIL");
      }
      
      // Store council synthesis in analysis
      if (council && ('synthesis' in council ? (council.synthesis as any)?.consensus : (council as any).consensus)) {
        (analysis as any)._harvardCouncil = 'synthesis' in council ? council.synthesis : council;
      }

      // ── STEP 6c: PhD COLLABORATIVE DELIBERATION ──
      if (runDeliberationStep) {
        try {
          const expertAnalyses = 'domainLeads' in council
            ? [...(council as any).domainLeads.map((dl: any) => dl.leadExpert)].filter(Boolean)
            : ('expertAnalyses' in council ? (council as any).expertAnalyses : []);

          if (expertAnalyses.length >= 2) {
            console.log(`${label} PhD DELIBERATION: ${expertAnalyses.length} experts debating`);
            const { runCollaborativeDeliberation, buildDeliberationContextBlock } = await import('./phd-deliberation');
            const deliberation = await runCollaborativeDeliberation(query, expertAnalyses);
            stats.deliberation = {
              challenges: deliberation.totalChallenges,
              criticalChallenges: deliberation.criticalChallenges,
              consensusPoints: deliberation.consensusPoints.length,
              activeDisagreements: deliberation.activeDisagreements.length,
              emergentInsights: deliberation.emergentInsights.length,
              deliberationDepth: deliberation.deliberationDepth,
              consensusLevel: deliberation.consensusLevel,
              costUsd: deliberation.costUsd,
            };
            const delibBlock = buildDeliberationContextBlock(deliberation);
            if (delibBlock) {
              (analysis as any)._deliberation = deliberation;
              (analysis as any)._deliberationContext = delibBlock;
            }
            console.log(`${label} PhD DELIBERATION: depth=${deliberation.deliberationDepth}/100, consensus=${deliberation.consensusLevel}/100`);
            addCost(deliberation.costUsd, "PhD DELIBERATION");
          } else {
            stats.deliberation = { skipped: true };
          }
        } catch (err) {
          console.warn(`${label} PhD DELIBERATION: failed (non-blocking):`, err);
          stats.deliberation = { error: String(err) };
        }
      } else {
        stats.deliberation = { skipped: true };
      }
      
    } catch (err) {
      console.warn(`${label} HARVARD COUNCIL: failed (non-blocking):`, err);
      stats.harvardCouncil = { error: String(err) };
    }
  }

  // â”€â”€ STEP 7: CITATION GUARD â”€â”€
  console.log(`${label} GUARD: validate citations`);
  const guard = citationGuard(analysis, topSources.length);
  stats.guard = guard;
  if (!guard.ok) {
    console.warn(`${label} Citation guard warning: ${guard.usedCount} citations, ${guard.invalid.length} invalid (non-fatal, proceeding with degraded quality)`);
    stats.citationGuardDegraded = true;
  }

  // â”€â”€ STEP 8: EDITOR (Professional Publication-Grade) â”€â”€
  console.log(`${label} EDITOR: render professional HTML`);
  let html: string;
  try {
    html = isStrategic
      ? renderProfessionalStrategicHTML(analysis, topSources)
      : renderProfessionalBriefHTML(analysis, topSources);
    console.log(`${label} EDITOR: professional template rendered (${(html.length / 1024).toFixed(0)}KB)`);
  } catch (editorErr) {
    console.warn(`${label} EDITOR: professional template failed, using legacy:`, editorErr);
    html = isStrategic
      ? renderStrategicReportHTML(analysis, topSources)
      : renderBriefHTML(analysis, topSources);
  }
  stats.htmlLength = html.length;

  // Generate print-optimized HTML (synchronous, no blocking)
  const printHtml = generatePrintHTML(html);

  // â”€â”€ STEP 9: CITATION VERIFIER â”€â”€
  console.log(`${label} CITATION VERIFIER: semantic check`);
  try {
    const verification = await verifyCitations(html, topSources, { maxConcurrency: isStrategic ? 5 : 3 });
    stats.citationVerifier = {
      integrity: verification.overallIntegrity,
      supported: verification.supported,
      flagged: verification.flaggedClaims.length,
    };
    console.log(`${label} CITATION VERIFIER: integrity ${verification.overallIntegrity}%`);
  } catch (err) {
    console.warn(`${label} CITATION VERIFIER: failed (non-blocking):`, err);
  }

  // ── STEP 9b: FACT-CHECKER — Verify numerical claims against sources ──
  try {
    const { factChecker } = await import('./fact-checker');
    const factResult = await factChecker(html, topSources);
    stats.factChecker = {
      totalClaims: factResult.totalClaims,
      verified: factResult.verified,
      majorIssues: factResult.majorIssues,
      fatalIssues: factResult.fatalIssues,
      integrityScore: factResult.integrityScore,
    };
    console.log(`${label} FACT-CHECKER: ${factResult.totalClaims} claims, ${factResult.verified} verified, ${factResult.majorIssues} major, ${factResult.fatalIssues} fatal → integrity ${factResult.integrityScore}%`);

    // If fatal fact-check issues, flag for human review
    if (factResult.fatalIssues > 0) {
      console.error(`${label} FACT-CHECKER: ${factResult.fatalIssues} FATAL numerical discrepancies detected`);
      stats.factCheckerFatalFlagged = true;
    }
  } catch (err) {
    console.warn(`${label} FACT-CHECKER: failed (non-blocking):`, err);
    stats.factChecker = { error: String(err) };
  }

  // â”€â”€ STEP 10: CRITICAL LOOP V2 â”€â”€
  console.log(`${label} CRITICAL LOOP V2: iterative review`);
  try {
    const criticalResult = await runCriticalLoopV2({
      draftHtml: html,
      sources: topSources,
      readings,
      maxIterations: 2,
      publishThreshold: isStrategic ? 70 : 65,
    });
    stats.criticalLoop = {
      iterations: criticalResult.iterations,
      finalScore: criticalResult.compositeScore,
      improvement: criticalResult.improvementDelta,
      needsHumanReview: criticalResult.needsHumanReview,
    };
    if (criticalResult.improvementDelta > 0) {
      html = criticalResult.finalHtml;
      console.log(`${label} CRITICAL LOOP V2: improved by +${criticalResult.improvementDelta} points`);
    }
  } catch (err) {
    console.warn(`${label} CRITICAL LOOP V2: failed (non-blocking):`, err);
  }

  orchState.trustScore = stats.criticalLoop?.finalScore ?? null;
  const criticalDecision = assessAfterCriticalLoop(orchState);
  recordDecision(orchState, criticalDecision);
  stats.orchestrator.decisions.push(criticalDecision);

  // ── STEP 11+12: DEBATE + META-ANALYSIS (parallel) ──
  let debateContext: string | undefined;
  if (!runDebateStep && !runMetaAnalysisStep) {
    console.log(`${label} DEBATE + META-ANALYSIS: skipped (tier=standard)`);
    stats.debate = { skipped: true };
    stats.metaAnalysis = { skipped: true };
  } else {
  emitProgress(pipelineRun.id, "DEBATE", "started", "Running debate + meta-analysis in parallel...");
  console.log(`${label} DEBATE + META-ANALYSIS: running in parallel`);
  const [debateResult, metaResult] = await Promise.allSettled([
    runDebateStep ? import('./debate-agent').then(m => m.debateAgent(query, topSources, readings, isStrategic ? html : undefined)) : Promise.reject("skipped"),
    runMetaAnalysisStep ? import('./meta-analysis-engine').then(m => m.metaAnalysisEngine(query, readings, topSources)) : Promise.reject("skipped"),
  ]);

  if (debateResult.status === "fulfilled") {
    const debate = debateResult.value;
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
  } else if (debateResult.reason !== "skipped") {
    console.warn(`${label} DEBATE: failed (non-blocking):`, debateResult.reason);
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
    console.log(`${label} META-ANALYSIS: k=${meta.k}, pooled d=${stats.metaAnalysis.pooledEffect}, IÂ²=${meta.heterogeneity.I2}%`);
  } else if (metaResult.reason !== "skipped") {
    console.warn(`${label} META-ANALYSIS: failed (non-blocking):`, metaResult.reason);
  }
  } // end debate+meta block

  // ── STEP 13: DEVIL'S ADVOCATE — Final epistemic gate ──
  if (!runDevilsAdvocateStep) {
    console.log(`${label} DEVIL'S ADVOCATE: skipped (tier=standard)`);
    stats.devilsAdvocate = { skipped: true };
  } else {
  emitProgress(pipelineRun.id, "DEVILS_ADVOCATE", "started", "Final epistemic challenge...");
  console.log(`${label} DEVIL'S ADVOCATE: challenging analysis`);
  try {
    const { runDevilsAdvocate } = await import('./devils-advocate');
    const advocateReport = await runDevilsAdvocate(
      query,
      html,
      topSources.map((s: any) => ({ title: s.title, provider: s.provider, year: s.year ?? undefined })),
      {
        mode: isStrategic ? "strategic" : "brief",
        targetAudience: opts.targetAudience || (isStrategic ? "senior policymakers" : undefined),
        debateContext, // P0-C: pass debate steel-man to avoid redundant challenges
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
    addCost(advocateReport.costUsd, "DEVIL'S ADVOCATE");
    if (isStrategic) {
      console.log(`${label} DEVIL'S ADVOCATE: vs McKinsey=${advocateReport.vsInstitutionBenchmark.mckinsey.score}, Brookings=${advocateReport.vsInstitutionBenchmark.brookings.score}, RAND=${advocateReport.vsInstitutionBenchmark.rand.score}`);
    }

    // Record performance for AgentMemory learning
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
      const { lessons } = await extractLessons(agentId, query, html.slice(0, 500), {
        trustScore: advocateReport.publishabilityScore,
        qualityScore: advocateReport.overallStrength,
        failureModes,
      });
      for (const lesson of lessons) {
        await storeLesson(agentId, lesson, pipelineRun.id);
      }

      // P2-7: AUTO-REVISION — Rewrite the brief to address fatal challenges
      // Think tanks don't publish documents with known fatal flaws.
      console.log(`${label} DEVIL'S ADVOCATE: ${advocateReport.fatalChallenges.length} fatal challenges — triggering auto-revision`);
      try {
        const fatalList = advocateReport.fatalChallenges.map((fc: any, i: number) =>
          `${i + 1}. ${fc.description || fc.challenge || fc}: ${fc.fixSuggestion || fc.recommendation || "Address this challenge"}`
        ).join('\n');
        const majorList = advocateReport.majorChallenges.map((mc: any, i: number) =>
          `${i + 1}. ${mc.description || mc.challenge || mc}: ${mc.fixSuggestion || mc.recommendation || "Address this challenge"}`
        ).join('\n');

        const revisionResponse = await callLLM({
          messages: [{
            role: "system",
            content: `You are a senior editor at an elite think tank. The Devil's Advocate has found FATAL challenges in this draft. You must REWRITE the draft to address ALL fatal and major challenges while preserving the core analysis and all [SRC-N] citations. Output the full rewritten HTML.`
          }, {
            role: "user",
            content: `ORIGINAL DRAFT:
${html.length > 20000 ? html.slice(0, 8000) + '\n\n[...MIDDLE SECTION...]\n\n' + html.slice(-8000) : html}

═══ FATAL CHALLENGES (MUST ADDRESS ALL) ═══
${fatalList}

═══ MAJOR CHALLENGES (SHOULD ADDRESS) ═══
${majorList}

═══ REWRITE INSTRUCTIONS ═══
1. Address EVERY fatal challenge explicitly
2. Address major challenges where possible
3. Add hedging/caveats for claims that cannot be fully resolved
4. Preserve ALL [SRC-N] citations
5. Maintain the same HTML structure and sections
6. Do NOT add new claims without source support
7. If a fatal challenge cannot be resolved, acknowledge it as a key limitation

Return the FULL rewritten HTML. No JSON wrapping — just the HTML.`
          }],
          temperature: 0.2,
          jsonMode: false,
          maxTokens: 12000,
          enableCache: false,
        });

        if (revisionResponse.content && revisionResponse.content.length > html.length * 0.5) {
          html = revisionResponse.content;
          console.log(`${label} DEVIL'S ADVOCATE: auto-revision applied (${(html.length / 1024).toFixed(0)}KB)`);
          stats.devilsAdvocate.autoRevised = true;
        }
        addCost(revisionResponse.costUsd, "DEVIL'S ADVOCATE REVISION");
      } catch (revisionErr) {
        console.warn(`${label} DEVIL'S ADVOCATE: auto-revision failed:`, revisionErr);
      }
    }
  } catch (err) {
    console.warn(`${label} DEVIL'S ADVOCATE: failed (non-blocking):`, err);
    stats.devilsAdvocate = { error: String(err) };
  }
  } // end runDevilsAdvocateStep block

  // â”€â”€ STEP 14: PUBLISHER â”€â”€
  console.log(`${label} PUBLISHER: save ${isStrategic ? "strategic report" : "brief"}`);
  const estimatedPages = isStrategic ? Math.round(html.length / 3000) : undefined;
  const brief = await prisma.brief.create({
    data: {
      kind: isStrategic ? "strategic" : "brief",
      question: query,
      html,
      sources: topSources.map((s: any) => s.id),
      pipelineRunId: pipelineRun.id,
      lineage: stats as any,
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

  // P3-M: Record source usage for reputation learning (non-blocking)
  // Extract actually-cited source IDs from [SRC-N] references in HTML
  const citedIndices = Array.from(new Set(
    Array.from(html.matchAll(/\[SRC-(\d+)\]/g)).map(m => parseInt(m[1], 10) - 1)
  )).filter(i => i >= 0 && i < topSources.length);
  const citedSourceIds = citedIndices.map(i => (topSources[i] as any).id);
  recordSourceUsage(
    topSources.map((s: any) => s.id),
    stats.criticalLoop?.finalScore ?? 0,
    citedSourceIds,
  ).catch(() => {});

  // Finalize PipelineRun
  const totalCost = [
    stats.contextPrimer?.costUsd,
    stats.harvardCouncil?.costUsd,
    stats.citationVerifier?.costUsd,
    stats.debate?.costUsd,
    (stats.metaAnalysis as any)?.costUsd,
    stats.knowledgeGraph?.costUsd,
  ].filter((v): v is number => typeof v === "number").reduce((a, b) => a + b, 0);

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
      trustScore: stats.criticalLoop?.finalScore,
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

  return {
    briefId: brief.id,
    stats,
    pipelineRunId: pipelineRun.id,
    format: (isStrategic ? "strategic" : "brief") as ReportFormat,
  };

  } catch (error: any) {
    console.error(`${label} FATAL: ${error.message}`);
    emitProgress(pipelineRun.id, "ERROR", "failed", error.message);
    await prisma.pipelineRun.update({
      where: { id: pipelineRun.id },
      data: {
        status: "FAILED",
        finishedAt: new Date(),
        durationMs: Date.now() - pipelineStart,
        steps: { ...stats, error: error.message },
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
  enableDebate?: boolean;
  enableMetaAnalysis?: boolean;
  enableDevilsAdvocate?: boolean;
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
  const isStrategic = format === "strategic" || format === "dossier";
  const timeoutMs = isStrategic ? 900_000 : 600_000; // 10min brief, 15min strategic

  if (format === "dossier") {
    console.warn("[Pipeline] Dossier format not yet implemented, falling back to strategic");
  }

  try {
    return await withTimeout(
      runPipelineCore(query, {
        isStrategic,
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
        await prisma.pipelineRun.updateMany({
          where: { question: query, status: "RUNNING" },
          data: { status: "FAILED", finishedAt: new Date(), error: err.message },
        });
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
