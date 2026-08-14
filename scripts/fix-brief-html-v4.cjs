require('dotenv').config({ path: '.env.local' });
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  const pub = await p.thinkTankPublication.findFirst({
    where: { status: 'PUBLISHED' },
    orderBy: { createdAt: 'desc' },
    select: { id: true, html: true, sourceIds: true },
  });

  let html = pub.html || '';

  // Remove irrelevant electricity/energy source entries from the references section
  // These are <span class="apa-ref"> elements that contain electricity/energy data
  // They were incorrectly fetched by the QUANT agent for a finance query

  // Pattern: remove entire <span class="apa-ref" id="ref-N">...</span> blocks
  // that contain electricity/energy keywords
  const removedRefs = [];
  html = html.replace(/<span class="apa-ref" id="ref-(\d+)"[^>]*>[\s\S]*?<\/span>/gi, (match, refId) => {
    if (/electricity|Day-ahead electricity|EUR \/ MWh|energy-charts|energi-data|fingrid|electricity-market|ElectricityProd|CO2Emis/i.test(match)) {
      removedRefs.push(refId);
      return ''; // Remove the entire source entry
    }
    return match;
  });

  console.log('Removed irrelevant source refs:', removedRefs);

  // Also remove any <sup> citations that reference these removed source IDs
  for (const refId of removedRefs) {
    // Remove <sup class="cite"><a href="#ref-N" data-evidence="EN">EN</a></sup>
    const supRegex = new RegExp(`<sup class="cite"><a href="#ref-${refId}"[^>]*>[^<]*</a></sup>`, 'gi');
    html = html.replace(supRegex, '');
  }

  // Final verification
  const after = {
    'non établie': (html.match(/non établie/g) || []).length,
    'Non vérifié': (html.match(/Non vérifié/g) || []).length,
    'Unknown Author': (html.match(/Unknown Author/g) || []).length,
    'DOI broken': (html.match(/doi\.org\/non/g) || []).length,
    'electricity': (html.match(/electricity|Day-ahead electricity|EUR \/ MWh/gi) || []).length,
    'dup [E4]E4': (html.match(/\[E\d+\]E\d+/g) || []).length,
    '<sup>': (html.match(/<sup class=/g) || []).length,
  };

  // Count [E-N] only in text nodes (not CSS)
  const styleBlocks = [];
  let textOnly = html.replace(/<(style|script)\b[^>]*>[\s\S]*?<\/\1>/gi, (m) => {
    styleBlocks.push(m);
    return '';
  });
  after['[E-N] text'] = (textOnly.match(/\[E\d+\]/g) || []).length;

  console.log('\n=== Final counts ===');
  console.log(after);

  // Show a sample of the Key Findings section to verify
  const kfIdx = html.indexOf('Key Findings');
  if (kfIdx > 0) {
    console.log('\n=== Key Findings sample ===');
    console.log(html.slice(kfIdx, kfIdx + 1200));
  }

  // Show a sample of the Sources section
  const srcIdx = html.indexOf('class="apa-ref"');
  if (srcIdx > 0) {
    console.log('\n=== First source entry ===');
    console.log(html.slice(srcIdx - 30, srcIdx + 400));
  }

  // Save
  await p.thinkTankPublication.update({
    where: { id: pub.id },
    data: { html },
  });
  console.log('\n✅ Saved');

  await p.$disconnect();
}

main().catch(e => { console.error('ERR:', e.message); process.exit(1); });
