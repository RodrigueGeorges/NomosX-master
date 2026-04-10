/**
 * Fixer tous les imports de db.js et score.js vers .mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function scanAndFix(dir) {
  const items = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const item of items) {
    const fullPath = path.join(dir, item.name);
    
    if (item.isDirectory()) {
      if (!item.name.startsWith('.') && item.name !== 'node_modules') {
        scanAndFix(fullPath);
      }
    } else if (/\.(ts|tsx|js|jsx|mjs)$/.test(item.name)) {
      try {
        let content = fs.readFileSync(fullPath, 'utf8');
        const original = content;
        
        // Remplacer les imports de db.js et score.js
        content = content.replace(/from\s+(['"])(.*)\/db\.js\1/g, 'from $1$2/db.mjs$1');
        content = content.replace(/from\s+(['"])(.*)\/score\.js\1/g, 'from $1$2/score.mjs$1');
        
        if (content !== original) {
          fs.writeFileSync(fullPath, content, 'utf8');
          console.log(`✅ Fixed: ${path.relative(process.cwd(), fullPath)}`);
        }
      } catch (err) {
        // Ignorer les erreurs de lecture
      }
    }
  }
}

console.log('🔧 Fixing db.js and score.js imports...\n');
scanAndFix(process.cwd());
console.log('\n✨ Done!');
