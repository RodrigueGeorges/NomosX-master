/**
 * Clean Slate — Delete ALL publications, briefs, pipeline runs, and related data.
 *
 * This resets NomosX to a clean state before launching a fresh publication.
 * Deletes in dependency order to avoid foreign key constraint violations.
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { prisma } from '../lib/db';

async function cleanSlate() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║  NomosX — CLEAN SLATE (delete all publications)            ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log(`  Started: ${new Date().toISOString()}\n`);

  const tables = [
    { name: 'PublicationReaction', model: prisma.publicationReaction },
    { name: 'PublicationComment', model: prisma.publicationComment },
    { name: 'ThinkTankPublicationRun', model: prisma.thinkTankPublicationRun },
    { name: 'ThinkTankPublication', model: prisma.thinkTankPublication },
    { name: 'Brief', model: prisma.brief },
    { name: 'PipelineRun', model: prisma.pipelineRun },
    { name: 'AgentAuditLog', model: prisma.agentAuditLog },
    { name: 'SourceChunk', model: prisma.sourceChunk },
    { name: 'SourceAuthor', model: prisma.sourceAuthor },
    { name: 'SourceInstitution', model: prisma.sourceInstitution },
    { name: 'SourceDomain', model: prisma.sourceDomain },
    { name: 'Source', model: prisma.source },
  ];

  let totalDeleted = 0;

  for (const { name, model } of tables) {
    try {
      const count = await model.count();
      if (count > 0) {
        await model.deleteMany({});
        console.log(`  ✅ ${name}: ${count} records deleted`);
        totalDeleted += count;
      } else {
        console.log(`  ⏭️  ${name}: 0 records (skip)`);
      }
    } catch (err: any) {
      console.warn(`  ⚠️  ${name}: ${err.message}`);
    }
  }

  console.log(`\n  Total records deleted: ${totalDeleted}`);
  console.log(`  Finished: ${new Date().toISOString()}`);
  console.log('\n  ✅ Clean slate complete — ready for fresh publication\n');

  await prisma.$disconnect();
  process.exit(0);
}

cleanSlate().catch((err) => {
  console.error('Clean slate failed:', err);
  process.exit(1);
});
