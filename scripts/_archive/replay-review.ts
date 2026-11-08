import { prisma } from '../lib/db';
import { buildAnalysisReviewText } from '../lib/agent/analysis-review-text';
import { buildSectionInventory } from '../lib/agent/structural-editor';

async function main() {
  const held = await prisma.thinkTankPublication.findMany({
    where: { status: 'HELD' },
    orderBy: { createdAt: 'desc' },
    take: 2,
    select: { id: true, title: true, criticalLoopResult: true },
  });
  for (const p of held) {
    const stats = ((p.criticalLoopResult as any)?.stats ?? p.criticalLoopResult ?? {}) as any;
    const analysis = stats.analysis ?? stats.analystOutput ?? stats.draftAnalysis ?? stats.finalAnalysis;
    if (!analysis) {
      console.log(`${p.id}: no persisted analysis (keys: ${Object.keys(stats).slice(0, 25).join(',')})`);
      continue;
    }
    const review = buildAnalysisReviewText(analysis, 'Q');
    const inv = buildSectionInventory(analysis);
    console.log(`\n=== ${p.id} "${String(p.title).slice(0, 60)}" ===`);
    console.log(`reviewText: ${review.length} chars | sections: ${review.split('---').length}`);
    console.log(`inventory: ${inv.length} chars | blocks: ${inv.split('──').length - 1}`);
    console.log(`review head: ${review.slice(0, 300).replace(/\n/g, ' | ')}`);
  }
  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
