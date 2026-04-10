#!/usr/bin/env node
/**
 * 🔧 CONVERSION MASSIVE - require() → import
 * Convertit TOUS les require() en import dans les fichiers source
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let fixed = 0;
let errors = 0;

function convertFile(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    const original = content;
    
    // Pattern 1: const {a, b} = require('module');
    content = content.replace(
      /const\s*\{([^}]+)\}\s*=\s*require\(['"]([^'"]+)['"]\);?/g,
      "import { $1 } from '$2';"
    );
    
    // Pattern 2: const name = require('module');
    content = content.replace(
      /const\s+(\w+)\s*=\s*require\(['"]([^'"]+)['"]\);?/g,
      "import $1 from '$2';"
    );
    
    // Pattern 3: require('dotenv').config();
    content = content.replace(
      /require\(['"]dotenv['"]\)\.config\(\);?/g,
      "import 'dotenv/config';"
    );
    
    if (content !== original) {
      fs.writeFileSync(filePath, content, 'utf8');
      return true;
    }
    
    return false;
  } catch (err) {
    console.error(`❌ ${filePath}: ${err.message}`);
    errors++;
    return false;
  }
}

// Lire le rapport
const reportPath = path.join(process.cwd(), 'scripts/commonjs-files-report.json');
const findings = JSON.parse(fs.readFileSync(reportPath, 'utf8'));

console.log(`🔧 Conversion de ${findings.length} fichiers...\n`);

for (const f of findings) {
  const fullPath = path.join(process.cwd(), f.file);
  
  // Skip scripts et fichiers de test
  if (f.file.startsWith('scripts/') || 
      f.file.includes('test') ||
      f.file.includes('.config.')) {
    continue;
  }
  
  // Skip fichiers générés
  if (f.file.includes('generated/') || f.file.includes('node_modules/')) {
    continue;
  }
  
  if (convertFile(fullPath)) {
    console.log(`✅ ${f.file}`);
    fixed++;
  }
}

console.log(`\n📊 RÉSULTAT:`);
console.log(`✅ Fichiers convertis: ${fixed}`);
console.log(`❌ Erreurs: ${errors}`);
