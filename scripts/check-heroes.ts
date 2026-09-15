import { prisma } from '../lib/db';

async function main() {
  const briefs = await prisma.brief.findMany({
    orderBy: { createdAt: 'desc' },
    take: 15,
    select: { id: true, question: true, createdAt: true, pipelineRunId: true, publishedAt: true, trustScore: true },
  });

  for (const b of briefs) {
    let heroStat = null;
    if (b.pipelineRunId) {
      const run = await prisma.pipelineRun.findUnique({ where: { id: b.pipelineRunId } });
      const steps = run?.steps as any;
      heroStat = steps?.heroImage ?? null;
    }
    console.log({
      id: b.id.slice(-8),
      created: b.createdAt?.toISOString().slice(0, 10),
      published: b.publishedAt ? 'YES' : 'no',
      trust: b.trustScore,
      hero: heroStat,
      q: b.question?.slice(0, 50),
    });
  }

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
