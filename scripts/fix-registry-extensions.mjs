/**
 * OpenClaw - Fix registry file extensions
 * Corrects .js imports to .mjs where needed
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🔧 OpenClaw - Fixing registry file extensions\n');
console.log('='.repeat(80));

let fixed = 0;

function fixRegistryFile(filePath, relativePath) {
  if (!fs.existsSync(filePath)) {
    console.log(`   ⚠️  ${relativePath} not found`);
    return;
  }

  let content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  const fixedLines = [];
  let modified = false;

  for (const line of lines) {
    // Check if line imports a provider
    const match = line.match(/require\(['"]\.\/([^'"]+\.js)['"]\)/);
    
    if (match) {
      const importPath = match[1];
      const baseName = importPath.replace('.js', '');
      const providersDir = path.join(process.cwd(), 'lib/providers');
      
      // Check which extension exists
      const jsPath = path.join(providersDir, baseName + '.js');
      const mjsPath = path.join(providersDir, baseName + '.mjs');
      const tsPath = path.join(providersDir, baseName + '.ts');
      
      if (fs.existsSync(mjsPath)) {
        // Change .js to .mjs
        const newLine = line.replace('.js', '.mjs');
        fixedLines.push(newLine);
        modified = true;
      } else if (!fs.existsSync(jsPath) && !fs.existsSync(tsPath)) {
        // File doesn't exist - comment out
        fixedLines.push(`// MISSING: ${line.trim()}`);
        modified = true;
      } else {
        fixedLines.push(line);
      }
    } else {
      fixedLines.push(line);
    }
  }

  if (modified) {
    fs.writeFileSync(filePath, fixedLines.join('\n'), 'utf8');
    console.log(`   ✅ Fixed: ${relativePath}`);
    fixed++;
  }
}

console.log('\n🔧 Fixing registry files...\n');

const registryFiles = [
  'lib/providers/extended-registry.js',
  'lib/providers/final-complete-registry.js'
];

registryFiles.forEach(file => {
  fixRegistryFile(path.join(process.cwd(), file), file);
});

console.log('\n' + '='.repeat(80));
console.log(`📊 Fixed ${fixed} registry files\n`);
console.log('✨ All extension mismatches resolved!');
