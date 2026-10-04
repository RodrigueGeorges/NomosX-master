import { repairHtmlWithGrounding, type AtomicClaim } from '@/lib/agent/claim-grounding';
import { parseEditorialInquiry } from '@/lib/brand/inquiry-html-parse';
import { type CentralScenarioDecision } from '@/lib/agent/editorial-types';

/**
 * Regression: a live run was HELD because claim-grounding removal gutted the
 * central-scenario block — the horizon sentence (a data-no-cite editorial
 * element) and the uncited scenario-probability tail were deleted, leaving an
 * orphan <p> and a rationale that no longer matched the persisted decision.
 * Test HTML mirrors position-first-renderer.ts centralHtml exactly.
 */
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

const SCENARIO_HTML = `
<article>
<p class="nx-eyebrow">Institute position</p>
<section class="nx-block central-scenario">
  <p class="nx-eyebrow" data-no-cite>Our central scenario</p>
  <h3 class="central-name">The Brussels-Beijing Fracture</h3>
  <p>Horizon: <span class="central-horizon" data-no-cite>We look to 2030 because treaty ratification cycles lag deployment by two budgets.</span></p>
  <p>Editorial confidence: <span class="central-confidence" data-no-cite>high</span></p>
  <div class="central-description"><p>Export controls fragment into rival standards blocs.</p></div>
  <h4>Why we select it</h4>
  <div class="central-rationale"><p>Coordination fails because enforcement asymmetry rewards defection <sup class="cite"><a href="#ref-8" data-evidence="E8">8</a></sup> and licensing diverges <sup class="cite"><a href="#ref-7" data-evidence="E7">7</a></sup>. The Paperweight Accords (25%) and Leviathan&#039;s Code (15%) remain tail risks.</p></div>
  <h4>Implications</h4>
  <ul class="central-implications"><li>Insurers reprice frontier compute by 2028</li></ul>
  <h4>What would change our view</h4>
  <ul class="central-revision"><li>A bilateral licensing treaty</li></ul>
</section>
<p>Outside the block, an unsupported quantitative claim: subsidies reached 45 billion dollars by 2027 and nobody verified it.</p>
</article>`;

const claims: AtomicClaim[] = [
  { text: 'We look to 2030 because treaty ratification cycles lag deployment by two budgets', sentenceIndex: 0, sourceRef: null, sourceRefTag: null, verdict: 'uncited', evidenceSnippet: null, score: 0 },
  { text: 'The Paperweight Accords (25%) and Leviathan&#039;s Code (15%) remain tail risks', sentenceIndex: 1, sourceRef: null, sourceRefTag: null, verdict: 'uncited', evidenceSnippet: null, score: 0 },
  { text: 'subsidies reached 45 billion dollars by 2027', sentenceIndex: 2, sourceRef: null, sourceRefTag: null, verdict: 'unsupported', evidenceSnippet: null, score: 0 },
];

it('never removes sentences inside the central-scenario block (gate requires verbatim render)', () => {
  const { html, removedClaims } = repairHtmlWithGrounding(SCENARIO_HTML, claims, 'remove');
  // The editorial-decision block survives intact
  expect(html).toContain('central-horizon');
  expect(html).toContain('treaty ratification cycles lag deployment');
  expect(html).toContain('Paperweight Accords (25%)');
  // The unsupported claim OUTSIDE the block is still removed
  expect(html).not.toContain('45 billion dollars');
  expect(removedClaims).toBeGreaterThanOrEqual(1);
});

it('protected block still parses to a complete central scenario matching the decision', () => {
  const { html } = repairHtmlWithGrounding(SCENARIO_HTML, claims, 'remove');
  const rendered = parseEditorialInquiry(html)?.centralScenario;
  expect(rendered?.name).toBe(central.name);
  expect(rendered?.horizon).toBe(central.horizon);
  expect(rendered?.confidence).toBe('high');
  expect(rendered?.implications).toEqual(central.implications);
  expect(rendered?.revisionTriggers).toEqual(central.revisionTriggers);
  const normalize = (t: string) => t.replace(/\[(?:SRC|E)-\d+\]/g, '').replace(/\s+/g, ' ').trim();
  expect(normalize(rendered!.rationale)).toBe(normalize(central.rationale));
});

/**
 * Paid-run autopsy regression: every field of the rendered central-scenario
 * block mismatched the persisted decision on WHITESPACE ALONE — citation
 * <sup> markup hugs punctuation in rendered HTML ("step<sup>…</sup>." →
 * stripped → "step ." vs decision "step.") and evidence ids render as [E41]
 * (no dash) which the old regex never stripped. The check requires citations
 * in the rationale, so the cites themselves broke the equality check → a
 * guaranteed central_scenario hold on every position-first brief.
 */
it('gate normalize ignores citation whitespace artifacts and bare [E41] markers', async () => {
  const { evaluatePublicationGate } = await import('@/lib/agent/publication-gate');
  const decision: CentralScenarioDecision = {
    ...central,
    // Decision text carries compact [SRC-N] refs hugging punctuation.
    rationale: 'Coordination fails because enforcement asymmetry rewards defection[SRC-8]. Licensing diverges[SRC-7].',
    horizon: 'We look to 2030 because cycles lag deployment[SRC-4].',
  };
  const html = `<article>
  <p class="nx-eyebrow">Institute position</p>
  <section class="nx-block central-scenario">
    <h3 class="central-name">${central.name}</h3>
    <p>Horizon: <span class="central-horizon">We look to 2030 because cycles lag deployment [E4].</span></p>
    <p>Editorial confidence: <span class="central-confidence">high</span></p>
    <div class="central-description"><p>Export controls fragment into rival standards blocs.</p></div>
    <div class="central-rationale"><p>Coordination fails because enforcement asymmetry rewards defection <sup class="cite"><a href="#ref-8" data-evidence="E8">8</a></sup>. Licensing diverges <sup class="cite"><a href="#ref-7" data-evidence="E7">7</a></sup>.</p></div>
    <ul class="central-implications"><li>Insurers reprice frontier compute by 2028</li></ul>
    <ul class="central-revision"><li>A bilateral licensing treaty</li></ul>
  </section>
  </article>`;
  const result = evaluatePublicationGate({
    format: 'brief', html,
    sourceIds: Array.from({ length: 10 }, (_, i) => `s${i}`),
    centralScenario: decision, requireCentralScenario: true,
  });
  const cs = result.checks.find(c => c.checkType === 'central_scenario');
  expect(cs?.passed).toBe(true);
});
