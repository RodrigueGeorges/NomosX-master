#!/usr/bin/env node
/**
 * 🔧 Fix UI Components - Convertir module.exports en export default
 * 
 * Corrige tous les fichiers components/ui/*.tsx qui utilisent module.exports
 * au lieu de export default (syntaxe ES modules)
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
log('🔧 Fix UI Components - Conversion module.exports → export', 'cyan');
console.log('='.repeat(80) + '\n');

const uiDir = path.join(process.cwd(), 'components/ui');

if (!fs.existsSync(uiDir)) {
  log('❌ Dossier components/ui/ non trouvé', 'red');
  process.exit(1);
}

const files = fs.readdirSync(uiDir).filter(f => f.endsWith('.tsx') || f.endsWith('.ts'));

log(`📁 ${files.length} fichiers trouvés dans components/ui/`, 'cyan');

let fixed = 0;
let errors = 0;

for (const file of files) {
  const filePath = path.join(uiDir, file);
  
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    const original = content;
    
    // Pattern 1: module.exports = ComponentName;
    content = content.replace(
      /module\.exports\s*=\s*(\w+)\s*;?/g,
      'export default $1;'
    );
    
    // Pattern 2: exports.ComponentName = ComponentName;
    content = content.replace(
      /exports\.(\w+)\s*=\s*(\w+)\s*;?/g,
      'export { $2 as $1 };'
    );
    
    // Pattern 3: module.exports = { ComponentName };
    content = content.replace(
      /module\.exports\s*=\s*\{([^}]+)\}\s*;?/g,
      (match, exports) => {
        const exportList = exports.trim().split(',').map(e => e.trim());
        return `export { ${exportList.join(', ')} };`;
      }
    );
    
    // Pattern 4: module.exports.ComponentName = function() { ... }
    content = content.replace(
      /module\.exports\.(\w+)\s*=\s*function/g,
      'export function $1'
    );
    
    // Pattern 5: exports.default = ComponentName;
    content = content.replace(
      /exports\.default\s*=\s*(\w+)\s*;?/g,
      'export default $1;'
    );
    
    if (content !== original) {
      fs.writeFileSync(filePath, content, 'utf8');
      log(`✅ ${file}`, 'green');
      fixed++;
    }
  } catch (err) {
    log(`❌ Erreur: ${file} - ${err.message}`, 'red');
    errors++;
  }
}

console.log('\n' + '='.repeat(80));
log('📊 RÉSULTAT', 'cyan');
console.log('='.repeat(80));
log(`✅ Fichiers corrigés: ${fixed}`, 'green');
log(`❌ Erreurs: ${errors}`, errors > 0 ? 'red' : 'green');

if (fixed > 0) {
  log('\n💡 Prochaine étape: npm run build', 'yellow');
}
