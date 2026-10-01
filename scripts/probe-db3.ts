import { prisma } from '../lib/db';
async function main() {
  const db = await prisma.$queryRawUnsafe<{current_database:string}[]>("SELECT current_database(), inet_server_addr()");
  console.log('DB:', JSON.stringify(db[0]));
  await prisma.$disconnect();
}
main().catch(e => { console.error('ERR', e.code ?? '', e.message.slice(0,300)); process.exit(1); });
