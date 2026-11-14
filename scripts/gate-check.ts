import { prisma } from '../lib/db';
async function main() {
  const run = await prisma.pipelineRun.findFirst({ orderBy: { createdAt: 'desc' } });
  const obj: any = (run?.steps as any) ?? {};
  for (const k of ['authorityCorpus','devilsAdvocate','evaluationFreshness','centralScenarioRequired','factCheckerFatalFlagged','evidenceBankValidation','claimBinding','sourceCheck','viability','brief']) {
    if (obj[k] !== undefined) console.log(`\n### ${k}:`, JSON.stringify(obj[k], null, 1).slice(0, 2500));
  }
}
main().finally(() => prisma.$disconnect());
