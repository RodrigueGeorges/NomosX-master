/**
 * OpenClaw - Clean all DISABLED imports and references
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🧹 OpenClaw - Cleaning DISABLED imports\n');
console.log('='.repeat(80));

let cleaned = 0;

function cleanFile(filePath, relativePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  let content = fs.readFileSync(filePath, 'utf8');
  const originalContent = content;
  
  // Remove all lines that start with "// DISABLED"
  const lines = content.split('\n');
  const cleanedLines = lines.filter(line => {
    return !line.trim().startsWith('// DISABLED');
  });
  
  content = cleanedLines.join('\n');
  
  // Clean up multiple consecutive blank lines
  content = content.replace(/\n\n\n+/g, '\n\n');
  
  if (content !== originalContent) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`   ✅ Cleaned: ${relativePath}`);
    cleaned++;
  }
}

const filesToClean = [
  'lib/providers/all-providers-registry.ts',
  'lib/providers/extended-registry.js',
  'lib/providers/final-complete-registry.js',
  'lib/agent/monitoring-agent.ts',
  'lib/embeddings-v2.ts',
  'lib/observability/dashboard.ts'
];

console.log('\n🧹 Removing DISABLED import lines...\n');

filesToClean.forEach(file => {
  cleanFile(path.join(process.cwd(), file), file);
});

console.log('\n' + '='.repeat(80));
console.log(`📊 Cleaned ${cleaned} files\n`);
console.log('✨ All DISABLED imports removed!');
