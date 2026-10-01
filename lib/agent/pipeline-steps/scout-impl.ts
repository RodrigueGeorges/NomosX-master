/**
 * SCOUT provider fan-out: deadline-bounded parallel calls across ~100
 * providers, with the provider-health circuit breaker recording each call.
 * Extracted from pipeline-v2.ts (Sprint 28c) — the public `scout()` wrapper
 * (governance assert + Redis cache) stays in pipeline-v2 and calls this.
 */
import { Prisma } from '@prisma/client';
import { prisma } from '../../db';
import { clamp } from '../../text';
import { scoreSource } from '../../score';
import { enhanceQuery, type EnhancedQuery } from '../query-enhancer';
import { filterByRelevance, logRelevanceScores, evaluateWithCARE } from '../relevance-scorer';
import { rerankSources } from '../cohere-reranker';
import { selectProviders, diversifyQueries } from '../radar-innovations';
import { searchExtendedProviders, getExtendedProvidersForDomain } from '../../providers/registry-bridge';
import { filterLowQualitySources } from '../../providers/source-quality-filter';
import { recordProviderCall } from '../provider-health-tracker';
import type { Providers } from './provider-lists';

import { searchOpenAlex } from "../../providers/openalex";
import { searchThesesFr } from "../../providers/thesesfr";
import { enrichManyThesesWithHAL } from "../../providers/thesesfr-hal-bridge";
import { searchCrossref } from "../../providers/crossref";
import { searchSemanticScholar } from "../../providers/semanticscholar";
import { searchArxiv } from "../../providers/arxiv";
import { searchHAL } from "../../providers/hal";
import { searchPubMed } from "../../providers/pubmed";
import { searchBASE } from "../../providers/base";
import { searchCORE } from "../../providers/core";
import { searchEuropePMC } from "../../providers/europepmc";
import { searchDOAJ } from "../../providers/doaj";
import { searchSSRN } from "../../providers/ssrn";
import { searchRePEc } from "../../providers/repec";
import { searchNBER } from "../../providers/nber";
import { searchWHOGHO } from "../../providers/who-gho";
import { searchSemanticScholarGraph } from "../../providers/semantic-scholar-api";
import { unpaywallByDoi } from "../../providers/unpaywall";
import { searchLinkUp } from "../../providers/linkup-sdk";
import { searchTavily, searchTavilyNews } from "../../providers/tavily-provider";
import { searchExa, searchExaPublications } from "../../providers/exa-provider";
import { searchAPITube } from "../../providers/apitube-provider";
import { searchDimensions } from "../../providers/dimensions-provider";
import { searchLens } from "../../providers/lens-provider";
import { searchSpringer } from "../../providers/springer-provider";
import { searchOSTI } from "../../providers/osti-provider";
import { searchDataCite } from "../../providers/datacite-provider";
import { searchGoogleBooks } from "../../providers/google-books-provider";
import { searchPLOS, searchFederalRegister, searchSECEdgar, searchWorldBankDocs, searchCORDIS } from "../../providers/open-access-providers";
import { searchIPCC, searchInternetArchive, searchHathiTrust, searchOpenLibrary, searchJSTOR, searchUNESCO } from "../../providers/academic/foundational-sources";
import { searchClubOfRome, searchMillenniumProject } from "../../providers/academic/foresight-sources";
// Heritage & historical sources (2026-08 expansion)
import { searchGallica } from "../../providers/heritage/gallica";
import { searchEuropeana } from "../../providers/heritage/europeana";
import { searchGutenberg } from "../../providers/heritage/gutenberg";
import { searchDPLA } from "../../providers/heritage/dpla";
import { searchWikisource } from "../../providers/heritage/wikisource";
// Global South & regional (2026-08 expansion)
import { searchAJOL } from "../../providers/global-south/ajol";
import { searchDialnet } from "../../providers/global-south/dialnet";
import { searchShodhganga } from "../../providers/global-south/shodhganga";
import { searchRISS } from "../../providers/global-south/riss";
// Preprints & open-science data (2026-08 expansion)
import { searchChemRxiv } from "../../providers/preprints/chemrxiv";
import { searchOSF } from "../../providers/preprints/osf";
import { searchPreprintsOrg } from "../../providers/preprints/preprints-org";
import { searchDryad } from "../../providers/preprints/dryad";
import { searchGDELTNews, searchNewsAPI, searchMediaStack, searchTheNewsAPI, searchGNews, searchEventRegistry } from "../../providers/news-scout-providers";
import { searchIndependentMedia, searchGDELTIndependent } from "../../providers/independent-media-provider";
// Grey Literature
import { searchOverton } from "../../providers/overton";
// Foreign Academic Sources — Non-Western databases
import { searchCyberLeninka } from "../../providers/foreign/cyberleninka";
import { searchWanfang } from "../../providers/foreign/wanfang";
import { searchJStage } from "../../providers/foreign/jstage";
import { searchSciELO } from "../../providers/foreign/scielo";
import { searchELibrary } from "../../providers/foreign/elibrary-ru";
import { searchISIDORE } from "../../providers/isidore";
import { searchERIC } from "../../providers/eric";
import { searchFAO } from "../../providers/fao";
import { searchUNODC } from "../../providers/unodc";
import { searchWorldBankData } from "../../providers/worldbank-data";
import { searchUCDP, searchILOSTAT, searchOWID } from "../../providers/stats-data";
import {
  searchComtrade, searchBLS, searchCensus, searchACLED,
  searchUNHCR, searchEStatJP, searchKOSIS, searchONS, searchIBGE,
  searchDataCommons,
} from "../../providers/stats-keys";
import { searchSearxng } from "../../providers/searxng";
import { searchPhilPapers } from "../../providers/philpapers";
import { searchPersee } from "../../providers/persee";
import { searchOpenAIRE } from "../../providers/openaire";
import { searchZenodo } from "../../providers/zenodo";
import { searchPsychology } from "../../providers/psychology";
import { searchSociology } from "../../providers/sociology";
import { searchHistory } from "../../providers/history";
import { searchGeography } from "../../providers/geography";
import { searchChemistry } from "../../providers/chemistry";
import { searchBiology } from "../../providers/biology";
import { searchPoliticalScience } from "../../providers/political-science";
import { searchBusiness } from "../../providers/business";
import { searchDBLP } from "../../providers/dblp";
import { searchZbMath } from "../../providers/zbmath";
import { searchOpenCitations } from "../../providers/opencitations";
import { searchNewsData } from "../../providers/newsdata-provider";
import { searchHuggingFacePapers } from "../../providers/hf-papers-provider";
import { searchDataEuropa } from "../../providers/data-europa-provider";
import { searchIETF } from "../../providers/ietf-provider";
import { dedupSources } from "../dedup-doi";
import { filterRetracted } from "../retraction-watch";
import { tsSetRank } from "../ts-setrank";

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
} from "../../providers/institutional";

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
 * Persist only the `raw` keys consumers actually read (fallback extraction,
 * trust evaluation, author/institution parsing). The full provider payload
 * was the dominant source of DB growth (Neon 512MB cap hit at ~35K rows).
 */
