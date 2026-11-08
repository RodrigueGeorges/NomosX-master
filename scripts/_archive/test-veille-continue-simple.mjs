/**
 * TEST VEILLE CONTINUE - Version corrigée
 */

import { runMonitoringCycle } from '../lib/agent/monitoring-agent.ts';

async function testVeilleContinue() {
  console.log('🔍 TEST VEILLE CONTINUE - One-shot Cycle\n');
  
  try {
    const startTime = Date.now();
    
    // Configuration de test limitée
    const testConfig = {
      providers: ['crossref', 'arxiv', 'worldbank', 'imf', 'oecd'], // 5 providers variés
      queries: ['artificial intelligence', 'climate change', 'economic growth'], // 3 requêtes
      interval: 1 // Une seule exécution
    };
    
    console.log('📊 Configuration de test:');
    console.log(`  - Providers: ${testConfig.providers.join(', ')}`);
    console.log(`  - Queries: ${testConfig.queries.join(', ')}`);
    console.log(`  - Mode: One-shot (1 cycle)\n`);
    
    // Exécuter un cycle de veille
    const result = await runMonitoringCycle(testConfig);
    
    const duration = Date.now() - startTime;
    
    console.log('📈 RÉSULTATS DU CYCLE:');
    console.log(`  ⏱️  Durée: ${Math.round(duration / 1000)}s`);
    console.log(`  📊 Sources trouvées: ${result.totalSources}`);
    console.log(`  ✅ Succès: ${result.successCount}`);
    console.log(`  ❌ Erreurs: ${result.errorCount}`);
    console.log(`  🔄 Providers testés: ${result.providersTested}`);
    
    if (result.errors && result.errors.length > 0) {
      console.log('\n⚠️  ERREURS DÉTECTÉES:');
      result.errors.forEach((error, i) => {
        console.log(`  ${i + 1}. ${error}`);
      });
    }
    
    // Analyse par provider
    console.log('\n📊 ANALYSE PAR PROVIDER:');
    if (result.providerResults) {
      Object.entries(result.providerResults).forEach(([provider, data]) => {
        console.log(`  📡 ${provider}:`);
        console.log(`     - Sources: ${data.sources || 0}`);
        console.log(`     - Status: ${data.status || 'unknown'}`);
        console.log(`     - Latence: ${data.latency ? Math.round(data.latency) + 'ms' : 'N/A'}`);
      });
    }
    
    // Vérification du flow
    console.log('\n🔍 VÉRIFICATION FLOW:');
    const flowChecks = {
      'Monitoring agent': result.successCount > 0,
      'Provider access': result.providersTested > 0,
      'Source ingestion': result.totalSources > 0,
      'Error handling': result.errorCount < result.providersTested
    };
    
    Object.entries(flowChecks).forEach(([component, status]) => {
      console.log(`  ${status ? '✅' : '❌'} ${component}: ${status ? 'OK' : 'PROBLÈME'}`);
    });
    
    // Score global
    const successRate = result.providersTested > 0 ? result.successCount / result.providersTested : 0;
    const score = Math.round(successRate * 100);
    
    console.log(`\n🎯 SCORE GLOBAL: ${score}%`);
    
    if (score >= 80) {
      console.log('🎉 VEILLE CONTINUE: OPÉRATIONNELLE');
    } else if (score >= 60) {
      console.log('⚠️  VEILLE CONTINUE: PARTIELLEMENT OPÉRATIONNELLE');
    } else {
      console.log('❌ VEILLE CONTINUE: PROBLÉMATIQUE');
    }
    
    return {
      success: score >= 60,
      score,
      result,
      duration,
      flowChecks
    };
    
  } catch (error) {
    console.error('❌ ERREUR CRITIQUE:', error.message);
    return {
      success: false,
      error: error.message,
      score: 0
    };
  }
}

// Exécuter le test
testVeilleContinue()
  .then(result => {
    console.log('\n✅ Test terminé');
    process.exit(result.success ? 0 : 1);
  })
  .catch(error => {
    console.error('\n❌ Test échoué:', error);
    process.exit(1);
  });
