#!/usr/bin/env node
/**
 * Analyse du volume de données disponible pour NomosX
 * Vérifie qu'on a assez de matière malgré le filtrage Content-First
 */

import 'dotenv/config';

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(msg, color = 'reset') {
  console.log(`${colors[color]}${msg}${colors.reset}`);
}

async function testProviderVolume(provider, url) {
  try {
    const startTime = Date.now();
    const response = await fetch(url, {
      headers: { 
        "Accept": "application/json",
        "User-Agent": "NomosX Research Agent (test)"
      }
    });
    const duration = Date.now() - startTime;
    
    if (!response.ok) {
      return { success: false, count: 0, duration, error: `HTTP ${response.status}` };
    }
    
    const data = await response.json();
    
    // Parser selon le provider
    let count = 0;
    let hasAbstract = 0;
    let results = [];
    
    switch(provider) {
      case 'openalex':
        results = data?.results || [];
        count = results.length;
        hasAbstract = results.filter(r => r.abstract_inverted_index || r.abstract).length;
        break;
      case 'hal':
        results = data?.response?.docs || [];
        count = results.length;
        hasAbstract = results.filter(r => r.abstract_s).length;
        break;
      case 'thesesfr':
        results = data?.theses || [];
        count = results.length;
        // Pour theses.fr, on compte les exploitables (soutenues avec auteurs)
        hasAbstract = results.filter(r => r.status === "soutenue" && r.auteurs?.length > 0).length;
        break;
      case 'crossref':
        results = data?.message?.items || [];
        count = results.length;
        hasAbstract = results.filter(r => r.abstract).length;
        break;
      case 'arxiv':
        const entries = data?.feed?.entry || [];
        results = Array.isArray(entries) ? entries : [entries];
        count = results.length;
        hasAbstract = results.filter(r => r.summary).length;
        break;
    }
    
    return { 
      success: true, 
      count, 
      hasAbstract,
      duration,
      abstractRate: count > 0 ? Math.round((hasAbstract / count) * 100) : 0
    };
    
  } catch (error) {
    return { success: false, count: 0, duration: 0, error: error.message };
  }
}

