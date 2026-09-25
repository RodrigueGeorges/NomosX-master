/**
 * REVISION CONTROLLER — NomosX
 *
 * The collective-intelligence loop the pipeline was missing: when the
 * publication gate returns `revise` or `hold`, its failures are posted as
 * typed signals onto a SignalBus, and registered resolvers resolve them —
 * ordered by the bus's goal-directed priority (signals serving unmet mission
 * targets first), not by a hardcoded ladder.
 *
 * Resolvers (registered here, but the pattern is open — any new signal type
 * works if a resolver exists):
 *   scenario_invalid  — deterministic re-render from the persisted decision
 *   citation_gap      — deterministic citation backfill
 *   substance_weak    — revision-editor surgical edits (DA objections, kill
 *                       shot, weak panel findings) — batch, one LLM call
 *   style_violation   — copy editor — batch, one LLM call
 *
 * Integrity guards after the sweep: citation count must not regress, the
 * central-scenario block must still parse complete, and total length must not
 * collapse. Any regression reverts ALL repairs — the gate is never weakened,
 * only the artifact is fixed.
 */

import { parseEditorialInquiry } from '../brand/inquiry-html-parse';
import { renderCentralScenarioBlock, type CentralScenarioLabels } from './position-first-renderer';
import { repairCitations } from './citation-repair';
import { runStyleGates } from './style-gates';
import { copyEditHtml } from './copy-editor';
import { reviseForFindings } from './revision-editor';
import { SignalBus, type AgentSignal, type Mission } from './signals';
import type { PublicationGateResult } from './publication-gate';
import type { CentralScenarioDecision } from './editorial-types';

export interface RevisionInput {
  html: string;
  gate: PublicationGateResult;
  centralScenario?: CentralScenarioDecision;
  requireCentralScenario?: boolean;
  sourceCount: number;
  analysis?: Record<string, unknown>;
  sources?: { title: string; authors?: { author?: { name?: string } }[]; provider?: string }[];
  devilsAdvocate?: {
    publishabilityScore?: number;
    fatalChallenges?: number;
    topChallenges?: { type: string; text: string }[];
    killShot?: string;
  };
  criticPanel?: { dimensions?: { dimension: string; score: number; findings: string[]; mustFix: boolean }[] };
  budgetConstrained?: boolean;
}

export interface RevisionResult {
  html: string;
  changed: boolean;
  actions: string[];
  costUsd: number;
}

const CENTRAL_BLOCK_RE = /<section\b[^>]*class="[^"]*\bcentral-scenario\b[^"]*"[^>]*>[\s\S]*?<\/section>/i;

function citationCount(html: string): number {
  return (html.match(/href="#ref-\d+"/g) ?? []).length + (html.match(/\[(?:SRC|E)-\d+\]/g) ?? []).length;
}

function wordCount(html: string): number {
  return html.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
}

/** Detect French output — same heuristic as citation-repair's language check. */
function isFrenchHtml(html: string): boolean {
  const text = html.replace(/<[^>]+>/g, ' ').slice(0, 20000);
  const words = text.match(/\b(le|la|les|des|une|dans|pour|avec|nous|notre|que|qui|est|sont|cette|ces|aux|par|sur|entre|selon)\b/gi) ?? [];
  const total = text.split(/\s+/).filter(Boolean).length;
  return total > 0 && words.length / total > 0.06;
}

/**
 * Recover the section's existing labels so a repaired block keeps the
 * publication's locale and style voice (the parser is label-agnostic, the
 * reader is not).
 */
function extractExistingLabels(block: string): Partial<CentralScenarioLabels> {
  const strip = (s: string) => s.replace(/<[^>]+>/g, '').trim();
  const eyebrow = block.match(/<p class="nx-eyebrow"[^>]*>([\s\S]*?)<\/p>/i)?.[1];
  const horizonPrefix = block.match(/<p>([\s\S]*?)<span class="central-horizon"/i)?.[1];
  const confPrefix = block.match(/<p>([\s\S]*?)<span class="central-confidence"/i)?.[1];
  const h4s = [...block.matchAll(/<h4[^>]*>([\s\S]*?)<\/h4>/gi)].map(m => strip(m[1]));
  const labels: Partial<CentralScenarioLabels> = {};
  if (eyebrow) labels.title = strip(eyebrow);
  if (horizonPrefix) labels.horizon = strip(horizonPrefix).replace(/:\s*$/, '');
  if (confPrefix) labels.confidence = strip(confPrefix).replace(/:\s*$/, '');
  if (h4s[0]) labels.why = h4s[0];
  if (h4s[1]) labels.implications = h4s[1];
  if (h4s[2]) labels.revision = h4s[2];
  return labels;
}

/** Rebuild the central-scenario block verbatim from the persisted decision. */
function repairCentralScenario(
  html: string,
  central: CentralScenarioDecision,
  sourceCount: number,
): { html: string; changed: boolean } {
  const existing = html.match(CENTRAL_BLOCK_RE)?.[0];
  const extracted = existing ? extractExistingLabels(existing) : {};
  const french = isFrenchHtml(html);
  const labels: CentralScenarioLabels | undefined =
    extracted.title && extracted.why && extracted.implications && extracted.revision
      ? {
          title: extracted.title,
          why: extracted.why,
          implications: extracted.implications,
          revision: extracted.revision,
          horizon: extracted.horizon ?? 'Horizon',
          confidence: extracted.confidence ?? (french ? 'Confiance éditoriale' : 'Editorial confidence'),
        }
      : undefined;
  const block = renderCentralScenarioBlock(central, { sourceCount, french, labels });

  let next: string;
  if (existing) {
    next = html.replace(CENTRAL_BLOCK_RE, () => block);
  } else {
    // No block at all — insert before the verdict section, else before </article>, else append.
    const verdictIdx = html.search(/<section\b[^>]*class="[^"]*\bverdict\b/i);
    const articleEnd = html.search(/<\/article>/i);
    if (verdictIdx >= 0) next = html.slice(0, verdictIdx) + block + '\n' + html.slice(verdictIdx);
    else if (articleEnd >= 0) next = html.slice(0, articleEnd) + block + '\n' + html.slice(articleEnd);
    else next = html + '\n' + block;
  }

  // Guard: the repaired block must re-parse complete AND match the decision.
  const rendered = parseEditorialInquiry(next)?.centralScenario;
  const normalize = (t: string) => t.replace(/\[(?:SRC|E)-\d+\]/g, '').replace(/\s+/g, ' ').trim();
  const ok = !!rendered?.name && !!rendered.description && !!rendered.rationale
    && !!rendered.horizon && !!rendered.confidence
    && rendered.implications.length > 0 && rendered.revisionTriggers.length > 0
    && normalize(rendered.name) === normalize(central.name)
    && normalize(rendered.rationale) === normalize(central.rationale);
  return ok ? { html: next, changed: next !== html } : { html, changed: false };
}

