const fs = require('fs');
const html = fs.readFileSync('scripts/output-funnel.html', 'utf-8');

console.log('=== HTML Analysis ===');
console.log('Length:', html.length);

const checks = {
  'non établie': (html.match(/non établie/g) || []).length,
  'Non vérifié': (html.match(/Non vérifié/g) || []).length,
  'Unknown Author': (html.match(/Unknown Author/g) || []).length,
  'DOI broken (doi.org/non)': (html.match(/doi\.org\/non/g) || []).length,
  'electricity data': (html.match(/electricity|Day-ahead electricity|EUR \/ MWh/gi) || []).length,
  'energy-charts': (html.match(/energy-charts/gi) || []).length,
  'fingrid': (html.match(/fingrid/gi) || []).length,
  'dup [E4]E4': (html.match(/\[E\d+\]E\d+/g) || []).length,
  '[E-N] in text (non-CSS)': 0,
  '<sup> citations': (html.match(/<sup class="cite"/g) || []).length,
  '[SRC-N] remaining': (html.match(/\[SRC-\d+\]/g) || []).length,
  'style blocks': (html.match(/<style/gi) || []).length,
};

// Count [E-N] only in text nodes (not CSS)
const styleBlocks = [];
let textOnly = html.replace(/<(style|script)\b[^>]*>[\s\S]*?<\/\1>/gi, (m) => { styleBlocks.push(m); return ''; });
checks['[E-N] in text (non-CSS)'] = (textOnly.match(/\[E\d+\]/g) || []).length;
checks['[E-N] in CSS'] = (html.match(/\[E\d+\]/g) || []).length - checks['[E-N] in text (non-CSS)'];

console.log('\n=== Issue Checks ===');
Object.entries(checks).forEach(([k, v]) => {
  const status = v === 0 ? '✅' : v < 5 ? '⚠️' : '❌';
  console.log(`  ${status} ${k}: ${v}`);
});

// Show Key Findings
const kfIdx = html.indexOf('Key Findings');
if (kfIdx > 0) {
  console.log('\n=== Key Findings (first 1500 chars) ===');
  console.log(html.slice(kfIdx, kfIdx + 1500));
}

// Show first source entry
const srcIdx = html.indexOf('class="apa-ref"');
if (srcIdx > 0) {
  console.log('\n=== First APA source entry ===');
  console.log(html.slice(srcIdx - 30, srcIdx + 500));
}

// Show first source-item (strategic format)
const siIdx = html.indexOf('class="source-item"');
if (siIdx > 0) {
  console.log('\n=== First source-item (strategic) ===');
  console.log(html.slice(siIdx - 30, siIdx + 400));
}

// Check for grounding/coverage issues
console.log('\n=== Citation Analysis ===');
const supCount = (html.match(/<sup class="cite"/g) || []).length;
const refCount = (html.match(/class="apa-ref"/g) || []).length;
const srcItemCount = (html.match(/class="source-item"/g) || []).length;
console.log(`  <sup> citations: ${supCount}`);
console.log(`  APA refs: ${refCount}`);
console.log(`  source-items: ${srcItemCount}`);

// Check for "non établie" in CSS vs text
if (checks['non établie'] > 0) {
  console.log('\n=== "non établie" locations ===');
  let idx = 0, count = 0;
  while ((idx = html.indexOf('non établie', idx)) !== -1 && count < 10) {
    const before = html.slice(Math.max(0, idx - 80), idx);
    const inCss = before.lastIndexOf('<style') > before.lastIndexOf('</style>');
    const inInlineStyle = /style="[^"]*$/.test(before);
    console.log(`  [${count+1}] ${inCss ? '(CSS)' : inInlineStyle ? '(inline-style)' : '(text)'}: ${html.slice(Math.max(0, idx - 40), idx + 40)}`);
    idx += 12;
    count++;
  }
}
