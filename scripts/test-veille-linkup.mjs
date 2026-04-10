/**
 * TEST VEILLE LINKUP - Hyper-Intelligent Monitoring
 * Test du système de veille avec LinkUp intégré
 */

import { runMonitoringCycle, LINKUP_INTELLIGENT_MONITORING } from '../lib/agent/monitoring-agent.js';

async function testLinkUpVeille() {
  console.log('🚀 TEST VEILLE LINKUP - Hyper-Intelligent Monitoring\n');
  
  try {
    const startTime = Date.now();
    
    // Configuration LinkUp optimisée
    const linkUpConfig = {
      ...LINKUP_INTELLIGENT_MONITORING,
      providers: ['linkup', 'linkup-financial'], // Test limité
      queries: [
        'Microsoft revenue operating income 2024',
        'artificial intelligence market size 2024',
        'NVIDIA AI chip revenue 2024'
      ],
      interval: 1, // Une seule exécution pour le test
      limit: 5 // Réduit pour le test
    };
    
    console.log('📊 Configuration LinkUp:');
    console.log(`  - Providers: ${linkUpConfig.providers.join(', ')}`);
    console.log(`  - Queries: ${linkUpConfig.queries.length} requêtes financières`);
    console.log(`  - Mode: One-shot (1 cycle)\n`);
    
    console.log('🔍 REQUÊTES TEST:');
    linkUpConfig.queries.forEach((query, i) => {
      console.log(`  ${i + 1}. "${query}"`);
    });
    console.log('');
    
    // Exécuter le cycle de veille LinkUp
    const result = await runMonitoringCycle(linkUpConfig);
    
    const duration = Date.now() - startTime;
    
    console.log('📈 RÉSULTATS LINKUP:');
    console.log(`  ⏱️  Durée: ${Math.round(duration / 1000)}s`);
    console.log(`  📊 Sources trouvées: ${result.reduce((sum, r) => sum + r.newSources, 0)}`);
    console.log(`  ✅ Succès: ${result.filter(r => r.errors.length === 0).length}`);
    console.log(`  ❌ Erreurs: ${result.reduce((sum, r) => sum + r.errors.length, 0)}`);
    console.log(`  🔄 Providers testés: ${result.length}`);
    
    // Analyse détaillée par provider LinkUp
    console.log('\n🤖 ANALYSE LINKUP DÉTAILLÉE:');
    result.forEach((providerResult, i) => {
      console.log(`\n  📡 ${providerResult.provider.toUpperCase()}:`);
      console.log(`     - Nouvelles sources: ${providerResult.newSources}`);
      console.log(`     - Total vérifié: ${providerResult.totalChecked}`);
      console.log(`     - Status: ${providerResult.errors.length === 0 ? '✅ OK' : '❌ ERREUR'}`);
      
      if (providerResult.errors.length > 0) {
        console.log(`     - Erreurs: ${providerResult.errors.join(', ')}`);
      }
      
      // Score de performance
      const successRate = providerResult.totalChecked > 0 ? 
        (providerResult.newSources / providerResult.totalChecked) * 100 : 0;
      console.log(`     - Taux de succès: ${Math.round(successRate)}%`);
    });
    
    // Vérification de l'intégration
    console.log('\n🔍 VÉRIFICATION INTÉGRATION:');
    const integrationChecks = {
      'LinkUp SDK intégré': result.some(r => r.provider.includes('linkup')),
      'Requêtes financières': linkUpConfig.queries.some(q => 
        q.toLowerCase().includes('revenue') || q.toLowerCase().includes('financial')
      ),
      'Sources de qualité': result.reduce((sum, r) => sum + r.newSources, 0) > 0,
      'Pipeline fonctionnel': result.length === linkUpConfig.providers.length
    };
    
    Object.entries(integrationChecks).forEach(([check, status]) => {
      console.log(`  ${status ? '✅' : '❌'} ${check}: ${status ? 'INTÉGRÉ' : 'PROBLÈME'}`);
    });
    
    // Score global LinkUp
    const totalNewSources = result.reduce((sum, r) => sum + r.newSources, 0);
    const successRate = result.length > 0 ? 
      (result.filter(r => r.errors.length === 0).length / result.length) * 100 : 0;
    const linkUpScore = Math.round((successRate + (totalNewSources > 0 ? 50 : 0)) / 2);
    
    console.log(`\n🎯 SCORE LINKUP: ${linkUpScore}%`);
    
    if (linkUpScore >= 80) {
      console.log('🎉 LINKUP VEILLE: EXCELLENTE - Hyper-Intégration réussie!');
    } else if (linkUpScore >= 60) {
      console.log('⚠️  LINKUP VEILLE: BONNE - Intégration fonctionnelle');
    } else {
      console.log('❌ LINKUP VEILLE: À AMÉLIORER - Problèmes détectés');
    }
    
    // Recommandations
    console.log('\n💡 RECOMMANDATIONS:');
    if (totalNewSources === 0) {
      console.log('  • Ajuster les requêtes pour plus de pertinence');
      console.log('  • Vérifier la configuration API LinkUp');
    }
    
    if (successRate < 100) {
      console.log('  • Investiguer les erreurs de providers');
      console.log('  • Optimiser la gestion des rate limits');
    }
    
    if (linkUpScore >= 80) {
      console.log('  • Déployer en production avec monitoring continu');
      console.log('  • Ajouter plus de requêtes financières');
    }
    
    return {
      success: linkUpScore >= 60,
      score: linkUpScore,
      result,
      duration,
      integrationChecks,
      totalNewSources
    };
    
  } catch (error) {
    console.error('❌ ERREUR CRITIQUE LINKUP:', error.message);
    return {
      success: false,
      error: error.message,
      score: 0
    };
  }
}

// Exécuter le test
testLinkUpVeille()
  .then(result => {
    console.log('\n✅ Test LinkUp veille terminé');
    console.log(`🎯 Résultat: ${result.success ? 'SUCCÈS' : 'ÉCHEC'} (${result.score}%)`);
    process.exit(result.success ? 0 : 1);
  })
  .catch(error => {
    console.error('\n❌ Test LinkUp échoué:', error);
    process.exit(1);
  });
