#!/usr/bin/env npx tsx
/**
 * TEST ALL PROVIDERS - Script de test complet pour tous les providers
 * 
 * Usage: npx tsx scripts/test-all-providers.ts
 * 
 * Ce script teste:
 * - Tous les providers stables (API directes)
 * - Tous les providers V2 (Google CSE, Archive.org, etc.)
 * - Les think tanks innovants
 * - L'upsert en base de données
 */

import { PrismaClient } from '../generated/prisma-client';

// Providers stables (API directes)
import { searchWorldBankAPI } from '../lib/providers/institutional/stable/worldbank-api';
import { searchCISAAdvisories } from '../lib/providers/institutional/stable/cisa-advisories';

// Providers V2
import { searchNARA } from '../lib/providers/institutional/v2/nara-api';
import { searchUKArchives } from '../lib/providers/institutional/v2/uk-archives-api';
import { searchUNDigitalLibrary } from '../lib/providers/institutional/v2/un-digital-library';
import { searchIMFeLibrary } from '../lib/providers/institutional/v2/imf-elibrary';
import { searchOECDiLibrary } from '../lib/providers/institutional/v2/oecd-ilibrary';
import { searchBIS } from '../lib/providers/institutional/v2/bis-papers';
import { searchNIST } from '../lib/providers/institutional/v2/nist-publications';
import { searchCIAFOIAViaArchive } from '../lib/providers/institutional/v2/archive-org';
import { searchEEAS } from '../lib/providers/institutional/v2/eu-open-data';

// Google CSE providers (nécessitent GOOGLE_CSE_KEY et GOOGLE_CSE_CX)
import {
  searchODNIViaGoogle,
  searchNATOViaGoogle,
  searchENISAViaGoogle,
  searchLawZeroViaGoogle,
  searchGovAIViaGoogle,
  searchCSETViaGoogle,
  searchBrookingsViaGoogle,
  searchRANDViaGoogle
} from '../lib/providers/institutional/v2/google-cse';

const prisma = new PrismaClient();

interface ProviderTest {
  name: string;
  category: 'stable' | 'v2-api' | 'v2-google' | 'think-tank';
  fn: (query: string, limit: number) => Promise<any[]>;
  query: string;
  requiresGoogleCSE?: boolean;
}

const PROVIDERS_TO_TEST: ProviderTest[] = [
  // Stable APIs (should always work)
  { name: 'World Bank', category: 'stable', fn: searchWorldBankAPI, query: 'artificial intelligence' },
  { name: 'CISA', category: 'stable', fn: searchCISAAdvisories, query: 'cybersecurity' },
  
  // V2 APIs (direct)
  { name: 'NARA', category: 'v2-api', fn: searchNARA, query: 'national security' },
  { name: 'UK Archives', category: 'v2-api', fn: searchUKArchives, query: 'foreign policy' },
  { name: 'UN Digital Library', category: 'v2-api', fn: searchUNDigitalLibrary, query: 'climate change' },
  { name: 'IMF eLibrary', category: 'v2-api', fn: searchIMFeLibrary, query: 'monetary policy' },
  { name: 'OECD iLibrary', category: 'v2-api', fn: searchOECDiLibrary, query: 'economic growth' },
  { name: 'BIS Papers', category: 'v2-api', fn: searchBIS, query: 'financial stability' },
  { name: 'NIST', category: 'v2-api', fn: searchNIST, query: 'cybersecurity framework' },
  { name: 'CIA FOIA (Archive.org)', category: 'v2-api', fn: searchCIAFOIAViaArchive, query: 'intelligence' },
  { name: 'EEAS (EU)', category: 'v2-api', fn: searchEEAS, query: 'foreign affairs' },
  
  // Google CSE providers (require API keys)
  { name: 'ODNI', category: 'v2-google', fn: searchODNIViaGoogle, query: 'threat assessment', requiresGoogleCSE: true },
  { name: 'NATO', category: 'v2-google', fn: searchNATOViaGoogle, query: 'defense', requiresGoogleCSE: true },
  { name: 'ENISA', category: 'v2-google', fn: searchENISAViaGoogle, query: 'cyber threat', requiresGoogleCSE: true },
  
  // Think Tanks (Google CSE)
  { name: 'LawZero', category: 'think-tank', fn: searchLawZeroViaGoogle, query: 'AI governance', requiresGoogleCSE: true },
  { name: 'GovAI', category: 'think-tank', fn: searchGovAIViaGoogle, query: 'AI policy', requiresGoogleCSE: true },
  { name: 'CSET Georgetown', category: 'think-tank', fn: searchCSETViaGoogle, query: 'emerging technology', requiresGoogleCSE: true },
  { name: 'Brookings', category: 'think-tank', fn: searchBrookingsViaGoogle, query: 'technology policy', requiresGoogleCSE: true },
  { name: 'RAND', category: 'think-tank', fn: searchRANDViaGoogle, query: 'national security', requiresGoogleCSE: true },
];

