import { prisma } from '../lib/db';
async function main() {
  const j = await prisma.job.findUnique({ where: { id: 'cmucqb4l100007bay7u62onz9' } });
  console.log(j?.status, '| attempts:', j?.attempts, '| lockedUntil:', j?.lockedUntil, '| err:', j?.lastError?.slice(0,150));
  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
