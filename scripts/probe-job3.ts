import { prisma } from '../lib/db';
async function main() {
  const j = await prisma.job.findUnique({ where: { id: 'cmupv6jsz00007mo9qpyb7kci' } });
  console.log('STATUS:', j?.status, '| finished:', j?.finishedAt, '| lastError:', (j?.lastError ?? '').slice(0,200));
  console.log('RESULT:', JSON.stringify(j?.result).slice(0, 1500));
  await prisma.$disconnect();
}
main().catch(e => { console.error('ERR', e.message.slice(0,300)); process.exit(1); });