interface TestResult {
  name: string;
  category: string;
  status: 'success' | 'error' | 'skipped';
  count: number;
  sample?: string;
  error?: string;
  timeMs: number;
}

async function testProvider(provider: ProviderTest): Promise<TestResult> {
  const start = Date.now();
  
  // Check if Google CSE is required but not configured
  if (provider.requiresGoogleCSE) {
    if (!process.env.GOOGLE_CSE_KEY || !process.env.GOOGLE_CSE_CX) {
      return {
        name: provider.name,
        category: provider.category,
        status: 'skipped',
        count: 0,
        error: 'GOOGLE_CSE_KEY/CX not configured',
        timeMs: 0
      };
    }
  }
  
  try {
    const sources = await provider.fn(provider.query, 3);
    const timeMs = Date.now() - start;
    
    return {
      name: provider.name,
      category: provider.category,
      status: 'success',
      count: sources.length,
      sample: sources[0]?.title?.substring(0, 50),
      timeMs
    };
  } catch (error: any) {
    return {
      name: provider.name,
      category: provider.category,
      status: 'error',
      count: 0,
      error: error.message?.substring(0, 100),
      timeMs: Date.now() - start
    };
  }
}

async function testDatabaseUpsert(results: TestResult[]): Promise<{ success: number; failed: number }> {
  let success = 0;
  let failed = 0;
  
  for (const result of results) {
    if (result.status === 'success' && result.count > 0) {
      try {
        const testSource = {
          id: `test-${result.name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`,
          provider: result.name.toLowerCase().replace(/\s+/g, '-'),
          type: 'institutional',
          title: result.sample || `Test from ${result.name}`,
          abstract: `Test source from ${result.name} provider`,
          url: 'https://example.com',
          year: 2026,
          qualityScore: 80,
          noveltyScore: 100,
          oaStatus: 'gold',
          raw: {}
        };
        
        await prisma.source.upsert({
          where: { id: testSource.id },
          create: testSource,
          update: { updatedAt: new Date() }
        });
        
        success++;
      } catch (error) {
        failed++;
      }
    }
  }
  
  return { success, failed };
}

