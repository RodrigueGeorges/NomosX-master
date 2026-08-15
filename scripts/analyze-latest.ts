import { config } from 'dotenv';
config({ path: '.env.local' });
import { prisma } from '../lib/db';
import * as fs from 'fs';

(async () => {
  const pub = await prisma.thinkTankPublication.findFirst({
    where: { id: 'cmsuic4j403zlgyjhsxag21sh' },
    select: { html: true, publicId: true, title: true }
  });
  fs.writeFileSync('scripts/output-latest.html', pub?.html || '');
  const html = pub?.html || '';
  console.log('PublicId:', pub?.publicId);
  console.log('Title:', pub?.title);

  const checks: [string, boolean][] = [
    ['BLUF', html.includes('bluf-box')],
    ['TOC', html.includes('class="toc"')],
    ['Timeline', html.includes('timeline-container')],
    ['ACH matrix', html.includes('ach-matrix')],
    ['Tail risks', html.includes('tail-risk') || html.includes('Tail Risk')],
    ['Outside-in', html.includes('outside-in') || html.includes('Outside-In')],
    ['Red team', html.includes('red-team') || html.includes('Red Team')],
    ['SVG charts', html.includes('<svg')],
    ['Research Protocol', html.includes('Research Protocol')],
    ['AI Disclaimer', html.includes('Methodological Note')],
    ['Track Record', html.includes('Track Record') || html.includes('Brier Score')],
    ['CSS grid fixed (no space)', !html.includes('article .nomosx-brief::before')],
  ];

  // Check for student essay pattern
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  const studentPattern = /\bFirst[,.]?\s+[a-z].*\bSecond[,.]?\s+[a-z].*\bThird[,.]?\s+[a-z]/s.test(text);
  checks.push(['Student essay pattern (bad)', studentPattern]);

  // Count "First," "Second," "Third," occurrences
  const firstCount = (text.match(/\bFirst[,.]?\s+/g) || []).length;
  const secondCount = (text.match(/\bSecond[,.]?\s+/g) || []).length;
  const thirdCount = (text.match(/\bThird[,.]?\s+/g) || []).length;
  console.log(`\n"First," count: ${firstCount}`);
  console.log(`"Second," count: ${secondCount}`);
  console.log(`"Third," count: ${thirdCount}`);

  console.log('\n=== ANALYSIS ===');
  for (const [name, val] of checks) {
    const icon = val ? '✅' : '❌';
    console.log(`  ${icon} ${name}: ${val}`);
  }

  await prisma.$disconnect();
})().catch(e => console.error(e));
