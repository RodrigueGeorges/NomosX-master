import { reviseForGate } from '@/lib/agent/revision-controller';
import { parseEditorialInquiry } from '@/lib/brand/inquiry-html-parse';
import type { PublicationGateResult } from '@/lib/agent/publication-gate';
import type { CentralScenarioDecision } from '@/lib/agent/editorial-types';

const central: CentralScenarioDecision = {
  name: 'The Brussels-Beijing Fracture',
  description: 'Export controls fragment into rival standards blocs.',
  rationale: "Coordination fails because enforcement asymmetry rewards defection [SRC-8] and licensing diverges [SRC-7]. The Paperweight Accords (25%) and Leviathan's Code (15%) remain tail risks.",
  horizon: 'We look to 2030 because treaty ratification cycles lag deployment by two budgets.',
  implications: ['Insurers reprice frontier compute by 2028'],
  revisionTriggers: ['A bilateral licensing treaty'],
  confidence: 'high',
  selectedBy: 'editorial',
  simulationDisagrees: false,
};

function gate(checks: { checkType: string; passed: boolean; score?: number }[]): PublicationGateResult {
  const failed = checks.filter(c => !c.passed);
  return {
    decision: failed.length ? 'hold' : 'publish',
    checks: checks.map(c => ({ ...c, details: '' })),
    reasons: failed.map(c => c.checkType),
    warnings: [],
    metrics: { sourceCount: 18, trustScore: 78, qualityScore: 66, citationCoverage: 0.9, wordCount: 3000, claimCount: 200, citedClaimCount: 180 },
  } as PublicationGateResult;
}

/** HTML whose central-scenario block was gutted — reproduces the live HELD artifact. */
const GUTTED_HTML = `
<article>
<p class="nx-eyebrow">Institute position</p>
<div class="verdict-block"><p>Verdict placeholder</p></div>
<section class="nx-block central-scenario">
  <p class="nx-eyebrow" data-no-cite>Our central scenario</p>
  <h3 class="central-name">The Brussels-Beijing Fracture</h3>
  <p>
  <p>Editorial confidence: <span class="central-confidence" data-no-cite>high</span></p>
  <div class="central-description"><p>Export controls fragment into rival standards blocs.</p></div>
  <h4>Why we select it</h4>
  <div class="central-rationale"><p>Coordination fails because enforcement asymmetry rewards defection <sup class="cite"><a href="#ref-8">8</a></sup>.</p></div>
  <h4>Implications</h4>
  <ul class="central-implications"><li>Insurers reprice frontier compute by 2028</li></ul>
  <h4>What would change our view</h4>
  <ul class="central-revision"><li>A bilateral licensing treaty</li></ul>
</section>
<p>Prose paragraph with a citation <sup class="cite"><a href="#ref-3">3</a></sup> that must survive revision unchanged.</p>
</article>`;

it('R0: re-renders a gutted central-scenario block from the persisted decision', async () => {
  const res = await reviseForGate({
    html: GUTTED_HTML,
    gate: gate([{ checkType: 'central_scenario', passed: false }]),
    centralScenario: central,
    requireCentralScenario: true,
    sourceCount: 18,
    budgetConstrained: true, // no LLM — deterministic path only
  });
  expect(res.changed).toBe(true);
  const rendered = parseEditorialInquiry(res.html)?.centralScenario;
  expect(rendered?.name).toBe(central.name);
  expect(rendered?.horizon).toBe(central.horizon);
  expect(rendered?.confidence).toBe('high');
  const normalize = (t: string) => t.replace(/\[(?:SRC|E)-\d+\]/g, '').replace(/\s+/g, ' ').trim();
  expect(normalize(rendered!.rationale)).toBe(normalize(central.rationale));
  expect(res.actions.some(a => a.startsWith('scenario_invalid: resolved'))).toBe(true);
});

