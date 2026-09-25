import { prisma } from '../lib/db';
async function main() {
  for (const bid of ['cmucsbwwa012l7ba6kk4zrpau', 'cmucukpc702zl7ba6767arbo5']) {
    const brief = await prisma.brief.findUnique({ where: { id: bid } });
    const ids = (brief?.sources as string[]) ?? [];
    const found = await prisma.source.findMany({ where: { id: { in: ids } }, select: { id: true } });
    const foundSet = new Set(found.map(f => f.id));
    const missing = ids.filter(i => !foundSet.has(i));
    console.log(`${bid}: ${ids.length} ids, ${found.length} in DB, ${missing.length} missing`);
    if (missing.length) console.log('  missing:', missing.slice(0, 8));
  }
  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
