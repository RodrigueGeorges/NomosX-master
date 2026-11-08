import { config } from 'dotenv';
config({ path: '.env.local' });
import * as fs from 'fs';

// Read the source BRIEF_CSS
const source = fs.readFileSync('lib/agent/editor-agent.ts', 'utf-8');
const cssStart = source.indexOf("const BRIEF_CSS = `");
const cssEnd = source.indexOf("`;", cssStart + 20);
const briefCss = source.substring(cssStart + 18, cssEnd);

// Find the first occurrence of "nomosx-brief::before" in the source CSS
const srcIdx = briefCss.indexOf('nomosx-brief::before');
console.log('Source BRIEF_CSS context:', JSON.stringify(briefCss.substring(srcIdx - 30, srcIdx + 30)));

// Now check the output HTML
const html = fs.readFileSync('scripts/output-latest.html', 'utf-8');
const htmlIdx = html.indexOf('nomosx-brief::before');
console.log('Output HTML context:', JSON.stringify(html.substring(htmlIdx - 30, htmlIdx + 30)));

// Check if the CSS in the HTML matches the source CSS
const htmlCssStart = html.indexOf('<style>');
const htmlCssEnd = html.indexOf('</style>');
const htmlCss = html.substring(htmlCssStart, htmlCssEnd + 8);

// Find the difference
const srcCssStart = briefCss.indexOf('<style>');
const srcCssEnd = briefCss.indexOf('</style>');
const srcCssOnly = briefCss.substring(srcCssStart, srcCssEnd + 8);

// Find first difference
for (let i = 0; i < Math.min(srcCssOnly.length, htmlCss.length); i++) {
  if (srcCssOnly[i] !== htmlCss[i]) {
    console.log(`\nFirst difference at position ${i}:`);
    console.log('  Source:', JSON.stringify(srcCssOnly.substring(i - 20, i + 20)));
    console.log('  HTML:  ', JSON.stringify(htmlCss.substring(i - 20, i + 20)));
    break;
  }
}

console.log('\nSource CSS length:', srcCssOnly.length);
console.log('HTML CSS length:', htmlCss.length);
