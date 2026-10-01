import { prisma } from '../lib/db';
async function main() {
  const j = await prisma.job.findUnique({ where: { id: 'cmupv6jsz00007mo9qpyb7kci' } });
  const res = j?.result as any;
  console.log('STATUS:', j?.status, '| progress items:', res?.items?.length ?? 0, 'doneKeys:', res?.doneKeys?.length ?? 0);
  console.log('counts:', JSON.stringify(res?.counts ?? {}));
  const pubs = await prisma.thinkTankPublication.findMany({
    orderBy: { createdAt: 'desc' }, take: 3,
    select: { id: true, status: true, createdAt: true, trustScore: true },
  });
  console.log('RECENT PUBS:', JSON.stringify(pubs));
  await prisma.$disconnect();
}
main().catch(e => { console.error('ERR', e.code, e.message.slice(0,300)); process.exit(1); });
