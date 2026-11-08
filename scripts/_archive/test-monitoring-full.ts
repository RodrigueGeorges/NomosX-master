#!/usr/bin/env npx tsx
/**
 * TEST MONITORING FULL - Test complet du cycle de monitoring
 * 
 * Ce script simule un cycle complet de veille autonome:
 * 1. Crawl des providers configurés
 * 2. Filtrage par qualité
 * 3. Détection de nouveautés
 * 4. Upsert en base de données
 * 5. Génération de rapport
 */

import { PrismaClient } from '../generated/prisma-client';
import { setTimeout as sleep } from 'timers/promises';

// Import providers fonctionnels
import { searchWorldBankAPI } from '../lib/providers/institutional/stable/worldbank-api';
import { searchCISAAdvisories } from '../lib/providers/institutional/stable/cisa-advisories';
import { searchUKArchives } from '../lib/providers/institutional/v2/uk-archives-api';
import { searchCIAFOIAViaArchive } from '../lib/providers/institutional/v2/archive-org';
import { searchNIST } from '../lib/providers/institutional/v2/nist-publications';

const prisma = new PrismaClient();

interface MonitoringConfig {
  providers: { name: string; fn: (q: string, l: number) => Promise<any[]>; query: string }[];
  minQualityScore: number;
  limit: number;
}

interface CycleResult {
  provider: string;
  query: string;
  found: number;
  new: number;
  upserted: number;
  errors: string[];
}

// Configuration du monitoring (providers fonctionnels uniquement)
const MONITORING_CONFIG: MonitoringConfig = {
  providers: [
    { name: 'worldbank', fn: searchWorldBankAPI, query: 'artificial intelligence policy' },
    { name: 'cisa', fn: searchCISAAdvisories, query: 'cybersecurity' },
    { name: 'uk-archives', fn: searchUKArchives, query: 'foreign policy' },
    { name: 'cia-foia', fn: searchCIAFOIAViaArchive, query: 'intelligence' },
    { name: 'nist', fn: searchNIST, query: 'cybersecurity' },
  ],
  minQualityScore: 60,
  limit: 5
};

function calculateQualityScore(source: any): number {
  let score = 50; // Base score
  
  // Year bonus (recent = better)
  if (source.year) {
    const age = new Date().getFullYear() - source.year;
    if (age <= 1) score += 20;
    else if (age <= 3) score += 15;
    else if (age <= 5) score += 10;
  }
  
  // Provider bonus
  const providerBonus: Record<string, number> = {
    'worldbank': 15,
    'cisa': 20,
    'nist': 18,
    'uk-archives': 12,
    'cia-foia': 10
  };
  score += providerBonus[source.provider] || 5;
  
  // Content bonus
  if (source.abstract && source.abstract.length > 100) score += 10;
  if (source.pdfUrl) score += 5;
  
  return Math.min(100, score);
}

async function checkSourceExists(id: string): Promise<boolean> {
  const existing = await prisma.source.findUnique({ where: { id } });
  return Boolean(existing);
}

async function upsertSource(source: any, qualityScore: number): Promise<boolean> {
  try {
    await prisma.source.upsert({
      where: { id: source.id },
      create: {
        id: source.id,
        provider: source.provider,
        type: source.type || 'institutional',
        title: source.title,
        abstract: source.abstract || '',
        url: source.url,
        pdfUrl: source.pdfUrl,
        year: source.year,
        qualityScore,
        noveltyScore: 100,
        oaStatus: source.oaStatus || 'unknown',
        documentType: source.documentType,
        issuer: source.issuer,
        issuerType: source.issuerType,
        classification: source.classification || 'public',
        language: source.language || 'en',
        raw: source.raw || {}
      },
      update: {
        title: source.title,
        abstract: source.abstract,
        qualityScore,
        updatedAt: new Date()
      }
    });
    return true;
  } catch (error: any) {
    console.error(`    ❌ Upsert failed: ${error.message}`);
    return false;
  }
}

