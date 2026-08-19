/**
 * Output Guardrails — NomosX Sprint 6 (Gap 15)
 *
 * Validation structurée des outputs des LLM (Guardrails AI style).
 * Inspire de :
 * - Guardrails AI (guardrails-ai/guardrails) — structured output validation
 * - NeMo Guardrails (NVIDIA) — policy-based evaluation
 * - GRETEL (2024) — execution-grounded validation
 *
 * Le problème :
 * Le WriteGuard protège les *interventions du Witness*, mais il n'y a pas de
 * validation systématique des *outputs des LLMs* (format, PII, claims sourcées).
 *
 * Architecture :
 * 1. Schema validation — JSON structure, fields required
 * 2. Policy validation — citations, no PII, no self-contradiction
 * 3. Format validation — HTML, markdown, citation tags well-formed
 * 4. Repair — suggest fixes, optionally retry with feedback
 *
 * Intégration : appelé après l'ANALYST avant l'EDITOR.
 */

import { parseJson } from './json-utils';

// ─── Types ──────────────────────────────────────────────────────────────────

export type GuardOutcome = 'pass' | 'fail' | 'warning' | 'repair';

export interface GuardViolation {
  /** Type of violation */
  type: 'missing_field' | 'invalid_format' | 'uncited_claim' | 'pii_detected' | 'unsafe_statement' | 'self_contradiction' | 'citation_out_of_range' | 'unsupported_confidence';
  /** Description of the issue */
  description: string;
  /** Where in the output it was found */
  location?: string;
  /** The text that triggered the violation */
  snippet?: string;
  /** Suggested fix */
  suggestedFix?: string;
  /** Severity */
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export interface OutputGuardResult {
  /** Overall outcome */
  outcome: GuardOutcome;
  /** Violations found */
  violations: GuardViolation[];
  /** Number of critical violations */
  criticalCount: number;
  /** Repaired output (if repair was successful) */
  repairedOutput?: string;
  /** Score 0-100 */
  score: number;
}

export interface OutputGuardConfig {
  /** Require [SRC-N] citations for factual claims */
  requireCitations: boolean;
  /** Require all [SRC-N] to be within the source count */
  validateCitationRanges: boolean;
  /** Number of available sources */
  sourceCount: number;
  /** Check for PII patterns */
  checkPII: boolean;
  /** Check for unsafe/harmful statements */
  checkSafety: boolean;
  /** Max allowed PII (0 = none) */
  maxPiiCount: number;
  /** Confidence range allowed for claims (default: "cautious") */
  confidenceMode: 'cautious' | 'moderate' | 'bold';
  /** Required output format */
  requiredFormat: 'json' | 'html' | 'markdown' | 'any';
}

export const DEFAULT_OUTPUT_GUARD_CONFIG: OutputGuardConfig = {
  requireCitations: true,
  validateCitationRanges: true,
  sourceCount: 12,
  checkPII: true,
  checkSafety: true,
  maxPiiCount: 0,
  confidenceMode: 'cautious',
  requiredFormat: 'json',
};

// ─── Citation Regexes ───────────────────────────────────────────────────────

const CITATION_PATTERN = /\[SRC-(\d+)\]/g;
const CLAIM_PATTERN = /([A-Z][^.!?]*(?:\d{4}|\d+%?|increase|decrease|significant|cause|leads?|reduces?|improve)[^.!?]*[.!?])/g;
const PII_PATTERNS = [
  /\b\d{3}-\d{2}-\d{4}\b/g, // SSN
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, // email
  /\b\d{3}-\d{3}-\d{4}\b/g, // phone
];
const UNSAFE_PATTERNS = [
  /\b(how to (make|build|create) (a? ?bomb|poison|weapon|drug))\b/i,
  /\b(kill|harm|attack) (someone|yourself|myself|himself|herself)\b/i,
];

// ─── JSON Schema Validation ─────────────────────────────────────────────────

/**
 * Validate that a string is parseable JSON (if required format is json).
 */
function validateJson(output: string, config: OutputGuardConfig): GuardViolation[] {
  if (config.requiredFormat !== 'json') return [];

  const violations: GuardViolation[] = [];
  const parsed = parseJson(output);

  if (parsed === null) {
    violations.push({
      type: 'invalid_format',
      description: 'Output is not valid JSON',
      severity: 'high',
    });
    return violations;
  }

  // Check for missing critical fields
  const requiredFields = ['summary', 'claims', 'citations', 'conclusion'];
  const missing = requiredFields.filter(f => !(parsed as any)[f]);
  for (const field of missing) {
    violations.push({
      type: 'missing_field',
      description: `Missing required field: ${field}`,
      location: field,
      severity: 'medium',
    });
  }

  return violations;
}

// ─── Citation Validation ────────────────────────────────────────────────────

/**
 * Validate that all [SRC-N] citations are within range and that factual claims have citations.
 */
function validateCitations(output: string, config: OutputGuardConfig): GuardViolation[] {
  const violations: GuardViolation[] = [];
  const citations = Array.from(output.matchAll(CITATION_PATTERN));
  const sourceNumbers = new Set(citations.map(m => parseInt(m[1], 10)));

  if (config.requireCitations) {
    // Extract sentences that look like claims but don't have citations
    const sentences = output.match(/[^.!?]+[.!?]+/g) || [];
    for (const sentence of sentences) {
      if (CLAIM_PATTERN.test(sentence) && !CITATION_PATTERN.test(sentence)) {
        violations.push({
          type: 'uncited_claim',
          description: 'Factual claim without [SRC-N] citation',
          snippet: sentence.slice(0, 150),
          location: 'body',
          severity: 'medium',
          suggestedFix: 'Add a [SRC-N] citation or hedge the claim.',
        });
      }
    }
  }

  if (config.validateCitationRanges) {
    for (const n of sourceNumbers) {
      if (n < 1 || n > config.sourceCount) {
        violations.push({
          type: 'citation_out_of_range',
          description: `Citation [SRC-${n}] is out of range (1-${config.sourceCount})`,
          snippet: `[SRC-${n}]`,
          severity: 'high',
          suggestedFix: `Use a valid source index between 1 and ${config.sourceCount}.`,
        });
      }
    }
  }

  return violations;
}

// ─── PII Detection ──────────────────────────────────────────────────────────

function validatePII(output: string, config: OutputGuardConfig): GuardViolation[] {
  const violations: GuardViolation[] = [];
  if (!config.checkPII) return violations;

  let piiCount = 0;
  for (const pattern of PII_PATTERNS) {
    const matches = output.match(pattern) || [];
    piiCount += matches.length;
    for (const match of matches) {
      violations.push({
        type: 'pii_detected',
        description: 'Potential PII detected',
        snippet: match,
        severity: 'critical',
        suggestedFix: 'Remove PII or replace with placeholder.',
      });
    }
  }

  return violations;
}

// ─── Safety Check ───────────────────────────────────────────────────────────

function validateSafety(output: string, config: OutputGuardConfig): GuardViolation[] {
  const violations: GuardViolation[] = [];
  if (!config.checkSafety) return violations;

  for (const pattern of UNSAFE_PATTERNS) {
    if (pattern.test(output)) {
      violations.push({
        type: 'unsafe_statement',
        description: 'Potentially unsafe statement detected',
        severity: 'critical',
        suggestedFix: 'Remove or rephrase to be informational/defensive only.',
      });
    }
  }

  return violations;
}

// ─── Confidence Calibration ─────────────────────────────────────────────────

/**
 * Check that the output's confidence language is appropriate for the config.
 */
function validateConfidence(output: string, config: OutputGuardConfig): GuardViolation[] {
  const violations: GuardViolation[] = [];

  if (config.confidenceMode === 'cautious') {
    // In cautious mode, flag strong causal claims without hedging
    const strongClaims = output.match(/\b(definitely|certainly|always|proves?|undeniably|without doubt)\b/gi) || [];
    for (const word of strongClaims) {
      violations.push({
        type: 'unsupported_confidence',
        description: `Overconfident language in cautious mode: "${word}"`,
        snippet: word,
        severity: 'medium',
        suggestedFix: 'Use hedging language ("suggests", "may", "is associated with").',
      });
    }
  }

  return violations;
}

// ─── Main Guard Function ────────────────────────────────────────────────────

/**
 * Validate an LLM output against configured guardrails.
 *
 * @param output - The output to validate
 * @param config - Guard configuration
 * @returns The validation result
 */
export function guardOutput(
  output: string,
  config: OutputGuardConfig = DEFAULT_OUTPUT_GUARD_CONFIG,
): OutputGuardResult {
  const violations: GuardViolation[] = [];

  violations.push(...validateJson(output, config));
  violations.push(...validateCitations(output, config));
  violations.push(...validatePII(output, config));
  violations.push(...validateSafety(output, config));
  violations.push(...validateConfidence(output, config));

  const criticalCount = violations.filter(v => v.severity === 'critical').length;
  const highCount = violations.filter(v => v.severity === 'high').length;
  const mediumCount = violations.filter(v => v.severity === 'medium').length;

  let outcome: GuardOutcome;
  if (criticalCount > 0) {
    outcome = 'fail';
  } else if (highCount > 0) {
    outcome = 'repair';
  } else if (mediumCount > 0) {
    outcome = 'warning';
  } else {
    outcome = 'pass';
  }

  // Score: 100 minus penalties
  const score = Math.max(0, 100 - criticalCount * 30 - highCount * 15 - mediumCount * 5);

  return {
    outcome,
    violations,
    criticalCount,
    score,
  };
}

// ─── Build repair feedback ──────────────────────────────────────────────────

/**
 * Build a repair instruction string from guard violations.
 * This can be appended to the prompt for a retry.
 */
export function buildRepairFeedback(result: OutputGuardResult): string {
  if (result.outcome === 'pass') return '';

  const critical = result.violations.filter(v => v.severity === 'critical');
  const high = result.violations.filter(v => v.severity === 'high');
  const medium = result.violations.filter(v => v.severity === 'medium');

  const lines: string[] = ['\n=== OUTPUT GUARDRAIL FEEDBACK ==='];

  for (const v of [...critical, ...high, ...medium].slice(0, 10)) {
    lines.push(`[${v.severity.toUpperCase()}] ${v.type}: ${v.description}`);
    if (v.snippet) lines.push(`  Snippet: "${v.snippet.slice(0, 100)}"`);
    if (v.suggestedFix) lines.push(`  Fix: ${v.suggestedFix}`);
  }

  lines.push('Please fix these issues before returning your final answer.');
  lines.push('=== END OUTPUT GUARDRAILS ===');

  return lines.join('\n');
}
