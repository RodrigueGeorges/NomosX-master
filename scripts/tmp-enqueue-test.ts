import 'dotenv/config';
import { enqueueThinkTankCycle } from '../lib/worker/think-tank-queue';
import { prisma } from '../lib/db';
(async () => {
  const r = await enqueueThinkTankCycle({ mode: 'breaking', maxPublications: 1, idempotencyKey: `test:freepool:e2e:${Date.now()}` });
  console.log(r);
  await prisma.$disconnect();
})();
