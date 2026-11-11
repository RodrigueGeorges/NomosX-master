const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const decs = await p.editorialDecision.findMany({
    where: { decision: 'HOLD', createdAt: { gte: new Date('2026-10-01') } },
    orderBy: { createdAt: 'desc' }, take: 30,
    select: { createdAt: true, trustScore: true, qualityScore: true, reasons: true, checks: true }
  });
  const causeCount = {};
  for (const d of decs) {
    const c = d.checks || {};
    const failed = Array.isArray(c.failedChecks) ? c.failedChecks : (c.checks ? Object.keys(c.checks).filter(k=>c.checks[k]===false) : []);
    const key = failed.length ? failed.slice(0,4).join('+') : (d.reasons||[]).join(';').slice(0,60);
    causeCount[key] = (causeCount[key]||0)+1;
    console.log(`${d.createdAt.toISOString().slice(0,10)} trust=${d.trustScore} q=${d.qualityScore} failed=[${failed}] reasons=${(d.reasons||[]).join('|').slice(0,90)}`);
  }
  console.log('\nCAUSES:', JSON.stringify(causeCount));
  await p.$disconnect();
})().catch(e => { console.error(e.message); process.exit(1); });
