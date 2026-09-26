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
import { filterByRelevance, logRelevanceScores, evaluateWithCARE } from './relevance-scorer';
import { enhancedRank, type EnhancedRankedSource } from './enhanced-ranker';
import { rerankSources } from './cohere-reranker';
import { embedSourcesBatch } from './semantic-engine';
import { readerAgentV3 } from './reader-agent-v3';
import { analystAgentV3 as analystMultipass } from './analyst-multipass';
import { backfillMissingAnalyticalFields } from './strategic-analyst-agent';
import { rankSourcesByQuality } from './source-quality';
import { extractAndStoreConcepts } from './knowledge-graph';
import { primeContext } from './context-primer';
import { buildMemoryInjection, recordAgentPerformance, autoDetectFailureModes, extractLessons, storeLesson, recordLearningCycle } from './agent-memory';
import { extractAndStoreGaps, getRelevantGaps, markGapsFilled } from './gap-filler';
import { assessEvidenceSufficiency } from './enrichment-reasoner';
import { guardOutput } from './output-guard';
import { judge } from './local-judge';
import { initDurableRun, runDurableStep, durableKeyFor, markDurableComplete, durableResume, saveDurableStep } from './durable-execution';
import { generateStormPerspectives } from './research-patterns';
import { augmentThinkTankHtml, type PrimarySourceInput } from './think-tank-pack';
import { selfCorrectReader, selfCorrectAnalyst, reAnalyzeAfterGapFill } from './self-correction-integration';
import { createWitnessContext, buildObservation, buildLearningInjection, type WitnessContext } from './witness/integration';
import { runMixtureOfAgents, loadAgentWeights, updateAgentWeights } from './moa/mixture-of-agents';
import { buildWorldModelInjection, updateWorldModel } from './world-model/world-model';
import { createWorldEvolver, buildWorldEvolverInjection, recordEpisode, predictWithForesight, type WorldEvolverState } from './world-model/world-model';
import { callLLMWithCascade, type C3POCascadeConfig, DEFAULT_C3PO_CONFIG } from '../llm/unified-llm';
import { buildSelfPlayInjection, runSelfPlayRound } from './self-play/adversarial';
import { runEvolutionCycle } from './self-evolver';
import { extractFeatures, scoreStep, persistProcessStep, loadPRMModel, retrainPRM, type ProcessStep, type PRMModel } from './prm/process-reward-model';

// P1-PERF: Optional agents are lazy-loaded via dynamic import() to reduce cold start
// debateAgent, metaAnalysisEngine, runDevilsAdvocate, runHarvardCouncil,
// runEnhancedHarvardCouncil, runCollaborativeDeliberation, buildDeliberationContextBlock
import { recordSourceUsage } from './source-reputation-agent';
import { emitProgress } from './pipeline-progress';
import { selectSmartProviders } from './smart-provider-selector';
import { getHealthyProviders, recordProviderCall } from './provider-health-tracker';
import { searchExtendedProviders, getExtendedProvidersForDomain } from '../providers/registry-bridge';
import { filterLowQualitySources } from '../providers/source-quality-filter';
import { classifyTopic } from './topic-classifier';
import { isEditorialV2Enabled, getPipelineMaxBudgetUsd } from './editorial-config';
import { buildAnalysisReviewText } from './analysis-review-text';
import { runPeerReview, renderPeerReviewInjection } from './peer-reviewer';
import { evaluateBriefRAG } from './ragas-eval';
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
import { selectProviders, diversifyQueries, filterByCapability, type LLMCapability } from './radar-innovations';
import type { PipelineStats } from './pipeline-types';
import { createLineageTracker as createLineageTrackerTyped, recordTransformation as recordTransformationTyped } from './pipeline-types';
import { renderProfessionalBriefHTML, renderProfessionalStrategicHTML } from './editor-agent';
import { renderPositionFirstBriefHTML } from './position-first-renderer';
import { computeTrackRecordStats } from './track-record';

import { editorialArbiter } from './editorial-arbiter';
import { resolveCentralScenario, type CastingResult, type InstitutePosition } from './editorial-types';
import type { DebateResult } from './debate-agent';
import { runDebateMetaBlock, runDevilsAdvocateBlock, type DebateAdvocateDeps } from './pipeline-steps/debate-advocate';
import { registerPredictions } from './prediction-registration';
import { runPostRenderCitationAndGrounding as runCitationGroundingStep } from './pipeline-steps/citation-grounding';

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
// Heritage & historical sources (2026-08 expansion)
import { searchGallica } from "../providers/heritage/gallica";
import { searchEuropeana } from "../providers/heritage/europeana";
import { searchGutenberg } from "../providers/heritage/gutenberg";
import { searchDPLA } from "../providers/heritage/dpla";
import { searchWikisource } from "../providers/heritage/wikisource";
// Global South & regional (2026-08 expansion)
import { searchAJOL } from "../providers/global-south/ajol";
import { searchDialnet } from "../providers/global-south/dialnet";
import { searchShodhganga } from "../providers/global-south/shodhganga";
import { searchRISS } from "../providers/global-south/riss";
// Preprints & open-science data (2026-08 expansion)
import { searchChemRxiv } from "../providers/preprints/chemrxiv";
import { searchOSF } from "../providers/preprints/osf";
import { searchPreprintsOrg } from "../providers/preprints/preprints-org";
import { searchDryad } from "../providers/preprints/dryad";
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
// Grey Literature
import { searchOverton } from "../providers/overton";
// Foreign Academic Sources — Non-Western databases
import { searchCyberLeninka } from "../providers/foreign/cyberleninka";
import { searchWanfang } from "../providers/foreign/wanfang";
import { searchJStage } from "../providers/foreign/jstage";
import { searchSciELO } from "../providers/foreign/scielo";
import { searchELibrary } from "../providers/foreign/elibrary-ru";
import { searchISIDORE } from "../providers/isidore";
import { searchERIC } from "../providers/eric";
import { searchFAO } from "../providers/fao";
import { searchUNODC } from "../providers/unodc";
import { searchWorldBankData } from "../providers/worldbank-data";
import { searchUCDP, searchILOSTAT, searchOWID } from "../providers/stats-data";
import {
  searchComtrade, searchBLS, searchCensus, searchACLED,
  searchUNHCR, searchEStatJP, searchKOSIS, searchONS, searchIBGE,
  searchDataCommons,
} from "../providers/stats-keys";
import { searchSearxng } from "../providers/searxng";
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
import { searchOpenCitations } from "../providers/opencitations";
import { searchNewsData } from "../providers/newsdata-provider";
import { searchHuggingFacePapers } from "../providers/hf-papers-provider";
import { searchDataEuropa } from "../providers/data-europa-provider";
import { searchIETF } from "../providers/ietf-provider";
import { dedupSources } from "./dedup-doi";
import { filterRetracted } from "./retraction-watch";
import { tsSetRank } from "./ts-setrank";

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
  // Live statistics APIs (real numbers, no key required)
  | "worldbank-data" | "ucdp" | "ilostat" | "owid"
  // Key-gated national/international stats (free registration)
  | "comtrade" | "us-bls" | "us-census" | "acled" | "unhcr" | "estat-jp" | "kosis"
  | "ons-uk" | "ibge" | "datacommons"
  // Free metasearch floor (SearXNG — no key, self-hostable)
  | "searxng"
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
  // Grey Literature — Policy documents, government reports, think tank papers
  | "overton"
  // Foreign Academic Sources — Non-Western databases
  | "cyberleninka" | "wanfang" | "jstage" | "scielo" | "elibrary-ru"
  // Citation graph
  | "opencitations"
  // News (free tier)
  | "newsdata"
  // AI/ML papers with code
  | "hf-papers"
  // EU open data
  | "data-europa"
  // Mega feed registries (domain-routed sub-sources)
  | "mega-central-banks" | "mega-stats" | "mega-un" | "mega-eu" | "mega-press"
  | "mega-thinktanks" | "mega-development" | "mega-academia" | "mega-civil-society"
  // Internet standards
  | "ietf"
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
  // V3.2: MEGA FEED REGISTRY — 560+ sub-sources (domain-routed, max ~24 feeds/query)
  'mega-central-banks', 'mega-stats', 'mega-un', 'mega-eu', 'mega-press',
  'mega-thinktanks', 'mega-development', 'mega-academia', 'mega-civil-society',
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
  // Live statistics APIs
  'worldbank-data', 'ucdp', 'ilostat', 'owid',
  'comtrade', 'us-bls', 'us-census', 'acled', 'unhcr', 'estat-jp', 'kosis',
  'ons-uk', 'ibge', 'datacommons', 'searxng',
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
  // Grey Literature — 20M+ policy documents worldwide
  'overton',
  // Foreign Academic Sources — Non-Western databases
  'cyberleninka', 'wanfang', 'jstage', 'scielo', 'elibrary-ru',
  // Citation graph (free, no key)
  'opencitations',
  // News (free tier)
  'newsdata',
  // AI/ML papers with code & model links (free, no key)
  'hf-papers',
  // EU open data portal (free, no key)
  'data-europa',
  // IETF standards & internet-drafts (free, no key)
  'ietf',
];

export const NEWS_PROVIDERS = [
  'gdelt-news', 'newsapi', 'mediastack', 'thenewsapi', 'gnews', 'eventregistry',
  'independent-media', 'gdelt-independent', 'newsdata'
];

