import { enqueueThinkTankCycle } from '../lib/worker/think-tank-queue';
import { prisma } from '../lib/db';

async function main() {
  const key = `thinktank:test:${Date.now()}`;
  const r = await enqueueThinkTankCycle({ mode: 'breaking', idempotencyKey: key });
  console.log('ENQUEUE:', JSON.stringify(r));
  const job = await prisma.job.findUnique({ where: { id: r.jobId } });
  console.log('JOB ROW:', job?.status, job?.type, job?.idempotencyKey);
  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
