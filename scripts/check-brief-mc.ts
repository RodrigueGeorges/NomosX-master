import { prisma } from '../lib/db';
async function main() {
  const brief = await prisma.brief.findUnique({ where: { id: 'cmucsbwwa012l7ba6kk4zrpau' } });
  const lineage = brief?.lineage as any;
  const pos = lineage?.institutePosition;
  console.log('SCENARIOS:');
  for (const s of pos?.scenarios ?? []) {
    console.log(`  ${s.name}: prob=${s.probability} empirical=${s.empiricalProbability?.toFixed?.(3)} central=${s.isCentral ?? '-'}`);
  }
  console.log('CENTRAL:', JSON.stringify(lineage?.centralScenario ?? pos?.centralScenario)?.slice(0, 400));
  console.log('TRUST:', brief?.trustScore, '| status:', brief?.status);
  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