it('R0: preserves existing block labels (locale fidelity)', async () => {
  const frenchHtml = GUTTED_HTML
    .replace('Our central scenario', 'Notre scénario central')
    .replace('Why we select it', 'Pourquoi nous le retenons')
    .replace('Implications</h4>', 'Conséquences</h4>')
    .replace('What would change our view', 'Ce qui nous ferait changer d’avis')
    .replace('Editorial confidence:', 'Confiance éditoriale:')
    .replace('Institute position', 'Position de l’institut')
    + '<p>Le la les des une dans pour avec nous notre que cette ces aux par sur entre selon est sont. '.repeat(30) + '</p>';
  const res = await reviseForGate({
    html: frenchHtml,
    gate: gate([{ checkType: 'central_scenario', passed: false }]),
    centralScenario: central,
    requireCentralScenario: true,
    sourceCount: 18,
    budgetConstrained: true,
  });
  expect(res.changed).toBe(true);
  expect(res.html).toContain('Notre scénario central');
  expect(res.html).toContain('Pourquoi nous le retenons');
});

it('R0: inserts the block when entirely missing', async () => {
  const noBlock = GUTTED_HTML.replace(/<section class="nx-block central-scenario">[\s\S]*?<\/section>/, '');
  const res = await reviseForGate({
    html: noBlock,
    gate: gate([{ checkType: 'central_scenario', passed: false }]),
    centralScenario: central,
    requireCentralScenario: true,
    sourceCount: 18,
    budgetConstrained: true,
  });
  expect(res.changed).toBe(true);
  expect(res.html.match(/class="nx-block central-scenario"/g)?.length).toBe(1);
});

it('does nothing when the gate has no repairable failure', async () => {
  const res = await reviseForGate({
    html: GUTTED_HTML,
    gate: gate([{ checkType: 'source_depth', passed: false }]), // not repairable at render level
    centralScenario: central,
    requireCentralScenario: true,
    sourceCount: 18,
    budgetConstrained: true,
  });
  expect(res.changed).toBe(false);
  expect(res.html).toBe(GUTTED_HTML);
});

it('leaves the block untouched when the check passed', async () => {
  const res = await reviseForGate({
    html: GUTTED_HTML,
    gate: gate([{ checkType: 'central_scenario', passed: true }, { checkType: 'word_count', passed: false }]),
    centralScenario: central,
    requireCentralScenario: true,
    sourceCount: 18,
    budgetConstrained: true,
  });
  // word_count is not render-repairable → no change, gutted block stays as-is
  expect(res.changed).toBe(false);
});

// ── Gate-as-router coverage: every failed check posts a signal to the
// specialist resolver (S37). Asserting the action trail proves the signal
// was routed — resolvers may still fail (e.g. budget), routing is the point.

it('routes claim_citation_density failures to the citation resolver', async () => {
  const res = await reviseForGate({
    html: GUTTED_HTML,
    gate: gate([{ checkType: 'claim_citation_density', passed: false }]),
    centralScenario: central,
    sourceCount: 18,
    analysis: { keyFindings: [] },
    sources: [{ title: 'A source', provider: 'openalex' }],
    budgetConstrained: true,
  });
  expect(res.actions.some(a => a.startsWith('citation_gap'))).toBe(true);
});

it('routes trust_score failures to the weak-component resolver (decomposition)', async () => {
  const res = await reviseForGate({
    html: GUTTED_HTML,
    gate: gate([{ checkType: 'trust_score', passed: false }]),
    centralScenario: central,
    sourceCount: 18,
    trustComponents: { citationCoverage: 0.4, criticScore: 55, groundedness: 0.9 },
    budgetConstrained: true,
  });
  // citationCoverage 0.4 < 0.6 → routed to the citation specialist, not a blind retry
  expect(res.actions.some(a => a.startsWith('citation_gap'))).toBe(true);
});

