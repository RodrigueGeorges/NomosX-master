require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  const brief = await p.brief.findUnique({ where: { id: 'cmstjkkkw0399295t0h11n64h' } });
  if (!brief) { console.log('Brief not found'); return; }

  // Extract title from HTML (strip citations)
  const titleMatch = brief.html.match(/<h1[^>]*>(.*?)<\/h1>/s);
  let title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').replace(/\[SRC-\d+\]/g, '').trim() : 'Strategic Report';
  console.log('Title:', title);

  // Count words from HTML (strip tags first)
  const textContent = brief.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const wordCount = textContent ? textContent.split(' ').filter(Boolean).length : 0;
  console.log('Word count:', wordCount);

  // Find vertical
  let vertical = await p.vertical.findFirst({ orderBy: { createdAt: 'asc' } });

  // Check if publication already exists
  const existing = await p.thinkTankPublication.findFirst({
    where: { publicId: brief.id }
  });

  if (existing) {
    console.log('Publication already exists, updating...');
    await p.thinkTankPublication.update({
      where: { id: existing.id },
      data: {
        title: title,
        html: brief.html,
        publishedAt: new Date(),
        status: 'PUBLISHED',
        trustScore: brief.trustScore,
        qualityScore: brief.qualityScore,
        wordCount: wordCount,
        type: 'STRATEGIC_REPORT',
      }
    });
    console.log('Updated');
  } else {
    const pub = await p.thinkTankPublication.create({
      data: {
        verticalId: vertical.id,
        title: title,
        html: brief.html,
        type: 'STRATEGIC_REPORT',
        status: 'PUBLISHED',
        publicId: brief.id,
        publishedAt: new Date(),
        trustScore: brief.trustScore,
        qualityScore: brief.qualityScore,
        wordCount: wordCount,
        sourceIds: typeof brief.sources === 'string' ? JSON.parse(brief.sources) : brief.sources,
        criticalLoopResult: { briefId: brief.id },
        citationCoverage: 0.85,
      }
    });
    console.log('Created publication:', pub.id);
  }

  // Also update the brief
  await p.brief.update({
    where: { id: brief.id },
    data: { publicId: brief.id, publishedAt: new Date() }
  });

  console.log('URL: http://localhost:3000/inquiry/' + brief.id);
}

main().catch(e => console.error('Error:', e.message)).finally(() => p.$disconnect());
