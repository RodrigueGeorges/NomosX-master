require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  const b = await p.brief.findUnique({ where: { id: 'cmstjkkkw0399295t0h11n64h' } });
  // Find the H1 in the HTML
  const h1Start = b.html.indexOf('<h1');
  const h1End = b.html.indexOf('</h1>', h1Start);
  const h1Content = b.html.slice(h1Start, h1End + 5);
  console.log('H1 block:');
  console.log(h1Content);
  console.log('\n--- Has <sup class="cite">:', /<sup class="cite">/.test(h1Content));
  console.log('--- Has [SRC-:', /\[SRC-/.test(h1Content));
  console.log('--- Has [E:', /\[E\d+/.test(h1Content));
}

main().catch(e => console.error(e.message)).finally(() => p.$disconnect());