interface RevisionCtx {
  html: string;
  input: RevisionInput;
  actions: string[];
  costUsd: number;
}

export async function reviseForGate(input: RevisionInput): Promise<RevisionResult> {
  const ctx: RevisionCtx = { html: input.html, input, actions: [], costUsd: 0 };
  const originalCitations = citationCount(ctx.html);
  const originalWords = wordCount(ctx.html);
  const failed = new Set(input.gate.checks.filter(c => !c.passed).map(c => c.checkType));

  const bus = new SignalBus<RevisionCtx>(ctx);

  // ── Post gate failures as signals ──
  if (failed.has('central_scenario') && input.centralScenario) {
    bus.post('scenario_invalid', 'Central scenario block missing, incomplete, or diverged from persisted decision', {
      postedBy: 'GATE', intensity: 1.0, ttlMs: 30 * 60 * 1000,
    });
  }
  if (failed.has('citation_coverage')) {
    bus.post('citation_gap', 'Citation coverage below gate threshold', {
      postedBy: 'GATE', intensity: 0.8, ttlMs: 30 * 60 * 1000,
    });
  }

  // Substance needs: DA challenges + weak panel findings + quality gate.
  const daScore = input.devilsAdvocate?.publishabilityScore;
  const fatalChallenges = input.devilsAdvocate?.fatalChallenges ?? 0;
  const weakFindings = (input.criticPanel?.dimensions ?? [])
    .filter(d => d.mustFix || d.score <= 4)
    .flatMap(d => d.findings.slice(0, 3).map(f => `[${d.dimension}] ${f}`));
  const substanceNeeded = (daScore !== undefined && daScore < 50)
    || fatalChallenges > 0
    || (failed.has('quality_score') && (input.gate.metrics.qualityScore ?? 100) < 65)
    || weakFindings.length > 0;
  if (substanceNeeded) {
    bus.post('substance_weak', 'Adversarial/editorial objections require content revision', {
      postedBy: 'GATE', intensity: 0.85, ttlMs: 30 * 60 * 1000,
      payload: {
        gateReasons: input.gate.reasons,
        daChallenges: input.devilsAdvocate?.topChallenges,
        killShot: input.devilsAdvocate?.killShot,
        weakFindings,
      },
    });
  }

  // Style violations as signals — copy editor resolves them in one batch.
  const styleCheck = runStyleGates(ctx.html);
  for (const v of styleCheck.violations.slice(0, 10)) {
    bus.post('style_violation', `${v.gate}: "${v.match}" → ${v.suggestion}`, {
      postedBy: 'STYLE_GATES', intensity: 0.4, ttlMs: 30 * 60 * 1000,
      payload: { gate: v.gate, match: v.match, suggestion: v.suggestion },
    });
  }

  // ── Register resolvers ──
  bus.registerResolver('scenario_invalid', (_signal: AgentSignal, c: RevisionCtx) => {
    if (!c.input.centralScenario) return { resolved: false, note: 'no persisted decision to re-render from' };
    const res = repairCentralScenario(c.html, c.input.centralScenario, c.input.sourceCount);
    if (res.changed) { c.html = res.html; return { resolved: true, note: 'block re-rendered from persisted decision' }; }
    return { resolved: false, note: 'guard failed or already consistent' };
  });

  bus.registerResolver('citation_gap', (_signal: AgentSignal, c: RevisionCtx) => {
    if (!c.input.analysis || !c.input.sources?.length) return { resolved: false, note: 'analysis/sources unavailable' };
    const before = citationCount(c.html);
    const repaired = repairCitations(c.html, c.input.analysis, c.input.sources);
    if (repaired.citationsBackfilled + repaired.citationsInjected > 0 && citationCount(repaired.html) > before) {
      c.html = repaired.html;
      return { resolved: true, note: `+${repaired.citationsBackfilled} backfilled, +${repaired.citationsInjected} injected` };
    }
    return { resolved: false, note: 'no citations added' };
  });

  bus.registerResolver('substance_weak', async (signals: AgentSignal[], c: RevisionCtx) => {
    if (c.input.budgetConstrained) return { resolved: false, note: 'budget constrained' };
    const p = signals[0]?.payload ?? {};
    const rev = await reviseForFindings(c.html, {
      gateReasons: (p.gateReasons as string[]) ?? c.input.gate.reasons,
      daChallenges: (p.daChallenges as { type: string; text: string }[]) ?? c.input.devilsAdvocate?.topChallenges,
      killShot: (p.killShot as string) ?? c.input.devilsAdvocate?.killShot,
      weakFindings: (p.weakFindings as string[]) ?? weakFindings,
    });
    c.costUsd += rev.costUsd;
    if (rev.applied > 0) {
      c.html = rev.html;
      return { resolved: true, note: `${rev.applied} revision edit(s) applied (${rev.skipped} rejected)` };
    }
    return { resolved: false, note: `0 edits applied (${rev.skipped} rejected)` };
  }, { batch: true });

  bus.registerResolver('style_violation', async (signals: AgentSignal[], c: RevisionCtx) => {
    if (c.input.budgetConstrained) return { resolved: false, note: 'budget constrained' };
    const violations = signals.map((s: AgentSignal) => ({
      gate: String(s.payload?.gate ?? ''), pattern: '', match: String(s.payload?.match ?? ''),
      position: 0, suggestion: String(s.payload?.suggestion ?? ''),
    }));
    const copy = await copyEditHtml(c.html, { violations, editorialFindings: weakFindings.slice(0, 3) });
    c.costUsd += copy.costUsd;
    if (copy.applied > 0) {
      c.html = copy.html;
      const after = runStyleGates(c.html);
      return { resolved: true, note: `${copy.applied} edit(s) — violations ${violations.length} → ${after.violations.length}` };
    }
    return { resolved: false, note: `0 edits applied (${copy.skipped} rejected)` };
  }, { batch: true });

  // ── Sweep: goal-directed resolution — signals serving unmet mission
  // targets are boosted, bounded to one resolution per signal type. ──
  const mission: Mission = {
    goal: 'Pass the publication gate without weakening it',
    targets: { requireCentralScenario: input.requireCentralScenario, citationCoverage: 0.5, quality: 60 },
  };
  const sweep = await bus.sweep({
    mission,
    metrics: {
      citationCoverage: input.gate.metrics.citationCoverage,
      qualityScore: input.gate.metrics.qualityScore,
      centralScenarioOk: !failed.has('central_scenario'),
    },
    maxResolutions: 4,
    onResolve: (s, r) => ctx.actions.push(`${s.type}: ${r.resolved ? 'resolved' : 'failed'} — ${r.note ?? ''}`.slice(0, 160)),
  });

  // ── Final integrity guards — revert everything if revision regressed ──
  const citationRegressed = citationCount(ctx.html) < originalCitations;
  const wordsCollapsed = wordCount(ctx.html) < originalWords * 0.8;
  let scenarioBroken = false;
  if (input.requireCentralScenario || input.centralScenario) {
    const rendered = parseEditorialInquiry(ctx.html)?.centralScenario;
    scenarioBroken = !rendered?.name || !rendered.description || !rendered.rationale
      || !rendered.horizon || !rendered.confidence;
  }
  if (citationRegressed || wordsCollapsed || scenarioBroken) {
    return {
      html: input.html,
      changed: false,
      actions: [...ctx.actions, `REVERTED: integrity guard failed (citations ${citationRegressed}, words ${wordsCollapsed}, scenario ${scenarioBroken})`],
      costUsd: ctx.costUsd,
    };
  }

  return { html: ctx.html, changed: ctx.html !== input.html, actions: ctx.actions, costUsd: ctx.costUsd };
}

