require('dotenv').config({ path: '.env.local' });
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  const count = await p.thinkTankPublication.count();
  console.log('Total publications:', count);

  const pubs = await p.thinkTankPublication.findMany({
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: {
      id: true,
      title: true,
      status: true,
      trustScore: true,
      qualityScore: true,
      citationCoverage: true,
      wordCount: true,
      type: true,
      publicId: true,
      publishedAt: true,
    },
  });

  pubs.forEach(x => {
    console.log(`${x.status} | T:${x.trustScore} Q:${x.qualityScore} C:${x.citationCoverage} W:${x.wordCount} | ${x.type} | ${x.publicId || 'no-public-id'} | ${x.title?.slice(0, 60)}`);
  });

  await p.$disconnect();
}

main().catch(e => { console.error('ERR:', e.message); process.exit(1); });
