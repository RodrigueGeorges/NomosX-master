import { config } from 'dotenv';
config({ path: '.env.local' });

async function main() {
  const { prisma } = await import('../lib/db');

  // STEP 1: AgentAuditLog — DELETE ALL (563)
  console.log('STEP 1: Deleting AgentAuditLog...');
  const auditDeleted = await prisma.agentAuditLog.deleteMany({});
  console.log(`  ✅ Deleted ${auditDeleted.count} AgentAuditLog records`);

  // STEP 2: ConceptRelation — DELETE ALL (318)
  console.log('STEP 2: Deleting ConceptRelation...');
  const relDeleted = await prisma.conceptRelation.deleteMany({});
  console.log(`  ✅ Deleted ${relDeleted.count} ConceptRelation records`);

  // STEP 3: ConceptNode — DELETE ALL (295)
  console.log('STEP 3: Deleting ConceptNode...');
  const conceptDeleted = await prisma.conceptNode.deleteMany({});
  console.log(`  ✅ Deleted ${conceptDeleted.count} ConceptNode records`);

  // STEP 4: Signal — UPDATE 3 PUBLISHED → NEW
  console.log('STEP 4: Resetting 3 PUBLISHED signals to NEW...');
  const signalReset = await prisma.signal.updateMany({
    where: { status: 'PUBLISHED' },
    data: { status: 'NEW' },
  });
  console.log(`  ✅ Reset ${signalReset.count} signals to NEW`);

  // STEP 5: ThinkTankPublication — DELETE ALL (19)
  // No children (0 claims, 0 evidence, 0 runs, 0 checks, 0 foresight)
  console.log('STEP 5: Deleting ThinkTankPublication...');
  const pubDeleted = await prisma.thinkTankPublication.deleteMany({});
  console.log(`  ✅ Deleted ${pubDeleted.count} ThinkTankPublication records`);

  // STEP 6: Brief — DELETE ALL (11)
  // No FK from Brief to ThinkTankPublication (linked via publicId, not FK)
  // Brief.pipelineRunId → PipelineRun.id (no onDelete, but we keep PipelineRun)
  console.log('STEP 6: Deleting Brief...');
  const briefDeleted = await prisma.brief.deleteMany({});
  console.log(`  ✅ Deleted ${briefDeleted.count} Brief records`);

  // STEP 7: PipelineRun — KEPT (Option A)
  console.log('STEP 7: PipelineRun — KEPT (telemetry preserved)');

  await prisma.$disconnect();
  console.log('\n✅ Clean slate deletion complete.');
}

main().catch((e) => {
  console.error('❌ Deletion failed:', e);
  process.exit(1);
});
