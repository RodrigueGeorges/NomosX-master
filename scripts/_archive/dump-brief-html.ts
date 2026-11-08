import { config } from 'dotenv';
config({ path: '.env.local' });
async function main() {
  const { prisma } = await import('../lib/db');
  const brief = await prisma.brief.findUnique({ where: { id: 'cmubiqa69017w2mshy1sz1fto' } });
  if (!brief) { console.log('NOT FOUND'); process.exit(1); }
  const html = (brief as any).html || (brief as any).content || '';
  require('fs').writeFileSync('scripts/last-run-brief.html', html);
  console.log('html len:', html.length, 'style tags:', (html.match(/<style/gi) || []).length, '/style:', (html.match(/<\/style>/gi) || []).length);
  const idx = html.indexOf('111111');
  console.log('first 111111 at', idx, 'ctx:', JSON.stringify(html.slice(Math.max(0, idx - 150), idx + 60)));
  await prisma.$disconnect();
}
main();
