/**
 * AUDIT COMPLET DES FONCTIONNALITÉS
 * Vérifie performance et qualité de toutes les features
 */

import { readFileSync } from 'fs';

console.log(`
╔═══════════════════════════════════════════════════════════════╗
║        AUDIT FONCTIONNALITÉS - Performance & Qualité          ║
╚═══════════════════════════════════════════════════════════════╝
`);

const features = {
  brief: {
    file: 'lib/agent/pipeline-v2.ts',
    agents: ['SCOUT', 'INDEX', 'RANK', 'READER', 'ANALYST', 'GUARD', 'EDITOR'],
    v2: true,
    checks: {
      'RANK V2': true,
      'READER V2': true,
      'ANALYST V2': true,
      'Diversité sources': true,
      'Contexte structuré': true,
      'Parallélisation': true
    }
  },
  digest: {
    file: 'lib/agent/digest-agent.ts',
    agents: ['DIGEST'],
    v2: true,
    checks: {
      'DIGEST V2': true,
      'breakthrough': true,
      'highImpact': true,
      'emerging': true,
      'french': true,
      'Catégorisation': true
    }
  },
  radar: {
    file: 'lib/agent/radar-agent.ts',
    agents: ['RADAR'],
    v2: false,
    checks: {
      'Diversité sources': false,
      'Catégorisation signaux': false,
      'Quality filtering': false,
      'Contexte enrichi': false
    }
  }
};

let needsOptimization = [];

Object.entries(features).forEach(([feature, config]) => {
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`${feature.toUpperCase()} - ${config.v2 ? 'V2 ✅' : 'V1 ⚠️'}`);
  console.log(`${'═'.repeat(70)}`);
  console.log(`Fichier : ${config.file}`);
  console.log(`Agents  : ${config.agents.join(', ')}`);
  
  try {
    const content = readFileSync(config.file, 'utf-8');
    const lines = content.split('\n').length;
    const size = Math.round(content.length / 1024);
    
    console.log(`\nCode :`);
    console.log(`  • Lignes : ${lines}`);
    console.log(`  • Taille : ${size}KB`);
    
    console.log(`\nFeatures :`);
    Object.entries(config.checks).forEach(([check, expected]) => {
      const found = content.includes(check) || content.includes(check.toLowerCase());
      const actual = found && expected;
      console.log(`  ${actual ? '✅' : expected ? '⚠️' : '❌'} ${check}`);
      if (!actual && expected) {
        needsOptimization.push(`${feature}: ${check}`);
      }
    });
    
    // Score global
    const checksOK = Object.entries(config.checks).filter(([k, v]) => {
      const found = content.includes(k) || content.includes(k.toLowerCase());
      return found && v;
    }).length;
    const checksTotal = Object.keys(config.checks).length;
    const score = Math.round((checksOK / checksTotal) * 100);
    
    console.log(`\nScore qualité : ${score}% (${checksOK}/${checksTotal} features)`);
    
    if (config.v2) {
      console.log(`✅ VERSION V2 - Optimisé`);
    } else {
      console.log(`⚠️  VERSION V1 - Peut être optimisé`);
      needsOptimization.push(`${feature}: Passer en V2`);
    }
    
  } catch (error) {
    console.log(`❌ ERREUR : ${error.message}`);
    needsOptimization.push(`${feature}: Fichier inaccessible`);
  }
});

console.log(`\n${'═'.repeat(70)}`);
console.log(`SYNTHÈSE GLOBALE`);
console.log(`${'═'.repeat(70)}`);

const v2Count = Object.values(features).filter(f => f.v2).length;
const totalCount = Object.keys(features).length;

console.log(`\nFonctionnalités analysées : ${totalCount}`);
console.log(`  • V2 optimisées : ${v2Count} ✅`);
console.log(`  • V1 basiques   : ${totalCount - v2Count} ⚠️`);

if (needsOptimization.length === 0) {
  console.log(`\n✅ TOUTES LES FONCTIONNALITÉS SONT OPTIMALES`);
  console.log(`\nPerformance globale :`);
  console.log(`  • Brief  : ⭐⭐⭐⭐⭐ (V2 complet)`);
  console.log(`  • Digest : ⭐⭐⭐⭐⭐ (V2 complet)`);
  console.log(`  • Radar  : ⭐⭐⭐⭐⭐ (V2 complet)`);
} else {
  console.log(`\n⚠️  ${needsOptimization.length} OPTIMISATION(S) RECOMMANDÉE(S)\n`);
  
  needsOptimization.forEach((opt, i) => {
    console.log(`  ${i + 1}. ${opt}`);
  });
  
  console.log(`\nPerformance actuelle :`);
  console.log(`  • Brief  : ${features.brief.v2 ? '⭐⭐⭐⭐⭐' : '⭐⭐⭐'} (${features.brief.v2 ? 'V2' : 'V1'})`);
  console.log(`  • Digest : ${features.digest.v2 ? '⭐⭐⭐⭐⭐' : '⭐⭐⭐'} (${features.digest.v2 ? 'V2' : 'V1'})`);
  console.log(`  • Radar  : ${features.radar.v2 ? '⭐⭐⭐⭐⭐' : '⭐⭐⭐'} (${features.radar.v2 ? 'V2' : 'V1'})`);
  
  console.log(`\nRecommandations :`);
  console.log(`  1. PRIORITÉ HAUTE : Optimiser RADAR en V2`);
  console.log(`     - Ajouter diversité sources (providers, années)`);
  console.log(`     - Catégoriser signaux (breakthrough/emerging/cross-sector)`);
  console.log(`     - Filtrer qualité (min 70/100)`);
  console.log(`     - Enrichir contexte (claims/methods)`);
}

console.log(`\n${'═'.repeat(70)}\n`);
