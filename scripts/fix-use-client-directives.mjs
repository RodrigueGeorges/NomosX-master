/**
 * OpenClaw "use client" Directive Fixer
 * Ensures "use client" is the FIRST line in all client component files
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🔧 OpenClaw "use client" Directive Fixer\n');
console.log('='.repeat(60));

let fixed = 0;
let errors = 0;

function fixUseClientDirective(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    
    // Check if file contains "use client" directive
    if (!content.includes('"use client"') && !content.includes("'use client'")) {
      return false;
    }

    const lines = content.split('\n');
    let useClientIndex = -1;
    let useClientLine = '';
    
    // Find the "use client" line
    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if (trimmed === '"use client";' || trimmed === "'use client';" || 
          trimmed === '"use client"' || trimmed === "'use client'") {
        useClientIndex = i;
        useClientLine = '"use client";';
        break;
      }
    }

    if (useClientIndex === -1) {
      return false; // No "use client" found
    }

    // If already at line 0, nothing to fix
    if (useClientIndex === 0) {
      return false;
    }

    // Remove the "use client" line from its current position
    lines.splice(useClientIndex, 1);

    // Remove any leading blank lines or comments before inserting
    while (lines.length > 0 && (lines[0].trim() === '' || lines[0].trim().startsWith('//'))) {
      lines.shift();
    }

    // Insert "use client" at the very beginning
    lines.unshift(useClientLine);
    lines.unshift(''); // Add blank line after directive

    const newContent = lines.join('\n');
    fs.writeFileSync(filePath, newContent, 'utf8');
    
    console.log(`✅ Fixed: ${path.relative(process.cwd(), filePath)}`);
    return true;
  } catch (err) {
    console.error(`❌ Error processing ${filePath}: ${err.message}`);
    errors++;
    return false;
  }
}

function scanDirectory(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    
    if (entry.isDirectory()) {
      // Skip node_modules, .next, etc.
      if (['node_modules', '.next', '.git', 'out', 'dist'].includes(entry.name)) {
        continue;
      }
      scanDirectory(fullPath);
    } else if (entry.isFile()) {
      // Process .tsx, .ts, .jsx, .js files
      if (/\.(tsx|ts|jsx|js)$/.test(entry.name)) {
        if (fixUseClientDirective(fullPath)) {
          fixed++;
        }
      }
    }
  }
}

// Scan specific directories
const dirsToScan = ['app', 'components', 'hooks'];

for (const dir of dirsToScan) {
  const fullPath = path.join(process.cwd(), dir);
  if (fs.existsSync(fullPath)) {
    console.log(`\n📂 Scanning: ${dir}/\n`);
    scanDirectory(fullPath);
  }
}

console.log('\n' + '='.repeat(60));
console.log('📊 SUMMARY:');
console.log(`   ✅ Fixed: ${fixed} files`);
console.log(`   ❌ Errors: ${errors} files`);

if (fixed > 0) {
  console.log('\n🎉 All "use client" directives moved to top of files!');
} else {
  console.log('\n✨ No files needed fixing.');
}
