#!/usr/bin/env tsx
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const briefs = await prisma.brief.findMany({
    orderBy: { createdAt: 'desc' },
    take: 3,
    select: { id: true, question: true, createdAt: true, kind: true, trustScore: true, qualityScore: true, html: true },
  });

  for (const b of briefs) {
    console.log('---');
    console.log('ID:', b.id);
    console.log('Date:', b.createdAt.toISOString());
    console.log('Kind:', b.kind);
    console.log('Trust:', b.trustScore, 'Quality:', b.qualityScore);
    console.log('Question:', (b.question || '').slice(0, 80));
    console.log('HTML size:', (b.html || '').length, 'chars');
  }
  await prisma.$disconnect();
}
main().catch(e => { console.error(e.message); process.exit(1); });
