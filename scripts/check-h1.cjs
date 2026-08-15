require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  const b = await p.brief.findUnique({ where: { id: 'cmstjkkkw0399295t0h11n64h' } });
  const m = b.html.match(/<h1[^>]*>(.*?)<\/h1>/s);
  if (m) {
    console.log('H1 raw (first 500):', m[1].slice(0, 500));
    console.log('Has sup tags:', /<sup/i.test(m[1]));
    console.log('Has SRC:', /\[SRC-|SRC-/.test(m[1]));
  }
}

main().catch(e => console.error(e.message)).finally(() => p.$disconnect());
