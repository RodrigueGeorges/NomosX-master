const fs = require('fs');
const { PrismaClient } = require('@prisma/client');
require('dotenv').config();
const p = new PrismaClient();

async function main() {
  // Get all sources from the v19 brief
  const brief = await p.brief.findUnique({ where: { id: 'cmstlgips02q614dksw89513u' } });
  if (!brief) { console.log('Brief not found'); return; }

  const sourceIds = typeof brief.sources === 'string' ? JSON.parse(brief.sources) : brief.sources;
  console.log('Total sources:', sourceIds.length);

  // Fetch all sources
  const sources = await p.source.findMany({
    where: { id: { in: sourceIds } },
    select: { id: true, title: true, url: true, provider: true, qualityScore: true, year: true, abstract: true }
  });

  console.log('\n=== PROVIDER DISTRIBUTION ===');
  const providers = {};
  sources.forEach(s => { providers[s.provider] = (providers[s.provider] || 0) + 1; });
  Object.entries(providers).sort((a,b) => b[1] - a[1]).forEach(([p, c]) => console.log(`  ${p}: ${c}`));

  console.log('\n=== DOMAINS (from URLs) ===');
  const domains = {};
  sources.forEach(s => {
    if (s.url) {
      try {
        const h = new URL(s.url).hostname.replace(/^www\./, '');
        domains[h] = (domains[h] || 0) + 1;
      } catch {}
    }
  });
  Object.entries(domains).sort((a,b) => b[1] - a[1]).forEach(([d, c]) => console.log(`  ${d}: ${c}`));

  console.log('\n=== SUSPICIOUS SOURCES (low quality or spam-like) ===');
  const suspicious = sources.filter(s => {
    const t = (s.title || '').toLowerCase();
    const u = (s.url || '').toLowerCase();
    return s.qualityScore < 50 ||
           t.includes('question') || t.includes('→') || t.includes('term') ||
           u.includes('sustainability-directory') || u.includes('study.com') ||
           u.includes('youtube.com') || u.includes('scribd') || u.includes('tandfonline') ||
           t.length < 20;
  });
  suspicious.forEach(s => {
    console.log(`  [${s.provider}] q=${s.qualityScore} ${s.title?.slice(0, 80)}`);
    if (s.url) console.log(`    URL: ${s.url.slice(0, 100)}`);
  });

  console.log('\n=== OFF-TOPIC SOURCES (title does not match query keywords) ===');
  const queryKeywords = ['algorithm', 'transparency', 'democratic', 'accountability', 'ai', 'governance', 'regulation', 'automated', 'decision', 'public', 'opacity', 'explainability', 'audit', 'bias', 'rights', 'privacy'];
  const offTopic = sources.filter(s => {
    const t = (s.title || '').toLowerCase();
    return !queryKeywords.some(k => t.includes(k));
  });
  offTopic.forEach(s => {
    console.log(`  [${s.provider}] ${s.title?.slice(0, 100)}`);
  });

  console.log('\n=== YEAR DISTRIBUTION ===');
  const years = {};
  sources.forEach(s => { if (s.year) years[s.year] = (years[s.year] || 0) + 1; });
  Object.entries(years).sort((a,b) => a[0] - b[0]).forEach(([y, c]) => console.log(`  ${y}: ${c}`));
}

main().catch(e => console.error(e.message)).finally(() => p.$disconnect());
