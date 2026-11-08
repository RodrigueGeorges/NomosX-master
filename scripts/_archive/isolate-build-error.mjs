#!/usr/bin/env node
/**
 * 🔍 Isoler l'erreur de build - Tester l'import de chaque fichier
 */

import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

const testDirs = [
  'middleware.ts',
  'app/layout.tsx',
  'lib/db.ts',
  'lib/utils.ts',
  'lib/security.ts',
  'lib/store.ts',
];

console.log('🔍 Test d\'import de fichiers critiques...\n');

for (const file of testDirs) {
  const fullPath = path.join(process.cwd(), file);
  
  if (!fs.existsSync(fullPath)) {
    console.log(`⏭️  ${file} - n'existe pas`);
    continue;
  }
  
  try {
    const fileUrl = pathToFileURL(fullPath).href;
    await import(fileUrl);
    console.log(`✅ ${file}`);
  } catch (err) {
    console.log(`❌ ${file}`);
    console.log(`   Erreur: ${err.message}`);
    if (err.stack) {
      console.log(`   Stack: ${err.stack.split('\n').slice(0, 5).join('\n   ')}`);
    }
    console.log('');
  }
}

console.log('\n🔍 Test des fichiers de configuration...');

const configs = [
  'next.config.mjs',
  'vitest.config.ts',
];

for (const file of configs) {
  const fullPath = path.join(process.cwd(), file);
  
  if (!fs.existsSync(fullPath)) {
    console.log(`⏭️  ${file} - n'existe pas`);
    continue;
  }
  
  try {
    const fileUrl = pathToFileURL(fullPath).href;
    await import(fileUrl);
    console.log(`✅ ${file}`);
  } catch (err) {
    console.log(`❌ ${file}`);
    console.log(`   Erreur: ${err.message}`);
    console.log('');
  }
}
