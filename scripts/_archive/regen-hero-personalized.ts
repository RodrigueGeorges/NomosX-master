/**
 * Regenerate the hero image with PERSONALIZED context from the article.
 * Extracts throughLine, keyFindings, summary, section titles from the analysis
 * (via DB) or from the HTML, then calls the new generateHeroImage with context.
 *
 * Usage:
 *   node --import tsx scripts/regen-hero-personalized.ts <publicationId>
 *   node --import tsx scripts/regen-hero-personalized.ts  (uses latest publication)
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import fs from 'fs';
import { prisma } from '../lib/db';
import { generateHeroImage } from '../lib/agent/hero-image';

async function main() {
  const publicationId = process.argv[2];
  let pub: any;

  if (publicationId) {
    pub = await prisma.thinkTankPublication.findUnique({ where: { id: publicationId } });
  } else {
    pub = await prisma.thinkTankPublication.findFirst({
      orderBy: { createdAt: 'desc' },
    });
  }

  if (!pub) {
    console.error('No publication found');
    process.exit(1);
  }

  console.log(`Publication: ${pub.id}`);
  console.log(`Title: ${pub.title || '(no title)'}`);
  console.log(`HTML length: ${pub.html?.length || 0}`);

  const html = pub.html || '';
  const title = pub.title || 'Untitled';

  // Extract section titles from HTML
  const sectionTitles: string[] = [];
  const re = /<h[23][^>]*>([^<]+)<\/h[23]>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const t = m[1].replace(/&amp;/g, '&').replace(/&quot;/g, '"').trim();
    if (t && t.length > 2 && t.length < 120) sectionTitles.push(t);
  }

  // Try to get analysis from the brief
  let throughLine: string | undefined;
  let keyFindings: string[] | undefined;
  let summary: string | undefined;

  if (pub.briefId) {
    const brief: any = await prisma.brief.findUnique({
      where: { id: pub.briefId },
      select: { analysis: true, summary: true },
    });
    if (brief) {
      summary = brief.summary || undefined;
      const analysis = typeof brief.analysis === 'string' ? JSON.parse(brief.analysis) : brief.analysis;
      throughLine = analysis?.throughLine || analysis?.consensus || undefined;
      keyFindings = analysis?.keyFindings || undefined;
    }
  }

  // Fallback: extract a "summary" from the first <p> in the HTML
  if (!summary && !throughLine) {
    const pMatch = html.match(/<p[^>]*>([^<]{50,500})<\/p>/);
    if (pMatch) summary = pMatch[1].replace(/<[^>]+>/g, '').trim();
  }

  console.log(`\nArticle context:`);
  console.log(`  throughLine: ${throughLine?.slice(0, 100) || '(none)'}`);
  console.log(`  keyFindings: ${keyFindings?.length || 0} findings`);
  if (keyFindings?.length) keyFindings.slice(0, 3).forEach((f, i) => console.log(`    ${i + 1}. ${f.slice(0, 100)}`));
  console.log(`  summary: ${summary?.slice(0, 100) || '(none)'}`);
  console.log(`  sections: ${sectionTitles.length} titles`);
  sectionTitles.slice(0, 5).forEach(s => console.log(`    - ${s}`));

  const domain = pub.domain || 'technology';
  const collision = pub.collision || domain;
  const publicationType = pub.type || pub.publicationType || 'ARTICLE';

  console.log(`\nGenerating personalized hero image (format: ${publicationType})...`);
  const result = await generateHeroImage(title, collision, domain, {
    throughLine,
    keyFindings,
    summary,
    sectionTitles,
    publicationType,
  });

  if (!result) {
    console.error('Image generation failed');
    process.exit(1);
  }

  console.log(`\n✅ Hero image generated`);
  console.log(`  cost: $${result.costUsd.toFixed(4)}`);
  console.log(`  url length: ${result.url.length}`);
  console.log(`  prompt length: ${result.prompt.length}`);

  // Save the image data
  if (result.url.startsWith('data:image/png;base64,')) {
    const b64 = result.url.split(',')[1];
    const buf = Buffer.from(b64, 'base64');
    fs.writeFileSync('scripts/hero-image-personalized.png', buf);
    console.log(`  PNG saved: scripts/hero-image-personalized.png (${(buf.length / 1024).toFixed(0)}KB)`);

    // Update the HTML to reference the new image
    let newHtml = html;
    // Replace existing hero image (either data: URL or file reference)
    newHtml = newHtml.replace(
      /(<figure class="hero-image"[^>]*>\s*<img src=")([^"]+)("[^>]*\/>\s*<\/figure>)/,
      `$1scripts/hero-image-personalized.png$3`,
    );
    // Fix path for serving
    newHtml = newHtml.replace('src="scripts/hero-image-personalized.png"', 'src="hero-image-personalized.png"');

    fs.writeFileSync('scripts/output-funnel.html', newHtml, 'utf-8');
    console.log(`  HTML updated: scripts/output-funnel.html (${newHtml.length} chars)`);

    // Also update the publication in DB
    await prisma.thinkTankPublication.update({
      where: { id: pub.id },
      data: { heroImageUrl: result.url },
    });
    console.log(`  DB updated: heroImageUrl saved`);
  } else {
    console.log(`  URL: ${result.url.slice(0, 100)}`);
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
