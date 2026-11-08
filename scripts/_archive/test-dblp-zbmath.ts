/**
 * Quick test for DBLP and zbMATH providers
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

const query = process.argv[2] || 'transformer neural network';

async function main() {
  console.log(`\nDBLP + zbMATH Test — query: "${query}"\n`);

  const { searchDBLP } = await import('../lib/providers/dblp');
  const { searchZbMath } = await import('../lib/providers/zbmath');

  // DBLP first (independent API)
  const start1 = Date.now();
  try {
    const docs = await searchDBLP(query, 5);
    const ms = Date.now() - start1;
    const status = docs.length > 0 ? '✅ ok' : '⚠️  empty';
    const title = docs[0]?.title?.slice(0, 60) || '(no results)';
    console.log(`| DBLP | ${status} | ${docs.length} | ${ms}ms | ${title} |`);
  } catch (e: any) {
    console.log(`| DBLP | ❌ error | 0 | - | ${e.message} |`);
  }

  await new Promise(r => setTimeout(r, 3000));

  // zbMATH (may fall through to S2/OpenAlex)
  const start2 = Date.now();
  try {
    const docs = await searchZbMath(query, 5);
    const ms = Date.now() - start2;
    const status = docs.length > 0 ? '✅ ok' : '⚠️  empty';
    const title = docs[0]?.title?.slice(0, 60) || '(no results)';
    console.log(`| zbMATH | ${status} | ${docs.length} | ${ms}ms | ${title} |`);
  } catch (e: any) {
    console.log(`| zbMATH | ❌ error | 0 | - | ${e.message} |`);
  }
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
