import { prisma } from '../lib/db';
(async () => {
  const runs = await prisma.pipelineRun.findMany({
    where: { status: 'FAILED', format: 'memo' },
    orderBy: { startedAt: 'desc' },
    take: 3,
    select: { id: true, question: true, error: true, steps: true, startedAt: true, durationMs: true },
  });
  for (const r of runs) {
    console.log('RUN', r.id, '| q:', JSON.stringify(r.question)?.slice(0, 120), '| err:', JSON.stringify(r.error)?.slice(0, 200), '| steps:', JSON.stringify(r.steps)?.slice(0, 300));
  }
  await prisma.$disconnect(); process.exit(0);
})();
