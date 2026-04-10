#!/usr/bin/env node
/**
 * DÉMO INTERACTIVE - Providers Institutionnels
 * Montre la différence académique vs institutionnel
 */

import { scout } from '../lib/agent/pipeline-v2.js';
import { recommendProviders, PRESETS } from '../lib/providers/institutional/presets.js';

console.log('\n🏛️  NOMOSX — DÉMO PROVIDERS INSTITUTIONNELS\n');
console.log('='.repeat(70));

// Question de test
const question = "What are the main cybersecurity threats to critical infrastructure in 2026?";

console.log(`\n📝 Question: "${question}"\n`);

// PARTIE 1: Approche traditionnelle (académique uniquement)
console.log('📚 PARTIE 1: Approche Traditionnelle (Académique)');
console.log('-'.repeat(70));

const academicProviders = ['openalex', 'semanticscholar', 'crossref'];
console.log(`Providers: ${academicProviders.join(', ')}\n`);

try {
  const academicResult = await scout(question, academicProviders, 15);
  console.log(`✅ Sources académiques: ${academicResult.found} trouvées`);
  console.log(`   Type: Papers de recherche, théorie, modèles`);
  console.log(`   Limite: Vue théorique, pas de données opérationnelles temps réel`);
} catch (error) {
  console.log(`❌ Erreur: ${error.message}`);
}

console.log('\n' + '='.repeat(70));

// PARTIE 2: Approche NomosX (académique + institutionnel)
console.log('\n🏛️  PARTIE 2: Approche NomosX (Académique + Institutionnel)');
console.log('-'.repeat(70));

const { preset, rationale } = recommendProviders(question);
console.log(`Preset recommandé: ${preset.name}`);
console.log(`Providers: ${preset.providers.join(', ')}`);
console.log(`\n💡 ${rationale}\n`);

try {
  const mixedResult = await scout(question, preset.providers, 15);
  console.log(`✅ Sources mixtes: ${mixedResult.found} trouvées`);
  console.log(`   Type: Papers + Alertes CISA + Standards NIST + Intel ODNI`);
  console.log(`   Avantage: Vue complète théorie + opérationnel + menaces temps réel`);
} catch (error) {
  console.log(`❌ Erreur: ${error.message}`);
}

console.log('\n' + '='.repeat(70));

// PARTIE 3: Comparaison
console.log('\n📊 PARTIE 3: Différenciation Concurrentielle\n');

console.log('Competitors (Perplexity, Consensus, You.com):');
console.log('  ❌ Sources académiques uniquement');
console.log('  ❌ Pas de renseignement');
console.log('  ❌ Pas de données institutionnelles primaires');
console.log('  → Vue théorique limitée\n');

console.log('NomosX:');
console.log('  ✅ 29 sources (8 académiques + 21 institutionnelles)');
console.log('  ✅ Threat assessments temps réel (ODNI, CISA)');
console.log('  ✅ Données primaires (IMF, World Bank)');
console.log('  ✅ Doctrine officielle (NATO, SGDSN)');
console.log('  ✅ Standards techniques (NIST, ENISA)');
console.log('  → Briefs actionnables pour décideurs\n');

console.log('='.repeat(70));

// PARTIE 4: Autres presets disponibles
console.log('\n🎯 PARTIE 4: Autres Presets Disponibles\n');

Object.entries(PRESETS).forEach(([key, preset]) => {
  console.log(`• ${preset.name}`);
  console.log(`  ${preset.description}`);
  console.log(`  Use case: ${preset.useCase}`);
  console.log(`  Providers (${preset.providers.length}): ${preset.providers.slice(0, 5).join(', ')}${preset.providers.length > 5 ? '...' : ''}\n`);
});

console.log('='.repeat(70));

console.log('\n✅ Démo terminée!\n');
console.log('📚 Documentation complète:');
console.log('   • lib/providers/institutional/README.md');
console.log('   • lib/providers/institutional/LEGAL.md');
console.log('   • INSTITUTIONAL_PROVIDERS.md\n');