async function runMonitoringCycle(): Promise<CycleResult[]> {
  const results: CycleResult[] = [];
  
  console.log('\n');
  console.log('╔════════════════════════════════════════════════════════════════════╗');
  console.log('║        🔍 NOMOSX MONITORING CYCLE                                  ║');
  console.log('║        Autonomous Think Tank - Signal Detection                    ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝');
  console.log('\n');
  
  const startTime = Date.now();
  
  for (const provider of MONITORING_CONFIG.providers) {
    console.log(`\n📡 Monitoring: ${provider.name.toUpperCase()}`);
    console.log(`   Query: "${provider.query}"`);
    console.log('-'.repeat(50));
    
    const result: CycleResult = {
      provider: provider.name,
      query: provider.query,
      found: 0,
      new: 0,
      upserted: 0,
      errors: []
    };
    
    try {
      const sources = await provider.fn(provider.query, MONITORING_CONFIG.limit);
      result.found = sources.length;
      
      console.log(`   Found: ${sources.length} sources`);
      
      for (const source of sources) {
        const qualityScore = calculateQualityScore(source);
        
        // Filter by quality
        if (qualityScore < MONITORING_CONFIG.minQualityScore) {
          console.log(`   ⏭️  Skipped (quality ${qualityScore} < ${MONITORING_CONFIG.minQualityScore}): ${source.title?.substring(0, 40)}...`);
          continue;
        }
        
        // Check if new
        const exists = await checkSourceExists(source.id);
        
        if (!exists) {
          result.new++;
          const success = await upsertSource(source, qualityScore);
          
          if (success) {
            result.upserted++;
            console.log(`   ✅ NEW [Q:${qualityScore}]: ${source.title?.substring(0, 50)}...`);
          }
        } else {
          console.log(`   📋 Exists: ${source.title?.substring(0, 50)}...`);
        }
      }
      
    } catch (error: any) {
      result.errors.push(error.message);
      console.log(`   ❌ Error: ${error.message}`);
    }
    
    results.push(result);
    
    // Rate limiting
    await sleep(1000);
  }
  
  const totalTime = Date.now() - startTime;
  
  // Summary
  console.log('\n\n');
  console.log('╔════════════════════════════════════════════════════════════════════╗');
  console.log('║                    📊 CYCLE SUMMARY                                ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝');
  
  const totalFound = results.reduce((sum, r) => sum + r.found, 0);
  const totalNew = results.reduce((sum, r) => sum + r.new, 0);
  const totalUpserted = results.reduce((sum, r) => sum + r.upserted, 0);
  const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);
  
  console.log(`
  ⏱️  Duration:           ${(totalTime / 1000).toFixed(1)}s
  📡 Providers checked:   ${results.length}
  📚 Sources found:       ${totalFound}
  🆕 New sources:         ${totalNew}
  💾 Upserted to DB:      ${totalUpserted}
  ❌ Errors:              ${totalErrors}
  `);
  
  // Per-provider breakdown
  console.log('  Per-provider breakdown:');
  for (const r of results) {
    const status = r.errors.length > 0 ? '❌' : (r.new > 0 ? '🆕' : '✅');
    console.log(`    ${status} ${r.provider}: ${r.found} found, ${r.new} new, ${r.upserted} saved`);
  }
  
  // Signal detection
  if (totalNew > 0) {
    console.log('\n  🔔 SIGNALS DETECTED:');
    console.log(`     ${totalNew} new sources require attention`);
    console.log('     → Ready for ANALYST agent processing');
  } else {
    console.log('\n  ✅ NO NEW SIGNALS - System is up to date');
  }
  
  console.log('\n');
  
  return results;
}

async function main() {
  try {
    const results = await runMonitoringCycle();
    
    // Log cycle to database
    await prisma.job.create({
      data: {
        correlationId: `monitoring-${Date.now()}`,
        type: 'MONITORING_CYCLE',
        status: 'DONE',
        payload: {
          config: {
            providers: MONITORING_CONFIG.providers.map(p => p.name),
            minQualityScore: MONITORING_CONFIG.minQualityScore,
            limit: MONITORING_CONFIG.limit
          }
        },
        result: results as any
      }
    });
    
    console.log('✅ Cycle logged to database');
    
  } catch (error: any) {
    console.error('Fatal error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
