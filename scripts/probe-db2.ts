import { prisma } from '../lib/db';
async function main() {
  const job = await prisma.job.findFirst({
    where: { status: 'PENDING', scheduledFor: { lte: new Date() }, movedToDeadLetter: false },
    orderBy: [{ priority: 'desc' }, { scheduledFor: 'asc' }],
  });
  console.log('findFirst OK:', job?.id ?? 'none');
  const pub = await prisma.thinkTankPublication.findFirst({ where: { status: 'READY' } });
  console.log('READY pubs:', pub?.id ?? 'none');
  await prisma.$disconnect();
}
main().catch(e => { console.error('ERR', e.code, e.message.slice(0,200)); process.exit(1); });
