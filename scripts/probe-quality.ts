import { prisma } from '../lib/db';
async function main() {
  const checks = await prisma.thinkTankQualityCheck.findMany({
    where: { publicationId: 'cmupxw98k042hfnh8eajmq5qy' },
    orderBy: { createdAt: 'asc' },
  });
  for (const c of checks) console.log(JSON.stringify(c).slice(0, 400));
}
main().finally(() => prisma.$disconnect());
