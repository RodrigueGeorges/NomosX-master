#!/usr/bin/env node

/**
 * Professional script to fix all callLLM API inconsistencies
 * 
 * This script:
 * 1. Scans all TypeScript files for callLLM usage
 * 2. Identifies incorrect API calls
 * 3. Fixes them systematically
 * 4. Reports changes made
 */

const fs = require('fs');
const path = require('path');

// Configuration
const LIB_DIR = path.join(__dirname, '..', 'lib');
const BACKUP_DIR = path.join(__dirname, '..', 'backups');

// Patterns to match incorrect callLLM usage
const INCORRECT_PATTERNS = [
  // callLLM(prompt) - single string argument
  /callLLM\(\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\)/g,
  // callLLM(prompt, { options }) - string + options
  /callLLM\(\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*,\s*\{[^}]*\}\s*\)/g
];

// Correct replacement
const CORRECT_REPLACEMENT = 'callLLM({ messages: [{ role: \'user\', content: $1 }] })';

// Create backup directory
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

console.log('🔧 Professional callLLM Error Fix Script');
console.log('==========================================\n');

// Find all TypeScript files
function findTsFiles(dir) {
  const files = [];
  
  function traverse(currentDir) {
    const items = fs.readdirSync(currentDir);
    
    for (const item of items) {
      const fullPath = path.join(currentDir, item);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory() && !item.startsWith('.') && item !== 'node_modules') {
        traverse(fullPath);
      } else if (item.endsWith('.ts') || item.endsWith('.tsx')) {
        files.push(fullPath);
      }
    }
  }
  
  traverse(dir);
  return files;
}

// Create backup directory and subdirectories
function ensureBackupDir(filePath) {
  const relativePath = path.relative(LIB_DIR, filePath);
  const backupSubDir = path.dirname(path.join(BACKUP_DIR, relativePath));
  
  if (!fs.existsSync(backupSubDir)) {
    fs.mkdirSync(backupSubDir, { recursive: true });
  }
  
  return backupSubDir;
}

// Analyze and fix a single file
function analyzeAndFixFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  let modified = false;
  let changes = [];
  
  // Create backup directory structure
  ensureBackupDir(filePath);
  const backupPath = path.join(BACKUP_DIR, path.relative(LIB_DIR, filePath).replace(/\//g, '_'));
  fs.writeFileSync(backupPath, content);
  
  let newContent = content;
  
  // Check each pattern
  for (const pattern of INCORRECT_PATTERNS) {
    const matches = [...content.matchAll(pattern)];
    
    if (matches.length > 0) {
      modified = true;
      
      for (const match of matches) {
        const lineNumber = content.substring(0, match.index).split('\n').length;
        const originalCall = match[0];
        const variableName = match[1];
        
        changes.push({
          line: lineNumber,
          original: originalCall,
          fixed: `callLLM({ messages: [{ role: 'user', content: ${variableName} }] })`
        });
        
        // Replace in content
        newContent = newContent.replace(originalCall, `callLLM({ messages: [{ role: 'user', content: ${variableName} }] })`);
      }
    }
  }
  
  // Write fixed content if modified
  if (modified) {
    fs.writeFileSync(filePath, newContent);
  }
  
  return { modified, changes };
}

// Main execution
function main() {
  console.log('📁 Scanning TypeScript files...\n');
  
  const tsFiles = findTsFiles(LIB_DIR);
  console.log(`Found ${tsFiles.length} TypeScript files\n`);
  
  let totalFilesFixed = 0;
  let totalChanges = 0;
  const report = [];
  
  for (const file of tsFiles) {
    const relativePath = path.relative(LIB_DIR, file);
    const result = analyzeAndFixFile(file);
    
    if (result.modified) {
      totalFilesFixed++;
      totalChanges += result.changes.length;
      
      report.push({
        file: relativePath,
        changes: result.changes
      });
      
      console.log(`✅ Fixed: ${relativePath}`);
      for (const change of result.changes) {
        console.log(`   Line ${change.line}: ${change.original} → ${change.fixed}`);
      }
      console.log('');
    }
  }
  
  // Summary
  console.log('📊 Summary Report');
  console.log('================');
  console.log(`Files scanned: ${tsFiles.length}`);
  console.log(`Files fixed: ${totalFilesFixed}`);
  console.log(`Total changes: ${totalChanges}`);
  console.log(`Backups created: ${BACKUP_DIR}`);
  
  if (totalChanges > 0) {
    console.log('\n✨ All callLLM errors have been fixed!');
    console.log('🔄 You can now run: npm run build');
  } else {
    console.log('\n✅ No callLLM errors found.');
  }
  
  // Generate detailed report
  const reportPath = path.join(__dirname, 'callllm-fix-report.json');
  fs.writeFileSync(reportPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    summary: {
      filesScanned: tsFiles.length,
      filesFixed: totalFilesFixed,
      totalChanges: totalChanges
    },
    details: report
  }, null, 2));
  
  console.log(`\n📄 Detailed report saved to: ${reportPath}`);
}

// Run the script
if (require.main === module) {
  main();
}

module.exports = { analyzeAndFixFile, findTsFiles };
