/**
 * Full funnel with radar — mode "breaking":
 *   runTopicRadar → editorialTriage → preflightSourceCheck → runAndPublishInquiry
 * The system detects live topics itself, triages, pre-flights evidence, then runs
 * the full pipeline. Run: node --import tsx scripts/test-radar-cycle.ts
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

process.on('unhandledRejection', (reason) => {
  console.warn('[unhandledRejection] (non-fatal):', reason);
});

async function main() {
  const { runThinkTankCycle } = await import('../lib/agent/think-tank-dispatcher');
  const t0 = Date.now();
  const result = await runThinkTankCycle({
    mode: 'breaking',
    maxPublications: 1,
    bypassCadence: true,
  });
  console.log('\n╔═══ RADAR CYCLE RESULT ═══╗');
  console.log(JSON.stringify(result, null, 2).slice(0, 6000));
  console.log(`Duration: ${((Date.now() - t0) / 60000).toFixed(1)} min`);
  process.exit(0);
}
main().catch(e => { console.error('FATAL:', e); process.exit(1); });
