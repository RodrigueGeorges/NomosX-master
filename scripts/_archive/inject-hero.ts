import { prisma } from '../lib/db';
import { generateHeroImage } from '../lib/agent/hero-image';

async function main() {
  const briefId = process.argv[2];
  if (!briefId) {
    console.error('Usage: node --import tsx scripts/inject-hero.ts <briefId>');
    process.exit(1);
  }

  const brief = await prisma.brief.findUnique({ where: { id: briefId } });
  if (!brief) {
    console.error('Brief not found');
    process.exit(1);
  }

  // Get collision from lineage
  const lineage = typeof brief.lineage === 'string' ? JSON.parse(brief.lineage) : brief.lineage;
  const collision = lineage?.casting?.collisionSummary || '';
  const domain = lineage?.topicClassification?.primaryDomain || 'economics';

  console.log('Generating hero image for:', brief.question?.slice(0, 60));
  console.log('Collision:', collision?.slice(0, 80));

  const heroResult = await generateHeroImage(
    brief.question || 'Untitled',
    collision,
    domain,
    { publicationType: 'STRATEGIC_REPORT' },
  );

  if (!heroResult) {
    console.error('Hero image generation returned null');
    process.exit(1);
  }

  console.log('Hero image generated:', heroResult.prompt, 'cost:', heroResult.costUsd);

  // Build hero HTML
  const heroHtml = `<figure class="hero-image" style="margin:0 0 32px 0;width:100%;overflow:hidden;border:1px solid rgba(240,240,250,0.08);border-radius:4px;">
    <img src="${heroResult.url}" alt="${(brief.question || '').replace(/"/g, '"')}" style="width:100%;height:auto;display:block;object-fit:cover;" />
  </figure>`;

  let html = brief.html;

  // Try to inject after brief-meta or report-meta
  if (html.includes('class="brief-meta"')) {
    html = html.replace(/(class="brief-meta"[^>]*>[\s\S]*?<\/div>)/, `$1\n${heroHtml}`);
    console.log('Injected after brief-meta');
  } else if (html.includes('class="report-meta"')) {
    html = html.replace(/(class="report-meta"[^>]*>[\s\S]*?<\/div>)/, `$1\n${heroHtml}`);
    console.log('Injected after report-meta');
  } else if (html.includes('<article')) {
    html = html.replace(/(<article[^>]*>)/, `$1\n${heroHtml}`);
    console.log('Injected after <article>');
  } else if (html.includes('<div class="nomosx-brief"')) {
    html = html.replace(/(<div class="nomosx-brief[^"]*">)/, `$1\n${heroHtml}`);
    console.log('Injected after nomosx-brief div');
  } else {
    html = heroHtml + html;
    console.log('Prepended to HTML');
  }

  await prisma.brief.update({
    where: { id: briefId },
    data: { html },
  });

  console.log('✅ Hero image injected and saved');
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
