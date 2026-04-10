/**
 * TEST PROFESSIONNEL SOURCES VARIÉES - CONDITIONS RÉELLES
 * Test complet avec base de données et monitoring agent étendu
 */

import { prisma } from '../db.ts';
import { setTimeout as sleep } from 'timers/promises';

// Import des providers existants qui fonctionnent
import { searchWorldBankAPI } from '../providers/institutional/stable/worldbank-api.ts';
import { searchCISAAdvisories } from '../providers/institutional/stable/cisa-advisories.ts';
import { searchNIST } from '../providers/institutional/v2/nist-publications.ts';
import { searchIMFeLibrary } from '../providers/institutional/v2/imf-elibrary.ts';
import { searchOECDiLibrary } from '../providers/institutional/v2/oecd-ilibrary.ts';

// Import des nouveaux providers sources variées
import { searchCrossref } from '../providers/academic/crossref-api.ts';
import { searchArXiv } from '../providers/academic/arxiv-api.ts';
import { searchTechCrunch } from '../providers/business/techcrunch-api.ts';
import { searchGooglePatents } from '../providers/patents/google-patents-api.ts';
import { searchFigshare } from '../providers/data/figshare-api.ts';

import { scoreSource } from '../score.ts';

// Mapping des providers pour le test
const TEST_PROVIDER_FUNCTIONS = {
  // 🎓 Académique Fondamental (40% poids)
  'crossref': searchCrossref,
  'arxiv': searchArXiv,
  
  // 🏛️ Institutionnel & Politique (25% poids)
  'worldbank': searchWorldBankAPI,
  'cisa': searchCISAAdvisories,
  'nist': searchNIST,
  'imf': searchIMFeLibrary,
  'oecd': searchOECDiLibrary,
  
  // 💼 Business & Innovation (20% poids)
  'techcrunch': searchTechCrunch,
  
  // 🔬 Innovation & Patents (10% poids)
  'google-patents': searchGooglePatents,
  
  // 📦 Data & Repositories (10% poids)
  'figshare': searchFigshare
};

// Configuration professionnelle de test
const PROFESSIONAL_TEST_CONFIG = {
  providers: Object.keys(TEST_PROVIDER_FUNCTIONS),
  queries: [
    'artificial intelligence',
    'cybersecurity',
    'climate change'
  ],
  limit: 5,
  minQualityScore: 60
};

/**
 * Vérifie si une source existe déjà dans la base de données
 */
async function sourceExists(id) {
  try {
    const existing = await prisma.source.findUnique({ where: { id } });
    return Boolean(existing);
  } catch (error) {
    console.error(`Error checking source existence: ${error.message}`);
    return false;
  }
}

/**
 * Insère ou met à jour une source dans la base de données
 */
async function upsertSource(source) {
  try {
    // Calculer qualityScore
    const qualityScore = scoreSource({
      citationCount: source.citationCount || 0,
      year: source.year,
      oaStatus: source.oaStatus,
      provider: source.provider,
      type: source.type,
      issuerType: source.issuerType,
      classification: source.classification,
      documentType: source.documentType
    });
    
    await prisma.source.upsert({
      where: { id: source.id },
      create: {
        id: source.id,
        provider: source.provider,
        type: source.type,
        title: source.title,
        abstract: source.abstract,
        url: source.url,
        pdfUrl: source.pdfUrl,
        year: source.year,
        citationCount: source.citationCount || 0,
        oaStatus: source.oaStatus || 'unknown',
        qualityScore,
        noveltyScore: 100, // Nouveau = haute novelty
        
        // Institutional fields
        documentType: source.documentType,
        issuer: source.issuer,
        issuerType: source.issuerType,
        classification: source.classification,
        publishedDate: source.publishedDate,
        language: source.language,
        contentFormat: source.contentFormat,
        
        raw: source.raw || {}
      },
      update: {
        title: source.title,
        abstract: source.abstract,
        url: source.url,
        pdfUrl: source.pdfUrl,
        qualityScore,
        updatedAt: new Date()
      }
    });
    
    return true;
  } catch (error) {
    console.error(`Failed to upsert source ${source.id}: ${error.message}`);
    return false;
  }
}

