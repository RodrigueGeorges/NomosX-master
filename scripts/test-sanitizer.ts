import { sanitizeUnsourcedNumbers } from '../lib/agent/citation-repair';

// Test 1: Number with <sup> citation nearby should NOT be sanitized
const html1 = `<p>42% of facilities were damaged<sup class="cite"><a href="#ref-1" data-evidence="E1">E1</a></sup>.</p>`;
const r1 = sanitizeUnsourcedNumbers(html1);
console.log('Test 1 (number + <sup>):', r1.sanitized === 0 ? '✅ PASS' : '❌ FAIL', `(${r1.sanitized} sanitized)`);

// Test 2: Number without citation SHOULD be sanitized
const html2 = `<p>42% of facilities were damaged.</p>`;
const r2 = sanitizeUnsourcedNumbers(html2);
console.log('Test 2 (number, no cite):', r2.sanitized === 1 ? '✅ PASS' : '❌ FAIL', `(${r2.sanitized} sanitized)`);

// Test 3: CSS values should NOT be sanitized
const html3 = `<style>.x { width: 100%; }</style>`;
const r3 = sanitizeUnsourcedNumbers(html3);
console.log('Test 3 (CSS):', r3.sanitized === 0 ? '✅ PASS' : '❌ FAIL', `(${r3.sanitized} sanitized)`);

// Test 4: Year should NOT be sanitized
const html4 = `<p>In 2024, something happened.</p>`;
const r4 = sanitizeUnsourcedNumbers(html4);
console.log('Test 4 (year):', r4.sanitized === 0 ? '✅ PASS' : '❌ FAIL', `(${r4.sanitized} sanitized)`);

// Test 5: Number in URL should NOT be sanitized
const html5 = `<p>See <a href="https://doi.org/10.1234/2024">link</a></p>`;
const r5 = sanitizeUnsourcedNumbers(html5);
console.log('Test 5 (URL):', r5.sanitized === 0 ? '✅ PASS' : '❌ FAIL', `(${r5.sanitized} sanitized)`);

// Test 6: Number in Sources section should NOT be sanitized
const html6 = `<h2>Sources</h2><span class="apa-ref" id="ref-1"><span class="ref-num">[1]</span> (2024). <em>Title</em>. 2000 pages.</span>`;
const r6 = sanitizeUnsourcedNumbers(html6);
console.log('Test 6 (Sources section):', r6.sanitized === 0 ? '✅ PASS' : '❌ FAIL', `(${r6.sanitized} sanitized)`);

// Test 7: "billion" should NOT be sanitized (part of word)
const html7 = `<p>The cost was 2 billion dollars.</p>`;
const r7 = sanitizeUnsourcedNumbers(html7);
console.log('Test 7 (billion):', r7.sanitized === 0 ? '✅ PASS' : '❌ FAIL', `(${r7.sanitized} sanitized)`);

// Test 8: Large number with <sup> after it
const html8 = `<p>The study found that 7800 attacks occurred<sup class="cite"><a href="#ref-16" data-evidence="E16">E16</a></sup>.</p>`;
const r8 = sanitizeUnsourcedNumbers(html8);
console.log('Test 8 (large num + <sup>):', r8.sanitized === 0 ? '✅ PASS' : '❌ FAIL', `(${r8.sanitized} sanitized)`);

console.log('\n=== All tests done ===');
