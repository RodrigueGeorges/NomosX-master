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

  // Show all remaining "non établie" contexts
  console.log('=== Remaining "non établie" ===');
  let idx = 0;
  let count = 0;
  while ((idx = html.indexOf('non établie', idx)) !== -1 && count < 10) {
    const context = html.slice(Math.max(0, idx - 80), idx + 80);
    console.log(`\n[${count + 1}]`, context);
    idx += 12;
    count++;
  }

  // Show electricity data contexts
  console.log('\n\n=== Electricity data contexts ===');
  const elecRegex = /electricity|Day-ahead electricity|EUR \/ MWh/gi;
  let match;
  count = 0;
  while ((match = elecRegex.exec(html)) !== null && count < 5) {
    const context = html.slice(Math.max(0, match.index - 100), match.index + 100);
    console.log(`\n[${count + 1}]`, context);
    count++;
  }

  // Show [E-N] text citation contexts
  console.log('\n\n=== [E-N] text citation samples ===');
  const eRegex = /\[E\d+\]/g;
  count = 0;
  while ((match = eRegex.exec(html)) !== null && count < 5) {
    const context = html.slice(Math.max(0, match.index - 80), match.index + 120);
    console.log(`\n[${count + 1}]`, context);
    count++;
  }

  await p.$disconnect();
}

main().catch(e => { console.error('ERR:', e.message); process.exit(1); });
