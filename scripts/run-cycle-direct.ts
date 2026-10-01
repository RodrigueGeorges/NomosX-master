/** Direct think-tank cycle against prod DB — bypasses the Job queue so the
 * local (latest) code exercises the full reserve flow end-to-end. */
import { runThinkTankCycle } from '../lib/agent/think-tank-dispatcher';
import { prisma } from '../lib/db';

async function main() {
  const result = await runThinkTankCycle({
    mode: 'breaking',
    maxPublications: 1,
    budgetUsd: 3,
    onProgress: (p) => {
      console.log(`[CYCLE] progress items=${p.items.length} done=${p.doneKeys.length} counts=${JSON.stringify(p.counts)}`);
    },
  });
  console.log('CYCLE RESULT:', JSON.stringify({
    success: result.success, collected: result.collected, published: result.published,
    held: result.held, skipped: result.skipped, failed: result.failed,
    totalCostUsd: result.totalCostUsd, durationMs: result.durationMs,
    topics: result.topics, errors: result.errors.slice(0, 5),
  }, null, 2));
  await prisma.$disconnect();
}
main().catch(e => { console.error('CYCLE FATAL:', e); process.exit(1); });
