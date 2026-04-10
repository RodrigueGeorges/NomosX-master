#!/usr/bin/env node
/**
 * Debug script pour vérifier les variables d'environnement
 */

import 'dotenv/config';
import { readFileSync } from 'fs';

console.log('\n🔍 Diagnostic des variables d\'environnement\n');

// 1. Ce que le fichier .env contient
console.log('📄 Contenu du fichier .env :');
try {
  const envContent = readFileSync('.env', 'utf-8');
  const openaiLines = envContent.split('\n').filter(line => 
    line.includes('OPENAI') && !line.startsWith('#')
  );
  openaiLines.forEach(line => console.log(`   ${line}`));
} catch (err) {
  console.log('   ❌ Erreur lecture .env:', err.message);
}

console.log('\n💾 Variables chargées par dotenv/Node :');
console.log(`   OPENAI_API_KEY = ${process.env.OPENAI_API_KEY ? process.env.OPENAI_API_KEY.substring(0, 20) + '...' : 'undefined'}`);
console.log(`   OPENAI_MODEL = ${process.env.OPENAI_MODEL || 'undefined'}`);

console.log('\n✅ Solution recommandée :');
if (process.env.OPENAI_MODEL !== 'gpt-4o') {
  console.log('   1. Fermez TOUS les terminaux PowerShell');
  console.log('   2. Rouvrez un nouveau terminal');
  console.log('   3. Relancez: npm run test:openai');
  console.log('\n   OU directement: node scripts/test-openai.mjs');
} else {
  console.log('   ✅ Les variables sont correctes !');
}

console.log();
