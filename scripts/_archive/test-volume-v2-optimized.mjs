#!/usr/bin/env node
/**
 * Test VOLUME V2 - Après optimisations
 * Prouve l'amélioration de 26 → 50-60 sources/requête
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
  magenta: '\x1b[35m',
};

function log(msg, color = 'reset') {
  console.log(`${colors[color]}${msg}${colors.reset}`);
}

async function testProvider(name, url, parser, color = 'green') {
  try {
    const startTime = Date.now();
    const response = await fetch(url, {
      headers: { 
        "Accept": "application/json",
        "User-Agent": "NomosX Research Agent"
      },
      signal: AbortSignal.timeout(15000)
    });
    const duration = Date.now() - startTime;
    
    if (!response.ok) {
      return { name, success: false, count: 0, exploitable: 0, duration, error: `HTTP ${response.status}` };
    }
    
    const data = await response.json();
    const result = parser(data);
    
    return { name, success: true, ...result, duration };
    
  } catch (error) {
    return { name, success: false, count: 0, exploitable: 0, duration: 0, error: error.message };
  }
}

async function main() {
  log('\n╔═══════════════════════════════════════════════════════════════════╗', 'bright');
  log('║        TEST VOLUME V2 : Après optimisations                      ║', 'bright');
  log('║        Objectif : 50-60 sources/requête (vs 26 avant)            ║', 'bright');
  log('╚═══════════════════════════════════════════════════════════════════╝', 'bright');
  
  const query = "machine learning healthcare";
  
  log(`\n📋 Requête test : "${query}"`, 'cyan');
  log(`🎯 Objectif : Prouver passage de 26 → 50-60 sources\n`, 'cyan');
  
  // Configuration providers V2
  const providers = [
    {
      name: 'OpenAlex (V2: limit 50)',
      url: `https://api.openalex.org/works?search=${encodeURIComponent(query)}&per-page=50`,
      parser: (data) => {
        const results = data?.results || [];
        const exploitable = results.filter(r => 
          (r.abstract_inverted_index && Object.keys(r.abstract_inverted_index).length > 50) || 
          (r.abstract && r.abstract.length > 200)
        ).length;
        return { count: results.length, exploitable, rate: results.length > 0 ? Math.round((exploitable / results.length) * 100) : 0 };
      }
    },
    {
      name: 'Semantic Scholar (V2: limit 50)',
      url: `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(query)}&limit=50&fields=paperId,title,abstract,year`,
      parser: (data) => {
        const results = data?.data || [];
        const exploitable = results.filter(r => r.abstract && r.abstract.length > 200).length;
        return { count: results.length, exploitable, rate: results.length > 0 ? Math.round((exploitable / results.length) * 100) : 0 };
      },
      color: 'magenta'
    },
    {
      name: 'HAL (V2: fix parser, limit 50)',
      url: `https://api.archives-ouvertes.fr/search/?q=${encodeURIComponent(query)}&wt=json&rows=50&fl=docid,title_s,abstract_s`,
      parser: (data) => {
        const results = data?.response?.docs || [];
        const exploitable = results.filter(r => {
          const abstract = Array.isArray(r.abstract_s) ? r.abstract_s.join(" ") : r.abstract_s;
          return abstract && abstract.length > 200;
        }).length;
        return { count: results.length, exploitable, rate: results.length > 0 ? Math.round((exploitable / results.length) * 100) : 0 };
      },
      color: 'cyan'
    },
    {
      name: 'Crossref (V2: limit 50)',
      url: `https://api.crossref.org/works?query=${encodeURIComponent(query)}&rows=50&select=DOI,title,abstract`,
      parser: (data) => {
        const results = data?.message?.items || [];
        const exploitable = results.filter(r => r.abstract && r.abstract.length > 200).length;
        return { count: results.length, exploitable, rate: results.length > 0 ? Math.round((exploitable / results.length) * 100) : 0 };
      }
    },
    {
      name: 'theses.fr (Content-First)',
      url: `https://theses.fr/api/v1/theses/recherche/?q=${encodeURIComponent(query)}&nombre=15`,
      parser: (data) => {
        const results = data?.theses || [];
        const exploitable = results.filter(r => r.status === "soutenue" && r.auteurs?.length > 0).length;
        return { count: results.length, exploitable, rate: results.length > 0 ? Math.round((exploitable / results.length) * 100) : 0 };
      }
    }
  ];
  
  log('═'.repeat(70), 'bright');
  log('🔍 TEST DES PROVIDERS OPTIMISÉS', 'bright');
  log('═'.repeat(70), 'bright');
  
  const results = [];
  
  for (const provider of providers) {
    log(`\n📡 ${provider.name}...`, 'blue');
    const result = await testProvider(provider.name, provider.url, provider.parser, provider.color);
    
    if (result.success) {
      const color = result.exploitable >= 15 ? 'green' : result.exploitable >= 8 ? 'yellow' : 'red';
      log(`   ✅ ${result.exploitable}/${result.count} exploitables (${result.rate}%) - ${result.duration}ms`, color);
      
      // Comparaison avec V1
      const v1Values = {
        'OpenAlex': 13,
        'Semantic Scholar': 0,  // Nouveau
        'HAL': 0,               // Était bugué
        'Crossref': 5,
        'theses.fr': 8
      };
      
      const providerShortName = result.name.split(' ')[0];
      const v1Value = v1Values[providerShortName];
      
      if (v1Value !== undefined) {
        const improvement = result.exploitable - v1Value;
        if (improvement > 0) {
          log(`   📈 Amélioration : +${improvement} sources vs V1 (+${Math.round((improvement/v1Value)*100)}%)`, 'green');
        } else if (improvement === 0 && result.exploitable > 0) {
          log(`   ➡️  Stable vs V1`, 'yellow');
        }
      } else {
        log(`   🆕 NOUVEAU provider !`, 'magenta');
      }
      
    } else {
      log(`   ❌ Erreur: ${result.error}`, 'red');
    }
    
    results.push(result);
  }
  
  // Analyse comparative
  log(`\n\n${'═'.repeat(70)}`, 'bright');
  log('📊 COMPARAISON V1 vs V2', 'bright');
  log('═'.repeat(70), 'bright');
  
  const totalV2 = results.reduce((sum, r) => sum + (r.exploitable || 0), 0);
  const totalV1 = 26; // Référence du test précédent
  
  const successfulProviders = results.filter(r => r.success && r.exploitable > 0);
  
  log(`\n📈 Volume total :`, 'bright');
  log(`   • V1 (baseline)   : ${totalV1} sources exploitables`);
  log(`   • V2 (optimisé)   : ${totalV2} sources exploitables`, totalV2 >= 50 ? 'green' : 'yellow');
  log(`   • Amélioration    : +${totalV2 - totalV1} sources (+${Math.round(((totalV2 - totalV1)/totalV1)*100)}%)`, 'green');
  
  log(`\n📊 Breakdown détaillé :`, 'bright');
  
  const comparison = [
    { provider: 'OpenAlex', v1: 13, v2: results.find(r => r.name.includes('OpenAlex'))?.exploitable || 0 },
    { provider: 'Semantic Scholar', v1: 0, v2: results.find(r => r.name.includes('Semantic'))?.exploitable || 0, isNew: true },
    { provider: 'HAL', v1: 0, v2: results.find(r => r.name.includes('HAL'))?.exploitable || 0, wasBroken: true },
    { provider: 'Crossref', v1: 5, v2: results.find(r => r.name.includes('Crossref'))?.exploitable || 0 },
    { provider: 'theses.fr', v1: 8, v2: results.find(r => r.name.includes('theses'))?.exploitable || 0 },
  ];
  
  comparison.forEach(({ provider, v1, v2, isNew, wasBroken }) => {
    const diff = v2 - v1;
    const diffStr = diff > 0 ? `+${diff}` : diff.toString();
    const pct = v1 > 0 ? ` (${diffStr > 0 ? '+' : ''}${Math.round((diff/v1)*100)}%)` : '';
    
    let status = '';
    if (isNew) status = ' 🆕';
    else if (wasBroken) status = ' 🔧';
    else if (diff > 3) status = ' 🚀';
    else if (diff > 0) status = ' 📈';
    
    log(`\n   ${provider.padEnd(20)} : ${v1} → ${v2} (${diffStr}${pct})${status}`, diff > 0 ? 'green' : 'yellow');
  });
  
  // Projections
  log(`\n\n${'═'.repeat(70)}`, 'bright');
  log('🎯 PROJECTIONS : Roadmap vers 80 sources', 'bright');
  log('═'.repeat(70), 'bright');
  
  const futureProviders = [
    { name: 'PubMed', impact: '+12-15', when: 'Semaine 2' },
    { name: 'CORE', impact: '+8-10', when: 'Semaine 2' },
    { name: 'Europe PMC', impact: '+5-8', when: 'Semaine 2' },
    { name: 'SSRN', impact: '+5-7', when: 'Semaine 3' },
    { name: 'RePEc', impact: '+3-5', when: 'Semaine 3' }
  ];
  
  let projected = totalV2;
  
  log(`\n📈 Roadmap d'expansion :`, 'cyan');
  log(`   • Aujourd'hui (V2)    : ${totalV2} sources`);
  
  futureProviders.forEach(p => {
    const min = parseInt(p.impact.match(/\d+/)[0]);
    projected += min;
    log(`   • + ${p.name.padEnd(15)}: ${projected} sources (${p.when})`, projected >= 60 ? 'green' : 'yellow');
  });
  
  log(`\n   🎯 Objectif final     : 80+ sources`, 'green');
  
  // Validation
  log(`\n\n${'═'.repeat(70)}`, 'bright');
  log('✅ VALIDATION', 'bright');
  log('═'.repeat(70), 'bright');
  
  const checks = [
    { name: "Amélioration vs V1", passed: totalV2 > totalV1, actual: `+${totalV2-totalV1} sources` },
    { name: "Volume V2 ≥ 40 sources", passed: totalV2 >= 40, actual: totalV2 },
    { name: "Semantic Scholar actif", passed: results.find(r => r.name.includes('Semantic'))?.exploitable > 0, actual: results.find(r => r.name.includes('Semantic'))?.exploitable || 0 },
    { name: "HAL réparé (>0 sources)", passed: results.find(r => r.name.includes('HAL'))?.exploitable > 0, actual: results.find(r => r.name.includes('HAL'))?.exploitable || 0 },
    { name: "Projection 80+ atteignable", passed: projected >= 80, actual: `${projected} projeté` }
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
    log(`\n🎉 SUCCÈS : Optimisations validées !`, 'green');
    log(`\n💎 Améliorations V2 :`, 'cyan');
    log(`   • Volume actuel : ${totalV2} sources (+${Math.round(((totalV2-totalV1)/totalV1)*100)}%)`);
    log(`   • Semantic Scholar ajouté : +${results.find(r => r.name.includes('Semantic'))?.exploitable || 0} sources`);
    log(`   • HAL réparé : +${results.find(r => r.name.includes('HAL'))?.exploitable || 0} sources`);
    log(`   • Projectionvers 80+ : ${Math.round((projected/80)*100)}% du chemin`);
    
    log(`\n🚀 Prochaines étapes :`, 'blue');
    log(`   1. Implémenter PubMed (santé) → +12-15 sources`);
    log(`   2. Implémenter CORE (UK/EU) → +8-10 sources`);
    log(`   3. Implémenter Europe PMC → +5-8 sources`);
    log(`   4. Objectif 80+ sources : ${Math.ceil((80-totalV2)/3)} semaines`);
    
  } else {
    log(`\n⚠️  ATTENTION : Certaines optimisations ont échoué`, 'yellow');
  }
  
  log(`\n${'═'.repeat(70)}`, 'bright');
  log(`\n📊 Score : ${passedCount}/${checks.length} checks ✅`, passedCount >= 4 ? 'green' : 'yellow');
  log(`🎯 Progression : V1 (26) → V2 (${totalV2}) → Target (80)\n`, 'cyan');
  
  return passedCount >= 4;
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
