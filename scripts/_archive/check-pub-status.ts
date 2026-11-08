import { config } from 'dotenv';
config({ path: '.env.local' });
import { prisma } from '../lib/db';

(async () => {
  const pub = await prisma.thinkTankPublication.findFirst({
    orderBy: { createdAt: 'desc' },
    select: { id: true, publicId: true, title: true, status: true, publishedAt: true, trustScore: true, qualityScore: true, wordCount: true, citationCoverage: true, sourceIds: true },
  });
  console.log(JSON.stringify(pub, null, 2));
  await prisma.$disconnect();
})();
