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

  // Show all remaining electricity contexts
  console.log('=== Remaining electricity contexts ===');
  const elecRegex = /electricity|Day-ahead electricity|EUR \/ MWh/gi;
  let match, count = 0;
  while ((match = elecRegex.exec(html)) !== null && count < 15) {
    const context = html.slice(Math.max(0, match.index - 120), match.index + 120);
    // Check if inside SVG
    const before = html.slice(Math.max(0, match.index - 500), match.index);
    const inSvg = before.lastIndexOf('<svg') > before.lastIndexOf('</svg>');
    const inFigure = before.lastIndexOf('<figure') > before.lastIndexOf('</figure>');
    console.log(`\n[${count + 1}] ${inSvg ? '(SVG)' : inFigure ? '(FIGURE)' : '(TEXT)'}:`, context);
    count++;
  }

  // Remove remaining SVG elements with electricity data
  html = html.replace(/<svg[^>]*>[\s\S]*?<\/svg>/gi, (svg) => {
    if (/electricity|Day-ahead|EUR \/ MWh/i.test(svg)) {
      return '';
    }
    return svg;
  });

  // Remove remaining figure elements with electricity data
  html = html.replace(/<figure[^>]*>[\s\S]*?<\/figure>/gi, (figure) => {
    if (/electricity|Day-ahead|EUR \/ MWh|energy-charts/i.test(figure)) {
      return '';
    }
    return figure;
  });

  // Remove any remaining text mentioning electricity prices (off-topic)
  // Only remove if it's clearly electricity price data, not general discussion
  html = html.replace(/<p[^>]*>[^<]*(?:Day-ahead electricity|EUR \/ MWh|electricity price data)[^<]*<\/p>/gi, '');
  html = html.replace(/<figcaption[^>]*>[^<]*(?:electricity|energy-charts|EUR \/ MWh)[^<]*<\/figcaption>/gi, '');

  // Final count
  const after = {
    'non établie': (html.match(/non établie/g) || []).length,
    'Non vérifié': (html.match(/Non vérifié/g) || []).length,
    'Unknown Author': (html.match(/Unknown Author/g) || []).length,
    'DOI broken': (html.match(/doi\.org\/non/g) || []).length,
    'electricity': (html.match(/electricity|Day-ahead electricity|EUR \/ MWh/gi) || []).length,
    'dup [E4]E4': (html.match(/\[E\d+\]E\d+/g) || []).length,
    '[E-N] text (non-CSS)': 0,
    '<sup>': (html.match(/<sup class=/g) || []).length,
  };

  // Count [E-N] only in text nodes (not CSS)
  const styleBlocks = [];
  let textOnly = html.replace(/<(style|script)\b[^>]*>[\s\S]*?<\/\1>/gi, (m) => {
    styleBlocks.push(m);
    return '';
  });
  after['[E-N] text (non-CSS)'] = (textOnly.match(/\[E\d+\]/g) || []).length;

  console.log('\n=== Final counts ===');
  console.log(after);

  // Save
  await p.thinkTankPublication.update({
    where: { id: pub.id },
    data: { html },
  });
  console.log('\n✅ Saved');

  await p.$disconnect();
}

main().catch(e => { console.error('ERR:', e.message); process.exit(1); });