// ── REGENERATION ROUND (escalation after revision) ─────────────────────
// When the gate still fails on substance — not on missing evidence — the
// orchestrator regenerates the analysis ONCE on the same corpus with the
// gate findings injected as mandatory corrections (best-of-N with memory,
// not a blind retry). These helpers decide whether a rewrite can help,
// build the feedback payload, and score attempts for stagnation detection.

/** Check types a rewrite on the same corpus can never fix — the corpus or
 *  evidence itself is the problem; the topic needs replacement, not edits. */
const EVIDENCE_BOUND_CHECKS = new Set(['source_depth']);

export interface RegenDecision {
  regenerate: boolean;
  reason: string;
}

export function shouldRegenerate(args: {
  gate: PublicationGateResult;
  refusal?: boolean;
  budgetConstrained?: boolean;
  devilsAdvocate?: { publishabilityScore?: number; fatalChallenges?: number; verdict?: string };
  qualityScore: number;
  trustScore: number;
}): RegenDecision {
  const { gate } = args;
  if (gate.decision === 'publish') return { regenerate: false, reason: 'gate passed' };
  if (args.refusal) return { regenerate: false, reason: 'pipeline refused — evidence-bound' };
  if (args.budgetConstrained) return { regenerate: false, reason: 'budget constrained' };

  const failed = new Set(gate.checks.filter(c => !c.passed).map(c => c.checkType));

  // Corpus too thin — regeneration reuses the same seed corpus, so it cannot
  // add sources. This is a topic-level failure, not a writing failure.
  if (failed.has('source_depth')) {
    return { regenerate: false, reason: 'source_depth failed — evidence-bound, candidate should be replaced' };
  }
  // Deep-evidence failure: claims are unsupportable by the retrieved corpus.
  if (failed.has('trust_score') && gate.metrics.trustScore < 40) {
    return { regenerate: false, reason: `trust ${gate.metrics.trustScore} < 40 — corpus cannot support claims` };
  }

  const substance = failed.size > 0
    || (args.devilsAdvocate?.fatalChallenges ?? 0) > 0
    || (args.devilsAdvocate?.publishabilityScore ?? 100) < 50
    || args.qualityScore < 65;
  if (!substance) return { regenerate: false, reason: 'no actionable substance failure' };
  return { regenerate: true, reason: `substance failure: ${[...failed].join(',') || 'readiness'}` };
}

