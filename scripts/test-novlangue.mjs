/**
 * Quick novlangue detector test — no Jest, no Next.js config, just Node.
 * Run: node scripts/test-novlangue.mjs
 */
import { detectNovlangue } from '../lib/agent/novlangue-detector.ts';

let passed = 0;
let failed = 0;

function assert(name, condition) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}`);
  }
}

console.log('\n=== Novlangue Detector Tests ===\n');

// Test 1: Clean text
{
  const result = detectNovlangue("<p>The government killed civilians during the military operation.</p>");
  assert("clean text has 0 matches", result.count === 0);
  assert("clean text is clean", result.clean === true);
}

// Test 2: Collateral damage
{
  const result = detectNovlangue("<p>The strike caused significant collateral damage in the area.</p>");
  assert("'collateral damage' detected", result.count === 1);
  assert("term is 'collateral damage'", result.matches[0].term.toLowerCase() === "collateral damage");
  assert("trueName is 'civilian deaths'", result.matches[0].trueName === "civilian deaths");
}

// Test 3: Optimization
{
  const result = detectNovlangue("<p>The company announced an optimization plan affecting 500 workers.</p>");
  assert("'optimization' detected", result.count === 1);
  assert("category is euphemism", result.matches[0].category === "euphemism");
}

// Test 4: Bureaucratic passive
{
  const result = detectNovlangue("<p>Mistakes were made during the implementation phase.</p>");
  assert("'mistakes were made' detected", result.count === 1);
  assert("category is bureaucratic", result.matches[0].category === "bureaucratic");
}

// Test 5: Multiple patterns
{
  const html = `<p>The company announced an optimization plan. Mistakes were made during
    the restructuring. The government described the bombing as a precision strike
    that caused collateral damage. Enhanced interrogation techniques were used.</p>`;
  const result = detectNovlangue(html);
  assert("multiple patterns detected (>=5)", result.count >= 5);
  assert("density > 0", result.density > 0);
}

// Test 6: Case insensitive
{
  const result = detectNovlangue("<p>COLLATERAL DAMAGE was reported. The OPTIMIZATION began.</p>");
  assert("case insensitive matching", result.count === 2);
}

// Test 7: Word boundary (no partial match)
{
  const result = detectNovlangue("<p>The reformation of the church was historical.</p>");
  assert("no partial match on 'reformation'", result.clean === true);
}

// Test 8: HTML stripping
{
  const result = detectNovlangue("<div><span>Reform</span><p>The reform was announced.</p></div>");
  assert("HTML tags stripped", result.count >= 1);
  assert("term is 'reform'", result.matches[0].term.toLowerCase() === "reform");
}

// Test 9: Context provided
{
  const result = detectNovlangue("<p>The military operation resulted in significant collateral damage to infrastructure.</p>");
  assert("context contains match", result.matches[0].context.includes("collateral damage"));
  assert("context has length > 20", result.matches[0].context.length > 20);
}

// Test 10: Empty string
{
  const result = detectNovlangue("");
  assert("empty string is clean", result.clean === true);
  assert("empty string has 0 count", result.count === 0);
}

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
process.exit(failed > 0 ? 1 : 0);