export const ACADEMIC_PROVIDERS = [
  'openalex', 'crossref', 'semanticscholar', 'pubmed', 'arxiv',
  'doaj', 'europepmc',
  // Foundational & foresight sources
  'ipcc', 'internet-archive', 'hathitrust', 'open-library', 'jstor', 'unesco',
  'club-of-rome', 'millennium-project',
  // Citation graph
  'opencitations',
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
 * Wrap a provider search promise so its outcome feeds the provider health
 * circuit breaker (recordProviderCall). 3 consecutive failures blacklist the
 * provider for 30 min — dead endpoints stop wasting scout wall-clock time.
 */
/**
 * Hard per-call deadline. Rate-limit queues + retries can stretch a single
 * provider call to many minutes (observed: 24min scout passes when dead
 * providers stack timeouts). Racing each call against a deadline bounds the
 * whole fan-out: Promise.allSettled resolves once every promise has either
 * completed or hit the deadline. The underlying request keeps running in the
 * background but its result is discarded — acceptable vs. a killed pipeline.
 */
const PROVIDER_CALL_DEADLINE_MS = Number(process.env.PROVIDER_CALL_DEADLINE_MS ?? 90_000);

function trackProviderCall<T extends any[]>(provider: string, promise: Promise<T>): Promise<T> {
  const start = Date.now();
  let settled = false;
  const timed = promise.then(
    (results) => {
      if (settled) return results;
      settled = true;
      recordProviderCall({ provider, success: true, responseMs: Date.now() - start, resultCount: results.length });
      return results;
    },
    (err: any) => {
      if (settled) throw err;
      settled = true;
      recordProviderCall({ provider, success: false, responseMs: Date.now() - start, error: String(err?.message || err).slice(0, 120) });
      throw err;
    },
  );
  const deadline = new Promise<T>((resolve) => setTimeout(() => {
    if (settled) return;
    settled = true;
    recordProviderCall({ provider, success: false, responseMs: Date.now() - start, error: `deadline ${PROVIDER_CALL_DEADLINE_MS / 1000}s exceeded` });
    console.warn(`[SCOUT] ${provider}: call deadline ${PROVIDER_CALL_DEADLINE_MS / 1000}s exceeded — dropping results`);
    resolve([] as unknown as T);
  }, PROVIDER_CALL_DEADLINE_MS));
  // Never reject: all call sites push into an array consumed LATER by
  // Promise.allSettled — with awaits (dynamic imports) in between. An early
  // rejection (e.g. circuit-breaker fail-fast) in that window is an unhandled
  // rejection and kills the process. The failure is already recorded above;
  // returning [] is identical to what allSettled did with rejected entries.
  return Promise.race([timed, deadline]).catch(() => [] as unknown as T);
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

  // ── STEP 0.5: NEURAL SOURCE ROUTING (D — RAGRoute 2025) ──
  // P2-I FIX: Neural routing is now opt-OUT instead of opt-IN.
  // Previously only activated when providerArr.length <= 3 or includes 'auto'.
  // Now activates for ALL queries unless explicitly disabled with 'no-routing'.
  // This ensures the 12 most relevant providers are always selected for the query,
  // avoiding wasted calls to irrelevant providers.
  try {
    const providerArr = providers as string[];
    const isExplicitlyDisabled = providerArr.includes('no-routing');
    const isDefaultSet = providerArr.length <= 3 || providerArr.includes('auto');
    if (!isExplicitlyDisabled) {
      const routed = await selectProviders(query, 12, false); // keyword-based (fast)
      const routedNames = routed.map(r => r.provider);
      // Merge: keep explicitly requested providers, add routed ones
      const merged = new Set([...providerArr.filter(p => p !== 'auto' && p !== 'no-routing'), ...routedNames]);
      console.log(`[SCOUT] Neural routing selected ${routedNames.length} providers: ${routedNames.slice(0, 8).join(', ')}...`);
      (scoutImpl as any)._routedProviders = [...merged];
    } else {
      (scoutImpl as any)._routedProviders = [...providerArr.filter(p => p !== 'no-routing')];
    }
  } catch (err) {
    console.warn('[SCOUT] Neural source routing failed (non-blocking):', err);
  }

  // ── STEP 0.6: SUBMODULAR QUERY DIVERSIFICATION (F — HERO, LREC 2026) ──
  // P2-K FIX: Lowered threshold from 5 to 3 — diversification now activates
  // when we have 3+ query variations (previously required 5+, which rarely
  // happened since enhancement only generates 3-4 variations).
  try {
    if (searchQueries.length > 3) {
      const diversified = diversifyQueries(searchQueries, 5, 0.4);
      const selected = diversified.filter(d => d.isSelected).map(d => d.query);
      if (selected.length > 0) {
        searchQueries = selected;
        console.log(`[SCOUT] Submodular diversification selected ${selected.length} diverse queries from ${diversified.length}`);
      }
    }
  } catch (err) {
    console.warn('[SCOUT] Query diversification failed (non-blocking):', err);
  }

  // ── STEP 0.7: PERSPECTIVE-GUIDED QUESTIONS (Co-STORM, EMNLP 2024) ──
  // Added AFTER diversification so expert-perspective queries are guaranteed
  // to survive into the final query set — they target dimensions the generic
  // enhancement/variations systematically miss (legal, historical, dissenting).
  try {
    const { generatePerspectiveQueries } = await import('./perspective-questions');
    const pq = await generatePerspectiveQueries(query, 4);
    if (pq.queries.length > 0) {
      searchQueries = [...searchQueries, ...pq.queries].slice(0, 14);
      console.log(`[SCOUT] Perspective-guided: +${pq.queries.length} queries from ${pq.perspectives.length} expert lenses (total ${searchQueries.length})`);
    }
  } catch (err) {
    console.warn('[SCOUT] Perspective question generation failed (non-blocking):', err);
  }

  // Dedup query variations (normalized) — enhancer + diversification +
  // perspective queries can emit near-identical strings; each duplicate costs
  // a full provider fan-out. Anti-saturation: no redundant provider calls.
  {
    const before = searchQueries.length;
    const seenQ = new Set<string>();
    searchQueries = searchQueries.filter(q => {
      const k = q.toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
      if (seenQ.has(k)) return false;
      seenQ.add(k);
      return true;
    });
    if (searchQueries.length < before) {
      console.log(`[SCOUT] Deduped query variations: ${before} → ${searchQueries.length}`);
    }
  }

  const pool: any[] = [];
  // Use routed providers if neural routing selected them; otherwise use the original set
  const routedProviders = (scoutImpl as any)._routedProviders as string[] | undefined;
  delete (scoutImpl as any)._routedProviders; // clean up
  const providerSet = new Set(routedProviders && routedProviders.length > 0 ? routedProviders : (providers as string[]));

  // ── DISABLE DEAD PROVIDERS ──
  // These providers consistently fail (expired API keys, dead endpoints, or persistent 403/404).
  // Keeping them active wastes time on retries/timeouts and pollutes logs.
  // They are removed from the provider set before any search calls are made.
  // To re-enable: fix the API key/endpoint and remove the provider name from this list.
  const DEAD_PROVIDERS = new Set([
    'jrc',        // HTTP 404 — endpoints obsolete (JRC API changed)
    'acer',       // HTTP 403 — access denied (ACER API requires auth that is not configured)
    'imf-sdmx',   // fetch failed — IMF SDMX API is down or unreachable from this network
    // Confirmed dead in 2026-09 live audit (scripts/audit-providers-live.ts):
    'ssrn',       // HTTP 403 permanent — Elsevier blocks programmatic access
    'osti',       // connection dead — osti.gov unreachable (curl 000)
    'cyberleninka', // API endpoint exists but undocumented (GET 405 / POST 400)
    'jstage',     // wrong endpoint — real J-STAGE API requires registration
    'scielo',     // api.scielo.org dead, search.scielo.org returns 403
    'elibrary-ru',// needs auth token; HTML scraping fallback broken
    'apitube',    // HTTP 404 — endpoint gone + requires key
    'papers-with-code', // domain now 302-redirects to huggingface.co/papers (PwC shut down by Meta, absorbed into HF — hf-papers covers it)
  ]);
  for (const dead of DEAD_PROVIDERS) {
    providerSet.delete(dead);
  }

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
    if (providerSet.has("openalex")) allPromises.push(trackProviderCall("openalex", searchOpenAlex(sq, perProvider)));
    if (providerSet.has("crossref")) allPromises.push(trackProviderCall("crossref", searchCrossref(sq, Math.min(50, perProvider))));
    if (providerSet.has("semanticscholar")) allPromises.push(trackProviderCall("semanticscholar", searchSemanticScholar(sq, Math.min(50, perProvider))));
    if (providerSet.has("arxiv")) allPromises.push(trackProviderCall("arxiv", searchArxiv(sq, Math.min(50, perProvider))));
    if (providerSet.has("hal")) allPromises.push(trackProviderCall("hal", searchHAL(sq, Math.min(50, perProvider))));
    if (providerSet.has("pubmed")) allPromises.push(trackProviderCall("pubmed", searchPubMed(sq, Math.min(50, perProvider))));
    if (providerSet.has("base")) allPromises.push(trackProviderCall("base", searchBASE(sq, Math.min(50, perProvider))));

    // ACADÉMIQUES — EXTENDED COVERAGE
    if (providerSet.has("core")) allPromises.push(trackProviderCall("core", searchCORE(sq, Math.min(30, perProvider))));
    if (providerSet.has("europepmc")) allPromises.push(trackProviderCall("europepmc", searchEuropePMC(sq, Math.min(30, perProvider))));
    if (providerSet.has("doaj")) allPromises.push(trackProviderCall("doaj", searchDOAJ(sq, Math.min(30, perProvider))));
    if (providerSet.has("ssrn")) allPromises.push(trackProviderCall("ssrn", searchSSRN(sq, Math.min(20, perProvider))));
    if (providerSet.has("repec")) allPromises.push(trackProviderCall("repec", searchRePEc(sq, Math.min(20, perProvider))));
    if (providerSet.has("nber")) allPromises.push(trackProviderCall("nber", searchNBER(sq, Math.min(20, perProvider))));
    if (providerSet.has("who-gho")) allPromises.push(trackProviderCall("who-gho", searchWHOGHO(sq, Math.min(20, perProvider))));
    if (providerSet.has("semantic-scholar-graph")) allPromises.push(trackProviderCall("semantic-scholar-graph", searchSemanticScholarGraph(sq, Math.min(25, perProvider))));

    // CONSOLIDATED INSTITUTIONS (V3.1) — single OpenAlex request for all ROR-filtered institutions
    // Replaces 30+ individual OpenAlex calls with 1-2 batched calls
    if (providerSet.has("consolidated-institutions")) {
      const { searchConsolidatedInstitutions } = await import("../providers/institutional/consolidated-institutions");
      allPromises.push(trackProviderCall("consolidated-institutions", searchConsolidatedInstitutions(sq, ['economic', 'defense', 'french', 'health', 'tech', 'multilateral'], Math.min(30, perProvider))));
    }

    // V3.1: GLOBAL OMNISCIENCE LAYER — 4 consolidated RSS-based providers covering 80+ organizations
    // Intelligence, International Orgs, Think Tanks, Science & Tech
    if (providerSet.has("global-intelligence")) {
      const { searchGlobalIntelligence } = await import("../providers/institutional/intelligence/global-intelligence");
      allPromises.push(trackProviderCall("global-intelligence", searchGlobalIntelligence(sq, Math.min(20, perProvider))));
    }
    if (providerSet.has("global-orgs")) {
      const { searchGlobalOrgs } = await import("../providers/institutional/international/global-orgs");
      allPromises.push(trackProviderCall("global-orgs", searchGlobalOrgs(sq, Math.min(25, perProvider))));
    }
    if (providerSet.has("global-think-tanks")) {
      const { searchGlobalThinkTanks } = await import("../providers/institutional/think-tanks/global-think-tanks");
      allPromises.push(trackProviderCall("global-think-tanks", searchGlobalThinkTanks(sq, Math.min(25, perProvider))));
    }
    if (providerSet.has("global-science")) {
      const { searchGlobalScience } = await import("../providers/institutional/science/global-science");
      allPromises.push(trackProviderCall("global-science", searchGlobalScience(sq, Math.min(20, perProvider))));
    }

    // V3.2: MEGA FEED REGISTRY — domain-routed subset search over 560+ sources.
    // Each mega-* provider internally selects only the ~24 most relevant feeds.
    {
      const megaNames = [
        "mega-central-banks", "mega-stats", "mega-un", "mega-eu", "mega-press",
        "mega-thinktanks", "mega-development", "mega-academia", "mega-civil-society",
      ] as const;
      const activeMega = megaNames.filter(n => providerSet.has(n));
      if (activeMega.length > 0) {
        const { searchFeedSubset } = await import("../providers/feeds");
        for (const n of activeMega) {
          allPromises.push(trackProviderCall(n, searchFeedSubset(n, sq, Math.min(20, perProvider))));
        }
      }
    }

    // INSTITUTIONNELS - INTELLIGENCE (these use direct APIs, not OpenAlex)
    if (providerSet.has("odni")) allPromises.push(trackProviderCall("odni", searchODNI(sq, Math.min(10, perProvider))));
    if (providerSet.has("cia-foia")) allPromises.push(trackProviderCall("cia-foia", searchCIAFOIA(sq, Math.min(10, perProvider))));
    if (providerSet.has("nsa")) allPromises.push(trackProviderCall("nsa", searchNSA(sq, Math.min(10, perProvider))));
    if (providerSet.has("uk-jic")) allPromises.push(trackProviderCall("uk-jic", searchUKJIC(sq, Math.min(10, perProvider))));

    // INSTITUTIONNELS - DÉFENSE (skip if consolidated is used)
    if (providerSet.has("nato") && !providerSet.has("consolidated-institutions")) allPromises.push(trackProviderCall("nato", searchNATO(sq, Math.min(15, perProvider))));
    if (providerSet.has("eeas") && !providerSet.has("consolidated-institutions")) allPromises.push(trackProviderCall("eeas", searchEEAS(sq, Math.min(15, perProvider))));
    if (providerSet.has("sgdsn") && !providerSet.has("consolidated-institutions")) allPromises.push(trackProviderCall("sgdsn", searchSGDSN(sq, Math.min(10, perProvider))));
    if (providerSet.has("eda") && !providerSet.has("consolidated-institutions")) allPromises.push(trackProviderCall("eda", searchEDA(sq, Math.min(10, perProvider))));

    // INSTITUTIONNELS - ÉCONOMIE
    if (providerSet.has("imf") && !providerSet.has("consolidated-institutions")) allPromises.push(trackProviderCall("imf", searchIMF(sq, Math.min(15, perProvider))));
    if (providerSet.has("worldbank") && !providerSet.has("consolidated-institutions")) allPromises.push(trackProviderCall("worldbank", searchWorldBank(sq, Math.min(15, perProvider))));
    if (providerSet.has("oecd") && !providerSet.has("consolidated-institutions")) allPromises.push(trackProviderCall("oecd", searchOECD(sq, Math.min(15, perProvider))));
    if (providerSet.has("bis") && !providerSet.has("consolidated-institutions")) allPromises.push(trackProviderCall("bis", searchBIS(sq, Math.min(15, perProvider))));

    // INSTITUTIONNELS - CYBER
    if (providerSet.has("nist") && !providerSet.has("consolidated-institutions")) allPromises.push(trackProviderCall("nist", searchNIST(sq, Math.min(10, perProvider))));
    if (providerSet.has("cisa")) allPromises.push(trackProviderCall("cisa", searchCISA(sq, Math.min(15, perProvider))));
    if (providerSet.has("enisa") && !providerSet.has("consolidated-institutions")) allPromises.push(trackProviderCall("enisa", searchENISA(sq, Math.min(10, perProvider))));

    // INSTITUTIONNELS - MULTILATÉRAL
    if (providerSet.has("un") && !providerSet.has("consolidated-institutions")) allPromises.push(trackProviderCall("un", searchUN(sq, Math.min(15, perProvider))));
    if (providerSet.has("undp") && !providerSet.has("consolidated-institutions")) allPromises.push(trackProviderCall("undp", searchUNDP(sq, Math.min(15, perProvider))));
    if (providerSet.has("unctad") && !providerSet.has("consolidated-institutions")) allPromises.push(trackProviderCall("unctad", searchUNCTAD(sq, Math.min(15, perProvider))));

    // INSTITUTIONNELS - ARCHIVES
    if (providerSet.has("nara")) allPromises.push(trackProviderCall("nara", searchNARA(sq, Math.min(10, perProvider))));
    if (providerSet.has("uk-archives")) allPromises.push(trackProviderCall("uk-archives", searchUKArchives(sq, Math.min(10, perProvider))));
    if (providerSet.has("archives-fr")) allPromises.push(trackProviderCall("archives-fr", searchArchivesNationalesFR(sq, Math.min(10, perProvider))));

    // INSTITUTIONNELS - ÉNERGIE & NUCLÉAIRE
    if (providerSet.has("iaea") && !providerSet.has("consolidated-institutions")) allPromises.push(trackProviderCall("iaea", searchIAEA(sq, Math.min(15, perProvider))));
    if (providerSet.has("irena") && !providerSet.has("consolidated-institutions")) allPromises.push(trackProviderCall("irena", searchIRENA(sq, Math.min(15, perProvider))));
    if (providerSet.has("cea") && !providerSet.has("consolidated-institutions")) allPromises.push(trackProviderCall("cea", searchCEA(sq, Math.min(15, perProvider))));
    if (providerSet.has("entsoe")) allPromises.push(trackProviderCall("entsoe", searchENTSOE(sq, Math.min(15, perProvider))));
    if (providerSet.has("jrc")) allPromises.push(trackProviderCall("jrc", searchJRC(sq, Math.min(15, perProvider))));
    if (providerSet.has("iea")) allPromises.push(trackProviderCall("iea", searchIEA(sq, Math.min(15, perProvider))));
    if (providerSet.has("acer")) allPromises.push(trackProviderCall("acer", searchACER(sq, Math.min(15, perProvider))));
    if (providerSet.has("entsog")) allPromises.push(trackProviderCall("entsog", searchENTSOG(sq, Math.min(15, perProvider))));
    if (providerSet.has("energy-charts")) allPromises.push(trackProviderCall("energy-charts", searchEnergyCharts(sq, Math.min(10, perProvider))));
    if (providerSet.has("smard")) allPromises.push(trackProviderCall("smard", searchSMARD(sq, Math.min(10, perProvider))));
    if (providerSet.has("rte-france")) allPromises.push(trackProviderCall("rte-france", searchRTEFrance(sq, Math.min(10, perProvider))));
    if (providerSet.has("energi-data")) allPromises.push(trackProviderCall("energi-data", searchEnergiDataService(sq, Math.min(10, perProvider))));
    if (providerSet.has("fingrid")) allPromises.push(trackProviderCall("fingrid", searchFingrid(sq, Math.min(10, perProvider))));

    // INSTITUTIONNELS - THINK TANKS
    if (providerSet.has("bruegel") && !providerSet.has("consolidated-institutions")) allPromises.push(trackProviderCall("bruegel", searchBruegel(sq, Math.min(15, perProvider))));

    // INSTITUTIONNELS - ENVIRONMENTAL
    if (providerSet.has("eea") && !providerSet.has("consolidated-institutions")) allPromises.push(trackProviderCall("eea", searchEEA(sq, Math.min(15, perProvider))));

    // INSTITUTIONNELS - ACADEMIC INDEPENDENT APIs
    if (providerSet.has("openreview")) allPromises.push(trackProviderCall("openreview", searchOpenReview(sq, Math.min(20, perProvider))));
    if (providerSet.has("biorxiv")) allPromises.push(trackProviderCall("biorxiv", searchBioRxiv(sq, Math.min(20, perProvider))));
    if (providerSet.has("papers-with-code")) allPromises.push(trackProviderCall("papers-with-code", searchPapersWithCode(sq, Math.min(20, perProvider))));
    if (providerSet.has("mit-dspace")) allPromises.push(trackProviderCall("mit-dspace", searchMITDSpace(sq, Math.min(15, perProvider))));
    if (providerSet.has("harvard-dash")) allPromises.push(trackProviderCall("harvard-dash", searchHarvardDASH(sq, Math.min(15, perProvider))));
    if (providerSet.has("max-planck-pure")) allPromises.push(trackProviderCall("max-planck-pure", searchMaxPlanckPuRe(sq, Math.min(15, perProvider))));

    // INSTITUTIONNELS - HEALTH EXTENDED V2
    if (providerSet.has("clinical-trials")) allPromises.push(trackProviderCall("clinical-trials", searchClinicalTrials(sq, Math.min(15, perProvider))));

    // INSTITUTIONNELS - GOVERNMENT OPEN DATA
    if (providerSet.has("istat")) allPromises.push(trackProviderCall("istat", searchISTAT(sq, Math.min(15, perProvider))));
    if (providerSet.has("open-primitive")) allPromises.push(trackProviderCall("open-primitive", searchOpenPrimitive(sq, Math.min(15, perProvider))));
    if (providerSet.has("treasury-fiscal")) allPromises.push(trackProviderCall("treasury-fiscal", searchTreasuryFiscal(sq, Math.min(10, perProvider))));

    // INSTITUTIONNELS - ÉCONOMIE EXTENDED
    if (providerSet.has("ecb") && !providerSet.has("consolidated-institutions")) allPromises.push(trackProviderCall("ecb", searchECB(sq, Math.min(15, perProvider))));
    if (providerSet.has("eurostat") && !providerSet.has("consolidated-institutions")) allPromises.push(trackProviderCall("eurostat", searchEurostat(sq, Math.min(15, perProvider))));
    if (providerSet.has("fred") && !providerSet.has("consolidated-institutions")) allPromises.push(trackProviderCall("fred", searchFRED(sq, Math.min(15, perProvider))));
    if (providerSet.has("eib") && !providerSet.has("consolidated-institutions")) allPromises.push(trackProviderCall("eib", searchEIB(sq, Math.min(15, perProvider))));

    // INSTITUTIONNELS - SANTÉ EXTENDED
    if (providerSet.has("ema") && !providerSet.has("consolidated-institutions")) allPromises.push(trackProviderCall("ema", searchEMA(sq, Math.min(15, perProvider))));
    if (providerSet.has("inserm") && !providerSet.has("consolidated-institutions")) allPromises.push(trackProviderCall("inserm", searchINSERM(sq, Math.min(15, perProvider))));
    if (providerSet.has("ecdc") && !providerSet.has("consolidated-institutions")) allPromises.push(trackProviderCall("ecdc", searchECDC(sq, Math.min(15, perProvider))));
    if (providerSet.has("cochrane") && !providerSet.has("consolidated-institutions")) allPromises.push(trackProviderCall("cochrane", searchCochrane(sq, Math.min(15, perProvider))));

    // INSTITUTIONNELS - ENVIRONNEMENT
    if (providerSet.has("inrae") && !providerSet.has("consolidated-institutions")) allPromises.push(trackProviderCall("inrae", searchINRAE(sq, Math.min(15, perProvider))));
    if (providerSet.has("ademe") && !providerSet.has("consolidated-institutions")) allPromises.push(trackProviderCall("ademe", searchADEME(sq, Math.min(15, perProvider))));

    // INSTITUTIONNELS - FRANÇAIS
    if (providerSet.has("ens") && !providerSet.has("consolidated-institutions")) allPromises.push(trackProviderCall("ens", searchENS(sq, Math.min(15, perProvider))));
    if (providerSet.has("insee") && !providerSet.has("consolidated-institutions")) allPromises.push(trackProviderCall("insee", searchINSEE(sq, Math.min(15, perProvider))));
    if (providerSet.has("shift-project") && !providerSet.has("consolidated-institutions")) allPromises.push(trackProviderCall("shift-project", searchShiftProject(sq, Math.min(15, perProvider))));
    if (providerSet.has("data-gouv")) allPromises.push(trackProviderCall("data-gouv", searchDataGouv(sq, Math.min(15, perProvider))));
    if (providerSet.has("france-strategie") && !providerSet.has("consolidated-institutions")) allPromises.push(trackProviderCall("france-strategie", searchFranceStrategie(sq, Math.min(15, perProvider))));
    if (providerSet.has("cnrs") && !providerSet.has("consolidated-institutions")) allPromises.push(trackProviderCall("cnrs", searchCNRS(sq, Math.min(15, perProvider))));

    // INSTITUTIONNELS - TECH RESEARCH
    if (providerSet.has("allen-ai") && !providerSet.has("consolidated-institutions")) allPromises.push(trackProviderCall("allen-ai", searchAllenAI(sq, Math.min(15, perProvider))));
    if (providerSet.has("max-planck") && !providerSet.has("consolidated-institutions")) allPromises.push(trackProviderCall("max-planck", searchMaxPlanck(sq, Math.min(15, perProvider))));
    if (providerSet.has("eth-zurich") && !providerSet.has("consolidated-institutions")) allPromises.push(trackProviderCall("eth-zurich", searchETHZurich(sq, Math.min(15, perProvider))));
    if (providerSet.has("inria") && !providerSet.has("consolidated-institutions")) allPromises.push(trackProviderCall("inria", searchINRIA(sq, Math.min(15, perProvider))));

    // INSTITUTIONNELS - DROIT & GOUVERNANCE
    if (providerSet.has("eur-lex")) allPromises.push(trackProviderCall("eur-lex", searchEURLex(sq, Math.min(15, perProvider))));

    // THINK TANKS EUROPÉENS
    if (providerSet.has("ecfr")) allPromises.push(trackProviderCall("ecfr", searchECFR(sq, Math.min(15, perProvider))));
    if (providerSet.has("swp") && !providerSet.has("consolidated-institutions")) allPromises.push(trackProviderCall("swp", searchSWP(sq, Math.min(15, perProvider))));
    if (providerSet.has("sipri") && !providerSet.has("consolidated-institutions")) allPromises.push(trackProviderCall("sipri", searchSIPRI(sq, Math.min(15, perProvider))));
    if (providerSet.has("iai") && !providerSet.has("consolidated-institutions")) allPromises.push(trackProviderCall("iai", searchIAI(sq, Math.min(15, perProvider))));

    // POLITIQUE FRANÇAISE & DROIT
    if (providerSet.has("iddri") && !providerSet.has("consolidated-institutions")) allPromises.push(trackProviderCall("iddri", searchIDDRI(sq, Math.min(15, perProvider))));
    if (providerSet.has("terra-nova") && !providerSet.has("consolidated-institutions")) allPromises.push(trackProviderCall("terra-nova", searchTerraNova(sq, Math.min(15, perProvider))));
    if (providerSet.has("legifrance")) allPromises.push(trackProviderCall("legifrance", searchLegifrance(sq, Math.min(15, perProvider))));
    if (providerSet.has("vie-publique")) allPromises.push(trackProviderCall("vie-publique", searchViePublique(sq, Math.min(15, perProvider))));

    // SANTÉ EXTENDED V2
    if (providerSet.has("cdc") && !providerSet.has("consolidated-institutions")) allPromises.push(trackProviderCall("cdc", searchCDC(sq, Math.min(15, perProvider))));
    if (providerSet.has("nih") && !providerSet.has("consolidated-institutions")) allPromises.push(trackProviderCall("nih", searchNIH(sq, Math.min(15, perProvider))));
    if (providerSet.has("who-direct") && !providerSet.has("consolidated-institutions")) allPromises.push(trackProviderCall("who-direct", searchWHODirect(sq, Math.min(15, perProvider))));

    // ÉCONOMIE EXTENDED V2
    if (providerSet.has("oecd-direct") && !providerSet.has("consolidated-institutions")) allPromises.push(trackProviderCall("oecd-direct", searchOECDDirect(sq, Math.min(15, perProvider))));

    // SCIENCES HUMAINES & SOCIALES
    if (providerSet.has("isidore")) allPromises.push(trackProviderCall("isidore", searchISIDORE(sq, Math.min(20, perProvider))));
    if (providerSet.has("persee")) allPromises.push(trackProviderCall("persee", searchPersee(sq, Math.min(20, perProvider))));
    if (providerSet.has("philpapers")) allPromises.push(trackProviderCall("philpapers", searchPhilPapers(sq, Math.min(20, perProvider))));

    // ÉDUCATION
    if (providerSet.has("eric")) allPromises.push(trackProviderCall("eric", searchERIC(sq, Math.min(20, perProvider))));

    // AGRICULTURE & ALIMENTATION
    if (providerSet.has("fao")) allPromises.push(trackProviderCall("fao", searchFAO(sq, Math.min(15, perProvider))));

    // CRIMINOLOGIE & JUSTICE
    if (providerSet.has("unodc")) allPromises.push(trackProviderCall("unodc", searchUNODC(sq, Math.min(15, perProvider))));
    // Live statistics APIs — abstracts embed real figures
    if (providerSet.has("worldbank-data")) allPromises.push(trackProviderCall("worldbank-data", searchWorldBankData(sq, Math.min(10, perProvider))));
    if (providerSet.has("ucdp")) allPromises.push(trackProviderCall("ucdp", searchUCDP(sq, Math.min(10, perProvider))));
    if (providerSet.has("ilostat")) allPromises.push(trackProviderCall("ilostat", searchILOSTAT(sq, Math.min(10, perProvider))));
    if (providerSet.has("owid")) allPromises.push(trackProviderCall("owid", searchOWID(sq, Math.min(10, perProvider))));
    // Key-gated stats (degrade to [] when env missing) + no-key national APIs
    if (providerSet.has("comtrade")) allPromises.push(trackProviderCall("comtrade", searchComtrade(sq, Math.min(8, perProvider))));
    if (providerSet.has("us-bls")) allPromises.push(trackProviderCall("us-bls", searchBLS(sq, Math.min(6, perProvider))));
    if (providerSet.has("us-census")) allPromises.push(trackProviderCall("us-census", searchCensus(sq, Math.min(6, perProvider))));
    if (providerSet.has("acled")) allPromises.push(trackProviderCall("acled", searchACLED(sq, Math.min(8, perProvider))));
    if (providerSet.has("unhcr")) allPromises.push(trackProviderCall("unhcr", searchUNHCR(sq, Math.min(8, perProvider))));
    if (providerSet.has("estat-jp")) allPromises.push(trackProviderCall("estat-jp", searchEStatJP(sq, Math.min(8, perProvider))));
    if (providerSet.has("kosis")) allPromises.push(trackProviderCall("kosis", searchKOSIS(sq, Math.min(8, perProvider))));
    if (providerSet.has("ons-uk")) allPromises.push(trackProviderCall("ons-uk", searchONS(sq, Math.min(8, perProvider))));
    if (providerSet.has("ibge")) allPromises.push(trackProviderCall("ibge", searchIBGE(sq, Math.min(8, perProvider))));
    if (providerSet.has("datacommons")) allPromises.push(trackProviderCall("datacommons", searchDataCommons(sq, Math.min(6, perProvider))));
    // Free metasearch floor — keeps web retrieval alive when paid search is exhausted
    if (providerSet.has("searxng")) allPromises.push(trackProviderCall("searxng", searchSearxng(sq, Math.min(8, perProvider))));

    // SCIENCE OUVERTE EUROPÉENNE
    if (providerSet.has("openaire")) allPromises.push(trackProviderCall("openaire", searchOpenAIRE(sq, Math.min(20, perProvider))));

    // OPEN SCIENCE REPOSITORY (CERN/Zenodo)
    if (providerSet.has("zenodo")) allPromises.push(trackProviderCall("zenodo", searchZenodo(sq, Math.min(20, perProvider))));

    // DOMAIN-SPECIFIC ACADEMIC PROVIDERS (S2 field-of-study + OpenAlex concept fallback)
    if (providerSet.has("psychology")) allPromises.push(trackProviderCall("psychology", searchPsychology(sq, Math.min(15, perProvider))));
    if (providerSet.has("sociology")) allPromises.push(trackProviderCall("sociology", searchSociology(sq, Math.min(15, perProvider))));
    if (providerSet.has("history")) allPromises.push(trackProviderCall("history", searchHistory(sq, Math.min(15, perProvider))));
    if (providerSet.has("geography")) allPromises.push(trackProviderCall("geography", searchGeography(sq, Math.min(15, perProvider))));
    if (providerSet.has("chemistry")) allPromises.push(trackProviderCall("chemistry", searchChemistry(sq, Math.min(15, perProvider))));
    if (providerSet.has("biology")) allPromises.push(trackProviderCall("biology", searchBiology(sq, Math.min(15, perProvider))));
    if (providerSet.has("political-science")) allPromises.push(trackProviderCall("political-science", searchPoliticalScience(sq, Math.min(15, perProvider))));
    if (providerSet.has("business")) allPromises.push(trackProviderCall("business", searchBusiness(sq, Math.min(15, perProvider))));

    // CS CONFERENCES & MATH (DBLP + zbMATH — dedicated APIs with S2/OpenAlex fallback)
    if (providerSet.has("dblp")) allPromises.push(trackProviderCall("dblp", searchDBLP(sq, Math.min(20, perProvider))));
    if (providerSet.has("zbmath")) allPromises.push(trackProviderCall("zbmath", searchZbMath(sq, Math.min(20, perProvider))));

    // HERITAGE & HISTORICAL SOURCES (2026-08 expansion) — books, primary sources, cultural heritage
    if (providerSet.has("gallica")) allPromises.push(trackProviderCall("gallica", searchGallica(sq, Math.min(20, perProvider))));
    if (providerSet.has("europeana")) allPromises.push(trackProviderCall("europeana", searchEuropeana(sq, Math.min(20, perProvider))));
    if (providerSet.has("gutenberg")) allPromises.push(trackProviderCall("gutenberg", searchGutenberg(sq, Math.min(20, perProvider))));
    if (providerSet.has("dpla")) allPromises.push(trackProviderCall("dpla", searchDPLA(sq, Math.min(20, perProvider))));
    if (providerSet.has("wikisource")) allPromises.push(trackProviderCall("wikisource", searchWikisource(sq, Math.min(20, perProvider))));

    // GLOBAL SOUTH & REGIONAL (2026-08 expansion) — Africa, Iberia/LatAm, India, Korea
    if (providerSet.has("ajol")) allPromises.push(trackProviderCall("ajol", searchAJOL(sq, Math.min(20, perProvider))));
    if (providerSet.has("dialnet")) allPromises.push(trackProviderCall("dialnet", searchDialnet(sq, Math.min(20, perProvider))));
    if (providerSet.has("shodhganga")) allPromises.push(trackProviderCall("shodhganga", searchShodhganga(sq, Math.min(20, perProvider))));
    if (providerSet.has("riss")) allPromises.push(trackProviderCall("riss", searchRISS(sq, Math.min(20, perProvider))));

    // PREPRINTS & OPEN-SCIENCE DATA (2026-08 expansion) — chemRxiv, OSF, preprints.org, Dryad
    if (providerSet.has("chemrxiv")) allPromises.push(trackProviderCall("chemrxiv", searchChemRxiv(sq, Math.min(20, perProvider))));
    if (providerSet.has("osf")) allPromises.push(trackProviderCall("osf", searchOSF(sq, Math.min(20, perProvider))));
    if (providerSet.has("preprints-org")) allPromises.push(trackProviderCall("preprints-org", searchPreprintsOrg(sq, Math.min(20, perProvider))));
    if (providerSet.has("dryad")) allPromises.push(trackProviderCall("dryad", searchDryad(sq, Math.min(20, perProvider))));

    // ACADEMIC DATABASES — Large-scale scholarly indexes
    if (providerSet.has("dimensions")) allPromises.push(trackProviderCall("dimensions", searchDimensions(sq, Math.min(20, perProvider))));
    if (providerSet.has("lens")) allPromises.push(trackProviderCall("lens", searchLens(sq, Math.min(20, perProvider))));
    if (providerSet.has("springer")) allPromises.push(trackProviderCall("springer", searchSpringer(sq, Math.min(20, perProvider))));
    if (providerSet.has("osti")) allPromises.push(trackProviderCall("osti", searchOSTI(sq, Math.min(20, perProvider))));
    if (providerSet.has("datacite")) allPromises.push(trackProviderCall("datacite", searchDataCite(sq, Math.min(15, perProvider))));
    if (providerSet.has("google-books")) allPromises.push(trackProviderCall("google-books", searchGoogleBooks(sq, Math.min(15, perProvider))));

    // OPEN-ACCESS FREE APIs (no key required)
    if (providerSet.has("plos")) allPromises.push(trackProviderCall("plos", searchPLOS(sq, Math.min(20, perProvider))));
    if (providerSet.has("federal-register")) allPromises.push(trackProviderCall("federal-register", searchFederalRegister(sq, Math.min(15, perProvider))));
    if (providerSet.has("sec-edgar")) allPromises.push(trackProviderCall("sec-edgar", searchSECEdgar(sq, Math.min(15, perProvider))));
    if (providerSet.has("worldbank-docs")) allPromises.push(trackProviderCall("worldbank-docs", searchWorldBankDocs(sq, Math.min(15, perProvider))));
    if (providerSet.has("cordis")) allPromises.push(trackProviderCall("cordis", searchCORDIS(sq, Math.min(15, perProvider))));

    // FOUNDATIONAL SOURCES — Books, reports, reference texts for prospective research
    if (providerSet.has("ipcc")) allPromises.push(trackProviderCall("ipcc", searchIPCC(sq, Math.min(15, perProvider))));
    if (providerSet.has("internet-archive")) allPromises.push(trackProviderCall("internet-archive", searchInternetArchive(sq, Math.min(20, perProvider))));
    if (providerSet.has("hathitrust")) allPromises.push(trackProviderCall("hathitrust", searchHathiTrust(sq, Math.min(15, perProvider))));
    if (providerSet.has("open-library")) allPromises.push(trackProviderCall("open-library", searchOpenLibrary(sq, Math.min(15, perProvider))));
    if (providerSet.has("jstor")) allPromises.push(trackProviderCall("jstor", searchJSTOR(sq, Math.min(15, perProvider))));
    if (providerSet.has("unesco")) allPromises.push(trackProviderCall("unesco", searchUNESCO(sq, Math.min(15, perProvider))));

    // FORESIGHT & PROSPECTIVE SOURCES — Strategic foresight organizations
    if (providerSet.has("club-of-rome")) allPromises.push(trackProviderCall("club-of-rome", searchClubOfRome(sq, Math.min(10, perProvider))));
    if (providerSet.has("millennium-project")) allPromises.push(trackProviderCall("millennium-project", searchMillenniumProject(sq, Math.min(10, perProvider))));

    // OPEN ACCESS FULL-TEXT — CORE (free, 200M+ papers with full-text)
    if (providerSet.has("core")) allPromises.push(trackProviderCall("core", searchCORE(sq, Math.min(30, perProvider))));

    // COMPLÉMENTAIRE - WEB SEARCH (enrichment fallback, not primary research)
    if (providerSet.has("linkup")) allPromises.push(trackProviderCall("linkup", searchLinkUp(sq, Math.min(15, perProvider))));
    if (providerSet.has("tavily")) allPromises.push(trackProviderCall("tavily", searchTavily(sq, Math.min(15, perProvider), { topic: 'general' })));
    if (providerSet.has("exa")) allPromises.push(trackProviderCall("exa", searchExaPublications(sq, Math.min(20, perProvider))));

    // REAL-TIME NEWS PROVIDERS
    if (providerSet.has("gdelt-news")) allPromises.push(trackProviderCall("gdelt-news", searchGDELTNews(sq, Math.min(30, perProvider))));
    if (providerSet.has("newsapi")) allPromises.push(trackProviderCall("newsapi", searchNewsAPI(sq, Math.min(30, perProvider))));
    if (providerSet.has("mediastack")) allPromises.push(trackProviderCall("mediastack", searchMediaStack(sq, Math.min(25, perProvider))));
    if (providerSet.has("thenewsapi")) allPromises.push(trackProviderCall("thenewsapi", searchTheNewsAPI(sq, Math.min(30, perProvider))));
    if (providerSet.has("gnews")) allPromises.push(trackProviderCall("gnews", searchGNews(sq, Math.min(10, perProvider))));
    if (providerSet.has("eventregistry")) allPromises.push(trackProviderCall("eventregistry", searchEventRegistry(sq, Math.min(25, perProvider))));
    if (providerSet.has("apitube")) allPromises.push(trackProviderCall("apitube", searchAPITube(sq, Math.min(25, perProvider))));

    // INDEPENDENT MEDIA — investigative journalism, heterodox voices, Global South, expert blogs
    if (providerSet.has("independent-media")) allPromises.push(trackProviderCall("independent-media", searchIndependentMedia(sq, Math.min(30, perProvider))));
    if (providerSet.has("gdelt-independent")) allPromises.push(trackProviderCall("gdelt-independent", searchGDELTIndependent(sq, Math.min(20, perProvider))));

    // GREY LITERATURE — Overton: 20M+ policy documents from governments, think tanks, IGOs worldwide
    if (providerSet.has("overton")) allPromises.push(trackProviderCall("overton", searchOverton(sq, Math.min(25, perProvider))));

    // FOREIGN ACADEMIC SOURCES — Non-Western databases for geographic coverage
    // China
    if (providerSet.has("wanfang")) allPromises.push(trackProviderCall("wanfang", searchWanfang(sq, Math.min(20, perProvider))));
    // Russia
    if (providerSet.has("cyberleninka")) allPromises.push(trackProviderCall("cyberleninka", searchCyberLeninka(sq, Math.min(20, perProvider))));
    if (providerSet.has("elibrary-ru")) allPromises.push(trackProviderCall("elibrary-ru", searchELibrary(sq, Math.min(20, perProvider))));
    // Japan
    if (providerSet.has("jstage")) allPromises.push(trackProviderCall("jstage", searchJStage(sq, Math.min(20, perProvider))));
    // Latin America / Africa / Iberian
    if (providerSet.has("scielo")) allPromises.push(trackProviderCall("scielo", searchSciELO(sq, Math.min(20, perProvider))));

    // CITATION GRAPH — OpenCitations (free, no key, 1.5B+ citations)
    if (providerSet.has("opencitations")) allPromises.push(trackProviderCall("opencitations", searchOpenCitations(sq, Math.min(20, perProvider))));

    // NEWS — NewsData.io (free tier: 200 credits/day, 10 articles/credit)
    if (providerSet.has("newsdata")) allPromises.push(trackProviderCall("newsdata", searchNewsData(sq, Math.min(10, perProvider))));

    // AI/ML PAPERS WITH CODE — HuggingFace Papers (free, no key, links to models/datasets)
    if (providerSet.has("hf-papers")) allPromises.push(trackProviderCall("hf-papers", searchHuggingFacePapers(sq, Math.min(20, perProvider))));

    // EU OPEN DATA — data.europa.eu (free, no key, 1M+ government datasets)
    if (providerSet.has("data-europa")) allPromises.push(trackProviderCall("data-europa", searchDataEuropa(sq, Math.min(15, perProvider))));

    // INTERNET STANDARDS — IETF Datatracker (free, no key, RFCs + internet-drafts)
    if (providerSet.has("ietf")) allPromises.push(trackProviderCall("ietf", searchIETF(sq, Math.min(15, perProvider))));

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
      // Grey Literature
      "overton",
      // Foreign Academic Sources
      "cyberleninka", "wanfang", "jstage", "scielo", "elibrary-ru",
      // Citation graph
      "opencitations",
      // News
      "newsdata",
      // AI/ML papers
      "hf-papers",
      // EU open data
      "data-europa",
      // Internet standards
      "ietf",
    ]);
    const unroutedProviders = (providers as string[]).filter(p =>
      !EXPLICITLY_ROUTED.has(p) && p !== 'no-routing' && p !== 'auto' && !DEAD_PROVIDERS.has(p)
    );
    if (unroutedProviders.length > 0) {
      allPromises.push(
        trackProviderCall("extended-registry",
          searchExtendedProviders(sq, { providers: unroutedProviders, limit: Math.min(20, perProvider) })
            .then((results: any[]) => results.map((r: any) => ({ ...r, _fromExtended: true })))
        )
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

  // ── STEP 2: DEDUPLICATION (DOI-first union-find cascade — BibFusion/risforge 2026) ──
  const dedupResult = dedupSources(pool);
  const deduped = dedupResult.deduplicated;
  console.log(`[SCOUT] After DOI-first dedup: ${deduped.length}/${rawCount} (removed ${dedupResult.removed} duplicates in ${dedupResult.clusters} clusters)`);
  if (dedupResult.auditTrail.length > 0 && dedupResult.auditTrail.length <= 10) {
    for (const entry of dedupResult.auditTrail) {
      console.log(`  [Dedup] kept ${entry.kept} ← removed ${entry.removed.join(', ')} (${entry.method})`);
    }
  }

  // ── STEP 2b: RETRACTION WATCH (Sourcecheck 2026) ──
  // Check is_retracted on OpenAlex + Crossref for sources with DOIs.
  // Retracted sources are vetoed (never accepted as evidence).
  try {
    const retractionResult = await filterRetracted(deduped);
    if (retractionResult.retracted.length > 0) {
      for (const r of retractionResult.retracted) {
        console.warn(`  [RetractionWatch] VETOED retracted source: ${r.id} (DOI: ${r.doi})`);
      }
      deduped.length = 0;
      deduped.push(...retractionResult.filtered);
      console.log(`[SCOUT] After retraction filter: ${deduped.length} sources (vetoed ${retractionResult.retracted.length} retracted)`);
    }
  } catch (err) {
    console.warn(`[SCOUT] Retraction watch failed (non-blocking):`, err);
  }

  let finalPool = deduped;
  if (enhanced && deduped.length > 10) {
    try {
      // Progressive relevance filtering: try 0.20, then 0.15, then 0.10.
      // Only fall back to "keep all" if even 0.10 returns < 3 results.
      // This prevents the "too strict → keep everything" anti-pattern that
      // lets hundreds of irrelevant sources through.
      let relevant = filterByRelevance(deduped, enhanced, 0.20);
      let usedThreshold = 0.20;
      if (relevant.length < 3) {
        relevant = filterByRelevance(deduped, enhanced, 0.15);
        usedThreshold = 0.15;
      }
      if (relevant.length < 3) {
        relevant = filterByRelevance(deduped, enhanced, 0.10);
        usedThreshold = 0.10;
      }

      if (relevant.length >= 3) {
        console.log(`[SCOUT] After relevance filter (threshold=${usedThreshold}): ${relevant.length}/${deduped.length}`);
        logRelevanceScores(relevant, 5);

        // TS-SetRank: contextual reranking via Thompson Sampling (ACL 2026)
        try {
          const tsResults = await tsSetRank(
            relevant.map(r => r.source),
            enhanced,
            { topK: Math.min(200, relevant.length), minScore: 0.15, rounds: 3, batchSize: 20 }
          );
          if (tsResults.length > 0) {
            finalPool = tsResults.map(r => r.source);
            console.log(`[SCOUT] After TS-SetRank rerank: ${finalPool.length} sources (contextual scoring, ${tsResults[0]?.batchesAppearedIn || 1} batches)`);
          } else {
            // Fallback to Cohere
            const reranked = await rerankSources(
              relevant.map(r => r.source),
              enhanced,
              { topK: Math.min(200, relevant.length), minScore: 0.15 }
            );
            finalPool = reranked.map(r => r.source);
            console.log(`[SCOUT] After Cohere rerank (fallback): ${finalPool.length} sources`);
          }
        } catch (tsErr) {
          // TS-SetRank failed — fallback to Cohere
          const reranked = await rerankSources(
            relevant.map(r => r.source),
            enhanced,
            { topK: Math.min(200, relevant.length), minScore: 0.1 }
          );
          finalPool = reranked.map(r => r.source);
          console.log(`[SCOUT] After Cohere rerank (TS-SetRank failed): ${finalPool.length} sources`);
        }
      } else {
        // Even at 0.10 threshold, < 3 results. Keep the top 50 by relevance score
        // rather than ALL deduped sources — this prevents irrelevant noise from
        // flooding the pipeline.
        const allScored = filterByRelevance(deduped, enhanced, 0).sort((a, b) => b.score.overall - a.score.overall);
        const topN = allScored.slice(0, Math.min(50, allScored.length));
        finalPool = topN.map(r => r.source);
        console.log(`[SCOUT] Relevance filter too strict even at 0.10 (${relevant.length} results), keeping top ${finalPool.length}/${deduped.length} by score`);
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

  // K10: CARE — Context-Aware Retriever Evaluation
  // Evaluate retriever quality for multi-hop queries
  if (enhanced && finalPool.length > 0) {
    try {
      const careResult = evaluateWithCARE(finalPool as any, enhanced);
      console.log(`[SCOUT K10] CARE: overall=${(careResult.overall * 100).toFixed(0)}%, individual=${(careResult.individualRelevance * 100).toFixed(0)}%, combinedCoverage=${(careResult.combinedCoverage * 100).toFixed(0)}%, multiHop=${(careResult.multiHopPotential * 100).toFixed(0)}%, diversity=${(careResult.coverageDiversity * 100).toFixed(0)}%`);

      // ACTIVE: Add hidden gems to the final pool (sources that are individually irrelevant
      // but cover unique concept clusters — essential for multi-hop reasoning)
      if (careResult.hiddenGems.length > 0) {
        const hiddenGemIds = new Set(careResult.hiddenGems.map(g => g.sourceId));
        const gemsToAdd = deduped.filter(s => hiddenGemIds.has(s.id) && !finalPool.includes(s));
        if (gemsToAdd.length > 0) {
          finalPool.push(...gemsToAdd);
          console.log(`[SCOUT K10] ${careResult.hiddenGems.length} hidden gems found — ADDED ${gemsToAdd.length} to final pool (now ${finalPool.length} sources)`);
        }
      }

      // ACTIVE: CRAG corrective retrieval — missing concepts trigger a bounded
      // targeted re-search NOW (before the analyst), not a post-hoc log.
      if (careResult.recommendation === 'add_missing_concepts' && careResult.missingConcepts.length > 0) {
        console.log(`[SCOUT K10] ⚠️ Missing concepts: ${careResult.missingConcepts.slice(0, 5).join(', ')} — running targeted gap-fill`);
        try {
          const { gapFillMissingConcepts } = await import('./retrieval-gapfill');
          const gapResult = await gapFillMissingConcepts(query, careResult.missingConcepts, finalPool);
          if (gapResult.added.length > 0) {
            finalPool.push(...gapResult.added);
            console.log(`[SCOUT K10] Gap-fill: +${gapResult.added.length} sources targeting ${gapResult.conceptsTargeted.join(', ')}`);
          }
        } catch (gfErr) {
          console.warn('[SCOUT K10] Gap-fill failed (non-blocking):', gfErr);
        }
      }

      // ACTIVE: Remove redundant sources if too many duplicates
      if (careResult.recommendation === 'remove_redundant' && careResult.redundantSources.length > 0) {
        const redundantIds = new Set(careResult.redundantSources.map(r => r.sourceId));
        const beforeCount = finalPool.length;
        finalPool = finalPool.filter(s => !redundantIds.has(s.id) || !careResult.redundantSources.some(r => r.redundantWith.includes(s.id)));
        if (finalPool.length < beforeCount) {
          console.log(`[SCOUT K10] Removed ${beforeCount - finalPool.length} redundant sources (now ${finalPool.length})`);
        }
      }
    } catch (err) {
      console.warn('[SCOUT K10] CARE evaluation failed:', err);
    }
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
    const preparedBatch = await Promise.all(batch.map(async s => {
      if (!s.id) {
        const slug = (s.doi || s.url || s.title || "unknown").replace(/[^a-z0-9]/gi, "-").slice(0, 60).toLowerCase();
        s.id = `${s.provider}:${slug}`;
      }
      const qualityScore = await scoreSource({
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
    }));

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
    // K15: C3PO cascade — try cheap model first, escalate if confidence is low
    const response = await callLLMWithCascade({
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
    }, {
      ...DEFAULT_C3PO_CONFIG,
      budgetCapUsd: 0.02, // Small budget for query reformulation
    });
    const result = parseJson<{ reformulations?: string[] }>(response.content);
    if (result?.reformulations && Array.isArray(result.reformulations)) {
      return result.reformulations.filter(q => typeof q === 'string' && q.length > 10).slice(0, 1);
    }
    return [];
  } catch {
    return [];
  }
}

/**
 * Generate reformulations using STORM perspectives.
 * Each perspective produces 2-3 questions, giving broader coverage than simple synonyms.
 */
async function generateStormReformulations(query: string, label: string): Promise<string[]> {
  try {
    const { perspectives } = await generateStormPerspectives(query);
    const questions = perspectives.flatMap(p => p.questions).filter(q => typeof q === 'string' && q.length > 10);
    console.log(`${label} STORM: generated ${questions.length} perspective-driven reformulations`);
    return questions.slice(0, 5);
  } catch (err) {
    console.warn(`${label} STORM reformulations failed, falling back:`, err);
    return generateQueryReformulations(query).catch(() => []);
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
  // Grey Literature — policy documents, government reports
  "overton",
  // Foreign Academic Sources — geographic coverage (free APIs first)
  "cyberleninka", "jstage", "scielo",
  // Pouls de l'actualité (gratuit)
  "gdelt-news",
];

// ———————————————————————————————————————————————————————————————————————————————————
// SHARED PIPELINE CORE — single implementation for brief + strategic
// ———————————————————————————————————————————————————————————————————————————————————

export interface PipelineCoreOptions {
  isStrategic: boolean;
  /** Publication format — drives durable-execution activation (memo/dossier/strategic)
   *  and durable-key derivation. Passed through by runPipeline; was silently
   *  undefined when only read via (opts as any). */
  format?: string;
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
  /** Regeneration loop: feedback from a rejected prior attempt injected into
   * the analyst context as mandatory corrections. */
  priorFailureFeedback?: string;
  /** Enable the Witness — metacognitive observer (default: false).
   * The Witness observes each pipeline step, detects anomalies, and can
   * intervene. It also learns across runs to improve prompts and thresholds. */
  useWitness?: boolean;
  /** Enable Mixture of Agents — multiple specialist analysts (default: false) */
  useMixtureOfAgents?: boolean;
  /** Enable World Model — persistent cross-run knowledge (default: false) */
  useWorldModel?: boolean;
  /** Enable Process Reward Model — step-level scoring (default: false) */
  usePRM?: boolean;
  /** Enable adversarial self-play — finds weaknesses post-analysis (default: false) */
  useSelfPlay?: boolean;

  /** Enable output guardrails — structured output validation (default: false) */
  useOutputGuard?: boolean;
  /** Enable local judge — open-source Prometheus 2 / JudgeLM evaluation (default: false) */
  useLocalJudge?: boolean;
  /** Enable STORM + PaperQA2 — perspective-driven research + citation traversal (default: false) */
  useStorm?: boolean;
  /** Enable temporal memory — bi-temporal knowledge tracking (default: false) */
  useTemporalMemory?: boolean;
  /** Enable Think Tank Quality Pack — recommendations, economics, editorial polish (default: false) */
  useThinkTankPack?: boolean;
  /** Enable Feynman-style peer review before editor (default: false) */
  usePeerReview?: boolean;
  /** Enable RAGAS-style RAG evaluation (default: false) */
  useRagasEval?: boolean;
  /** Enable durable execution — lightweight snapshots for long runs (default: false) */
  useDurableExecution?: boolean;
  /** Optional primary data inputs — expert interviews, surveys, datasets, memos to enrich the brief */
  primaryData?: PrimarySourceInput[];
  /** Enable structured scenario modeling & foresight in think tank pack (default: true when useThinkTankPack) */
  scenarioModeling?: boolean;
  /** Maximum number of scenarios to generate (default: 3) */
  maxScenarios?: number;
  /** Enable policy stress test — multi-archetype risk review of recommendations (default: true when useThinkTankPack) */
  stressTest?: boolean;
  /** Enable policy council — multi-perspective deliberation on recommendations (default: true when useThinkTankPack) */
  policyCouncil?: boolean;
  /** Enable self-evolution — auto-improve agent prompts after the run (default: false) */
  useSelfEvolution?: boolean;
}

async function runPipelineCore(query: string, opts: PipelineCoreOptions) {
  // LOT 6.3: FAILURE POLICY
  // CRITICAL agents (throw on failure): SCOUT, RANK, ANALYST
  // NON-BLOCKING agents (warn + continue): CONTEXT_PRIMER, EMBED, GAP_FILLER,
  //   QUANT, FRAMING, HYPOTHESIS_JUDGE, FACT_CHECKER, CRITICAL_LOOP, DEVILS_ADVOCATE,
  //   KNOWLEDGE_GRAPH, STYLE_GATES, EVIDENCE_IDS, RESEARCH_GAPS
  const { isStrategic } = opts;
  const useWitness = opts.useWitness ?? (isStrategic && (opts.maxBudgetUsd ?? 5) > 2.0);

  // S16-05: Conductor (Microsoft 2026) — deterministic workflow orchestration
  // Uses the Conductor orchestrator to determine which optional steps to prune
  // based on remaining budget. Zero LLM tokens spent on orchestration decisions.
  let conductorWorkflow: import('./conductor-orchestrator').Workflow | undefined;
  try {
    const { getWorkflow, pruneOptionalSteps } = await import('./conductor-orchestrator');
    conductorWorkflow = getWorkflow(isStrategic);
    const maxBudget = opts.maxBudgetUsd ?? (isStrategic ? 8 : 3);
    conductorWorkflow = pruneOptionalSteps(conductorWorkflow, maxBudget);
    console.log(`[Pipeline] CONDUCTOR: workflow="${conductorWorkflow.name}", ${conductorWorkflow.steps.length} steps (pruned optional steps due to budget=$${maxBudget})`);
  } catch (e) { /* non-blocking */ }

  // SELF-CORRECT (CHARM + Overseer hybrid): autonomous error detection and correction
  // Wraps pipeline stages with checkpoints, cross-stage consistency tracking (TF-IDF drift),
  // cascade detection, and auto-feedback injection on retry.
  const { SelfCorrector, citationCoverageVerifier } = await import('./self-correct');
  const selfCorrector = new SelfCorrector({
    enableAutoRetry: true,
    enableRollback: true,
    maxRetriesPerStage: 2, // conservative — each retry costs LLM tokens
  });
  let selfCorrectRetries = 0;
  let selfCorrectRollbacks = 0;

  // V3.2: Auto-activate advanced features based on query characteristics
  // instead of requiring explicit opt-in for every feature.
  const _queryWordCount = query.split(/\s+/).filter(Boolean).length;
  const hasTemporalIndicators = /\b(will|forecast|predict|project|by\s+20\d\d|future|trajectory|emerging|evolve|outlook)\b/i.test(query);
  const _isComplexAuto = _queryWordCount > 15 || isStrategic;

  // K5/K7: MoA auto-activates for complex multi-domain queries
  const useMixtureOfAgents = opts.useMixtureOfAgents ?? _isComplexAuto;
  // K11: WorldEvolver auto-activates for temporal/predictive queries
  const useWorldModel = opts.useWorldModel ?? hasTemporalIndicators;

  // Auto-activate learning features for strategic reports (budget-guarded)
  // PRM scores each reasoning step — learns which patterns lead to good outcomes
  // Self-Play attacks the analysis to find weaknesses before publication
  const canAffordLearning = (opts.maxBudgetUsd ?? (isStrategic ? 8 : 3)) > 3.0;
  const usePRM = opts.usePRM ?? (isStrategic && canAffordLearning);
  const useSelfPlay = opts.useSelfPlay ?? (isStrategic && canAffordLearning);
  const useOutputGuard = opts.useOutputGuard ?? false;
  const useLocalJudge = opts.useLocalJudge ?? false;
  const useStorm = opts.useStorm ?? false;
  const useTemporalMemory = opts.useTemporalMemory ?? false;
  const useThinkTankPack = opts.useThinkTankPack ?? false;
  const usePeerReview = opts.usePeerReview ?? false;
  const useRagasEval = opts.useRagasEval ?? false;
  // Durable execution ON for heavy formats by default — a 50-80min run killed
  // by timeout/crash resumes at its last checkpoint instead of losing everything.
  const useDurableExecution = opts.useDurableExecution ?? (isStrategic || opts.format === 'memo' || opts.format === 'dossier');
  // Self-Evolution: evolve agent prompts after each strategic run via GMPO + MAGE
  // Cost: ~$0.05-0.10 (4 agents × 2 LLM calls each). Non-blocking, wrapped in try/catch.
  const useSelfEvolution = opts.useSelfEvolution ?? (isStrategic && canAffordLearning);
  const isDossier = opts.format === "dossier";
  const isMemo = opts.format === "memo";
  const editorialV2 = isEditorialV2Enabled();
  const label = isStrategic ? "[Strategic]" : "[Pipeline]";
  const stats: PipelineStats = {};
  const pipelineStart = Date.now();

  // ── PRE-FLIGHT: Provider health check ──
  // Detect dead providers (suspended accounts, exhausted credits) BEFORE the pipeline
  // starts so we don't waste time discovering them through mid-pipeline failures.
  try {
    const { getAvailableProviders, getSuspendedProviders } = await import('../llm/unified-llm');
    const available = getAvailableProviders();
    const suspended = await getSuspendedProviders();
    const alive = available.filter(p => !suspended.includes(p));
    if (suspended.length > 0) {
      console.warn(`${label} PRE-FLIGHT: ⚠️ Suspended providers: ${suspended.join(', ')} — will skip automatically`);
    }
    if (alive.length === 0) {
      // Hard stop: with zero LLMs alive every LLM stage will fail or emit
      // degraded output, yet SCOUT still burns paid search calls (Tavily/Exa).
      // Throwing here marks the run FAILED without spending a cent on retrieval.
      const abort = new Error(`${label} PRE-FLIGHT ABORT: 0 LLM providers alive — refusing to burn retrieval budget on a run that cannot produce analysis. Resume when a provider is healthy (or configure a freepool key: GROQ_API_KEY/CEREBRAS_API_KEY/…).`);
      abort.name = 'PreflightAbortError';
      throw abort;
    }
    if (alive.length < 2) {
      console.error(`${label} PRE-FLIGHT: ⚠️ DEGRADED — only ${alive.length} provider(s) alive: ${alive.join(', ')}. No failover headroom; continuing with reduced redundancy.`);
    } else {
      console.log(`${label} PRE-FLIGHT: ✅ ${alive.length} providers alive: ${alive.join(', ')}${suspended.length > 0 ? ` (suspended: ${suspended.join(', ')})` : ''}`);
    }
  } catch (e) {
    if ((e as Error).name === 'PreflightAbortError') throw e;
    /* non-blocking */
  }

  // ── ADAPTIVE TOPOLOGY (AdaptOrch arXiv 2026) ──
  // Selects pipeline topology based on query complexity signals.
  // Simple queries → parallel retrieval; complex → hierarchical decomposition.
  let topologyPlan: import('./adaptive-topology').TopologyPlan | undefined;
  try {
    const { selectTopology, extractComplexitySignals } = await import('./adaptive-topology');
    const signals = extractComplexitySignals(query, isStrategic, 0 /* sourceCount unknown pre-SCOUT */);
    topologyPlan = selectTopology(signals);
    if (topologyPlan.topology !== 'sequential') {
      console.log(`${label} TOPOLOGY: ${topologyPlan.topology} (speedup~${topologyPlan.estimatedSpeedup}x) — ${topologyPlan.rationale}`);
    }
  } catch (e) { /* non-blocking */ }

  // ── Global rejection guard ──
  // Fire-and-forget promises (agent memory, witness learning, langfuse tracing,
  // cache writes) can reject after the pipeline completes. Without this handler,
  // Node.js terminates with exit code 1 even on successful pipeline runs.
  const rejectionHandler = (reason: unknown) => {
    console.warn(`${label} [unhandledRejection] (non-fatal):`, reason);
  };
  process.on('unhandledRejection', rejectionHandler);

  // ── WITNESS: Metacognitive observer (Sakshi Witness pattern) ──
  // The Witness observes each pipeline step, detects anomalies, and can intervene.
  // It also learns across runs to improve prompts and thresholds.
  let witnessCtx: WitnessContext | null = null;
  let witnessLearningInjection = '';
  if (useWitness) {
    const budgetCap = isStrategic ? 8.0 : 3.0;
    witnessCtx = createWitnessContext(
      `run_${Date.now()}`,
      query,
      budgetCap,
      {
        canIntervene: true,
        useDatabase: true,
        useLLM: true,
        steps: ['scout', 'rank', 'reader', 'analyst', 'editor'],
      },
    );
    console.log(`${label} WITNESS: metacognitive observer activated (budget cap: $${budgetCap})`);

    // Inject past learnings into the pipeline context (stored for later injection)
    try {
      witnessLearningInjection = await buildLearningInjection();
      if (witnessLearningInjection) {
        console.log(`${label} WITNESS: prepared past learnings for injection (${witnessLearningInjection.length} chars)`);
      }
    } catch (err) {
      console.warn(`${label} WITNESS: failed to inject learnings:`, err);
    }
  }

  // ── WORLD MODEL: Persistent cross-run knowledge accumulation ──
  // The World Model accumulates knowledge across runs. Before a run, it injects
  // prior knowledge. After a run, it extracts and persists new findings.
  let worldModelInjection = '';
  let worldModelReliableSources: string[] = [];
  let worldModelControversies: string[] = [];
  if (useWorldModel) {
    try {
      const wmResult = await buildWorldModelInjection(query);
      if (wmResult.contextBlock) {
        worldModelInjection = wmResult.contextBlock;
        worldModelReliableSources = wmResult.reliableSourceIds;
        worldModelControversies = wmResult.knownControversies;
        console.log(`${label} WORLD_MODEL: injected prior knowledge (${worldModelInjection.length} chars, ${worldModelReliableSources.length} reliable sources, ${worldModelControversies.length} known controversies)`);
      } else {
        console.log(`${label} WORLD_MODEL: no prior knowledge found for this query`);
      }
    } catch (err) {
      console.warn(`${label} WORLD_MODEL: failed to query:`, err);
    }
  }

  // K11: WorldEvolver — self-evolving world model injection
  // Injects high-confidence predictions and learned rules from past episodes
  let worldEvolverInjection = '';
  const worldEvolverState: WorldEvolverState = createWorldEvolver();
  try {
    const domain = query.split(/\s+/).slice(0, 3).join(' ');
    worldEvolverInjection = buildWorldEvolverInjection(worldEvolverState, domain, ['search_sources', 'read_source', 'analyze']);
    if (worldEvolverInjection) {
      console.log(`${label} WORLD_EVOLVER: injected ${worldEvolverInjection.length} chars of foresight`);
    }
  } catch (err) {
    console.warn(`${label} WORLD_EVOLVER: failed to build injection:`, err);
  }

  // ── PRM: Process Reward Model — scores reasoning steps ──
  let prmModel: PRMModel | null = null;
  if (usePRM) {
    try {
      prmModel = await loadPRMModel();
      if (prmModel) {
        console.log(`${label} PRM: loaded model (${prmModel.trainingExamples} training examples, avg reward ${prmModel.avgReward.toFixed(3)})`);
      } else {
        console.log(`${label} PRM: no trained model yet — will collect data for future training`);
      }
    } catch (err) {
      console.warn(`${label} PRM: failed to load model:`, err);
    }
  }

  // ── SELF-PLAY: Prepare adversarial lessons for injection ──
  let selfPlayInjection = '';
  if (useSelfPlay) {
    try {
      selfPlayInjection = await buildSelfPlayInjection();
      if (selfPlayInjection) {
        console.log(`${label} SELF_PLAY: injected ${selfPlayInjection.length} chars of adversarial lessons`);
      }
    } catch (err) {
      console.warn(`${label} SELF_PLAY: failed to load lessons:`, err);
    }
  }

  // ── MOA: Load agent weights ──
  if (useMixtureOfAgents) {
    try {
      await loadAgentWeights();
      console.log(`${label} MOA: agent weights loaded`);
    } catch (err) {
      console.warn(`${label} MOA: failed to load weights:`, err);
    }
  }

  // ── BLACKBOARD: Shared context across all agents (2026 pattern) ──
  // Breaks silos: ANALYST can request targeted re-search, EDITOR sees gaps, etc.
  const ctx = new PipelineContext(query, isStrategic);

  // ── MISSION: the single shared goal every agent reads (Sprint 26). ──
  // Publication-grade targets — sweeps prioritize signals that close unmet
  // targets, so collective effort is goal-directed rather than scripted.
  ctx.setMission('Produce a publication-grade analysis that survives adversarial review', {
    trust: 65,
    groundedness: 80,
    citationCoverage: 0.5,
    minSources: isStrategic ? 20 : 12,
    requireCentralScenario: true,
    quality: 60,
  });

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
  // Witness directive — metacognitive observer can cut optional phases mid-run.
  // 'reduce_scope' skips self-play + devil's advocate; 'abort' also cuts debate/deliberation.
  let witnessReducedScope = false;
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
      // P2-FIX: Budget guard — hard-degrade at 100%, throw only at 2x runaway
      if (runningCostUsd > maxBudget) {
        budgetDegraded = true; // Ensure degradation is active
        console.warn(`${label} BUDGET GUARD: 100% threshold reached ($${runningCostUsd.toFixed(4)}/$${maxBudget}) — hard degrading`);
        // Aggressively disable all remaining optional steps
        runDebateStep = false;
        runMetaAnalysisStep = false;
        runDevilsAdvocateStep = false;
        runEnhancedCouncilStep = false;
        runDeliberationStep = false;
        ctx.skipStep('debate');
        ctx.skipStep('meta-analysis');
        ctx.skipStep('devils-advocate');
        ctx.skipStep('enhanced-council');
        ctx.skipStep('deliberation');
        ctx.addFinding('BUDGET_GUARD', 'warning', `Budget exceeded 100% — all remaining optional steps skipped`);

        // If cost is more than 2x the budget, something is seriously wrong.
        // This is a hard abort to prevent runaway costs.
        if (runningCostUsd > maxBudget * 2) {
          console.error(`${label} BUDGET GUARD: $${runningCostUsd.toFixed(4)} exceeds 2x max $${maxBudget} after ${stepName} — ABORTING`);
          throw new Error(`Pipeline budget exceeded 2x limit: $${runningCostUsd.toFixed(4)} > $${maxBudget * 2} after ${stepName}`);
        }
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

  // ── SKILL BANK: bias provider order toward configurations that previously
  // produced trust ≥ 80 in this domain (procedural memory, FlowEvo pattern) ──
  let provenSkill: import('./skill-bank').ProvenSkill | null = null;
  try {
    const { getProvenSkill, applySkillToProviders } = await import('./skill-bank');
    const { detectDomain } = await import('./smart-provider-selector');
    const skillDomain = detectDomain(query);
    provenSkill = await getProvenSkill(skillDomain);
    if (provenSkill) {
      providers = applySkillToProviders(providers, provenSkill) as Providers;
      console.log(`${label} SKILL BANK: proven config for '${skillDomain}' (${provenSkill.uses} uses, avg trust ${provenSkill.avgTrust.toFixed(0)}) — ${provenSkill.providers.length} providers prioritized`);
      (stats as any).skillBank = { applied: true, domain: skillDomain, uses: provenSkill.uses, avgTrust: Math.round(provenSkill.avgTrust) };
    }
  } catch { /* non-blocking */ }

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
  // Simple = genuinely narrow: few content concepts AND no structural complexity.
  // (Word count alone misclassifies short multi-domain questions like
  // "Impact of AI regulation on European competitiveness" — 7 words, 5 concepts.)
  const isSimpleQuery = queryComplexity <= 1 && conceptCount <= 3;
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
    data: { question: query, format: isStrategic ? "strategic" : isMemo ? "memo" : "brief", status: "RUNNING" },
  });

  // ── DURABLE EXECUTION (Sprint 6) ──
  // Stable key: resumes must find the same state across retries — keying on
  // pipelineRun.id (fresh per attempt) would never resume. A crashed/timed-out
  // run re-dispatched for the same query+format picks up at its last checkpoint.
  const durableKey = useDurableExecution
    ? durableKeyFor(query, opts.format ?? (isStrategic ? 'strategic' : isMemo ? 'memo' : 'brief'))
    : null;
  if (durableKey) {
    try {
      await initDurableRun(durableKey, query);
      console.log(`${label} DURABLE EXECUTION: initialized (${durableKey})`);
    } catch (err) {
      console.warn(`${label} DURABLE EXECUTION: init failed (non-blocking):`, err);
    }
  }
  const durable = <T>(step: string, fn: () => Promise<T>, costUsd = 0): Promise<T> =>
    durableKey ? runDurableStep(durableKey, step, fn, { costUsd }) : fn();

  // P2/8: with durable execution on, the signal bus persists to agentAuditLog
  // so coordination state (unresolved needs) survives a crash and rehydrates
  // on resume — a checkpoint restores step outputs, this restores the bus.
  if (durableKey) {
    try {
      const { PersistentSignalBus, rehydrateSignalBus } = await import('./signals');
      ctx.signals = (await rehydrateSignalBus(ctx, `pipeline:${durableKey}`))
        ?? new PersistentSignalBus(ctx, `pipeline:${durableKey}`);
    } catch { /* persistence is opportunistic — fall back to in-memory bus */ }
  }

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

  // P2/9: Emit progress events for SSE streaming
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
  // Function-scope copy of deep-planner nodes — `planResult` lives inside the
  // else-block below, but the post-render process audit needs the nodes.
  let planNodesForAudit: Array<{ subQuestion: string; status: string; sourceCount?: number }> = [];
  const seedIds = [...new Set((opts.seedSourceIds ?? []).filter(Boolean))];
  // DURABLE RESUME: a crashed/timed-out run's scout checkpoint re-enters as
  // seedIds — the existing skipScout path does the bookkeeping uniformly.
  const scoutCkpt = durableKey
    ? await durableResume<{ allSourceIds: string[] }>(durableKey, 'scout').catch(() => null)
    : null;
  if (scoutCkpt?.allSourceIds?.length) {
    seedIds.push(...scoutCkpt.allSourceIds.filter(id => !seedIds.includes(id)));
    console.log(`${label} DURABLE: scout checkpoint restored — ${scoutCkpt.allSourceIds.length} source ids (skipScout path)`);
  }
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
      // PLAN PREVIEW — expose the research plan to the UI before execution
      // (Gemini collaborative-planning pattern). Consumers of the progress
      // stream can render the intended investigation structure.
      emitProgress(pipelineRun.id, "SCOUT", "started",
        `Research plan: ${planResult.plan.nodes.length} investigation branches`, {
        planPreview: planResult.plan.nodes.map((n: any) => ({
          id: n.id,
          subQuestion: n.subQuestion,
          producers: n.producers,
          dependsOn: n.parentIds,
        })),
      });
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
        // Sub-question scouts must be LEAN — inheriting the full provider set
        // turned each DAG node into a 60-provider × 4-query fan-out (~2min each),
        // blowing the pipeline timeout. A compact core set is enough for a
        // targeted sub-question; breadth lives in the root scout.
        const NODE_CORE_PROVIDERS = ["openalex", "crossref", "europepmc", "linkup", "tavily", "exa"] as const;
        const nodeProviders = (validNodeProducers.length >= 3
          ? Array.from(new Set([...validNodeProducers.slice(0, 8), ...NODE_CORE_PROVIDERS.slice(0, 4), 'no-routing']))
          : Array.from(new Set([...validNodeProducers, ...NODE_CORE_PROVIDERS, 'no-routing']))) as unknown as Providers;
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

      // ── DYNAMIC REPLANNING: if nodes failed or returned thin, generate
      // follow-up sub-questions from execution findings and scout them. ──
      const thinOrFailed = planResult.plan.nodes.filter(
        (n: any) => n.status === 'failed' || (n.sourceCount ?? 0) < 5
      );
      if (thinOrFailed.length > 0 && !isBudgetConstrained()) {
        try {
          const { replanFromFindings } = await import('./deep-planner');
          const replan = await replanFromFindings(query, planResult.plan.nodes, 3);
          if (replan.nodes.length > 0) {
            console.log(`${label} DEEP PLANNER REPLAN: ${replan.nodes.length} follow-up nodes for ${thinOrFailed.length} thin/failed`);
            for (const node of replan.nodes) {
              node.status = 'scouting';
              const validP = node.producers.filter(p => KNOWN_PROVIDERS.has(p));
              const nodeProviders = validP.length >= 3
                ? Array.from(new Set([...validP.slice(0, 8), ...providers.slice(0, 4)])) as Providers
                : providers;
              const res = await scout(node.subQuestion, nodeProviders, isStrategic ? 30 : 25);
              const ids = Array.isArray(res) ? res.map(s => s.id) : (res.sourceIds || []);
              node.sourceIds = ids;
              node.sourceCount = ids.length;
              node.status = ids.length > 0 ? 'expanded' : 'failed';
              allSourceIds.push(...ids);
              planResult.plan.nodes.push(node);
              console.log(`${label} DEEP PLANNER REPLAN: ${node.id} "${node.subQuestion.slice(0, 60)}" → ${ids.length} sources`);
            }
            allSourceIds = [...new Set(allSourceIds)];
          }
        } catch (err) {
          console.warn(`${label} DEEP PLANNER REPLAN: failed (non-blocking):`, err);
        }
      }

      stats.deepPlanner = { nodes: planResult.plan.nodes.length, costUsd: planResult.costUsd };
      planNodesForAudit = planResult.plan.nodes.map((n: any) => ({
        subQuestion: n.subQuestion, status: n.status, sourceCount: n.sourceCount,
      }));
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
    : useStorm
      ? generateStormReformulations(query, label)
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

  // ── WITNESS: Observe SCOUT step ──
  if (witnessCtx) {
    try {
      await witnessCtx.observe(buildObservation('scout', {
        success: true,
        costUsd: 0.02,
        durationMs: Date.now() - pipelineStart,
        outputSummary: `Found ${found} sources from ${allSourceIds.length} IDs`,
        metrics: { sourcesFound: found, providerDiversity: new Set(allSourceIds.map(id => id.split(":")[0])).size },
        errors: [],
      }, pipelineStart));
    } catch (err) {
      console.warn(`${label} WITNESS: scout observation failed:`, err);
    }
  }

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
        adaptiveProviders.push(...["openalex", "crossref", "semanticscholar", "arxiv", "europepmc", "base", "doaj", "ipcc", "internet-archive", "hathitrust", "jstor", "unesco", "opencitations"] as any);
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
  // (skipped on durable resume — the scout checkpoint already includes enrichment)
  if (!scoutCkpt) try {
    const { runIntelligentScout } = await import('./intelligent-scout');
    const format = isStrategic ? 'strategic' : isDossier ? 'dossier' : isMemo ? 'memo' : 'brief';
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

    // ── LENS INSIGHTS → ANALYST CONTEXT ──
    // Each lens produced a PhD-level mini-analysis. Inject them so the
    // analyst sees the disciplinary readings, not just the raw sources.
    if (eclecticResult.lensInsights && eclecticResult.lensInsights.length > 0) {
      const tensionSection = eclecticResult.lensTensions && eclecticResult.lensTensions.length > 0
        ? [
            '',
            '## INTER-LENS TENSIONS — GENUINE DISAGREEMENTS BETWEEN READINGS',
            'These are real axes of debate between disciplinary perspectives. Do NOT flatten them into consensus — either arbitrate with evidence or present the disagreement as a finding itself.',
            ...eclecticResult.lensTensions.map(t =>
              `- ${t.between}: ${t.tension}\n  Weighting advice: ${t.resolution}`
            ),
          ].join('\n')
        : '';
      const insightsBlock = [
        '## LENS INTELLIGENCE — DISCIPLINARY READINGS',
        'Each analytical lens produced its own expert reading of the question. Use these as specialized perspectives — the ontological lens excavates assumptions, the dissident lens surfaces excluded voices, the historical lens names precedents. Integrate them; do not flatten them into consensus.',
        '',
        ...eclecticResult.lensInsights.map(i =>
          `### ${i.lensType.toUpperCase().replace(/_/g, ' ')}\n${i.analysis}\nKey contribution: ${i.keyContribution}${i.knowledgeGaps.length > 0 ? `\nOpen gaps: ${i.knowledgeGaps.join('; ')}` : ''}`
        ),
        tensionSection,
      ].join('\n');
      // Store for injection into the analyst context block (assembled later)
      (stats as any).lensInsightsBlock = insightsBlock;
      (stats as any).lensTensions = eclecticResult.lensTensions?.length ?? 0;
      console.log(`${label} LENS INTELLIGENCE: ${eclecticResult.lensInsights.length} disciplinary analyses${eclecticResult.lensTensions?.length ? `, ${eclecticResult.lensTensions.length} inter-lens tensions` : ''}`);
    }

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
  if (!scoutCkpt) try {
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

  // DURABLE CHECKPOINT: allSourceIds is final (scout + re-scout + intelligent
  // scout + citation graph all done). A resume re-enters via seedIds and skips
  // the whole provider fan-out.
  if (durableKey && allSourceIds.length > 0) {
    saveDurableStep(durableKey, 'scout', { allSourceIds }).catch(() => {});
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

    // ── SOURCE QUALITY RERANK — boost top sources by reliability, recency, richness ──
    try {
      const qualityScored = await rankSourcesByQuality(topSources);
      for (const qs of qualityScored) {
        const match = topSources.find((s: any) => s.id === qs.source.id);
        if (match) {
          (match as any).sourceQuality = qs.score;
          (match as any).compositeScore = ((match as any).compositeScore ?? 0) * 0.6 + qs.score.overall * 0.4;
        }
      }
      topSources.sort((a: any, b: any) => (b.compositeScore ?? 0) - (a.compositeScore ?? 0));
      console.log(`${label} SOURCE QUALITY: re-ranked ${topSources.length} by composite (relevance 60% + quality 40%)`);
    } catch (err) {
      console.warn(`${label} SOURCE QUALITY: re-rank failed (non-blocking):`, err);
    }
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
      enrichmentAssessment.enrichmentQueries.slice(0, 3).map(q => scout(q, enrichmentProviders, isStrategic ? 25 : 20))
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

      // S15-09/S16-fix: NestBrowse — deep web extraction for sources with URLs but no abstracts
      try {
        const { exploreUrl } = await import('./nestbrowse');
        const sourcesNeedingExtraction = topSources.filter((s: any) => s.url && (!s.abstract || s.abstract.length < 100));
        if (sourcesNeedingExtraction.length > 0 && sourcesNeedingExtraction.length <= 5) {
          console.log(`${label} NESTBROWSE: extracting content from ${sourcesNeedingExtraction.length} sources with missing abstracts`);
          for (const s of sourcesNeedingExtraction) {
            try {
              const result = await exploreUrl(s.url || '', { extractDepth: 'shallow' });
              if (result?.content && result.content.length > 200) {
                s.abstract = result.content.slice(0, 2000);
                console.log(`${label} NESTBROWSE: extracted ${result.content.length} chars from ${s.url}`);
              }
            } catch { /* non-blocking per source */ }
          }
        }
      } catch { /* non-blocking */ }

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
        // Re-rank with the new sources — MUST scope to retryNewSourceIds
        // (without sourceIds, rank queries the entire DB and won't find the new sources)
        const retryRanked = await rank(query, { limit: isStrategic ? 25 : 15, mode: 'balanced', sourceIds: retryNewSourceIds } as any);
        if (retryRanked.length > 0) {
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

  // ── PREPARE FOUNDATIONAL SOURCES (post-classification, pre-rank) ──
  // Seminal works from researcher KB — prepared here, injected AFTER rank.
  // They don't exist in DB, so rank() would filter them out.
  let foundationalSources: Array<{
    id: string; title: string; abstract: string; authors: Array<{ name: string }>;
    year: number; doi: string | null; provider: string; url: string | null;
    type: string; qualityScore: number; metadata: Record<string, unknown>;
  }> = [];
  try {
    const kb = RESEARCHER_KBS[detectedDomain as keyof typeof RESEARCHER_KBS];
    if (kb?.referencePapers && kb.referencePapers.length > 0) {
      foundationalSources = kb.referencePapers.slice(0, 3).map((p, i) => ({
        id: `foundational:${detectedDomain}:${i}`,
        title: p.title,
        abstract: `${p.significance}. Authors: ${p.authors}. Journal: ${p.journal}. Year: ${p.year}.`,
        authors: [{ name: String(p.authors) }],
        year: p.year,
        doi: null,
        provider: 'foundational',
        url: null,
        type: 'reference',
        qualityScore: 95,
        metadata: { seminal: true, domain: detectedDomain },
      }));
      console.log(`${label} FOUNDATIONAL INJECTION: prepared ${foundationalSources.length} seminal works from ${detectedDomain} KB (will inject after rank)`);
    }
  } catch (err) {
    console.warn(`${label} FOUNDATIONAL INJECTION: failed (non-blocking):`, err);
  }

  // ── INJECT FOUNDATIONAL SOURCES (post-rank, post-classification) ──
  // Seminal works from researcher KB are added directly to topSources.
  // They bypass rank() because they don't exist in the DB — they're context-only
  // reference papers that the analyst can cite for theoretical grounding.
  if (foundationalSources.length > 0) {
    for (const fs of foundationalSources) {
      (fs as any).loadBearing = false;
      (fs as any).compositeScore = 85;
      topSources.push(fs as any);
    }
    console.log(`${label} FOUNDATIONAL INJECTION: +${foundationalSources.length} seminal works injected into topSources (now ${topSources.length} total)`);
  }
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
  // CASTING: active when think-tank pack or editorial V2 is enabled — required for position-first rendering
  if (useThinkTankPack || editorialV2) {
    try {
      const { castingAgent } = await import('./casting-agent');
      castingResult = await castingAgent(query, topicClassification);
      stats.casting = {
        teamSize: castingResult.team.length,
        collisionSummary: castingResult.collisionSummary,
        costUsd: castingResult.costUsd,
      };
      console.log(`${label} CASTING: ${castingResult.team.length} lenses — ${castingResult.collisionSummary}`);
    } catch (err) {
      console.warn(`${label} CASTING: failed (non-blocking):`, err);
      stats.casting = { skipped: true, reason: err instanceof Error ? err.message : String(err) };
      // Fallback: ensure castingResult is set so arbiter + foresight can still run
      const { castingAgent } = await import('./casting-agent');
      const { dimensionsFromClassification } = await import('./editorial-types');
      const fallbackDims = dimensionsFromClassification(topicClassification);
      const fallbackTeam = [
        { lensId: 'lead', domain: 'Policy', role: 'lead' as const, mandate: `Primary analytical lens on: ${query.slice(0, 120)}` },
        { lensId: 'friction', domain: 'Evidence integrity', role: 'friction' as const, mandate: 'Challenge causal claims and test whether conclusions survive missing counterevidence.', frictionWith: 'Policy' },
        { lensId: 'stress-test', domain: 'Strategic foresight', role: 'stress-test' as const, mandate: 'Stress-test projections against alternative futures and identify black-swan risks.', frictionWith: 'Evidence integrity' },
      ];
      castingResult = { team: fallbackTeam, collisionSummary: query.slice(0, 100), productiveFriction: 'Evidence integrity challenges Policy; foresight stress-tests against alternative futures.', costUsd: 0 };
      console.log(`${label} CASTING: using pipeline-level fallback (${fallbackTeam.length} lenses)`);
    }
  } else {
    stats.casting = { skipped: true, reason: 'suppressed — enable useThinkTankPack or editorialV2' };
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
    durable('reader', () => readerAgentV3(topSources, {
      enablePdf: true,
      maxConcurrency: 8,
      timeout: isStrategic ? 120000 : undefined,
      domain: detectedDomain,
      memoryBlock: readerMemoryBlock,
    })),
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
  // S20/B: full depth breakdown persisted for groundedness trend tracking
  const depthBreakdown = {
    full_text: fullTextCount,
    abstract: readings.filter(r => r.readingDepth === "abstract").length,
    rule_based: readings.filter(r => r.readingDepth === "rule_based").length,
  };
  stats.reader = { count: readings.length, fullText: fullTextCount, withQuantData: quantCount, depth: depthBreakdown };
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

  // ── EVIDENCE BANK (WebWeaver/Perplexity pattern) ──
  // Citations attach to extracted evidence AT READING TIME, not generation
  // time. The analyst is constrained to banked claims; post-render we flag
  // citations to sources that contributed no evidence (hallucination risk).
  let evidenceBankBlock: string | undefined;
  let evidenceBankRef: import('./evidence-bank').EvidenceBank | null = null;
  try {
    const { buildEvidenceBank, buildEvidenceBankBlock } = await import('./evidence-bank');
    evidenceBankRef = buildEvidenceBank(readings, topSources);
    if (evidenceBankRef.entries.length >= 8) {
      evidenceBankBlock = buildEvidenceBankBlock(evidenceBankRef);
      console.log(`${label} EVIDENCE BANK: ${evidenceBankRef.entries.length} entries across ${evidenceBankRef.perSource.size} sources`);
    }
    stats.evidenceBank = { entries: evidenceBankRef.entries.length, sourcesWithEvidence: evidenceBankRef.perSource.size };
  } catch (err) {
    console.warn(`${label} EVIDENCE BANK: build failed (non-blocking):`, err);
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

  // ── SELF-CORRECTION: READER — assess quality, retry if low (Reflexion pattern) ──
  try {
    const readerSCInput = readings.map((r: any) => ({
      sourceId: r.sourceId,
      claims: r.claims || [],
      confidence: r.confidence || 'medium',
    }));
    const scResult = await selfCorrectReader({
      query,
      readings: readerSCInput,
      maxRetries: 1,
      retryFn: async (feedback: string) => {
        // Re-run reader with feedback injected via memoryBlock
        const { readerAgentV3 } = await import('./reader-agent-v3');
        const reRead = await readerAgentV3(topSources, { memoryBlock: feedback, domain: detectedDomain });
        return reRead.map((r: any) => ({
          sourceId: r.sourceId,
          claims: r.claims || [],
          confidence: r.confidence || 'medium',
        }));
      },
    });
    if (scResult.stats.triggered) {
      stats.selfCorrection = stats.selfCorrection || {};
      (stats.selfCorrection as any).reader = scResult.stats;
      addCost(scResult.stats.costUsd, 'SELF-CORRECTION (READER)');
      if (scResult.stats.improved) {
        // Replace readings with improved version
        const improvedReadings = scResult.readings;
        // Map back to full reading objects by sourceId
        for (const imp of improvedReadings) {
          const idx = readings.findIndex((r: any) => r.sourceId === imp.sourceId);
          if (idx >= 0 && imp.claims.length > readings[idx].claims.length) {
            readings[idx].claims = imp.claims;
          }
        }
        console.log(`${label} SELF-CORRECTION (READER): ${scResult.stats.originalScore} → ${scResult.stats.finalScore} after ${scResult.stats.retries} retry`);
      }
      // Log to AgentAuditLog for dashboard visibility
      prisma.agentAuditLog.create({
        data: {
          agent: 'reader',
          action: 'SELF_CORRECTION',
          metadata: JSON.stringify({
            phase: 'reader',
            originalScore: scResult.stats.originalScore,
            finalScore: scResult.stats.finalScore,
            retries: scResult.stats.retries,
            improved: scResult.stats.improved,
            issues: scResult.stats.issues.slice(0, 3),
          }),
        },
      }).catch(() => {}); // non-blocking
    }
  } catch (err) {
    console.warn(`${label} SELF-CORRECTION (READER): failed (non-blocking):`, err);
  }

  // ── ORCHESTRATOR ACTION: DEEPEN — was logged but never acted upon. NOW ACTED. ──
  if (readerDecision.action === "DEEPEN" && orchState.iteration < orchState.maxIterations) {
    console.log(`${label} ORCHESTRATOR: DEEPEN — ${readerDecision.reason}`);
    emitProgress(pipelineRun.id, "READER", "started", `Deepening: extracting full-text for low-abstract sources...`);
    try {
      const sourcesNeedingFullText = topSources.filter((s: any) =>
        !s.abstract || s.abstract.length < 100
      ).slice(0, 8);
      let deepenedCount = 0;
      for (const source of sourcesNeedingFullText) {
        try {
          // Try to fetch full-text via available providers
          if ((source as any).doi || (source as any).url) {
            const { extractPDFText } = await import('../providers/pdf-extractor');
            const pdfUrl = (source as any).url || ((source as any).doi ? `https://doi.org/${(source as any).doi}` : null);
            if (pdfUrl) {
              const result = await extractPDFText(pdfUrl, { maxPages: 20, timeout: 30000 });
              if (result.success && result.text && result.text.length > 500) {
                (source as any).fullText = result.text;
                (source as any).abstract = (source as any).abstract || result.text.slice(0, 500);
                deepenedCount++;
              }
            }
          }
        } catch (e) {
          // Non-blocking: continue with other sources
        }
      }
      if (deepenedCount > 0) {
        console.log(`${label} DEEPEN: extracted full-text for ${deepenedCount}/${sourcesNeedingFullText.length} sources`);
        // Re-run reader on deepened sources
        const { readerAgentV3 } = await import('./reader-agent-v3');
        const deepenedReadings = await readerAgentV3(topSources);
        // Merge: keep the better reading per source
        for (const dr of deepenedReadings) {
          const idx = readings.findIndex((r: any) => r.sourceId === dr.sourceId);
          if (idx < 0 || (dr.claims?.length > (readings[idx]?.claims?.length || 0))) {
            if (idx >= 0) readings[idx] = dr;
          }
        }
        orchState.sourcesWithFullText = readings.filter((r: any) => r.readingDepth === "full_text").length;
        stats.orchestrator.deepenTriggered = true;
        stats.orchestrator.deepenedCount = deepenedCount;
      }
      orchState.iteration++;
      emitProgress(pipelineRun.id, "READER", "completed", `Deepened ${deepenedCount} sources`);
    } catch (err) {
      console.warn(`${label} DEEPEN: failed (non-blocking):`, err);
    }
  }

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
  let synapseMemoryBlock: string | undefined;
  try {
    const memInj = await buildMemoryInjection(agentId, detectedDomain as DomainExpertise, { maxLessons: 5, lookbackDays: 90, topicQuery: query });
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
  // S15-12: Synapse memory (ACL 2026) — spreading activation for associative retrieval
  try {
    const { buildSynapseMemoryInjection, createSynapseGraph, addMemoryNode, connectMemories, retrieveWithSpreadingActivation } = await import('./synapse-memory');
    // Build a simple graph from recent episodes and retrieve associative memories
    const graph = createSynapseGraph();
    // The synapse injection is complementary to episodic memory
    const synapseInjection = buildSynapseMemoryInjection({ nodes: [], trace: [], totalActivation: 0 });
    if (synapseInjection) {
      synapseMemoryBlock = synapseInjection;
    }
  } catch (e) { /* non-blocking */ }
  // Build domain context block (injected via contextBlock for both formats)
  // Covers the primary domain AND the casting dimensions — a lens is only a
  // persona until it carries the field's concepts, frameworks, biases, canon.
  let domainBlock = '';
  const domainList: string[] = [detectedDomain];
  for (const d of (topicClassification.dimensions ?? []).slice(0, 3)) {
    const dom = String(d.domain ?? '');
    if (dom && !domainList.includes(dom)) domainList.push(dom);
  }
  const domainParts: string[] = [];
  for (const dom of domainList.slice(0, 4)) {
    const kb = RESEARCHER_KBS[dom as DomainExpertise];
    const corpus = MULTI_DOMAIN_CORPUS[dom as DomainExpertise];
    if (!kb && !corpus) continue;
    const parts = [`Domain: ${dom.toUpperCase()}${dom === detectedDomain ? ' (primary)' : ''}`];
    if (kb?.keyConcepts?.length) parts.push(`Core concepts: ${kb.keyConcepts.slice(0, 5).map((c: KeyConcept) => c.name).join(', ')}`);
    if (kb?.frameworks?.length) parts.push(`Frameworks: ${kb.frameworks.slice(0, 3).map((f: AnalyticalFramework) => f.name).join(', ')}`);
    if (kb?.knownBiases?.length) parts.push(`Known biases: ${kb.knownBiases.slice(0, 3).join('; ')}`);
    if (kb?.referencePapers?.length) parts.push(`Foundational works (cite when relevant): ${kb.referencePapers.slice(0, 4).map(p => `${p.title} (${Array.isArray(p.authors) ? p.authors.join(', ') : p.authors}, ${p.year})`).join('; ')}`);
    if (corpus?.keyFrameworks?.length) parts.push(`Key frameworks: ${corpus.keyFrameworks.join(', ')}`);
    if (corpus?.seminalWorks?.length) parts.push(`Seminal works: ${corpus.seminalWorks.slice(0, 4).join('; ')}`);
    domainParts.push(parts.join('\n'));
  }
  domainBlock = domainParts.join('\n\n');

  // ── FOUNDATIONAL CANON — interpretive frameworks from philosophy, sociology,
  // history & strategy. Deterministic match on the query; injected so the
  // analyst reasons with named frameworks, not just recent papers.
  let canonBlock: string | undefined;
  try {
    const { matchCanon, buildCanonBlockFromMatches } = await import('./canon/canon-matcher');
    const canonMatches = matchCanon(query, { topN: isStrategic || isDossier ? 8 : 5 });
    canonBlock = buildCanonBlockFromMatches(canonMatches);
    if (canonBlock) {
      console.log(`${label} CANON: ${canonMatches.length} foundational frameworks injected (${canonMatches.map(m => m.entry.author.split(' ').pop()).join(', ')})`);
      stats.canon = { matches: canonMatches.length, entries: canonMatches.map(m => `${m.entry.author}, ${m.entry.work}`) };
    }
  } catch (err) {
    console.warn(`${label} CANON: failed (non-blocking):`, err instanceof Error ? err.message : String(err));
  }

  const strategicOptsBlock = isStrategic
    ? [opts.focusAreas && `Focus areas: ${opts.focusAreas}`, opts.targetAudience && `Target audience: ${opts.targetAudience}`, opts.urgencyContext].filter(Boolean).join('\n') || undefined
    : undefined;

  // ── EDITORIAL NORTH STAR — injected FIRST so the analyst reasons toward the finality ──
  // The publication is scored deterministically. Tell the analyst EXACTLY what is measured,
  // so producing a high-trust publication is the optimization target from the first token.
  // Citation target: 35% of sources — ambitious but achievable.
  // The analyst consistently cites 15-18% of sources; a 50% target caused endless quality loops.
  // 35% pushes for broader citation usage without wasting tokens on impossible targets.
  const citationTarget = Math.max(15, Math.ceil(topSources.length * 0.35));
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
    `ANTI-CONTRADICTION RULE: Before returning JSON, scan your verdict and key findings for internal contradictions. If sentence A claims X and sentence B claims not-X, resolve the contradiction or acknowledge the tension explicitly. The critic WILL detect contradictions and penalize heavily (10+ contradictions → score <50).`,
    `ANTI-BIAS RULE: Present evidence from ALL sides of the debate. For every policy position you endorse, cite at least one source that challenges it. Do not cherry-pick sources that confirm your hypothesis. If 7 sources support position A and 3 support position B, mention BOTH positions and explain the imbalance. The critic WILL flag bias if you present only one side.`,
    `INTERPRETIVE DEPTH RULE: If INTERPRETIVE FRAMEWORKS are provided in context, you MUST engage at least 2 of them explicitly — name the author and work, apply its analytical lens to the evidence, and note where it clarifies or fails. A publication that ignores the canon reads as journalism, not analysis.`,
    `PROSE QUALITY RULE: Write in clean, grammatical English. Do NOT repeat words across sentence boundaries (e.g., "indicates that to fragment" is wrong — write "indicates that fragmentation"). Do NOT insert citations inside abbreviations (write "e.g. [SRC-5]" not "e [SRC-5] g."). Do NOT leave double spaces. Read each sentence aloud mentally before finalizing.`,
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

  const fullContextParts: (string | undefined)[] = [
    editorialNorthStar,
    memoryBlock,
    synapseMemoryBlock,
    primedContext?.contextBlock,
    gapContextBlock,
    quant.evidenceBlock || undefined,
    quantBridge.evidenceBlock || undefined,
    hypothesisVerdictBlock || undefined,
    conflictContextBlock,
    scenarioContextBlock,
    domainBlock || undefined,
    canonBlock || undefined,
    evidenceBankBlock || undefined,
    (stats as any).lensInsightsBlock || undefined,
    innovatorBlock || undefined,
    strategicOptsBlock,
    episodicFormatted || undefined,
    dppContextBlock || undefined,
    roundTableBlock || undefined,
    witnessLearningInjection || undefined,
    worldModelInjection || undefined,
    selfPlayInjection || undefined,
  ];
  let fullContextBlock: string | undefined =
    fullContextParts.filter(Boolean).join("\n\n---\n\n") || undefined;

  // S16-02: SARA context compression (ACL 2026) — compress context to save tokens
  try {
    const { saraCompress } = await import('./sara-compression');
    const rawContext = fullContextParts.filter(Boolean).join('\n\n');
    // Only compress if context is large (>8000 chars ≈ ~2000 tokens)
    if (rawContext.length > 8000) {
      const compressed = saraCompress(rawContext, 6000); // Target ~6000 chars
      if (compressed.compressionRatio < 0.85) {
        console.log(`[Pipeline] SARA compression: ${rawContext.length} → ${compressed.compressedText.length} chars (${(compressed.compressionRatio * 100).toFixed(0)}% ratio)`);
        fullContextBlock = compressed.compressedText;
      }
    }
  } catch (e) { /* non-blocking */ }

  // ── PRIOR ATTEMPT FEEDBACK (regeneration loop): when the gate rejected a
  // previous attempt, its reasons + adversarial findings are injected so the
  // new analysis corrects the actual defects — best-of-N with memory, not a
  // blind retry. Injected AFTER SARA compression so it is never dropped. ──
  if (opts.priorFailureFeedback) {
    fullContextBlock = [
      fullContextBlock,
      `\n## PRIOR ATTEMPT FAILED — REVIEWER FEEDBACK (mandatory corrections)\nA previous version of this analysis was rejected by the publication gate. The new analysis MUST fix these defects:\n${opts.priorFailureFeedback}\nDo not repeat the failed framing — address each point or explicitly explain why it cannot be addressed with the available evidence.`,
    ].filter(Boolean).join('\n\n---\n\n');
    console.log(`${label} REGENERATION: prior failure feedback injected (${opts.priorFailureFeedback.length} chars)`);
  }

  let analysis: any;

  // ── ARTIFACT VERSIONING (Sprint 28 / P0/1) ──
  // The S27 bug class: an evaluation stays attached to an artifact that was
  // silently replaced (DA verdict on pre-sweep HTML, critic verdict on
  // pre-repair analysis). Counters bump ONLY on material content replacement —
  // not on enrichment (attaching centralScenario/scenarios metadata post-eval
  // doesn't invalidate what an evaluator judged) nor on cosmetic HTML fixes
  // (e.g./i.e. normalization, badge injection). Each evaluation is tagged with
  // the version it judged; collectStaleEvaluations() marks `.stale` on any
  // verdict attached to a replaced artifact — vetoes skip stale evals and the
  // publication gate sees them via stats.evaluationFreshness.
  let analysisArtifactVersion = 0;
  let htmlArtifactVersion = 0;
  const bumpAnalysisArtifact = () => { analysisArtifactVersion++; };
  const bumpHtmlArtifact = () => { htmlArtifactVersion++; };
  const tagEval = <T extends Record<string, any>>(entry: T, artifact: 'analysis' | 'html'): T => {
    (entry as any).evaluatedArtifact = artifact;
    (entry as any).artifactVersion = artifact === 'analysis' ? analysisArtifactVersion : htmlArtifactVersion;
    return entry;
  };
  const EVAL_STATS_KEYS = ['critic', 'criticPanel', 'devilsAdvocate', 'structuralEditor', 'claimGrounding', 'citationVerifier', 'factChecker', 'symbolicVerifier', 'peerReview'] as const;
  const evalVersionMatches = (e: any): boolean =>
    !e || typeof e !== 'object' || e.skipped || e.error ||
    typeof e.artifactVersion !== 'number' ||
    e.artifactVersion === (e.evaluatedArtifact === 'html' ? htmlArtifactVersion : analysisArtifactVersion);
  const collectStaleEvaluations = (): string[] => {
    const stale: string[] = [];
    for (const key of EVAL_STATS_KEYS) {
      const e = (stats as any)[key];
      if (e && typeof e === 'object' && !e.skipped && !e.error && !evalVersionMatches(e)) {
        e.stale = true;
        e.staleReason = `evaluated ${e.evaluatedArtifact} v${e.artifactVersion}, artifact now at v${e.evaluatedArtifact === 'html' ? htmlArtifactVersion : analysisArtifactVersion}`;
        stale.push(key);
      }
    }
    return stale;
  };

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

  // ── POSITIONING AGENT: editorial differentiation vs the field ──
  // Retrieve the competitor corpus (think tanks + editorial domains), map what
  // the field covers/converges on/misses, and inject differentiation directives
  // so the analysis BEATS existing publications rather than re-synthesizing
  // consensus. Runs on every format — differentiation matters everywhere
  // (~13s, ~$0.001 measured).
  let positioningBrief: any = null;
  try {
      const { buildPositioningBrief } = await import('./positioning-agent');
      positioningBrief = await buildPositioningBrief(query, { maxPieces: 10 });
      if (positioningBrief) {
        addCost(positioningBrief.costUsd, 'POSITIONING');
        fullContextBlock = [fullContextBlock, positioningBrief.contextBlock].filter(Boolean).join('\n\n---\n\n');
        stats.positioning = {
          competitorsFound: positioningBrief.competitorsFound,
          uncoveredDimensions: positioningBrief.uncoveredDimensions.length,
          directives: positioningBrief.directives.length,
          strongestPiece: positioningBrief.strongestPiece,
          fieldCoverage: positioningBrief.fieldCoverage,
          consensusClaims: positioningBrief.consensusClaims,
          gaps: positioningBrief.uncoveredDimensions,
          weakClaims: positioningBrief.weakClaims,
          directiveDetails: positioningBrief.directives,
          costUsd: positioningBrief.costUsd,
          durationMs: positioningBrief.durationMs,
        };
      }
    } catch (err) {
      console.warn(`${label} POSITIONING: failed (non-blocking):`, err instanceof Error ? err.message : String(err));
    }

  // ── ANALYST: ReAct mode (agentic) vs classic multipass ──
  // ReAct mode: the analyst can search, read, debate DURING reasoning
  // MoA mode: multiple specialist analysts collaborate
  // Classic mode: the analyst receives all sources and synthesizes in 3 passes
  if (useMixtureOfAgents) {
    console.log(`${label} ANALYST: Mixture of Agents mode — multiple specialists collaborating`);
    emitProgress(pipelineRun.id, "ANALYST", "started", `Mixture of Agents analysis (${isStrategic ? "strategic" : "brief"})...`);
    try {
      // S16-01: Graph-of-Agents (ICLR 2026) — select top-3 agents by capability match
      // instead of using all N agents. Reduces cost while improving quality.
      let selectedAgentIds: string[] | undefined;
      try {
        const { selectAgents, DEFAULT_GOA_CONFIG } = await import('./graph-of-agents');
        const availableAgents = [
          { id: 'evidence', role: 'evidence specialist', capabilities: ['data analysis', 'source evaluation', 'fact checking'], model: 'deepseek' },
          { id: 'synthesis', role: 'synthesis specialist', capabilities: ['synthesis', 'integration', 'narrative'], model: 'deepseek' },
          { id: 'skeptic', role: 'skeptic', capabilities: ['criticism', 'risk analysis', 'counter-arguments'], model: 'glm' },
          { id: 'uncertainty', role: 'uncertainty specialist', capabilities: ['uncertainty quantification', 'confidence estimation'], model: 'kimi' },
          { id: 'methodologist', role: 'methodologist', capabilities: ['methodology', 'research design', 'statistics'], model: 'deepseek' },
          { id: 'domain_expert', role: 'domain expert', capabilities: ['domain knowledge', 'expertise', 'context'], model: 'glm' },
        ];
        const selected = selectAgents(query, availableAgents, DEFAULT_GOA_CONFIG);
        selectedAgentIds = selected.map(a => a.id);
        console.log(`${label} GoA: selected ${selectedAgentIds.length} agents: ${selectedAgentIds.join(', ')}`);
      } catch (e) { /* non-blocking — use all agents */ }

      const moaResult = await runMixtureOfAgents(
        query,
        topSources.map((s: any) => ({ id: s.id, title: s.title, abstract: s.abstract, fullText: s.fullText })),
        fullContextBlock || '',
        { isStrategic, ...(selectedAgentIds ? { agents: selectedAgentIds as any } : {}) },
      );
      console.log(`${label} ANALYST: MoA complete — ${moaResult.specialistAnalyses.length} specialists, ${moaResult.consensus.length} consensus points, ${moaResult.controversies.length} controversies, confidence=${moaResult.overallConfidence.toFixed(2)}`);
      emitProgress(pipelineRun.id, "ANALYST", "completed", `MoA: ${moaResult.specialistAnalyses.length} specialists, confidence ${moaResult.overallConfidence.toFixed(2)}`);

      // Use the aggregated analysis as the final analysis
      analysis = {
        title: query,
        summary: moaResult.aggregatedAnalysis.slice(0, 500),
        consensus: moaResult.consensus.join('\n\n'),
        disagreements: moaResult.controversies.map(c => `${c.topic}: ${c.resolution}`).join('\n\n'),
        debate: {
          pro: moaResult.controversies.map(c => c.positions.find(p => p.agent)?.position).filter(Boolean).join('\n'),
          con: moaResult.controversies.map(c => c.positions.slice(1).map(p => p.position).join('\n')).filter(Boolean).join('\n'),
          synthesis: moaResult.controversies.map(c => c.resolution).join('\n\n'),
        },
        evidence: moaResult.specialistAnalyses.find(a => a.agentId === 'evidence')?.analysis || '',
        implications: moaResult.specialistAnalyses.find(a => a.agentId === 'synthesis')?.analysis || '',
        risks: moaResult.specialistAnalyses.find(a => a.agentId === 'skeptic')?.analysis || '',
        open_questions: moaResult.controversies.map(c => c.topic).join('\n'),
        what_changes_mind: moaResult.specialistAnalyses.find(a => a.agentId === 'uncertainty')?.keyInsights.join('\n') || '',
        _meta: {
          moaResult,
          mode: 'mixture_of_agents',
          agentCount: moaResult.specialistAnalyses.length,
          overallConfidence: moaResult.overallConfidence,
          totalCostUsd: moaResult.totalCostUsd,
        },
      };
      bumpAnalysisArtifact();
      addCost(moaResult.totalCostUsd, 'ANALYST MOA');
      (stats as any).moa = {
        agentCount: moaResult.specialistAnalyses.length,
        consensus: moaResult.consensus.length,
        controversies: moaResult.controversies.length,
        uniqueInsights: moaResult.uniqueInsights.length,
        overallConfidence: moaResult.overallConfidence,
      };
    } catch (err: any) {
      console.warn(`${label} ANALYST: MoA failed, falling back to classic: ${err.message}`);
      emitProgress(pipelineRun.id, "ANALYST", "started", `MoA failed — falling back to classic multipass...`);
      // Fall through to classic multipass below
    }
  }

  analysis = await durable('analyst', () => analystMultipass(query, topSources, slimReadings, {
    contextBlock: fullContextBlock,
    domain: detectedDomain,
    depth: isStrategic ? "strategic" : "brief",
  }));
  bumpAnalysisArtifact();

  // S14-G: Test-Time Scaling (ICLR 2026 — Zeng et al.)
  // For strategic queries with sufficient budget, generate a second candidate
  // and pick the one with better citation coverage. This is a simplified version
  // of the asymmetric verification pattern: generate N candidates (cheap, parallel),
  // verify deterministically (citation count), select the best.
  if (isStrategic && runningCostUsd < (opts.maxBudgetUsd ?? 5) * 0.4) {
    try {
      console.log(`${label} TEST-TIME SCALING: generating second candidate for comparison...`);
      const candidate2 = await analystMultipass(query, topSources, slimReadings, {
        contextBlock: fullContextBlock,
        domain: detectedDomain,
        depth: "strategic",
      });
      const citeCount1 = Array.from((analysis as any).html?.matchAll(/\[SRC-\d+\]/g) ?? []).length;
      const citeCount2 = Array.from((candidate2 as any).html?.matchAll(/\[SRC-\d+\]/g) ?? []).length;
      const len1 = (analysis as any).html?.length ?? 0;
      const len2 = (candidate2 as any).html?.length ?? 0;
      // Pick the better candidate: prefer more citations, then longer analysis
      if (citeCount2 > citeCount1 || (citeCount2 === citeCount1 && len2 > len1 * 1.1)) {
        console.log(`${label} TEST-TIME SCALING: candidate 2 selected (cites: ${citeCount2} vs ${citeCount1}, len: ${len2} vs ${len1})`);
        analysis = candidate2;
        bumpAnalysisArtifact();
      } else {
        console.log(`${label} TEST-TIME SCALING: candidate 1 kept (cites: ${citeCount1} vs ${citeCount2}, len: ${len1} vs ${len2})`);
      }
      stats.testTimeScaling = { activated: true, candidatesCompared: 2, winnerCitations: Math.max(citeCount1, citeCount2) };
    } catch (ttsErr) {
      console.warn(`${label} TEST-TIME SCALING: failed (non-blocking):`, ttsErr instanceof Error ? ttsErr.message : String(ttsErr));
    }
  }
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

  // ── OUTPUT GUARDRAILS + LOCAL JUDGE (Sprint 6) ──
  if (useOutputGuard) {
    try {
      const analysisStr = typeof analysis === 'string' ? analysis : JSON.stringify(analysis);
      const guardResult = guardOutput(analysisStr, {
        requireCitations: true,
        validateCitationRanges: true,
        sourceCount: topSources.length,
        checkPII: true,
        checkSafety: true,
        maxPiiCount: 0,
        confidenceMode: 'cautious',
        requiredFormat: 'json',
      });
      (stats as any).outputGuard = { outcome: guardResult.outcome, score: guardResult.score, violations: guardResult.violations.length };
      console.log(`${label} OUTPUT GUARD: ${guardResult.outcome} (score=${guardResult.score}, violations=${guardResult.violations.length})`);
    } catch (err) {
      console.warn(`${label} OUTPUT GUARD: failed (non-blocking):`, err);
    }
  }
  if (useLocalJudge) {
    try {
      const analysisStr = typeof analysis === 'string' ? analysis : JSON.stringify(analysis);
      const judgeResult = await judge(analysisStr);
      (stats as any).localJudge = { score: judgeResult.overallScore, rubrics: judgeResult.rubrics, feedback: judgeResult.feedback.slice(0, 200) };
      console.log(`${label} LOCAL JUDGE: score=${judgeResult.overallScore.toFixed(2)}, usedLocal=${judgeResult.usedLocalJudge}`);

      // S16-06: JudgeArena calibration — compare judge score vs deterministic trust as ground truth
      try {
        const { calibrateLocalJudge } = await import('./local-judge');
        const trustAsGroundTruth = (stats.criticalLoop?.finalScore ?? 70) / 100;
        const judgeScore = judgeResult.overallScore;
        const calibration = await calibrateLocalJudge([judgeScore], [trustAsGroundTruth]);
        (stats as any).localJudgeCalibration = {
          kappa: calibration.kappa,
          rho: calibration.rho,
          reliability: calibration.reliability,
        };
        if (calibration.reliability === 'low') {
          console.warn(`${label} JUDGE CALIBRATION: low reliability (κ=${calibration.kappa.toFixed(2)}) — judge may need recalibration`);
        }
      } catch (calErr) { /* non-blocking */ }
    } catch (err) {
      console.warn(`${label} LOCAL JUDGE: failed (non-blocking):`, err);
    }
  }

  // ── WITNESS: Observe ANALYST step ──
  if (witnessCtx) {
    try {
      const analysisStr = typeof analysis === 'string' ? analysis : JSON.stringify(analysis);
      const citations = new Set((analysisStr.match(/\[SRC-\d+\]/g) || []).map((m: string) => m)).size;
      await witnessCtx.observe(buildObservation('analyst', {
        success: true,
        costUsd: analystCostUsd || 0.20,
        durationMs: Date.now() - pipelineStart,
        outputSummary: analysisStr.slice(0, 500),
        metrics: {
          citations,
          sourceCount: topSources.length,
          citationCoverage: citations / Math.max(1, topSources.length),
        },
        errors: [],
      }, pipelineStart));
      // Run meta-loop to check overall health — Witness is an actuator, not just
      // an observer: 'abort'/'reduce_scope' cut optional downstream phases.
      const metaResult = await witnessCtx.metaLoop();
      if (metaResult.recommendation !== 'continue') {
        console.warn(`${label} WITNESS: ${metaResult.recommendation.toUpperCase()} — ${metaResult.reason}`);
        (stats as any).witnessDirective = { recommendation: metaResult.recommendation, reason: metaResult.reason };
        ctx.addFinding('WITNESS', 'warning', `${metaResult.recommendation}: ${metaResult.reason}`);
        if (metaResult.recommendation === 'reduce_scope' || metaResult.recommendation === 'abort') {
          witnessReducedScope = true;
          runDevilsAdvocateStep = false;
          ctx.skipStep('devils-advocate');
          if (metaResult.recommendation === 'abort') {
            runDebateStep = false;
            runDeliberationStep = false;
            ctx.skipStep('debate');
            ctx.skipStep('deliberation');
          }
          console.log(`${label} WITNESS: ${metaResult.recommendation} applied — optional phases cut (self-play, DA${metaResult.recommendation === 'abort' ? ', debate, deliberation' : ''})`);
        }
      }
    } catch (err) {
      console.warn(`${label} WITNESS: analyst observation failed:`, err);
    }
  }

  // ── SELF-REFLECTION: SUPPENDED — redundant with 3-pass analyst, $0.05/run saved ──
  // LLM self-evaluation is unreliable (FlowVerify 2026: calibration drift, position bias).
  // The analyst multipass already has exploration → stress-test → synthesis.
  stats.selfReflection = { skipped: true, reason: 'suppressed — redundant with 3-pass analyst' };

  // ── SELF-PLAY: Adversarial testing — attack the analysis to find weaknesses ──
  if (useSelfPlay && analysis && !witnessReducedScope) {
    try {
      const analysisText = typeof analysis === 'string' ? analysis :
        (analysis.summary || '') + '\n' + (analysis.consensus || '') + '\n' + (analysis.debate?.synthesis || '');
      const spResult = await runSelfPlayRound(
        query,
        analysisText,
        topSources.map((s: any) => ({ id: s.id, title: s.title, abstract: s.abstract })),
      );
      console.log(`${label} SELF_PLAY: ${spResult.attacks.length} attacks, ${spResult.verdicts.filter(v => v.attackSucceeded).length} succeeded, robustness=${spResult.robustnessScore.toFixed(2)}`);
      (stats as any).selfPlay = {
        attacks: spResult.attacks.length,
        succeeded: spResult.verdicts.filter(v => v.attackSucceeded).length,
        robustnessScore: spResult.robustnessScore,
        lessons: spResult.lessons.length,
      };
    } catch (err) {
      console.warn(`${label} SELF_PLAY: failed:`, err);
    }
  }

  // ── PRM: Score the analyst step ──
  if (usePRM && prmModel && analysis) {
    try {
      const analysisText = typeof analysis === 'string' ? analysis : JSON.stringify(analysis);
      const features = extractFeatures({
        phase: 'analyst',
        subStep: 'final',
        action: 'Analysis synthesis',
        output: analysisText,
        runId: pipelineRun.id,
        timestamp: Date.now(),
      } as any);
      const prediction = scoreStep(features, prmModel);
      console.log(`${label} PRM: analyst step scored ${prediction.predictedReward.toFixed(3)} (recommendation: ${prediction.recommendation})`);

      // Persist the step for future training
      const step: ProcessStep = {
        id: `step_${pipelineRun.id}_analyst`,
        phase: 'analyst',
        subStep: 'final',
        action: 'Analysis synthesis',
        output: analysisText.slice(0, 500),
        features,
        reward: prediction.predictedReward,
        runId: pipelineRun.id,
        timestamp: Date.now(),
      };
      await persistProcessStep(step);
      (stats as any).prm = { analystScore: prediction.predictedReward, recommendation: prediction.recommendation };
    } catch (err) {
      console.warn(`${label} PRM: scoring failed:`, err);
    }
  }

  emitProgress(pipelineRun.id, "ANALYST", "completed", `${isStrategic ? "Strategic" : "Multi-pass"} analysis complete`, { blackboard: ctx.getSummary() });

  // SELF-CORRECT CHECKPOINT: ANALYST
  try {
    const analysisText = typeof analysis === 'string' ? analysis : JSON.stringify(analysis).slice(0, 8000);
    const cpResult = await selfCorrector.checkpoint(
      'analyst',
      analysisText,
      [
        citationCoverageVerifier('citation_coverage', topSources.length, 0.35),
        {
          id: 'internal_consistency',
          check: (output: string) => {
            const contradictions = (output.match(/\bhowever\b[\s\S]*?\bhowever\b/gi) || []).length;
            const hedgeDensity = (output.match(/\b(may|might|could|perhaps|possibly|seemingly|allegedly)\b/gi) || []).length;
            const wordCount = output.split(/\s+/).length;
            const hedgeRate = wordCount > 0 ? hedgeDensity / (wordCount / 1000) : 0;
            if (contradictions > 3) {
              return { verifierId: 'internal_consistency', verdict: 'retry' as const, score: 0.4, reasons: [`${contradictions} "however" transitions detected — possible contradiction cascade`] };
            }
            if (hedgeRate > 15) {
              return { verifierId: 'internal_consistency', verdict: 'retry' as const, score: 0.5, reasons: [`Hedge density ${hedgeRate.toFixed(1)}/1K words — analyst is uncertain, check evidence quality`] };
            }
            return { verifierId: 'internal_consistency', verdict: 'pass' as const, score: 0.9, reasons: [] };
          },
        },
      ],
      (analysis as any)?.confidence ?? 0.65,
    );
    if (cpResult.shouldRetry && cpResult.feedback.length > 0) {
      selfCorrectRetries++;
      console.log(`${label} SELF-CORRECT: ANALYST checkpoint triggered retry — feedback: ${cpResult.feedback.length} items`);
      (stats as any).selfCorrect = { ...((stats as any).selfCorrect ?? {}), analystCheckpoint: cpResult };
    }
    if (cpResult.cascadeDetected) {
      console.warn(`${label} SELF-CORRECT: CASCADE detected at ANALYST — severity=${cpResult.score.toFixed(2)}`);
    }
  } catch (scErr) {
    console.warn(`${label} SELF-CORRECT: ANALYST checkpoint failed (non-blocking):`, scErr);
  }

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

  // Re-analysis budget: a single full 3-pass analyst run costs ~7min/$0.5 on
  // reasoning models — cap total re-analyses (self-correct + orchestrator +
  // gap-fill) so repair loops cannot stack into a pipeline timeout.
  let reAnalysisBudget = isStrategic ? 2 : 1;

  // ── SELF-CORRECTION: ANALYST — assess quality, retry if low (Reflexion pattern) ──
  try {
    const analysisStr = typeof analysis === 'string' ? analysis : JSON.stringify(analysis);
    const analysisCitations = new Set((analysisStr.match(/\[SRC-\d+\]/g) || []).map((m: string) => m)).size;
    const scResult = await selfCorrectAnalyst({
      query,
      analysis,
      sourceCount: topSources.length,
      citationCount: analysisCitations,
      maxRetries: 1,
      retryFn: async (feedback: string) => {
        // Re-run analyst with feedback injected — subject to run budget
        if (reAnalysisBudget <= 0) {
          console.log(`${label} SELF-CORRECTION (ANALYST): retry skipped — re-analysis budget exhausted`);
          return analysis;
        }
        reAnalysisBudget--;
        const reAnalysis = await analystMultipass(query, topSources, slimReadings, {
          contextBlock: fullContextBlock + '\n\n' + feedback,
          domain: detectedDomain,
          depth: isStrategic ? "strategic" : "brief",
        });
        return reAnalysis;
      },
    });
    if (scResult.stats.triggered) {
      stats.selfCorrection = stats.selfCorrection || {};
      (stats.selfCorrection as any).analyst = scResult.stats;
      addCost(scResult.stats.costUsd, 'SELF-CORRECTION (ANALYST)');
      if (scResult.stats.improved) {
        analysis = scResult.analysis;
        bumpAnalysisArtifact();
        ctx.setAnalystOutput(analysis);
        console.log(`${label} SELF-CORRECTION (ANALYST): ${scResult.stats.originalScore} → ${scResult.stats.finalScore} after ${scResult.stats.retries} retry`);
      }
      // Log to AgentAuditLog for dashboard visibility
      prisma.agentAuditLog.create({
        data: {
          agent: 'analyst',
          action: 'SELF_CORRECTION',
          metadata: JSON.stringify({
            phase: 'analyst',
            originalScore: scResult.stats.originalScore,
            finalScore: scResult.stats.finalScore,
            retries: scResult.stats.retries,
            improved: scResult.stats.improved,
            issues: scResult.stats.issues.slice(0, 3),
          }),
        },
      }).catch(() => {}); // non-blocking
    }
  } catch (err) {
    console.warn(`${label} SELF-CORRECTION (ANALYST): failed (non-blocking):`, err);
  }

  // ── ORCHESTRATOR ACTION: RE_ANALYZE — was logged but never acted upon. NOW ACTED. ──
  if (analystDecision.action === "RE_ANALYZE" && orchState.iteration < orchState.maxIterations && reAnalysisBudget > 0) {
    reAnalysisBudget--;
    console.log(`${label} ORCHESTRATOR: RE_ANALYZE — ${analystDecision.reason}`);
    emitProgress(pipelineRun.id, "ANALYST", "started", `Re-analyzing with strengthened requirements...`);
    try {
      const reAnalysis = await analystMultipass(query, topSources, slimReadings, {
        contextBlock: fullContextBlock + '\n\n## STRENGTHENED REQUIREMENT (orchestrator-triggered re-analysis)\nThe previous analysis was deemed insufficient. ' + (analystDecision.reason || 'Improve citation coverage and analytical depth.') + '\nEvery claim MUST have a [SRC-N] citation. Uncited claims will be rejected.',
        domain: detectedDomain,
        depth: isStrategic ? "strategic" : "brief",
      });
      // Compare: keep the better version
      const reStr = typeof reAnalysis === 'string' ? reAnalysis : JSON.stringify(reAnalysis);
      const reCitations = new Set((reStr.match(/\[SRC-\d+\]/g) || []).map((m: string) => m)).size;
      const origStr = typeof analysis === 'string' ? analysis : JSON.stringify(analysis);
      const origCitations = new Set((origStr.match(/\[SRC-\d+\]/g) || []).map((m: string) => m)).size;
      if (reCitations > origCitations) {
        analysis = reAnalysis;
        bumpAnalysisArtifact();
        ctx.setAnalystOutput(analysis);
        addCost(typeof reAnalysis._meta?.totalCostUsd === "number" ? reAnalysis._meta.totalCostUsd : 0, 'RE_ANALYZE');
        console.log(`${label} RE_ANALYZE: improved citations ${origCitations} → ${reCitations}`);
        stats.orchestrator.reAnalyzeTriggered = true;
        stats.orchestrator.reAnalyzeCitationDelta = reCitations - origCitations;
        orchState.citationCoverage = reCitations / Math.max(1, topSources.length);
      } else {
        console.log(`${label} RE_ANALYZE: no improvement (${origCitations} → ${reCitations}), keeping original`);
      }
      orchState.iteration++;
      emitProgress(pipelineRun.id, "ANALYST", "completed", `Re-analysis complete`);
    } catch (err) {
      console.warn(`${label} RE_ANALYZE: failed (non-blocking):`, err);
    }
  }

  // ── STEP 5c: GAP-AWARE EVIDENCE APPEND — detect citation gaps, feed the
  // BLACKBOARD gap-fill loop below (scout → re-rank → re-analyze). ──
  try {
    const { analyzeCitationGaps, generateGapQueries } = await import('./gap-aware-append');
    const gaps = await analyzeCitationGaps(analysis as Record<string, unknown>, topSources.length);
    if (gaps.length > 0) {
      console.log(`${label} GAP ANALYSIS: ${gaps.length} sections with low citation coverage`);
      gaps.forEach(g => console.log(`  - ${g.section}: ${Math.round(g.coverage * 100)}% (${g.citationCount}/${g.sentenceCount})`));
      stats.gapAnalysis = { gapsFound: gaps.length, queriesGenerated: 0, newSources: 0 };

      // AUTONOMY: convert coverage gaps into targeted re-search requests.
      // Previously these were only logged — now they feed the gap-fill loop.
      if (!isBudgetConstrained() && orchState.iteration < orchState.maxIterations) {
        try {
          const gapQueries = await generateGapQueries(query, gaps.slice(0, 3));
          let queued = 0;
          for (const gq of gapQueries.slice(0, 3)) {
            if (gq && gq.length > 10) {
              ctx.requestSourceGap(
                gq.slice(0, 300),
                `Citation gap in analysis (${gaps.map(g => g.section).join(', ')})`,
                'GAP_ANALYSIS',
                ['crossref', 'semanticscholar', 'openalex', 'europepmc', 'internet-archive', 'jstor'],
                10,
              );
              queued++;
            }
          }
          stats.gapAnalysis.queriesGenerated = queued;
          if (queued > 0) {
            console.log(`${label} GAP ANALYSIS: ${queued} targeted re-search queries queued for gap-fill`);
          }
        } catch { /* non-blocking — gap queries are best-effort */ }
      }
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

  // ── BLACKBOARD: gap-request consumer, extracted as a reusable function ──
  // Any agent (ANALYST, CRITIC, OUTLINE-CRITIC, GAP_ANALYSIS) can push
  // evidence requests onto the blackboard via ctx.requestSourceGap(); this
  // consumer scouts them, re-ranks the pool, and re-analyzes. Called at its
  // original post-analyst position AND again after the critic/outline-critic
  // so late-stage agents have the same actuator.
  const processGapRequests = async (origin: string): Promise<void> => {
    if (!ctx.hasGapRequests()) return;
    const gapReqs = ctx.getPendingGapRequests();
    console.log(`${label} BLACKBOARD: processing ${gapReqs.length} gap requests from ${origin}`);
    emitProgress(pipelineRun.id, "GAP_FILL", "started", `Filling ${gapReqs.length} evidence gaps identified by ${origin}...`);
    try {
      const gapProviders = gapReqs[0].providers as string[] || ['crossref', 'semanticscholar', 'europepmc'];
      const gapResults = await Promise.allSettled(
        gapReqs.slice(0, 2).map(req => scout(req.query, gapProviders as Providers, req.minResults || 10))
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
        if (stats.gapAnalysis) stats.gapAnalysis.newSources = (stats.gapAnalysis.newSources ?? 0) + gapNewCount;
        console.log(`${label} BLACKBOARD: +${gapNewCount} sources from ${origin} gap requests — re-ranking`);
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
        ctx.addFinding('BLACKBOARD', 'insight', `Filled ${gapReqs.length} gaps with ${gapNewCount} new sources (${origin})`);

        // ── CRITICAL FIX: Re-execute ANALYST with gap-filled sources ──
        // Before this fix, the ANALYST identified gaps, SCOUT filled them,
        // but the ANALYST was NEVER re-run with the new sources. Only the HTML
        // renderer benefited. This is like a researcher asking for documents,
        // receiving them, but continuing to write without reading them.
        // BUDGET: each re-analysis is a full 3-pass (~7min on reasoning models).
        // Cap total re-analyses per run — brief runs get 1, strategic 2.
        if (gapEnriched.length > 0 && reAnalysisBudget > 0) {
          reAnalysisBudget--;
          emitProgress(pipelineRun.id, "GAP_FILL", "started", `Re-analyzing with ${gapEnriched.length} enriched sources...`);
          const gapReReadings = readings.map((r: any) => ({
            sourceId: r.sourceId,
            claims: r.claims || [],
            methods: r.methods || [],
            results: r.results || [],
            limitations: r.limitations || [],
            confidence: r.confidence || 'medium',
          }));
          const reResult = await reAnalyzeAfterGapFill(
            query,
            analysis,
            topSources,
            gapReReadings,
            analystMultipass,
            { contextBlock: fullContextBlock, domain: detectedDomain, depth: isStrategic ? "strategic" : "brief" }
          );
          if (reResult.reAnalyzed) {
            analysis = reResult.analysis;
            bumpAnalysisArtifact();
            ctx.setAnalystOutput(analysis);
            stats.gapFillReAnalysis = {
              triggered: true,
              citationDelta: reResult.improvementDelta,
            };
            addCost(typeof analysis._meta?.totalCostUsd === "number" ? analysis._meta.totalCostUsd : 0, 'GAP-FILL RE-ANALYSIS');
            console.log(`${label} GAP-FILL RE-ANALYSIS: analysis updated (+${reResult.improvementDelta} citations)`);
            emitProgress(pipelineRun.id, "GAP_FILL", "completed", `Re-analysis: +${reResult.improvementDelta} citations`);
          } else {
            stats.gapFillReAnalysis = { triggered: false, citationDelta: 0 };
          }
        }
      }
      ctx.clearGapRequests();
      // Close the corresponding coverage_gap signals — the legacy queue and
      // the signal bus carry the same need; resolving one resolves both.
      ctx.signals.resolveSignalsByType('coverage_gap', 'SCOUT', `gap fill from ${origin}: +${gapNewCount} sources`);
      emitProgress(pipelineRun.id, "GAP_FILL", "completed", `Gap fill: +${gapNewCount} sources`);
    } catch (err) {
      console.warn(`${label} BLACKBOARD: gap fill failed (non-blocking):`, err);
      ctx.clearGapRequests();
      ctx.signals.resolveSignalsByType('coverage_gap', 'SCOUT', `gap fill attempted (${origin})`);
    }
  };

  // Original consumption point — ANALYST + GAP_ANALYSIS requests
  await processGapRequests('ANALYST');

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

  // ── STEP 6a: STRUCTURAL EDITOR (all formats since S23) ──
  // Reviews narrative structure (Pyramid Principle, SCR, governing thoughts)
  // BEFORE rendering to HTML. Assessment only — does not rewrite. Cheap
  // (~1 LLM call); briefs benefit from the <40 feedback injection too.
  stats.harvardCouncil = { skipped: true };
  stats.deliberation = { skipped: true };
  {
    try {
      const { structuralEditorReview } = await import('./structural-editor');
      const structuralResult = await structuralEditorReview(analysis, query);
      stats.structuralEditor = tagEval({
        overallStructure: structuralResult.overallStructure,
        narrativeArcValid: structuralResult.narrativeArcValid,
        sectionsWithIssues: structuralResult.sectionReviews?.filter(s => s.issues?.length > 0).length || 0,
        logicalGaps: structuralResult.logicalGaps?.length || 0,
        suggestions: structuralResult.restructuringSuggestions?.length || 0,
        costUsd: structuralResult.costUsd,
      }, 'analysis');
      addCost(structuralResult.costUsd, 'STRUCTURAL_EDITOR');
      console.log(`${label} STRUCTURAL EDITOR: structure=${structuralResult.overallStructure}/100, arc=${structuralResult.narrativeArcValid}, ${structuralResult.logicalGaps?.length || 0} gaps, ${structuralResult.sectionReviews?.filter(s => s.issues?.length > 0).length || 0} sections with issues`);

      // If structural issues are critical (score < 40), inject suggestions into context for re-render
      if (structuralResult.overallStructure < 40 && structuralResult.restructuringSuggestions?.length > 0) {
        const structuralFeedback = `\n## STRUCTURAL EDITOR FEEDBACK (inject into rendering)\nThe narrative structure scored ${structuralResult.overallStructure}/100. Key issues:\n${structuralResult.restructuringSuggestions.slice(0, 3).map(s => `- ${s}`).join('\n')}\nLogical gaps:\n${structuralResult.logicalGaps.slice(0, 3).map(g => `- ${g}`).join('\n')}`;
        fullContextBlock = (fullContextBlock || '') + '\n\n---\n\n' + structuralFeedback;
        console.warn(`${label} STRUCTURAL EDITOR: critical structure score (${structuralResult.overallStructure}/100) — feedback injected for rendering`);
      }
    } catch (err) {
      console.warn(`${label} STRUCTURAL EDITOR: failed (non-blocking):`, err);
      stats.structuralEditor = { error: String(err) };
    }
  }

  // â”€â”€ STEP 7: CITATION GUARD â”€â”€
  console.log(`${label} GUARD: validate citations`);
  const guard = citationGuard(analysis, topSources.length, quantBridge.models.length);
  stats.guard = guard;
  if (!guard.ok) {
    console.warn(`${label} Citation guard warning: ${guard.usedCount} citations, ${guard.invalid.length} invalid, ${guard.invalidModels.length} invalid model refs (non-fatal, proceeding with degraded quality)`);
    stats.citationGuardDegraded = true;
  }

  // ── STEP 7a: CLAIM-BINDING PREFLIGHT (deterministic, no LLM) ──
  // Citation laundering: the analyst can attach [SRC-N] to a claim the source
  // never supports. The critic catches it at $0.01 — this catches it for free:
  // a claim whose key terms are absent from the cited source's text is bound
  // to nothing. Weak bindings are surfaced as claim_unverifiable signals so
  // the repair machinery can act on them before render.
  try {
    const analysisObj: any = typeof analysis === 'string' ? JSON.parse(analysis) : analysis;
    const chain: any[] = analysisObj?.causalChain ?? [];
    const readingsByIdPre = new Map<string, any>(
      (Array.isArray(readings) ? readings : []).map((r: any) => [r.sourceId, r])
    );
    let boundCount = 0, weakCount = 0;
    const weakLinks: { id: number; overlap: number }[] = [];
    for (const link of chain) {
      const srcRef = typeof link?.sourceRef === 'string'
        ? parseInt(String(link.sourceRef).replace(/\D/g, ''), 10)
        : (typeof link?.sourceRef === 'number' ? link.sourceRef : null);
      if (!srcRef || srcRef < 1 || srcRef > topSources.length) continue;
      const src = topSources[srcRef - 1];
      const srcText = `${src?.title || ''} ${src?.abstract || ''} ${readingsByIdPre.get(src?.id)?.extractedText || ''}`.toLowerCase();
      if (srcText.length < 100) continue; // can't verify against empty source
      const claimText = `${link?.claim || ''} ${link?.evidence || ''}`.toLowerCase();
      const claimTerms = new Set(
        claimText.replace(/[^\w\s]/g, ' ').split(/\s+/).filter((w: string) => w.length > 4)
      );
      if (claimTerms.size === 0) continue;
      const srcWords = new Set(srcText.replace(/[^\w\s]/g, ' ').split(/\s+/));
      let hits = 0;
      for (const t of claimTerms) if (srcWords.has(t)) hits++;
      const overlap = hits / claimTerms.size;
      boundCount++;
      if (overlap < 0.15) {
        weakCount++;
        weakLinks.push({ id: link.id ?? boundCount, overlap: Math.round(overlap * 100) });
      }
    }
    stats.claimBinding = { links: boundCount, weak: weakCount };
    if (weakCount > 0) {
      console.warn(`${label} CLAIM BINDING: ${weakCount}/${boundCount} causal-chain links cite sources that don't cover their claim (laundering risk) — links: ${weakLinks.map(w => `#${w.id}@${w.overlap}%`).join(', ')}`);
      ctx.postSignal('claim_unverifiable', `${weakCount} causal-chain links have weak claim-source binding: ${weakLinks.map(w => `link #${w.id}`).join(', ')}`, {
        postedBy: 'CLAIM_BINDING',
        intensity: Math.min(0.95, 0.4 + weakCount * 0.15),
        ttlMs: 60 * 60 * 1000,
        payload: { weakLinks },
      });
    } else if (boundCount > 0) {
      console.log(`${label} CLAIM BINDING: ${boundCount} links verified against cited sources (all bound)`);
    }
  } catch (bindErr) {
    console.warn(`${label} CLAIM BINDING: check failed (non-blocking):`, bindErr);
  }

  // ── STEP 7b: CRITIC AGENT — Multi-stage verification ──
  // Decomposes analysis into atomic claims, grounds each against sources,
  // detects contradictions, bias, and citation issues.
  // Can force a retry of ANALYST with targeted repair instructions.
  let savedCriticResult: any = null;
  try {
    const { runCritic } = await import('./critic-agent');
    // CRITICAL: Only pass factual analysis fields to the critic.
    // Speculative fields (rejectedAlternatives, whatToWatch, trajectory, evidenceAssessment)
    // and meta fields (_meta, _deliberationContext, _harvardCouncil) produce claims that
    // are unverifiable by design → they get flagged as "unsupported" and "biased",
    // collapsing the critic score from ~61 (v3) to ~9-38 (after integrations).
    // The critic should only evaluate claims that are meant to be factually grounded.
    const criticAnalysisObj = typeof analysis === 'string'
      ? JSON.parse(analysis)
      : { ...analysis };
    const SPECULATIVE_OR_META_KEYS = new Set([
      '_meta', '_deliberationContext', '_harvardCouncil',
      'rejectedAlternatives', 'whatToWatch', 'trajectory',
      'evidenceAssessment', 'convictionLevel',
    ]);
    const criticFiltered: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(criticAnalysisObj)) {
      if (!SPECULATIVE_OR_META_KEYS.has(key)) {
        criticFiltered[key] = value;
      }
    }
    // CRITICAL: Normalize [E-N] evidence IDs to [SRC-N] format.
    // The critic's decomposition prompt expects [SRC-N] citations to extract sourceIndex.
    // If the analysis uses [E-N] (from replaceSrcWithEvidenceIds), the critic can't
    // match claims to sources → all claims become "unverifiable" → groundedness collapses
    // from ~100% (v3) to ~0-67% (after integrations).
    let analysisText = JSON.stringify(criticFiltered);
    analysisText = analysisText.replace(/\[E(\d+)\]/g, '[SRC-$1]');
    // Attach reader-extracted full text so the critic verifies claims against
    // what the analyst actually read — not just the abstract. Without this,
    // claims synthesized from PDF page 40 are judged "unsupported" and
    // groundedness collapses (~23% observed → HELD on a well-sourced run).
    const readingsById = new Map<string, any>(
      (Array.isArray(readings) ? readings : []).map((r: any) => [r.sourceId, r])
    );
    const criticSources = topSources.map((s: any, i: number) => ({
      index: i + 1,
      title: s.title || '',
      abstract: s.abstract || '',
      fullText: readingsById.get(s.id)?.extractedText || null,
      provider: s.provider || '',
      year: s.year || undefined,
    }));

    const criticResult = await runCritic(analysisText, criticSources, { skipBias: false, skipContradictions: false });
    savedCriticResult = criticResult;
    stats.critic = tagEval({
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
    }, 'analysis');

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

    // S14-E: Make Critic actionable — if verdict is "repair" and score is very low,
    // inject repair instructions into the analysis context for the HTML renderer.
    // The repair instructions are already stored in stats.criticRepairInstructions,
    // but we also inject them as a context hint for the editorial phase.
    if (criticResult.verdict === 'repair' && criticResult.overallScore < 40 && criticResult.repairInstructions) {
      console.warn(`${label} CRITIC: ACTIONABLE REPAIR — score ${criticResult.overallScore} < 40, injecting repair instructions into editorial context`);
      // The editorial phase will pick this up and add a quality warning
      (stats as any).criticActionableRepair = true;
    }
  } catch (err) {
    console.warn(`${label} CRITIC: failed (non-blocking):`, err instanceof Error ? err.message : String(err));
  }

  // ── CRITIC PANEL (G-Eval rubric, 4 dimensions) — complements the scalar
  // critic score with per-dimension verdicts: methodology / coverage /
  // epistemic calibration / editorial. A veto fires only when a reviewer
  // documents a REPAIRABLE severe defect — replacing opaque low-score caps. ──
  let savedPanelResult: any = null;
  try {
    const { runCriticPanel } = await import('./critic-panel');
    const panelText = typeof analysis === 'string' ? analysis : JSON.stringify(analysis);
    const panelResult = await runCriticPanel(panelText, query, {
      domain: detectedDomain, // S21: domain checklist (qualityCriteria + biases) injected into methodology reviewer
      fieldContext: positioningBrief ? {
        fieldCoverage: positioningBrief.fieldCoverage,
        uncoveredDimensions: positioningBrief.uncoveredDimensions,
        weakClaims: positioningBrief.weakClaims,
        strongestPiece: positioningBrief.strongestPiece,
      } : undefined,
    });
    addCost(panelResult.costUsd, 'CRITIC_PANEL');
    savedPanelResult = panelResult;
    stats.criticPanel = tagEval({
      overallScore: panelResult.overallScore,
      dimensions: panelResult.dimensions.map(d => ({
        dimension: d.dimension, score: d.score,
        findings: d.findings.slice(0, 4), mustFix: d.mustFix,
      })),
      veto: panelResult.veto,
      vetoReasons: panelResult.vetoReasons,
      costUsd: panelResult.costUsd,
      durationMs: panelResult.durationMs,
    }, 'analysis');
  } catch (err) {
    console.warn(`${label} CRITIC PANEL: failed (non-blocking):`, err instanceof Error ? err.message : String(err));
  }

  // ── ORCHESTRATOR ACTION: CRITIC REPAIR — instructions were generated but never
  // consumed. NOW ACTED: a single targeted re-analysis with the repair instructions
  // injected, kept only if it doesn't degrade citation coverage.
  // S23+: the critic PANEL's mustFix/weak findings are folded into the repair
  // block — methodology/coverage/editorial defects trigger revision too, not
  // just claim-level failures (CogWriter-style monitor→revise loop). ──
  const panelWeakFindings = savedPanelResult
    ? savedPanelResult.dimensions
        .filter((d: any) => d.mustFix || d.score <= 4)
        .flatMap((d: any) => d.findings.slice(0, 3).map((f: string) => `[${d.dimension}] ${f}`))
        .slice(0, 6)
    : [];
  const repairTrigger = savedCriticResult?.verdict === 'repair' && savedCriticResult.repairInstructions &&
    savedCriticResult.overallScore < 65;
  const panelTrigger = savedPanelResult?.veto === true && panelWeakFindings.length > 0;
  if ((repairTrigger || panelTrigger) && !isBudgetConstrained() &&
      orchState.iteration < orchState.maxIterations && reAnalysisBudget > 0) {
    reAnalysisBudget--;
    try {
      const panelBlock = panelWeakFindings.length > 0
        ? '\n\n## EDITORIAL PANEL FINDINGS (must fix)\nThe review panel documented these defects:\n' +
          panelWeakFindings.map((f: string) => `- ${f}`).join('\n')
        : '';
      const instructions = (savedCriticResult?.repairInstructions || '') + panelBlock;
      console.log(`${label} CRITIC REPAIR: re-running ANALYST (critic=${savedCriticResult?.overallScore ?? 'n/a'}/100, panelFindings=${panelWeakFindings.length})`);
      emitProgress(pipelineRun.id, "ANALYST", "started", `Repairing analysis per critic instructions...`);
      const repaired = await analystMultipass(query, topSources, slimReadings, {
        contextBlock: fullContextBlock + '\n\n## CRITIC REPAIR INSTRUCTIONS (mandatory)\nThe critic identified defects in the previous analysis that MUST be fixed:\n' + instructions,
        domain: detectedDomain,
        depth: isStrategic ? "strategic" : "brief",
      });
      const repStr = typeof repaired === 'string' ? repaired : JSON.stringify(repaired);
      const repCitations = new Set((repStr.match(/\[SRC-\d+\]/g) || []).map((m: string) => m)).size;
      const origStr = typeof analysis === 'string' ? analysis : JSON.stringify(analysis);
      const origCitations = new Set((origStr.match(/\[SRC-\d+\]/g) || []).map((m: string) => m)).size;
      // Repair targets defects, not citation count — accept if coverage didn't regress
      if (repCitations >= origCitations) {
        analysis = repaired;
        bumpAnalysisArtifact();
        ctx.setAnalystOutput(analysis);
        orchState.iteration++;
        stats.orchestrator = stats.orchestrator ?? { decisions: [] };
        stats.orchestrator.criticRepairApplied = true;
        addCost(typeof repaired._meta?.totalCostUsd === "number" ? repaired._meta.totalCostUsd : 0, 'CRITIC_REPAIR');
        console.log(`${label} CRITIC REPAIR: re-analysis applied (citations ${origCitations} → ${repCitations})`);

        // CRITIC + PANEL RE-CHECK: the verdicts above describe the ORIGINAL,
        // defective analysis. Now that the repaired text was adopted, those
        // verdicts are stale — the trust vetoes (critic reject cap, panel
        // findings) would punish defects that no longer exist. Re-run both
        // evaluators once on the repaired analysis; their fresh verdicts
        // unconditionally replace the stale ones (honest: the artifact being
        // published is the repaired text — if the repair regressed, the worse
        // verdict is the truthful one).
        try {
          const repText = typeof repaired === 'string' ? repaired : JSON.stringify(repaired);
          const recheckReadingsById = new Map<string, any>(
            (Array.isArray(readings) ? readings : []).map((r: any) => [r.sourceId, r])
          );
          const recheckSources = topSources.map((s: any, i: number) => ({
            index: i + 1,
            title: s.title || '',
            abstract: s.abstract || '',
            fullText: recheckReadingsById.get(s.id)?.extractedText || null,
            provider: s.provider || '',
            year: s.year || undefined,
          }));
          const { runCritic: recheckCritic } = await import('./critic-agent');
          const criticRecheck = await recheckCritic(repText, recheckSources, { skipBias: false, skipContradictions: false });
          addCost(criticRecheck.costUsd, 'CRITIC_RECHECK');
          console.log(`${label} CRITIC RE-CHECK: ${savedCriticResult?.overallScore ?? '?'}→${criticRecheck.overallScore}/100 (${savedCriticResult?.verdict ?? '?'}→${criticRecheck.verdict})`);
          savedCriticResult = criticRecheck;
          stats.critic = tagEval({
            verdict: criticRecheck.verdict,
            overallScore: criticRecheck.overallScore,
            groundedness: criticRecheck.groundedness,
            claimsCount: criticRecheck.claims.length,
            contradictions: criticRecheck.contradictions.length,
            biases: criticRecheck.biases.length,
            citationIssues: criticRecheck.citationIssues.length,
            stageResults: criticRecheck.stageResults,
            costUsd: criticRecheck.costUsd,
            durationMs: criticRecheck.durationMs,
          }, 'analysis');
          (stats as any).criticRecheckedPostRepair = true;
        } catch (rcErr) {
          console.warn(`${label} CRITIC RE-CHECK failed (non-blocking):`, rcErr);
        }
        try {
          const { runCriticPanel: recheckPanel } = await import('./critic-panel');
          const repPanelText = typeof repaired === 'string' ? repaired : JSON.stringify(repaired);
          const panelRecheck = await recheckPanel(repPanelText, query, { domain: detectedDomain });
          addCost(panelRecheck.costUsd ?? 0, 'CRITIC_PANEL_RECHECK');
          if (panelRecheck && typeof panelRecheck.overallScore === 'number') {
            console.log(`${label} PANEL RE-CHECK: ${savedPanelResult?.overallScore ?? '?'}→${panelRecheck.overallScore}/100 (veto: ${panelRecheck.veto})`);
            savedPanelResult = panelRecheck;
            stats.criticPanel = tagEval({
              overallScore: panelRecheck.overallScore,
              dimensions: panelRecheck.dimensions,
              veto: panelRecheck.veto,
              vetoReasons: panelRecheck.vetoReasons,
              costUsd: panelRecheck.costUsd,
              durationMs: panelRecheck.durationMs ?? 0,
            }, 'analysis');
          }
        } catch (rpErr) {
          console.warn(`${label} PANEL RE-CHECK failed (non-blocking):`, rpErr);
        }
      } else {
        console.log(`${label} CRITIC REPAIR: retry lost citations (${origCitations} → ${repCitations}) — keeping original`);
      }
      emitProgress(pipelineRun.id, "ANALYST", "completed", `Critic repair complete`);
    } catch (err) {
      console.warn(`${label} CRITIC REPAIR: failed (non-blocking):`, err);
    }
  }

  // ── CRITIC EVIDENCE TOOL (item 7): when the critic flags unsupported
  // claims, convert them into targeted evidence requests on the blackboard.
  // This gives the critic a real actuator — it can pull evidence, not just
  // complain about its absence. Consumed by processGapRequests below. ──
  if (savedCriticResult && !isBudgetConstrained() && orchState.iteration < orchState.maxIterations) {
    try {
      const unsupportedClaims = (savedCriticResult.claims || [])
        .filter((c: any) => c.verdict === 'unsupported')
        .slice(0, 3);
      const citationIssues = (savedCriticResult.citationIssues || [])
        .filter((i: any) => i.issue === 'missing' || i.issue === 'vague')
        .slice(0, 2);
      const evidenceTargets = [...unsupportedClaims.map((c: any) => c.text || ''),
                               ...citationIssues.map((i: any) => i.explanation || '')]
        .filter((t: string) => typeof t === 'string' && t.length > 20)
        .slice(0, 3);
      if (evidenceTargets.length > 0) {
        const { generateGapQueries } = await import('./gap-aware-append');
        const syntheticGaps = evidenceTargets.map((t: string) => ({
          section: 'unsupported_claim',
          coverage: 0,
          citationCount: 0,
          sentenceCount: 1,
          suggestedQuery: t.slice(0, 200),
        }));
        const queries = await generateGapQueries(query, syntheticGaps as any);
        let pushed = 0;
        for (const q of (queries || []).slice(0, 3)) {
          if (q && q.length > 10) {
            ctx.requestSourceGap(
              q.slice(0, 300),
              `Critic flagged unsupported claim: ${evidenceTargets[pushed]?.slice(0, 80) ?? 'evidence gap'}`,
              'CRITIC',
              ['openalex', 'crossref', 'semanticscholar', 'ssrn', 'linkup', 'jstor'],
              10,
            );
            pushed++;
          }
        }
        if (pushed > 0) {
          console.log(`${label} CRITIC EVIDENCE TOOL: ${pushed} targeted evidence requests queued from unsupported claims`);
          stats.criticEvidenceRequests = pushed;
        }
      }
    } catch (err) {
      console.warn(`${label} CRITIC EVIDENCE TOOL: failed (non-blocking):`, err);
    }
  }

  // ── OUTLINE CRITIC (WebWeaver ICLR 2026): critique the analysis STRUCTURE
  // before rendering. The claim-level critic asks "are these claims true?";
  // the outline critic asks "did we investigate the right dimensions?".
  // Missing dimensions become targeted retrieval requests on the blackboard. ──
  if (!isBudgetConstrained() && orchState.iteration < orchState.maxIterations) {
    try {
      const { critiqueOutline } = await import('./outline-critic');
      const outlineResult = await critiqueOutline(query, analysis, topSources.length);
      if (outlineResult) {
        addCost(outlineResult.costUsd, 'OUTLINE_CRITIC');
        stats.outlineCritic = {
          coverageScore: outlineResult.coverageScore,
          missingDimensions: outlineResult.missingDimensions,
          weakSections: outlineResult.weakSections,
          queriesEmitted: outlineResult.targetedQueries.length,
          rationale: outlineResult.rationale,
        };
        console.log(`${label} OUTLINE CRITIC: coverage ${outlineResult.coverageScore}/100 — ${outlineResult.missingDimensions.length} missing dimensions, ${outlineResult.targetedQueries.length} queries`);

        // Low structural coverage → push targeted retrieval requests
        if (outlineResult.coverageScore < 70 && outlineResult.targetedQueries.length > 0) {
          for (const q of outlineResult.targetedQueries.slice(0, 3)) {
            ctx.requestSourceGap(
              q.slice(0, 300),
              `Missing dimension: ${outlineResult.missingDimensions[0] ?? 'structural coverage gap'}`,
              'OUTLINE_CRITIC',
              ['openalex', 'crossref', 'semanticscholar', 'ssrn', 'jstor', 'internet-archive', 'linkup'],
              12,
            );
          }
          ctx.addFinding('OUTLINE_CRITIC', 'gap',
            `Structural coverage ${outlineResult.coverageScore}/100 — missing: ${outlineResult.missingDimensions.slice(0, 3).join('; ')}`);
        }
      }
    } catch (err) {
      console.warn(`${label} OUTLINE CRITIC: failed (non-blocking):`, err);
    }
  }

  // Second consumption round — critic evidence requests + outline-critic queries
  await processGapRequests('CRITIC/OUTLINE');

  // SELF-CORRECT CHECKPOINT: CRITIC
  try {
    const criticScore = (stats.critic as any)?.overallScore;
    const criticVerdict = (stats.critic as any)?.verdict;
    if (typeof criticScore === 'number') {
      const cpResult = await selfCorrector.checkpoint(
        'critic',
        `Critic verdict: ${criticVerdict}, score: ${criticScore}, contradictions: ${(stats.critic as any)?.contradictions ?? 0}, biases: ${(stats.critic as any)?.biases ?? 0}`,
        [
          {
            id: 'critic_verifier',
            check: () => {
              if (criticVerdict === 'reject') {
                return { verifierId: 'critic_verifier', verdict: 'escalate' as const, score: criticScore / 100, reasons: [`Critic rejected analysis (score ${criticScore}/100) — consider re-running with different sources`] };
              }
              if (criticScore < 50) {
                return { verifierId: 'critic_verifier', verdict: 'retry' as const, score: criticScore / 100, reasons: [`Critic score ${criticScore}/100 is low — check contradictions and bias flags`] };
              }
              return { verifierId: 'critic_verifier', verdict: 'pass' as const, score: criticScore / 100, reasons: [] };
            },
          },
        ],
        criticScore / 100,
      );
      if (cpResult.cascadeDetected) {
        console.warn(`${label} SELF-CORRECT: CASCADE detected at CRITIC — severity=${cpResult.score.toFixed(2)}, drift=${cpResult.drift.toFixed(3)}`);
        (stats as any).selfCorrect = { ...((stats as any).selfCorrect ?? {}), criticCheckpoint: cpResult, cascadeDetected: true };
      }
    }
  } catch (scErr) {
    console.warn(`${label} SELF-CORRECT: CRITIC checkpoint failed (non-blocking):`, scErr);
  }

  // S14-H: Chain-of-Verification (CoVe — Meta ACL 2024) — extract claims and generate
  // verification questions for diagnostic purposes. The questions are logged to
  // provide transparency into what should be verified. Full execution (search + NLI)
  // is handled by the existing NLI verifier and claim-grounding layers.
  if (isStrategic) {
    try {
      const { extractClaims, planVerificationQuestions } = await import('./chain-verification');
      const analysisText = typeof analysis === 'string' ? analysis : (analysis as any)?.html ?? JSON.stringify(analysis);
      const { claims, costUsd: extractCost } = await extractClaims(analysisText.slice(0, 6000));
      if (claims.length > 0) {
        const { questions, costUsd: planCost } = await planVerificationQuestions(claims.slice(0, 10), {
          searchFn: async () => ({ sourceIds: [], found: 0 }),
          maxClaims: 10,
          maxQuestionsPerClaim: 2,
          verifyThreshold: 0.7,
        });
        addCost(extractCost + planCost, 'COVE (claim extraction + question planning)');
        console.log(`${label} COVE: extracted ${claims.length} claims, generated ${questions.length} verification questions`);
        stats.chainVerification = { claimsExtracted: claims.length, questionsGenerated: questions.length };
      }
    } catch (coveErr) {
      console.warn(`${label} COVE: failed (non-blocking):`, coveErr instanceof Error ? coveErr.message : String(coveErr));
    }
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

  // ── POST-HOC DATA INJECTION (extracted to pipeline-steps/post-hoc-injection.ts) ──
  // Evidence Tiers + Adversarial Transparency + Multi-Lens Convergence,
  // computed post-analyst/critic and attached to the analysis object.
  {
    const { runPostHocInjection } = await import('./pipeline-steps/post-hoc-injection');
    await runPostHocInjection({
      isStrategic,
      analysis: analysis as Record<string, any> | undefined,
      topSources,
      criticResult: savedCriticResult,
      canaResult: savedCanaResult,
      scatterResult: savedScatterResult,
      label,
    });
  }

  let html = '';
  let debateContext: string | undefined;
  let debateResult: DebateResult | undefined;
  let institutePosition: InstitutePosition | undefined;

  // EDITOR step — extracted to pipeline-steps/render-editor.ts.
  // debateResult is read at call time (assigned between here and the render call).
  const renderEditorHtml = async (): Promise<string> => {
    const { runRenderEditorStep } = await import('./pipeline-steps/render-editor');
    return runRenderEditorStep({
      label,
      query,
      isStrategic,
      isMemo,
      editorialV2,
      topicClassification,
      castingResult,
      institutePosition,
      analysis: analysis as Record<string, any>,
      topSources,
      debateResult,
      stats: stats as Record<string, any>,
      renderBriefFallback: renderBriefHTML,
    });
  };

  const runPostRenderQualityGates = async () => {
    emitProgress(pipelineRun.id, "QUALITY", "started", "Citation verification and critical review...");

    // Verification chain extracted to pipeline-steps/verification-block.ts
    // (symbolic → NLI → active repair → deep-check → fact-checker).
    {
      const { runVerificationBlock } = await import('./pipeline-steps/verification-block');
      html = await runVerificationBlock({
        html,
        analysis: analysis as Record<string, any>,
        topSources,
        readings,
        stats: stats as Record<string, any>,
        label,
        bumpHtmlArtifact,
        tagEval,
      });
    }

    // Parallel evaluators + deterministic trust scoring extracted to
    // pipeline-steps/evaluators-trust.ts (the evaluators feed the trust calc).
    {
      const { runEvaluatorsAndTrust } = await import('./pipeline-steps/evaluators-trust');
      html = await runEvaluatorsAndTrust({
        html,
        analysis: analysis as Record<string, any>,
        topSources,
        readings,
        stats: stats as Record<string, any>,
        label,
        query,
        briefId,
        evidenceBankRef,
        planNodesForAudit,
        pipelineCtx: ctx,
      });
    }

    orchState.trustScore = stats.criticalLoop?.finalScore ?? null;
    // Deterministic scoring already handles groundedness veto and quality floor.
    // No secondary adjustment needed.
    const criticalDecision = assessAfterCriticalLoop(orchState);
    recordDecision(orchState, criticalDecision);
    stats.orchestrator = stats.orchestrator ?? { decisions: [] };
    stats.orchestrator.decisions.push(criticalDecision);

    // ── ORCHESTRATOR ACTION: DEBATE — was recorded but never executed. NOW ACTED. ──
    // Trust below threshold → force the adversarial debate even if the tier flag
    // disabled it, unless the budget guard already cut it (money wins).
    if (criticalDecision.action === "DEBATE" && !runDebateStep && !budgetDegraded) {
      console.log(`${label} ORCHESTRATOR: DEBATE triggered — trust ${orchState.trustScore} below threshold, enabling adversarial debate`);
      runDebateStep = true;
      stats.orchestrator.debateForcedByOrchestrator = true;
      ctx.addFinding('ORCHESTRATOR', 'recommendation', `DEBATE forced by low trust score (${orchState.trustScore})`);
    }
  };

  // Debate + Devil's Advocate — extracted to pipeline-steps/debate-advocate.ts.
  // `debateResult`/`debateContext` stay owned here (arbiter + render read them
  // at call time); the flags are passed as call-time snapshots since the
  // budget guard, LAS gate, and orchestrator all mutate them upstream.
  const debateAdvocateDeps: DebateAdvocateDeps = {
    query, topSources, readings, detectedDomain, isStrategic, label,
    stats: stats as Record<string, any>, pipelineRunId: pipelineRun.id,
    pipelineCtx: ctx, addCost, tagEval,
  };
  const applyDebateOutcome = (out: import('./pipeline-steps/debate-advocate').DebateOutcome) => {
    if (out.debateResult) { debateResult = out.debateResult; debateContext = out.debateContext; }
  };

  // ── SHARED POST-RENDER QUALITY GATES ──
  // Citation repair → NLI grounding → quant → citation filter extracted to
  // pipeline-steps/citation-grounding.ts. The trailing quality-gates call
  // stays here: it reads the pipeline's own `html`, assigned from the step's
  // return value first.
  const runPostRenderCitationAndGrounding = async () => {
    html = await runCitationGroundingStep({
      html,
      analysis: analysis as Record<string, any>,
      topSources,
      readings,
      stats: stats as Record<string, any>,
      label,
      pipelineCtx: ctx,
      bumpHtmlArtifact,
      tagEval,
      chartData: quant.chartData,
    });
    await runPostRenderQualityGates();
  };

  if (editorialV2) {
    console.log(`${label} EDITORIAL V2: foresight → debate → devil's advocate → editor → quality gates`);

    // NOTE: Foresight (Monte Carlo) now runs AFTER editorial arbiter, which creates the scenarios.
    // Previously foresight ran before arbiter → 0 scenarios → always skipped.
    // The arbiter generates scenario names/descriptions/priors, then foresight refines probabilities.
    stats.foresight = { skipped: true, reason: 'pending — will run after editorial arbiter creates scenarios' };

    // Debate + meta-analysis reactivated — multi-perspective dialectical analysis
    applyDebateOutcome(await runDebateMetaBlock(debateAdvocateDeps, runDebateStep, buildAnalysisReviewText(analysis as Record<string, unknown>, query)));

    // LOT 4.8 / T4: Inflection check on extracted mechanisms (dated, thresholded, attested)
    try {
      const { inflectionCheck } = await import('./chain-probability');
      // Topic gate — drop mechanisms unrelated to this query (off-topic PDFs or
      // reader hallucinations can inject foreign mechanisms, e.g. a Tamil-identity
      // mechanism appearing in a fintech brief).
      const STOP = new Set(['this','that','with','from','which','their','have','been','were','will','would','could','should','into','over','under','between','through','about','against','such','these','those','than','then','them','they','what','when','where','while','also','more','most','other','some','only','very','each','both']);
      const vocab = new Set(
        `${query} ${(topSources || []).map((s: any) => s.title || '').join(' ')}`
          .toLowerCase().split(/[^a-zà-ÿ0-9]+/)
          .filter(w => w.length >= 4 && !STOP.has(w))
      );
      const allMechanismsRaw = readings.flatMap((r: any) => (r.mechanisms || []).map((m: any) => ({ m, sourceId: r.sourceId })));
      const droppedMechanisms: string[] = [];
      const allMechanisms = allMechanismsRaw.filter(({ m, sourceId }: any) => {
        const text = String(m.description || '').toLowerCase();
        const words = text.split(/[^a-zà-ÿ0-9]+/).filter((w: string) => w.length >= 4);
        if (words.some((w: string) => vocab.has(w))) return true;
        droppedMechanisms.push(`${sourceId}: "${text.slice(0, 80)}"`);
        return false;
      }).map(({ m }: any) => m);
      if (droppedMechanisms.length > 0) {
        console.warn(`${label} INFLECTION CHECK: dropped ${droppedMechanisms.length} off-topic mechanisms — ${droppedMechanisms.slice(0, 3).join(' | ')}`);
      }
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

      // ── FORESIGHT (Monte Carlo + swarm) — runs AFTER arbiter creates scenarios ──
      // Bug fix: previously foresight ran before arbiter → 0 scenarios → always skipped.
      // Now arbiter generates scenarios first, then foresight refines probabilities with MC simulation.
      const arbiterScenarios = institutePosition.scenarios;
      if (!arbiterScenarios || arbiterScenarios.length < 2) {
        stats.foresight = { skipped: true, reason: `only ${arbiterScenarios?.length ?? 0} scenarios from arbiter — Monte Carlo needs ≥ 2` };
        console.log(`${label} FORESIGHT: skipped (only ${arbiterScenarios?.length ?? 0} scenarios from arbiter)`);
      } else if (topSources.length < 10) {
        stats.foresight = { skipped: true, reason: `insufficient evidence (${topSources.length} sources) — Monte Carlo needs ≥ 10 for reliable probabilities` };
        console.log(`${label} FORESIGHT: skipped (only ${topSources.length} sources — insufficient for reliable Monte Carlo)`);
      } else {
        emitProgress(pipelineRun.id, "FORESIGHT", "started", "Monte Carlo scenario distribution...");
        // Build a synthetic analysis object with arbiter scenarios for foresight
        const analysisForForesight = {
          ...(analysis as Record<string, unknown>),
          scenarios: arbiterScenarios.map(s => ({
            name: s.name,
            description: s.description,
            probability: s.probability,
            signals: s.signals,
          })),
        };
        const foresight = await runPipelineForesight({
          question: query,
          analysis: analysisForForesight,
          domain: detectedDomain,
          sourceIds: topSources.map((s: any) => s.id),
          isStrategic,
          depth: isStrategic ? 'strategic' : 'standard',
          seedSourceIds: opts.seedSourceIds,
        });
        if (!foresight.skipped && foresight.report) {
          analysis = foresight.analysis as typeof analysis;
          // Enrich institutePosition scenarios with empirical probabilities
          const simScenarios = foresight.report.output.scenarios;
          stats.centralScenario = resolveCentralScenario(institutePosition, simScenarios);
          analysis = { ...analysis, scenarios: institutePosition.scenarios } as typeof analysis;
          stats.foresight = {
            scenarios: foresight.report.output.scenarios.length,
            monteCarloRuns: foresight.report.output.monteCarloRuns,
            converged: foresight.report.output.monteCarloConverged,
            costUsd: foresight.costUsd,
          };
          addCost(foresight.costUsd, "FORESIGHT");
          emitProgress(pipelineRun.id, "FORESIGHT", "completed", `MC: ${foresight.report.output.scenarios.length} scenarios, ${foresight.report.output.monteCarloRuns} runs`);
          console.log(`${label} FORESIGHT: ${foresight.report.output.scenarios.length} scenarios, ${foresight.report.output.monteCarloRuns} MC runs, converged=${foresight.report.output.monteCarloConverged}`);
        } else {
          stats.foresight = { skipped: true, reason: foresight.reason };
          console.log(`${label} FORESIGHT: skipped (${foresight.reason})`);
        }
      }
    }

    stats.centralScenarioRequired = true;
    if (institutePosition) {
      stats.centralScenario ??= resolveCentralScenario(institutePosition);
      stats.institutePosition = institutePosition;
      analysis = { ...analysis, centralScenario: stats.centralScenario, scenarios: institutePosition.scenarios } as typeof analysis;
      console.log(`${label} CENTRAL SCENARIO: ${stats.centralScenario?.name ?? 'missing — publication hold required'}; simulation disagreement=${stats.centralScenario?.simulationDisagrees ?? false}`);
    }
    await runDevilsAdvocateBlock(debateAdvocateDeps, runDevilsAdvocateStep, buildAnalysisReviewText(analysis as Record<string, unknown>, query), debateContext);
    html = await durable('render', () => renderEditorHtml());
    bumpHtmlArtifact();

    // Render the adversarial review as an editorial section — a publication
    // that shows its own strongest objection reads as rigorous, not fragile.
    const daStats = stats.devilsAdvocate as any;
    if (daStats && !daStats.skipped && !daStats.error && (daStats.fatalChallenges > 0 || daStats.majorChallenges > 0)) {
      const esc = (s: string) => s.replace(/</g, '<').replace(/>/g, '>').replace(/"/g, '"');
      const challenges = (daStats.topChallenges || []) as { type: string; text: string }[];
      const vulnerabilities = (daStats.vulnerabilityTexts || []) as string[];
      const severityLabel = daStats.fatalChallenges > 0 ? 'Adversarial review — dissenting opinion' : 'Adversarial review';
      const daSection = `
<section class="nx-block nx-adversarial-review" data-no-cite="true">
  <div class="pf-axes-title">${severityLabel}</div>
  <p class="da-verdict-line">Verdict: <strong>${esc(String(daStats.verdict || 'publish').replace(/_/g, ' '))}</strong> · analytical strength ${daStats.overallStrength ?? '—'}/100</p>
  ${daStats.killShot ? `<p class="da-killshot"><em>“${esc(daStats.killShot)}”</em></p>` : ''}
  ${challenges.length > 0 ? `<ul class="da-challenges">${challenges.map(c => `<li><span class="da-challenge-type">${esc(c.type)}</span> ${esc(c.text)}</li>`).join('')}</ul>` : ''}
  ${vulnerabilities.length > 0 ? `<p class="da-vuln"><strong>Where this analysis could age badly:</strong> ${vulnerabilities.map(esc).join(' · ')}</p>` : ''}
</section>`;
      // Anchor before references, else before </article>, else append
      if (html.includes('references-section')) {
        html = html.replace(/<section class="references-section"/, `${daSection}\n<section class="references-section"`);
      } else if (html.includes('</article>')) {
        html = html.replace('</article>', `${daSection}</article>`);
      } else {
        html += daSection;
      }
      console.log(`${label} DA SECTION: rendered adversarial review (fatal=${daStats.fatalChallenges}, major=${daStats.majorChallenges})`);
    }
    if (usePeerReview) {
      try {
        const review = await runPeerReview(html, topSources, { title: analysis.title });
        (stats as any).peerReview = tagEval({
          score: review.overallScore,
          recommendation: review.recommendation,
          critical: review.issues.filter(i => i.severity === 'critical').length,
          major: review.issues.filter(i => i.severity === 'major').length,
        }, 'html');
        addCost(review.costUsd, 'PEER REVIEW');
        console.log(`${label} PEER REVIEW: score=${review.overallScore}, rec=${review.recommendation}, critical=${(stats as any).peerReview.critical}, major=${(stats as any).peerReview.major}`);
      } catch (err) {
        console.warn(`${label} PEER REVIEW: failed (non-blocking):`, err);
      }
    }
    if (useThinkTankPack) {
      try {
        const pack = await augmentThinkTankHtml(html, query, topSources, {
          domain: detectedDomain,
          primaryData: opts.primaryData,
          scenarioModeling: !institutePosition && (opts.scenarioModeling ?? true),
          maxScenarios: opts.maxScenarios,
          stressTest: opts.stressTest ?? true,
          policyCouncil: opts.policyCouncil ?? true,
        });
        html = pack.html;
        bumpHtmlArtifact();
        addCost(pack.costUsd, 'THINK TANK PACK');
        (stats as any).thinkTankPack = pack.stats;
        console.log(`${label} THINK TANK PACK: applied (cost=$${pack.costUsd.toFixed(4)})`);
      } catch (err) {
        console.warn(`${label} THINK TANK PACK: failed (non-blocking):`, err);
      }
    }
    await runPostRenderCitationAndGrounding();
    // V2: second DA pass on rendered HTML — DISABLED to save ~10min of LLM time
    // The first DA pass already appends fatal challenges as advisory section.
    // Re-running on rendered HTML adds marginal value but costs heavily in LLM timeouts.
    // if (stats.devilsAdvocate && !(stats.devilsAdvocate as any).error && !(stats.devilsAdvocate as any).skipped) {
    //   await runDevilsAdvocateBlock(html, true);
    // }
  } else {
    html = await durable('render', () => renderEditorHtml());
    bumpHtmlArtifact();
    if (usePeerReview) {
      try {
        const review = await runPeerReview(html, topSources, { title: analysis.title });
        (stats as any).peerReview = tagEval({
          score: review.overallScore,
          recommendation: review.recommendation,
          critical: review.issues.filter(i => i.severity === 'critical').length,
          major: review.issues.filter(i => i.severity === 'major').length,
        }, 'html');
        addCost(review.costUsd, 'PEER REVIEW');
        console.log(`${label} PEER REVIEW: score=${review.overallScore}, rec=${review.recommendation}, critical=${(stats as any).peerReview.critical}, major=${(stats as any).peerReview.major}`);
      } catch (err) {
        console.warn(`${label} PEER REVIEW: failed (non-blocking):`, err);
      }
    }
    if (useThinkTankPack) {
      try {
        const pack = await augmentThinkTankHtml(html, query, topSources, {
          domain: detectedDomain,
          primaryData: opts.primaryData,
          scenarioModeling: !institutePosition && (opts.scenarioModeling ?? true),
          maxScenarios: opts.maxScenarios,
          stressTest: opts.stressTest ?? true,
          policyCouncil: opts.policyCouncil ?? true,
        });
        html = pack.html;
        bumpHtmlArtifact();
        addCost(pack.costUsd, 'THINK TANK PACK');
        (stats as any).thinkTankPack = pack.stats;
        console.log(`${label} THINK TANK PACK: applied (cost=$${pack.costUsd.toFixed(4)})`);
      } catch (err) {
        console.warn(`${label} THINK TANK PACK: failed (non-blocking):`, err);
      }
    }
    await runPostRenderCitationAndGrounding();
    // Debate + meta-analysis reactivated
    applyDebateOutcome(await runDebateMetaBlock(debateAdvocateDeps, runDebateStep, buildAnalysisReviewText(analysis as Record<string, unknown>, query)));
    await runDevilsAdvocateBlock(debateAdvocateDeps, runDevilsAdvocateStep, html, debateContext);
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

  // DETERMINISTIC PROSE CLEANUP — fix LLM stutter, broken abbreviations, double spaces
  // Runs AFTER citation repair (which converts [SRC-N] to <sup> tags) so it can catch
  // patterns the renderer's replaceCitations() missed (it only handles [SRC-N] format).
  try {
    let proseFixed = 0;
    // 1. Fix broken abbreviations with <sup> tags: "e <sup...>...</sup> g." → "e.g."
    //    Also handles variants: "e<sup>9</sup>.g." (dot before g), "e<sup>9</sup>g." (no dot)
    html = html.replace(/\be\s*<sup[^>]*>[\s\S]*?<\/sup>\s*\.?\s*g\./gi, () => { proseFixed++; return 'e.g.'; });
    html = html.replace(/\bi\s*<sup[^>]*>[\s\S]*?<\/sup>\s*\.?\s*e\./gi, () => { proseFixed++; return 'i.e.'; });
    // 1b. Fix "e.<sup>9</sup>g." (citation between the two dots of e.g.)
    html = html.replace(/\be\.\s*<sup[^>]*>[\s\S]*?<\/sup>\s*g\./gi, () => { proseFixed++; return 'e.g.'; });
    html = html.replace(/\bi\.\s*<sup[^>]*>[\s\S]*?<\/sup>\s*e\./gi, () => { proseFixed++; return 'i.e.'; });
    // 1c. Fix geopolitical abbreviations with <sup> tags: "U<sup>9</sup>S." → "U.S."
    html = html.replace(/\bU\s*<sup[^>]*>[\s\S]*?<\/sup>\s*\.?\s*S\./g, () => { proseFixed++; return 'U.S.'; });
    html = html.replace(/\bE\s*<sup[^>]*>[\s\S]*?<\/sup>\s*\.?\s*U\./g, () => { proseFixed++; return 'E.U.'; });
    html = html.replace(/\bU\s*<sup[^>]*>[\s\S]*?<\/sup>\s*\.?\s*K\./g, () => { proseFixed++; return 'U.K.'; });
    html = html.replace(/\bU\s*<sup[^>]*>[\s\S]*?<\/sup>\s*\.?\s*N\./g, () => { proseFixed++; return 'U.N.'; });
    // 2. Fix double spaces before <sup> citation tags
    html = html.replace(/\s\s+(<sup\s)/g, (_m, sup) => { proseFixed++; return ' ' + sup; });
    // 3. Fix double spaces throughout (but not inside tags)
    html = html.replace(/  +(?![^<]*>)/g, () => { proseFixed++; return ' '; });
    // 4. Fix merged words from citation injection: "thatto" → "that to"
    // Only match words ≥8 chars containing "to" where both halves are known words
    const LEGIT_WORDS_WITH_TO = new Set(['protocol','tomato','today','tonight','tomorrow','together','protocol','photograph','biotechnology','nanotechnology','autonomy','autonomous','cartography','etymology','topology','toxicology','methodology','methodology','terminology','homogeneous','heterogeneous']);
    html = html.replace(/\b([a-z]{3,})to([a-z]{3,})\b/gi, (m, w1, w2) => {
      if (LEGIT_WORDS_WITH_TO.has(m.toLowerCase())) return m;
      if (/(that|is|are|was|were|will|can|may|must|does|has|have|had|not|but|and|for|the|this|from|with|able|likely|supposed|meant|going|used|able|forced|allowed|expected|intended|required|permitted|encouraged|discouraged|prohibited|inclined|reluctant|willing|unwilling|hesitant|prone|vulnerable|resistant|immune|subject|addicted|dedicated|committed|opposed|indifferent|indifferent|blind|deaf|equal|similar|comparable|analogous|equivalent|identical|related|connected|linked|tied|bound|drawn|attracted|repelled|devoted|loyal|faithful|true|dedicated|opposed|contrary|adjacent|proximate|close|near|far|prior|subsequent|anterior|posterior|superior|inferior|senior|junior)$/.test(w1.toLowerCase()) &&
          /^(be|do|have|not|fragment|provide|support|indicate|suggest|imply|represent|constitute|enable|prevent|reduce|increase|require|allow|ensure|maintain|create|produce|generate|facilitate|promote|limit|constrain|shape|drive|affect|impact|influence|determine|depend|vary|differ|change|evolve|emerge|develop|expand|contract|converge|diverge|exist|persist|decline|improve|worsen|accelerate|decelerate|stabilize|fluctuate|oscillate|transition|transform|adapt|adjust|respond|react|contribute|lead|result|amount|correspond|amount|add|contribute|amount|lead)/.test(w2.toLowerCase())) {
        proseFixed++;
        return w1 + ' to ' + w2;
      }
      return m;
    });
    if (proseFixed > 0) {
      console.log(`${label} PROSE CLEANUP: fixed ${proseFixed} issues (abbreviations, double spaces, merged words)`);
      stats.proseCleanup = { fixed: proseFixed };
    }
  } catch (err) {
    console.warn(`${label} PROSE CLEANUP: failed (non-blocking):`, err);
  }

  // ── STYLE GATES → SIGNAL SWEEP → DA RE-CHECK (extracted to
  //    pipeline-steps/style-sweep-recheck.ts — one coupled unit) ──
  {
    const { runStyleSweepRecheck } = await import('./pipeline-steps/style-sweep-recheck');
    const reviewCtx: import('./pipeline-steps/types').TailStepContext = {
      html,
      analysis: analysis as Record<string, any>,
      topSources,
      readings,
      stats: stats as Record<string, any>,
      orchState,
      evidenceRegistry,
      label,
      query,
      topicClassification,
      detectedDomain,
      isStrategic,
      isMemo,
      isDossier,
      selfCorrector,
      bumpHtmlArtifact,
      tagEval,
      collectStaleEvaluations,
      selfCorrectRollbacks: 0,
      pipelineCtx: ctx,
      isBudgetConstrained,
      addCost,
      debateContext,
    };
    await runStyleSweepRecheck(reviewCtx);
    html = reviewCtx.html;
  }

  // ── POST-RENDER TAIL STEPS (extracted to lib/agent/pipeline-steps/) ──
  // Quality loop → self-correct checkpoint → hero image. Each step mutates a
  // shared context (html/stats/orchState); the orchestrator reads it back.
  {
    const { runPostRenderQualityLoop } = await import('./pipeline-steps/quality-loop');
    const { runFinalSelfCorrectCheckpoint } = await import('./pipeline-steps/self-correct-checkpoint');
    const { runHeroImageStep } = await import('./pipeline-steps/hero-image-step');
    const tailCtx: import('./pipeline-steps/types').TailStepContext = {
      html,
      analysis: analysis as Record<string, any>,
      topSources,
      readings,
      stats: stats as Record<string, any>,
      orchState,
      evidenceRegistry,
      label,
      query,
      topicClassification,
      detectedDomain,
      isStrategic,
      isMemo,
      isDossier,
      selfCorrector,
      bumpHtmlArtifact,
      tagEval,
      collectStaleEvaluations,
      selfCorrectRollbacks: 0,
    };
    await runPostRenderQualityLoop(tailCtx);
    await runFinalSelfCorrectCheckpoint(tailCtx);
    await runHeroImageStep(tailCtx);
    html = tailCtx.html;
    selfCorrectRollbacks += tailCtx.selfCorrectRollbacks;
  }

  // ── STEP 14: PUBLISHER ──
  console.log(`${label} PUBLISHER: save ${isStrategic ? "strategic report" : "brief"}`);
  const estimatedPages = isStrategic ? Math.round(html.length / 3000) : undefined;

  // CSS fix: ensure `article.nomosx-brief` selectors are not split by a space
  // (some CSS processing steps insert a space, turning compound selectors into
  // descendant selectors, which breaks the grid background)
  html = html.replace(/article\s+\.nomosx-brief/g, 'article.nomosx-brief');

  const sanitizeForJson = (str: string): string => {
    // Remove control characters (0x00-0x08, 0x0B, 0x0C, 0x0E-0x1F) that break JSON serialization
    // Keep tab (0x09), LF (0x0A), CR (0x0D) as they are valid in JSON strings
    return str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
  };
  // Foundational KB sources have synthetic ids (never persisted as rows).
  // Keep their metadata in lineage so readers can hydrate them and preserve
  // [SRC-N] ordering for the whole brief.sources array.
  if (foundationalSources.length > 0) {
    (stats as Record<string, unknown>).foundationalSources = foundationalSources.map((fs) => ({
      id: fs.id,
      title: fs.title,
      authors: fs.authors,
      year: fs.year,
      doi: fs.doi,
      url: fs.url,
      provider: fs.provider,
      qualityScore: fs.qualityScore,
    }));
  }
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
        // derivesFrom and sourceRef are Int? columns — use NULL or the integer value.
        // link.id is a STRING (e.g., "src-1") and must NOT be used as linkIndex (Int column).
        // Use the array index i as the linkIndex instead.
        const derivesFrom = (typeof link.derivesFrom === 'number' && !isNaN(link.derivesFrom)) ? link.derivesFrom : 'NULL';
        const sourceRef = (typeof link.sourceRef === 'number' && !isNaN(link.sourceRef)) ? link.sourceRef : 'NULL';
        const unsupported = Boolean(link.unsupported);
        const linkIndex = i;
        // CRITICAL: The "id" column has @default(cuid()) but raw SQL INSERT does NOT
        // trigger Prisma defaults. We must generate the cuid explicitly.
        // Using crypto.randomUUID() as a safe alternative to cuid().
        const id = crypto.randomUUID().replace(/-/g, '').slice(0, 24);
        return `('${id}', '${brief.id.replace(/'/g, "''")}', ${linkIndex}, '${claim}', '${evidence}', '${warrant}', '${temporalStatus}', ${derivesFrom}, ${sourceRef}, ${unsupported})`;
      });
      // NOTE: "createdAt" has @default(now()) in the schema — do NOT include it in the INSERT.
      // The "id" column also has @default(cuid()) but raw SQL doesn't trigger it, so we generate it.
      await prisma.$executeRawUnsafe(
        `INSERT INTO "CausalLink" ("id", "briefId", "linkIndex", "claim", "evidence", "warrant", "temporalStatus", "derivesFrom", "sourceRef", "unsupported") VALUES ${values.join(", ")}`
      );
      console.log(`${label} CAUSAL LINKS: persisted ${chain.length} links for brief ${brief.id}`);
    }
  } catch (err) {
    console.warn(`${label} CAUSAL LINKS: persistence failed (non-blocking):`, err);
  }

  // â”€â”€ STEP 15: KNOWLEDGE GRAPH (post-publish concept extraction) â”€â”€
  console.log(`${label} KNOWLEDGE GRAPH: extracting concepts`);
  try {
    const kg = await extractAndStoreConcepts(brief.id, query, html, topSources.map((s: any) => s.id), useTemporalMemory);
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

  // ── EVALUATION FRESHNESS ASSERT (P0/1) ──
  // Every tagged evaluation is checked against the artifact version it judged.
  // A stale verdict (attached to a replaced artifact — the S27 bug class) is
  // marked `.stale` in stats so the gate cannot silently consume it.
  const staleEvals = collectStaleEvaluations();
  stats.evaluationFreshness = {
    stale: staleEvals,
    verdictStale: staleEvals.filter(k => k === 'critic' || k === 'criticPanel' || k === 'devilsAdvocate'),
    analysisArtifactVersion,
    htmlArtifactVersion,
  };
  if (staleEvals.length > 0) {
    console.error(`${label} EVAL FRESHNESS: ${staleEvals.length} stale evaluation(s) detected — ${staleEvals.join(', ')} judged a replaced artifact (analysis v${analysisArtifactVersion}, html v${htmlArtifactVersion})`);
  } else {
    console.log(`${label} EVAL FRESHNESS: all evaluations match current artifacts (analysis v${analysisArtifactVersion}, html v${htmlArtifactVersion})`);
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

  // DURABLE: run reached a verdict (publish or held) — seal checkpoints so a
  // later run of the same query+format starts fresh. A killed/timed-out run
  // never reaches this line, so its checkpoints stay open for resume.
  if (durableKey) markDurableComplete(durableKey).catch(() => {});

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

  // S14-B: Close the learning loop — record performance + extract lessons
  // These were imported but never called, leaving the learning loop open.
  // Now: (1) record performance for calibration, (2) extract lessons from this run
  recordAgentPerformance({
    agentId: isStrategic ? "strategic-analyst" : "analyst",
    domain: detectedDomain as DomainExpertise,
    runId: pipelineRun.id,
    question: query,
    trustScore: finalTrustScore,
    qualityScore: finalQualityScore,
    confidenceGiven,
    confidenceActual: finalTrustScore,
    citationCoverage,
    findingsCount: (analysis as any)?.keyFindings?.length || 0,
    failureModes: [],
    lessonsLearned: [],
  }).catch((err) => console.warn(`${label} LEARNING LOOP: recordAgentPerformance failed:`, err));

  if (readings.length > 0) {
    recordAgentPerformance({
      agentId: "reader",
      domain: detectedDomain as DomainExpertise,
      runId: pipelineRun.id,
      question: query,
      trustScore: finalTrustScore,
      qualityScore: finalQualityScore,
      confidenceGiven: 70,
      confidenceActual: finalTrustScore,
      citationCoverage,
      findingsCount: readings.length,
      failureModes: [],
      lessonsLearned: [],
    }).catch(() => {});
  }

  // Extract lessons from this run if quality was low (learning opportunity)
  if (finalTrustScore < 75 && html.length > 1000) {
    const agentId = isStrategic ? "strategic-analyst" : "analyst";
    extractLessons(
      agentId,
      query,
      html.slice(0, 4000),
      {
        trustScore: finalTrustScore,
        qualityScore: finalQualityScore,
        failureModes: finalTrustScore < 60 ? ['overconfident' as any] : [],
      },
      detectedDomain as DomainExpertise,
    ).then(({ lessons, structured }) => {
      if (lessons && lessons.length > 0) {
        console.log(`${label} LEARNING LOOP: extracted ${lessons.length} lessons from this run`);
        for (const lesson of lessons.slice(0, 3)) {
          const meta = structured?.find(s => s.lesson === lesson);
          storeLesson(agentId, lesson, pipelineRun.id, detectedDomain as DomainExpertise, 1.0,
            meta ? { trigger: meta.trigger, procedure: meta.procedure } : undefined).catch(() => {});
        }
      }
    }).catch((err) => console.warn(`${label} LEARNING LOOP: extractLessons failed:`, err));
  }

  // ── SKILL BANK: record the winning configuration when trust is high ──
  // Procedural memory: domain → (providers + lens types) that produced trust ≥ 80.
  if (finalTrustScore >= 80) {
    try {
      const { recordSkill } = await import('./skill-bank');
      recordSkill({
        domain: detectedDomain as string,
        providers: [...new Set(topSources.map((s: any) => String(s.provider)))],
        lensTypes: (stats as any).intelligentScout?.lenses?.map((l: any) => l.type) ?? [],
        trustScore: finalTrustScore,
        runId: pipelineRun.id,
      }).catch(() => {});
      console.log(`${label} SKILL BANK: recorded winning config (trust=${finalTrustScore}, domain=${detectedDomain})`);
    } catch { /* non-blocking */ }
  }

  // S14-C: Lesson verification (LUCID 2026) — periodically verify accumulated lessons
  // to prevent memory reward inflation. Runs every 10th run for each agent.
  if (Math.random() < 0.1) { // 10% chance per run ≈ every 10 runs
    try {
      const { verifyAndDeInflateLessons } = await import('./lesson-verifier');
      const agentId = isStrategic ? "strategic-analyst" : "analyst";
      const result = await verifyAndDeInflateLessons(agentId, {
        question: query,
        agentOutputExcerpt: html.slice(0, 1000),
      });
      if (result.deInflatedCount > 0 || result.prunedCount > 0) {
        console.log(`${label} LESSON VERIFIER: de-inflated ${result.deInflatedCount}, pruned ${result.prunedCount} lessons (avg score ${result.avgScore}%)`);
      }
    } catch (err) {
      console.warn(`${label} LESSON VERIFIER: failed (non-blocking):`, err);
    }
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

  // ── WITNESS: Finalize — extract cross-run learnings ──
  if (witnessCtx) {
    try {
      const witnessResult = await witnessCtx.finalize(query);
      console.log(`${label} WITNESS: run complete — health=${witnessResult.healthScore}/100, anomalies=${witnessResult.totalAnomalies}, interventions=${witnessResult.totalInterventions}, quality=${witnessResult.qualityScore}/100${witnessResult.recommendsChanges ? ' (changes recommended for future runs)' : ''}`);
      (stats as any).witness = witnessResult;
    } catch (err) {
      console.warn(`${label} WITNESS: finalize failed:`, err);
    }
  }

  // ── WORLD MODEL: Update with findings from this run ──
  if (useWorldModel && analysis) {
    try {
      const analysisText = typeof analysis === 'string' ? analysis :
        (analysis.summary || '') + '\n' + (analysis.consensus || '') + '\n' + (analysis.debate?.synthesis || '');
      // Identify domains from the query
      const domains = worldModelControversies.length > 0 ? ['general'] : ['general'];
      await updateWorldModel(query, analysisText, topSources.map((s: any) => ({
        id: s.id, title: s.title, abstract: s.abstract, provider: s.provider,
      })), domains);
      console.log(`${label} WORLD_MODEL: updated with findings from this run`);
    } catch (err) {
      console.warn(`${label} WORLD_MODEL: update failed:`, err);
    }
  }

  // ── PRM: Retrain periodically (every 10 runs) ──
  if (usePRM) {
    try {
      // Check if we should retrain (simple heuristic: retrain if model is old or has enough new data)
      const shouldRetrain = !prmModel || prmModel.trainingExamples < 100;
      if (shouldRetrain) {
        console.log(`${label} PRM: retraining model...`);
        const newModel = await retrainPRM();
        if (newModel) {
          console.log(`${label} PRM: model retrained (${newModel.trainingExamples} examples)`);
        }
      }
    } catch (err) {
      console.warn(`${label} PRM: retrain failed:`, err);
    }
  }

  // ── MOA: Update agent weights based on this run ──
  if (useMixtureOfAgents && (stats as any).moa) {
    try {
      const moaResult = (analysis as any)?._meta?.moaResult;
      if (moaResult) {
        const qualityScore = (stats as any).witness?.qualityScore
          ? (stats as any).witness.qualityScore / 100
          : 0.7;
        await updateAgentWeights(moaResult, qualityScore);
        console.log(`${label} MOA: agent weights updated`);
      }
    } catch (err) {
      console.warn(`${label} MOA: weight update failed:`, err);
    }
  }

  // ── RAGAS EVAL: 2026 RAG quality metrics ──
  if (useRagasEval) {
    try {
      const ragas = await evaluateBriefRAG(query, html, topSources);
      (stats as any).ragas = {
        overall: ragas.metrics.overall,
        faithfulness: ragas.metrics.faithfulness,
        answerRelevancy: ragas.metrics.answerRelevancy,
        contextPrecision: ragas.metrics.contextPrecision,
        contextRecall: ragas.metrics.contextRecall,
        explanation: ragas.explanation,
      };
      addCost(ragas.costUsd, 'RAGAS EVAL');
      console.log(`${label} RAGAS EVAL: overall=${ragas.metrics.overall}%, faithfulness=${ragas.metrics.faithfulness}%, relevancy=${ragas.metrics.answerRelevancy}%`);
    } catch (err) {
      console.warn(`${label} RAGAS EVAL: failed (non-blocking):`, err);
    }
  }

  // Build structured claims from READER extracts for publication gate (dbClaims path)
  const sourceIdToIndex = new Map<string, number>();
  topSources.forEach((s: any, i: number) => sourceIdToIndex.set(s.id, i + 1));
  const readerClaims = readings
    .filter(r => r.claims && r.claims.length > 0)
    .flatMap(r => r.claims.map((claim: string) => ({
      text: claim,
      sourceRef: sourceIdToIndex.get(r.sourceId) ?? null,
    })));

  // ── SELF-EVOLUTION: prompt evolution for key agents (non-blocking) ──
  if (useSelfEvolution) {
    try {
      const fallbackFor = (id: string) => `[${id}] default system prompt — to be evolved from lessons`;
      const evolutionResults = await runEvolutionCycle(
        ['editorial_arbiter', 'analyst_brief', 'local_judge', 'citation_verifier'],
        fallbackFor,
      );
      (stats as any).selfEvolution = evolutionResults.filter(r => r.improved).map(r => ({
        agentId: r.agentId,
        version: r.newVersion?.version,
        delta: r.delta,
      }));
      const improved = evolutionResults.filter(r => r.improved).length;
      if (improved > 0) {
        console.log(`${label} SELF-EVOLUTION: ${improved} prompt(s) improved`);
      }
    } catch (err) {
      console.warn(`${label} SELF-EVOLUTION: failed (non-blocking):`, err);
    }
  }

  // Clean up the rejection handler before returning
  process.removeListener('unhandledRejection', rejectionHandler);

  return {
    briefId: brief.id,
    stats,
    pipelineRunId: pipelineRun.id,
    format: (isStrategic ? "strategic" : isMemo ? "memo" : "brief") as ReportFormat,
    readerClaims,
  };

  } catch (error: any) {
    // Clean up the rejection handler on failure too
    process.removeListener('unhandledRejection', rejectionHandler);
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

export type ReportFormat = "brief" | "memo" | "strategic" | "dossier";

export interface StrategicPipelineOptions {
  providers?: Providers;
  perProvider?: number;
  rankOptions?: RankOptions;
  /** Hard pipeline timeout in ms. Default: 75min strategic/dossier, 65min brief/memo. */
  timeoutMs?: number;
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
  /** Enable the Witness — metacognitive observer that detects anomalies,
   * can intervene during runs, and learns across runs to improve prompts
   * and thresholds. Default: false. */
  useWitness?: boolean;
  /** Regeneration loop: feedback from a rejected prior attempt (gate reasons +
   * adversarial findings). Injected into the analyst context as mandatory
   * corrections. Set by the orchestrator's escalation loop. */
  priorFailureFeedback?: string;
  /** Enable Mixture of Agents — multiple specialist analysts collaborate.
   * The aggregator synthesizes their perspectives into a unified analysis.
   * Default: false. */
  useMixtureOfAgents?: boolean;
  /** Enable the World Model — persistent cross-run knowledge accumulation.
   * Injects prior knowledge before the run and extracts new knowledge after.
   * Default: false. */
  useWorldModel?: boolean;
  /** Enable the Process Reward Model — scores each reasoning step and
   * learns which reasoning patterns lead to good outcomes. Default: false. */
  usePRM?: boolean;
  /** Enable adversarial self-play — after the analysis, the system attacks
   * its own output to find weaknesses and extracts lessons for future runs.
   * Default: false. */
  useSelfPlay?: boolean;
  useOutputGuard?: boolean;
  useLocalJudge?: boolean;
  useStorm?: boolean;
  useTemporalMemory?: boolean;
  useDurableExecution?: boolean;
  /** Enable Think Tank Quality Pack — recommendations, economics, editorial polish (default: false) */
  useThinkTankPack?: boolean;
  /** Enable Feynman-style peer review before editor (default: false) */
  usePeerReview?: boolean;
  /** Enable RAGAS-style RAG evaluation (default: false) */
  useRagasEval?: boolean;
  /** Optional primary data inputs for think tank pack */
  primaryData?: any[];
  /** Enable scenario modeling in think tank pack (default: true when useThinkTankPack) */
  scenarioModeling?: boolean;
  /** Maximum number of scenarios */
  maxScenarios?: number;
  /** Enable policy stress test in think tank pack (default: true when useThinkTankPack) */
  stressTest?: boolean;
  /** Enable policy council in think tank pack (default: true when useThinkTankPack) */
  policyCouncil?: boolean;
  /** Enable self-evolution — auto-improve agent prompts after the run (default: false) */
  useSelfEvolution?: boolean;
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
    priorFailureFeedback: options.priorFailureFeedback,
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
  // ── Question validation — reject trivially short or empty queries ──
  const trimmedQuery = (query ?? '').trim();
  if (trimmedQuery.length < 10) {
    throw new Error(`Query too short (${trimmedQuery.length} chars): "${trimmedQuery}". Minimum 10 characters required for a meaningful analysis.`);
  }
  // Reject single-word questions like "What", "Why", "How" without context
  const wordCount = trimmedQuery.split(/\s+/).filter(Boolean).length;
  if (wordCount < 3 && !trimmedQuery.endsWith('?')) {
    throw new Error(`Query too vague (${wordCount} words): "${trimmedQuery}". Please provide a more specific question.`);
  }

  const isDossier = format === "dossier";
  const isMemo = format === "memo";
  const isStrategic = format === "strategic" || isDossier;
  const timeoutMs = options.timeoutMs ?? (isStrategic ? 4_500_000 : 3_900_000); // 75min strategic, 65min brief/memo — critic-repair re-analysis + deep-planner node scouts need headroom

  // DOSSIER = extended strategic report — wider corpus and more ranked sources
  // so a €699 dossier produces a materially deeper deliverable than a strategic report.
  const dossierRankOptions: RankOptions = isDossier
    ? { limit: 40, maxPerProvider: 8, minProviderDiversity: 6 }
    : {};
  // MEMO = Decision Memo — moderate depth brief (standard depth, ~30 perProvider)
  const memoPerProvider = isMemo ? 30 : undefined;
  const perProvider = options.perProvider ?? memoPerProvider ?? (isDossier ? 120 : undefined);
  const rankOptions = { ...dossierRankOptions, ...options.rankOptions };

  try {
    return await withTimeout(
      runPipelineCore(query, {
        isStrategic,
        format,
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
        useWitness: options.useWitness,
        priorFailureFeedback: options.priorFailureFeedback,
        useMixtureOfAgents: options.useMixtureOfAgents,
        useWorldModel: options.useWorldModel,
        usePRM: options.usePRM,
        useSelfPlay: options.useSelfPlay,
        useOutputGuard: options.useOutputGuard,
        useLocalJudge: options.useLocalJudge,
        useStorm: options.useStorm,
        useTemporalMemory: options.useTemporalMemory,
        useDurableExecution: options.useDurableExecution,
        useThinkTankPack: options.useThinkTankPack,
        usePeerReview: options.usePeerReview,
        useRagasEval: options.useRagasEval,
        primaryData: options.primaryData,
        scenarioModeling: options.scenarioModeling,
        maxScenarios: options.maxScenarios,
        stressTest: options.stressTest,
        policyCouncil: options.policyCouncil,
        useSelfEvolution: options.useSelfEvolution,
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
