#!/usr/bin/env node

/**
 * Enhanced callLLM Error Fix Script v2
 * 
 * More robust pattern matching for all callLLM API inconsistencies
 */

const fs = require('fs');
const path = require('path');

const LIB_DIR = path.join(__dirname, '..', 'lib');
const BACKUP_DIR = path.join(__dirname, '..', 'backups');

// Create backup directory
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

console.log('🔧 Enhanced callLLM Error Fix Script v2');
console.log('=========================================\n');

function findTsFiles(dir) {
  const files = [];
  
  function traverse(currentDir) {
    try {
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
    } catch (err) {
      console.warn(`Warning: Could not read directory ${currentDir}: ${err.message}`);
    }
  }
  
  traverse(dir);
  return files;
}

function analyzeAndFixFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    let modified = false;
    let changes = [];
    
    // Create backup
    const relativePath = path.relative(LIB_DIR, filePath);
    const backupPath = path.join(BACKUP_DIR, relativePath.replace(/[\/\\]/g, '_'));
    fs.writeFileSync(backupPath, content);
    
    let newContent = content;
    
    // Pattern 1: callLLM(prompt) - simple string argument
    const pattern1 = /callLLM\(\s*([a-zA-Z_][a-zA-Z0-9_]*|\s*\$\{[^}]+\}|\s*`[^`]*`|\s*"[^"]*"|\s*'[^']*')\s*\)/g;
    let match1;
    while ((match1 = pattern1.exec(content)) !== null) {
      const fullMatch = match1[0];
      const variableName = match1[1].trim();
      const lineNumber = content.substring(0, match1.index).split('\n').length;
      
      // Skip if it's already in correct format
      if (fullMatch.includes('messages:')) continue;
      
      const replacement = `callLLM({ messages: [{ role: 'user', content: ${variableName} }] })`;
      newContent = newContent.replace(fullMatch, replacement);
      
      changes.push({
        line: lineNumber,
        original: fullMatch,
        fixed: replacement
      });
      modified = true;
    }
    
    // Pattern 2: callLLM(prompt, { options }) - string + options
    const pattern2 = /callLLM\(\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*,\s*\{[^}]*\}\s*\)/g;
    let match2;
    while ((match2 = pattern2.exec(newContent)) !== null) {
      const fullMatch = match2[0];
      const variableName = match2[1].trim();
      const lineNumber = newContent.substring(0, match2.index).split('\n').length;
      
      // Skip if it's already in correct format
      if (fullMatch.includes('messages:')) continue;
      
      const replacement = `callLLM({ messages: [{ role: 'user', content: ${variableName} }] })`;
      newContent = newContent.replace(fullMatch, replacement);
      
      changes.push({
        line: lineNumber,
        original: fullMatch,
        fixed: replacement
      });
      modified = true;
    }
    
    // Write fixed content if modified
    if (modified) {
      fs.writeFileSync(filePath, newContent);
    }
    
    return { modified, changes };
  } catch (err) {
    console.error(`Error processing file ${filePath}: ${err.message}`);
    return { modified: false, changes: [] };
  }
}

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
        console.log(`   Line ${change.line}: ${change.original}`);
        console.log(`   → ${change.fixed}`);
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
  const reportPath = path.join(__dirname, 'callllm-fix-report-v2.json');
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

if (require.main === module) {
  main();
}

module.exports = { analyzeAndFixFile, findTsFiles };
