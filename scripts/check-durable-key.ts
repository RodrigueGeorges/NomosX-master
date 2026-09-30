import { prisma } from '../lib/db';
(async () => {
  const logs = await prisma.agentAuditLog.findMany({
    where: { resource: 'durable:memo:trend-break-publication-volume' },
    orderBy: { timestamp: 'desc' },
    take: 8,
    select: { action: true, metadata: true, timestamp: true },
  });
  console.log(JSON.stringify(logs, null, 1).slice(0, 3000));
  await prisma.$disconnect(); process.exit(0);
})();
