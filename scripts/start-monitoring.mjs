#!/usr/bin/env node
/**
 * START MONITORING AGENT - Crawl continu des sources institutionnelles
 * 
 * Usage:
 *   node scripts/start-monitoring.mjs                    # Mode par défaut
 *   node scripts/start-monitoring.mjs --realtime         # Mode temps réel (cyber)
 *   node scripts/start-monitoring.mjs --once             # Run once (test)
 */

import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, "..", ".env") });

if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = "dev-jwt-secret-please-change-32chars-min";
}
if (!process.env.OPENAI_API_KEY) {
  process.env.OPENAI_API_KEY = "dev-openai-key";
}

import { PrismaClient } from "../generated/prisma-client/index.js";

const prisma = new PrismaClient();

// Parse args
const args = process.argv.slice(2);
const isRealtime = args.includes('--realtime');
const runOnce = args.includes('--once');

/**
 * Configuration par défaut
 */
const DEFAULT_CONFIG = {
  providers: [
    'cisa',
    'nist',
    'worldbank',
    'odni',
    'nato',
    'un',
    'imf',
    'oecd'
  ],
  queries: [
    'cybersecurity',
    'artificial intelligence',
    'climate change',
    'geopolitical risk',
    'economic stability'
  ],
  interval: 360, // 6 heures
  limit: 10,
  minQualityScore: 70,
  notifyOnNew: true
};

/**
 * Configuration temps réel (cyber threats)
 */
const REALTIME_CONFIG = {
  providers: ['cisa', 'nist', 'enisa'],
  queries: [
    'zero-day vulnerability',
    'ransomware',
    'critical infrastructure',
    'supply chain attack'
  ],
  interval: 60, // 1 heure
  limit: 20,
  minQualityScore: 80,
  notifyOnNew: true
};

const config = isRealtime ? REALTIME_CONFIG : DEFAULT_CONFIG;

/**
 * Importe dynamiquement le monitoring agent
 * (nécessite TypeScript compilé)
 */
async function startMonitoring() {
  console.log('🚀 MONITORING AGENT - NomosX Institutional Sources\n');
  console.log(`Mode: ${isRealtime ? 'REALTIME (Cyber)' : 'DEFAULT'}`);
  console.log(`Providers: ${config.providers.join(', ')}`);
  console.log(`Interval: ${config.interval} minutes`);
  console.log(`Run once: ${runOnce ? 'YES' : 'NO (continuous)'}\n`);
  
  try {
    // Check si TypeScript est compilé
    const { runMonitoringCycle, startContinuousMonitoring } = await import(
      '../lib/agent/monitoring-agent.ts'
    );
    
    if (runOnce) {
      // Run une seule fois (test)
      console.log('🧪 TEST MODE: Running one cycle...\n');
      const results = await runMonitoringCycle(config);
      
      console.log('\n✅ Test cycle complete');
      console.log(`Total new sources: ${results.reduce((sum, r) => sum + r.newSources, 0)}`);
      
      process.exit(0);
    } else {
      // Mode continu
      console.log('♾️  CONTINUOUS MODE: Monitoring will run forever...\n');
      console.log('Press Ctrl+C to stop\n');
      
      await startContinuousMonitoring(config);
    }
    
  } catch (error) {
    console.error('❌ Failed to start monitoring:', error.message);
    console.error('\n💡 Make sure TypeScript is compiled:');
    console.error('   npm run build');
    console.error('   OR');
    console.error('   npx tsc\n');
    process.exit(1);
  }
}

/**
 * Graceful shutdown
 */
process.on('SIGINT', async () => {
  console.log('\n\n⏹️  Stopping monitoring...');
  await prisma.$disconnect();
  console.log('✅ Monitoring stopped\n');
  process.exit(0);
});

// Start
startMonitoring().catch(async (error) => {
  console.error('Fatal error:', error);
  await prisma.$disconnect();
  process.exit(1);
});
