require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  const brief = await p.brief.findFirst({
    orderBy: { createdAt: 'desc' },
  });
  if (!brief) { console.log('No brief found at all'); return; }

  console.log('Brief ID:', brief.id);
  console.log('Question:', brief.question?.slice(0, 80));
  console.log('Trust score:', brief.trustScore);
  console.log('Quality score:', brief.qualityScore);
  console.log('Created:', brief.createdAt);

  // Extract title from HTML h1
  const titleMatch = brief.html.match(/<h1[^>]*>(.*?)<\/h1>/s);
  let title = titleMatch
    ? titleMatch[1]
        .replace(/<sup[^>]*>.*?<\/sup>/gs, '')
        .replace(/<[^>]+>/g, '')
        .replace(/\[SRC-\d+\]/g, '')
        .replace(/\[E\d+\]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
    : 'NO TITLE';
  console.log('Title:', title);
  console.log('Title has sup tags:', /<sup/.test(titleMatch?.[1] || ''));
  console.log('Title has [SRC:', /\[SRC-/.test(titleMatch?.[1] || ''));

  // Count words from HTML (strip tags)
  const textContent = brief.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const wordCount = textContent ? textContent.split(' ').filter(Boolean).length : 0;
  console.log('Word count:', wordCount);
  console.log('HTML size:', (brief.html.length / 1024).toFixed(0), 'KB');

  // Check for doubled citations in HTML
  const doubledCitations = [...brief.html.matchAll(/\[SRC-(\d+)\]\s*\[SRC-\1\]/g)];
  console.log('Doubled citations found:', doubledCitations.length);

  // Check for citations in H1
  const h1Content = titleMatch?.[1] || '';
  const citationsInH1 = [...h1Content.matchAll(/\[SRC-\d+\]|<sup[^>]*>.*?<\/sup>/gs)];
  console.log('Citations in H1:', citationsInH1.length);

  // Check for spam domains in source URLs
  const sourceIds = typeof brief.sources === 'string' ? JSON.parse(brief.sources) : brief.sources;
  const sources = await p.source.findMany({
    where: { id: { in: sourceIds } },
    select: { id: true, title: true, url: true, provider: true, qualityScore: true }
  });

  console.log('\nTotal sources:', sources.length);

  const spamDomains = ['youtube.com', 'scribd.com', 'study.com', 'troylendman.com', 'sustainability-directory.com'];
  const spamFound = sources.filter(s => {
    if (!s.url) return false;
    try { return spamDomains.some(d => new URL(s.url).hostname.includes(d)); } catch { return false; }
  });
  console.log('Spam sources still present:', spamFound.length);
  spamFound.forEach(s => console.log('  SPAM:', s.provider, s.url?.slice(0, 80)));

  // Check for off-topic JSTOR sources
  const jstorSources = sources.filter(s => s.provider === 'jstor');
  const queryKeywords = ['algorithm', 'transparency', 'democratic', 'accountability', 'ai', 'governance', 'regulation', 'automated', 'decision', 'public', 'opacity', 'explainability', 'audit', 'bias', 'rights', 'privacy'];
  const offTopicJstor = jstorSources.filter(s => {
    const t = (s.title || '').toLowerCase();
    return !queryKeywords.some(k => t.includes(k));
  });
  console.log('\nJSTOR sources:', jstorSources.length, 'Off-topic:', offTopicJstor.length);
  offTopicJstor.forEach(s => console.log('  OFF-TOPIC JSTOR:', s.title?.slice(0, 80)));

  // Provider distribution
  const providers = {};
  sources.forEach(s => { providers[s.provider] = (providers[s.provider] || 0) + 1; });
  console.log('\nProvider distribution:');
  Object.entries(providers).sort((a,b) => b[1] - a[1]).forEach(([p, c]) => console.log(`  ${p}: ${c}`));
}

main().catch(e => console.error(e.message)).finally(() => p.$disconnect());
