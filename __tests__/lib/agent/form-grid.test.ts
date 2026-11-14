/**
 * think-tank form grid — deterministic checklist on the final rendered HTML.
 * Shadow mode: measured, never blocking.
 */

import { evaluateThinkTankForm } from '@/lib/agent/form-grid';

const fullThinkTankHtml = `
<article>
  <h1>Analysis</h1>
  <section><h2>Executive Summary</h2><p>Bottom line: the corridor holds under the central scenario.</p></section>
  <section><h2>Findings</h2><p>The mechanism operates through insurance repricing.</p></section>
  <section><h2>Recommendations</h2><p>Policymakers should mandate corridor reserves by 2027 because the tail scenario is underpriced [SRC-1].</p></section>
  <section><h2>Objections</h2><p>The strongest objection — demand destruction — is answered by the inelastic short-run segment.</p></section>
  <section><h2>Methodology &amp; Limitations</h2><p>Data sources: primary statistics; caveats: static model.</p></section>
  <section id="computed-exhibit" class="nx-computed-exhibit"><h2>Computed Exhibit</h2></section>
  <section class="references-section"><h2>Sources</h2><p>[1] ...</p></section>
</article>`;

describe('evaluateThinkTankForm', () => {
  it('passes all criteria on a complete think-tank artifact', () => {
    const r = evaluateThinkTankForm({ html: fullThinkTankHtml, fatalChallenges: 0, stats: { computedExhibit: 'both' } });
    expect(r.passed).toBe(r.total);
    expect(r.score).toBe(100);
  });

  it('fails recommendations when no action is addressed', () => {
    const html = fullThinkTankHtml.replace(/<section><h2>Recommendations<\/h2>[\s\S]*?<\/section>/, '');
    const r = evaluateThinkTankForm({ html, fatalChallenges: 0, stats: { computedExhibit: 'both' } });
    expect(r.criteria.find(c => c.name === 'recommendations')!.passed).toBe(false);
    expect(r.score).toBeLessThan(100);
  });

  it('objections criterion fails only when fatal challenges exist AND nothing engages them', () => {
    const bare = fullThinkTankHtml
      .replace(/<section><h2>Objections<\/h2>[\s\S]*?<\/section>/, '')
      .replace(/Policymakers should[^<]*/, 'The corridor holds.');
    const r = evaluateThinkTankForm({ html: bare, fatalChallenges: 3, stats: {} });
    expect(r.criteria.find(c => c.name === 'objections_addressed')!.passed).toBe(false);
    // Same html with zero fatal challenges passes regardless of visible objections.
    const r2 = evaluateThinkTankForm({ html: bare, fatalChallenges: 0, stats: {} });
    expect(r2.criteria.find(c => c.name === 'objections_addressed')!.passed).toBe(true);
  });

  it('pipeline_integrity fails on critical degraded steps, tolerates non-critical', () => {
    const base = { html: fullThinkTankHtml, fatalChallenges: 0 };
    const clean = evaluateThinkTankForm({ ...base, stats: { computedExhibit: 'both' } });
    expect(clean.criteria.find(c => c.name === 'pipeline_integrity')!.passed).toBe(true);

    const critical = evaluateThinkTankForm({
      ...base,
      stats: { computedExhibit: 'both', degradedSteps: [{ step: 'FACT_CHECKER', reason: 'x' }] },
    });
    expect(critical.criteria.find(c => c.name === 'pipeline_integrity')!.passed).toBe(false);

    const minor = evaluateThinkTankForm({
      ...base,
      stats: { computedExhibit: 'both', degradedSteps: [{ step: 'HERO_IMAGE' }] },
    });
    expect(minor.criteria.find(c => c.name === 'pipeline_integrity')!.passed).toBe(true);
  });

  it('computed_exhibit passes from stats or markup', () => {
    const noStats = evaluateThinkTankForm({ html: fullThinkTankHtml, fatalChallenges: 0, stats: {} });
    expect(noStats.criteria.find(c => c.name === 'computed_exhibit')!.passed).toBe(true); // markup present
    const noMarkup = evaluateThinkTankHtml => evaluateThinkTankForm({
      html: fullThinkTankHtml.replace('id="computed-exhibit"', 'id="other"'),
      fatalChallenges: 0, stats: { computedExhibit: 'evidence_base' },
    });
    expect(noMarkup(fullThinkTankHtml).criteria.find(c => c.name === 'computed_exhibit')!.passed).toBe(true);
  });
});
