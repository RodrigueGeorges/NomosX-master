/**
 * Test for the 8 new domain-specific providers.
 * S2-backed providers run sequentially with 3s gaps to avoid shared rate limit.
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

const query = process.argv[2] || 'climate change policy';

async function main() {
  console.log(`\nDomain Providers Test — query: "${query}"\n`);

  const { searchPsychology } = await import('../lib/providers/psychology');
  const { searchSociology } = await import('../lib/providers/sociology');
  const { searchHistory } = await import('../lib/providers/history');
  const { searchGeography } = await import('../lib/providers/geography');
  const { searchChemistry } = await import('../lib/providers/chemistry');
  const { searchBiology } = await import('../lib/providers/biology');
  const { searchPoliticalScience } = await import('../lib/providers/political-science');
  const { searchBusiness } = await import('../lib/providers/business');

  // All S2-backed — sequential with 3s gaps
  const sequential = [
    { name: 'Psychology',       fn: () => searchPsychology(query, 5) },
    { name: 'Sociology',        fn: () => searchSociology(query, 5) },
    { name: 'History',          fn: () => searchHistory(query, 5) },
    { name: 'Geography',        fn: () => searchGeography(query, 5) },
    { name: 'Chemistry',        fn: () => searchChemistry(query, 5) },
    { name: 'Biology',          fn: () => searchBiology(query, 5) },
    { name: 'Political Science',fn: () => searchPoliticalScience(query, 5) },
    { name: 'Business',         fn: () => searchBusiness(query, 5) },
  ];

  const results: PromiseSettledResult<{ name: string; count: number; ms: number; sample: any }>[] = [];
  for (const t of sequential) {
    const start = Date.now();
    try {
      const docs = await t.fn();
      results.push({ status: 'fulfilled', value: { name: t.name, count: docs.length, ms: Date.now() - start, sample: docs[0] } });
    } catch (e: any) {
      results.push({ status: 'rejected', reason: e });
    }
    await new Promise(r => setTimeout(r, 3000));
  }

  console.log('\n| Provider | Status | Count | Duration | Sample title |');
  console.log('|----------|--------|-------|----------|--------------|');
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      const { name, count, ms, sample } = r.value;
      const title = sample?.title?.slice(0, 50) || '(no results)';
      const status = count > 0 ? '✅ ok' : '⚠️  empty';
      console.log(`| ${name.padEnd(20)} | ${status} | ${count} | ${ms}ms | ${title} |`);
    } else {
      console.log(`| ${sequential[i].name.padEnd(20)} | ❌ error | 0 | - | ${(r.reason as any)?.message} |`);
    }
  });
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
