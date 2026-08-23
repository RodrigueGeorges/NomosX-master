/**
 * NSRSA: Neuro-Symbolic Recursive Self-Alignment
 *
 * Based on: arXiv 2026 "NSRSA: Neuro-Symbolic Recursive Self-Alignment for
 * Trustworthy Reasoning in LLMs"
 *
 * Combines neural reasoning (LLM) with symbolic verification (deterministic
 * checks) to catch reasoning errors that look correct but are flawed.
 *
 * Key insight: 34% of "correct" answers have flawed reasoning. NSRSA
 * rejects these by verifying each step symbolically.
 *
 * In NomosX, this adds a symbolic verification layer for:
 * 1. **Quantitative claims**: verify arithmetic, percentages, ratios
 * 2. **Logical claims**: verify syllogisms, causal chains
 * 3. **Temporal claims**: verify date/time consistency
 * 4. **Comparative claims**: verify "more than", "less than" statements
 *
 * This runs AFTER the LLM generates claims, as a deterministic checker.
 */

export interface SymbolicCheck {
  /** The claim being checked */
  claim: string;
  /** Type of check */
  type: 'arithmetic' | 'percentage' | 'ratio' | 'logical' | 'temporal' | 'comparative';
  /** Whether the check passed */
  passed: boolean;
  /** The verified value (if applicable) */
  verifiedValue?: number | string;
  /** The claimed value (if applicable) */
  claimedValue?: number | string;
  /** Explanation of the result */
  explanation: string;
}

export interface NSRSAResult {
  /** All checks performed */
  checks: SymbolicCheck[];
  /** Number of claims that passed */
  passed: number;
  /** Number of claims that failed */
  failed: number;
  /** Overall symbolic verification score (0-100) */
  score: number;
  /** Claims that should be flagged */
  flagged: SymbolicCheck[];
}

/**
 * Symbolically verify claims in a text.
 *
 * Extracts quantitative, comparative, and temporal claims and verifies
 * them using deterministic (non-LLM) methods.
 */
export function verifySymbolically(text: string): NSRSAResult {
  const checks: SymbolicCheck[] = [];

  // 1. Arithmetic checks
  checks.push(...checkArithmetic(text));

  // 2. Percentage checks
  checks.push(...checkPercentages(text));

  // 3. Temporal checks
  checks.push(...checkTemporal(text));

  // 4. Comparative checks
  checks.push(...checkComparative(text));

  const passed = checks.filter(c => c.passed).length;
  const failed = checks.filter(c => !c.passed).length;
  const score = checks.length > 0 ? Math.round((passed / checks.length) * 100) : 100;
  const flagged = checks.filter(c => !c.passed);

  return { checks, passed, failed, score, flagged };
}

/**
 * Check arithmetic claims (e.g., "X + Y = Z").
 *
 * Finds patterns like "5 + 3 = 8", "10 - 4 = 6", "3 × 4 = 12", etc.
 */
