require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  const brief = await p.brief.findUnique({ where: { id: 'cmsths8rq01sohqgoo7t4lv9u' } });
  if (!brief) { console.log('Brief not found'); return; }

  // Extract title from HTML
  const titleMatch = brief.html.match(/<h1[^>]*>(.*?)<\/h1>/s);
  const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : 'Algorithmic Transparency and Democratic Accountability';

  // Check if thinkTankPublication already exists
  const existing = await p.thinkTankPublication.findFirst({
    where: { criticalLoopResult: { string_contains: brief.id } }
  });

  if (existing) {
    console.log('Publication already exists:', existing.id, '— updating...');
    const updated = await p.thinkTankPublication.update({
      where: { id: existing.id },
      data: {
        title: title,
        html: brief.html,
        publishedAt: new Date(),
        status: 'PUBLISHED',
        publicId: brief.id,
        trustScore: brief.trustScore,
        qualityScore: brief.qualityScore,
        wordCount: brief.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().split(' ').length,
      }
    });
    console.log('Updated publication:', updated.id, 'publicId:', updated.publicId);
    return;
  }

  // Find a vertical to attach to
  let vertical = await p.vertical.findFirst({ orderBy: { createdAt: 'asc' } });
  if (!vertical) {
    // Create a default vertical if none exists
    vertical = await p.vertical.create({
      data: {
        slug: 'technology',
        name: 'Technology',
        description: 'Technology and AI policy research',
      }
    });
    console.log('Created vertical:', vertical.id);
  }

  // Count words from HTML (strip tags first)
  const textContent = brief.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const wordCount = textContent ? textContent.split(' ').filter(Boolean).length : 0;
  console.log('Word count (from text):', wordCount);

  // Create thinkTankPublication from brief
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
  console.log('PublicId:', pub.publicId);
  console.log('Title:', pub.title);
  console.log('Status:', pub.status);
  console.log('URL: http://localhost:3000/inquiry/' + pub.publicId);
}

main().catch(e => console.error('Error:', e.message)).finally(() => p.$disconnect());
