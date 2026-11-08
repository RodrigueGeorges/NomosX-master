require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  // Fix the v17 publication title (strip citations)
  const pub = await p.thinkTankPublication.findFirst({
    where: { publicId: 'cmstjkkkw0399295t0h11n64h' }
  });
  if (!pub) { console.log('Publication not found'); return; }

  // Extract title from HTML h1, strip citations and sup tags (including their content)
  const titleMatch = pub.html.match(/<h1[^>]*>(.*?)<\/h1>/s);
  let title = titleMatch 
    ? titleMatch[1]
        .replace(/<sup[^>]*>.*?<\/sup>/gs, '')  // Remove sup tags AND their content
        .replace(/<[^>]+>/g, '')
        .replace(/\[SRC-\d+\]/g, '')
        .replace(/\[E\d+\]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
    : 'Strategic Report';
  console.log('Clean title:', title);

  // Count words from HTML (strip tags)
  const textContent = pub.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const wordCount = textContent ? textContent.split(' ').filter(Boolean).length : 0;
  console.log('Word count:', wordCount);

  await p.thinkTankPublication.update({
    where: { id: pub.id },
    data: { title, wordCount }
  });
  console.log('Updated publication');
  console.log('URL: http://localhost:3000/inquiry/cmstjkkkw0399295t0h11n64h');
}

main().catch(e => console.error('Error:', e.message)).finally(() => p.$disconnect());
