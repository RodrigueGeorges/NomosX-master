/**
 * OpenClaw Comprehensive Build Checker
 * Detects all potential build errors before deployment
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🔍 OpenClaw Comprehensive Build Checker\n');
console.log('='.repeat(80));

const issues = {
  syntaxErrors: [],
  importErrors: [],
  exportErrors: [],
  typeErrors: [],
  moduleResolution: [],
  mixedModules: []
};

let filesScanned = 0;

/**
 * Check for common syntax errors
 */
function checkSyntax(content, filePath, relativePath) {
  // Check for invalid semicolons in function declarations
  if (/function\s+\w+;\s*\(/.test(content)) {
    issues.syntaxErrors.push({
      file: relativePath,
      issue: 'Invalid semicolon in function declaration',
      pattern: 'function Name;()'
    });
  }
  
  // Check for invalid module.exports syntax
  if (/module\.exports\.\s*=\s*;/.test(content)) {
    issues.syntaxErrors.push({
      file: relativePath,
      issue: 'Invalid module.exports syntax',
      pattern: 'module.exports. = ;'
    });
  }
  
  // Check for invalid const type syntax
  if (/const\s+type\s*\{/.test(content)) {
    issues.syntaxErrors.push({
      file: relativePath,
      issue: 'Invalid const type syntax (should be import type)',
      pattern: 'const type{...}'
    });
  }
  
  // Check for bare from statements
  if (/^\s*from\s+['"]/.test(content)) {
    issues.syntaxErrors.push({
      file: relativePath,
      issue: 'Bare from statement without export/import',
      pattern: "from './module';"
    });
  }
  
  // Check for "use client" placement
  const lines = content.split('\n');
  let useClientLine = -1;
  let firstCodeLine = -1;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === '"use client";' || line === "'use client';") {
      useClientLine = i;
    }
    if (firstCodeLine === -1 && line && !line.startsWith('//') && !line.startsWith('/*')) {
      if (line !== '"use client";' && line !== "'use client';") {
        firstCodeLine = i;
      }
    }
  }
  
  if (useClientLine > 0 && firstCodeLine >= 0 && firstCodeLine < useClientLine) {
    issues.syntaxErrors.push({
      file: relativePath,
      issue: '"use client" directive not at top of file',
      line: useClientLine + 1
    });
  }
}

/**
 * Check for import/export issues
 */
function checkImportsExports(content, filePath, relativePath) {
  // Check for mixed require/import
  const hasRequire = /\brequire\s*\(/.test(content);
  const hasImport = /^import\s+/m.test(content);
  
  if (hasRequire && hasImport) {
    issues.mixedModules.push({
      file: relativePath,
      issue: 'Mixed CommonJS (require) and ES modules (import)'
    });
  }
  
  // Check for undefined exports
  const exportMatches = content.match(/export\s*\{([^}]+)\}/g);
  if (exportMatches) {
    exportMatches.forEach(exp => {
      const names = exp.match(/export\s*\{([^}]+)\}/)[1];
      const exportedNames = names.split(',').map(n => n.trim().split(/\s+as\s+/)[0].trim());
      
      exportedNames.forEach(name => {
        // Check if the name is defined in the file
        const isDefined = new RegExp(`(?:function|const|let|var|class)\\s+${name}\\b`).test(content);
        const isImported = new RegExp(`import\\s+.*\\b${name}\\b.*from`).test(content);
        const isReExported = /export\s+\*\s+from/.test(content);
        
        if (!isDefined && !isImported && !isReExported) {
          issues.exportErrors.push({
            file: relativePath,
            issue: `Export '${name}' is not defined`,
            name: name
          });
        }
      });
    });
  }
  
  // Check for duplicate imports
  const reactImports = content.match(/require\(['"]react['"]\)/g);
  if (reactImports && reactImports.length > 2) {
    issues.importErrors.push({
      file: relativePath,
      issue: `React imported ${reactImports.length} times (should be 1-2 max)`,
      count: reactImports.length
    });
  }
}

/**
 * Check for module resolution issues
 */
function checkModuleResolution(content, filePath, relativePath) {
  const dir = path.dirname(filePath);
  
  // Check relative imports
  const relativeImports = content.matchAll(/(?:import|require)\s*\(?['"](\.[^'"]+)['"]/g);
  
  for (const match of relativeImports) {
    const importPath = match[1];
    let resolvedPath = path.resolve(dir, importPath);
    
    // Try with extensions
    const extensions = ['.ts', '.tsx', '.js', '.jsx', ''];
    let found = false;
    
    for (const ext of extensions) {
      const testPath = resolvedPath + ext;
      if (fs.existsSync(testPath)) {
        found = true;
        break;
      }
    }
    
    // Try as directory with index
    if (!found) {
      for (const ext of ['.ts', '.tsx', '.js', '.jsx']) {
        const testPath = path.join(resolvedPath, 'index' + ext);
        if (fs.existsSync(testPath)) {
          found = true;
          break;
        }
      }
    }
    
    if (!found) {
      issues.moduleResolution.push({
        file: relativePath,
        issue: `Cannot resolve module '${importPath}'`,
        importPath: importPath
      });
    }
  }
}

/**
 * Scan a file
 */
function scanFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const relativePath = path.relative(process.cwd(), filePath);
    
    filesScanned++;
    
    checkSyntax(content, filePath, relativePath);
    checkImportsExports(content, filePath, relativePath);
    checkModuleResolution(content, filePath, relativePath);
    
  } catch (err) {
    console.error(`❌ Error scanning ${filePath}: ${err.message}`);
  }
}

/**
 * Scan directory recursively
 */
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
        scanFile(fullPath);
      }
    }
  }
}

