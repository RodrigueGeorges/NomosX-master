/**
 * Autonomous ThinkTank cycle test — the platform picks topic + format itself
 * via planEditorialAgenda → runAndPublishInquiry (real pipeline, real publish).
 *
 * Run: node --import tsx scripts/test-auto-cycle.ts
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
    mode: 'weekly',
    maxPublications: 1,
    bypassCadence: true, // ignore weekly slot limit for the test
  });
  console.log('\n╔═══ AUTO CYCLE RESULT ═══╗');
  console.log(JSON.stringify(result, null, 2).slice(0, 4000));
  console.log(`Duration: ${((Date.now() - t0) / 60000).toFixed(1)} min`);
  process.exit(0);
}
main().catch(e => { console.error('FATAL:', e); process.exit(1); });
