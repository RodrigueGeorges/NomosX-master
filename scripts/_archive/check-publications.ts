import { prisma } from '../lib/db';

async function main() {
  const pubs = await prisma.thinkTankPublication.findMany({
    where: { publishedAt: { gt: new Date('2026-03-15T20:00:00Z') } },
    orderBy: { publishedAt: 'asc' },
    select: {
      id: true, title: true, type: true, trustScore: true,
      qualityScore: true, wordCount: true, html: true,
      citationCoverage: true, sourceIds: true, claimCount: true,
    },
  });

  for (const p of pubs) {
    console.log('\n' + '='.repeat(80));
    console.log('TITLE:', p.title);
    console.log(`Type: ${p.type} | Trust: ${p.trustScore} | Quality: ${p.qualityScore} | Words: ${p.wordCount} | Sources: ${(p.sourceIds as any[])?.length ?? 0} | Claims: ${p.claimCount}`);
    console.log('='.repeat(80));
    const text = (p.html || '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&#039;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/\s+/g, ' ')
      .trim();
    console.log(text.substring(0, 5000));
    console.log('\n--- END ---\n');
  }

  await prisma.$disconnect();
}

main().catch(console.error);
