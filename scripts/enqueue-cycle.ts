import { enqueueThinkTankCycle } from '../lib/worker/think-tank-queue';
import { prisma } from '../lib/db';
(async () => {
  const r = await enqueueThinkTankCycle({
    mode: 'breaking',
    maxPublications: 1,
    idempotencyKey: 'thinktank:manual:' + Date.now(),
  });
  console.log('ENQUEUE:', JSON.stringify(r));
  await prisma.$disconnect();
  process.exit(0);
})();
