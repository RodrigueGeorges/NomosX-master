import { claimNextJob } from '../lib/worker/durable-worker';
async function main() {
  const j = await claimNextJob('probe-worker');
  console.log('claimNextJob OK:', j ? `${j.type} ${j.id}` : 'no claimable job');
  const { prisma } = await import('../lib/db');
  await prisma.$disconnect();
}
main().catch(e => { console.error('ERR', e.code ?? '', e.message.slice(0,400)); process.exit(1); });
