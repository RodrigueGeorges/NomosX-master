import { config } from 'dotenv';
config({ path: '.env.local' });

async function main() {
  const { prisma } = await import('../lib/db');
  const types = await prisma.thinkTankPublication.groupBy({
    by: ["type"],
    _count: true,
  });
  console.log("Publication types in DB:");
  for (const t of types) {
    console.log(`  ${t.type}: ${t._count}`);
  }

  const statuses = await prisma.thinkTankPublication.groupBy({
    by: ["status"],
    _count: true,
  });
  console.log("\nPublication statuses in DB:");
  for (const s of statuses) {
    console.log(`  ${s.status}: ${s._count}`);
  }

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