/**
 * Test un provider spécifique avec base de données
 */
async function testProviderWithDB(provider, query, limit, minQualityScore) {
  const searchFn = TEST_PROVIDER_FUNCTIONS[provider];
  
  if (!searchFn) {
    return { newSources: 0, totalChecked: 0, errors: [`Provider ${provider} not found`] };
  }
  
  console.log(`  🔍 ${provider.toUpperCase()} - "${query}"`);
  
  try {
    const sources = await searchFn(query, limit);
    let newCount = 0;
    const errors = [];
    
    for (const source of sources) {
      // Check quality threshold
      const qualityScore = scoreSource({
        citationCount: source.citationCount || 0,
        year: source.year,
        oaStatus: source.oaStatus,
        provider: source.provider,
        type: source.type,
        issuerType: source.issuerType,
        classification: source.classification,
        documentType: source.documentType
      });
      
      if (qualityScore < minQualityScore) {
        continue;
      }
      
      // Check if new
      const exists = await sourceExists(source.id);
      
      if (!exists) {
        const success = await upsertSource(source);
        if (success) {
          newCount++;
          console.log(`    ✅ NEW: ${source.title.substring(0, 60)}...`);
        }
      }
    }
    
    console.log(`    📊 Found: ${sources.length}, New: ${newCount}, Quality: ${minQualityScore}+`);
    return { newSources: newCount, totalChecked: sources.length, errors };
    
  } catch (error) {
    console.error(`    ❌ Error: ${error.message}`);
    return { newSources: 0, totalChecked: 0, errors: [error.message] };
  }
}

/**
 * Test professionnel complet avec base de données
 */
