/**
 * computed-exhibit — lever 7: every published note carries one piece
 * produced by deterministic code (model table and/or evidence-base table).
 */

import { buildComputedExhibit, injectComputedExhibit } from '@/lib/agent/computed-exhibit';
import type { ModelResult } from '@/lib/quant/types';

const model: ModelResult = {
  modelRef: 1,
  kind: 'figaro_io',
  name: 'FIGARO IO shock — chemicals',
  methodology: 'Leontief inverse on 2021 table',
  dataSources: ['Eurostat FIGARO 2021'],
  parameters: [],
  rows: [
    { label: 'Output multiplier', value: 1.42, unit: 'x', low: 1.31, high: 1.55 },
    { label: 'Value added impact', value: 2.1, unit: 'bn EUR' },
  ],
  caveats: ['Static model — no price feedback'],
  computedAt: '2026-11-12T00:00:00Z',
  durationMs: 120,
};

const sources = [
  { id: 's1', provider: 'openalex', year: 2023, title: 'A' },
  { id: 's2', provider: 'worldbank', year: 2022, title: 'B' },
  { id: 's3', provider: 'openalex', year: 2024, title: 'C' },
  { id: 's4', provider: 'tavily', year: 2024, title: 'D' },
];
const readings = [
  { sourceId: 's1', readingDepth: 'full_text' },
  { sourceId: 's2', readingDepth: 'abstract' },
  { sourceId: 's3', readingDepth: 'full_text' },
];

describe('buildComputedExhibit', () => {
  it('renders model results + evidence base when both exist', () => {
    const r = buildComputedExhibit({ modelResults: [model], topSources: sources, readings });
    expect(r.kind).toBe('both');
    expect(r.html).toContain('[MODEL-1]');
    expect(r.html).toContain('Output multiplier');
    expect(r.html).toContain('1.31–1.55');
    expect(r.html).toContain('Evidence Base');
    expect(r.html).toContain('full text (50%)');
  });

  it('falls back to evidence base alone with no models', () => {
    const r = buildComputedExhibit({ modelResults: [], topSources: sources, readings });
    expect(r.kind).toBe('evidence_base');
    expect(r.html).not.toContain('MODEL-');
    expect(r.html).toContain('worldbank');
  });

  it('returns none with no models and a tiny corpus', () => {
    const r = buildComputedExhibit({ modelResults: [], topSources: sources.slice(0, 2) });
    expect(r.kind).toBe('none');
    expect(r.html).toBe('');
  });

  it('is deterministic — same inputs, same html', () => {
    const a = buildComputedExhibit({ modelResults: [model], topSources: sources, readings });
    const b = buildComputedExhibit({ modelResults: [model], topSources: sources, readings });
    expect(a.html).toBe(b.html);
  });
});

describe('injectComputedExhibit', () => {
  it('lands before the references section', () => {
    const html = '<article><p>body</p><section class="references-section"><h2>Sources</h2></section></article>';
    const out = injectComputedExhibit(html, '<section id="computed-exhibit">X</section>');
    expect(out.indexOf('computed-exhibit')).toBeLessThan(out.indexOf('references-section'));
  });

  it('is a no-op on empty exhibit', () => {
    const html = '<article>x</article>';
    expect(injectComputedExhibit(html, '')).toBe(html);
  });
});
