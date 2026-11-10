const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const runs = await p.pipelineRun.findMany({
    where: { sourcesFound: 0, status: 'COMPLETED' },
    orderBy: { startedAt: 'desc' }, take: 5,
    select: { id: true, question: true, sourcesRanked: true, sourcesUsed: true, briefs: { select: { sources: true }, take: 1 } }
  });
  for (const r of runs) console.log(`run ${r.id.slice(-8)} ranked=${r.sourcesRanked} used=${r.sourcesUsed} briefSrcs=${r.briefs[0]?.sources?.length ?? 'none'} | ${(r.question||'').slice(0,60)}`);
  await p.$disconnect();
})().catch(e => { console.error(e.message); process.exit(1); });
