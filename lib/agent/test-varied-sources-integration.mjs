/**
 * TEST INTEGRATION SOURCES VARIÉES
 * Vérification du monitoring agent étendu avec sources variées
 */

import { VARIED_SOURCES_MONITORING, runMonitoringCycle } from './monitoring-agent.ts';
import { setTimeout as sleep } from 'timers/promises';

async function testVariedSourcesIntegration() {
  console.log('🧪 TEST INTEGRATION SOURCES VARIÉES\n');
  
  // Configuration de test réduite
  const testConfig = {
    ...VARIED_SOURCES_MONITORING,
    providers: [
      // Test échantillon de chaque catégorie
      'crossref',        // 🎓 Académique
      'arxiv',           // 🎓 Académique
      'worldbank',       // 🏛️ Institutionnel
      'techcrunch',      // 💼 Business
      'google-patents',  // 🔬 Patents
      'figshare',        // 📦 Data
      'cset'             // 🧠 Think Tank
    ],
    queries: ['artificial intelligence'],
    limit: 3,
    minQualityScore: 50
  };
  
  console.log('📊 CONFIGURATION DE TEST:');
  console.log(`  Providers: ${testConfig.providers.length}`);
  console.log(`  Queries: ${testConfig.queries.length}`);
  console.log(`  Limit: ${testConfig.limit} per provider`);
  console.log(`  Min Quality: ${testConfig.minQualityScore}\n`);
  
  console.log('🔍 DÉTAIL DES PROVIDERS:');
  testConfig.providers.forEach((provider, i) => {
    const categories = {
      'crossref': '🎓 Académique',
      'arxiv': '🎓 Académique',
      'worldbank': '🏛️ Institutionnel',
      'techcrunch': '💼 Business',
      'google-patents': '🔬 Patents',
      'figshare': '📦 Data',
      'cset': '🧠 Think Tank'
    };
    
    console.log(`  ${i+1}. ${provider} - ${categories[provider] || 'Unknown'}`);
  });
  
  console.log('\n🚀 LANCEMENT DU TEST DE MONITORING...');
  
  try {
    const results = await runMonitoringCycle(testConfig);
    
    console.log('\n📊 RÉSULTATS DU TEST:');
    console.log(`  ✅ Providers traités: ${results.length}`);
    
    let totalNew = 0;
    let totalChecked = 0;
    let totalErrors = 0;
    
    results.forEach((result, i) => {
      console.log(`\n${i+1}. ${result.provider.toUpperCase()}`);
      console.log(`   📊 Nouveaux: ${result.newSources}`);
      console.log(`   🔍 Vérifiés: ${result.totalChecked}`);
      console.log(`   ❌ Erreurs: ${result.errors.length}`);
      
      totalNew += result.newSources;
      totalChecked += result.totalChecked;
      totalErrors += result.errors.length;
      
      if (result.errors.length > 0) {
        console.log(`   🚨 Erreurs: ${result.errors.slice(0, 2).join(', ')}${result.errors.length > 2 ? '...' : ''}`);
      }
    });
    
    console.log('\n📈 BILAN GLOBAL:');
    console.log(`  ✅ Total nouvelles sources: ${totalNew}`);
    console.log(`  🔍 Total sources vérifiées: ${totalChecked}`);
    console.log(`  ❌ Total erreurs: ${totalErrors}`);
    console.log(`  🎯 Taux de réussite: ${totalChecked > 0 ? Math.round((totalChecked - totalErrors) / totalChecked * 100) : 0}%`);
    
    // Analyse par catégorie
    console.log('\n🎯 ANALYSE PAR CATÉGORIE:');
    const categories = {
      '🎓 Académique': ['crossref', 'arxiv'],
      '🏛️ Institutionnel': ['worldbank'],
      '💼 Business': ['techcrunch'],
      '🔬 Patents': ['google-patents'],
      '📦 Data': ['figshare'],
      '🧠 Think Tank': ['cset']
    };
    
    Object.entries(categories).forEach(([category, providers]) => {
      const categoryResults = results.filter(r => providers.includes(r.provider));
      const categoryNew = categoryResults.reduce((sum, r) => sum + r.newSources, 0);
      const categoryChecked = categoryResults.reduce((sum, r) => sum + r.totalChecked, 0);
      const categoryErrors = categoryResults.reduce((sum, r) => sum + r.errors.length, 0);
      
      console.log(`  ${category}: ${categoryNew}/${categoryChecked} (${categoryErrors > 0 ? '❌' : '✅'})`);
    });
    
    console.log('\n🎯 STATUS INTÉGRATION:');
    
    if (totalErrors === 0 && totalNew > 0) {
      console.log('  🚀 INTÉGRATION PARFAITE - SOURCES VARIÉES OPÉRATIONNELLES');
      console.log('  ✅ Tous les providers fonctionnent');
      console.log('  ✅ Sources variées collectées');
      console.log('  🎯 PRÊT POUR PRODUCTION');
    } else if (totalErrors < results.length / 2) {
      console.log('  ✅ INTÉGRATION BONNE - SOURCES VARIÉES PARTIELLEMENT OPÉRATIONNELLES');
      console.log(`  ✅ ${results.length - totalErrors}/${results.length} providers fonctionnent`);
      console.log('  🎯 PRÊT POUR OPTIMISATIONS');
    } else {
      console.log('  ⚠️  INTÉGRATION À AMÉLIORER');
      console.log(`  🔧 ${totalErrors}/${results.length} providers en erreur`);
      console.log('  🎯 NÉCESSITE DÉBOGAGE');
    }
    
    console.log('\n💡 IMPACT SUR AGENTS INTELLIGENTS:');
    console.log('  ✅ Sources académiques pour analyses profondes');
    console.log('  ✅ Sources business pour insights marché');
    console.log('  ✅ Sources institutionnelles pour contextes politiques');
    console.log('  ✅ Sources patents pour innovations');
    console.log('  ✅ Sources data pour validations empiriques');
    console.log('  ✅ Sources think tanks pour analyses stratégiques');
    
    return {
      success: totalErrors < results.length / 2,
      totalNew,
      totalChecked,
      totalErrors,
      successRate: totalChecked > 0 ? Math.round((totalChecked - totalErrors) / totalChecked * 100) : 0,
      results
    };
    
  } catch (error) {
    console.error('❌ ERREUR LORS DU TEST:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

// Lancer le test
testVariedSourcesIntegration();
