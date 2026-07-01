/**
 * Shared JSON utilities — robust parsing for LLM outputs.
 *
 * LLMs (especially GLM, DeepSeek) frequently wrap JSON in markdown fences
 * (```json ... ```), truncate long outputs, or append trailing text.
 * These utilities handle all those cases gracefully.
 */

/**
 * Strip markdown code fences (```json ... ``` or ``` ... ```) from a string.
 * Also trims whitespace and BOM.
 */
export function stripJsonMarkdownFences(raw: string): string {
  let s = raw.trim();

  // Remove BOM
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);

  // Remove leading ```json or ``` and trailing ```
  // Handle both ```json\n{...}\n``` and ```\n{...}\n```
  const fenceOpen = /^```(?:json|JSON)?\s*\n?/;
  const fenceClose = /\n?```\s*$/;

  s = s.replace(fenceOpen, '').replace(fenceClose, '');

  // Some LLMs add prose before/after the JSON block
  // Find the first { and last } to extract the JSON envelope
  const firstBrace = s.indexOf('{');
  const lastBrace = s.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    s = s.slice(firstBrace, lastBrace + 1);
  }

  return s.trim();
}

/**
 * Attempt to repair common JSON truncation issues:
 * - Unclosed strings (add closing quote)
 * - Unclosed arrays/objects (add closing brackets)
 * - Trailing commas
 */
export function repairTruncatedJson(raw: string): string {
  let s = raw.trim();

  // Remove trailing commas before closing brackets
  s = s.replace(/,\s*([}\]])/g, '$1');

  // Count unclosed braces/brackets
  let openBraces = 0;
  let openBrackets = 0;
  let inString = false;
  let escape = false;

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === '\\') {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === '{') openBraces++;
    else if (ch === '}') openBraces--;
    else if (ch === '[') openBrackets++;
    else if (ch === ']') openBrackets--;
  }

  // If we're inside a string, close it
  if (inString) {
    s += '"';
  }

  // Close unclosed brackets/braces
  while (openBrackets > 0) {
    s += ']';
    openBrackets--;
  }
  while (openBraces > 0) {
    s += '}';
    openBraces--;
  }

  return s;
}

/**
 * Tolerant JSON parse — tries multiple strategies before giving up.
 *
 * Strategy order:
 * 1. Direct parse (fast path for clean JSON)
 * 2. Strip markdown fences + parse
 * 3. Extract first {...} block + parse
 * 4. Repair truncation + parse
 * 5. Return null (caller handles fallback)
 */
export function parseJson<T = unknown>(raw: string): T | null {
  if (!raw || typeof raw !== 'string') return null;

  // Strategy 1: Direct parse
  try {
    return JSON.parse(raw) as T;
  } catch {
    // continue
  }

  // Strategy 2: Strip markdown fences
  try {
    const cleaned = stripJsonMarkdownFences(raw);
    if (cleaned !== raw.trim()) {
      return JSON.parse(cleaned) as T;
    }
  } catch {
    // continue
  }

  // Strategy 3: Extract first {...} block
  try {
    const cleaned = stripJsonMarkdownFences(raw);
    const first = cleaned.indexOf('{');
    const last = cleaned.lastIndexOf('}');
    if (first !== -1 && last !== -1 && last > first) {
      const block = cleaned.slice(first, last + 1);
      return JSON.parse(block) as T;
    }
  } catch {
    // continue
  }

  // Strategy 4: Repair truncation
  try {
    const cleaned = stripJsonMarkdownFences(raw);
    const repaired = repairTruncatedJson(cleaned);
    if (repaired !== cleaned) {
      return JSON.parse(repaired) as T;
    }
  } catch {
    // continue
  }

  // Strategy 5: Give up
  return null;
}

/**
 * Parse JSON or throw — for cases where you want try/catch in the caller.
 * Uses the same tolerant parsing as parseJson but throws on total failure.
 */
export function parseJsonOrThrow<T = unknown>(raw: string): T {
  const result = parseJson<T>(raw);
  if (result === null) {
    throw new SyntaxError(`Failed to parse JSON from LLM output (length=${raw.length}, preview=${raw.slice(0, 200)})`);
  }
  return result;
}