// Scan critical directories
const dirsToScan = ['app', 'components', 'hooks', 'lib'];

console.log('\n📂 Scanning directories...\n');
for (const dir of dirsToScan) {
  const fullPath = path.join(process.cwd(), dir);
  if (fs.existsSync(fullPath)) {
    console.log(`   Scanning: ${dir}/`);
    scanDirectory(fullPath);
  }
}

// Report findings
console.log('\n' + '='.repeat(80));
console.log('📊 COMPREHENSIVE BUILD CHECK RESULTS\n');
console.log(`Files scanned: ${filesScanned}\n`);

let totalIssues = 0;

if (issues.syntaxErrors.length > 0) {
  console.log(`🔴 SYNTAX ERRORS (${issues.syntaxErrors.length}):\n`);
  issues.syntaxErrors.forEach(err => {
    console.log(`   ${err.file}`);
    console.log(`   Issue: ${err.issue}`);
    if (err.pattern) console.log(`   Pattern: ${err.pattern}`);
    if (err.line) console.log(`   Line: ${err.line}`);
    console.log('');
  });
  totalIssues += issues.syntaxErrors.length;
}

if (issues.exportErrors.length > 0) {
  console.log(`🔴 EXPORT ERRORS (${issues.exportErrors.length}):\n`);
  issues.exportErrors.forEach(err => {
    console.log(`   ${err.file}`);
    console.log(`   Issue: ${err.issue}`);
    console.log('');
  });
  totalIssues += issues.exportErrors.length;
}

if (issues.moduleResolution.length > 0) {
  console.log(`🔴 MODULE RESOLUTION ERRORS (${issues.moduleResolution.length}):\n`);
  issues.moduleResolution.forEach(err => {
    console.log(`   ${err.file}`);
    console.log(`   Issue: ${err.issue}`);
    console.log('');
  });
  totalIssues += issues.moduleResolution.length;
}

if (issues.importErrors.length > 0) {
  console.log(`🟡 IMPORT WARNINGS (${issues.importErrors.length}):\n`);
  issues.importErrors.forEach(err => {
    console.log(`   ${err.file}`);
    console.log(`   Issue: ${err.issue}`);
    console.log('');
  });
}

if (issues.mixedModules.length > 0) {
  console.log(`🟡 MIXED MODULE WARNINGS (${issues.mixedModules.length}):\n`);
  issues.mixedModules.forEach(err => {
    console.log(`   ${err.file}`);
    console.log(`   Issue: ${err.issue}`);
    console.log('');
  });
}

console.log('='.repeat(80));
console.log('📈 SUMMARY:\n');
console.log(`   🔴 Critical errors: ${totalIssues}`);
console.log(`   🟡 Warnings: ${issues.importErrors.length + issues.mixedModules.length}`);
console.log(`   📁 Files scanned: ${filesScanned}`);

if (totalIssues === 0) {
  console.log('\n✅ No critical build errors found!');
  console.log('   Build should succeed on Netlify.');
} else {
  console.log(`\n⚠️  ${totalIssues} critical issues found that will cause build failures!`);
  console.log('   These must be fixed before deployment.');
}

// Save detailed report
const reportPath = path.join(process.cwd(), 'scripts', 'build-check-report.json');
fs.writeFileSync(reportPath, JSON.stringify(issues, null, 2));
console.log(`\n💾 Detailed report: scripts/build-check-report.json`);

// Exit with error code if critical issues found
process.exit(totalIssues > 0 ? 1 : 0);
