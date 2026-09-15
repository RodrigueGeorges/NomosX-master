import { prisma } from '../lib/db';

async function main() {
  const briefs = await prisma.brief.findMany({
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: {
      id: true,
      question: true,
      publishedAt: true,
      trustScore: true,
      qualityScore: true,
      publicId: true,
      kind: true,
      createdAt: true,
    },
  });
  console.log('=== LAST 10 BRIEFS ===');
  for (const b of briefs) {
    console.log({
      id: b.id,
      publicId: b.publicId,
      question: b.question?.slice(0, 80),
      kind: b.kind,
      publishedAt: b.publishedAt,
      trust: b.trustScore,
      quality: b.qualityScore,
      created: b.createdAt,
    });
  }
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
