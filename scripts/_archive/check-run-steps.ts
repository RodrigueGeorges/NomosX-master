import { prisma } from '../lib/db';
async function main() {
  const run = await prisma.pipelineRun.findUnique({ where: { id: 'cmuqlow9m0002rfzgvuwwy7yn' } });
  const steps = (run?.steps as any) ?? {};
  console.log('step keys:', Object.keys(steps).join(','));
  console.log('trustScore:', steps.trustScore, '| qualityScore:', steps.qualityScore);
  console.log('publisher:', JSON.stringify(steps.publisher)?.slice(0, 300));
  console.log('qualityLoop:', JSON.stringify({ trust: steps.qualityLoop?.finalTrust, quality: steps.qualityLoop?.finalQuality })?.slice(0, 300));
  const brief = await prisma.brief.findFirst({ where: { pipelineRunId: run!.id }, select: { id: true, lineage: true, sources: true, html: true } });
  console.log('brief found:', !!brief, 'sources:', (brief?.sources as any[])?.length, 'lineage keys:', Object.keys((brief?.lineage as any) ?? {}).join(','));
  console.log('html len:', brief?.html?.length);
  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
