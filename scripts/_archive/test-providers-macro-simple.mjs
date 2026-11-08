/**
 * TEST SIMPLE PROVIDERS MACRO - Version corrigée
 */

// Import direct depuis les fichiers TypeScript
import { searchEurostat } from '../lib/providers/macro/eurostat-api.ts';
import { searchECB } from '../lib/providers/macro/ecb-api.ts';
import { searchINSEE } from '../lib/providers/macro/insee-api.ts';

async function testProvidersMacro() {
  console.log('🏛️ TEST PROVIDERS MACROÉCONOMIQUES\n');
  
  try {
    // Test Eurostat
    console.log('📊 Test Eurostat...');
    const eurostatResults = await searchEurostat('inflation', 3);
    console.log(`✅ Eurostat: ${eurostatResults.length} sources`);
    
    // Test ECB
    console.log('📊 Test ECB...');
    const ecbResults = await searchECB('interest', 3);
    console.log(`✅ ECB: ${ecbResults.length} sources`);
    
    // Test INSEE
    console.log('📊 Test INSEE...');
    const inseeResults = await searchINSEE('gdp', 3);
    console.log(`✅ INSEE: ${inseeResults.length} sources`);
    
    // Résultats globaux
    const totalSources = eurostatResults.length + ecbResults.length + inseeResults.length;
    const workingProviders = [
      eurostatResults.length > 0,
      ecbResults.length > 0,
      inseeResults.length > 0
    ].filter(Boolean).length;
    
    console.log('\n📈 RÉSULTATS GLOBAUX:');
    console.log(`  📊 Sources totales: ${totalSources}`);
    console.log(`  🏛️  Providers fonctionnels: ${workingProviders}/3`);
    console.log(`  📈 Score: ${Math.round((workingProviders / 3) * 100)}%`);
    
    if (workingProviders >= 2) {
      console.log('🎉 PROVIDERS MACRO: OPÉRATIONNELS');
    } else {
      console.log('⚠️  PROVIDERS MACRO: PARTIELLEMENT OPÉRATIONNELS');
    }
    
    return {
      success: workingProviders >= 2,
      score: Math.round((workingProviders / 3) * 100),
      eurostat: eurostatResults.length,
      ecb: ecbResults.length,
      insee: inseeResults.length
    };
    
  } catch (error) {
    console.error('❌ Erreur test providers:', error.message);
    return {
      success: false,
      score: 0,
      error: error.message
    };
  }
}

testProvidersMacro()
  .then(result => {
    console.log('\n✅ Test terminé');
    process.exit(result.success ? 0 : 1);
  })
  .catch(error => {
    console.error('\n❌ Test échoué:', error);
    process.exit(1);
  });
