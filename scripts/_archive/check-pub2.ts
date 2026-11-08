import { prisma } from '../lib/db';
async function main() {
  const pubs = await prisma.thinkTankPublication.findMany({
    orderBy: { createdAt: 'desc' }, take: 3,
    select: { id: true, title: true, status: true, trustScore: true, qualityScore: true, signalId: true, createdAt: true },
  });
  for (const p of pubs) console.log(`${p.createdAt.toISOString()} | ${p.status} | trust=${p.trustScore} q=${p.qualityScore} | ${String(p.title).slice(0,70)}`);
  const signals = await prisma.signal.findMany({ orderBy: { detectedAt: 'desc' }, take: 3, select: { id: true, title: true, status: true } });
  for (const s of signals) console.log(`SIGNAL ${s.status} | ${String(s.title).slice(0,70)}`);
  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
