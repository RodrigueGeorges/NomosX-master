/**
 * COMPUTED EXHIBIT — lever 7 (think-tank form).
 *
 * Every published note must carry one piece produced by CODE, reproducible
 * from stated inputs — not prose. Two exhibit kinds, in priority order:
 *
 *  1. MODEL RESULTS — deterministic quantitative models (quant-bridge:
 *     parametric costing, FIGARO IO). Rendered as a table with method,
 *     data sources, ranges and caveats. These are the strongest exhibits:
 *     primary-data-derived, fully reproducible.
 *
 *  2. EVIDENCE BASE — corpus composition computed from the source list and
 *     reader depths: provider mix, year spread, reading-depth share. Always
 *     available; makes the evidence base itself an inspectable artifact.
 *
 * Injection is post-render and deterministic: same inputs → same HTML.
 * Never blocks the pipeline — a malformed input yields ''.
 */

import type { ModelResult } from '../quant/types';

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, m =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m] as string));

function fmtValue(r: { value: number; unit: string; low?: number; high?: number }): string {
  const v = Number.isFinite(r.value) ? r.value : r.value;
  const num = (n: number) => Math.abs(n) >= 1000 ? n.toLocaleString('en-US', { maximumFractionDigits: 1 }) : String(Number(n.toFixed(4)));
  const range = r.low !== undefined && r.high !== undefined ? ` (${num(r.low)}–${num(r.high)})` : '';
  return `${num(v)}${range} ${esc(r.unit)}`.trim();
}

function modelTable(m: ModelResult): string {
  const rows = (m.rows ?? []).map(r =>
    `<tr><td>${esc(r.label)}</td><td style="text-align:right;">${fmtValue(r)}</td></tr>`
  ).join('');
  return `<div class="computed-model" style="margin:1rem 0;padding:0.75rem;border:1px solid #334155;border-radius:6px;">
    <h3 style="margin:0 0 0.25rem;font-size:1rem;">${esc(m.name)} <span style="color:#94a3b8;font-weight:400;">[MODEL-${m.modelRef}]</span></h3>
    <p style="margin:0 0 0.5rem;font-size:0.8125rem;color:#94a3b8;">Method: ${esc(m.methodology)} · Data: ${esc((m.dataSources ?? []).join('; ') || 'caller assumptions')}</p>
    <table style="width:100%;border-collapse:collapse;font-size:0.875rem;">
      <thead><tr style="text-align:left;border-bottom:1px solid #334155;"><th>Result</th><th style="text-align:right;">Value</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p style="margin:0.5rem 0 0;font-size:0.75rem;color:#94a3b8;">Caveats: ${esc((m.caveats ?? []).join(' '))}</p>
  </div>`;
}

