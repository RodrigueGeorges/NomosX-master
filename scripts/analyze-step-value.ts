import { prisma } from '../lib/db';
const limit = Number(process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] ?? 50);
const mean = (xs: number[]) => (xs.length ? xs.reduce((a,b)=>a+b,0)/xs.length : 0);
async function main() {
  const pubs = await prisma.thinkTankPublication.findMany({
    orderBy: { createdAt: 'desc' }, take: limit,
    select: { id: true, status: true, trustScore: true, criticalLoopResult: true, createdAt: true },
  });
  const stat = (p: any) => ((p.criticalLoopResult as any)?.stats ?? {});

  const primer = pubs.map(p=>stat(p).contextPrimer).filter(Boolean);
  const kg = pubs.map(p=>stat(p).knowledgeGraph).filter(Boolean);
  const moa = pubs.map(p=>stat(p).moa).filter(Boolean);
  const wit = pubs.map(p=>stat(p).witness).filter(Boolean);
  const ep = pubs.map(p=>stat(p).episodicMemory).filter(Boolean);
  const meta = pubs.map(p=>stat(p).metaAnalysis).filter(Boolean);
  const delib = pubs.map(p=>stat(p).deliberation).filter(Boolean);
  const council = pubs.map(p=>stat(p).harvardCouncil).filter(Boolean);

  console.log(`runs=${pubs.length}`);
  console.log(`contextPrimer: n=${primer.length} meanDuration=${Math.round(mean(primer.map((x:any)=>x.durationMs??0)))}ms | conceptsFound=${mean(primer.map((x:any)=>x.knownConcepts??0)).toFixed(1)} | priorBriefs=${mean(primer.map((x:any)=>x.priorBriefs??0)).toFixed(1)} | trendBreaks=${mean(primer.map((x:any)=>x.trendBreaks??0)).toFixed(1)}`);
  console.log(`knowledgeGraph: n=${kg.length} entities=${mean(kg.map((x:any)=>x.entities??0)).toFixed(1)} relations=${mean(kg.map((x:any)=>x.relations??0)).toFixed(1)} bridges=${mean(kg.map((x:any)=>x.bridges??0)).toFixed(1)}`);
  console.log(`moa: n=${moa.length} consensus=${mean(moa.map((x:any)=>x.consensus??0)).toFixed(2)} confidence=${mean(moa.map((x:any)=>x.overallConfidence??0)).toFixed(2)} uniqueInsights=${mean(moa.map((x:any)=>x.uniqueInsights??0)).toFixed(1)}`);
  console.log(`witness: n=${wit.length} interventions=${mean(wit.map((x:any)=>x.totalInterventions??0)).toFixed(1)} anomalies=${mean(wit.map((x:any)=>x.totalAnomalies??0)).toFixed(1)} recommends=${wit.filter((x:any)=>x.recommendsChanges).length}`);
  console.log(`episodic: n=${ep.length}`);
  console.log(`metaAnalysis: n=${meta.length} sample=${JSON.stringify(meta[0]).slice(0,140)}`);
  console.log(`deliberation: n=${delib.length} sample=${JSON.stringify(delib[0]).slice(0,140)}`);
  console.log(`harvardCouncil: n=${council.length} sample=${JSON.stringify(council[0]).slice(0,140)}`);

  // cost attribution
  const costs = pubs.map(p=>stat(p).totalCostUsd).filter((x:any)=>typeof x==='number');
  console.log(`totalCostUsd mean=$${mean(costs).toFixed(2)} n=${costs.length}`);
  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
