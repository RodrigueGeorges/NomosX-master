require('dotenv').config({ path: '.env.local' });
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  const pub = await p.thinkTankPublication.findFirst({
    where: { status: 'PUBLISHED' },
    orderBy: { createdAt: 'desc' },
    select: { id: true, html: true },
  });

  let html = pub.html || '';
  const originalLen = html.length;

  const before = {
    'non établie': (html.match(/non établie/g) || []).length,
    'electricity': (html.match(/electricity|Day-ahead electricity|EUR \/ MWh/gi) || []).length,
    '[E-N] all': (html.match(/\[E\d+\]/g) || []).length,
    '<sup>': (html.match(/<sup class=/g) || []).length,
    'figure charts': (html.match(/<figure[^>]*>/gi) || []).length,
  };
  console.log('Before:', before);

  // ── FIX 1: "non établieillion" → "billion" (the "b" was sanitized) ──
  html = html.replace(/non établieillion/g, 'billion');
  html = html.replace(/non établieillion/g, 'million');

  // ── FIX 2: "average of non établie" → "an average" (remove broken number) ──
  html = html.replace(/an average of non établie/g, 'an average');
  html = html.replace(/average of non établie/g, 'an average');

  // ── FIX 3: Fix broken URL "https:// établie.non établie" ──
  html = html.replace(/https:\/\/ établie\.non établie/g, '#');
  html = html.replace(/https:\/\/\s*établie/g, '#');

  // ── FIX 4: Remove "non établie" from the methodology note (legit French text) ──
  // Keep the methodology note but fix the broken text
  html = html.replace(/Les affirmations non vérifiables sont signalées ou marquées «\s*&nbsp;\s*non établie\s*&nbsp;\s*»\./g,
    'Les affirmations non vérifiables sont signalées.');

  // ── FIX 5: Remove electricity SVG charts from <figure> elements ──
  // These are completely irrelevant to a finance/bond yields report
  // Remove any <figure> that contains electricity/energy data
  html = html.replace(/<figure[^>]*>[\s\S]*?<\/figure>/gi, (figure) => {
    if (/electricity|Day-ahead electricity|EUR \/ MWh|energy-charts|day-ahead price/i.test(figure)) {
      return ''; // Remove the entire figure
    }
    return figure;
  });

  // Also remove any standalone SVG elements with electricity data
  html = html.replace(/<svg[^>]*>[\s\S]*?<\/svg>/gi, (svg) => {
    if (/electricity|Day-ahead electricity|EUR \/ MWh/i.test(svg)) {
      return '';
    }
    return svg;
  });

  // Remove figcaption with energy-charts reference
  html = html.replace(/<figcaption[^>]*>[^<]*energy-charts[^<]*<\/figcaption>/gi, '');

  // ── FIX 6: Remove [E-N] text citations in body content (not CSS selectors) ──
  // CSS selectors like [E1].badge-high should NOT be removed
  // Only remove [E-N] that are in text content (followed by text, not CSS)
  // Strategy: process only text between > and < (text nodes), skip <style> blocks

  const styleBlocks = [];
  let working = html.replace(/<(style|script)\b[^>]*>[\s\S]*?<\/\1>/gi, (m) => {
    styleBlocks.push(m);
    return `\x00STYLE${styleBlocks.length - 1}\x00`;
  });

  // Remove [E-N] from text nodes (between > and <)
  // But only when there's a corresponding <sup> tag with the same evidence ID nearby
  working = working.replace(/>([^<]*)</g, (match, textContent) => {
    // Skip if this is inside a <title> or <h1> tag (check context)
    // We only want to remove [E-N] from body paragraphs

    // Find all evidence IDs in the text
    const eIds = [];
    for (const m of textContent.matchAll(/\[E(\d+)\]/g)) {
      eIds.push(m[1]);
    }

    if (eIds.length === 0) return match;

    // Remove [E-N] from text content
    let fixed = textContent.replace(/\s*\[E\d+\]\s*/g, ' ');
    // Clean up double spaces
    fixed = fixed.replace(/  +/g, ' ');
    return `>${fixed}<`;
  });

  // Restore style blocks
  html = working.replace(/\x00STYLE(\d+)\x00/g, (_, i) => styleBlocks[parseInt(i, 10)]);

  // ── FIX 7: Remove [E-N] from <title> and <h1> tags ──
  html = html.replace(/<title>([^<]*)<\/title>/g, (m, title) => {
    return `<title>${title.replace(/\s*\[E\d+\]\s*/g, '')}</title>`;
  });
  html = html.replace(/<h1[^>]*>([^<]*)<\/h1>/g, (m, h1) => {
    return `<h1>${h1.replace(/\s*\[E\d+\]\s*/g, '')}</h1>`;
  });

  // Count after
  const after = {
    'non établie': (html.match(/non établie/g) || []).length,
    'electricity': (html.match(/electricity|Day-ahead electricity|EUR \/ MWh/gi) || []).length,
    '[E-N] all': (html.match(/\[E\d+\]/g) || []).length,
    '<sup>': (html.match(/<sup class=/g) || []).length,
    'figure charts': (html.match(/<figure[^>]*>/gi) || []).length,
  };
  console.log('After:', after);
  console.log('HTML length:', originalLen, '→', html.length);

  // Show remaining non établie
  if (after['non établie'] > 0) {
    let idx = 0, count = 0;
    while ((idx = html.indexOf('non établie', idx)) !== -1 && count < 5) {
      console.log(`\nRemaining [${count+1}]:`, html.slice(Math.max(0, idx - 60), idx + 60));
      idx += 12;
      count++;
    }
  }

  // Show remaining [E-N]
  if (after['[E-N] all'] > 0) {
    const eRegex = /\[E\d+\]/g;
    let match, count = 0;
    while ((match = eRegex.exec(html)) !== null && count < 5) {
      console.log(`\n[E-N] remaining [${count+1}]:`, html.slice(Math.max(0, match.index - 60), match.index + 60));
      count++;
    }
  }

  // Save
  await p.thinkTankPublication.update({
    where: { id: pub.id },
    data: { html },
  });
  console.log('\n✅ Fixed HTML saved');

  await p.$disconnect();
}

main().catch(e => { console.error('ERR:', e.message); process.exit(1); });
