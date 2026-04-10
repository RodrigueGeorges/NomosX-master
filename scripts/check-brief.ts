import { prisma } from '../lib/db';

async function checkBrief(briefId: string) {
  const brief = await prisma.brief.findUnique({
    where: { id: briefId },
    select: {
      id: true,
      question: true,
      html: true,
      createdAt: true,
    },
  });

  if (!brief) {
    console.log('Brief not found');
    return;
  }

  const htmlLength = brief.html?.length || 0;
  const wordCount = brief.html ? brief.html.replace(/<[^>]*>/g, '').split(/\s+/).filter(Boolean).length : 0;
  const citations = brief.html?.match(/\[SRC-\d+\]/g) || [];
  const uniqueCitations = new Set(citations);

  console.log('=== BRIEF ANALYSIS ===');
  console.log('ID:', brief.id);
  console.log('Question:', brief.question);
  console.log('Created:', brief.createdAt);
  console.log('\nHTML Stats:');
  console.log('- Length:', htmlLength, 'chars');
  console.log('- Word Count:', wordCount);
  console.log('- Citation Instances:', citations.length);
  console.log('- Unique Citations:', uniqueCitations.size);
  console.log('- Citations:', Array.from(uniqueCitations).sort().join(', '));

  if (brief.html && htmlLength > 0) {
    console.log('\n=== HTML SAMPLE (first 2000 chars) ===');
    console.log(brief.html.substring(0, 2000));
  }

  await prisma.$disconnect();
}

const briefId = process.argv[2] || 'cmmxvood700b8kpxx9otxchcm';
checkBrief(briefId).catch(console.error);