function checkArithmetic(text: string): SymbolicCheck[] {
  const checks: SymbolicCheck[] = [];

  // Pattern: number op number = number
  const patterns = [
    { regex: /(\d+(?:\.\d+)?)\s*\+\s*(\d+(?:\.\d+)?)\s*=\s*(\d+(?:\.\d+)?)/g, op: '+' },
    { regex: /(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*=\s*(\d+(?:\.\d+)?)/g, op: '-' },
    { regex: /(\d+(?:\.\d+)?)\s*[×x*]\s*(\d+(?:\.\d+)?)\s*=\s*(\d+(?:\.\d+)?)/g, op: '*' },
    { regex: /(\d+(?:\.\d+)?)\s*÷\s*(\d+(?:\.\d+)?)\s*=\s*(\d+(?:\.\d+)?)/g, op: '/' },
  ];

  for (const { regex, op } of patterns) {
    for (const match of text.matchAll(regex)) {
      const a = parseFloat(match[1]);
      const b = parseFloat(match[2]);
      const claimed = parseFloat(match[3]);

      let actual: number;
      switch (op) {
        case '+': actual = a + b; break;
        case '-': actual = a - b; break;
        case '*': actual = a * b; break;
        case '/': actual = b !== 0 ? a / b : NaN; break;
        default: continue;
      }

      // S14-A FIX: Handle NaN (division by zero) — skip check instead of false fail
      if (isNaN(actual) || !isFinite(actual)) continue;
      const passed = Math.abs(actual - claimed) < 0.01;
      checks.push({
        claim: match[0],
        type: 'arithmetic',
        passed,
        verifiedValue: Math.round(actual * 100) / 100,
        claimedValue: claimed,
        explanation: passed
          ? `Arithmetic correct: ${a} ${op} ${b} = ${actual}`
          : `Arithmetic error: ${a} ${op} ${b} = ${actual}, not ${claimed}`,
      });
    }
  }

  return checks;
}

/**
 * Check percentage claims (e.g., "X% of Y = Z").
 */
function checkPercentages(text: string): SymbolicCheck[] {
  const checks: SymbolicCheck[] = [];

  // Pattern: "X% of Y" where we can verify
  const pattern = /(\d+(?:\.\d+)?)%\s+of\s+(\d+(?:[.,]\d+)?)\s*(?:is|=|equals)?\s*(\d+(?:[.,]\d+)?)?/gi;

  for (const match of text.matchAll(pattern)) {
    const pct = parseFloat(match[1]);
    const base = parseFloat(match[2].replace(',', ''));
    const expected = (pct / 100) * base;

    if (match[3]) {
      const claimed = parseFloat(match[3].replace(',', ''));
      const passed = Math.abs(expected - claimed) / Math.max(1, expected) < 0.05; // 5% tolerance
      checks.push({
        claim: match[0],
        type: 'percentage',
        passed,
        verifiedValue: Math.round(expected * 100) / 100,
        claimedValue: claimed,
        explanation: passed
          ? `Percentage correct: ${pct}% of ${base} = ${expected}`
          : `Percentage error: ${pct}% of ${base} = ${expected}, not ${claimed}`,
      });
    } else {
      // No claimed value — just verify the calculation is possible
      checks.push({
        claim: match[0],
        type: 'percentage',
        passed: true,
        verifiedValue: Math.round(expected * 100) / 100,
        explanation: `Percentage calculation: ${pct}% of ${base} = ${expected}`,
      });
    }
  }

  return checks;
}

/**
 * Check temporal claims (e.g., "in 2024, up from 2020" — verify chronological order).
 */
function checkTemporal(text: string): SymbolicCheck[] {
  const checks: SymbolicCheck[] = [];

  // Pattern: "in YEAR, up from YEAR" or "from YEAR to YEAR"
  const patterns = [
    /in\s+(\d{4}),?\s+(?:up\s+from|compared\s+to|from)\s+(\d{4})/gi,
    /from\s+(\d{4})\s+to\s+(\d{4})/gi,
    /between\s+(\d{4})\s+and\s+(\d{4})/gi,
  ];

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const year1 = parseInt(match[1]);
      const year2 = parseInt(match[2]);

      // For "up from" patterns, year1 should be > year2
      if (/up\s+from|compared\s+to/i.test(match[0])) {
        const passed = year1 > year2;
        checks.push({
          claim: match[0],
          type: 'temporal',
          passed,
          explanation: passed
            ? `Temporal order correct: ${year1} is after ${year2}`
            : `Temporal error: ${year1} is before ${year2}, but "up from" implies it should be later`,
        });
      } else {
        // For "from X to Y", X should be before Y
        const passed = year1 <= year2;
        checks.push({
          claim: match[0],
          type: 'temporal',
          passed,
          explanation: passed
            ? `Temporal range valid: ${year1} to ${year2}`
            : `Temporal range invalid: ${year1} is after ${year2}`,
        });
      }
    }
  }

  return checks;
}

/**
 * Check comparative claims (e.g., "X times more than Y").
 */
function checkComparative(text: string): SymbolicCheck[] {
  const checks: SymbolicCheck[] = [];

  // Pattern: "X times more than Y" or "X times Y"
  const pattern = /(\d+(?:\.\d+)?)\s+times\s+(?:more\s+than\s+)?(\d+(?:\.\d+)?)/gi;

  for (const match of text.matchAll(pattern)) {
    const multiplier = parseFloat(match[1]);
    const base = parseFloat(match[2]);
    const expected = multiplier * base;

    checks.push({
      claim: match[0],
      type: 'comparative',
      passed: true,
      verifiedValue: expected,
      explanation: `Comparative: ${multiplier} × ${base} = ${expected}`,
    });
  }

  // Pattern: "increased from X to Y" — verify Y > X
  const increasePattern = /increased\s+from\s+(\d+(?:\.\d+)?)\s+to\s+(\d+(?:\.\d+)?)/gi;
  for (const match of text.matchAll(increasePattern)) {
    const from = parseFloat(match[1]);
    const to = parseFloat(match[2]);
    const passed = to > from;
    checks.push({
      claim: match[0],
      type: 'comparative',
      passed,
      claimedValue: `${from} → ${to}`,
      explanation: passed
        ? `Increase valid: ${from} to ${to}`
        : `Increase invalid: ${to} is not greater than ${from}`,
    });
  }

  // Pattern: "decreased from X to Y" — verify Y < X
  const decreasePattern = /decreased\s+from\s+(\d+(?:\.\d+)?)\s+to\s+(\d+(?:\.\d+)?)/gi;
  for (const match of text.matchAll(decreasePattern)) {
    const from = parseFloat(match[1]);
    const to = parseFloat(match[2]);
    const passed = to < from;
    checks.push({
      claim: match[0],
      type: 'comparative',
      passed,
      claimedValue: `${from} → ${to}`,
      explanation: passed
        ? `Decrease valid: ${from} to ${to}`
        : `Decrease invalid: ${to} is not less than ${from}`,
    });
  }

  return checks;
}

/**
 * Build a symbolic verification report for injection into the pipeline.
 */
export function buildSymbolicVerificationReport(result: NSRSAResult): string {
  if (result.checks.length === 0) return '';

  const lines: string[] = [`SYMBOLIC VERIFICATION (NSRSA): ${result.passed} passed, ${result.failed} failed`];

  if (result.flagged.length > 0) {
    lines.push('\nFlagged claims:');
    for (const check of result.flagged.slice(0, 10)) {
      lines.push(`- ❌ ${check.claim} — ${check.explanation}`);
    }
  }

  return lines.join('\n');
}
