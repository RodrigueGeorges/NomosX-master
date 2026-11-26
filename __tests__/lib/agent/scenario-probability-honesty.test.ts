/**
 * Regression: scenario probability honesty gate (run-11 DA killShot).
 *
 * Live failure (run c560057b, 2026-11-26): with the swarm election skipped
 * (insufficient_link_distributions), the scenario table rendered
 * analyst-invented percentages — "Reckoning 58%" — in a "Prob." column next
 * to a broken "90% CI" cell ("58–not established"). The devils advocate
 * killed the run on "precise 'empiricalProbability' values and zero-width
 * 'confidenceInterval' values without disclosed empirical calibration".
 *
 * Rule: a numeric percentage is only rendered when it comes from a
 * calibrated source (swarm election → empiricalProbability, Delphi →
 * calibratedProbability). Bare analyst "58%" strings collapse to
 * "not established"; qualitative labels pass through.
 */
import { renderPositionFirstBriefHTML } from '@/lib/agent/position-first-renderer';
import type { InstitutePosition, PositionFirstBriefInput } from '@/lib/agent/editorial-types';

jest.mock('@/lib/agent/strategic-report-renderer', () => ({ dedupeCitations: (text: string) => text }));

function makeInput(scenarios: unknown[]): PositionFirstBriefInput {
  const position = {
    headline: 'Our assessment', verdict: 'Evidence supports the central outlook [SRC-1].',
    confidence: 68, confidenceLabel: 'medium',
    scenarios,
    dominantScenario: 'Central',
    centralScenarioRationale: 'Observed implementation supports this outlook [SRC-1].',
    centralScenarioImplications: ['Prepare for gradual implementation.'],
    prospectiveFramework: { horizon: 'By 2030' },
    whatChangesMind: ['Two consecutive quarters of falling adoption would reverse this view.'],
    objections: [], costUsd: 0,
  } as unknown as InstitutePosition;
  return {
    question: 'How will implementation evolve?', position, analysis: {},
    classification: { domains: [], dimensions: [], primaryDomain: 'economics', reasoning: 'Test' },
    casting: { team: [], collisionSummary: 'Test', productiveFriction: '', costUsd: 0 },
    sources: [{ id: 'source-1', title: 'Observed implementation', provider: 'test', year: 2024 }],
  } as unknown as PositionFirstBriefInput;
}

describe('scenario probability honesty gate', () => {
  it('hides analyst-invented percentages — renders "not established"', () => {
    const html = renderPositionFirstBriefHTML(makeInput([
      { name: 'Reckoning', probability: '58%', description: 'A.', keyDrivers: ['d1'] },
      { name: 'Central', probability: '42%', description: 'B.', narrative: 'n' },
    ]));
    // No invented percentage may appear as a bare "58%"/"42%" token
    expect(html).not.toContain('>58%<');
    expect(html).not.toContain('>42%<');
    expect(html).toContain('not established');
  });

  it('shows calibrated sources: empiricalProbability and calibratedProbability', () => {
    const html = renderPositionFirstBriefHTML(makeInput([
      { name: 'Elected', probability: '58%', empiricalProbability: 0.42, confidenceInterval: [0.30, 0.55], description: 'A.', keyDrivers: ['d1'] },
      { name: 'Delphi', probability: 'high', calibratedProbability: 0.35, description: 'B.', narrative: 'n' },
      { name: 'Central', probability: 'qualitative outlook', description: 'C.', narrative: 'n' },
    ]));
    expect(html).toContain('>42%<');   // empiricalProbability 0.42 → 42%
    expect(html).toContain('>35%<');   // calibratedProbability 0.35 → 35%
    expect(html).toContain('30–55%');  // real CI renders
    expect(html).toContain('qualitative outlook'); // qualitative label passes through
  });

  it('never renders a broken or zero-width confidence interval', () => {
    const html = renderPositionFirstBriefHTML(makeInput([
      { name: 'Broken', probability: '50%', confidenceInterval: [0.58, undefined], description: 'A.', keyDrivers: ['d1'] },
      { name: 'Point', probability: '50%', confidenceInterval: [0.5, 0.5], description: 'B.', narrative: 'n' },
      { name: 'Central', probability: '50%', description: 'C.', narrative: 'n' },
    ]));
    expect(html).not.toContain('NaN');
    expect(html).not.toContain('58–');   // broken CI [0.58, undefined] collapses to '—'
    expect(html).not.toMatch(/50–50%/); // zero-width CI collapses to '—'
  });
});
