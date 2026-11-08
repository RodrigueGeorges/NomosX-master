require('dotenv').config({ path: '.env.local' });
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  // Get all HELD publications
  const held = await p.thinkTankPublication.findMany({
    where: { status: 'HELD' },
    select: {
      id: true,
      title: true,
      trustScore: true,
      qualityScore: true,
      citationCoverage: true,
      wordCount: true,
      type: true,
      sourceIds: true,
    },
  });

  console.log(`Found ${held.length} HELD publications`);

  for (const pub of held) {
    const rawQuality = pub.qualityScore ?? 70;
    const coverage = pub.citationCoverage ?? 0;

    // Apply cited quality boost (same logic as extractPipelineScores)
    const citedQualityBoost = coverage >= 0.80 && rawQuality < 75
      ? Math.min(8, Math.round((coverage - 0.80) * 40))
      : 0;
    const adjustedQuality = Math.min(100, rawQuality + citedQualityBoost);

    const oldQ = rawQuality;
    const newQ = adjustedQuality;
    const boost = citedQualityBoost;

    console.log(`\n${pub.title?.slice(0, 60)}`);
    console.log(`  Quality: ${oldQ} → ${newQ} (boost: +${boost})`);
    console.log(`  Coverage: ${Math.round(coverage * 100)}%`);
    console.log(`  Trust: ${pub.trustScore}, Words: ${pub.wordCount}`);

    // Check if it would now pass the STRATEGIC_REPORT gate
    const minQuality = 75;
    const minTrust = 65;
    const minCoverage = 0.50;
    const minWords = 5000;
    const minSources = 15;

    const passes = newQ >= minQuality
      && pub.trustScore >= minTrust
      && coverage >= minCoverage
      && pub.wordCount >= minWords
      && (pub.sourceIds?.length ?? 0) >= minSources;

    console.log(`  Would pass gate: ${passes ? 'YES ✅' : 'NO ❌'}`);

    if (passes) {
      // Update the publication: set status to PUBLISHED and update qualityScore
      await p.thinkTankPublication.update({
        where: { id: pub.id },
        data: {
          qualityScore: newQ,
          status: 'PUBLISHED',
          publishedAt: new Date(),
        },
      });
      console.log(`  → PUBLISHED with qualityScore ${newQ}`);
    } else {
      // Just update the qualityScore
      if (boost > 0) {
        await p.thinkTankPublication.update({
          where: { id: pub.id },
          data: { qualityScore: newQ },
        });
        console.log(`  → Updated qualityScore to ${newQ} (still HELD)`);
      } else {
        console.log(`  → No change (still HELD)`);
      }
    }
  }

  // Show final state
  const all = await p.thinkTankPublication.findMany({
    orderBy: { createdAt: 'desc' },
    take: 15,
    select: { status: true, trustScore: true, qualityScore: true, title: true, publicId: true },
  });
  console.log('\n=== Final state ===');
  all.forEach(x => console.log(`${x.status} | T:${x.trustScore} Q:${x.qualityScore} | ${x.title?.slice(0, 60)}`));

  await p.$disconnect();
}

main().catch(e => { console.error('ERR:', e.message); process.exit(1); });
