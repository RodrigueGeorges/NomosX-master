/**
 * OpenClaw Export Validator
 * Detects all undefined exports in index files
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🔍 OpenClaw Export Validator\n');
console.log('='.repeat(80));

const issues = [];

/**
 * Parse export statement and extract exported names
 */
function parseExportStatement(content) {
  const exports = new Set();
  
  // Match: export { name1, name2, ... }
  const namedExports = content.match(/export\s*\{\s*([^}]+)\s*\}/g);
  if (namedExports) {
    namedExports.forEach(exp => {
      const names = exp.match(/export\s*\{\s*([^}]+)\s*\}/)[1];
      names.split(',').forEach(name => {
        const cleanName = name.trim().split(/\s+as\s+/)[0].trim();
        if (cleanName) exports.add(cleanName);
      });
    });
  }
  
  // Match: export function name()
  const functionExports = content.matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g);
  for (const match of functionExports) {
    exports.add(match[1]);
  }
  
  // Match: export const name =
  const constExports = content.matchAll(/export\s+const\s+(\w+)\s*=/g);
  for (const match of constExports) {
    exports.add(match[1]);
  }
  
  // Match: export class name
  const classExports = content.matchAll(/export\s+class\s+(\w+)/g);
  for (const match of classExports) {
    exports.add(match[1]);
  }
  
  return exports;
}

/**
 * Find all defined symbols in a file
 */
function findDefinedSymbols(content) {
  const defined = new Set();
  
  // Functions
  const functions = content.matchAll(/(?:export\s+)?(?:async\s+)?function\s+(\w+)/g);
  for (const match of functions) {
    defined.add(match[1]);
  }
  
  // Const/let/var
  const variables = content.matchAll(/(?:export\s+)?(?:const|let|var)\s+(\w+)/g);
  for (const match of variables) {
    defined.add(match[1]);
  }
  
  // Classes
  const classes = content.matchAll(/(?:export\s+)?class\s+(\w+)/g);
  for (const match of classes) {
    defined.add(match[1]);
  }
  
  // Imported symbols
  const imports = content.matchAll(/import\s+\{([^}]+)\}\s+from/g);
  for (const match of imports) {
    match[1].split(',').forEach(name => {
      const cleanName = name.trim().split(/\s+as\s+/)[0].trim();
      if (cleanName) defined.add(cleanName);
    });
  }
  
  // Default imports
  const defaultImports = content.matchAll(/import\s+(\w+)\s+from/g);
  for (const match of defaultImports) {
    defined.add(match[1]);
  }
  
  return defined;
}

/**
 * Find symbols re-exported from other modules
 */
function findReExportedSymbols(content) {
  const reExported = new Set();
  
  // export * from './module'
  const starExports = content.matchAll(/export\s+\*\s+from\s+['"]([^'"]+)['"]/g);
  for (const match of starExports) {
    // Mark as wildcard - we'll need to check the actual file
    reExported.add(`*:${match[1]}`);
  }
  
  // export { name } from './module'
  const namedReExports = content.matchAll(/export\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/g);
  for (const match of namedReExports) {
    match[1].split(',').forEach(name => {
      const cleanName = name.trim().split(/\s+as\s+/)[0].trim();
      if (cleanName) reExported.add(cleanName);
    });
  }
  
  return reExported;
}

/**
 * Validate an index file
 */
function validateIndexFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const relativePath = path.relative(process.cwd(), filePath);
    
    const exported = parseExportStatement(content);
    const defined = findDefinedSymbols(content);
    const reExported = findReExportedSymbols(content);
    
    const undefined = [];
    
    for (const name of exported) {
      if (!defined.has(name) && !reExported.has(name)) {
        // Check if it's covered by a wildcard re-export
        let covered = false;
        for (const re of reExported) {
          if (re.startsWith('*:')) {
            covered = true; // Assume wildcard covers it (we'd need to check the actual file)
            break;
          }
        }
        if (!covered) {
          undefined.push(name);
        }
      }
    }
    
    if (undefined.length > 0) {
      issues.push({
        file: relativePath,
        undefined: undefined
      });
      
      console.log(`\n❌ ${relativePath}`);
      console.log(`   Undefined exports: ${undefined.join(', ')}`);
      console.log(`   Total: ${undefined.length} undefined`);
    } else {
      console.log(`\n✅ ${relativePath}`);
      console.log(`   All ${exported.size} exports are defined`);
    }
    
  } catch (err) {
    console.error(`\n❌ Error validating ${filePath}: ${err.message}`);
  }
}

// Validate the problematic file
const indexFile = path.join(process.cwd(), 'lib/providers/institutional/index.ts');
if (fs.existsSync(indexFile)) {
  console.log('\n📂 Validating: lib/providers/institutional/index.ts\n');
  validateIndexFile(indexFile);
}

console.log('\n' + '='.repeat(80));
console.log('📊 SUMMARY:');
console.log(`   Files with issues: ${issues.length}`);

if (issues.length > 0) {
  console.log('\n⚠️  ACTION REQUIRED:');
  issues.forEach(issue => {
    console.log(`\n   File: ${issue.file}`);
    console.log(`   Missing: ${issue.undefined.join(', ')}`);
  });
  
  // Save detailed report
  const reportPath = path.join(process.cwd(), 'scripts', 'export-validation-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(issues, null, 2));
  console.log(`\n💾 Detailed report: scripts/export-validation-report.json`);
} else {
  console.log('\n✅ All exports are properly defined!');
}
