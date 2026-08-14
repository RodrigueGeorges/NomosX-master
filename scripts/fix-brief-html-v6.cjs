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

  // Find the exact HTML around "Day-Ahead Electricity" in the sources
  const idx1 = html.indexOf('Day-Ahead Electricity');
  if (idx1 > 0) {
    // Find the enclosing span
    const before = html.lastIndexOf('<span', idx1);
    const after = html.indexOf('</span>', idx1);
    console.log('=== Raw HTML around "Day-Ahead Electricity" ===');
    console.log(html.slice(before, after + 7));
  }

  // Find "energy-charts"
  const idx2 = html.indexOf('energy-charts');
  if (idx2 > 0) {
    const before = html.lastIndexOf('<span', idx2);
    const after = html.indexOf('</span>', idx2);
    console.log('\n=== Raw HTML around "energy-charts" ===');
    console.log(html.slice(before, after + 7));
  }

  // Find "Fingrid"
  const idx3 = html.indexOf('Fingrid');
  if (idx3 > 0) {
    const before = html.lastIndexOf('<span', idx3);
    const after = html.indexOf('</span>', idx3);
    console.log('\n=== Raw HTML around "Fingrid" ===');
    console.log(html.slice(before, after + 7));
  }

  // Now remove these source entries — they span from <span to </span>
  // Use a broader approach: find all text between <h2>Sources</h2> and </section>
  // and remove entries with electricity keywords
  const sourcesStart = html.indexOf('<h2>Sources</h2>');
  const sourcesEnd = html.indexOf('</section>', sourcesStart);
  if (sourcesStart > 0 && sourcesEnd > 0) {
    let sourcesHtml = html.slice(sourcesStart, sourcesEnd);

    // Remove <span> entries containing electricity keywords
    // Match from <span to </span> (non-greedy)
    sourcesHtml = sourcesHtml.replace(/<span[^>]*>[\s\S]*?<\/span>/gi, (span) => {
      if (/electricity|Day-ahead|EUR \/ MWh|energy-charts|energi-data|fingrid|ElectricityProd|CO2Emis|electricity-market/i.test(span)) {
        console.log('\nRemoving span:', span.slice(0, 100));
        return '';
      }
      return span;
    });

    html = html.slice(0, sourcesStart) + sourcesHtml + html.slice(sourcesEnd);
  }

  // Final count
  const after = {
    'non établie': (html.match(/non établie/g) || []).length,
    'Non vérifié': (html.match(/Non vérifié/g) || []).length,
    'Unknown Author': (html.match(/Unknown Author/g) || []).length,
    'DOI broken': (html.match(/doi\.org\/non/g) || []).length,
    'electricity': (html.match(/electricity|Day-ahead electricity|EUR \/ MWh/gi) || []).length,
    '<sup>': (html.match(/<sup class=/g) || []).length,
  };
  console.log('\n=== Final counts ===', after);

  await p.thinkTankPublication.update({
    where: { id: pub.id },
    data: { html },
  });
  console.log('✅ Saved');

  await p.$disconnect();
}

main().catch(e => { console.error('ERR:', e.message); process.exit(1); });
