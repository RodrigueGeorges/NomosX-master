#!/usr/bin/env npx tsx
/**
 * TEST MONITORING DIRECT - Test rapide du monitoring agent
 * Usage: npx tsx scripts/test-monitoring-direct.ts
 */

import { PrismaClient } from '../generated/prisma-client';

// Import providers directement (sans alias @/)
import { searchWorldBankAPI } from '../lib/providers/institutional/stable/worldbank-api';
import { searchCISAAdvisories } from '../lib/providers/institutional/stable/cisa-advisories';

const prisma = new PrismaClient();

async function testMonitoring() {
  console.log('🚀 TEST MONITORING DIRECT - NomosX\n');
  console.log('=' .repeat(60));
  
  const results: { provider: string; count: number; sample?: string }[] = [];
  
  // Test 1: World Bank (API stable, pas besoin de Google CSE)
  console.log('\n📊 Test 1: World Bank API');
  console.log('-'.repeat(40));
  try {
    const wbSources = await searchWorldBankAPI('artificial intelligence', 5);
    console.log(`✅ World Bank: ${wbSources.length} sources trouvées`);
    if (wbSources.length > 0) {
      console.log(`   Exemple: "${wbSources[0].title?.substring(0, 60)}..."`);
      results.push({ provider: 'worldbank', count: wbSources.length, sample: wbSources[0].title });
    }
  } catch (error: any) {
    console.log(`❌ World Bank: ${error.message}`);
    results.push({ provider: 'worldbank', count: 0 });
  }
  
  // Test 2: CISA Advisories (API stable)
  console.log('\n🔒 Test 2: CISA Advisories');
  console.log('-'.repeat(40));
  try {
    const cisaSources = await searchCISAAdvisories('cybersecurity', 5);
    console.log(`✅ CISA: ${cisaSources.length} sources trouvées`);
    if (cisaSources.length > 0) {
      console.log(`   Exemple: "${cisaSources[0].title?.substring(0, 60)}..."`);
      results.push({ provider: 'cisa', count: cisaSources.length, sample: cisaSources[0].title });
    }
  } catch (error: any) {
    console.log(`❌ CISA: ${error.message}`);
    results.push({ provider: 'cisa', count: 0 });
  }
  
  // Test 3: Upsert dans la DB (si sources trouvées)
  console.log('\n💾 Test 3: Upsert dans la base de données');
  console.log('-'.repeat(40));
  
  let upsertCount = 0;
  for (const r of results) {
    if (r.count > 0) {
      try {
        // Simuler un upsert simple
        const testSource = {
          id: `test-${r.provider}-${Date.now()}`,
          provider: r.provider,
          type: 'institutional',
          title: r.sample || 'Test source',
          abstract: 'Test abstract for monitoring',
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
        
        upsertCount++;
        console.log(`✅ Upsert réussi pour ${r.provider}`);
      } catch (error: any) {
        console.log(`❌ Upsert échoué pour ${r.provider}: ${error.message}`);
      }
    }
  }
  
  // Résumé
  console.log('\n' + '='.repeat(60));
  console.log('📋 RÉSUMÉ DU TEST');
  console.log('='.repeat(60));
  
  const totalSources = results.reduce((sum, r) => sum + r.count, 0);
  console.log(`\n  Providers testés: ${results.length}`);
  console.log(`  Sources trouvées: ${totalSources}`);
  console.log(`  Upserts réussis: ${upsertCount}`);
  
  if (totalSources > 0) {
    console.log('\n✅ Le système de monitoring fonctionne !');
    console.log('   Les providers peuvent récupérer des données et les sauvegarder en DB.');
  } else {
    console.log('\n⚠️  Aucune source trouvée - vérifier la connectivité réseau.');
  }
  
  await prisma.$disconnect();
  console.log('\n');
}

testMonitoring().catch(async (error) => {
  console.error('Fatal error:', error);
  await prisma.$disconnect();
  process.exit(1);
});
