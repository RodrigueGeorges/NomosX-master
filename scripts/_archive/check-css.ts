import { config } from 'dotenv';
config({ path: '.env.local' });

// Read the file directly and extract BRIEF_CSS
import * as fs from 'fs';
const content = fs.readFileSync('lib/agent/editor-agent.ts', 'utf-8');

// Find all occurrences of "nomosx-brief::before"
let idx = 0;
while ((idx = content.indexOf('nomosx-brief::before', idx)) !== -1) {
  const ctx = content.substring(idx - 30, idx + 30);
  console.log(`Found at index ${idx}: ${JSON.stringify(ctx)}`);
  idx += 1;
}

// Also check the output HTML
const html = fs.readFileSync('scripts/output-latest.html', 'utf-8');
let hidx = 0;
let count = 0;
while ((hidx = html.indexOf('nomosx-brief::before', hidx)) !== -1) {
  const ctx = html.substring(hidx - 30, hidx + 30);
  console.log(`HTML at index ${hidx}: ${JSON.stringify(ctx)}`);
  hidx += 1;
  count++;
  if (count > 5) break;
}
