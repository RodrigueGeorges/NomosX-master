require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  const briefId = 'cmstlgips02q614dksw89513u';
  const brief = await p.brief.findUnique({ where: { id: briefId } });
  if (!brief) { console.log('Brief not found'); return; }

  // Extract title from HTML h1, strip sup tags (and their content), citations, etc.
  const titleMatch = brief.html.match(/<h1[^>]*>(.*?)<\/h1>/s);
  let title = titleMatch
    ? titleMatch[1]
        .replace(/<sup[^>]*>.*?<\/sup>/gs, '')  // Remove sup tags AND their content
        .replace(/<[^>]+>/g, '')
        .replace(/\[SRC-\d+\]/g, '')
        .replace(/\[E\d+\]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
    : 'Strategic Report';
  console.log('Title:', title);

  // Count words from HTML (strip tags)
  const textContent = brief.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const wordCount = textContent ? textContent.split(' ').filter(Boolean).length : 0;
  console.log('Word count:', wordCount);
  console.log('HTML size:', (brief.html.length / 1024).toFixed(0), 'KB');

  // Find vertical
  const vertical = await p.vertical.findFirst({ orderBy: { createdAt: 'asc' } });

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
        qualityScore: 75,
        wordCount: wordCount,
        sourceIds: typeof brief.sources === 'string' ? JSON.parse(brief.sources) : brief.sources,
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
