#!/usr/bin/env node
/**
 * 🔍 Trouver TOUS les fichiers avec CommonJS (require/module.exports)
 * Exclusions: node_modules, .next, generated/prisma-client
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const findings = [];

function scanDir(dir, depth = 0) {
  if (depth > 8) return;
  
  try {
    const items = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const item of items) {
      const fullPath = path.join(dir, item.name);
      const relativePath = path.relative(process.cwd(), fullPath);
      
      // Skip exclusions
      if (relativePath.includes('node_modules') || 
          relativePath.includes('.next') ||
          relativePath.includes('generated\\prisma-client') ||
          relativePath.startsWith('.')) {
        continue;
      }
      
      if (item.isDirectory()) {
        scanDir(fullPath, depth + 1);
      } else if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(item.name)) {
        try {
          const content = fs.readFileSync(fullPath, 'utf8');
          
          const hasRequire = /\brequire\s*\(/.test(content);
          const hasModuleExports = /\bmodule\.exports\b/.test(content);
          const hasExportsDot = /\bexports\.\w+\s*=/.test(content);
          
          if (hasRequire || hasModuleExports || hasExportsDot) {
            findings.push({
              file: relativePath,
              hasRequire,
              hasModuleExports,
              hasExportsDot,
              lines: []
            });
            
            // Trouver les lignes exactes
            const lines = content.split('\n');
            lines.forEach((line, idx) => {
              if (/\brequire\s*\(/.test(line) || 
                  /\bmodule\.exports\b/.test(line) || 
                  /\bexports\.\w+\s*=/.test(line)) {
                findings[findings.length - 1].lines.push({
                  num: idx + 1,
                  content: line.trim().substring(0, 80)
                });
              }
            });
          }
        } catch (err) {
          // Ignorer erreurs de lecture
        }
      }
    }
  } catch (err) {
    // Ignorer erreurs de scan
  }
}

console.log('🔍 Scan exhaustif du codebase...\n');
scanDir(process.cwd());

console.log(`📊 RÉSULTATS: ${findings.length} fichiers avec CommonJS\n`);

findings.forEach(f => {
  console.log(`📁 ${f.file}`);
  const types = [];
  if (f.hasRequire) types.push('require()');
  if (f.hasModuleExports) types.push('module.exports');
  if (f.hasExportsDot) types.push('exports.xxx');
  console.log(`   Type: ${types.join(', ')}`);
  
  f.lines.slice(0, 3).forEach(l => {
    console.log(`   L${l.num}: ${l.content}`);
  });
  console.log('');
});

// Sauvegarder le rapport
const reportPath = path.join(process.cwd(), 'scripts/commonjs-files-report.json');
fs.writeFileSync(reportPath, JSON.stringify(findings, null, 2));
console.log(`💾 Rapport complet: scripts/commonjs-files-report.json`);
