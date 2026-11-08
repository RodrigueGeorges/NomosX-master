/**
 * TEST FLOW COMPLET - Version ultra-simple
 * Test du flow complet sans dépendances complexes
 */

async function testFlowCompletSimple() {
  console.log('🚀 TEST FLOW COMPLET - Version Simple\n');
  
  const results = {
    providers: { success: false, score: 0, details: null },
    imports: { success: false, score: 0, details: null },
    config: { success: false, score: 0, details: null }
  };
  
  try {
    // Test 1: Imports des providers macro
    console.log('📦 1️⃣  TEST IMPORTS PROVIDERS');
    console.log('=' .repeat(50));
    
    try {
      // Import direct des providers
      const eurostatModule = await import('../lib/providers/macro/eurostat-api.ts');
      const ecbModule = await import('../lib/providers/macro/ecb-api.ts');
      const inseeModule = await import('../lib/providers/macro/insee-api.ts');
      
      console.log('✅ Eurostat API importé');
      console.log('✅ ECB API importé');
      console.log('✅ INSEE API importé');
      
      results.imports.success = true;
      results.imports.score = 100;
      results.imports.details = { eurostat: true, ecb: true, insee: true };
      
    } catch (error) {
      console.error('❌ Erreur imports:', error.message);
      results.imports.score = 0;
    }
    
    // Test 2: Configuration environnement
    console.log('\n⚙️  2️⃣  TEST CONFIGURATION');
    console.log('=' .repeat(50));
    
    try {
      // Vérifier les variables d'environnement critiques
      const requiredVars = ['DATABASE_URL', 'OPENAI_API_KEY', 'JWT_SECRET'];
      const presentVars = requiredVars.filter(v => process.env[v]);
      
      console.log(`📊 Variables requises: ${presentVars.length}/${requiredVars.length}`);
      requiredVars.forEach(v => {
        console.log(`  ${process.env[v] ? '✅' : '❌'} ${v}`);
      });
      
      results.config.success = presentVars.length >= 2;
      results.config.score = Math.round((presentVars.length / requiredVars.length) * 100);
      results.config.details = { present: presentVars, required: requiredVars };
      
    } catch (error) {
      console.error('❌ Erreur config:', error.message);
      results.config.score = 0;
    }
    
    // Test 3: Providers macro (simple)
    console.log('\n🏛️  3️⃣  TEST PROVIDERS MACRO');
    console.log('=' .repeat(50));
    
    try {
      const { searchEurostat } = await import('../lib/providers/macro/eurostat-api.ts');
      const { searchECB } = await import('../lib/providers/macro/ecb-api.ts');
      const { searchINSEE } = await import('../lib/providers/macro/insee-api.ts');
      
      // Test rapide avec fallback
      const eurostatTest = await searchEurostat('inflation', 1);
      const ecbTest = await searchECB('interest', 1);
      const inseeTest = await searchINSEE('gdp', 1);
      
      const providerResults = {
        eurostat: { count: eurostatTest.length, success: eurostatTest.length > 0 },
        ecb: { count: ecbTest.length, success: ecbTest.length > 0 },
        insee: { count: inseeTest.length, success: inseeTest.length > 0 }
      };
      
      const workingProviders = Object.values(providerResults).filter(r => r.success).length;
      results.providers.score = Math.round((workingProviders / 3) * 100);
      results.providers.success = workingProviders >= 2;
      results.providers.details = providerResults;
      
      console.log(`✅ Eurostat: ${eurostatTest.length} sources`);
      console.log(`✅ ECB: ${ecbTest.length} sources`);
      console.log(`✅ INSEE: ${inseeTest.length} sources`);
      console.log(`📊 Score providers: ${results.providers.score}%`);
      
    } catch (error) {
      console.error('❌ Erreur providers:', error.message);
      results.providers.score = 0;
      results.providers.success = false;
    }
    
    // Résultats globaux
    const allScores = Object.values(results).map(r => r.score);
    const globalScore = Math.round(allScores.reduce((sum, score) => sum + score, 0) / allScores.length);
    const successfulComponents = Object.values(results).filter(r => r.success).length;
    
    console.log('\n🎯 RÉSULTATS GLOBAUX');
    console.log('=' .repeat(50));
    console.log(`📊 Score global: ${globalScore}%`);
    console.log(`✅ Composants fonctionnels: ${successfulComponents}/3`);
    
    console.log('\n📊 DÉTAIL PAR COMPOSANT:');
    console.log(`  📦 Imports: ${results.imports.score}% (${results.imports.success ? '✅' : '❌'})`);
    console.log(`  ⚙️  Configuration: ${results.config.score}% (${results.config.success ? '✅' : '❌'})`);
    console.log(`  🏛️  Providers macro: ${results.providers.score}% (${results.providers.success ? '✅' : '❌'})`);
    
    // Verdict final
    console.log('\n🎊 VERDICT FINAL:');
    
    if (globalScore >= 80 && successfulComponents >= 2) {
      console.log('🎉 SYSTÈME NOMOSX: PRÊT POUR OPENCLAW !');
      console.log('   ✅ Infrastructure fonctionnelle');
      console.log('   ✅ Providers macro opérationnels');
      console.log('   ✅ Configuration OK');
    } else if (globalScore >= 60) {
      console.log('⚠️  SYSTÈME NOMOSX: PRÊT AVEC RÉSERVES');
      console.log('   ⚠️  Quelques ajustements nécessaires');
    } else {
      console.log('❌ SYSTÈME NOMOSX: BESOIN DE TRAVAIL');
      console.log('   ❌ Corrections requises');
    }
    
    return {
      success: globalScore >= 60,
      globalScore,
      successfulComponents,
      results
    };
    
  } catch (error) {
    console.error('❌ ERREUR CRITIQUE TEST GLOBAL:', error.message);
    return {
      success: false,
      error: error.message,
      globalScore: 0
    };
  }
}

// Exécuter le test complet
testFlowCompletSimple()
  .then(result => {
    console.log('\n✅ Test flow complet terminé');
    console.log(`🎯 Score final: ${result.globalScore}%`);
    process.exit(result.success ? 0 : 1);
  })
  .catch(error => {
    console.error('\n❌ Test flow complet échoué:', error);
    process.exit(1);
  });