it('routes trust_score failures with weak critic/groundedness to substance revision', async () => {
  const res = await reviseForGate({
    html: GUTTED_HTML,
    gate: gate([{ checkType: 'trust_score', passed: false }]),
    centralScenario: central,
    sourceCount: 18,
    trustComponents: { citationCoverage: 0.95, criticScore: 30, groundedness: 0.9 },
    budgetConstrained: true, // resolver declines on budget — routing is what we assert
  });
  expect(res.actions.some(a => a.startsWith('substance_weak'))).toBe(true);
});

it('routes word_count failures to the substance resolver with an expansion directive', async () => {
  const res = await reviseForGate({
    html: GUTTED_HTML,
    gate: gate([{ checkType: 'word_count', passed: false }]),
    centralScenario: central,
    sourceCount: 18,
    budgetConstrained: true,
  });
  expect(res.actions.some(a => a.startsWith('substance_weak'))).toBe(true);
});

it('routes novlangue terms into the copy-editor style_violation batch', async () => {
  const euphemized = GUTTED_HTML + '<p>Stakeholder engagement on the modernization agenda continued.</p>';
  const res = await reviseForGate({
    html: euphemized,
    gate: gate([{ checkType: 'novlangue_density', passed: false }]),
    centralScenario: central,
    sourceCount: 18,
    budgetConstrained: true,
  });
  expect(res.actions.some(a => a.startsWith('style_violation'))).toBe(true);
});

// ── Regeneration helpers (escalation ladder after revision) ──

import { shouldRegenerate, attemptScore, buildFailureFeedback } from '@/lib/agent/revision-controller';

describe('shouldRegenerate', () => {
  it('refuses when the gate already published', () => {
    const res = shouldRegenerate({
      gate: gate([{ checkType: 'quality_score', passed: true }]),
      qualityScore: 80, trustScore: 80,
    });
    expect(res.regenerate).toBe(false);
  });

  it('refuses evidence-bound failures — a rewrite cannot add sources', () => {
    const res = shouldRegenerate({
      gate: gate([{ checkType: 'source_depth', passed: false }, { checkType: 'quality_score', passed: false }]),
      qualityScore: 55, trustScore: 70,
    });
    expect(res.regenerate).toBe(false);
    expect(res.reason).toContain('source_depth');
  });

  it('does not pay for a rewrite when the evaluator is unavailable', () => {
    const res = shouldRegenerate({
      gate: gate([{ checkType: 'evaluation_availability', passed: false }]),
      qualityScore: 50, trustScore: 70,
    });
    expect(res.regenerate).toBe(false);
    expect(res.reason).toContain('evaluation unavailable');
  });

  it('refuses deep-evidence failure (trust < 40)', () => {
    const g = gate([{ checkType: 'trust_score', passed: false }]);
    g.metrics.trustScore = 30;
    const res = shouldRegenerate({ gate: g, qualityScore: 60, trustScore: 30 });
    expect(res.regenerate).toBe(false);
  });

  it('refuses when budget-constrained', () => {
    const res = shouldRegenerate({
      gate: gate([{ checkType: 'devils_advocate', passed: false }]),
      qualityScore: 60, trustScore: 70, budgetConstrained: true,
    });
    expect(res.regenerate).toBe(false);
  });

  it('refuses when the pipeline refused (evidence-bound)', () => {
    const res = shouldRegenerate({
      gate: gate([{ checkType: 'quality_score', passed: false }]),
      refusal: true, qualityScore: 60, trustScore: 70,
    });
    expect(res.regenerate).toBe(false);
  });

  it('regenerates on substance failures (DA reject / low quality / adversarial challenges)', () => {
    const res = shouldRegenerate({
      gate: gate([{ checkType: 'devils_advocate', passed: false }]),
      devilsAdvocate: { publishabilityScore: 30, fatalChallenges: 1, verdict: 'reject' },
      qualityScore: 60, trustScore: 72,
    });
    expect(res.regenerate).toBe(true);
  });

  it('refuses a regen whose DA kill shot is evidence-bound — same corpus cannot fix missing sources (S38b paid-run defect)', () => {
    const res = shouldRegenerate({
      gate: gate([{ checkType: 'devils_advocate', passed: false }]),
      devilsAdvocate: {
        verdict: 'reject', publishabilityScore: 0, fatalChallenges: 0,
        topChallenges: [
          { type: 'non_evidence', text: 'none of the 20 sources directly support the central claim' },
          { type: 'missing_warrant', text: 'adaptation-speed claim lacks a mechanism' },
          { type: 'non_evidence', text: 'jet-drone thesis unsupported by corpus' },
        ],
      },
      qualityScore: 73, trustScore: 78,
    });
    expect(res.regenerate).toBe(false);
    expect(res.reason).toContain('evidence-bound');
  });

  it('still regenerates when DA challenges are reasoning-bound, not evidence-bound', () => {
    const res = shouldRegenerate({
      gate: gate([{ checkType: 'devils_advocate', passed: false }]),
      devilsAdvocate: {
        verdict: 'major_revision', publishabilityScore: 35, fatalChallenges: 1,
        topChallenges: [
          { type: 'missing_stakeholder', text: 'no affected-party analysis' },
          { type: 'overstated_conclusion', text: 'claim exceeds warrant' },
        ],
      },
      qualityScore: 60, trustScore: 72,
    });
    expect(res.regenerate).toBe(true);
  });
});

