import { config } from 'dotenv';
config({ path: '.env.local' });
async function main() {
  const { prisma } = await import('../lib/db');
  const { POSITION_FIRST_BRIEF_CSS } = await import('../lib/agent/position-first-brief.css');

  const repair = (html: string, title: string): { html: string; fixed: boolean } => {
    const styleIdx = html.search(/<style/i);
    const metaIdx = html.indexOf('<div class="brief-meta"');
    if (styleIdx < 0 || metaIdx < 0 || metaIdx < styleIdx) return { html, fixed: false };
    const hasClose = /<\/style>/i.test(html);
    if (hasClose) return { html, fixed: false };
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const rebuilt = `<style>${POSITION_FIRST_BRIEF_CSS}</style>\n</head>\n<body>\n  <article class="nomosx-brief">\n    <h1 data-no-cite>${esc(title)}</h1>\n    `;
    return { html: html.slice(0, styleIdx) + rebuilt + html.slice(metaIdx), fixed: true };
  };

  const brief = await prisma.brief.findUnique({ where: { id: 'cmubiqa69017w2mshy1sz1fto' } });
  if (brief?.html) {
    const title = (brief.html.match(/<title>([^<]+)<\/title>/) || [])[1] || 'Untitled';
    const r = repair(brief.html, title);
    console.log('brief:', r.fixed ? 'REPAIRED' : 'skipped', 'len', r.html.length);
    if (r.fixed) await prisma.brief.update({ where: { id: brief.id }, data: { html: r.html } });
  }

  const pub = await prisma.thinkTankPublication.findUnique({ where: { id: 'cmubiqrwu01a02mshykc4358i' } });
  if (pub?.html) {
    const r = repair(pub.html, pub.title || 'Untitled');
    console.log('pub:', r.fixed ? 'REPAIRED' : 'skipped', 'len', r.html.length, 'status:', pub.status);
    if (r.fixed) await prisma.thinkTankPublication.update({ where: { id: pub.id }, data: { html: r.html } });
  }
  await prisma.$disconnect();
}
main();
