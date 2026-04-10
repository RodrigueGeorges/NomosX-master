#!/usr/bin/env node
/**
 * Test End-to-End du Pipeline Agentique Complet
 * SCOUT → INDEX → RANK → READER → ANALYST → GUARD → EDITOR
 */

import { prisma } from '../lib/db.ts';

// Couleurs pour le terminal
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
};

function log(step, message, status = 'info') {
  const statusColors = {
    info: colors.cyan,
    success: colors.green,
    warning: colors.yellow,
    error: colors.red,
  };
  const color = statusColors[status] || colors.reset;
  console.log(`${color}[${step}]${colors.reset} ${message}`);
}

function logSection(title) {
  console.log(`\n${colors.bright}${colors.blue}${'='.repeat(60)}${colors.reset}`);
  console.log(`${colors.bright}${colors.blue}${title}${colors.reset}`);
  console.log(`${colors.bright}${colors.blue}${'='.repeat(60)}${colors.reset}\n`);
}

async function testPipeline() {
  const startTime = Date.now();
  
  try {
    logSection('🧪 TEST PIPELINE AGENTIQUE COMPLET');
    
    // Configuration du test
    const testQuery = "carbon tax economic impact";
    const testProviders = ["openalex", "crossref"];
    const testLimit = 5; // Petit nombre pour test rapide
    
    log('CONFIG', `Query: "${testQuery}"`, 'info');
    log('CONFIG', `Providers: ${testProviders.join(', ')}`, 'info');
    log('CONFIG', `Limit: ${testLimit} sources`, 'info');
    
    // ================================
    // ÉTAPE 1: SCOUT
    // ================================
    logSection('1️⃣  SCOUT AGENT - Collecte de Sources');
    
    log('SCOUT', 'Importing pipeline...', 'info');
    const { scout } = await import('../lib/agent/pipeline-v2.ts');
    
    log('SCOUT', `Searching for "${testQuery}"...`, 'info');
    const scoutStart = Date.now();
    const scoutResult = await scout(testQuery, testProviders, testLimit);
    const scoutDuration = Date.now() - scoutStart;
    
    log('SCOUT', `✅ Found ${scoutResult.found} sources`, 'success');
    log('SCOUT', `✅ Upserted ${scoutResult.upserted} sources`, 'success');
    log('SCOUT', `✅ Cached: ${scoutResult.cached ? 'YES' : 'NO'}`, 'success');
    log('SCOUT', `⏱️  Duration: ${(scoutDuration / 1000).toFixed(2)}s`, 'info');
    
    if (scoutResult.sourceIds.length === 0) {
      log('SCOUT', '❌ No sources found, cannot continue test', 'error');
      return;
    }
    
    // ================================
    // ÉTAPE 2: INDEX
    // ================================
    logSection('2️⃣  INDEX AGENT - Enrichissement');
    
    log('INDEX', 'Importing index agent...', 'info');
    const { indexAgent } = await import('../lib/agent/index-agent.ts');
    
    log('INDEX', `Enriching ${scoutResult.sourceIds.length} sources...`, 'info');
    const indexStart = Date.now();
    const indexResult = await indexAgent(scoutResult.sourceIds);
    const indexDuration = Date.now() - indexStart;
    
    log('INDEX', `✅ Enriched ${indexResult.enriched} sources`, 'success');
    if (indexResult.errors.length > 0) {
      log('INDEX', `⚠️  ${indexResult.errors.length} errors`, 'warning');
    }
    log('INDEX', `⏱️  Duration: ${(indexDuration / 1000).toFixed(2)}s`, 'info');
    
    // ================================
    // ÉTAPE 3: RANK
    // ================================
    logSection('3️⃣  RANK AGENT - Sélection Top Sources');
    
    log('RANK', 'Importing rank function...', 'info');
    const { rank } = await import('../lib/agent/pipeline-v2.ts');
    
    log('RANK', `Ranking sources by quality (top ${testLimit})...`, 'info');
    const rankStart = Date.now();
    const topSources = await rank(testQuery, testLimit, "quality");
    const rankDuration = Date.now() - rankStart;
    
    log('RANK', `✅ Selected ${topSources.length} top sources`, 'success');
    if (topSources.length > 0) {
      const avgQuality = Math.round(
        topSources.reduce((sum, s) => sum + (s.qualityScore || 0), 0) / topSources.length
      );
      log('RANK', `📊 Average quality score: ${avgQuality}/100`, 'info');
    }
    log('RANK', `⏱️  Duration: ${(rankDuration / 1000).toFixed(2)}s`, 'info');
    
    if (topSources.length === 0) {
      log('RANK', '❌ No sources ranked, cannot continue test', 'error');
      return;
    }
    
    // ================================
    // ÉTAPE 4: READER
    // ================================
    logSection('4️⃣  READER AGENT - Extraction de Contenu');
    
    log('READER', 'Importing reader agent...', 'info');
    const { readerAgent } = await import('../lib/agent/reader-agent.ts');
    
    log('READER', `Reading ${topSources.length} sources...`, 'info');
    const readerStart = Date.now();
    const readings = await readerAgent(topSources);
    const readerDuration = Date.now() - readerStart;
    
    log('READER', `✅ Extracted content from ${readings.length} sources`, 'success');
    
    const confidenceCount = {
      high: readings.filter(r => r.confidence === 'high').length,
      medium: readings.filter(r => r.confidence === 'medium').length,
      low: readings.filter(r => r.confidence === 'low').length,
    };
    log('READER', `📊 Confidence: ${confidenceCount.high} high, ${confidenceCount.medium} medium, ${confidenceCount.low} low`, 'info');
    
    const totalClaims = readings.reduce((sum, r) => sum + (r.claims?.length || 0), 0);
    log('READER', `📊 Total claims extracted: ${totalClaims}`, 'info');
    log('READER', `⏱️  Duration: ${(readerDuration / 1000).toFixed(2)}s`, 'info');
    
    // ================================
    // ÉTAPE 5: ANALYST
    // ================================
    logSection('5️⃣  ANALYST AGENT - Synthèse');
    
    log('ANALYST', 'Importing analyst agent...', 'info');
    const { analystAgent } = await import('../lib/agent/analyst-agent.ts');
    
    log('ANALYST', 'Generating analysis...', 'info');
    const analystStart = Date.now();
    const analysis = await analystAgent(testQuery, topSources, readings);
    const analystDuration = Date.now() - analystStart;
    
    log('ANALYST', `✅ Analysis generated`, 'success');
    log('ANALYST', `📝 Title: "${analysis.title}"`, 'info');
    log('ANALYST', `📊 Summary length: ${analysis.summary.length} chars`, 'info');
    log('ANALYST', `⏱️  Duration: ${(analystDuration / 1000).toFixed(2)}s`, 'info');
    
    // ================================
    // ÉTAPE 6: CITATION GUARD
    // ================================
    logSection('6️⃣  CITATION GUARD - Validation');
    
    log('GUARD', 'Importing citation guard...', 'info');
    const { citationGuard } = await import('../lib/agent/pipeline-v2.ts');
    
    log('GUARD', 'Validating citations...', 'info');
    const guardResult = citationGuard(analysis, topSources.length);
    
    if (guardResult.ok) {
      log('GUARD', `✅ Citations valid`, 'success');
      log('GUARD', `📊 Used ${guardResult.usedCount}/${topSources.length} sources`, 'info');
    } else {
      log('GUARD', `❌ Invalid citations found: ${guardResult.invalid.join(', ')}`, 'error');
    }
    
    // ================================
    // ÉTAPE 7: EDITOR
    // ================================
    logSection('7️⃣  EDITOR AGENT - Rendu HTML');
    
    log('EDITOR', 'Importing editor...', 'info');
    const { renderBriefHTML } = await import('../lib/agent/pipeline-v2.ts');
    
    log('EDITOR', 'Rendering HTML...', 'info');
    const html = renderBriefHTML(analysis, topSources);
    
    log('EDITOR', `✅ HTML rendered`, 'success');
    log('EDITOR', `📊 HTML length: ${html.length} chars`, 'info');
    
    // ================================
    // RÉSUMÉ FINAL
    // ================================
    const totalDuration = Date.now() - startTime;
    
    logSection('📊 RÉSUMÉ DU TEST');
    
    console.log(`${colors.green}✅ PIPELINE COMPLET TESTÉ AVEC SUCCÈS${colors.reset}\n`);
    
    console.log('Étapes exécutées:');
    console.log(`  1. SCOUT:    ${(scoutDuration / 1000).toFixed(2)}s - ${scoutResult.found} sources trouvées`);
    console.log(`  2. INDEX:    ${(indexDuration / 1000).toFixed(2)}s - ${indexResult.enriched} sources enrichies`);
    console.log(`  3. RANK:     ${(rankDuration / 1000).toFixed(2)}s - ${topSources.length} sources sélectionnées`);
    console.log(`  4. READER:   ${(readerDuration / 1000).toFixed(2)}s - ${readings.length} sources lues`);
    console.log(`  5. ANALYST:  ${(analystDuration / 1000).toFixed(2)}s - Analyse générée`);
    console.log(`  6. GUARD:    <1s - Citations ${guardResult.ok ? 'valides' : 'invalides'}`);
    console.log(`  7. EDITOR:   <1s - HTML rendu`);
    
    console.log(`\n${colors.bright}⏱️  Durée totale: ${(totalDuration / 1000).toFixed(2)}s${colors.reset}`);
    
    console.log(`\n${colors.cyan}📄 Résultat final:${colors.reset}`);
    console.log(`  • Titre: "${analysis.title}"`);
    console.log(`  • Sources utilisées: ${topSources.length}`);
    console.log(`  • Claims extraites: ${totalClaims}`);
    console.log(`  • Citations valides: ${guardResult.ok ? 'OUI' : 'NON'}`);
    console.log(`  • HTML généré: ${(html.length / 1024).toFixed(2)} KB`);
    
    if (scoutResult.cached) {
      console.log(`\n${colors.yellow}ℹ️  Note: SCOUT utilisait le cache Redis${colors.reset}`);
    }
    
  } catch (error) {
    console.error(`\n${colors.red}❌ ERREUR PENDANT LE TEST:${colors.reset}`);
    console.error(error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Exécuter le test
testPipeline()
  .then(() => {
    console.log(`\n${colors.green}${colors.bright}✅ Test terminé avec succès${colors.reset}\n`);
    process.exit(0);
  })
  .catch((error) => {
    console.error(`\n${colors.red}❌ Test échoué:${colors.reset}`, error);
    process.exit(1);
  });
