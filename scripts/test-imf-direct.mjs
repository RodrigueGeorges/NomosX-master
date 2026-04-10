/**
 * TEST DIRECT IMF SDMX (sans dépendances)
 */

import { searchIMFSDMX } from '../providers/institutional/v2/imf-sdmx.js';

async function testIMFSDMX() {
  console.log('🏦 TEST DIRECT IMF SDMX\n');
  
  try {
    const results = await searchIMFSDMX('inflation', 3);
    
    console.log(`📊 Found: ${results.length} sources\n`);
    
    results.forEach((s, i) => {
      console.log(`${i + 1}. ${s.title?.substring(0, 60)}...`);
      console.log(`   📡 Provider: ${s.provider} | 🎯 Type: ${s.type}`);
      console.log(`   🔗 URL: ${s.url?.substring(0, 50)}...`);
      console.log(`   📄 Fallback: ${s.raw?.fallback || 'false'}`);
      console.log(`   📈 Score: ${s.raw?.score || 'N/A'}`);
      console.log('');
    });
    
    console.log('✅ IMF SDMX test completed successfully!');
    
    // Analyse des résultats
    const sdmxCount = results.filter(s => s.raw?.source === 'imf-sdmx-dataflow').length;
    const fallbackCount = results.filter(s => s.raw?.fallback).length;
    
    console.log('\n📈 ANALYSIS:');
    console.log(`  🏦 SDMX results: ${sdmxCount}`);
    console.log(`  🔄 Fallback results: ${fallbackCount}`);
    console.log(`  📊 Success rate: ${results.length > 0 ? '100%' : '0%'}`);
    
    if (fallbackCount > 0) {
      console.log('  ⚠️  Mode fallback (réseau bloqué)');
    } else {
      console.log('  🎯 Mode live SDMX (parfait)');
    }
    
  } catch (error) {
    console.error('❌ Error testing IMF SDMX:', error.message);
  }
}

testIMFSDMX();
