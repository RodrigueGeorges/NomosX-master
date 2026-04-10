/**
 * OpenClaw Comprehensive Code Fixer
 * Fixes all detected issues: syntax errors, duplicate imports, mixed styles
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🔧 OpenClaw Comprehensive Code Fixer\n');
console.log('='.repeat(80));

let fixed = 0;
let errors = 0;

// Fix 1: Remove invalid module.exports. = ; lines
function fixInvalidModuleExports(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    const original = content;
    
    // Remove lines with module.exports. = ;
    content = content.replace(/^module\.exports\.\s*=\s*;\s*$/gm, '');
    
    if (content !== original) {
      fs.writeFileSync(filePath, content, 'utf8');
      return true;
    }
    return false;
  } catch (err) {
    console.error(`❌ Error fixing ${filePath}: ${err.message}`);
    errors++;
    return false;
  }
}

// Fix 2: Convert const type{} to import type {}
function fixConstType(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    const original = content;
    
    // Pattern: const type{Something} = require('...');
    // Replace with: import type {Something} from '...';
    content = content.replace(
      /const\s+type\s*\{\s*([^}]+)\s*\}\s*=\s*require\(['"]([^'"]+)['"]\);?/g,
      "import type {$1} from '$2';"
    );
    
    if (content !== original) {
      fs.writeFileSync(filePath, content, 'utf8');
      return true;
    }
    return false;
  } catch (err) {
    console.error(`❌ Error fixing ${filePath}: ${err.message}`);
    errors++;
    return false;
  }
}

// Fix 3: Remove duplicate React imports
function fixDuplicateReactImports(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    
    let firstReactImport = -1;
    let duplicateLines = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Check for React import/require
      if ((line.includes("require('react')") || line.includes('require("react")')) && 
          line.includes('const React')) {
        if (firstReactImport === -1) {
          firstReactImport = i;
        } else {
          duplicateLines.push(i);
        }
      }
    }
    
    // Remove duplicate lines (from end to start to preserve indices)
    if (duplicateLines.length > 0) {
      for (let i = duplicateLines.length - 1; i >= 0; i--) {
        lines.splice(duplicateLines[i], 1);
      }
      
      const newContent = lines.join('\n');
      fs.writeFileSync(filePath, newContent, 'utf8');
      return true;
    }
    
    return false;
  } catch (err) {
    console.error(`❌ Error fixing ${filePath}: ${err.message}`);
    errors++;
    return false;
  }
}

// Fix 4: Consolidate React imports (merge const React + const {hooks})
function consolidateReactImports(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    
    let reactLine = -1;
    let hooksLines = [];
    let allHooks = new Set();
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Find main React import
      if (line.match(/^const React = require\(['"]react['"]\);?$/)) {
        reactLine = i;
      }
      
      // Find destructured React imports
      const hooksMatch = line.match(/^const \{([^}]+)\} = require\(['"]react['"]\);?$/);
      if (hooksMatch) {
        hooksLines.push(i);
        const hooks = hooksMatch[1].split(',').map(h => h.trim());
        hooks.forEach(h => allHooks.add(h));
      }
    }
    
    // If we have both React and hooks imports, consolidate
    if (reactLine !== -1 && hooksLines.length > 0) {
      // Remove all hooks lines (from end to start)
      for (let i = hooksLines.length - 1; i >= 0; i--) {
        lines.splice(hooksLines[i], 1);
      }
      
      // Update React line to include hooks
      const hooksStr = Array.from(allHooks).join(',');
      const newReactLine = `import React from 'react';\nconst {${hooksStr}} = require('react');`;
      
      // Find the new position of React line after deletions
      let adjustedReactLine = reactLine;
      for (const hookLine of hooksLines) {
        if (hookLine < reactLine) adjustedReactLine--;
      }
      
      lines[adjustedReactLine] = newReactLine;
      
      const newContent = lines.join('\n');
      fs.writeFileSync(filePath, newContent, 'utf8');
      return true;
    }
    
    return false;
  } catch (err) {
    console.error(`❌ Error fixing ${filePath}: ${err.message}`);
    errors++;
    return false;
  }
}

function processFile(filePath) {
  const relativePath = path.relative(process.cwd(), filePath);
  let fileFixed = false;
  
  // Apply all fixes
  if (fixInvalidModuleExports(filePath)) {
    console.log(`✅ Fixed invalid module.exports: ${relativePath}`);
    fileFixed = true;
  }
  
  if (fixConstType(filePath)) {
    console.log(`✅ Fixed const type syntax: ${relativePath}`);
    fileFixed = true;
  }
  
  if (fixDuplicateReactImports(filePath)) {
    console.log(`✅ Removed duplicate React imports: ${relativePath}`);
    fileFixed = true;
  }
  
  if (consolidateReactImports(filePath)) {
    console.log(`✅ Consolidated React imports: ${relativePath}`);
    fileFixed = true;
  }
  
  if (fileFixed) {
    fixed++;
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
        processFile(fullPath);
      }
    }
  }
}

// Scan directories
const dirsToScan = ['app', 'components', 'hooks', 'lib'];

for (const dir of dirsToScan) {
  const fullPath = path.join(process.cwd(), dir);
  if (fs.existsSync(fullPath)) {
    console.log(`\n📂 Processing: ${dir}/\n`);
    scanDirectory(fullPath);
  }
}

console.log('\n' + '='.repeat(80));
console.log('📊 SUMMARY:');
console.log(`   ✅ Fixed: ${fixed} files`);
console.log(`   ❌ Errors: ${errors} files`);

if (fixed > 0) {
  console.log('\n🎉 All issues fixed! Re-run analysis to verify.');
} else {
  console.log('\n✨ No files needed fixing.');
}
