import { config } from 'dotenv';
config({ path: '.env.local' });
import { prisma } from '../lib/db';

(async () => {
  const total = await prisma.prediction.count();
  console.log('Total predictions:', total);
  const byStatus = await prisma.prediction.groupBy({ by: ['status'], _count: true });
  console.log('By status:', JSON.stringify(byStatus, null, 2));
  const recent = await prisma.prediction.findMany({
    take: 5,
    orderBy: { createdAt: 'desc' },
    select: { id: true, claim: true, horizon: true, probability: true, status: true, createdAt: true },
  });
  console.log('Recent 5:', JSON.stringify(recent, null, 2));
  await prisma.$disconnect();
})().catch(e => console.error(e));
