import { prisma } from '../lib/db';
async function main() {
  const brief = await prisma.brief.findUnique({ where: { id: 'cmuqo0hqr02edrfzggds6znt6' },
    select: { id: true, question: true, pipelineRunId: true, publishedAt: true, publicId: true, metadata: true } });
  console.log('BRIEF:', JSON.stringify(brief, null, 2)?.slice(0, 1500));
  const run = await prisma.pipelineRun.findUnique({ where: { id: 'cmuqlow9m0002rfzgvuwwy7yn' } });
  const steps = (run?.steps as any) ?? {};
  console.log('RUN status:', run?.status, 'error:', String(run?.error ?? '').slice(0, 300));
  const gate = steps.gate ?? steps.publicationGate;
  console.log('gate decision:', gate?.decision);
  for (const c of (gate?.checks ?? [])) console.log(`  ${c.checkType}: ${c.passed ? 'PASS' : 'FAIL'} — ${String(c.details).slice(0, 100)}`);
  console.log('freshness:', JSON.stringify(steps.evaluationFreshness));
  console.log('critic:', JSON.stringify({ verdict: steps.critic?.verdict, score: steps.critic?.overallScore, groundedness: steps.critic?.groundedness }));
  console.log('da:', JSON.stringify({ verdict: steps.devilsAdvocate?.verdict, score: steps.devilsAdvocate?.publishabilityScore, stale: steps.devilsAdvocate?.stale }));
  console.log('struct:', JSON.stringify({ score: steps.structuralEditor?.overallStructure, arc: steps.structuralEditor?.narrativeArcValid }));
  console.log('terminal:', JSON.stringify(steps.terminalReject));
  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
