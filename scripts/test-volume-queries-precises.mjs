#!/usr/bin/env node
/**
 * Test VOLUME avec requêtes PRÉCISES utilisateur
 * Prouve qu'on a assez de données même pour des requêtes spécifiques
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

async function testQuery(query, providers) {
  log(`\n${'─'.repeat(70)}`, 'cyan');
  log(`📋 Requête : "${query}"`, 'bright');
  log('─'.repeat(70), 'cyan');
  
  let totalFound = 0;
  let totalExploitable = 0;
  const providerResults = [];
  
  for (const provider of providers) {
    try {
      const startTime = Date.now();
      const response = await fetch(provider.url(query), {
        headers: { 
          "Accept": "application/json",
          "User-Agent": "NomosX Research Agent"
        },
        signal: AbortSignal.timeout(10000)
      });
      const duration = Date.now() - startTime;
      
      if (!response.ok) {
        log(`   ${provider.name}: ❌ HTTP ${response.status}`, 'red');
        continue;
      }
      
      const data = await response.json();
      const result = provider.parser(data);
      
      totalFound += result.count;
      totalExploitable += result.exploitable;
      
      log(`   ${provider.name.padEnd(15)}: ${result.exploitable}/${result.count} exploitables (${result.rate}%) - ${duration}ms`, 
        result.exploitable >= 5 ? 'green' : result.exploitable >= 2 ? 'yellow' : 'red');
      
      providerResults.push({
        name: provider.name,
        ...result,
        duration
      });
      
    } catch (error) {
      log(`   ${provider.name}: ❌ ${error.message}`, 'red');
    }
  }
  
  return {
    query,
    totalFound,
    totalExploitable,
    providers: providerResults
  };
}

async function main() {
  log('\n╔═══════════════════════════════════════════════════════════════════╗', 'bright');
  log('║  TEST VOLUME : Requêtes PRÉCISES utilisateur                     ║', 'bright');
  log('╚═══════════════════════════════════════════════════════════════════╝', 'bright');
  
  // Configuration providers
  const providers = [
    {
      name: 'OpenAlex',
      url: (q) => `https://api.openalex.org/works?search=${encodeURIComponent(q)}&per-page=25`,
      parser: (data) => {
        const results = data?.results || [];
        const exploitable = results.filter(r => 
          (r.abstract_inverted_index && Object.keys(r.abstract_inverted_index).length > 50) || 
          (r.abstract && r.abstract.length > 200)
        ).length;
        return {
          count: results.length,
          exploitable,
          rate: results.length > 0 ? Math.round((exploitable / results.length) * 100) : 0
        };
      }
    },
    {
      name: 'HAL',
      url: (q) => `https://api.archives-ouvertes.fr/search/?q=${encodeURIComponent(q)}&wt=json&rows=25&fl=docid,title_s,abstract_s`,
      parser: (data) => {
        const results = data?.response?.docs || [];
        const exploitable = results.filter(r => r.abstract_s && r.abstract_s.length > 200).length;
        return {
          count: results.length,
          exploitable,
          rate: results.length > 0 ? Math.round((exploitable / results.length) * 100) : 0
        };
      }
    },
    {
      name: 'Crossref',
      url: (q) => `https://api.crossref.org/works?query=${encodeURIComponent(q)}&rows=25&select=DOI,title,abstract`,
      parser: (data) => {
        const results = data?.message?.items || [];
        const exploitable = results.filter(r => r.abstract && r.abstract.length > 200).length;
        return {
          count: results.length,
          exploitable,
          rate: results.length > 0 ? Math.round((exploitable / results.length) * 100) : 0
        };
      }
    },
    {
      name: 'theses.fr',
      url: (q) => `https://theses.fr/api/v1/theses/recherche/?q=${encodeURIComponent(q)}&nombre=15`,
      parser: (data) => {
        const results = data?.theses || [];
        // Exploitable = soutenues avec auteurs (candidates pour bridge HAL)
        const exploitable = results.filter(r => 
          r.status === "soutenue" && 
          r.auteurs && 
          r.auteurs.length > 0 &&
          r.titrePrincipal
        ).length;
        return {
          count: results.length,
          exploitable,
          rate: results.length > 0 ? Math.round((exploitable / results.length) * 100) : 0
        };
      }
    }
  ];
  
  // Requêtes PRÉCISES réelles d'utilisateurs
  const testQueries = [
    "intelligence artificielle santé",
    "carbon tax economic impact",
    "machine learning healthcare diagnosis",
    "politique monétaire inflation",
    "renewable energy storage lithium",
    "climate change agriculture adaptation",
    "quantum computing cryptography",
    "microbiome gut brain axis"
  ];
  
  const allResults = [];
  
  log(`\n🎯 Test de ${testQueries.length} requêtes PRÉCISES\n`, 'cyan');
  
  for (const query of testQueries) {
    const result = await testQuery(query, providers);
    allResults.push(result);
    
    const color = result.totalExploitable >= 15 ? 'green' : result.totalExploitable >= 10 ? 'yellow' : 'red';
    log(`   ✅ TOTAL : ${result.totalExploitable} sources exploitables`, color);
  }
  
  // Analyse globale
  log(`\n\n${'═'.repeat(70)}`, 'bright');
  log('📊 ANALYSE GLOBALE', 'bright');
  log('═'.repeat(70), 'bright');
  
  const avgExploitable = Math.round(allResults.reduce((sum, r) => sum + r.totalExploitable, 0) / allResults.length);
  const minExploitable = Math.min(...allResults.map(r => r.totalExploitable));
  const maxExploitable = Math.max(...allResults.map(r => r.totalExploitable));
  
  log(`\n📈 Volume par requête :`, 'bright');
  log(`   • Moyenne        : ${avgExploitable} sources exploitables`, avgExploitable >= 15 ? 'green' : 'yellow');
  log(`   • Minimum        : ${minExploitable} sources exploitables`, minExploitable >= 10 ? 'green' : 'yellow');
  log(`   • Maximum        : ${maxExploitable} sources exploitables`, 'green');
  
  // Distribution
  log(`\n📊 Distribution :`, 'bright');
  const excellent = allResults.filter(r => r.totalExploitable >= 20).length;
  const bon = allResults.filter(r => r.totalExploitable >= 15 && r.totalExploitable < 20).length;
  const acceptable = allResults.filter(r => r.totalExploitable >= 10 && r.totalExploitable < 15).length;
  const faible = allResults.filter(r => r.totalExploitable < 10).length;
  
  log(`   • ≥20 sources     : ${excellent}/${testQueries.length} requêtes (${Math.round(excellent/testQueries.length*100)}%)`, 'green');
  log(`   • 15-19 sources   : ${bon}/${testQueries.length} requêtes (${Math.round(bon/testQueries.length*100)}%)`, 'green');
  log(`   • 10-14 sources   : ${acceptable}/${testQueries.length} requêtes (${Math.round(acceptable/testQueries.length*100)}%)`, 'yellow');
  log(`   • <10 sources     : ${faible}/${testQueries.length} requêtes (${Math.round(faible/testQueries.length*100)}%)`, faible > 0 ? 'red' : 'green');
  
  // Performance par provider
  log(`\n\n📊 PERFORMANCE PAR PROVIDER (moyenne)`, 'bright');
  log('─'.repeat(70));
  
  const providerStats = {};
  allResults.forEach(r => {
    r.providers.forEach(p => {
      if (!providerStats[p.name]) {
        providerStats[p.name] = { total: 0, count: 0, exploitable: 0 };
      }
      providerStats[p.name].total += p.count;
      providerStats[p.name].exploitable += p.exploitable;
      providerStats[p.name].count++;
    });
  });
  
  Object.entries(providerStats)
    .sort((a, b) => b[1].exploitable - a[1].exploitable)
    .forEach(([name, stats], i) => {
      const avgExp = Math.round(stats.exploitable / stats.count);
      const avgTotal = Math.round(stats.total / stats.count);
      const rate = Math.round((stats.exploitable / stats.total) * 100);
      const bar = '█'.repeat(Math.floor(avgExp / 2));
      
      log(`\n${i + 1}. ${name.padEnd(15)} ${bar} ${avgExp}/${avgTotal} par requête (${rate}%)`, 
        avgExp >= 5 ? 'green' : avgExp >= 2 ? 'yellow' : 'red');
    });
  
  // Impact theses.fr
  log(`\n\n${'═'.repeat(70)}`, 'bright');
  log('🎯 CONTRIBUTION theses.fr (Content-First)', 'bright');
  log('═'.repeat(70), 'bright');
  
  const thesesfrContrib = providerStats['theses.fr'];
  const avgThesesfr = thesesfrContrib ? Math.round(thesesfrContrib.exploitable / thesesfrContrib.count) : 0;
  const totalAvgWithout = avgExploitable - avgThesesfr;
  
  log(`\n📊 Scénarios :`, 'bright');
  log(`\n1️⃣  SANS theses.fr :`);
  log(`   → ${totalAvgWithout} sources/requête en moyenne`);
  log(`   → 3 providers (OpenAlex, HAL, Crossref)`);
  
  log(`\n2️⃣  AVEC theses.fr (Content-First) :`);
  log(`   → ${avgExploitable} sources/requête en moyenne`, 'green');
  log(`   → 4 providers`);
  log(`   → +${avgThesesfr} sources françaises/requête`, 'green');
  log(`   → +${Math.round((avgThesesfr/totalAvgWithout)*100)}% de volume`, 'green');
  
  // Validation finale
  log(`\n\n${'═'.repeat(70)}`, 'bright');
  log('✅ VALIDATION : Assez de données pour requêtes PRÉCISES ?', 'bright');
  log('═'.repeat(70), 'bright');
  
  const checks = [
    {
      name: "Moyenne ≥ 15 sources/requête",
      passed: avgExploitable >= 15,
      actual: avgExploitable,
      critical: true
    },
    {
      name: "Minimum ≥ 10 sources/requête",
      passed: minExploitable >= 10,
      actual: minExploitable,
      critical: true
    },
    {
      name: "80% requêtes avec ≥15 sources",
      passed: (excellent + bon) >= (testQueries.length * 0.8),
      actual: `${Math.round(((excellent + bon)/testQueries.length)*100)}%`,
      critical: false
    },
    {
      name: "Aucune requête <10 sources",
      passed: faible === 0,
      actual: faible,
      critical: false
    },
    {
      name: "theses.fr apporte ≥3 sources/requête",
      passed: avgThesesfr >= 3,
      actual: avgThesesfr,
      critical: false
    }
  ];
  
  log(`\n`);
  let passedCount = 0;
  let criticalPassed = true;
  
  checks.forEach(check => {
    const icon = check.passed ? '✅' : (check.critical ? '❌' : '⚠️');
    const color = check.passed ? 'green' : (check.critical ? 'red' : 'yellow');
    log(`${icon} ${check.name} → ${check.actual}`, color);
    if (check.passed) passedCount++;
    if (check.critical && !check.passed) criticalPassed = false;
  });
  
  log(`\n${'═'.repeat(70)}`, 'bright');
  
  if (criticalPassed && passedCount >= 4) {
    log(`\n🎉 VERDICT : Volume LARGEMENT suffisant pour requêtes précises !`, 'green');
    log(`\n💎 Qualité garantie :`, 'cyan');
    log(`   • ${avgExploitable} sources exploitables en moyenne`);
    log(`   • Même requêtes très spécifiques : ${minExploitable}+ sources`);
    log(`   • Brief READER/ANALYST : besoin de 12-15 sources ✅`);
    log(`   • Marge de sécurité : ${Math.round((avgExploitable/12)*100)}%`);
    
    log(`\n🚀 Stratégie Content-First validée :`, 'blue');
    log(`   • Filtrer métadonnées seules = Optimal`);
    log(`   • Volume préservé grâce à multi-providers`);
    log(`   • theses.fr apporte +${Math.round((avgThesesfr/avgExploitable)*100)}% de valeur`);
    log(`   • Différenciation marché francophone 🇫🇷`);
    
  } else {
    log(`\n⚠️  ATTENTION : Volume insuffisant pour certaines requêtes`, 'yellow');
    log(`\nActions nécessaires :`, 'red');
    log(`   1. Ajouter Semantic Scholar (+8-12 sources/requête)`);
    log(`   2. Ajouter PubMed pour santé/bio (+5-10 sources)`);
    log(`   3. Augmenter perProvider de 25 à 35`);
  }
  
  log(`\n${'═'.repeat(70)}`, 'bright');
  log(`\n📊 Score : ${passedCount}/${checks.length} checks ✅`, passedCount >= 4 ? 'green' : 'yellow');
  log(`🎯 Volume données : ${criticalPassed ? 'SUFFISANT ✅' : 'INSUFFISANT ❌'}\n`, criticalPassed ? 'green' : 'red');
  
  return criticalPassed;
}

// Exécution
main()
  .then((success) => {
    process.exit(success ? 0 : 1);
  })
  .catch((error) => {
    log(`\n❌ Erreur fatale: ${error.message}`, 'red');
    console.error(error.stack);
    process.exit(1);
  });
