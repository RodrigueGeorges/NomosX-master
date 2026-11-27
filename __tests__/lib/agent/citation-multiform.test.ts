/**
 * Regression: bracket-comma multi-citations "[SRC-7, SRC-19]".
 *
 * Live failure (run c560057b, 2026-11-26): the bare-SRC normalizer
 * `/(?<!\[)SRC-(\d+)(?!\])/g` backtracked "SRC-19]" to "SRC-1" + orphan "9]",
 * rendering "[SRC-7, <sup>1</sup>9]" — a citation to source 1 plus debris,
 * and a guaranteed central_scenario gate hold (rendered != persisted).
 */
import { renderCentralScenarioBlock } from '@/lib/agent/position-first-renderer';
import type { CentralScenarioDecision } from '@/lib/agent/editorial-types';

const decision: CentralScenarioDecision = {
  name: 'Test Scenario',
  description: 'desc',
  rationale: 'We select it because institutional investment flows toward standardization [SRC-7, SRC-19], and the base rate is 0.25.',
  horizon: 'end-2027',
  confidence: 'high',
  implications: ['implication one [SRC-3]'],
  revisionTriggers: ['trigger two'],
} as CentralScenarioDecision;

describe('bracket-comma multi-citation rendering', () => {
  it('renders [SRC-7, SRC-19] as two clean sups — never <sup>1</sup>9 corruption', () => {
    const html = renderCentralScenarioBlock(decision, { sourceCount: 25 });
    expect(html).toContain('href="#ref-7"');
    expect(html).toContain('href="#ref-19"');
    // The corruption signature: sup for source 1 followed by orphan "9]"
    expect(html).not.toMatch(/<\/a><\/sup>9\]/);
    expect(html).not.toContain('>1</a></sup>9');
    // No raw [SRC-…] bracket should survive inside the rationale
    expect(html).not.toContain('[SRC-7,');
    expect(html).not.toContain('[SRC-19]');
  });

  it('single and paren citation forms still render', () => {
    const d2 = { ...decision, rationale: 'a [SRC-3] b (SRC-2, SRC-8) c' } as CentralScenarioDecision;
    const html = renderCentralScenarioBlock(d2, { sourceCount: 25 });
    for (const n of [2, 3, 8]) expect(html).toContain(`href="#ref-${n}"`);
  });
});
