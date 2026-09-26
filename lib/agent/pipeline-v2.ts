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
import { primeContext } from './context-primer';
import { buildMemoryInjection } from './agent-memory';
import { assessEvidenceSufficiency } from './enrichment-reasoner';
import { guardOutput } from './output-guard';
import { judge } from './local-judge';
import { initDurableRun, runDurableStep, durableKeyFor, durableResume, saveDurableStep } from './durable-execution';
import { generateStormPerspectives } from './research-patterns';
import type { PrimarySourceInput } from './think-tank-pack';
import { selfCorrectReader, selfCorrectAnalyst, reAnalyzeAfterGapFill } from './self-correction-integration';
import { createWitnessContext, buildObservation, buildLearningInjection, type WitnessContext } from './witness/integration';
import { runMixtureOfAgents, loadAgentWeights } from './moa/mixture-of-agents';
import { buildWorldModelInjection } from './world-model/world-model';
import { createWorldEvolver, buildWorldEvolverInjection, recordEpisode, predictWithForesight, type WorldEvolverState } from './world-model/world-model';
import { callLLMWithCascade, type C3POCascadeConfig, DEFAULT_C3PO_CONFIG } from '../llm/unified-llm';
import { buildSelfPlayInjection, runSelfPlayRound } from './self-play/adversarial';
import { extractFeatures, scoreStep, persistProcessStep, loadPRMModel, type ProcessStep, type PRMModel } from './prm/process-reward-model';

// P1-PERF: Optional agents are lazy-loaded via dynamic import() to reduce cold start
// debateAgent, metaAnalysisEngine, runDevilsAdvocate, runHarvardCouncil,
// runEnhancedHarvardCouncil, runCollaborativeDeliberation, buildDeliberationContextBlock
import { emitProgress } from './pipeline-progress';
import { selectSmartProviders } from './smart-provider-selector';
import { getHealthyProviders, recordProviderCall } from './provider-health-tracker';
import { searchExtendedProviders, getExtendedProvidersForDomain } from '../providers/registry-bridge';
import { filterLowQualitySources } from '../providers/source-quality-filter';
import { isEditorialV2Enabled, getPipelineMaxBudgetUsd } from './editorial-config';
import { buildAnalysisReviewText } from './analysis-review-text';
import { injectAdversarialSection, runPeerReviewAndPack, applyEvidenceIdsAndProseCleanup } from './pipeline-steps/post-render-extras';
import { runPersistenceTail } from './pipeline-steps/persistence-tail';
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

