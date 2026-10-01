import { prisma } from '../lib/db';
async function main() {
  const j = await prisma.job.findUnique({ where: { id: process.argv[2] ?? 'cmupv6jsz00007mo9qpyb7kci' } });
  console.log('JOB:', j?.status, 'attempts', j?.attempts, 'reclaims', j?.reclaims, 'lockedBy', j?.lockedBy, 'lastError', (j?.lastError ?? '').slice(0,120));
  await prisma.$disconnect();
}
main().catch(e => { console.error('ERR', e.message.slice(0,200)); process.exit(1); });