async function analyzeDataVolume() {
  log('\n╔═══════════════════════════════════════════════════════════════════╗', 'bright');
  log('║     ANALYSE VOLUME DE DONNÉES : NomosX a-t-il assez de matière ? ║', 'bright');
  log('╚═══════════════════════════════════════════════════════════════════╝', 'bright');
  
  const query = "climate change policy";
  const perProvider = 20;
  
  log(`\n📋 Requête test : "${query}"`, 'cyan');
  log(`📊 Volume par provider : ${perProvider} résultats\n`, 'cyan');
  
  // Configuration des providers
  const providers = [
    {
      name: 'OpenAlex',
      key: 'openalex',
      url: `https://api.openalex.org/works?search=${encodeURIComponent(query)}&per-page=${perProvider}`,
      importance: 'CRITIQUE',
      coverage: 'Global (250M+ works)'
    },
    {
      name: 'HAL',
      key: 'hal',
      url: `https://api.archives-ouvertes.fr/search/?q=${encodeURIComponent(query)}&wt=json&rows=${perProvider}`,
      importance: 'HAUTE',
      coverage: 'France (1M+ docs)'
    },
    {
      name: 'Crossref',
      key: 'crossref',
      url: `https://api.crossref.org/works?query=${encodeURIComponent(query)}&rows=${perProvider}`,
      importance: 'HAUTE',
      coverage: 'Global (140M+ works)'
    },
    {
      name: 'arXiv',
      key: 'arxiv',
      url: `http://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(query)}&max_results=${perProvider}`,
      importance: 'MOYENNE',
      coverage: 'Preprints (2.4M+)'
    },
    {
      name: 'theses.fr',
      key: 'thesesfr',
      url: `https://theses.fr/api/v1/theses/recherche/?q=${encodeURIComponent(query)}&nombre=${Math.min(15, perProvider)}`,
      importance: 'NICHE',
      coverage: 'Thèses FR (500K+)'
    }
  ];
  
  log('═'.repeat(70), 'bright');
  log('🔍 TEST DES PROVIDERS', 'bright');
  log('═'.repeat(70), 'bright');
  
  const results = [];
  
  for (const provider of providers) {
    log(`\n📡 ${provider.name}...`, 'blue');
    log(`   Coverage: ${provider.coverage}`, 'cyan');
    
    const result = await testProviderVolume(provider.key, provider.url);
    
    if (result.success) {
      log(`   ✅ ${result.count} résultats en ${result.duration}ms`, 'green');
      log(`   📝 ${result.hasAbstract} avec contenu exploitable (${result.abstractRate}%)`, result.abstractRate >= 50 ? 'green' : 'yellow');
    } else {
      log(`   ❌ Erreur: ${result.error}`, 'red');
    }
    
    results.push({ ...provider, ...result });
  }
  
  // Analyse globale
  log('\n\n═'.repeat(70), 'bright');
  log('📊 ANALYSE GLOBALE', 'bright');
  log('═'.repeat(70), 'bright');
  
  const totalAvailable = results.reduce((sum, r) => sum + (r.count || 0), 0);
  const totalExploitable = results.reduce((sum, r) => sum + (r.hasAbstract || 0), 0);
  const successfulProviders = results.filter(r => r.success && r.count > 0);
  const avgAbstractRate = successfulProviders.length > 0 
    ? Math.round(successfulProviders.reduce((sum, r) => sum + (r.abstractRate || 0), 0) / successfulProviders.length)
    : 0;
  
  log(`\n📈 Volume total disponible :`, 'bright');
  log(`   • ${totalAvailable} sources trouvées`, totalAvailable >= 60 ? 'green' : 'yellow');
  log(`   • ${totalExploitable} sources exploitables`, totalExploitable >= 40 ? 'green' : 'yellow');
  log(`   • ${avgAbstractRate}% taux moyen d'exploitation`, avgAbstractRate >= 60 ? 'green' : 'yellow');
  
  // Breakdown par provider
  log(`\n\n📊 BREAKDOWN PAR PROVIDER`, 'bright');
  log('─'.repeat(70));
  
  results
    .sort((a, b) => b.hasAbstract - a.hasAbstract)
    .forEach((r, i) => {
      const bar = '█'.repeat(Math.floor(r.hasAbstract / 2));
      log(`\n${i + 1}. ${r.name.padEnd(15)} ${bar} ${r.hasAbstract}/${r.count} (${r.abstractRate}%)`, r.abstractRate >= 50 ? 'green' : 'yellow');
      log(`   Importance: ${r.importance}`, 'cyan');
    });
  
  // Impact de theses.fr
  log(`\n\n${'═'.repeat(70)}`, 'bright');
  log('🎯 IMPACT DE LA STRATÉGIE CONTENT-FIRST', 'bright');
  log('═'.repeat(70), 'bright');
  
  const thesesfr = results.find(r => r.key === 'thesesfr');
  const withoutThesesfr = results.filter(r => r.key !== 'thesesfr');
  
  const volumeWithout = withoutThesesfr.reduce((sum, r) => sum + (r.hasAbstract || 0), 0);
  const volumeWith = totalExploitable;
  const thesesfrContribution = thesesfr ? (thesesfr.hasAbstract || 0) : 0;
  const contributionPercent = volumeWith > 0 ? Math.round((thesesfrContribution / volumeWith) * 100) : 0;
  
  log(`\n📊 Scénarios :`, 'bright');
  log(`\n1️⃣  SANS theses.fr :`);
  log(`   → ${volumeWithout} sources exploitables`);
  log(`   → 4 providers (OpenAlex, HAL, Crossref, arXiv)`);
  
  log(`\n2️⃣  AVEC theses.fr (Content-First) :`);
  log(`   → ${volumeWith} sources exploitables`, 'green');
  log(`   → 5 providers`);
  log(`   → +${thesesfrContribution} sources françaises (${contributionPercent}% du total)`, 'green');
  
  log(`\n💡 Analyse :`);
  if (volumeWithout >= 40) {
    log(`   ✅ Même SANS theses.fr, ${volumeWithout} sources = LARGEMENT suffisant`, 'green');
    log(`   ✅ theses.fr apporte +${contributionPercent}% de valeur ajoutée`, 'green');
    log(`   ✅ Stratégie Content-First = VALIDÉE (qualité > quantité)`, 'green');
  } else if (volumeWith >= 40) {
    log(`   ⚠️  Sans theses.fr : ${volumeWithout} sources (juste)`, 'yellow');
    log(`   ✅ Avec theses.fr : ${volumeWith} sources (confortable)`, 'green');
    log(`   ✅ theses.fr est UTILE pour renforcer le volume`, 'green');
  } else {
    log(`   ❌ Volume insuffisant : ${volumeWith} sources`, 'red');
    log(`   ⚠️  Besoin d'ajouter plus de providers`, 'yellow');
  }
  
  // Validation finale
  log(`\n\n${'═'.repeat(70)}`, 'bright');
  log('✅ VALIDATION FINALE', 'bright');
  log('═'.repeat(70), 'bright');
  
  const checks = [
    {
      name: "Volume total ≥ 60 sources",
      passed: totalAvailable >= 60,
      actual: totalAvailable
    },
    {
      name: "Sources exploitables ≥ 40",
      passed: totalExploitable >= 40,
      actual: totalExploitable
    },
    {
      name: "Taux exploitation moyen ≥ 60%",
      passed: avgAbstractRate >= 60,
      actual: `${avgAbstractRate}%`
    },
    {
      name: "Au moins 3 providers avec 10+ sources",
      passed: results.filter(r => r.hasAbstract >= 10).length >= 3,
      actual: results.filter(r => r.hasAbstract >= 10).length
    },
    {
      name: "Viabilité SANS theses.fr",
      passed: volumeWithout >= 40,
      actual: volumeWithout
    }
  ];
  
  log(`\n`);
  let passedCount = 0;
  
  checks.forEach(check => {
    const icon = check.passed ? '✅' : '❌';
    const color = check.passed ? 'green' : 'red';
    log(`${icon} ${check.name} → ${check.actual}`, color);
    if (check.passed) passedCount++;
  });
  
  log(`\n${'═'.repeat(70)}`, 'bright');
  
  if (passedCount >= 4) {
    log(`\n🎉 CONCLUSION : NomosX a LARGEMENT assez de matière !`, 'green');
    log(`\n💎 Qualité > Quantité :`, 'cyan');
    log(`   • ${totalExploitable} sources EXPLOITABLES sur ${totalAvailable} trouvées`);
    log(`   • ${avgAbstractRate}% de contenu riche pour READER/ANALYST`);
    log(`   • Stratégie Content-First = Optimal`);
    log(`   • Filtrer les métadonnées seules = Bon choix`);
  } else {
    log(`\n⚠️  ATTENTION : Volume de données limite`, 'yellow');
    log(`\nRecommandations :`, 'cyan');
    log(`   1. Ajouter providers : Semantic Scholar, PubMed, BASE`);
    log(`   2. Augmenter perProvider de 20 à 30`);
    log(`   3. Améliorer taux abstrac des providers existants`);
  }
  
  log(`\n${'═'.repeat(70)}`, 'bright');
  log(`\n📊 Score : ${passedCount}/${checks.length} checks ✅\n`, passedCount >= 4 ? 'green' : 'yellow');
  
  return passedCount >= 4;
}

// Exécution
analyzeDataVolume()
  .then((success) => {
    process.exit(success ? 0 : 1);
  })
  .catch((error) => {
    log(`\n❌ Erreur fatale: ${error.message}`, 'red');
    console.error(error.stack);
    process.exit(1);
  });
