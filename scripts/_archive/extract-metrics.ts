import { prisma } from '../lib/db';

async function main() {
  const briefId = process.argv[2] || 'cmtyem5j1011m13mpb400c2sz';
  const brief = await prisma.brief.findUnique({
    where: { id: briefId },
    select: { pipelineRunId: true, html: true },
  });
  if (!brief) {
    console.log('Brief not found');
    process.exit(1);
  }

  // Check hero-image in HTML
  const idx = brief.html.indexOf('hero-image');
  if (idx >= 0) {
    const ctx = brief.html.slice(Math.max(0, idx - 50), idx + 300);
    const hasFigure = ctx.includes('<figure');
    const hasImg = ctx.includes('<img');
    console.log('hero-image found in HTML. hasFigure:', hasFigure, 'hasImg:', hasImg);
    console.log('context:', ctx.slice(0, 200));
  } else {
    console.log('No hero-image in HTML');
  }

  // Check pipeline run stats
  if (brief.pipelineRunId) {
    const run = await prisma.pipelineRun.findUnique({ where: { id: brief.pipelineRunId } });
    const steps = brief.html ? (run?.steps as any) : null;
    if (steps) {
      console.log('\nheroImage stats:', JSON.stringify(steps.heroImage, null, 2));
    }
  }

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
