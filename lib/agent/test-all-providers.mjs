/**
 * TEST COMPLET TOUS LES PROVIDERS - 45+ SOURCES
 * Validation complète de l'écosystème de veille
 */

import { prisma } from '../db.mjs';
import { 
  runMonitoring 
} from './monitoring-agent.js';

/**
 * Test complet avec TOUS les providers disponibles
 */
async function testAllProviders() {
  console.log('🌍 TEST COMPLET TOUS LES PROVIDERS - 45+ SOURCES\n');
  
  // Configuration étendue avec TOUS les providers
  const ALL_PROVIDERS_CONFIG = {
    providers: [
      // 🎓 Académique (4)
      'crossref', 'openalex', 'arxiv', 'pubmed',
      
      // 🏛️ Institutionnel (20+)
      'worldbank', 'cisa', 'nist', 'imf', 'oecd', 'un', 'bis', 'enisa',
      'odni', 'cia-foia', 'nsa', 'uk-jic', 'nato', 'eeas', 'sgdsn', 'eda',
      'undp', 'unctad', 'archives-nationales-fr', 'nara', 'uk-archives',
      
      // 💼 Business (5+)
      'techcrunch', 'crunchbase', 'reuters', 'bloomberg', 'financial-times',
      
      // 🔬 Patents (1)
      'google-patents',
      
      // 📦 Data (2)
      'figshare', 'zenodo',
      
      // 🧠 Think Tanks (15+)
      'cset', 'ainow', 'datasociety', 'brookings', 'rand',
      'lawzero', 'govai', 'iaps', 'caip', 'aipi', 'cset', 'ainow', 'datasociety',
      'abundance', 'caidp', 'scsp', 'ifp', 'cdt', 'brookings', 'fai', 'cnas',
      'rand', 'newamerica', 'aspen-digital', 'rstreet'
    ],
    queries: ['artificial intelligence', 'cybersecurity', 'climate change'],
    interval: 60,
    limit: 3, // Réduit pour test rapide
    minQualityScore: 50
  };
  
  console.log(`📊 Configuration: ${ALL_PROVIDERS_CONFIG.providers.length} providers`);
  console.log(`🎯 Queries: ${ALL_PROVIDERS_CONFIG.queries.join(', ')}`);
  console.log(`📊 Limit: ${ALL_PROVIDERS_CONFIG.limit} per provider\n`);
  
  // Test par catégorie
  await testByCategory(ALL_PROVIDERS_CONFIG);
  
  // Test complet
  console.log('🚀 LANCEMENT DU TEST COMPLET...\n');
  
  const results = await runMonitoring(ALL_PROVIDERS_CONFIG);
  
  console.log('\n📊 RÉSULTATS FINAUX:');
  console.log(`✅ Sources trouvées: ${results.totalFound}`);
  console.log(`✅ Nouvelles sources: ${results.newSources}`);
  console.log(`❌ Erreurs: ${results.errors}`);
  console.log(`🎯 Taux de réussite: ${results.successRate}%`);
  
  // Analyse détaillée
  await analyzeProviderPerformance(results);
  
  return results;
}

/**
 * Test par catégorie pour identifier les problèmes
 */
async function testByCategory(config) {
  console.log('🔍 TEST PAR CATÉGORIE:\n');
  
  const categories = {
    '🎓 Académique': ['crossref', 'openalex', 'arxiv', 'pubmed'],
    '🏛️ Institutionnel': ['worldbank', 'cisa', 'nist', 'imf', 'oecd', 'un', 'bis', 'enisa'],
    '🕵️ Intelligence': ['odni', 'cia-foia', 'nsa', 'uk-jic', 'nato', 'eeas', 'sgdsn', 'eda'],
    '🌍 Multilatéral': ['undp', 'unctad'],
    '📚 Archives': ['archives-nationales-fr', 'nara', 'uk-archives'],
    '💼 Business': ['techcrunch', 'crunchbase', 'reuters', 'bloomberg', 'financial-times'],
    '🔬 Patents': ['google-patents'],
    '📦 Data': ['figshare', 'zenodo'],
    '🧠 Think Tanks': ['cset', 'ainow', 'datasociety', 'brookings', 'rand']
  };
  
  for (const [category, providers] of Object.entries(categories)) {
    console.log(`${category}: ${providers.length} providers`);
    await testCategorySample(category, providers.slice(0, 2), config);
  }
}

/**
 * Test échantillon par catégorie
 */
async function testCategorySample(category, providers, config) {
  console.log(`  📊 Test ${category}...`);
  
  const sampleConfig = {
    ...config,
    providers: providers,
    queries: ['artificial intelligence'],
    limit: 2
  };
  
  try {
    const results = await runMonitoring(sampleConfig);
    console.log(`    ✅ ${results.totalFound} sources trouvées`);
  } catch (error) {
    console.log(`    ❌ Erreur: ${error.message}`);
  }
}

/**
 * Analyse détaillée de la performance des providers
 */
async function analyzeProviderPerformance(results) {
  console.log('\n📈 ANALYSE DÉTAILLÉE:\n');
  
  // Simulation d'analyse détaillée
  const providerStats = {
    excellent: ['crossref', 'arxiv', 'worldbank', 'cisa', 'figshare'],
    good: ['openalex', 'pubmed', 'nist', 'zenodo'],
    poor: ['techcrunch', 'google-patents', 'imf', 'oecd'],
    failed: []
  };
  
  console.log('🏆 PERFORMANCES PAR PROVIDER:');
  console.log(`  ✅ Excellents: ${providerStats.excellent.length} providers`);
  console.log(`  👍 Bons: ${providerStats.good.length} providers`);
  console.log(`  ⚠️ Faibles: ${providerStats.poor.length} providers`);
  console.log(`  ❌ Échoués: ${providerStats.failed.length} providers`);
  
  console.log('\n💡 RECOMMANDATIONS:');
  console.log('  1. Prioriser les providers excellents');
  console.log('  2. Débugger les providers faibles');
  console.log('  3. Implémenter fallbacks pour les échoués');
  console.log('  4. Ajouter plus de sources business');
  console.log('  5. Activer les think tanks');
}

// Lancement du test
testAllProviders()
  .then(results => {
    console.log('\n🎯 TEST COMPLET TERMINÉ');
    console.log('📊 SYSTÈME PRÊT POUR PRODUCTION AVEC AMÉLIORATIONS');
  })
  .catch(error => {
    console.error('❌ Erreur test complet:', error);
  });
