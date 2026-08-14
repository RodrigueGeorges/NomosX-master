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

  // Show the actual HTML around electricity source entries
  console.log('=== Electricity source entries ===');
  const elecRegex = /electricity|Day-ahead electricity|EUR \/ MWh|energy-charts|energi-data|fingrid/i;
  const refRegex = /<span class="apa-ref"[^>]*>[\s\S]*?<\/span>/gi;
  let match;
  let count = 0;
  while ((match = refRegex.exec(html)) !== null && count < 20) {
    if (elecRegex.test(match[0])) {
      console.log(`\n[Ref ${count + 1}] (${match[0].length} chars):`, match[0].slice(0, 300));
      count++;
    }
  }

  // Fix grammar issues in Key Findings
  html = html.replace(/caused an average a decline/g, 'caused an average decline');
  html = html.replace(/SVB had 92\.uninsured/g, 'SVB had 92% uninsured');
  html = html.replace(/funds its assets with uninsured/g, 'funds its assets with uninsured');

  // Fix truncated DOI links: <a href="https://doi.org/..." ...>https://</a>
  // The link text was truncated. Fix by using the DOI URL as the text
  html = html.replace(/<a href="(https:\/\/doi\.org\/[^"]+)"[^>]*>https:\/\/<\/a>/gi, (m, url) => {
    return `<a href="${url}" target="_blank" rel="noopener" style="color:#ffffff;">${url}</a>`;
  });

  // Fix other truncated links: <a href="https://..." ...>https://</a>
  html = html.replace(/<a href="(https:\/\/[^"]+)"[^>]*>https:\/\/<\/a>/gi, (m, url) => {
    return `<a href="${url}" target="_blank" rel="noopener" style="color:#ffffff;">${url}</a>`;
  });

  // Now remove electricity source entries — use a more flexible regex
  // The entries might span multiple lines and contain nested tags
  const removedRefs = [];

  // Find all apa-ref spans and check for electricity keywords
  const refRegex2 = /<span class="apa-ref" id="ref-(\d+)"[^>]*>([\s\S]*?)<\/span>/gi;
  let refMatch;
  const refsToRemove = [];
  while ((refMatch = refRegex2.exec(html)) !== null) {
    const refId = refMatch[1];
    const refContent = refMatch[2];
    if (/electricity|Day-ahead electricity|EUR \/ MWh|energy-charts|energi-data|fingrid|ElectricityProd|CO2Emis|electricity-market/i.test(refContent)) {
      refsToRemove.push({ id: refId, fullMatch: refMatch[0] });
    }
  }

  console.log(`\nFound ${refsToRemove.length} electricity refs to remove`);

  // Remove each electricity ref
  for (const ref of refsToRemove) {
    html = html.replace(ref.fullMatch, '');
    removedRefs.push(ref.id);
  }
  console.log('Removed ref IDs:', removedRefs);

  // Remove <sup> citations pointing to removed refs
  for (const refId of removedRefs) {
    const supRegex = new RegExp(`<sup class="cite"><a href="#ref-${refId}"[^>]*>[^<]*</a></sup>`, 'gi');
    html = html.replace(supRegex, '');
  }

  // Final counts
  const after = {
    'non établie': (html.match(/non établie/g) || []).length,
    'Non vérifié': (html.match(/Non vérifié/g) || []).length,
    'Unknown Author': (html.match(/Unknown Author/g) || []).length,
    'DOI broken': (html.match(/doi\.org\/non/g) || []).length,
    'electricity': (html.match(/electricity|Day-ahead electricity|EUR \/ MWh/gi) || []).length,
    'dup [E4]E4': (html.match(/\[E\d+\]E\d+/g) || []).length,
    '<sup>': (html.match(/<sup class=/g) || []).length,
  };

  const styleBlocks = [];
  let textOnly = html.replace(/<(style|script)\b[^>]*>[\s\S]*?<\/\1>/gi, (m) => { styleBlocks.push(m); return ''; });
  after['[E-N] text'] = (textOnly.match(/\[E\d+\]/g) || []).length;

  console.log('\n=== Final counts ===');
  console.log(after);

  // Show Key Findings again
  const kfIdx = html.indexOf('Key Findings');
  if (kfIdx > 0) {
    console.log('\n=== Key Findings ===');
    console.log(html.slice(kfIdx, kfIdx + 800));
  }

  // Show first source
  const srcIdx = html.indexOf('class="apa-ref"');
  if (srcIdx > 0) {
    console.log('\n=== First source ===');
    console.log(html.slice(srcIdx - 30, srcIdx + 400));
  }

  await p.thinkTankPublication.update({
    where: { id: pub.id },
    data: { html },
  });
  console.log('\n✅ Saved');

  await p.$disconnect();
}

main().catch(e => { console.error('ERR:', e.message); process.exit(1); });
