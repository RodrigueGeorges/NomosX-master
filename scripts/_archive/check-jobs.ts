import { prisma } from '../lib/db';
(async () => {
  try {
    const jobs = await prisma.job.findMany({
      where: { type: 'THINK_TANK_CYCLE' },
      orderBy: { scheduledFor: 'desc' },
      take: 5,
      select: { id: true, status: true, idempotencyKey: true, attempts: true, scheduledFor: true, finishedAt: true }
    });
    console.log('JOBS:', JSON.stringify(jobs));
  } catch (e: any) {
    console.log('DBERR:', e.message);
  }
  await prisma.$disconnect();
  process.exit(0);
})();
