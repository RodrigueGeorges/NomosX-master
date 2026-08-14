require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  const b = await p.brief.findUnique({ where: { id: 'cmsths8rq01sohqgoo7t4lv9u' } });
  if (!b) { console.log('NOT FOUND'); return; }

  // Extract title from HTML
  const titleMatch = b.html.match(/<h1[^>]*>(.*?)<\/h1>/s);
  console.log('Title (from HTML):', titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : 'NOT FOUND');

  // Extract executive summary
  const summaryMatch = b.html.match(/Executive Summary<\/h2>.*?<p>(.*?)<\/p>/s);
  console.log('\n--- Executive Summary (first 500 chars) ---');
  console.log(summaryMatch ? summaryMatch[1].replace(/<[^>]+>/g, '').slice(0, 500) : 'NOT FOUND');

  // Extract key findings
  const findingsMatch = b.html.match(/Key Findings<\/h2>(.*?)(<\/ul>|<\/ol>|<h2)/s);
  console.log('\n--- Key Findings (first 800 chars) ---');
  console.log(findingsMatch ? findingsMatch[1].replace(/<[^>]+>/g, '').trim().slice(0, 800) : 'NOT FOUND');

  // Check for hero image in HTML
  const imgMatch = b.html.match(/<img[^>]*src="([^"]*)"[^>]*>/);
  console.log('\n--- Hero Image in HTML ---');
  console.log(imgMatch ? imgMatch[1] : 'NO IMAGE IN HTML');

  // Check metadata for hero image
  if (b.metadata) {
    const meta = typeof b.metadata === 'string' ? JSON.parse(b.metadata) : b.metadata;
    console.log('\n--- Metadata keys ---');
    console.log(Object.keys(meta).join(', '));
    if (meta.heroImage) console.log('Hero image URL:', meta.heroImage);
  }

  // Show source count and trust
  console.log('\n--- Brief Stats ---');
  console.log('Trust Score:', b.trustScore);
  console.log('Quality Score:', b.qualityScore);
  console.log('HTML size:', (b.html.length / 1024).toFixed(1) + ' KB');
  const sources = typeof b.sources === 'string' ? JSON.parse(b.sources) : b.sources;
  console.log('Sources:', Array.isArray(sources) ? sources.length : 'unknown');
}

main().catch(e => console.error(e.message)).finally(() => p.$disconnect());