const RAW_KEEP_KEYS = new Set([
  'authors', 'author', 'authorships', 'institutions', 'title', 'published',
  'publication_year', 'primary_location', 'journal_name', 'container_title',
  'funder', 'created', 'id', 'abstract', 'length', 'doi', 'url', 'is_oa',
  'open_access', 'type', 'language', 'cited_by_count', 'issn', 'publisher',
]);

function slimSourceRaw(s: any): Prisma.InputJsonValue {
  const src = (s.raw ?? {}) as Record<string, unknown>;
  const raw: Record<string, unknown> = {};
  for (const k of RAW_KEEP_KEYS) {
    if (src[k] !== undefined) raw[k] = src[k];
  }
  raw.authors = s.authors || src.authors || [];
  raw.institutions = s.institutions || src.institutions || [];
  // Hard cap — a runaway provider payload must never dominate a row again
  const json = JSON.stringify(raw);
  return (json.length <= 16_384 ? raw : { truncated: true }) as Prisma.InputJsonValue;
}

/**
 * SCOUT: Unified implementation with query enhancement + reranking
 *
 * Pipeline: Query Enhancement â†’ Multi-Query Search (58+ providers)
 */
export async function scoutImpl(query: string, providers: Providers, perProvider = 100) {
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
    const { generatePerspectiveQueries } = await import('../perspective-questions');
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

  // Health-tracker filter: blacklisted providers (3+ consecutive failures,
  // e.g. arxiv/worldbank/core hitting their 90s deadlines) must be skipped at
  // scheduling time — previously they were still called every query variation,
  // each burning a full deadline slot in the parallel pool.
  const { isProviderHealthy } = await import('../provider-health-tracker');
  const unhealthy: string[] = [];
  for (const p of providerSet) {
    if (typeof p === 'string' && !isProviderHealthy(p)) unhealthy.push(p);
  }
  for (const p of unhealthy) providerSet.delete(p);
  if (unhealthy.length) {
    console.log(`[SCOUT] Skipping ${unhealthy.length} blacklisted providers: ${unhealthy.join(', ')}`);
  }

  // ROR BATCHING — collapse pure OpenAlex-ROR institutional wrappers (~30
  // providers) into ONE batched OpenAlex call per query variation. Previously
  // each fired individually per query, which exhausted the per-execution
  // upstream budget mid-scout and starved later planner nodes. Results are
  // retagged to the provider whose ROR matched. Providers already covered by
  // an active consolidated-institutions call are excluded from the batch.
  const { isRorBatchedProvider, searchRorBatch } = await import("../../providers/institutional/ror-batch");
  const { getConsolidatedProviderNames } = await import("../../providers/institutional/consolidated-institutions");
  const coveredByConsolidated = new Set(
    providerSet.has("consolidated-institutions") ? getConsolidatedProviderNames() : []
  );
  const rorBatched = [...providerSet].filter(
    (p): p is string => typeof p === "string" && isRorBatchedProvider(p) && !coveredByConsolidated.has(p)
  );
  for (const p of rorBatched) providerSet.delete(p);
  if (rorBatched.length > 0) {
    console.log(`[SCOUT] ROR-batching ${rorBatched.length} institutional providers: ${rorBatched.join(', ')}`);
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
      const { searchConsolidatedInstitutions } = await import("../../providers/institutional/consolidated-institutions");
      allPromises.push(trackProviderCall("consolidated-institutions", searchConsolidatedInstitutions(sq, ['economic', 'defense', 'french', 'health', 'tech', 'multilateral'], Math.min(30, perProvider))));
    }
    // ROR-BATCHED individual providers — same OR-filter trick applied to the
    // individually-routed institutional providers (see providerSet surgery above)
    if (rorBatched.length > 0) {
      allPromises.push(trackProviderCall("ror-batch", searchRorBatch(sq, rorBatched, Math.min(30, perProvider))));
    }

    // V3.1: GLOBAL OMNISCIENCE LAYER — 4 consolidated RSS-based providers covering 80+ organizations
    // Intelligence, International Orgs, Think Tanks, Science & Tech
    if (providerSet.has("global-intelligence")) {
      const { searchGlobalIntelligence } = await import("../../providers/institutional/intelligence/global-intelligence");
      allPromises.push(trackProviderCall("global-intelligence", searchGlobalIntelligence(sq, Math.min(20, perProvider))));
    }
    if (providerSet.has("global-orgs")) {
      const { searchGlobalOrgs } = await import("../../providers/institutional/international/global-orgs");
      allPromises.push(trackProviderCall("global-orgs", searchGlobalOrgs(sq, Math.min(25, perProvider))));
    }
    if (providerSet.has("global-think-tanks")) {
      const { searchGlobalThinkTanks } = await import("../../providers/institutional/think-tanks/global-think-tanks");
      allPromises.push(trackProviderCall("global-think-tanks", searchGlobalThinkTanks(sq, Math.min(25, perProvider))));
    }
    if (providerSet.has("global-science")) {
      const { searchGlobalScience } = await import("../../providers/institutional/science/global-science");
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
        const { searchFeedSubset } = await import("../../providers/feeds");
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
          const { gapFillMissingConcepts } = await import('../retrieval-gapfill');
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
          raw: slimSourceRaw(s),
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
    const { detectDomain } = await import('../smart-provider-selector');
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
