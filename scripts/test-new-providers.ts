/**
 * Test for the 7 new providers added in this session.
 * These all use direct APIs (no OpenAlex dependency) so no 429 risk.
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

const query = process.argv[2] || 'climate change governance';

async function main() {
  console.log(`\nNew Providers Test — query: "${query}"\n`);

  const { searchISIDORE } = await import('../lib/providers/isidore');
  const { searchERIC } = await import('../lib/providers/eric');
  const { searchFAO } = await import('../lib/providers/fao');
  const { searchUNODC } = await import('../lib/providers/unodc');
  const { searchPhilPapers } = await import('../lib/providers/philpapers');
  const { searchPersee } = await import('../lib/providers/persee');
  const { searchOpenAIRE } = await import('../lib/providers/openaire');
  const { searchZenodo } = await import('../lib/providers/zenodo');

  // Group 1: independent APIs — run in parallel (no S2 dependency)
  const parallel = [
    { name: 'ISIDORE (SHS)',   fn: () => searchISIDORE(query, 5) },
    { name: 'Persée (SHS FR)', fn: () => searchPersee(query, 5) },
    { name: 'OpenAIRE (EU)',   fn: () => searchOpenAIRE(query, 5) },
    { name: 'Zenodo (CERN)',   fn: () => searchZenodo(query, 5) },
  ];

  // Group 2: S2-primary with OpenAlex fallback — sequential with 3s gaps
  const sequential = [
    { name: 'PhilPapers (Philo)', fn: () => searchPhilPapers(query, 5) },
    { name: 'ERIC (Education)',   fn: () => searchERIC(query, 5) },
    { name: 'FAO (Agriculture)',  fn: () => searchFAO(query, 5) },
    { name: 'UNODC (Crime)',      fn: () => searchUNODC(query, 5) },
  ];

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
