import { config } from 'dotenv';
config({ path: '.env.local' });
import { prisma } from '../lib/db';
import * as fs from 'fs';

(async () => {
  const pub = await prisma.thinkTankPublication.findFirst({
    where: { id: 'cmsucl97r03n812ho5skfnk18' },
    select: { html: true }
  });
  const html = pub?.html || '';
  let idx = 0;
  let count = 0;
  while ((idx = html.indexOf('nomosx-brief::before', idx)) !== -1) {
    const ctx = html.substring(idx - 30, idx + 30);
    console.log(`DB HTML at index ${idx}: ${JSON.stringify(ctx)}`);
    idx += 1;
    count++;
    if (count > 5) break;
  }

  // Compare with file
  const fileHtml = fs.readFileSync('scripts/output-latest.html', 'utf-8');
  console.log('\nFile HTML same as DB?', fileHtml === html);
  console.log('File length:', fileHtml.length, 'DB length:', html.length);

  await prisma.$disconnect();
})().catch(e => console.error(e));
