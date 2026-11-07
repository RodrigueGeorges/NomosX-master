#!/usr/bin/env node
/**
 * MONITORING DASHBOARD - Affiche le status du monitoring en temps réel
 * 
 * Usage:
 *   node scripts/monitoring-dashboard.mjs
 */

import { PrismaClient } from '@prisma/client';
import { setTimeout as sleep } from 'timers/promises';

const prisma = new PrismaClient();

/**
 * Clear console (cross-platform)
 */
function clearConsole() {
  console.clear();
}

/**
 * Format date relative (e.g., "2 minutes ago")
 */
function timeAgo(date) {
  const seconds = Math.floor((new Date() - date) / 1000);
  
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

/**
 * Get monitoring stats
 */
async function getMonitoringStats() {
  // Last 24h sources by provider
  const sourcesByProvider = await prisma.$queryRaw`
    SELECT 
      provider,
      COUNT(*) as count,
      AVG("qualityScore")::numeric(10,2) as avg_quality,
      MAX("createdAt") as last_update
    FROM "Source"
    WHERE "createdAt" >= NOW() - INTERVAL '24 hours'
    GROUP BY provider
    ORDER BY count DESC
    LIMIT 21
  `;
  
  // Last monitoring cycles
  const lastCycles = await prisma.job.findMany({
    where: { type: 'MONITORING_CYCLE' },
    orderBy: { createdAt: 'desc' },
    take: 5
  });
  
  // Total sources
  const totalSources = await prisma.source.count();
  const totalInstitutional = await prisma.source.count({
    where: {
      provider: {
        in: [
          'worldbank', 'cisa', 'nara', 'uk-archives', 'un', 'undp', 'unctad',
          'odni', 'nato', 'nsa', 'enisa', 'cia-foia', 'eeas', 'eda',
          'ministere-armees', 'sgdsn', 'archives-fr', 'imf', 'oecd', 'bis', 'nist'
        ]
      }
    }
  });
  
  // Sources last 24h
  const last24h = await prisma.source.count({
    where: {
      createdAt: {
        gte: new Date(Date.now() - 24 * 60 * 60 * 1000)
      }
    }
  });
  
  return {
    sourcesByProvider,
    lastCycles,
    totalSources,
    totalInstitutional,
    last24h
  };
}

/**
 * Render dashboard
 */
async function renderDashboard() {
  clearConsole();
  
  const stats = await getMonitoringStats();
  
  console.log('╔════════════════════════════════════════════════════════════════════╗');
  console.log('║        🔍 NOMOSX MONITORING DASHBOARD - Institutional Sources      ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝\n');
  
  // Overview
  console.log('📊 OVERVIEW\n');
  console.log(`  Total sources in DB       : ${stats.totalSources.toLocaleString()}`);
  console.log(`  Institutional sources     : ${stats.totalInstitutional.toLocaleString()}`);
  console.log(`  New sources (last 24h)    : ${stats.last24h.toLocaleString()}`);
  
  // Sources by provider (last 24h)
  console.log('\n\n📈 TOP PROVIDERS (Last 24h)\n');
  
  if (stats.sourcesByProvider.length === 0) {
    console.log('  No new sources in last 24h\n');
  } else {
    console.log('  Provider              │ Count │ Avg Quality │ Last Update');
    console.log('  ──────────────────────┼───────┼─────────────┼─────────────────');
    
    for (const row of stats.sourcesByProvider) {
      const provider = row.provider.padEnd(20);
      const count = String(row.count).padStart(5);
      const quality = String(row.avg_quality).padStart(11);
      const lastUpdate = timeAgo(new Date(row.last_update)).padEnd(15);
      
      console.log(`  ${provider} │ ${count} │ ${quality} │ ${lastUpdate}`);
    }
  }
  
  // Last monitoring cycles
  console.log('\n\n⚙️  LAST MONITORING CYCLES\n');
  
  if (stats.lastCycles.length === 0) {
    console.log('  No monitoring cycles recorded\n');
    console.log('  (The standalone monitoring agent was removed — cycles are\n');
    console.log('   now produced by the pipeline worker. See docs/WORKER_DEPLOYMENT.md)\n');
  } else {
    console.log('  Time              │ Status  │ New Sources │ Duration');
    console.log('  ──────────────────┼─────────┼─────────────┼──────────');
    
    for (const cycle of stats.lastCycles) {
      const time = timeAgo(cycle.createdAt).padEnd(16);
      const status = cycle.status === 'DONE' ? '✅ DONE' : '❌ FAIL';
      const statusPad = status.padEnd(7);
      
      let newSources = 'N/A';
      let duration = 'N/A';
      
      if (cycle.result) {
        const result = cycle.result;
        if (Array.isArray(result)) {
          const total = result.reduce((sum, r) => sum + (r.newSources || 0), 0);
          newSources = String(total).padStart(11);
        }
      }
      
      if (cycle.finishedAt && cycle.startedAt) {
        const durationMs = new Date(cycle.finishedAt) - new Date(cycle.startedAt);
        const durationSec = Math.round(durationMs / 1000);
        duration = `${durationSec}s`;
      }
      
      console.log(`  ${time} │ ${statusPad} │ ${newSources} │ ${duration}`);
    }
  }
  
  // Status check
  console.log('\n\n🔄 MONITORING STATUS\n');
  
  const runningMonitoring = await prisma.job.findFirst({
    where: {
      type: 'MONITORING',
      status: 'RUNNING'
    }
  });
  
  if (runningMonitoring) {
    console.log('  ✅ Monitoring agent is RUNNING');
    console.log(`     Started: ${timeAgo(runningMonitoring.createdAt)}\n`);
  } else {
    console.log('  ⚠️  Monitoring agent is NOT running');
    console.log('     Pipeline worker: npm run worker\n');
  }
  
  // Footer
  console.log('╔════════════════════════════════════════════════════════════════════╗');
  console.log('║  Press Ctrl+C to exit                  Refreshing every 30s...     ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝\n');
}

/**
 * Main loop
 */
async function main() {
  console.log('🚀 Starting dashboard...\n');
  
  while (true) {
    try {
      await renderDashboard();
    } catch (error) {
      console.error('Error rendering dashboard:', error.message);
    }
    
    // Refresh every 30s
    await sleep(30000);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n\n👋 Closing dashboard...\n');
  await prisma.$disconnect();
  process.exit(0);
});

main().catch(async (error) => {
  console.error('Fatal error:', error);
  await prisma.$disconnect();
  process.exit(1);
});
