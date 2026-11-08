import { config } from 'dotenv';
config({ path: '.env.local' });
import { prisma } from '../lib/db';

(async () => {
  const brief = await prisma.brief.findFirst({ orderBy: { createdAt: 'desc' } });
  const pub = await prisma.thinkTankPublication.findFirst({ orderBy: { createdAt: 'desc' } });
  const run = await prisma.pipelineRun.findFirst({ orderBy: { createdAt: 'desc' } });
  const sourceCount = await prisma.source.count();

  console.log('=== DB VERIFICATION ===\n');
  console.log('Brief:', brief ? {
    id: brief.id,
    kind: brief.kind,
    question: brief.question.slice(0, 100),
    trustScore: brief.trustScore,
    qualityScore: brief.qualityScore,
    publicId: brief.publicId,
    publishedAt: brief.publishedAt,
    htmlLength: brief.html.length,
  } : 'NONE');

  console.log('\nPublication:', pub ? {
    id: pub.id,
    title: pub.title,
    type: pub.type,
    trustScore: pub.trustScore,
    qualityScore: pub.qualityScore,
    wordCount: pub.wordCount,
    citationCoverage: pub.citationCoverage,
    claimCount: pub.claimCount,
    citedClaimCount: pub.citedClaimCount,
    sourceCount: pub.sourceIds.length,
  } : 'NONE');

  console.log('\nPipelineRun:', run ? {
    id: run.id,
    status: run.status,
    trustScore: run.trustScore,
    durationMs: run.durationMs,
    totalCostUsd: run.totalCostUsd,
    sourcesFound: run.sourcesFound,
    sourcesUsed: run.sourcesUsed,
  } : 'NONE');

  console.log('\nSources in DB:', sourceCount);
  console.log('\n=== VERIFICATION COMPLETE ===');

  await prisma.$disconnect();
})();