describe('attemptScore — monotone witness', () => {
  it('ranks publish > revise > hold', () => {
    const publish = gate([{ checkType: 'quality_score', passed: true }]);
    publish.decision = 'publish';
    const revise = gate([{ checkType: 'devils_advocate', passed: false }]);
    revise.decision = 'revise';
    const hold = gate([{ checkType: 'central_scenario', passed: false }]);
    hold.decision = 'hold';
    expect(attemptScore({ gate: publish, trustScore: 70, qualityScore: 60 }))
      .toBeGreaterThan(attemptScore({ gate: revise, trustScore: 90, qualityScore: 90 }));
    expect(attemptScore({ gate: revise, trustScore: 70, qualityScore: 60 }))
      .toBeGreaterThan(attemptScore({ gate: hold, trustScore: 90, qualityScore: 90 }));
  });

  it('rewards more passed checks at equal gate decision', () => {
    const better = gate([
      { checkType: 'a', passed: true }, { checkType: 'b', passed: true }, { checkType: 'c', passed: false },
    ]);
    const worse = gate([
      { checkType: 'a', passed: true }, { checkType: 'b', passed: false }, { checkType: 'c', passed: false },
    ]);
    expect(attemptScore({ gate: better, trustScore: 70, qualityScore: 60 }))
      .toBeGreaterThan(attemptScore({ gate: worse, trustScore: 70, qualityScore: 60 }));
  });
});

describe('buildFailureFeedback', () => {
  it('serializes gate reasons + DA kill shot + panel must-fix into analyst feedback', () => {
    const g = gate([{ checkType: 'devils_advocate', passed: false }, { checkType: 'quality_score', passed: true }]);
    const feedback = buildFailureFeedback({
      gate: g,
      devilsAdvocate: {
        publishabilityScore: 30,
        killShot: 'The central claim ignores the 2023 counterfactual',
        topChallenges: [{ type: 'causal', text: 'Correlation presented as causation' }],
      },
      criticPanel: {
        dimensions: [{ dimension: 'coverage', score: 3, findings: ['Missing non-Western perspective'], mustFix: true }],
      },
    });
    expect(feedback).toContain('devils_advocate');
    expect(feedback).toContain('kill shot'.length ? 'counterfactual' : 'counterfactual');
    expect(feedback).toContain('Missing non-Western perspective');
    expect(feedback.length).toBeLessThanOrEqual(3000);
  });
});
