import { config } from 'dotenv';
config({ path: '.env.local' });

async function main() {
  const { prisma } = await import('../lib/db');

  // Get all brief IDs
  const briefs = await prisma.brief.findMany({
    select: { id: true, publicId: true, question: true, publishedAt: true, createdAt: true },
  });
  const briefIds = briefs.map(b => b.id);
  console.log(`\n=== Brief IDs (${briefIds.length}) ===`);
  for (const b of briefs) {
    console.log(`  ${b.id} | pubId=${b.publicId ?? 'none'} | ${b.createdAt.toISOString()} | ${b.question.slice(0, 70)}`);
  }

  // Check which ConceptNodes reference these brief IDs
  const concepts = await prisma.conceptNode.findMany({
    where: { briefIds: { hasSome: briefIds } },
    select: { id: true, name: true, type: true, briefIds: true, sourceIds: true, occurrenceCount: true },
  });
  console.log(`\n=== ConceptNodes linked to these briefs: ${concepts.length} ===`);
  for (const c of concepts.slice(0, 10)) {
    console.log(`  ${c.name} (${c.type}) | occ=${c.occurrenceCount} | briefs=${c.briefIds.length} | sources=${c.sourceIds.length}`);
  }
  if (concepts.length > 10) console.log(`  ... and ${concepts.length - 10} more`);

  // Check ConceptRelations that reference these concepts
  const conceptIds = concepts.map(c => c.id);
  const rels = await prisma.conceptRelation.count({
    where: {
      OR: [
        { fromConceptId: { in: conceptIds } },
        { toConceptId: { in: conceptIds } },
      ],
    },
  });
  console.log(`\n=== ConceptRelations touching these concepts: ${rels} ===`);

  // Check AgentAuditLog entries — what runIds do they reference?
  const lessonLogs = await prisma.agentAuditLog.findMany({
    where: { action: "LESSON_LEARNED" },
    select: { agent: true, resource: true, metadata: true, timestamp: true },
  });
  console.log(`\n=== LESSON_LEARNED entries: ${lessonLogs.length} ===`);
  for (const l of lessonLogs.slice(0, 10)) {
    const meta = JSON.parse(l.metadata || '{}');
    console.log(`  agent=${l.agent} | runId=${l.resource} | lesson=${(meta.lesson || '').slice(0, 80)} | ${l.timestamp.toISOString()}`);
  }
  if (lessonLogs.length > 10) console.log(`  ... and ${lessonLogs.length - 10} more`);

  // Check PERFORMANCE_RECORD entries
  const perfLogs = await prisma.agentAuditLog.findMany({
    where: { action: "PERFORMANCE_RECORD" },
    select: { agent: true, resource: true, metadata: true, timestamp: true },
  });
  console.log(`\n=== PERFORMANCE_RECORD entries: ${perfLogs.length} ===`);
  for (const p of perfLogs.slice(0, 5)) {
    const meta = JSON.parse(p.metadata || '{}');
    console.log(`  agent=${p.agent} | runId=${p.resource} | trust=${meta.trustScore} | q="${(meta.question || '').slice(0, 60)}" | ${p.timestamp.toISOString()}`);
  }
  if (perfLogs.length > 5) console.log(`  ... and ${perfLogs.length - 5} more`);

  // Check if PipelineRun IDs from lessons match any of the 866 PipelineRuns
  const lessonRunIds = lessonLogs.map(l => l.resource).filter(Boolean);
  const matchingRuns = await prisma.pipelineRun.count({
    where: { id: { in: lessonRunIds } },
  });
  console.log(`\n=== PipelineRuns referenced by lessons: ${matchingRuns}/${lessonRunIds.length} ===`);

  // Check other AgentAuditLog actions
  const otherActions = await prisma.agentAuditLog.groupBy({
    by: ["action"],
    _count: true,
  });
  console.log(`\n=== All AgentAuditLog actions: ===`);
  for (const a of otherActions) {
    console.log(`  ${a.action}: ${a._count}`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
