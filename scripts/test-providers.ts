/**
 * Provider Diagnostic Script
 * Tests every configured provider individually and reports:
 * - status (ok / empty / error / skipped-no-key)
 * - count of returned sources
 * - first result sample
 * - error message
 *
 * Usage: node --import tsx scripts/test-providers.ts "artificial intelligence regulation"
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

const query = process.argv[2] || 'artificial intelligence regulation';
const timeoutMs = 60000;

interface ProviderTest {
  name: string;
  category: string;
  key?: string;
  fn: () => Promise<any[]>;
}

const results: {
  name: string;
  category: string;
  status: 'ok' | 'empty' | 'error' | 'skipped';
  count: number;
  sample?: any;
  error?: string;
  keyMissing?: string;
  durationMs: number;
}[] = [];

async function runTest(p: ProviderTest) {
  const start = Date.now();
  try {
    if (p.key && !process.env[p.key]) {
      results.push({ name: p.name, category: p.category, status: 'skipped', count: 0, keyMissing: p.key, durationMs: Date.now() - start });
      return;
    }
    const sources = await Promise.race([
      p.fn(),
      new Promise<any[]>((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), timeoutMs)),
    ]);
    const durationMs = Date.now() - start;
    if (!Array.isArray(sources) || sources.length === 0) {
      results.push({ name: p.name, category: p.category, status: 'empty', count: 0, durationMs });
    } else {
      results.push({ name: p.name, category: p.category, status: 'ok', count: sources.length, sample: sources[0], durationMs });
    }
  } catch (err: any) {
    results.push({ name: p.name, category: p.category, status: 'error', count: 0, error: err.message, durationMs: Date.now() - start });
  }
}

async function main() {
  console.log(`\nProvider Diagnostic — query: "${query}"\n`);
  const start = Date.now();

  // Academic providers
  const { searchOpenAlex } = await import('../lib/providers/openalex');
  const { searchCrossref } = await import('../lib/providers/crossref');
  const { searchSemanticScholar } = await import('../lib/providers/semanticscholar');
  const { searchSemanticScholarGraph } = await import('../lib/providers/semantic-scholar-api');
  const { searchArxiv } = await import('../lib/providers/arxiv');
  const { searchHAL } = await import('../lib/providers/hal');
  const { searchPubMed } = await import('../lib/providers/pubmed');
  const { searchBASE } = await import('../lib/providers/base');
  const { searchCORE } = await import('../lib/providers/core');
  const { searchEuropePMC } = await import('../lib/providers/europepmc');
  const { searchDOAJ } = await import('../lib/providers/doaj');
  const { searchSSRN } = await import('../lib/providers/ssrn');
  const { searchRePEc } = await import('../lib/providers/repec');
  const { searchNBER } = await import('../lib/providers/nber');
  const { searchWHOGHO } = await import('../lib/providers/who-gho');
  const { searchThesesFr } = await import('../lib/providers/thesesfr');

  // News/Web providers
  const { searchLinkUp } = await import('../lib/providers/linkup-sdk');
  const { searchGDELTNews, searchNewsAPI, searchMediaStack, searchTheNewsAPI, searchGNews, searchEventRegistry } = await import('../lib/providers/news-scout-providers');

  // Institutional / economic
  const { searchOECD } = await import('../lib/providers/institutional/economic/oecd');
  const { searchWorldBank } = await import('../lib/providers/institutional/economic/worldbank');
  const { searchIMF } = await import('../lib/providers/institutional/economic/imf');
  const { searchFRED } = await import('../lib/providers/institutional/economics/fred');
  const { searchINSEE } = await import('../lib/providers/insee');
  const { searchISIDORE } = await import('../lib/providers/isidore');
  const { searchERIC } = await import('../lib/providers/eric');
  const { searchFAO } = await import('../lib/providers/fao');
  const { searchUNODC } = await import('../lib/providers/unodc');
  const { searchPhilPapers } = await import('../lib/providers/philpapers');
  const { searchPersee } = await import('../lib/providers/persee');
  const { searchOpenAIRE } = await import('../lib/providers/openaire');

  // NEW 2026 providers
  const { searchOpenReview } = await import('../lib/providers/institutional/academic/openreview');
  const { searchBioRxiv } = await import('../lib/providers/institutional/academic/biorxiv');
  const { searchPapersWithCode } = await import('../lib/providers/institutional/academic/papers-with-code');
  const { searchMITDSpace } = await import('../lib/providers/institutional/academic/mit-dspace');
  const { searchHarvardDASH } = await import('../lib/providers/institutional/academic/harvard-dash');
  const { searchMaxPlanckPuRe } = await import('../lib/providers/institutional/academic/max-planck-pure');
  const { searchENTSOG } = await import('../lib/providers/institutional/energy/entsog');
  const { searchEEA } = await import('../lib/providers/institutional/environmental/eea');
  const { searchEnergyCharts } = await import('../lib/providers/institutional/energy/energy-charts');
  const { searchSMARD } = await import('../lib/providers/institutional/energy/smard');
  const { searchRTEFrance } = await import('../lib/providers/institutional/energy/rte-france');
  const { searchEnergiDataService } = await import('../lib/providers/institutional/energy/energi-data');
  const { searchFingrid } = await import('../lib/providers/institutional/energy/fingrid');
  const { searchClinicalTrials } = await import('../lib/providers/institutional/health/clinical-trials');
  const { searchISTAT } = await import('../lib/providers/institutional/government/istat');
  const { searchOpenPrimitive } = await import('../lib/providers/institutional/government/open-primitive');
  const { searchTreasuryFiscal } = await import('../lib/providers/institutional/government/treasury-fiscal');

  const tests: ProviderTest[] = [
    { name: 'openalex', category: 'academic', fn: () => searchOpenAlex(query, 5) },
    { name: 'crossref', category: 'academic', fn: () => searchCrossref(query, 5) },
    { name: 'semanticscholar', category: 'academic', fn: () => searchSemanticScholar(query, 5) },
    { name: 'semanticscholar-graph', category: 'academic', fn: () => searchSemanticScholarGraph(query, 5) },
    { name: 'arxiv', category: 'academic', fn: () => searchArxiv(query, 5) },
    { name: 'hal', category: 'academic', fn: () => searchHAL(query, 5) },
    { name: 'pubmed', category: 'academic', fn: () => searchPubMed(query, 5) },
    { name: 'base', category: 'academic', fn: () => searchBASE(query, 5) },
    { name: 'core', category: 'academic', key: 'CORE_API_KEY', fn: () => searchCORE(query, 5) },
    { name: 'europepmc', category: 'academic', fn: () => searchEuropePMC(query, 5) },
    { name: 'doaj', category: 'academic', fn: () => searchDOAJ(query, 5) },
    { name: 'ssrn', category: 'academic', fn: () => searchSSRN(query, 5) },
    { name: 'repec', category: 'academic', fn: () => searchRePEc(query, 5) },
    { name: 'nber', category: 'academic', fn: () => searchNBER(query, 5) },
    { name: 'who-gho', category: 'academic', fn: () => searchWHOGHO(query, 5) },
    { name: 'thesesfr', category: 'academic', fn: () => searchThesesFr(query, 5) },

    { name: 'linkup', category: 'web', key: 'LINKUP_API_KEY', fn: () => searchLinkUp(query, 5) },
    { name: 'gdelt-news', category: 'news', fn: () => searchGDELTNews(query, 5) },
    { name: 'newsapi', category: 'news', key: 'NEWSAPI_KEY', fn: () => searchNewsAPI(query, 5) },
    { name: 'mediastack', category: 'news', key: 'MEDIASTACK_KEY', fn: () => searchMediaStack(query, 5) },
    { name: 'thenewsapi', category: 'news', key: 'THENEWSAPI_KEY', fn: () => searchTheNewsAPI(query, 5) },
    { name: 'gnews', category: 'news', key: 'GNEWS_KEY', fn: () => searchGNews(query, 5) },
    { name: 'eventregistry', category: 'news', key: 'EVENTREGISTRY_KEY', fn: () => searchEventRegistry(query, 5) },

    { name: 'oecd', category: 'institutional', fn: () => searchOECD(query, 5) },
    { name: 'worldbank', category: 'institutional', fn: () => searchWorldBank(query, 5) },
    { name: 'imf', category: 'institutional', fn: () => searchIMF(query, 5) },
    { name: 'fred', category: 'institutional', key: 'FRED_API_KEY', fn: () => searchFRED(query, 5) },
    { name: 'insee', category: 'institutional', key: 'INSEE_API_KEY', fn: () => searchINSEE(query, 5) },

    { name: 'isidore', category: 'shs', fn: () => searchISIDORE(query, 5) },
    { name: 'persee', category: 'shs', fn: () => searchPersee(query, 5) },
    { name: 'philpapers', category: 'shs', fn: () => searchPhilPapers(query, 5) },
    { name: 'eric', category: 'education', fn: () => searchERIC(query, 5) },
    { name: 'fao', category: 'agriculture', fn: () => searchFAO(query, 5) },
    { name: 'unodc', category: 'criminology', fn: () => searchUNODC(query, 5) },
    { name: 'openaire', category: 'eu-science', fn: () => searchOpenAIRE(query, 5) },

    // NEW 2026 providers
    { name: 'openreview', category: 'new2026', fn: () => searchOpenReview(query, 5) },
    { name: 'biorxiv', category: 'new2026', fn: () => searchBioRxiv(query, 5) },
    { name: 'papers-with-code', category: 'new2026', fn: () => searchPapersWithCode(query, 5) },
    { name: 'mit-dspace', category: 'new2026', fn: () => searchMITDSpace(query, 5) },
    { name: 'harvard-dash', category: 'new2026', fn: () => searchHarvardDASH(query, 5) },
    { name: 'max-planck-pure', category: 'new2026', fn: () => searchMaxPlanckPuRe(query, 5) },
    { name: 'entsog', category: 'new2026', fn: () => searchENTSOG(query, 5) },
    { name: 'eea', category: 'new2026', fn: () => searchEEA(query, 5) },
    { name: 'energy-charts', category: 'new2026', fn: () => searchEnergyCharts(query, 5) },
    { name: 'smard', category: 'new2026', fn: () => searchSMARD(query, 5) },
    { name: 'rte-france', category: 'new2026', fn: () => searchRTEFrance(query, 5) },
    { name: 'energi-data', category: 'new2026', fn: () => searchEnergiDataService(query, 5) },
    { name: 'fingrid', category: 'new2026', fn: () => searchFingrid(query, 5) },
    { name: 'clinical-trials', category: 'new2026', fn: () => searchClinicalTrials(query, 5) },
    { name: 'istat', category: 'new2026', fn: () => searchISTAT(query, 5) },
    { name: 'open-primitive', category: 'new2026', fn: () => searchOpenPrimitive(query, 5) },
    { name: 'treasury-fiscal', category: 'new2026', fn: () => searchTreasuryFiscal(query, 5) },
  ];

  // Run non-OpenAlex tests in parallel, then OpenAlex-dependent ones sequentially
  // to stay within OpenAlex polite pool limits (3 req/s)
  const openAlexDependent = ['openalex', 'repec', 'nber', 'oecd', 'worldbank', 'imf'];
  const parallel = tests.filter(t => !openAlexDependent.includes(t.name));
  const sequential = tests.filter(t => openAlexDependent.includes(t.name));

  await Promise.all(parallel.map(runTest));
  for (const t of sequential) {
    await runTest(t);
    await new Promise(r => setTimeout(r, 2000)); // 2s gap between OpenAlex-dependent providers
  }

  // Print results by category
  const categories = ['academic', 'news', 'web', 'institutional', 'shs', 'education', 'agriculture', 'criminology', 'eu-science', 'new2026'];
  for (const cat of categories) {
    const catResults = results.filter(r => r.category === cat);
    if (catResults.length === 0) continue;
    console.log(`\n## ${cat.toUpperCase()} PROVIDERS`);
    console.log(`| Provider | Status | Count | Duration | Note |`);
    console.log(`|----------|--------|-------|----------|------|`);
    for (const r of catResults) {
      const note = r.status === 'skipped' ? `missing key ${r.keyMissing}` : r.status === 'error' ? r.error : r.status === 'ok' ? `e.g. "${r.sample.title?.slice(0, 40)}"` : '';
      console.log(`| ${r.name} | ${r.status} | ${r.count} | ${r.durationMs}ms | ${note} |`);
    }
  }

  const summary = {
    ok: results.filter(r => r.status === 'ok').length,
    empty: results.filter(r => r.status === 'empty').length,
    error: results.filter(r => r.status === 'error').length,
    skipped: results.filter(r => r.status === 'skipped').length,
  };
  console.log(`\nSUMMARY: ${summary.ok} OK, ${summary.empty} empty, ${summary.error} error, ${summary.skipped} skipped (missing key)`);
  console.log(`Total duration: ${(Date.now() - start) / 1000}s`);

  // Save detailed JSON for debugging
  const fs = await import('fs');
  fs.writeFileSync('scripts/output-provider-test.json', JSON.stringify(results, null, 2), 'utf-8');
  console.log('Detailed JSON saved to: scripts/output-provider-test.json');
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
