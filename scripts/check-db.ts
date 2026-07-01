import { config } from 'dotenv';
config({ path: '.env.local' });

async function main() {
  const { prisma } = await import('../lib/db');
  const v = await prisma.vertical.findFirst({
    where: { isActive: true },
    select: { id: true, slug: true, name: true },
  });
  console.log('Active vertical:', JSON.stringify(v));
  const count = await prisma.vertical.count({ where: { isActive: true } });
  console.log('Total active verticals:', count);

  // Check recent publications
  const pubs = await prisma.thinkTankPublication.count();
  console.log('Total publications:', pubs);

  // Check signals
  const signals = await prisma.signal.count({ where: { status: 'NEW' } });
  console.log('NEW signals:', signals);

  await prisma.$disconnect();
}
main().catch(console.error);
