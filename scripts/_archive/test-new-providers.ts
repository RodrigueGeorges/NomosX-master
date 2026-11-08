/**
 * Live verification of providers newly added to the DEFAULT lists:
 * thesesfr, openaire, zenodo, nber, worldbank-docs, cordis, sec-edgar.
 * All use direct APIs — no OpenAlex dependency, no 429 risk.
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

const query = process.argv[2] || 'climate change governance';

async function main() {
  console.log(`\nNew Default Providers Test — query: "${query}"\n`);

  const { searchThesesFr } = await import('../lib/providers/thesesfr');
  const { searchOpenAIRE } = await import('../lib/providers/openaire');
  const { searchZenodo } = await import('../lib/providers/zenodo');
  const { searchNBER } = await import('../lib/providers/nber');
  const { searchSECEdgar, searchWorldBankDocs, searchCORDIS } = await import('../lib/providers/open-access-providers');

  // All independent APIs — run in parallel
  const parallel = [
    { name: 'Theses.fr (thèses)',      fn: () => searchThesesFr(query, 5) },
    { name: 'OpenAIRE (science UE)',   fn: () => searchOpenAIRE(query, 5) },
    { name: 'Zenodo (CERN)',           fn: () => searchZenodo(query, 5) },
    { name: 'NBER (working papers)',   fn: () => searchNBER(query, 5) },
    { name: 'WorldBank Docs (rapports)', fn: () => searchWorldBankDocs(query, 5) },
    { name: 'CORDIS (projets UE)',     fn: () => searchCORDIS(query, 5) },
    { name: 'SEC EDGAR (filings)',     fn: () => searchSECEdgar(query, 5) },
  ];

  const sequential: typeof parallel = [];

  const parallelResults = await Promise.allSettled(parallel.map(async t => {
    const start = Date.now();
    const docs = await t.fn();
    return { name: t.name, count: docs.length, ms: Date.now() - start, sample: docs[0] };
  }));

  const seqResults: PromiseSettledResult<{ name: string; count: number; ms: number; sample: any }>[] = [];
  for (const t of sequential) {
    const start = Date.now();
    try {
      const docs = await t.fn();
      seqResults.push({ status: 'fulfilled', value: { name: t.name, count: docs.length, ms: Date.now() - start, sample: docs[0] } });
    } catch (e: any) {
      seqResults.push({ status: 'rejected', reason: e });
    }
    await new Promise(r => setTimeout(r, 3000)); // 3s gap between S2 calls
  }

  const tests = [...parallel, ...sequential];
  const results = [...parallelResults, ...seqResults];

  console.log('\n| Provider | Status | Count | Duration | Sample title |');
  console.log('|----------|--------|-------|----------|--------------|');
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      const { name, count, ms, sample } = r.value;
      const title = sample?.title?.slice(0, 50) || '(no results)';
      const status = count > 0 ? '✅ ok' : '⚠️  empty';
      console.log(`| ${name.padEnd(20)} | ${status} | ${count} | ${ms}ms | ${title} |`);
    } else {
      console.log(`| ${tests[i].name.padEnd(20)} | ❌ error | 0 | - | ${r.reason?.message} |`);
    }
  });
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
