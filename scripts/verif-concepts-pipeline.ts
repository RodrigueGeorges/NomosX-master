import { config } from 'dotenv';
config({ path: '.env.local' });

async function main() {
  const { prisma } = await import('../lib/db');

  // === VÉRIF 1: Trace the 248 "non-demo" ConceptNodes ===

  // Get all 11 demo brief IDs
  const briefs = await prisma.brief.findMany({ select: { id: true } });
  const briefIds = briefs.map(b => b.id);
  console.log(`\n=== VÉRIF 1: Tracing 248 "non-demo" ConceptNodes ===`);
  console.log(`Demo brief IDs: ${briefIds.length}`);

  // Concepts linked to demo briefs
  const demoConcepts = await prisma.conceptNode.findMany({
    where: { briefIds: { hasSome: briefIds } },
    select: { id: true, name: true, briefIds: true, sourceIds: true, firstSeen: true },
  });
  console.log(`Concepts linked to demo briefs: ${demoConcepts.length}`);

  // Concepts NOT linked to demo briefs (the 248)
  const nonDemoConcepts = await prisma.conceptNode.findMany({
    where: { NOT: { briefIds: { hasSome: briefIds } } },
    select: { id: true, name: true, type: true, briefIds: true, sourceIds: true, firstSeen: true, occurrenceCount: true },
  });
  console.log(`Concepts NOT linked to demo briefs: ${nonDemoConcepts.length}`);

  // Check: do these 248 concepts have ANY briefIds at all?
  const withBriefIds = nonDemoConcepts.filter(c => c.briefIds && c.briefIds.length > 0);
  const withoutBriefIds = nonDemoConcepts.filter(c => !c.briefIds || c.briefIds.length === 0);
  console.log(`  - With briefIds (non-empty): ${withBriefIds.length}`);
  console.log(`  - Without briefIds (empty): ${withoutBriefIds.length}`);

  // For those with briefIds, check if those briefs still exist
  if (withBriefIds.length > 0) {
    const allReferencedBriefIds = [...new Set(withBriefIds.flatMap(c => c.briefIds))];
    const existingBriefs = await prisma.brief.findMany({
      where: { id: { in: allReferencedBriefIds } },
      select: { id: true },
    });
    const existingBriefIdSet = new Set(existingBriefs.map(b => b.id));
    const orphanedBriefRefs = allReferencedBriefIds.filter(id => !existingBriefIdSet.has(id));
    console.log(`  - Referenced brief IDs: ${allReferencedBriefIds.length}`);
    console.log(`  - Existing briefs found: ${existingBriefs.length}`);
    console.log(`  - Orphaned brief refs (brief deleted but concept remains): ${orphanedBriefRefs.length}`);
    if (orphanedBriefRefs.length > 0) {
      console.log(`  - Orphaned brief IDs:`, orphanedBriefRefs.slice(0, 10));
    }
  }

  // For those without briefIds — where did they come from?
  // Check if they have sourceIds that match demo sources
  if (withoutBriefIds.length > 0) {
    console.log(`\n  === Concepts WITHOUT briefIds (origin unknown): ${withoutBriefIds.length} ===`);
    // Sample first 15
    for (const c of withoutBriefIds.slice(0, 15)) {
      console.log(`    ${c.name} (${c.type}) | occ=${c.occurrenceCount} | sources=${c.sourceIds?.length ?? 0} | firstSeen=${c.firstSeen?.toISOString()}`);
    }

    // Check if their sourceIds overlap with demo pub sourceIds
    const demoPubs = await prisma.thinkTankPublication.findMany({
      select: { sourceIds: true },
    });
    const demoSourceIds = new Set(demoPubs.flatMap(p => p.sourceIds));
    const overlapConcepts = withoutBriefIds.filter(c =>
      c.sourceIds?.some(sid => demoSourceIds.has(sid))
    );
    console.log(`\n  Concepts without briefIds but sharing sourceIds with demo pubs: ${overlapConcepts.length}`);
    for (const c of overlapConcepts.slice(0, 5)) {
      const sharedSources = c.sourceIds.filter(sid => demoSourceIds.has(sid));
      console.log(`    ${c.name} | shared sources: ${sharedSources.length}/${c.sourceIds.length}`);
    }
  }

  // Check firstSeen dates — are they all within the demo period (Feb-Jul 2026)?
  const firstSeenDates = nonDemoConcepts.map(c => c.firstSeen?.toISOString()?.slice(0, 10)).filter(Boolean);
  const dateCounts: Record<string, number> = {};
  for (const d of firstSeenDates) {
    dateCounts[d] = (dateCounts[d] || 0) + 1;
  }
  console.log(`\n  === firstSeen distribution of 248 non-demo concepts: ===`);
  for (const [date, count] of Object.entries(dateCounts).sort()) {
    console.log(`    ${date}: ${count}`);
  }

  // === PipelineRun stats (Option B data) ===
  console.log(`\n\n=== PipelineRun cost/duration stats (Option B data) ===`);
  const runs = await prisma.pipelineRun.findMany({
    select: { totalCostUsd: true, durationMs: true, status: true, format: true, createdAt: true },
  });
  console.log(`Total PipelineRuns: ${runs.length}`);

  const completed = runs.filter(r => r.status === 'COMPLETED');
  const failed = runs.filter(r => r.status === 'FAILED');
  const running = runs.filter(r => r.status === 'RUNNING');
  console.log(`  COMPLETED: ${completed.length}, FAILED: ${failed.length}, RUNNING: ${running.length}`);

  const totalCost = runs.reduce((sum, r) => sum + (r.totalCostUsd || 0), 0);
  const totalDuration = runs.reduce((sum, r) => sum + (r.durationMs || 0), 0);
  const avgCost = totalCost / runs.length;
  const avgDuration = totalDuration / runs.length;
  console.log(`  Total cost: $${totalCost.toFixed(4)}`);
  console.log(`  Total duration: ${(totalDuration / 1000).toFixed(0)}s`);
  console.log(`  Avg cost per run: $${avgCost.toFixed(4)}`);
  console.log(`  Avg duration per run: ${(avgDuration / 1000).toFixed(0)}s`);

  // By format
  const briefRuns = runs.filter(r => r.format === 'brief');
  const strategicRuns = runs.filter(r => r.format === 'strategic');
  const briefCost = briefRuns.reduce((s, r) => s + (r.totalCostUsd || 0), 0);
  const strategicCost = strategicRuns.reduce((s, r) => s + (r.totalCostUsd || 0), 0);
  console.log(`\n  By format:`);
  console.log(`    brief: ${briefRuns.length} runs, $${briefCost.toFixed(4)} total, $${(briefCost / Math.max(1, briefRuns.length)).toFixed(4)} avg`);
  console.log(`    strategic: ${strategicRuns.length} runs, $${strategicCost.toFixed(4)} total, $${(strategicCost / Math.max(1, strategicRuns.length)).toFixed(4)} avg`);

  // Completed only
  const completedCost = completed.reduce((s, r) => s + (r.totalCostUsd || 0), 0);
  const completedDuration = completed.reduce((s, r) => s + (r.durationMs || 0), 0);
  console.log(`\n  COMPLETED only:`);
  console.log(`    ${completed.length} runs, $${completedCost.toFixed(4)} total, $${(completedCost / Math.max(1, completed.length)).toFixed(4)} avg`);
  console.log(`    Avg duration: ${(completedDuration / Math.max(1, completed.length) / 1000).toFixed(0)}s`);

  // Check: do any Briefs reference PipelineRun IDs?
  const briefsWithRunId = await prisma.brief.findMany({
    where: { NOT: { pipelineRunId: null } },
    select: { id: true, pipelineRunId: true },
  });
  console.log(`\n  Briefs referencing pipelineRunId: ${briefsWithRunId.length}`);
  const referencedRunIds = briefsWithRunId.map(b => b.pipelineRunId).filter(Boolean) as string[];
  const matchingRunsForBriefs = await prisma.pipelineRun.count({
    where: { id: { in: referencedRunIds } },
  });
  console.log(`  PipelineRuns referenced by Briefs that exist: ${matchingRunsForBriefs}/${referencedRunIds.length}`);

  // Check: do AgentAuditLog entries reference PipelineRun IDs?
  const auditRefs = await prisma.agentAuditLog.findMany({
    where: { resource: { not: null } },
    select: { resource: true },
    distinct: ['resource'],
  });
  const auditRunIds = auditRefs.map(a => a.resource).filter(Boolean) as string[];
  const matchingRunsForAudit = await prisma.pipelineRun.count({
    where: { id: { in: auditRunIds } },
  });
  console.log(`  PipelineRuns referenced by AgentAuditLog that exist: ${matchingRunsForAudit}/${auditRunIds.length}`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
