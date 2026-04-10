#!/usr/bin/env npx tsx
/**
 * Test Google Custom Search API
 * 
 * Usage: npx tsx scripts/test-google-cse.ts
 */

import 'dotenv/config';
import { testGoogleCSE, searchGoogle, searchSite, searchDeepWeb } from '../lib/services/googleCustomSearch';

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════════╗');
  console.log('║        🔍 GOOGLE CUSTOM SEARCH API TEST                            ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝\n');

  // Test 1: Basic connection test
  console.log('📋 TEST 1: Connexion de base');
  console.log('-'.repeat(50));
  const connected = await testGoogleCSE();
  
  if (!connected) {
    console.log('\n⛔ Test arrêté - connexion impossible');
    process.exit(1);
  }

  // Test 2: Search on specific site
  console.log('\n\n📋 TEST 2: Recherche sur site spécifique (brookings.edu)');
  console.log('-'.repeat(50));
  try {
    const siteResults = await searchSite('artificial intelligence', 'brookings.edu', { num: 3 });
    console.log(`✅ ${siteResults.results.length} résultats trouvés`);
    for (const r of siteResults.results) {
      console.log(`   - ${r.title.substring(0, 60)}...`);
      console.log(`     ${r.link}`);
    }
  } catch (error: any) {
    console.log(`❌ Erreur: ${error.message}`);
  }

  // Test 3: Search for PDFs
  console.log('\n\n📋 TEST 3: Recherche de PDFs');
  console.log('-'.repeat(50));
  try {
    const pdfResults = await searchGoogle('cybersecurity framework filetype:pdf', { num: 3 });
    console.log(`✅ ${pdfResults.results.length} PDFs trouvés`);
    for (const r of pdfResults.results) {
      console.log(`   - ${r.title.substring(0, 60)}...`);
      console.log(`     Format: ${r.fileFormat || 'N/A'}`);
    }
  } catch (error: any) {
    console.log(`❌ Erreur: ${error.message}`);
  }

  // Test 4: Deep search with pagination
  console.log('\n\n📋 TEST 4: Recherche approfondie (pagination)');
  console.log('-'.repeat(50));
  try {
    const deepResults = await searchDeepWeb('AI governance', 15);
    console.log(`✅ ${deepResults.length} résultats agrégés`);
    
    // Group by source
    const sources = new Map<string, number>();
    for (const r of deepResults) {
      sources.set(r.source, (sources.get(r.source) || 0) + 1);
    }
    console.log('   Sources:');
    for (const [source, count] of sources) {
      console.log(`     - ${source}: ${count}`);
    }
  } catch (error: any) {
    console.log(`❌ Erreur: ${error.message}`);
  }

  // Summary
  console.log('\n\n╔════════════════════════════════════════════════════════════════════╗');
  console.log('║                         ✅ TESTS TERMINÉS                          ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝\n');
}

main().catch(console.error);
