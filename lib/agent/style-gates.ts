/**
 * NomosX STYLE GATES — Regex-based quality enforcement
 *
 * LOT 5.1: Enforce editorial voice standards on generated HTML.
 * Each gate returns a violation list — the pipeline can use these
 * to trigger auto-revision or flag for human review.
 *
 * Gates:
 * - G1: No "delves into" / "sheds light" / "navigates" / "underscores"
 * - G2: No "it is worth noting" / "it should be noted" / "importantly"
 * - G3: No "in today's world" / "in the modern era" / "in the 21st century"
 * - G4: No "plays a crucial role" / "plays a vital role" / "plays a key role"
 * - G5: No "a testament to" / "a beacon of" / "a harbinger of"
 * - G6: No "tapestry" / "landscape" (overused metaphors)
 * - G7: No "myriad" / "plethora" / "cornucopia"
 * - G8: No "unprecedented" without [SRC-N] citation within 50 chars
 * - G9: No "revolutionary" / "groundbreaking" / "game-changing" without [SRC-N]
 * - G10: No "experts say" / "researchers believe" without [SRC-N]
 */

export interface StyleViolation {
  gate: string;
  pattern: string;
  match: string;
  position: number;
  suggestion: string;
}

// ============================================================================
// GATE DEFINITIONS
// ============================================================================

interface GateDef {
  id: string;
  pattern: RegExp;
  suggestion: string;
  requiresCitation?: boolean;  // If true, check for [SRC-N] within 50 chars
}

const GATES: GateDef[] = [
  {
    id: 'G1',
    pattern: /\b(delves into|sheds light on|navigates the|underscores the)\b/gi,
    suggestion: 'Replace with precise verb (e.g., "analyzes", "reveals", "examines")',
  },
  {
    id: 'G2',
    pattern: /\b(it is worth noting|it should be noted|importantly,|notably,)\b/gi,
    suggestion: 'Remove filler phrase — state the point directly',
  },
  {
    id: 'G3',
    pattern: /\b(in today's world|in the modern era|in the 21st century)\b/gi,
    suggestion: 'Remove cliché temporal framing',
  },
  {
    id: 'G4',
    pattern: /\b(plays a (crucial|vital|key|pivotal|critical) role)\b/gi,
    suggestion: 'Specify what the role IS, not that it "plays a role"',
  },
  {
    id: 'G5',
    pattern: /\b(a testament to|a beacon of|a harbinger of)\b/gi,
    suggestion: 'Replace metaphor with concrete statement',
  },
  {
    id: 'G6',
    pattern: /\b(tapestry|landscape of)\b/gi,
    suggestion: 'Replace overused metaphor with precise term',
  },
  {
    id: 'G7',
    pattern: /\b(myriad|plethora|cornucopia)\b/gi,
    suggestion: 'Use "many", "numerous", or specify the count',
  },
  {
    id: 'G8',
    pattern: /\b(unprecedented)\b/gi,
    suggestion: 'Cite source or use "rare" / "uncommon" with evidence',
    requiresCitation: true,
  },
  {
    id: 'G9',
    pattern: /\b(revolutionary|groundbreaking|game-changing|paradigm-shifting)\b/gi,
    suggestion: 'Cite source or use measured language ("novel", "significant")',
    requiresCitation: true,
  },
  {
    id: 'G10',
    pattern: /\b(experts say|researchers believe|scientists argue)\b/gi,
    suggestion: 'Cite specific source with [SRC-N]',
    requiresCitation: true,
  },
];

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

export function runStyleGates(html: string): { violations: StyleViolation[]; passed: boolean } {
  const violations: StyleViolation[] = [];

  // Strip HTML tags for text analysis
  const text = html.replace(/<[^>]+>/g, ' ');

  for (const gate of GATES) {
    const matches = text.matchAll(gate.pattern);
    for (const match of matches) {
      const matchStr = match[0];
      const pos = match.index ?? 0;

      if (gate.requiresCitation) {
        // Check for [SRC-N] within 50 chars after the match
        const context = text.slice(pos, pos + matchStr.length + 50);
        if (/\[SRC-\d+\]/.test(context)) {
          continue; // Citation present — no violation
        }
      }

      violations.push({
        gate: gate.id,
        pattern: gate.pattern.source,
        match: matchStr,
        position: pos,
        suggestion: gate.suggestion,
      });
    }
  }

  return {
    violations,
    passed: violations.length === 0,
  };
}

// ============================================================================
// LOT 5.7: Numerical gate — every number must have a source
// ============================================================================

export function runNumericalGate(html: string, sourceCount: number): { violations: StyleViolation[]; passed: boolean } {
  const violations: StyleViolation[] = [];

  // Convert <sup class="cite"> tags to [SRC-N] markers BEFORE stripping HTML tags,
  // so that citations are preserved as text markers for the gate to find.
  let normalized = html.replace(
    /<sup class="cite"><a href="#ref-(\d+)"[^>]*>[^<]*<\/a><\/sup>/g,
    ' [SRC-$1] '
  );
  // Also convert standalone <a href="#ref-N"> to [SRC-N]
  normalized = normalized.replace(/<a href="#ref-(\d+)"[^>]*>[^<]*<\/a>/g, ' [SRC-$1] ');

  // Remove <style>/<script> blocks entirely (CSS values are not statistics)
  normalized = normalized.replace(/<(style|script)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ');

  const text = normalized.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

  // Find all numbers that look like statistics (percentages, decimals, large numbers)
  const statPattern = /(\d+\.?\d*\s*%|\b\d+\.\d{2,}\b|\b[1-9]\d{3,}\b)/g;
  const matches = text.matchAll(statPattern);

  for (const match of matches) {
    const matchStr = match[0];
    const pos = match.index ?? 0;

    // Skip years (1900-2099)
    if (/^\b(19\d{2}|20\d{2})\b$/.test(matchStr)) continue;

    // Check for [SRC-N] or [E-N] within 100 chars after AND before the number
    const after = text.slice(pos, pos + matchStr.length + 100);
    const before = text.slice(Math.max(0, pos - 100), pos);
    if (!/\[(?:SRC|E)-\d+\]/.test(after) && !/\[(?:SRC|E)-\d+\]/.test(before)) {
      violations.push({
        gate: 'NUM',
        pattern: statPattern.source,
        match: matchStr,
        position: pos,
        suggestion: `Number "${matchStr}" lacks a [SRC-N] citation within 100 chars — add source or remove`,
      });
    }
  }

  return {
    violations,
    passed: violations.length === 0,
  };
}