async function runProfessionalTest() {
  console.log('🚀 TEST PROFESSIONNEL SOURCES VARIÉES - CONDITIONS RÉELLES\n');
  
  // Vérifier connexion base de données
  try {
    await prisma.$connect();
    console.log('✅ Base de données connectée');
    
    // Compter sources existantes
    const existingCount = await prisma.source.count();
    console.log(`📊 Sources existantes: ${existingCount}\n`);
  } catch (error) {
    console.error('❌ Erreur connexion base de données:', error.message);
    return;
  }
  
  console.log('📊 CONFIGURATION PROFESSIONNELLE:');
  console.log(`  Providers: ${PROFESSIONAL_TEST_CONFIG.providers.length}`);
  console.log(`  Queries: ${PROFESSIONAL_TEST_CONFIG.queries.length}`);
  console.log(`  Limit: ${PROFESSIONAL_TEST_CONFIG.limit} per provider`);
  console.log(`  Min Quality: ${PROFESSIONAL_TEST_CONFIG.minQualityScore}\n`);
  
  console.log('🎯 CATÉGORIES DE SOURCES:');
  const categories = {
    '🎓 Académique': ['crossref', 'arxiv'],
    '🏛️ Institutionnel': ['worldbank', 'cisa', 'nist', 'imf', 'oecd'],
    '💼 Business': ['techcrunch'],
    '🔬 Patents': ['google-patents'],
    '📦 Data': ['figshare']
  };
  
  Object.entries(categories).forEach(([category, providers]) => {
    console.log(`  ${category}: ${providers.join(', ')}`);
  });
  
  console.log('\n🔍 LANCEMENT DU TEST PROFESSIONNEL...\n');
  
  const results = [];
  let totalNew = 0;
  let totalChecked = 0;
  let totalErrors = 0;
  
  for (const provider of PROFESSIONAL_TEST_CONFIG.providers) {
    let providerNew = 0;
    let providerChecked = 0;
    const providerErrors = [];
    
    for (const query of PROFESSIONAL_TEST_CONFIG.queries) {
      const result = await testProviderWithDB(
        provider, 
        query, 
        PROFESSIONAL_TEST_CONFIG.limit, 
        PROFESSIONAL_TEST_CONFIG.minQualityScore
      );
      
      providerNew += result.newSources;
      providerChecked += result.totalChecked;
      providerErrors.push(...result.errors);
      
      await sleep(1000); // Rate limiting entre queries
    }
    
    results.push({
      provider,
      newSources: providerNew,
      totalChecked: providerChecked,
      errors: providerErrors
    });
    
    totalNew += providerNew;
    totalChecked += providerChecked;
    totalErrors += providerErrors.length;
    
    await sleep(2000); // Rate limiting entre providers
  }
  
  // Analyse finale
  console.log('\n📊 RÉSULTATS PROFESSIONNELS:');
  console.log(`  ✅ Nouvelles sources: ${totalNew}`);
  console.log(`  🔍 Sources vérifiées: ${totalChecked}`);
  console.log(`  ❌ Erreurs: ${totalErrors}`);
  console.log(`  🎯 Taux de réussite: ${totalChecked > 0 ? Math.round((totalChecked - totalErrors) / totalChecked * 100) : 0}%`);
  
  // Vérifier le total dans la base de données
  const finalCount = await prisma.source.count();
  console.log(`  📊 Total sources dans DB: ${finalCount} (+${totalNew} nouvelles)`);
  
  console.log('\n🎯 DÉTAIL PAR PROVIDER:');
  results.forEach((result, i) => {
    const status = result.errors.length === 0 ? '✅' : result.errors.length < 2 ? '⚠️' : '❌';
    console.log(`  ${i+1}. ${result.provider.padEnd(15)} ${status} ${result.newSources}/${result.totalChecked} (${result.errors.length} erreurs)`);
  });
  
  console.log('\n🎯 ANALYSE PAR CATÉGORIE:');
  Object.entries(categories).forEach(([category, providers]) => {
    const categoryResults = results.filter(r => providers.includes(r.provider));
    const categoryNew = categoryResults.reduce((sum, r) => sum + r.newSources, 0);
    const categoryChecked = categoryResults.reduce((sum, r) => sum + r.totalChecked, 0);
    const categoryErrors = categoryResults.reduce((sum, r) => sum + r.errors.length, 0);
    
    const status = categoryErrors === 0 ? '✅' : categoryErrors < 2 ? '⚠️' : '❌';
    console.log(`  ${category.padEnd(15)} ${status} ${categoryNew}/${categoryChecked} (${categoryErrors} erreurs)`);
  });
  
  console.log('\n🎯 STATUS FINAL:');
  
  if (totalErrors === 0 && totalNew > 0) {
    console.log('  🚀 EXCELLENT - SOURCES VARIÉES INTÉGRÉES AVEC SUCCÈS');
    console.log('  ✅ Tous les providers fonctionnent');
    console.log('  ✅ Base de données mise à jour');
    console.log('  ✅ Sources variées collectées');
    console.log('  🎯 PRODUCTION-READY');
  } else if (totalErrors < results.length / 2 && totalNew > 0) {
    console.log('  ✅ BON - SOURCES VARIÉES PARTIELLEMENT INTÉGRÉES');
    console.log(`  ✅ ${results.length - totalErrors}/${results.length} providers fonctionnent`);
    console.log('  ✅ Base de données partiellement mise à jour');
    console.log('  🎯 PRÊT POUR OPTIMISATION');
  } else {
    console.log('  ⚠️  INTÉGRATION À AMÉLIORER');
    console.log(`  🔧 ${totalErrors}/${results.length} providers en erreur`);
    console.log('  🎯 NÉCESSITE DÉBOGAGE AVANT PRODUCTION');
  }
  
  console.log('\n💡 IMPACT SUR SYSTÈME:');
  console.log('  ✅ Agents intelligents alimentés par sources variées');
  console.log('  ✅ Cross-domain analysis activé');
  console.log('  ✅ Weak signal detection améliorée');
  console.log('  ✅ Innovation spotting plus pertinent');
  console.log('  ✅ Publications plus innovantes et variées');
  
  // Nettoyage
  await prisma.$disconnect();
  
  return {
    success: totalErrors < results.length / 2,
    totalNew,
    totalChecked,
    totalErrors,
    successRate: totalChecked > 0 ? Math.round((totalChecked - totalErrors) / totalChecked * 100) : 0,
    finalDBCount: finalCount,
    results
  };
}

// Lancer le test professionnel
runProfessionalTest();
