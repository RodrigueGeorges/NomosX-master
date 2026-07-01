import { config } from 'dotenv';
config({ path: '.env.local' });

async function main() {
  const { prisma } = await import('../lib/db');

  console.log('=== POST-DELETION VERIFICATION ===\n');

  const checks: Array<{ table: string; expected: number; actual: number; label: string }> = [];

  // 1. ThinkTankPublication
  const pubs = await prisma.thinkTankPublication.count();
  checks.push({ table: 'ThinkTankPublication', expected: 0, actual: pubs, label: 'Publications' });

  // 2. Brief
  const briefs = await prisma.brief.count();
  checks.push({ table: 'Brief', expected: 0, actual: briefs, label: 'Briefs' });

  // 3. ThinkTankClaim
  const claims = await prisma.thinkTankClaim.count();
  checks.push({ table: 'ThinkTankClaim', expected: 0, actual: claims, label: 'Claims' });

  // 4. ForesightRun
  const foresight = await prisma.foresightRun.count();
  checks.push({ table: 'ForesightRun', expected: 0, actual: foresight, label: 'ForesightRuns' });

  // 5. AgentAuditLog
  const audit = await prisma.agentAuditLog.count();
  checks.push({ table: 'AgentAuditLog', expected: 0, actual: audit, label: 'AgentAuditLog' });

  // 6. ConceptNode
  const concepts = await prisma.conceptNode.count();
  checks.push({ table: 'ConceptNode', expected: 0, actual: concepts, label: 'ConceptNodes (KG)' });

  // 7. ConceptRelation
  const rels = await prisma.conceptRelation.count();
  checks.push({ table: 'ConceptRelation', expected: 0, actual: rels, label: 'ConceptRelations (KG)' });

  // 8. Signal PUBLISHED
  const signalsPublished = await prisma.signal.count({ where: { status: 'PUBLISHED' } });
  checks.push({ table: 'Signal(PUBLISHED)', expected: 0, actual: signalsPublished, label: 'Signals PUBLISHED' });

  // 9. PipelineRun — KEPT
  const pipelineRuns = await prisma.pipelineRun.count();
  checks.push({ table: 'PipelineRun', expected: 866, actual: pipelineRuns, label: 'PipelineRuns (kept)' });

  // 10. Verticals — KEPT
  const verticals = await prisma.vertical.count();
  checks.push({ table: 'Vertical', expected: 14, actual: verticals, label: 'Verticals (kept)' });

  // 11. Signals NEW — should be 20144 (20141 + 3 reset)
  const signalsNew = await prisma.signal.count({ where: { status: 'NEW' } });
  checks.push({ table: 'Signal(NEW)', expected: 20144, actual: signalsNew, label: 'Signals NEW' });

  // Print results
  let allPass = true;
  for (const c of checks) {
    const pass = c.actual === c.expected;
    const icon = pass ? '✅' : '❌';
    if (!pass) allPass = false;
    console.log(`  ${icon} ${c.label}: ${c.actual} (expected ${c.expected})`);
  }

  // Check for orphaned references
  console.log('\n=== ORPHAN CHECK ===');

  // Briefs with pipelineRunId pointing to non-existent PipelineRun (shouldn't exist since all Briefs deleted)
  const orphanBriefs = await prisma.brief.count({
    where: { pipelineRunId: { not: null } },
  });
  console.log(`  ${orphanBriefs === 0 ? '✅' : '❌'} Orphaned Brief refs: ${orphanBriefs}`);

  // AgentAuditLog entries (should be 0)
  console.log(`  ${audit === 0 ? '✅' : '❌'} AgentAuditLog entries: ${audit}`);

  // ConceptNodes with briefIds (should be 0 since all deleted)
  const orphanConcepts = await prisma.conceptNode.count({
    where: { briefIds: { isEmpty: false } },
  });
  console.log(`  ${orphanConcepts === 0 ? '✅' : '❌'} ConceptNodes with briefIds: ${orphanConcepts}`);

  console.log(`\n${allPass ? '✅ ALL CHECKS PASSED — Clean slate verified.' : '❌ SOME CHECKS FAILED — Review above.'}`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
