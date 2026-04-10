/**
 * OpenClaw Deep Code Analysis
 * Comprehensive code quality and consistency checker
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🔍 OpenClaw Deep Code Analysis\n');
console.log('='.repeat(80));

const issues = {
  mixedImports: [],
  duplicateImports: [],
  mixedExports: [],
  syntaxErrors: [],
  inconsistentPaths: [],
  missingExports: [],
  unusedImports: []
};

function analyzeFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    const relativePath = path.relative(process.cwd(), filePath);
    
    let hasRequire = false;
    let hasImport = false;
    let hasModuleExports = false;
    let hasExportDefault = false;
    let hasExportNamed = false;
    
    const imports = [];
    const requires = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const lineNum = i + 1;
      
      // Check for mixed import styles
      if (line.startsWith('import ') && !line.includes('import type')) {
        hasImport = true;
        imports.push({ line: lineNum, content: line });
      }
      
      if (line.includes('require(') && !line.startsWith('//')) {
        hasRequire = true;
        requires.push({ line: lineNum, content: line });
      }
      
      // Check for mixed export styles
      if (line.startsWith('module.exports')) {
        hasModuleExports = true;
      }
      
      if (line.startsWith('export default')) {
        hasExportDefault = true;
      }
      
      if (line.startsWith('export ') && !line.startsWith('export default')) {
        hasExportNamed = true;
      }
      
      // Check for duplicate React imports
      if (line.includes("require('react')") && line.includes('const React')) {
        const nextLines = lines.slice(i + 1, i + 5).join('\n');
        if (nextLines.includes("require('react')")) {
          issues.duplicateImports.push({
            file: relativePath,
            line: lineNum,
            issue: 'React imported multiple times'
          });
        }
      }
      
      // Check for syntax errors
      if (line.includes('module.exports.') && line.endsWith('= ;')) {
        issues.syntaxErrors.push({
          file: relativePath,
          line: lineNum,
          issue: 'Invalid module.exports syntax',
          content: line
        });
      }
      
      if (line.includes('const type{') || line.includes('const type {')) {
        issues.syntaxErrors.push({
          file: relativePath,
          line: lineNum,
          issue: 'Invalid "const type" syntax - should be "import type"',
          content: line
        });
      }
      
      // Check for function Name;() pattern
      if (/function\s+\w+;?\s*\(/.test(line) && line.includes(';(')) {
        issues.syntaxErrors.push({
          file: relativePath,
          line: lineNum,
          issue: 'Invalid semicolon before function parentheses',
          content: line
        });
      }
    }
    
    // Report mixed import/require
    if (hasRequire && hasImport) {
      issues.mixedImports.push({
        file: relativePath,
        imports: imports.length,
        requires: requires.length
      });
    }
    
    // Report mixed exports
    if ((hasModuleExports && hasExportDefault) || 
        (hasModuleExports && hasExportNamed)) {
      issues.mixedExports.push({
        file: relativePath,
        hasModuleExports,
        hasExportDefault,
        hasExportNamed
      });
    }
    
  } catch (err) {
    console.error(`❌ Error analyzing ${filePath}: ${err.message}`);
  }
}

function scanDirectory(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    
    if (entry.isDirectory()) {
      if (['node_modules', '.next', '.git', 'out', 'dist', 'public'].includes(entry.name)) {
        continue;
      }
      scanDirectory(fullPath);
    } else if (entry.isFile()) {
      if (/\.(tsx|ts|jsx|js)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
        analyzeFile(fullPath);
      }
    }
  }
}

// Scan directories
const dirsToScan = ['app', 'components', 'hooks', 'lib'];

for (const dir of dirsToScan) {
  const fullPath = path.join(process.cwd(), dir);
  if (fs.existsSync(fullPath)) {
    console.log(`\n📂 Scanning: ${dir}/`);
    scanDirectory(fullPath);
  }
}

// Report findings
console.log('\n' + '='.repeat(80));
console.log('📊 ANALYSIS RESULTS\n');

if (issues.syntaxErrors.length > 0) {
  console.log('🔴 SYNTAX ERRORS (' + issues.syntaxErrors.length + '):\n');
  issues.syntaxErrors.forEach(err => {
    console.log(`   ${err.file}:${err.line}`);
    console.log(`   Issue: ${err.issue}`);
    console.log(`   Code: ${err.content}`);
    console.log('');
  });
}

if (issues.mixedImports.length > 0) {
  console.log('🟡 MIXED IMPORT STYLES (' + issues.mixedImports.length + '):\n');
  issues.mixedImports.forEach(mix => {
    console.log(`   ${mix.file}`);
    console.log(`   Has ${mix.imports} ES imports and ${mix.requires} CommonJS requires`);
    console.log('');
  });
}

if (issues.duplicateImports.length > 0) {
  console.log('🟡 DUPLICATE IMPORTS (' + issues.duplicateImports.length + '):\n');
  issues.duplicateImports.forEach(dup => {
    console.log(`   ${dup.file}:${dup.line}`);
    console.log(`   Issue: ${dup.issue}`);
    console.log('');
  });
}

if (issues.mixedExports.length > 0) {
  console.log('🟡 MIXED EXPORT STYLES (' + issues.mixedExports.length + '):\n');
  issues.mixedExports.forEach(mix => {
    console.log(`   ${mix.file}`);
    const styles = [];
    if (mix.hasModuleExports) styles.push('module.exports');
    if (mix.hasExportDefault) styles.push('export default');
    if (mix.hasExportNamed) styles.push('export named');
    console.log(`   Uses: ${styles.join(', ')}`);
    console.log('');
  });
}

console.log('='.repeat(80));
console.log('📈 SUMMARY:\n');
console.log(`   🔴 Syntax Errors: ${issues.syntaxErrors.length}`);
console.log(`   🟡 Mixed Imports: ${issues.mixedImports.length}`);
console.log(`   🟡 Duplicate Imports: ${issues.duplicateImports.length}`);
console.log(`   🟡 Mixed Exports: ${issues.mixedExports.length}`);

const totalIssues = issues.syntaxErrors.length + 
                    issues.mixedImports.length + 
                    issues.duplicateImports.length + 
                    issues.mixedExports.length;

if (totalIssues === 0) {
  console.log('\n✅ No critical issues found!');
} else {
  console.log(`\n⚠️  Total issues found: ${totalIssues}`);
}

// Export results to JSON for further processing
const resultsPath = path.join(process.cwd(), 'scripts', 'analysis-results.json');
fs.writeFileSync(resultsPath, JSON.stringify(issues, null, 2));
console.log(`\n💾 Detailed results saved to: scripts/analysis-results.json`);
