/* eslint-disable no-console */
// One-off: check agent performance of recent pipeline runs (Neon prod via DATABASE_URL env)
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });

async function main() {
  const failed = await prisma.pipelineRun.findMany({
    where: { status: 'FAILED' }, orderBy: { createdAt: 'desc' }, take: 8,
    select: { id: true, question: true, format: true, error: true, createdAt: true, durationMs: true },
  });
  for (const r of failed) {
    console.log(`FAILED ${r.id.slice(-8)} | ${r.format} | ${(r.durationMs / 60000).toFixed(1)}min | ${r.createdAt.toISOString().slice(5, 16)} | err: ${(r.error || 'null').slice(0, 220)}`);
  }

  const pubs = await prisma.thinkTankPublication.count();
  const recentPubs = await prisma.thinkTankPublication.findMany({ orderBy: { createdAt: 'desc' }, take: 5, select: { id: true, title: true, status: true, trustScore: true, createdAt: true } }).catch(() => []);
  console.log(`\nTotal publications: ${pubs}`);
  for (const pub of recentPubs) console.log(`  pub ${pub.id.slice(-8)} | ${pub.status} | trust:${pub.trustScore} | ${String(pub.title).slice(0, 60)}`);

  // durable checkpoints count for current run
  const cps = await prisma.agentAuditLog.findMany({
    where: { agent: 'durable_execution' }, orderBy: { timestamp: 'desc' }, take: 10,
    select: { action: true, resource: true, timestamp: true },
  });
  console.log('\n--- DURABLE_STEP recent ---');
  for (const c of cps) console.log(`  ${c.timestamp.toISOString().slice(5, 19)} ${c.action} | ${(c.resource || '').slice(0, 70)}`);

  // cost log recent
  const costs = await prisma.costLog.findMany({ orderBy: { createdAt: 'desc' }, take: 10 }).catch(() => [] as any[]);
  console.log('\n--- CostLog recent ---');
  for (const c of costs as any[]) console.log(`  ${JSON.stringify(c).slice(0, 180)}`);
}

main().finally(() => prisma.$disconnect());