async function main() {
  console.log('\n');
  console.log('╔════════════════════════════════════════════════════════════════════╗');
  console.log('║        🔍 NOMOSX - TEST ALL PROVIDERS                              ║');
  console.log('║        Autonomous Think Tank System Validation                     ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝');
  console.log('\n');
  
  // Check environment
  console.log('📋 ENVIRONMENT CHECK');
  console.log('-'.repeat(60));
  console.log(`  GOOGLE_CSE_KEY: ${process.env.GOOGLE_CSE_KEY ? '✅ Configured' : '❌ Not set'}`);
  console.log(`  GOOGLE_CSE_CX:  ${process.env.GOOGLE_CSE_CX ? '✅ Configured' : '❌ Not set'}`);
  console.log(`  DATABASE_URL:   ${process.env.DATABASE_URL ? '✅ Configured' : '❌ Not set'}`);
  console.log('\n');
  
  const results: TestResult[] = [];
  const categories = ['stable', 'v2-api', 'v2-google', 'think-tank'];
  
  for (const category of categories) {
    const categoryProviders = PROVIDERS_TO_TEST.filter(p => p.category === category);
    
    const categoryNames: Record<string, string> = {
      'stable': '🟢 STABLE APIs (Always Available)',
      'v2-api': '🔵 V2 APIs (Direct Access)',
      'v2-google': '🟡 V2 Google CSE (Requires API Key)',
      'think-tank': '🟣 THINK TANKS (Innovative Sources)'
    };
    
    console.log(`\n${categoryNames[category]}`);
    console.log('='.repeat(60));
    
    for (const provider of categoryProviders) {
      process.stdout.write(`  Testing ${provider.name}...`);
      const result = await testProvider(provider);
      results.push(result);
      
      if (result.status === 'success') {
        console.log(` ✅ ${result.count} sources (${result.timeMs}ms)`);
        if (result.sample) {
          console.log(`     └─ "${result.sample}..."`);
        }
      } else if (result.status === 'skipped') {
        console.log(` ⏭️  Skipped (${result.error})`);
      } else {
        console.log(` ❌ Error: ${result.error}`);
      }
      
      // Rate limiting
      await new Promise(r => setTimeout(r, 500));
    }
  }
  
  // Database test
  console.log('\n\n💾 DATABASE UPSERT TEST');
  console.log('='.repeat(60));
  const dbResult = await testDatabaseUpsert(results);
  console.log(`  Successful upserts: ${dbResult.success}`);
  console.log(`  Failed upserts: ${dbResult.failed}`);
  
  // Summary
  console.log('\n\n');
  console.log('╔════════════════════════════════════════════════════════════════════╗');
  console.log('║                        📊 SUMMARY                                  ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝');
  
  const successful = results.filter(r => r.status === 'success');
  const failed = results.filter(r => r.status === 'error');
  const skipped = results.filter(r => r.status === 'skipped');
  const totalSources = successful.reduce((sum, r) => sum + r.count, 0);
  const avgTime = successful.length > 0 
    ? Math.round(successful.reduce((sum, r) => sum + r.timeMs, 0) / successful.length)
    : 0;
  
  console.log(`
  Total providers tested:  ${results.length}
  ✅ Successful:           ${successful.length}
  ❌ Failed:               ${failed.length}
  ⏭️  Skipped:             ${skipped.length}
  
  📚 Total sources found:  ${totalSources}
  ⚡ Average response:     ${avgTime}ms
  💾 DB upserts:           ${dbResult.success}/${dbResult.success + dbResult.failed}
  `);
  
  // Status by category
  console.log('  Status by category:');
  for (const category of categories) {
    const catResults = results.filter(r => r.category === category);
    const catSuccess = catResults.filter(r => r.status === 'success').length;
    console.log(`    ${category}: ${catSuccess}/${catResults.length} working`);
  }
  
  // Final verdict
  console.log('\n');
  if (failed.length === 0 && successful.length > 0) {
    console.log('  🎉 ALL PROVIDERS OPERATIONAL - System is production-ready!');
  } else if (successful.length >= results.length * 0.7) {
    console.log('  ✅ SYSTEM FUNCTIONAL - Most providers working');
  } else {
    console.log('  ⚠️  ATTENTION NEEDED - Some providers require fixes');
  }
  
  // List failures if any
  if (failed.length > 0) {
    console.log('\n  Failed providers:');
    for (const f of failed) {
      console.log(`    - ${f.name}: ${f.error}`);
    }
  }
  
  console.log('\n');
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error('Fatal error:', error);
  await prisma.$disconnect();
  process.exit(1);
});
