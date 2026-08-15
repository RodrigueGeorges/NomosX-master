require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  const b = await p.brief.findUnique({ where: { id: 'cmstjkkkw0399295t0h11n64h' } });
  const m = b.html.match(/<h1[^>]*>(.*?)<\/h1>/s);
  console.log('Raw H1:', m ? m[1].replace(/<[^>]+>/g, '').slice(0, 300) : 'NOT FOUND');
  // Check for citation patterns in title
  const titleRaw = m ? m[1] : '';
  const citations = titleRaw.match(/\[SRC-\d+\]|<sup[^>]*>.*?<\/sup>|data-src="\d+"/g);
  console.log('Citations in H1:', citations);
}

main().catch(e => console.error(e.message)).finally(() => p.$disconnect());
