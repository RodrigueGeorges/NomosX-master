#!/usr/bin/env tsx
/**
 * Query the DB for previous pipeline run metrics (the "before" snapshot).
 */
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Get recent pipeline-related audit logs
  const logs = await prisma.agentAuditLog.findMany({
    where: {
      action: {
        in: ['PIPELINE_COMPLETE', 'MOA_RUN', 'SCOUT_COMPLETE', 'CITATION_VERIFICATION', 'SELF_CORRECTION'],
      },
    },
    orderBy: { timestamp: 'desc' },
    take: 10,
    select: { timestamp: true, action: true, metadata: true, agent: true },
  });

  console.log(`\n=== BEFORE: ${logs.length} recent audit log entries ===\n`);
  for (const log of logs) {
    const meta = typeof log.metadata === 'string' ? JSON.parse(log.metadata) : log.metadata;
    console.log(`[${log.timestamp.toISOString()}] ${log.action} (${log.agent})`);
    if (meta) {
      const keys = Object.keys(meta).filter(k => !['timestamp'].includes(k));
      for (const k of keys.slice(0, 8)) {
        const v = meta[k];
        if (typeof v === 'number') {
          console.log(`  ${k}: ${v}`);
        } else if (typeof v === 'string' && v.length < 100) {
          console.log(`  ${k}: ${v}`);
        } else if (Array.isArray(v)) {
          console.log(`  ${k}: [${v.length} items]`);
        }
      }
    }
    console.log();
  }

  // Get briefs count
  const briefCount = await prisma.brief.count();
  console.log(`Total briefs in DB: ${briefCount}`);

  // Get latest brief
  const latestBrief = await prisma.brief.findFirst({
    orderBy: { createdAt: 'desc' },
    select: { id: true, question: true, createdAt: true, kind: true, trustScore: true, qualityScore: true },
  });
  if (latestBrief) {
    console.log(`\nLatest brief: ${latestBrief.id}`);
    console.log(`  Question: ${latestBrief.question?.slice(0, 100)}`);
    console.log(`  Created: ${latestBrief.createdAt.toISOString()}`);
    console.log(`  Kind: ${latestBrief.kind}, Trust: ${latestBrief.trustScore}, Quality: ${latestBrief.qualityScore}`);
  }

  // Get all audit log action types
  const actionTypes = await prisma.agentAuditLog.groupBy({
    by: ['action'],
    _count: true,
    orderBy: { _count: { action: 'desc' } },
    take: 20,
  });
  console.log(`\n=== Audit Log Actions (all time) ===`);
  for (const at of actionTypes) {
    console.log(`  ${at.action}: ${at._count.action}`);
  }

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
