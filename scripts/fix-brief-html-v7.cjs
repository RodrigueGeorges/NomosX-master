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

  // The electricity source entries are now dangling content like:
  // <span class="ref-num">[10]</span> (2026). <em>Energy Charts...</em>. energy-charts. <a>...</a></span>
  // Remove them by matching from <span class="ref-num"> to the next </span>
  // that contains electricity keywords

  // Strategy: find all <span class="ref-num">[N]</span> ... </span> blocks
  // and remove those containing electricity keywords
  html = html.replace(/<span class="ref-num">\[(\d+)\]<\/span>([\s\S]*?)<\/span>/gi, (match, refNum, content) => {
    if (/electricity|Day-ahead|EUR \/ MWh|energy-charts|energi-data|fingrid|ElectricityProd|CO2Emis|electricity-market/i.test(content)) {
      console.log(`Removing ref [${refNum}]:`, content.slice(0, 80));
      return '';
    }
    return match;
  });

  // Also remove any remaining dangling electricity content
  // (text between </span> and </span> that contains electricity keywords)
  html = html.replace(/<\/span>([^<]*(?:electricity|Day-ahead electricity|energy-charts|energi-data|fingrid|ElectricityProd|CO2Emis)[^<]*)<\/span>/gi, '');

  // Remove empty <span class="apa-ref" id="ref-N"></span> wrappers left behind
  html = html.replace(/<span class="apa-ref" id="ref-\d+"[^>]*>\s*<\/span>/gi, '');

  // Final count
  const after = {
    'non établie': (html.match(/non établie/g) || []).length,
    'Non vérifié': (html.match(/Non vérifié/g) || []).length,
    'Unknown Author': (html.match(/Unknown Author/g) || []).length,
    'DOI broken': (html.match(/doi\.org\/non/g) || []).length,
    'electricity': (html.match(/electricity|Day-ahead electricity|EUR \/ MWh/gi) || []).length,
    '<sup>': (html.match(/<sup class=/g) || []).length,
  };

  const styleBlocks = [];
  let textOnly = html.replace(/<(style|script)\b[^>]*>[\s\S]*?<\/\1>/gi, (m) => { styleBlocks.push(m); return ''; });
  after['[E-N] text'] = (textOnly.match(/\[E\d+\]/g) || []).length;

  console.log('\n=== Final counts ===', after);

  // Show remaining electricity if any
  if (after.electricity > 0) {
    const elecRegex = /electricity|Day-ahead electricity|EUR \/ MWh/gi;
    let match, count = 0;
    while ((match = elecRegex.exec(html)) !== null && count < 5) {
      console.log(`\nRemaining [${count+1}]:`, html.slice(Math.max(0, match.index - 80), match.index + 80));
      count++;
    }
  }

  await p.thinkTankPublication.update({
    where: { id: pub.id },
    data: { html },
  });
  console.log('\n✅ Saved');

  await p.$disconnect();
}

main().catch(e => { console.error('ERR:', e.message); process.exit(1); });
