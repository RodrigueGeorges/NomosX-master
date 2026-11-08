/**
 * Live health-check of ALL scout providers.
 * Calls each provider's real search function once with a 15s timeout.
 *
 * Run: node --import tsx scripts/audit-providers-live.ts
 *      node --import tsx scripts/audit-providers-live.ts "custom query"
 */
import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });

const QUERY = process.argv[2] || 'artificial intelligence regulation';
const TIMEOUT_MS = 15_000;
const BATCH = 10;

type SearchFn = (q: string, n: number) => Promise<any[]>;
type Entry = [name: string, modulePath: string, exportName: string];

const PROVIDERS: Entry[] = [
  // Academic core
  ['openalex', '../lib/providers/openalex', 'searchOpenAlex'],
  ['thesesfr', '../lib/providers/thesesfr', 'searchThesesFr'],
  ['crossref', '../lib/providers/crossref', 'searchCrossref'],
  ['semanticscholar', '../lib/providers/semanticscholar', 'searchSemanticScholar'],
  ['arxiv', '../lib/providers/arxiv', 'searchArxiv'],
  ['hal', '../lib/providers/hal', 'searchHAL'],
  ['pubmed', '../lib/providers/pubmed', 'searchPubMed'],
  ['base', '../lib/providers/base', 'searchBASE'],
  ['core', '../lib/providers/core', 'searchCORE'],
  ['europepmc', '../lib/providers/europepmc', 'searchEuropePMC'],
  ['doaj', '../lib/providers/doaj', 'searchDOAJ'],
  ['ssrn', '../lib/providers/ssrn', 'searchSSRN'],
  ['repec', '../lib/providers/repec', 'searchRePEc'],
  ['nber', '../lib/providers/nber', 'searchNBER'],
  ['who-gho', '../lib/providers/who-gho', 'searchWHOGHO'],
  ['semantic-scholar-graph', '../lib/providers/semantic-scholar-api', 'searchSemanticScholarGraph'],
  // Free APIs
  ['plos', '../lib/providers/open-access-providers', 'searchPLOS'],
  ['federal-register', '../lib/providers/open-access-providers', 'searchFederalRegister'],
  ['sec-edgar', '../lib/providers/open-access-providers', 'searchSECEdgar'],
  ['worldbank-docs', '../lib/providers/open-access-providers', 'searchWorldBankDocs'],
  ['cordis', '../lib/providers/open-access-providers', 'searchCORDIS'],
  // Foundational
  ['ipcc', '../lib/providers/academic/foundational-sources', 'searchIPCC'],
  ['internet-archive', '../lib/providers/academic/foundational-sources', 'searchInternetArchive'],
  ['hathitrust', '../lib/providers/academic/foundational-sources', 'searchHathiTrust'],
  ['open-library', '../lib/providers/academic/foundational-sources', 'searchOpenLibrary'],
  ['jstor', '../lib/providers/academic/foundational-sources', 'searchJSTOR'],
  ['unesco', '../lib/providers/academic/foundational-sources', 'searchUNESCO'],
  ['club-of-rome', '../lib/providers/academic/foresight-sources', 'searchClubOfRome'],
  ['millennium-project', '../lib/providers/academic/foresight-sources', 'searchMillenniumProject'],
  // Heritage
  ['gallica', '../lib/providers/heritage/gallica', 'searchGallica'],
  ['europeana', '../lib/providers/heritage/europeana', 'searchEuropeana'],
  ['gutenberg', '../lib/providers/heritage/gutenberg', 'searchGutenberg'],
  ['dpla', '../lib/providers/heritage/dpla', 'searchDPLA'],
  ['wikisource', '../lib/providers/heritage/wikisource', 'searchWikisource'],
  // Global South
  ['ajol', '../lib/providers/global-south/ajol', 'searchAJOL'],
  ['dialnet', '../lib/providers/global-south/dialnet', 'searchDialnet'],
  ['shodhganga', '../lib/providers/global-south/shodhganga', 'searchShodhganga'],
  ['riss', '../lib/providers/global-south/riss', 'searchRISS'],
  // Preprints
  ['chemrxiv', '../lib/providers/preprints/chemrxiv', 'searchChemRxiv'],
  ['osf', '../lib/providers/preprints/osf', 'searchOSF'],
  ['preprints-org', '../lib/providers/preprints/preprints-org', 'searchPreprintsOrg'],
  ['dryad', '../lib/providers/preprints/dryad', 'searchDryad'],
  // Big indexes
  ['dimensions', '../lib/providers/dimensions-provider', 'searchDimensions'],
  ['lens', '../lib/providers/lens-provider', 'searchLens'],
  ['springer', '../lib/providers/springer-provider', 'searchSpringer'],
  ['osti', '../lib/providers/osti-provider', 'searchOSTI'],
  ['datacite', '../lib/providers/datacite-provider', 'searchDataCite'],
  ['google-books', '../lib/providers/google-books-provider', 'searchGoogleBooks'],
  ['opencitations', '../lib/providers/opencitations', 'searchOpenCitations'],
  // SHS
  ['isidore', '../lib/providers/isidore', 'searchISIDORE'],
  ['persee', '../lib/providers/persee', 'searchPersee'],
  ['philpapers', '../lib/providers/philpapers', 'searchPhilPapers'],
  ['eric', '../lib/providers/eric', 'searchERIC'],
  ['fao', '../lib/providers/fao', 'searchFAO'],
  ['unodc', '../lib/providers/unodc', 'searchUNODC'],
  ['openaire', '../lib/providers/openaire', 'searchOpenAIRE'],
  ['zenodo', '../lib/providers/zenodo', 'searchZenodo'],
  // Domain-specific (S2/OpenAlex wrappers)
  ['psychology', '../lib/providers/psychology', 'searchPsychology'],
  ['sociology', '../lib/providers/sociology', 'searchSociology'],
  ['history', '../lib/providers/history', 'searchHistory'],
  ['geography', '../lib/providers/geography', 'searchGeography'],
  ['chemistry', '../lib/providers/chemistry', 'searchChemistry'],
  ['biology', '../lib/providers/biology', 'searchBiology'],
  ['political-science', '../lib/providers/political-science', 'searchPoliticalScience'],
  ['business', '../lib/providers/business', 'searchBusiness'],
  ['dblp', '../lib/providers/dblp', 'searchDBLP'],
  ['zbmath', '../lib/providers/zbmath', 'searchZbMath'],
  // Foreign academic
  ['cyberleninka', '../lib/providers/foreign/cyberleninka', 'searchCyberLeninka'],
  ['wanfang', '../lib/providers/foreign/wanfang', 'searchWanfang'],
  ['jstage', '../lib/providers/foreign/jstage', 'searchJStage'],
  ['scielo', '../lib/providers/foreign/scielo', 'searchSciELO'],
  ['elibrary', '../lib/providers/foreign/elibrary-ru', 'searchELibrary'],
  // Grey lit
  ['overton', '../lib/providers/overton', 'searchOverton'],
  // News
  ['gdelt-news', '../lib/providers/news-scout-providers', 'searchGDELTNews'],
  ['newsapi', '../lib/providers/news-scout-providers', 'searchNewsAPI'],
  ['mediastack', '../lib/providers/news-scout-providers', 'searchMediaStack'],
  ['thenewsapi', '../lib/providers/news-scout-providers', 'searchTheNewsAPI'],
  ['gnews', '../lib/providers/news-scout-providers', 'searchGNews'],
  ['eventregistry', '../lib/providers/news-scout-providers', 'searchEventRegistry'],
  ['independent-media', '../lib/providers/independent-media-provider', 'searchIndependentMedia'],
  ['gdelt-independent', '../lib/providers/independent-media-provider', 'searchGDELTIndependent'],
  ['newsdata', '../lib/providers/newsdata-provider', 'searchNewsData'],
  ['hf-papers', '../lib/providers/hf-papers-provider', 'searchHuggingFacePapers'],
  ['data-europa', '../lib/providers/data-europa-provider', 'searchDataEuropa'],
  ['ietf', '../lib/providers/ietf-provider', 'searchIETF'],
  ['apitube', '../lib/providers/apitube-provider', 'searchAPITube'],
  // Paid web search
  ['linkup', '../lib/providers/linkup-sdk', 'searchLinkUp'],
  ['tavily', '../lib/providers/tavily-provider', 'searchTavily'],
  ['exa', '../lib/providers/exa-provider', 'searchExa'],
];

