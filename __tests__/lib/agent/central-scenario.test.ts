import { resolveCentralScenario, centralScenarioIssues, type InstitutePosition, type PositionFirstBriefInput } from '@/lib/agent/editorial-types';
import { renderPositionFirstBriefHTML } from '@/lib/agent/position-first-renderer';
import { parseEditorialInquiry } from '@/lib/brand/inquiry-html-parse';
import { evaluatePublicationGate } from '@/lib/agent/publication-gate';

jest.mock('@/lib/agent/strategic-report-renderer', () => ({ dedupeCitations: (text: string) => text }));

const position: InstitutePosition = {
  headline: 'Our assessment', verdict: 'Evidence supports the central outlook [SRC-1].',
  confidence: 68, confidenceLabel: 'medium',
  scenarios: [
    { name: 'Alternative', probability: '60%', description: 'An alternative outcome.' },
    { name: 'Central', probability: '40%', description: 'Central description.', narrative: 'Our central future unfolds gradually.' },
  ],
  dominantScenario: 'Central',
  centralScenarioRationale: 'Observed implementation supports this outlook rather than the alternative [SRC-1].',
  centralScenarioImplications: ['Prepare for gradual implementation.'],
  prospectiveFramework: { horizon: 'By 2030' },
  whatChangesMind: ['Two consecutive quarters of falling adoption would reverse this view.'],
  objections: [], costUsd: 0,
};

const input = {
  question: 'How will implementation evolve?', position, analysis: {},
  classification: { domains: [], dimensions: [], primaryDomain: 'economics', reasoning: 'Test' },
  casting: { team: [], collisionSummary: 'Test', productiveFriction: '', costUsd: 0 },
  sources: [{ id: 'source-1', title: 'Observed implementation', provider: 'test', year: 2024 }],
} as unknown as PositionFirstBriefInput;

function check(html: string, central = resolveCentralScenario(position)) {
  return evaluatePublicationGate({ html, sourceIds: ['source-1'], centralScenario: central, requireCentralScenario: true });
}

describe('central scenario selection', () => {
  it('preserves the evidence-based editorial choice when simulation disagrees', () => {
    const central = resolveCentralScenario(position, [{ name: 'Alternative', empiricalProbability: 1 }, { name: 'Central', empiricalProbability: 0 }]);
    expect(central?.name).toBe('Central');
    expect(central?.simulationDisagrees).toBe(true);
    expect(centralScenarioIssues(central, 1)).toEqual([]);
  });
  it('uses probability rather than array order for fallback, without inventing justification', () => {
    const central = resolveCentralScenario({ ...position, dominantScenario: 'Unknown', scenarios: [...position.scenarios].reverse() });
    expect(central?.name).toBe('Alternative');
    expect(central?.selectedBy).toBe('probability_fallback');
    expect(centralScenarioIssues(central, 1).length).toBeGreaterThan(0);
  });
  it('rejects ambiguous scenario names and missing probabilities', () => {
    expect(resolveCentralScenario({ ...position, scenarios: [position.scenarios[0], position.scenarios[0]] })).toBeUndefined();
    expect(resolveCentralScenario({ ...position, dominantScenario: undefined, scenarios: [{ name: 'Unknown', probability: '—', description: '' }] })).toBeUndefined();
  });
  it('rejects missing horizons, triggers and invalid evidence references', () => {
    const central = resolveCentralScenario({ ...position, prospectiveFramework: {}, whatChangesMind: [], centralScenarioRationale: 'Because [SRC-9].' });
    expect(centralScenarioIssues(central, 1)).toHaveLength(3);
  });
});

describe('central scenario render and publication contract', () => {
  it.each(['default', 'montaigne', 'rand'] as const)('round-trips the central decision for %s', styleProfile => {
    const html = renderPositionFirstBriefHTML({ ...input, styleProfile });
    const parsed = parseEditorialInquiry(html);
    expect(parsed?.centralScenario?.name).toBe('Central');
    expect(parsed?.centralScenario?.description).toContain('unfolds gradually');
    expect(parsed?.centralScenario?.rationale).toContain('Observed implementation');
    expect(parsed?.centralScenario?.rationaleHtml).toContain('href="#ref-1"');
    expect(parsed?.centralScenario?.horizon).toBe('By 2030');
    expect(parsed?.centralScenario?.implications).toHaveLength(1);
    expect(parsed?.centralScenario?.revisionTriggers).toHaveLength(1);
    expect(html).toContain('<details');
    expect(check(html).checks.find(c => c.checkType === 'central_scenario')?.passed).toBe(true);
  });
  it('blocks a missing or stripped central scenario at publication', () => {
    const gate = check('<p>Otherwise complete article</p>');
    expect(gate.decision).toBe('hold');
    expect(gate.checks.find(c => c.checkType === 'central_scenario')?.passed).toBe(false);
  });
  it('blocks a stale decision paired with another rendered scenario', () => {
    const html = renderPositionFirstBriefHTML(input);
    const gate = check(html, { ...resolveCentralScenario(position)!, name: 'Alternative' });
    expect(gate.checks.find(c => c.checkType === 'central_scenario')?.passed).toBe(false);
  });
  it('blocks a rationale changed by a later repair', () => {
    const html = renderPositionFirstBriefHTML(input).replace('Observed implementation', 'A different assertion');
    expect(check(html).checks.find(c => c.checkType === 'central_scenario')?.passed).toBe(false);
  });
  it('blocks duplicate central blocks', () => {
    const html = renderPositionFirstBriefHTML(input);
    const block = html.match(/<section class="nx-block central-scenario">[\s\S]*?<\/section>/)![0];
    expect(check(html.replace(block, block + block)).checks.find(c => c.checkType === 'central_scenario')?.passed).toBe(false);
  });
  it('blocks missing citations in the final rationale', () => {
    const html = renderPositionFirstBriefHTML(input).replace(/<sup\b[^>]*>[\s\S]*?<\/sup>/g, '');
    expect(check(html).checks.find(c => c.checkType === 'central_scenario')?.passed).toBe(false);
  });
  it('parses legacy central markers, narrative content and wildcard rows', () => {
    const html = '<div class="verdict-block">Legacy</div><section class="nx-block scenarios-block"><div class="scenario-row"><span class="scenario-name">Central · central</span><span class="scenario-prob">60%</span><div class="scenario-narrative"><p>The narrative survives.</p></div></div><div class="scenario-row scenario-wildcard"><span class="scenario-name">Shock · wildcard</span><span class="scenario-prob">40%</span><div class="scenario-desc">Shock description.</div></div></section>';
    const parsed = parseEditorialInquiry(html);
    expect(parsed?.scenarios).toHaveLength(2);
    expect(parsed?.scenarios[0]).toMatchObject({ name: 'Central', isBase: true, description: 'The narrative survives.' });
    expect(parsed?.scenarios[1].name).toBe('Shock');
  });
});