import { resolveCentralScenario, type InstitutePosition } from './editorial-types';
import type { DebateResult } from './debate-agent';
import { runDebateMetaBlock, runDevilsAdvocateBlock, type DebateAdvocateDeps } from './pipeline-steps/debate-advocate';
import { runPostRenderCitationAndGrounding as runCitationGroundingStep } from './pipeline-steps/citation-grounding';
import { runReaderBlock } from './pipeline-steps/reader-block';
import { runClassificationGates } from './pipeline-steps/classification-gates';
import { createGapRequestProcessor, runGapFillStage, type GapFillDeps, type GapFillState } from './pipeline-steps/gap-fill';
import { buildAnalystContext } from './pipeline-steps/analyst-context';

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
  const hasTemporalIndicators = /\b(will|forecast|predict|project|by\s+20\d\d|future|trajectory|emerging|evolve|outlook)\b/i.test(query);

  // K5/K7: MoA is opt-in ONLY. It previously auto-activated on complex/strategic
  // queries but its output was unconditionally overwritten by the multipass
  // call below (the `!analysis` guard was lost) — pure dead spend. Opted-in
  // MoA now actually produces the analysis; default stays multipass.
  const useMixtureOfAgents = opts.useMixtureOfAgents ?? false;
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

  // ── WEB FALLBACK → INTELLIGENT SCOUT → CITATION GRAPH → INDEX/EMBED/DEDUP ──
  // Extracted to pipeline-steps/scout-enrichment-index.ts; web-fallback
  // providers run concurrently (id lists merged in deterministic order).
  {
    const { runScoutEnrichmentAndIndex } = await import('./pipeline-steps/scout-enrichment-index');
    allSourceIds = await runScoutEnrichmentAndIndex({
      allSourceIds, query, label,
      stats: stats as Record<string, any>,
      scoutCkpt: !!scoutCkpt,
      format: isStrategic ? 'strategic' : isDossier ? 'dossier' : isMemo ? 'memo' : 'brief',
      domain: (opts as any).domain || 'general',
      scout, durableKey, saveDurableStep, index,
    });
  }

  // ── STEP 4: RANK + ENRICHMENT — extracted to pipeline-steps/rank-enrichment.ts ──
  // rank → pertinence selection → quality rerank → domain filter →
  // enrichment reasoner (re-scout / refusal-retry) → evidence registry.
  let topSources: any[];
  let evidenceRegistry: any;
  let rankOpts: RankOptions;
  {
    const { runRankAndEnrichment } = await import('./pipeline-steps/rank-enrichment');
    const rankOut = await runRankAndEnrichment({
      query, allSourceIds, isStrategic,
      rankOptions: opts.rankOptions,
      providers, stats: stats as Record<string, any>, label, pipelineStart,
      runningCostUsd, pipelineRunId: pipelineRun.id,
      rank, scout, emitProgress, addCost, ctx, orchState,
    });
    topSources = rankOut.topSources;
    allSourceIds = rankOut.allSourceIds;
    evidenceRegistry = rankOut.evidenceRegistry;
    rankOpts = rankOut.rankOpts;
    if (rankOut.refused) {
      activeRuns.delete(idempotencyKey);
      return { briefId: undefined, pipelineRun, stats, html: '', analysis: { refusal: stats.structuredRefusal } as any };
    }
  }
  // -- STEP 4b: classification + routing gates (extracted) --
  const gates = await runClassificationGates({
    query, topSources, allSourceIds, providers, scout, stats, label,
    isStrategic, enableEnhancedCouncil: opts.enableEnhancedCouncil,
    useThinkTankPack, editorialV2,
    runMetaAnalysisStep, runDeliberationStep, runDebateStep, runDevilsAdvocateStep,
    ctx,
  });
  const topicClassification = gates.topicClassification;
  const detectedDomain = gates.detectedDomain;
  const castingResult = gates.castingResult;
  const foundationalSources = gates.foundationalSources;
  const gapContextBlock = gates.gapContextBlock;
  allSourceIds = gates.allSourceIds;
  runMetaAnalysisStep = gates.runMetaAnalysisStep;
  runDeliberationStep = gates.runDeliberationStep;
  runDebateStep = gates.runDebateStep;
  runDevilsAdvocateStep = gates.runDevilsAdvocateStep;

  // -- STEP 5: READER V3 + FRAMING + QUANT + enrichment (extracted) --
  const readerBlk = await runReaderBlock({
    topSources, query, detectedDomain, isStrategic, runDeliberationStep,
    primedContext, stats, label, pipelineStart, pipelineRunId: pipelineRun.id,
    durable, emitProgress, addCost, ctx, orchState, assessAfterReader, recordDecision,
    quantDepth: opts.quantDepth, parametricInput: opts.parametricInput,
  });
  const readings = readerBlk.readings;
  const framing = readerBlk.framing;
  const quant = readerBlk.quant;
  const quantBridge = readerBlk.quantBridge;
  const readerMemoryBlock = readerBlk.readerMemoryBlock;
  const evidenceBankBlock = readerBlk.evidenceBankBlock;
  const evidenceBankRef = readerBlk.evidenceBankRef;
  const hypothesisVerdictBlock = readerBlk.hypothesisVerdictBlock;
  const dppContextBlock = readerBlk.dppContextBlock;
  const roundTableBlock = readerBlk.roundTableBlock;
  // STEP 6: ANALYSTSTEP 6: ANALYST (brief = V3 multi-pass, strategic = Strategic Analyst) â”€â”€
  emitProgress(pipelineRun.id, "ANALYST", "started", `${isStrategic ? "Strategic-depth multi-pass analysis" : "Multi-pass analysis"}...`);
  console.log(`${label} ANALYST: V3 multi-pass (depth: ${isStrategic ? 'strategic' : 'brief'})`);
  // -- PRE-ANALYST CONTEXT — extracted to pipeline-steps/analyst-context.ts --
  // memory + synapse -> domain/canon -> north star -> conflict-aware ->
  // scenario engine -> innovator -> assembly -> SARA -> prior-failure ->
  // evidence sufficiency -> positioning -> slimReadings.
  const analystCtx = await buildAnalystContext({
    query, topSources, readings, detectedDomain, isStrategic, isDossier,
    topicClassification, primedContext, gapContextBlock, quant, quantBridge,
    hypothesisVerdictBlock, evidenceBankBlock,
    episodicFormatted: episodicFormatted ?? undefined,
    dppContextBlock, roundTableBlock,
    witnessLearningInjection, worldModelInjection, selfPlayInjection,
    stats: stats as Record<string, any>, label, pipelineRunId: pipelineRun.id,
    emitProgress, addCost,
    focusAreas: opts.focusAreas, targetAudience: opts.targetAudience,
    urgencyContext: opts.urgencyContext,
    priorFailureFeedback: opts.priorFailureFeedback, ctx,
  });
  const memoryBlock = analystCtx.memoryBlock;
  let fullContextBlock = analystCtx.fullContextBlock;
  const positioningBrief = analystCtx.positioningBrief;
  const savedCanaResult = analystCtx.savedCanaResult;
  const savedScatterResult = analystCtx.savedScatterResult;
  const slimReadings = analystCtx.slimReadings;

  let analysis: any;

  // ── ARTIFACT VERSIONING (Sprint 28 / P0/1) ──
  // The S27 bug class: an evaluation stays attached to an artifact that was
  // silently replaced (DA verdict on pre-sweep HTML, critic verdict on
  // pre-repair analysis). Counters bump ONLY on material content replacement —
  // not on enrichment (attaching centralScenario/scenarios metadata post-eval
  // doesn't invalidate what an evaluator judged) nor on cosmetic HTML fixes
  // (e.g./i.e. normalization, badge injection). Each evaluation is tagged with
  // the version it judged; collectStaleEvaluations() marks  on any
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

  if (!analysis) {
    analysis = await durable('analyst', () => analystMultipass(query, topSources, slimReadings, {
      contextBlock: fullContextBlock,
      domain: detectedDomain,
      depth: isStrategic ? "strategic" : "brief",
    }));
    bumpAnalysisArtifact();
  }

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

  // -- POST-ANALYST GAP FILL — extracted to pipeline-steps/gap-fill.ts --
  // Shared state: the critic block consumes the same object so a gap-fill
  // re-analysis triggered from CRITIC/OUTLINE is adopted, not clobbered.
  const gapFillState: GapFillState = { analysis, allSourceIds, reAnalysisBudget };
  const gapFillDeps: GapFillDeps = {
    state: gapFillState, query, topSources, readings, slimReadings,
    detectedDomain, isStrategic, fullContextBlock, providers, rankOpts,
    stats: stats as Record<string, any>, label, pipelineRunId: pipelineRun.id,
    analystDecision, orchState, emitProgress, addCost, isBudgetConstrained,
    bumpAnalysisArtifact, analystMultipass, rank, scout, ctx,
  };
  const processGapRequests = createGapRequestProcessor(gapFillDeps);
  await runGapFillStage(gapFillDeps);
  analysis = gapFillState.analysis;
  allSourceIds = gapFillState.allSourceIds;
  reAnalysisBudget = gapFillState.reAnalysisBudget;
  // ── STEP 6a/7/7a: PRE-CRITIC GATES — extracted to pipeline-steps/pre-critic-gates.ts ──
  // structural editor → citation guard → claim-binding preflight.
  const preGates = await (async () => {
    const { runPreCriticGates } = await import('./pipeline-steps/pre-critic-gates');
    return runPreCriticGates({
      analysis, topSources, readings,
      stats: stats as Record<string, any>, label, query,
      quantModelCount: quantBridge.models.length,
      fullContextBlock, tagEval, addCost, citationGuard, ctx,
    });
  })();
  fullContextBlock = preGates.fullContextBlock;
  const guard = preGates.guard;

  // ── STEP 7b: CRITIC BLOCK — extracted to pipeline-steps/critic-block.ts ──
  // critic → panel → repair(+recheck) → evidence tool → outline critic →
  // gap requests → self-correct checkpoint → CoVe.
  let savedCriticResult: any = null;
  {
    const { runCriticBlock } = await import('./pipeline-steps/critic-block');
    const criticOut = await runCriticBlock({
      state: gapFillState, topSources, readings, slimReadings,
      stats: stats as Record<string, any>, label, query, detectedDomain,
      positioningBrief, fullContextBlock, isStrategic, isBudgetConstrained,
      orchState,
      analystMultipass, bumpAnalysisArtifact, tagEval, addCost,
      emitProgress, pipelineRunId: pipelineRun.id, ctx, selfCorrector,
      processGapRequests,
    });
    analysis = criticOut.analysis;
    allSourceIds = gapFillState.allSourceIds;
    reAnalysisBudget = criticOut.reAnalysisBudget;
    savedCriticResult = criticOut.savedCriticResult;
  }

  // ── STEP 7d: SCENARIO ENGINE — MOVED to pre-analyst (Step 6) for context injection ──
  // CANA + SCATTER now run BEFORE the analyst so their outputs enrich the analysis.
  // Stats are already recorded in the pre-analyst step above.

  // ── STEP 7c/7d/7e: POST-CRITIC ENRICHMENT — extracted to
  //    pipeline-steps/post-critic-enrichment.ts. Reflection + cross-model
  //    consensus + inter-paper KG are pure readers → run concurrently. ──
  {
    const { runPostCriticEnrichment } = await import('./pipeline-steps/post-critic-enrichment');
    await runPostCriticEnrichment({
      analysis, topSources, stats: stats as Record<string, any>,
      label, query, citationUsedCount: guard.usedCount,
    });
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

    // Arbiter + foresight extracted to pipeline-steps/arbiter-foresight.ts.
    // Ordering is load-bearing: arbiter generates scenarios, then Monte Carlo
    // refines probabilities. Both outputs are reassigned by the caller.
    {
      const { runArbiterForesight } = await import('./pipeline-steps/arbiter-foresight');
      const arbiterOut = await runArbiterForesight({
        query, topicClassification, castingResult,
        analysis: analysis as Record<string, any>,
        topSources, debateResult, stats: stats as Record<string, any>,
        label, detectedDomain, isStrategic,
        seedSourceIds: opts.seedSourceIds,
        pipelineRunId: pipelineRun.id, addCost,
      });
      institutePosition = arbiterOut.institutePosition;
      analysis = arbiterOut.analysis as typeof analysis;
    }

    stats.centralScenarioRequired = true;
    if (institutePosition) {
      stats.centralScenario ??= resolveCentralScenario(institutePosition);
      stats.institutePosition = institutePosition;
      analysis = { ...analysis, centralScenario: stats.centralScenario, scenarios: institutePosition.scenarios } as typeof analysis;
      console.log(`${label} CENTRAL SCENARIO: ${stats.centralScenario?.name ?? 'missing — publication hold required'}; simulation disagreement=${stats.centralScenario?.simulationDisagrees ?? false}`);
    }
    // DA and render are independent: the render reads stats.critic/scout/analyst/
    // trust, never stats.devilsAdvocate — the DA verdict is rendered as an
    // editorial section AFTER the render. Running them concurrently removes
    // the DA's wall-time from the critical path (~15-30s per run).
    const [, renderedHtml] = await Promise.all([
      runDevilsAdvocateBlock(debateAdvocateDeps, runDevilsAdvocateStep, buildAnalysisReviewText(analysis as Record<string, unknown>, query), debateContext),
      durable('render', () => renderEditorHtml()),
    ]);
    html = renderedHtml;
    bumpHtmlArtifact();

    // DA section + peer review + think-tank pack extracted to
    // pipeline-steps/post-render-extras.ts (peer review ∥ pack — same input
    // html, only the pack mutates).
    html = injectAdversarialSection(html, stats.devilsAdvocate as any, label);
    html = await runPeerReviewAndPack({
      html, query, topSources, analysisTitle: analysis.title,
      stats: stats as Record<string, any>, label, detectedDomain,
      institutePosition, usePeerReview, useThinkTankPack,
      packOpts: {
        primaryData: opts.primaryData,
        scenarioModeling: opts.scenarioModeling,
        maxScenarios: opts.maxScenarios,
        stressTest: opts.stressTest,
        policyCouncil: opts.policyCouncil,
      },
      addCost, tagEval, bumpHtmlArtifact,
    });
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
    html = await runPeerReviewAndPack({
      html, query, topSources, analysisTitle: analysis.title,
      stats: stats as Record<string, any>, label, detectedDomain,
      institutePosition, usePeerReview, useThinkTankPack,
      packOpts: {
        primaryData: opts.primaryData,
        scenarioModeling: opts.scenarioModeling,
        maxScenarios: opts.maxScenarios,
        stressTest: opts.stressTest,
        policyCouncil: opts.policyCouncil,
      },
      addCost, tagEval, bumpHtmlArtifact,
    });
    await runPostRenderCitationAndGrounding();
    // Debate + meta-analysis reactivated
    applyDebateOutcome(await runDebateMetaBlock(debateAdvocateDeps, runDebateStep, buildAnalysisReviewText(analysis as Record<string, unknown>, query)));
    await runDevilsAdvocateBlock(debateAdvocateDeps, runDevilsAdvocateStep, html, debateContext);
  }

  stats.analysis = analysis;
  stats.editorialV2 = editorialV2;

  // P3.8 + prose cleanup — extracted to pipeline-steps/post-render-extras.ts
  html = await applyEvidenceIdsAndProseCleanup(html, evidenceRegistry, stats as Record<string, any>, label);

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

  // ── STEP 14-17 + POST-RUN LEARNING — extracted to pipeline-steps/persistence-tail.ts ──
  // brief.create → parallel post-publish writes → auditor → reputation →
  // experience bank → eval-freshness assert → pipelineRun.update → durable
  // seal → learning loop → skill bank → parallel post-run learning → MOA.
  const tail = await runPersistenceTail({
    label, isStrategic, query, html,
    stats: stats as Record<string, any>, topSources, analysis, detectedDomain,
    foundationalSources, pipelineRun, orchState, episodicContext, pipelineStart,
    runningCostUsd, savedScatterResult, useTemporalMemory, ctx, emitProgress,
    collectStaleEvaluations, analysisArtifactVersion, htmlArtifactVersion,
    durableKey, memoryBlock, readerMemoryBlock, readings,
    witnessCtx, useWorldModel, worldModelControversies, usePRM, prmModel,
    useRagasEval, useSelfEvolution, useMixtureOfAgents, addCost,
  });
  html = tail.html;

  // Clean up idempotency token on success
  activeRuns.delete(idempotencyKey);

  // Build structured claims from READER extracts for publication gate (dbClaims path)
  const sourceIdToIndex = new Map<string, number>();
  topSources.forEach((s: any, i: number) => sourceIdToIndex.set(s.id, i + 1));
  const readerClaims = readings
    .filter(r => r.claims && r.claims.length > 0)
    .flatMap(r => r.claims.map((claim: string) => ({
      text: claim,
      sourceRef: sourceIdToIndex.get(r.sourceId) ?? null,
    })));

  // Clean up the rejection handler before returning
  process.removeListener('unhandledRejection', rejectionHandler);

  return {
    briefId: tail.briefId,
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
