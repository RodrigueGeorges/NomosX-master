/**
 * screen-entity.ts — OpenSanctions diligence check for one entity.
 * Usage: npx tsx scripts/screen-entity.ts "Roman Abramovich" [--person|--company] [--country RU]
 * Costs ~1 OpenSanctions credit per call — run deliberately.
 */
import { config } from 'dotenv';
config({ path: '.env.local', override: true });

async function main() {
  const args = process.argv.slice(2);
  const name = args.find(a => !a.startsWith('--'));
  if (!name) { console.error('usage: screen-entity.ts "<name>" [--person|--company] [--country XX]'); process.exit(1); }
  const schema = args.includes('--person') ? 'Person' : args.includes('--company') ? 'Company' : undefined;
  const ci = args.indexOf('--country');
  const country = ci >= 0 ? args[ci + 1] : undefined;
  const mod = await import('../lib/providers/stats-keys');
  const res = await mod.matchOpenSanctions(name, { schema, country });
  if (!res.length) { console.log('No candidates.'); return; }
  for (const r of res) {
    const flag = r.match ? 'MATCH' : '    ';
    console.log(`${flag} score=${r.score.toFixed(2)} ${r.caption} (${r.schema})`);
    console.log(`      id=${r.id} lists=${r.datasets.slice(0, 5).join(', ')}`);
  }
}
main().catch(e => { console.error(e); process.exit(1); });
