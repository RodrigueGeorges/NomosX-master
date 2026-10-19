/**
 * Batch-regenerate commissioned hero images for publications.
 *
 * For each publication missing a real generated image (no heroImageUrl, or an
 * SVG fallback), extracts article context from the rendered HTML — lede,
 * key findings, section titles — and calls generateHeroImage: the same
 * LLM-derived, per-publication motif pipeline used by hero-image-step.
 *
 * Usage:
 *   node --import tsx scripts/regen-hero-batch.ts              # all pubs needing an image
 *   node --import tsx scripts/regen-hero-batch.ts --published  # PUBLISHED only
 *   node --import tsx scripts/regen-hero-batch.ts --force      # regenerate even existing PNGs
 *   node --import tsx scripts/regen-hero-batch.ts --limit=5    # cap the batch
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import { prisma } from '../lib/db';
import { generateHeroImage, type HeroArticleContext } from '../lib/agent/hero-image';
import { parseEditorialInquiry } from '../lib/brand/inquiry-html-parse';
import { publicPublicationWhere } from '../lib/publication-visibility';
import { isPositionFirstBrief } from '../lib/agent/brief-html-extract';

const args = process.argv.slice(2);
const ONLY_PUBLISHED = args.includes('--published');
const FORCE = args.includes('--force');
const LIMIT_ARG = args.find((a) => a.startsWith('--limit='));
const LIMIT = LIMIT_ARG ? parseInt(LIMIT_ARG.split('=')[1], 10) : Infinity;

const VERTICAL_TO_DOMAIN: Record<string, string> = {
  'ai-technology': 'ai-technology', 'ai-policy': 'ai-policy', 'ai-safety': 'ai-safety',
  'economics': 'economics', 'finance-macro': 'finance-macro', 'geopolitics': 'geopolitics',
  'climate': 'climate', 'health-biotech': 'health-biotech', 'biotechnology': 'biotechnology',
  'cybersecurity': 'cybersecurity', 'energy': 'energy', 'trade': 'trade',
  'eu-policy': 'eu-policy', 'digital-governance': 'digital-governance',
  'emerging-markets': 'emerging-markets', 'social-stability': 'social-stability',
  'science-frontier': 'science-frontier', 'security': 'security',
  'development': 'development', 'labor': 'labor',
};

function needsImage(heroImageUrl: string | null): boolean {
  if (FORCE) return true;
  if (!heroImageUrl) return true;
  // SVG geometric fallbacks are generic placeholders, not commissioned art
  return heroImageUrl.startsWith('data:image/svg');
}

function extractSectionTitles(html: string): string[] {
  const titles: string[] = [];
  const re = /<h[23][^>]*>([^<]+)<\/h[23]>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const t = m[1].replace(/&amp;/g, '&').replace(/&quot;/g, '"').trim();
    if (t && t.length > 2 && t.length < 120) titles.push(t);
  }
  return titles.slice(0, 10);
}

function extractLiItems(fragment: string): string[] {
  if (!fragment) return [];
  return [...fragment.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)]
    .map((m) => m[1].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim())
    .filter((s) => s.length > 20);
}

/**
 * Build article context from the rendered publication HTML — the rendered
 * article carries the real findings, so the LLM derives a motif from the
 * actual content, not just the title.
 */
function extractContext(html: string): HeroArticleContext {
  const editorial = parseEditorialInquiry(html);
  const ctx: HeroArticleContext = { sectionTitles: extractSectionTitles(html) };

  if (editorial) {
    ctx.throughLine = editorial.lede || editorial.productiveFriction || undefined;
    const findings = extractLiItems(editorial.keyFindingsHtml);
    if (findings.length) ctx.keyFindings = findings.slice(0, 5);
    ctx.summary = [editorial.collision, editorial.detectedReason]
      .filter(Boolean).join(' — ') || editorial.lede || undefined;
  }

  // Legacy / unparseable HTML — fall back to the first substantive paragraph
  if (!ctx.throughLine && !ctx.summary) {
    const pMatch = html.match(/<p[^>]*>([^<]{50,600})<\/p>/);
    if (pMatch) ctx.summary = pMatch[1].replace(/<[^>]+>/g, '').trim();
  }

  return ctx;
}

async function main() {
  const pubs = await prisma.thinkTankPublication.findMany({
    // --published = exactly what the public site shows: the quality gate
    // (trust/quality/citation/wordCount per format) + status + publishedAt.
    where: ONLY_PUBLISHED ? publicPublicationWhere() : {},
    select: {
      id: true, title: true, type: true, status: true,
      html: true, heroImageUrl: true,
      vertical: { select: { slug: true, name: true } },
      criticalLoopResult: true,
    },
    orderBy: { publishedAt: 'desc' },
  });

  const queue = pubs.filter((p) => {
    if (!p.title || !needsImage(p.heroImageUrl)) return false;
    if (ONLY_PUBLISHED) {
      // Same filter as fetchPublicBriefs — legacy-format HTML isn't displayed
      const rawHtml = (p.html || '')
        .replace(/^```html?\s*/i, '')
        .replace(/\s*```\s*$/, '')
        .trim();
      if (!isPositionFirstBrief(rawHtml)) return false;
    }
    return true;
  }).slice(0, LIMIT);
  console.log(`[BATCH] ${pubs.length} publications, ${queue.length} need a hero image`);

  let done = 0, failed = 0, skipped = 0;
  let totalCost = 0;

  for (const pub of queue) {
    done++;
    const title = pub.title || 'Untitled';
    const html = pub.html || '';
    const clr = (pub.criticalLoopResult ?? {}) as Record<string, unknown>;
    const question = (clr.question as string) || '';
    const domain = VERTICAL_TO_DOMAIN[pub.vertical?.slug ?? ''] ?? 'general';
    const collision = question && question !== title
      ? `${domain} × ${question.slice(0, 80)}`
      : domain;

    console.log(`\n[BATCH ${done}/${queue.length}] ${pub.id} (${pub.type}/${pub.status}) domain=${domain}`);
    console.log(`  "${title.slice(0, 90)}"`);

    if (!html || html.length < 500) {
      console.warn('  ~ skipped — HTML too short to derive a real concept');
      skipped++;
      continue;
    }

    try {
      const ctx = extractContext(html);
      console.log(`  ctx: throughLine=${ctx.throughLine ? 'y' : 'n'} findings=${ctx.keyFindings?.length ?? 0} sections=${ctx.sectionTitles?.length ?? 0}`);

      const result = await generateHeroImage(title, collision, domain, {
        ...ctx,
        publicationType: pub.type || 'ARTICLE',
      });

      if (!result) {
        console.warn('  ✗ generation returned null');
        failed++;
        continue;
      }

      await prisma.thinkTankPublication.update({
        where: { id: pub.id },
        data: { heroImageUrl: result.url },
      });
      totalCost += result.costUsd;
      const kind = result.url.startsWith('data:image/png') ? 'PNG' : result.url.startsWith('data:image/svg') ? 'SVG-FALLBACK' : 'URL';
      console.log(`  ✓ saved (${kind}, $${result.costUsd.toFixed(3)}, url ${result.url.length} chars)`);
    } catch (err: any) {
      console.warn(`  ✗ failed: ${err.message?.slice(0, 200)}`);
      failed++;
    }

    // Gentle pacing — image endpoint + LLM concept call
    if (done < queue.length) await new Promise((r) => setTimeout(r, 2000));
  }

  console.log(`\n[BATCH] done — ${done - failed - skipped}/${queue.length} generated, ${failed} failed, ${skipped} skipped, ~$${totalCost.toFixed(2)}`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