/** Monotone witness for the escalation loop: a regenerated artifact is
 *  adopted only if it strictly improves on the previous attempt. */
export function attemptScore(args: {
  gate: PublicationGateResult;
  trustScore: number;
  qualityScore: number;
}): number {
  const gateRank = args.gate.decision === 'publish' ? 200 : args.gate.decision === 'revise' ? 100 : 0;
  const passedChecks = args.gate.checks.filter(c => c.passed).length;
  return gateRank + passedChecks * 5 + args.trustScore + args.qualityScore;
}

/** Serializes the gate + adversarial findings into analyst-facing feedback
 *  for the regeneration attempt (injected via `priorFailureFeedback`). */
export function buildFailureFeedback(args: {
  gate: PublicationGateResult;
  devilsAdvocate?: {
    verdict?: string;
    publishabilityScore?: number;
    topChallenges?: { type: string; text: string }[];
    killShot?: string;
  };
  criticPanel?: { dimensions?: { dimension: string; score: number; findings: string[]; mustFix: boolean }[] };
}): string {
  const parts: string[] = [`Gate decision: ${args.gate.decision}. Failed checks:`];
  for (const r of args.gate.reasons.slice(0, 8)) parts.push(`- ${r}`);

  const da = args.devilsAdvocate;
  if (da) {
    if (typeof da.publishabilityScore === 'number') parts.push(`Devil's advocate publishability: ${da.publishabilityScore}/100.`);
    if (da.killShot) parts.push(`Strongest adversarial objection (MUST be addressed): ${da.killShot}`);
    for (const c of (da.topChallenges ?? []).slice(0, 5)) parts.push(`- [${c.type}] ${c.text}`);
  }

  const mustFix = (args.criticPanel?.dimensions ?? [])
    .filter(d => d.mustFix || d.score <= 4)
    .flatMap(d => d.findings.slice(0, 2).map(f => `[${d.dimension}] ${f}`));
  if (mustFix.length) {
    parts.push('Critic panel must-fix findings:');
    for (const f of mustFix.slice(0, 6)) parts.push(`- ${f}`);
  }

  return parts.join('\n').slice(0, 3000);
}
