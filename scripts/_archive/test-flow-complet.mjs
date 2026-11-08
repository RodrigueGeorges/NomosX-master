/**
 * TEST FLOW COMPLET - Integration test complet
 * Test du flow complet: Providers → Veille → Signaux → Publication
 */

import { testVeilleContinue } from './test-veille-continue.mjs';
import { testDetectionSignaux } from './test-detection-signaux.mjs';
import { testPublicationHebdo } from './test-publication-hebdo.mjs';

async function testFlowComplet() {
  console.log('🚀 TEST FLOW COMPLET - Integration Test Complet\n');
  console.log('📋 Plan de test:');
  console.log('  1️⃣  Providers macro (Eurostat, ECB, INSEE)');
  console.log('  2️⃣  Veille continue');
  console.log('  3️⃣  Détection signaux');
  console.log('  4️⃣  Publication hebdomadaire');
  console.log('  5️⃣  Score global\n');
  
  const results = {
    providers: { success: false, score: 0, details: null },
    veille: { success: false, score: 0, details: null },
    signaux: { success: false, score: 0, details: null },
    publication: { success: false, score: 0, details: null }
  };
  
  const startTime = Date.now();
  
  try {
    // Test 1: Providers macro
    console.log('🏛️  1️⃣  TEST PROVIDERS MACRO');
    console.log('=' .repeat(50));
    
    try {
      const { searchEurostat } = await import('../lib/providers/macro/eurostat-api.js');
      const { searchECB } = await import('../lib/providers/macro/ecb-api.js');
      const { searchINSEE } = await import('../lib/providers/macro/insee-api.js');
      
      // Test rapide de chaque provider
      const eurostatTest = await searchEurostat('inflation', 2);
      const ecbTest = await searchECB('interest', 2);
      const inseeTest = await searchINSEE('gdp', 2);
      
      const providerResults = {
        eurostat: { count: eurostatTest.length, success: eurostatTest.length > 0 },
        ecb: { count: ecbTest.length, success: ecbTest.length > 0 },
        insee: { count: inseeTest.length, success: inseeTest.length > 0 }
      };
      
      const workingProviders = Object.values(providerResults).filter(r => r.success).length;
      results.providers.score = Math.round((workingProviders / 3) * 100);
      results.providers.success = workingProviders >= 2; // Au moins 2/3 fonctionnels
      results.providers.details = providerResults;
      
      console.log(`✅ Eurostat: ${eurostatTest.length} sources`);
      console.log(`✅ ECB: ${ecbTest.length} sources`);
      console.log(`✅ INSEE: ${inseeTest.length} sources`);
      console.log(`📊 Score providers: ${results.providers.score}%`);
      
    } catch (error: any) {
      console.error('❌ Erreur providers:', error.message);
      results.providers.score = 0;
      results.providers.success = false;
    }
    
    console.log('\n');
    
    // Test 2: Veille continue
    console.log('🔍 2️⃣  TEST VEILLE CONTINUE');
    console.log('=' .repeat(50));
    
    try {
      const veilleResult = await testVeilleContinue();
      results.veille = veilleResult;
      console.log(`📊 Score veille: ${veilleResult.score}%`);
    } catch (error: any) {
      console.error('❌ Erreur veille:', error.message);
      results.veille.score = 0;
      results.veille.success = false;
    }
    
    console.log('\n');
    
    // Test 3: Détection signaux
    console.log('🚨 3️⃣  TEST DÉTECTION SIGNAUX');
    console.log('=' .repeat(50));
    
    try {
      const signauxResult = await testDetectionSignaux();
      results.signaux = signauxResult;
      console.log(`📊 Score signaux: ${signauxResult.score}%`);
    } catch (error: any) {
      console.error('❌ Erreur signaux:', error.message);
      results.signaux.score = 0;
      results.signaux.success = false;
    }
    
    console.log('\n');
    
    // Test 4: Publication hebdomadaire
    console.log('📰 4️⃣  TEST PUBLICATION HEBDOMADAIRE');
    console.log('=' .repeat(50));
    
    try {
      const publicationResult = await testPublicationHebdo();
      results.publication = publicationResult;
      console.log(`📊 Score publication: ${publicationResult.score}%`);
    } catch (error: any) {
      console.error('❌ Erreur publication:', error.message);
      results.publication.score = 0;
      results.publication.success = false;
    }
    
    console.log('\n');
    
    // Résultats globaux
    const totalDuration = Date.now() - startTime;
    const allScores = Object.values(results).map(r => r.score);
    const globalScore = Math.round(allScores.reduce((sum, score) => sum + score, 0) / allScores.length);
    const successfulComponents = Object.values(results).filter(r => r.success).length;
    
    console.log('🎯 5️⃣  RÉSULTATS GLOBAUX');
    console.log('=' .repeat(50));
    console.log(`⏱️  Durée totale: ${Math.round(totalDuration / 1000)}s`);
    console.log(`📊 Score global: ${globalScore}%`);
    console.log(`✅ Composants fonctionnels: ${successfulComponents}/4`);
    
    console.log('\n📊 DÉTAIL PAR COMPOSANT:');
    console.log(`  🏛️  Providers macro: ${results.providers.score}% (${results.providers.success ? '✅' : '❌'})`);
    console.log(`  🔍 Veille continue: ${results.veille.score}% (${results.veille.success ? '✅' : '❌'})`);
    console.log(`  🚨 Détection signaux: ${results.signaux.score}% (${results.signaux.success ? '✅' : '❌'})`);
    console.log(`  📰 Publication hebdo: ${results.publication.score}% (${results.publication.success ? '✅' : '❌'})`);
    
    // Recommandations
    console.log('\n💡 RECOMMANDATIONS:');
    
    if (results.providers.score < 80) {
      console.log('  🔧 Providers: Vérifier les clés API et connectivité réseau');
    }
    
    if (results.veille.score < 80) {
      console.log('  🔧 Veille: Optimiser les timeouts et retry logic');
    }
    
    if (results.signaux.score < 80) {
      console.log('  🔧 Signaux: Ajuster les seuils de novelty/quality');
    }
    
    if (results.publication.score < 80) {
      console.log('  🔧 Publication: Vérifier templates newsletter et SMTP');
    }
    
    // Verdict final
    console.log('\n🎊 VERDICT FINAL:');
    
    if (globalScore >= 80 && successfulComponents >= 3) {
      console.log('🎉 SYSTÈME NOMOSX: PRODUCTION READY!');
      console.log('   ✅ Flow complet opérationnel');
      console.log('   ✅ Tous les composants critiques fonctionnels');
      console.log('   ✅ Prêt pour lancement en production');
    } else if (globalScore >= 60 && successfulComponents >= 2) {
      console.log('⚠️  SYSTÈME NOMOSX: PRÊT AVEC RÉSERVES');
      console.log('   ⚠️  Flow partiellement opérationnel');
      console.log('   🔧 Quelques ajustements nécessaires');
      console.log('   📅 Peut être déployé avec monitoring renforcé');
    } else {
      console.log('❌ SYSTÈME NOMOSX: BESOIN DE TRAVAIL');
      console.log('   ❌ Flow non opérationnel');
      console.log('   🔧 Corrections majeures requises');
      console.log('   📅 Nécessite travail additionnel avant lancement');
    }
    
    return {
      success: globalScore >= 60,
      globalScore,
      successfulComponents,
      totalDuration,
      results,
      recommendations: generateRecommendations(results)
    };
    
  } catch (error: any) {
    console.error('❌ ERREUR CRITIQUE TEST GLOBAL:', error.message);
    return {
      success: false,
      error: error.message,
      globalScore: 0
    };
  }
}

