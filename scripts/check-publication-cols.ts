import { config } from 'dotenv';
config({ path: '.env.local' });
import { prisma } from '../lib/db';

(async () => {
  const cols = await prisma.$queryRaw`SELECT column_name FROM information_schema.columns WHERE table_name = 'ThinkTankPublication' ORDER BY ordinal_position`;
  console.log('ThinkTankPublication columns:');
  for (const c of cols as any[]) {
    console.log('  -', c.column_name);
  }

  // Check if 'colonne' appears anywhere
  const tables = await prisma.$queryRaw`SELECT table_name, column_name FROM information_schema.columns WHERE column_name ILIKE '%colonne%'`;
  console.log('\nColumns containing "colonne":', JSON.stringify(tables, null, 2));

  // Check missing columns from schema
  const schemaCols = ['verticalId','signalId','draftId','type','title','html','wordCount','language','trustScore','qualityScore','citationCoverage','claimCount','factClaimCount','citedClaimCount','criticalLoopResult','sourceIds','status','correctionNotice','correctedAt','retractedAt','retractionReason','publicId','publishedAt','heroImageUrl','distributedAt','viewCount','tweetedAt','tweetId','createdAt','updatedAt'];
  const dbCols = (cols as any[]).map(c => c.column_name);
  const missing = schemaCols.filter(c => !dbCols.includes(c));
  console.log('\nMissing columns in DB:', missing);

  await prisma.$disconnect();
})().catch(e => console.error(e));
