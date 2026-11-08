import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';

const prisma = new PrismaClient();

async function main() {
  const briefId = process.argv[2] || 'cmtycmu0t01ivjxfaiyeoua4o';
  const brief = await prisma.brief.findUnique({
    where: { id: briefId },
    select: {
      id: true, question: true, html: true, createdAt: true,
      metadata: true, kind: true, publicId: true,
    },
  });

  if (!brief) {
    console.log('Brief not found:', briefId);
    return;
  }

  const meta = (brief.metadata as any) || {};
  console.log('=== BRIEF METRICS ===');
  console.log('Question:', brief.question);
  console.log('Kind:', brief.kind);
  console.log('Trust Score:', meta.trustScore ?? 'N/A');
  console.log('Quality Score:', meta.qualityScore ?? 'N/A');
  console.log('Word Count:', meta.wordCount ?? 'N/A');
  console.log('Cost USD:', meta.costUsd ?? 'N/A');
  console.log('HTML Length:', brief.html?.length || 0);
  console.log('Created:', brief.createdAt);
  console.log('Metadata keys:', Object.keys(meta).join(', '));

  if (brief.html) {
    fs.writeFileSync('output-publication.html', brief.html);
    console.log('\nSaved to output-publication.html');

    // Extract text content for analysis
    const text = brief.html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&/g, '&')
      .replace(/</g, '<')
      .replace(/>/g, '>')
      .replace(/"/g, '"')
      .replace(/\s+/g, ' ')
      .trim();

    console.log('\n=== TEXT PREVIEW (first 3000 chars) ===');
    console.log(text.substring(0, 3000));
    console.log('\n=== TEXT PREVIEW (last 2000 chars) ===');
    console.log(text.substring(text.length - 2000));
    console.log('\n=== TOTAL TEXT LENGTH ===');
    console.log(text.length, 'chars');
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
