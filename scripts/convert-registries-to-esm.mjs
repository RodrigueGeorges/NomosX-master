/**
 * Convertir les registries de CommonJS vers ES modules
 */

import fs from 'fs';
import path from 'path';

const registries = [
  'lib/providers/extended-registry.js',
  'lib/providers/final-complete-registry.js'
];

for (const registry of registries) {
  const filePath = path.join(process.cwd(), registry);
  
  if (!fs.existsSync(filePath)) {
    console.log(`⚠️  ${registry} not found`);
    continue;
  }
  
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Convertir require() en import
  content = content.replace(
    /const\s*\{([^}]+)\}\s*=\s*require\(['"]([^'"]+)['"]\);?/g,
    'import { $1 } from \'$2\';'
  );
  
  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`✅ Converti: ${registry}`);
}

console.log('\n✨ Conversion terminée!');