function evidenceBaseTable(sources: any[], readings: any[]): string {
  if (!sources.length) return '';
  const byProvider = new Map<string, number>();
  const byYear = new Map<string, number>();
  const depthById = new Map<string, string>();
  for (const r of readings ?? []) if (r?.sourceId && r?.readingDepth) depthById.set(r.sourceId, r.readingDepth);
  let fullText = 0, abstract = 0, ruleBased = 0, unscored = 0;
  for (const s of sources) {
    const p = String(s.provider || 'unknown');
    byProvider.set(p, (byProvider.get(p) ?? 0) + 1);
    const y = s.year ? String(s.year).slice(0, 4) : null;
    if (y && /^\d{4}$/.test(y)) byYear.set(y, (byYear.get(y) ?? 0) + 1);
    const d = depthById.get(s.id);
    if (d === 'full_text') fullText++; else if (d === 'abstract') abstract++; else if (d === 'rule_based') ruleBased++; else unscored++;
  }
  const topProviders = [...byProvider.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  const providerRows = topProviders.map(([p, n]) =>
    `<tr><td>${esc(p)}</td><td style="text-align:right;">${n}</td><td style="text-align:right;">${Math.round((n / sources.length) * 100)}%</td></tr>`).join('');
  const yearRows = [...byYear.entries()].sort().map(([y, n]) =>
    `<tr><td>${esc(y)}</td><td style="text-align:right;">${n}</td></tr>`).join('');
  const pct = (n: number) => `${Math.round((n / sources.length) * 100)}%`;

  // Computed indices — derived quantities, not counts: these are the
  // analytical content of the exhibit (repasse 2026-11-14: a composition
  // table alone is not an original contribution).
  const n = sources.length;
  const hhi = [...byProvider.values()].reduce((acc, c) => acc + (c / n) ** 2, 0); // 1/n..1, lower = more diverse
  const domains = new Set(sources.map(s => {
    const u = String(s.url || s.sourceUrl || '');
    const m = u.match(/^https?:\/\/(?:www\.)?([^/?#]+)/i);
    return m ? m[1].toLowerCase() : '';
  }).filter(Boolean));
  const domainDiversity = domains.size / n;
  const years = [...byYear.keys()].map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  const medianYear = years.length ? years[Math.floor(years.length / 2)] : null;
  const latestYear = years.length ? years[years.length - 1] : null;
  const indices = [
    ['Provider concentration (HHI)', hhi.toFixed(3), hhi < 0.15 ? 'diversified' : hhi < 0.35 ? 'moderate' : 'concentrated'],
    ['Domain diversity', domainDiversity.toFixed(2), `${domains.size} unique domains / ${n} sources`],
    ['Median source year', medianYear ? String(medianYear) : 'n/a', latestYear ? `latest ${latestYear}` : ''],
    ['Full-text coverage', pct(fullText), `${fullText}/${n} sources read in full`],
  ];
  const indexRows = indices.map(([k, v, note]) =>
    `<tr><td>${esc(k)}</td><td style="text-align:right;font-weight:600;">${esc(v)}</td><td style="color:#94a3b8;">${esc(note)}</td></tr>`).join('');

  return `<div class="computed-evidence-base" style="margin:1rem 0;padding:0.75rem;border:1px solid #334155;border-radius:6px;">
    <h3 style="margin:0 0 0.25rem;font-size:1rem;">Evidence Base — computed from the source corpus</h3>
    <p style="margin:0 0 0.5rem;font-size:0.8125rem;color:#94a3b8;">${sources.length} sources · ${fullText} full text (${pct(fullText)}) · ${abstract} abstract (${pct(abstract)}) · ${ruleBased} metadata only${unscored ? ` · ${unscored} unscored` : ''}</p>
    <div style="display:flex;gap:2rem;flex-wrap:wrap;">
      <table style="border-collapse:collapse;font-size:0.8125rem;">
        <thead><tr style="text-align:left;border-bottom:1px solid #334155;"><th>Provider</th><th style="text-align:right;">Sources</th><th style="text-align:right;">Share</th></tr></thead>
        <tbody>${providerRows}</tbody>
      </table>
      ${yearRows ? `<table style="border-collapse:collapse;font-size:0.8125rem;">
        <thead><tr style="text-align:left;border-bottom:1px solid #334155;"><th>Year</th><th style="text-align:right;">Sources</th></tr></thead>
        <tbody>${yearRows}</tbody>
      </table>` : ''}
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:0.8125rem;margin-top:0.5rem;">
      <thead><tr style="text-align:left;border-bottom:1px solid #334155;"><th>Computed index</th><th style="text-align:right;">Value</th><th>Reading</th></tr></thead>
      <tbody>${indexRows}</tbody>
    </table>
    <p style="margin:0.5rem 0 0;font-size:0.75rem;color:#94a3b8;">Computed deterministically by the pipeline from the retained corpus — reproducible from the published source list.</p>
  </div>`;
}

export interface ComputedExhibitResult {
  html: string;
  kind: 'model_results' | 'evidence_base' | 'both' | 'none';
}

/**
 * Build the computed exhibit section. Returns '' when there is genuinely
 * nothing computable (no models AND fewer than 3 sources).
 */
export function buildComputedExhibit(opts: {
  modelResults?: ModelResult[] | null;
  topSources: any[];
  readings?: any[];
}): ComputedExhibitResult {
  try {
    const models = (opts.modelResults ?? []).filter(m => m && (m.rows?.length ?? 0) > 0);
    const hasModels = models.length > 0;
    const hasCorpus = (opts.topSources?.length ?? 0) >= 3;
    if (!hasModels && !hasCorpus) return { html: '', kind: 'none' };

    const parts: string[] = [];
    if (hasModels) parts.push(...models.map(modelTable));
    if (hasCorpus) parts.push(evidenceBaseTable(opts.topSources, opts.readings ?? []));
    if (parts.length === 0) return { html: '', kind: 'none' };

    const kind: ComputedExhibitResult['kind'] = hasModels && hasCorpus ? 'both' : hasModels ? 'model_results' : 'evidence_base';
    const html = `<section id="computed-exhibit" class="nx-computed-exhibit">
  <h2>Computed Exhibit</h2>
  <p style="font-size:0.875rem;color:#94a3b8;margin:0 0 0.75rem;">Produced by deterministic code from primary data and the retained corpus — reproducible, not generated prose.</p>
  ${parts.join('\n')}
</section>`;
    return { html, kind };
  } catch {
    return { html: '', kind: 'none' };
  }
}

/** Inject before </article>, or before the references section when present. */
export function injectComputedExhibit(html: string, exhibitHtml: string): string {
  if (!exhibitHtml || !html) return html;
  if (html.includes('<!-- COMPUTED_EXHIBIT -->')) {
    return html.replace('<!-- COMPUTED_EXHIBIT -->', exhibitHtml);
  }
  // Prefer landing before the references/sources section so the exhibit
  // sits with the analysis, not after the bibliography.
  const refIdx = html.search(/<section[^>]*class="[^"]*references-section/);
  if (refIdx > 0) return html.slice(0, refIdx) + exhibitHtml + '\n' + html.slice(refIdx);
  if (html.includes('</article>')) return html.replace('</article>', `${exhibitHtml}\n</article>`);
  return html + exhibitHtml;
}
