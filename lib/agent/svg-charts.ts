/**
 * NomosX SVG Chart Renderer — Zero-dependency server-side charts
 *
 * Renders QuantSeries into clean, print-quality inline SVG line charts
 * for embedding in publication HTML. Styled to match premium think-tank
 * aesthetics (thin lines, subtle grid, annotated latest value).
 */

import type { QuantSeries } from './quant-agent';

const W = 720;
const H = 280;
const PAD = { top: 28, right: 96, bottom: 36, left: 64 };

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmtNum(n: number): string {
  if (Math.abs(n) >= 1000) return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (Math.abs(n) >= 100) return n.toFixed(0);
  if (Math.abs(n) >= 1) return n.toFixed(1);
  return n.toFixed(2);
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

/**
 * Render a single QuantSeries as an inline SVG line chart.
 */
export function renderSeriesChart(s: QuantSeries): string {
  const pts = s.points.filter(p => Number.isFinite(p.v));
  if (pts.length < 3) return '';

  const values = pts.map(p => p.v);
  const vMin = Math.min(...values);
  const vMax = Math.max(...values);
  const range = vMax - vMin || 1;
  const yLo = vMin - range * 0.08;
  const yHi = vMax + range * 0.08;

  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  const x = (i: number) => PAD.left + (i / (pts.length - 1)) * plotW;
  const y = (v: number) => PAD.top + plotH - ((v - yLo) / (yHi - yLo)) * plotH;

  // Line path
  const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');

  // Area fill path
  const area = `${path} L${x(pts.length - 1).toFixed(1)},${(PAD.top + plotH).toFixed(1)} L${PAD.left},${(PAD.top + plotH).toFixed(1)} Z`;

  // Y grid: 4 lines
  const gridLines: string[] = [];
  const yLabels: string[] = [];
  for (let i = 0; i <= 4; i++) {
    const v = yLo + ((yHi - yLo) * i) / 4;
    const yPos = y(v);
    gridLines.push(`<line x1="${PAD.left}" y1="${yPos.toFixed(1)}" x2="${W - PAD.right}" y2="${yPos.toFixed(1)}" stroke="#e5e7eb" stroke-width="1"/>`);
    yLabels.push(`<text x="${PAD.left - 8}" y="${(yPos + 4).toFixed(1)}" text-anchor="end" font-size="11" fill="#6b7280">${fmtNum(v)}</text>`);
  }

  // X labels: first, middle, last
  const xIdx = [0, Math.floor(pts.length / 2), pts.length - 1];
  const xLabels = xIdx.map(i =>
    `<text x="${x(i).toFixed(1)}" y="${H - 12}" text-anchor="middle" font-size="11" fill="#6b7280">${fmtDate(pts[i].t)}</text>`
  );

  // Latest value annotation
  const lastX = x(pts.length - 1);
  const lastY = y(pts[pts.length - 1].v);
  const trendColor = s.trend === 'rising' ? '#dc2626' : s.trend === 'falling' ? '#16a34a' : '#2563eb';
  const changeLabel = s.changePct !== null ? ` (${s.changePct > 0 ? '+' : ''}${s.changePct}%)` : '';

  return `<figure class="nomosx-chart" style="margin:24px 0;">
<svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:${W}px;font-family:Inter,system-ui,sans-serif;background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;" role="img" aria-label="${esc(s.label)}">
  <text x="${PAD.left}" y="18" font-size="13" font-weight="600" fill="#111827">${esc(s.label)}</text>
  <text x="${W - PAD.right}" y="18" text-anchor="end" font-size="11" fill="#6b7280">${esc(s.unit)}</text>
  ${gridLines.join('\n  ')}
  ${yLabels.join('\n  ')}
  <path d="${area}" fill="${trendColor}" opacity="0.06"/>
  <path d="${path}" fill="none" stroke="${trendColor}" stroke-width="2" stroke-linejoin="round"/>
  <circle cx="${lastX.toFixed(1)}" cy="${lastY.toFixed(1)}" r="3.5" fill="${trendColor}"/>
  <text x="${(lastX + 8).toFixed(1)}" y="${(lastY + 4).toFixed(1)}" font-size="12" font-weight="600" fill="${trendColor}">${fmtNum(s.latest)}${esc(changeLabel)}</text>
  ${xLabels.join('\n  ')}
</svg>
<figcaption style="font-size:11px;color:#6b7280;margin-top:6px;">Source: ${esc(s.provider)} — official API data, fetched ${new Date().toISOString().slice(0, 10)}. Window mean: ${fmtNum(s.mean)} ${esc(s.unit)}, range ${fmtNum(s.min)}–${fmtNum(s.max)}.</figcaption>
</figure>`;
}

/**
 * Render all chart-worthy series as a "Data Dashboard" HTML section.
 * Returns empty string if no series available.
 */
export function renderQuantSection(series: QuantSeries[]): string {
  const charts = series.map(renderSeriesChart).filter(Boolean);
  if (charts.length === 0) return '';
  return `<section class="nomosx-quant-section">
<h2 style="font-size:18px;margin:32px 0 8px;">Primary Data Signals</h2>
<p style="font-size:13px;color:#6b7280;margin:0 0 16px;">Live quantitative evidence fetched from official APIs and computed deterministically — no model estimation involved.</p>
${charts.join('\n')}
</section>`;
}

/**
 * Inject the quant section into publication HTML, before the sources/references
 * section if detectable, otherwise before </body> or appended at the end.
 */
export function injectQuantSection(html: string, series: QuantSeries[]): string {
  const section = renderQuantSection(series);
  if (!section) return html;

  // Try before a references/sources heading
  const refMatch = html.match(/<h2[^>]*>\s*(References|Sources|Bibliography|Références)/i);
  if (refMatch && refMatch.index !== undefined) {
    return html.slice(0, refMatch.index) + section + '\n' + html.slice(refMatch.index);
  }
  // Try before </body>
  const bodyIdx = html.lastIndexOf('</body>');
  if (bodyIdx !== -1) {
    return html.slice(0, bodyIdx) + section + '\n' + html.slice(bodyIdx);
  }
  return html + '\n' + section;
}