interface Result { name: string; status: 'OK' | 'EMPTY' | 'FAIL' | 'TIMEOUT'; n: number; ms: number; err?: string }

async function testOne(name: string, mod: string, fn: string): Promise<Result> {
  const start = Date.now();
  try {
    const m = await import(mod);
    const search: SearchFn = m[fn];
    if (typeof search !== 'function') return { name, status: 'FAIL', n: 0, ms: 0, err: `no export ${fn}` };
    const res = await Promise.race([
      search(QUERY, 5),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('TIMEOUT')), TIMEOUT_MS)),
    ]);
    const ms = Date.now() - start;
    const arr = Array.isArray(res) ? res : [];
    return { name, status: arr.length > 0 ? 'OK' : 'EMPTY', n: arr.length, ms };
  } catch (e: any) {
    const ms = Date.now() - start;
    const msg = (e?.message || String(e)).slice(0, 110);
    return { name, status: msg === 'TIMEOUT' ? 'TIMEOUT' : 'FAIL', n: 0, ms, err: msg };
  }
}

async function main() {
  console.log(`\n=== PROVIDER HEALTH CHECK — "${QUERY}" (timeout ${TIMEOUT_MS / 1000}s, ${PROVIDERS.length} providers) ===\n`);
  const results: Result[] = [];
  for (let i = 0; i < PROVIDERS.length; i += BATCH) {
    const batch = PROVIDERS.slice(i, i + BATCH);
    const rs = await Promise.all(batch.map(([n, m, f]) => testOne(n, m, f)));
    for (const r of rs) {
      results.push(r);
      const icon = r.status === 'OK' ? '✅' : r.status === 'EMPTY' ? '⚠️ ' : '❌';
      console.log(`${icon} ${r.name.padEnd(26)} ${r.status.padEnd(7)} ${String(r.n).padStart(3)} results ${String(r.ms).padStart(6)}ms ${r.err ?? ''}`);
    }
  }
  const ok = results.filter(r => r.status === 'OK');
  const empty = results.filter(r => r.status === 'EMPTY');
  const fail = results.filter(r => r.status === 'FAIL' || r.status === 'TIMEOUT');
  console.log(`\n=== SUMMARY: ${ok.length} OK · ${empty.length} EMPTY · ${fail.length} FAIL/TIMEOUT ===`);
  if (fail.length) console.log(`DEAD: ${fail.map(f => `${f.name}(${f.status === 'TIMEOUT' ? 'timeout' : f.err})`).join(', ')}`);
  if (empty.length) console.log(`EMPTY: ${empty.map(e => e.name).join(', ')}`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
