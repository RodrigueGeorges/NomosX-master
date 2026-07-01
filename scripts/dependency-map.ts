import { config } from 'dotenv';
config({ path: '.env.local' });

async function main() {
  const { prisma } = await import('../lib/db');

  // 1. ThinkTankPublication
  const pubs = await prisma.thinkTankPublication.findMany({
    select: { id: true, type: true, status: true, signalId: true, draftId: true, publicId: true, createdAt: true, title: true },
  });
  console.log(`\n=== ThinkTankPublication: ${pubs.length} ===`);
  for (const p of pubs) {
    console.log(`  ${p.id} | ${p.type} | ${p.status} | signal=${p.signalId ?? 'none'} | draft=${p.draftId ?? 'none'} | ${p.title.slice(0, 60)}`);
  }

  // 2. ThinkTankClaim (FK: publicationId, onDelete: Cascade)
  const claims = await prisma.thinkTankClaim.count();
  console.log(`\n=== ThinkTankClaim: ${claims} ===`);

  // 3. ThinkTankEvidenceSpan (FK: claimId → ThinkTankClaim, onDelete: Cascade)
  const evidence = await prisma.thinkTankEvidenceSpan.count();
  console.log(`\n=== ThinkTankEvidenceSpan: ${evidence} ===`);

  // 4. ThinkTankPublicationRun (FK: publicationId, onDelete: Cascade)
  const runs = await prisma.thinkTankPublicationRun.count();
  console.log(`\n=== ThinkTankPublicationRun: ${runs} ===`);

  // 5. ThinkTankQualityCheck (FK: publicationId, onDelete: Cascade)
  const checks = await prisma.thinkTankQualityCheck.count();
  console.log(`\n=== ThinkTankQualityCheck: ${checks} ===`);

  // 6. ForesightRun (FK: publicationId, onDelete: Cascade)
  const foresight = await prisma.foresightRun.count();
  console.log(`\n=== ForesightRun: ${foresight} ===`);

  // 7. Brief — linked via publicId, not FK. Check how many have publicId set
  const briefsWithPublicId = await prisma.brief.count({ where: { NOT: { publicId: null } } });
  const totalBriefs = await prisma.brief.count();
  console.log(`\n=== Brief: ${totalBriefs} total, ${briefsWithPublicId} with publicId ===`);

  // 8. Draft — linked via draftId on ThinkTankPublication
  const drafts = await prisma.draft.count();
  console.log(`\n=== Draft: ${drafts} ===`);

  // 9. ConceptNode (Knowledge Graph) — linked via briefIds array
  const concepts = await prisma.conceptNode.count();
  const conceptsWithBriefIds = await prisma.conceptNode.count({ where: { NOT: { briefIds: { isEmpty: true } } } });
  console.log(`\n=== ConceptNode: ${concepts} total, ${conceptsWithBriefIds} with briefIds ===`);

  // 10. ConceptRelation
  const conceptRels = await prisma.conceptRelation.count();
  console.log(`\n=== ConceptRelation: ${conceptRels} ===`);

  // 11. AgentAuditLog — lessons & performance records
  const auditLogs = await prisma.agentAuditLog.count();
  const lessons = await prisma.agentAuditLog.count({ where: { action: "LESSON_LEARNED" } });
  const perfRecords = await prisma.agentAuditLog.count({ where: { action: "PERFORMANCE_RECORD" } });
  console.log(`\n=== AgentAuditLog: ${auditLogs} total, ${lessons} LESSON_LEARNED, ${perfRecords} PERFORMANCE_RECORD ===`);

  // 12. PipelineRun
  const pipelineRuns = await prisma.pipelineRun.count();
  console.log(`\n=== PipelineRun: ${pipelineRuns} ===`);

  // 13. Signal — check how many are PUBLISHED (may have been set by demo pub dispatch)
  const signalsPublished = await prisma.signal.count({ where: { status: "PUBLISHED" } });
  const signalsNew = await prisma.signal.count({ where: { status: "NEW" } });
  const signalsHeld = await prisma.signal.count({ where: { status: "HELD" } });
  const signalsSilent = await prisma.signal.count({ where: { status: "SILENT" } });
  const signalsRejected = await prisma.signal.count({ where: { status: "REJECTED" } });
  const signalsExpired = await prisma.signal.count({ where: { status: "EXPIRED" } });
  console.log(`\n=== Signal: NEW=${signalsNew}, PUBLISHED=${signalsPublished}, HELD=${signalsHeld}, SILENT=${signalsSilent}, REJECTED=${signalsRejected}, EXPIRED=${signalsExpired} ===`);

  // 14. Signals linked to the 19 pubs
  const pubSignalIds = pubs.map(p => p.signalId).filter(Boolean) as string[];
  if (pubSignalIds.length > 0) {
    const linkedSignals = await prisma.signal.findMany({
      where: { id: { in: pubSignalIds } },
      select: { id: true, status: true, title: true },
    });
    console.log(`\n=== Signals linked to publications: ${linkedSignals.length} ===`);
    for (const s of linkedSignals) {
      console.log(`  ${s.id} | ${s.status} | ${s.title.slice(0, 60)}`);
    }
  }

  // 15. Brief IDs from pipeline runs — check if briefs exist for these pubs
  const briefIds = await prisma.brief.findMany({
    select: { id: true, publicId: true, question: true, publishedAt: true },
    take: 50,
  });
  console.log(`\n=== Brief samples (first 50): ===`);
  for (const b of briefIds.slice(0, 20)) {
    console.log(`  ${b.id} | publicId=${b.publicId ?? 'none'} | ${b.question.slice(0, 60)}`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