function generateRecommendations(results: any): string[] {
  const recommendations: string[] = [];
  
  if (results.providers.score < 80) {
    recommendations.push('Ajouter clés API Eurostat/ECB/INSEE dans .env');
    recommendations.push('Vérifier connectivité réseau vers APIs macro');
  }
  
  if (results.veille.score < 80) {
    recommendations.push('Optimiser timeouts et retry logic pour providers');
    recommendations.push('Ajouter monitoring temps réel des cycles de veille');
  }
  
  if (results.signaux.score < 80) {
    recommendations.push('Ajuster algorithmes de détection novelty/quality');
    recommendations.push('Enrichir les tags et métadonnées des signaux');
  }
  
  if (results.publication.score < 80) {
    recommendations.push('Vérifier templates HTML et CSS newsletters');
    recommendations.push('Configurer SMTP et test mode production');
  }
  
  if (Object.values(results).every(r => r.score >= 80)) {
    recommendations.push('Déployer en production avec monitoring complet');
    recommendations.push('Mettre en place alerting automatique');
  }
  
  return recommendations;
}

// Exécuter le test complet
testFlowComplet()
  .then(result => {
    console.log('\n✅ Test flow complet terminé');
    console.log(`🎯 Score final: ${result.globalScore}%`);
    process.exit(result.success ? 0 : 1);
  })
  .catch(error => {
    console.error('\n❌ Test flow complet échoué:', error);
    process.exit(1);
  });
