#!/usr/bin/env node
/**
 * 🔧 Fix ALL module.exports - Conversion complète vers ES modules
 * 
 * Trouve et corrige TOUS les fichiers avec module.exports ou exports.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  red: '\x1b[31m'
};

function log(msg, color = 'reset') {
  console.log(`${colors[color]}${msg}${colors.reset}`);
}

console.log('\n' + '='.repeat(80));
log('🔧 Fix ALL module.exports - Conversion ES Modules', 'cyan');
console.log('='.repeat(80) + '\n');

let fixed = 0;
let skipped = 0;

function fixFile(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    const original = content;
    
    // Ignorer les fichiers générés par Prisma
    if (filePath.includes('generated/prisma-client')) {
      return false;
    }
    
    // Ignorer node_modules
    if (filePath.includes('node_modules')) {
      return false;
    }
    
    // Pattern 1: module.exports = something;
    content = content.replace(
      /^module\.exports\s*=\s*([^;]+);?\s*$/gm,
      'export default $1;'
    );
    
    // Pattern 2: exports.name = value;
    content = content.replace(
      /^exports\.(\w+)\s*=\s*([^;]+);?\s*$/gm,
      'export const $1 = $2;'
    );
    
    // Pattern 3: module.exports.name = value;
    content = content.replace(
      /^module\.exports\.(\w+)\s*=\s*([^;]+);?\s*$/gm,
      'export const $1 = $2;'
    );
    
    if (content !== original) {
      fs.writeFileSync(filePath, content, 'utf8');
      return true;
    }
    
    return false;
  } catch (err) {
    log(`❌ Erreur: ${filePath} - ${err.message}`, 'red');
    return false;
  }
}

function scanDir(dir, depth = 0) {
  if (depth > 6) return;
  
  try {
    const items = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const item of items) {
      const fullPath = path.join(dir, item.name);
      
      if (item.isDirectory()) {
        if (!item.name.startsWith('.') && item.name !== 'node_modules') {
          scanDir(fullPath, depth + 1);
        }
      } else if (/\.(ts|tsx|js|jsx|mjs)$/.test(item.name)) {
        const relativePath = path.relative(process.cwd(), fullPath);
        
        // Vérifier si le fichier contient module.exports ou exports.
        const content = fs.readFileSync(fullPath, 'utf8');
        
        if (/\bmodule\.exports\b/.test(content) || /^exports\.\w+\s*=/m.test(content)) {
          if (fixFile(fullPath)) {
            log(`✅ ${relativePath}`, 'green');
            fixed++;
          } else {
            log(`⏭️  ${relativePath} (ignoré)`, 'yellow');
            skipped++;
          }
        }
      }
    }
  } catch (err) {
    // Ignorer erreurs de scan
  }
}

log('🔍 Scan du codebase...', 'cyan');
scanDir(process.cwd());

console.log('\n' + '='.repeat(80));
log('📊 RÉSULTAT', 'cyan');
console.log('='.repeat(80));
log(`✅ Fichiers corrigés: ${fixed}`, 'green');
log(`⏭️  Fichiers ignorés: ${skipped}`, 'yellow');

if (fixed > 0) {
  log('\n💡 Prochaine étape: npm run build', 'yellow');
}
