import { prisma } from '../lib/db';
async function main() {
  const cols = await prisma.$queryRawUnsafe<{column_name:string}[]>(
    "SELECT column_name FROM information_schema.columns WHERE table_name='Job' ORDER BY ordinal_position");
  console.log('JOB COLS:', cols.map(c=>c.column_name).join(','));
  const db = await prisma.$queryRawUnsafe<{current_database:string}[]>("SELECT current_database()");
  console.log('DB:', db[0].current_database);
  await prisma.$disconnect();
}
main().catch(e => { console.error('ERR', e.message); process.exit(1); });
