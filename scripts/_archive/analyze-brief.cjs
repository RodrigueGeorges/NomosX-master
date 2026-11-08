require('dotenv').config({ path: '.env.local' });
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  // Revert the 3 publications I bulk-published back to HELD
  // Keep only: Fragility Trap (latest funnel) + AI Act Threshold (was already published before)
  const revertTitles = [
    'The Inclusion Paradox in Conflict Zones%',
    'The Infrastructure Paradox%',
    'The Autonomy Imperative%',
  ];

  for (const pattern of revertTitles) {
    const result = await p.thinkTankPublication.updateMany({
      where: { title: { startsWith: pattern.replace('%', '') }, status: 'PUBLISHED' },
      data: { status: 'HELD', publishedAt: null },
    });
    console.log(`Reverted: ${pattern} → ${result.count} publications back to HELD`);
  }

  // Show final state
  const all = await p.thinkTankPublication.findMany({
    orderBy: { createdAt: 'desc' },
    take: 15,
    select: { id: true, status: true, trustScore: true, qualityScore: true, title: true, publicId: true, html: true },
  });
  console.log('\n=== Final state ===');
  all.forEach(x => {
    const htmlLen = x.html?.length || 0;
    console.log(`${x.status} | T:${x.trustScore} Q:${x.qualityScore} | html:${htmlLen} | ${x.title?.slice(0, 60)}`);
  });

  // Find the latest PUBLISHED brief and analyze its HTML
  const latest = all.find(x => x.status === 'PUBLISHED');
  if (!latest) {
    console.log('\nNo PUBLISHED brief found');
    return;
  }

  console.log(`\n=== Analyzing: ${latest.title?.slice(0, 80)} ===`);
  const html = latest.html || '';
  console.log('HTML length:', html.length);

  // Check for rendering issues
  const issues = {
    'non établie': (html.match(/non établie/g) || []).length,
    'Non vérifié': (html.match(/Non vérifié/g) || []).length,
    'Unknown Author': (html.match(/Unknown Author/g) || []).length,
    'DOI non établie': (html.match(/doi\.org\/non/g) || []).length,
    'Duplicate [E4]E4': (html.match(/\[E\d+\]E\d+/g) || []).length,
    'Electricity data': (html.match(/electricity|Day-ahead electricity|EUR \/ MWh/gi) || []).length,
    'data-src tags': (html.match(/data-src=/g) || []).length,
    '[SRC-N] remaining': (html.match(/\[SRC-\d+\]/g) || []).length,
    '[E-N] citations': (html.match(/\[E\d+\]/g) || []).length,
    '<sup> citations': (html.match(/<sup class=/g) || []).length,
  };

  console.log('\n=== Issue Checks ===');
  Object.entries(issues).forEach(([k, v]) => {
    console.log(`  ${k}: ${v}${v > 0 ? ' ⚠️' : ' ✅'}`);
  });

  // Show samples of problematic areas
  if (issues['non établie'] > 0) {
    const idx = html.indexOf('non établie');
    console.log('\n=== "non établie" sample ===');
    console.log(html.slice(Math.max(0, idx - 100), idx + 100));
  }

  if (issues['Unknown Author'] > 0) {
    const idx = html.indexOf('Unknown Author');
    console.log('\n=== "Unknown Author" sample ===');
    console.log(html.slice(Math.max(0, idx - 100), idx + 200));
  }

  if (issues['Duplicate [E4]E4'] > 0) {
    const match = html.match(/\[E\d+\]E\d+/);
    if (match) {
      const idx = html.indexOf(match[0]);
      console.log('\n=== Duplicate citation sample ===');
      console.log(html.slice(Math.max(0, idx - 100), idx + 100));
    }
  }

  // Show Key Findings section
  const kfIdx = html.indexOf('Key Findings');
  if (kfIdx > 0) {
    console.log('\n=== Key Findings (first 1500 chars) ===');
    console.log(html.slice(kfIdx, kfIdx + 1500));
  }

  // Show first source entry
  const srcIdx = html.indexOf('source-item');
  if (srcIdx > 0) {
    console.log('\n=== First source entry ===');
    console.log(html.slice(srcIdx - 50, srcIdx + 500));
  }

  await p.$disconnect();
}

main().catch(e => { console.error('ERR:', e.message); process.exit(1); });
