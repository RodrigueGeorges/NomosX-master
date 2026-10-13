/**
 * HERO IMAGE: Generate a conceptual abstract image for the publication.
 * Extracted from pipeline-v2.ts — identical semantics, unit-testable boundary.
 */

import type { TailStepContext } from './types';

/**
 * Extract section titles (<h2>, <h3>) from rendered HTML for hero image context.
 * (Identical to the removed helper in pipeline-v2.ts.)
 */
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

export async function runHeroImageStep(ctx: TailStepContext): Promise<void> {
  const { stats, analysis, query, topicClassification, detectedDomain, label } = ctx;
  try {
    const { generateHeroImage } = await import('../hero-image');
    const { captureInput } = await import('../frozen-inputs');
    const collisionLbl = topicClassification?.dimensions?.length
      ? topicClassification.dimensions.map((d: any) => d.label).join(' × ')
      : topicClassification?.primaryDomain || detectedDomain || '';
    const heroResult = await captureInput('hero:image', () => generateHeroImage(
      String(analysis.title || query),
      collisionLbl,
      topicClassification?.primaryDomain || detectedDomain || '',
      {
        throughLine: (analysis as any).throughLine || undefined,
        keyFindings: (analysis as any).keyFindings || undefined,
        summary: (analysis as any).summary || undefined,
        sectionTitles: extractSectionTitles(ctx.html),
        publicationType: ctx.isStrategic ? 'STRATEGIC_REPORT' : ctx.isMemo ? 'DECISION_MEMO' : ctx.isDossier ? 'STRATEGIC_REPORT' : 'ARTICLE',
      },
    ));
    if (heroResult) {
      const heroHtml = `<figure class="hero-image" style="margin:0 0 32px 0;width:100%;overflow:hidden;border:1px solid rgba(240,240,250,0.08);border-radius:4px;">
        <img src="${heroResult.url}" alt="${String(analysis.title || query).replace(/"/g, '&quot;')}" style="width:100%;height:auto;display:block;object-fit:cover;" />
      </figure>`;
      // Insert after brand header + title + meta (after the first .brief-meta or .report-meta closing div)
      if (ctx.html.includes('class="brief-meta"')) {
        ctx.html = ctx.html.replace(/(class="brief-meta"[^>]*>[\s\S]*?<\/div>)/, `$1\n${heroHtml}`);
      } else if (ctx.html.includes('class="report-meta"')) {
        ctx.html = ctx.html.replace(/(class="report-meta"[^>]*>[\s\S]*?<\/div>)/, `$1\n${heroHtml}`);
      } else if (ctx.html.includes('<article')) {
        ctx.html = ctx.html.replace(/(<article[^>]*>)/, `$1\n${heroHtml}`);
      } else if (ctx.html.includes('<div class="nomosx-brief"')) {
        ctx.html = ctx.html.replace(/(<div class="nomosx-brief[^"]*">)/, `$1\n${heroHtml}`);
      } else {
        ctx.html = heroHtml + ctx.html;
      }
      stats.heroImage = { generated: true, costUsd: heroResult.costUsd };
      console.log(`${label} HERO IMAGE: generated and injected into HTML`);
    } else {
      stats.heroImage = { generated: false, costUsd: 0 };
    }
  } catch (heroErr) {
    console.warn(`${label} HERO IMAGE: failed (non-blocking):`, heroErr);
  }
}
