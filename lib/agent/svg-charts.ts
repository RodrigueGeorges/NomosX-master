/**
 * SVG Chart Generator — inline SVG visualizations for strategic reports.
 *
 * Inspired by:
 * - CSIS: "data-rich graphics and maps that provide fresh insights"
 * - IISS Strategic Survey: "Data-rich graphics and maps"
 *
 * Generates static SVG (no JS) that renders in any browser/email client.
 * Supports: line charts (trends), bar charts (comparisons).
 */

import type { QuantSeries } from './quant-agent';

interface ChartOptions {
  width?: number;
  height?: number;
  title?: string;
  unit?: string;
}

/**
 * Generate a line chart SVG from one or more QuantSeries.
 * Each series gets a distinct color. X-axis = time, Y-axis = value.
 */
export function renderLineChartSvg(series: QuantSeries[], opts: ChartOptions = {}): string {
  if (!series || series.length === 0) return '';
  const width = opts.width || 600;
  const height = opts.height || 220;
  const padding = { top: 30, right: 20, bottom: 35, left: 55 };
  const plotW = width - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;

  // Collect all points to compute global min/max
  const allPoints = series.flatMap(s => s.points);
  if (allPoints.length === 0) return '';

  const values = allPoints.map(p => p.v).filter(v => Number.isFinite(v));
  const minV = Math.min(...values);
  const maxV = Math.max(...values);
  const vRange = maxV - minV || 1;
  const padV = vRange * 0.1;
  const yMin = minV - padV;
  const yMax = maxV + padV;
  const yRange = yMax - yMin;

  // X scale: time-based
  const timestamps = allPoints.map(p => new Date(p.t).getTime()).filter(t => !isNaN(t));
  const minT = Math.min(...timestamps);
  const maxT = Math.max(...timestamps);
  const tRange = maxT - minT || 1;

  const colors = ['#f0f0fa', '#5EEAD4', '#FB7185', '#FBBF24', '#A78BFA', '#60A5FA'];
  const gridColor = 'rgba(240,240,250,0.06)';
  const axisColor = 'rgba(240,240,250,0.25)';

  // Y-axis grid lines (5 ticks)
  const yTicks = Array.from({ length: 5 }, (_, i) => {
    const v = yMin + (yRange * i) / 4;
    const y = padding.top + plotH - ((v - yMin) / yRange) * plotH;
    return { v, y };
  });

  // X-axis labels (3-4 ticks)
  const xTickCount = Math.min(4, allPoints.length);
  const xTicks = Array.from({ length: xTickCount }, (_, i) => {
    const t = minT + (tRange * i) / (xTickCount - 1);
    const x = padding.left + ((t - minT) / tRange) * plotW;
    const date = new Date(t);
    const label = date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    return { x, label };
  });

  // Build SVG paths for each series
  const seriesPaths = series.map((s, idx) => {
    const color = colors[idx % colors.length];
    const points = s.points
      .filter(p => Number.isFinite(p.v) && !isNaN(new Date(p.t).getTime()))
      .sort((a, b) => new Date(a.t).getTime() - new Date(b.t).getTime());
    if (points.length === 0) return { path: '', color, label: s.label };

    const pathData = points.map((p, i) => {
      const t = new Date(p.t).getTime();
      const x = padding.left + ((t - minT) / tRange) * plotW;
      const y = padding.top + plotH - ((p.v - yMin) / yRange) * plotH;
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    }).join(' ');

    return { path: pathData, color, label: s.label };
  });

  // Legend
  const legend = seriesPaths.map((sp, idx) => {
    const x = padding.left + idx * 150;
    return `
      <line x1="${x}" y1="${height - 12}" x2="${x + 15}" y2="${height - 12}" stroke="${sp.color}" stroke-width="2"/>
      <text x="${x + 20}" y="${height - 9}" font-family="monospace" font-size="9" fill="rgba(240,240,250,0.6)">${escapeXml(sp.label.slice(0, 20))}</text>`;
  }).join('');

  // Y-axis labels
  const yLabels = yTicks.map(t => `
    <line x1="${padding.left}" y1="${t.y}" x2="${width - padding.right}" y2="${t.y}" stroke="${gridColor}" stroke-width="1"/>
    <text x="${padding.left - 8}" y="${t.y + 3}" text-anchor="end" font-family="monospace" font-size="9" fill="rgba(240,240,250,0.4)">${formatNumber(t.v)}</text>`).join('');

  // X-axis labels
  const xLabels = xTicks.map(t => `
    <text x="${t.x}" y="${height - padding.bottom + 18}" text-anchor="middle" font-family="monospace" font-size="9" fill="rgba(240,240,250,0.4)">${t.label}</text>`).join('');

  // Series paths
  const paths = seriesPaths.map(sp => `
    <path d="${sp.path}" fill="none" stroke="${sp.color}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>`).join('');

  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;">
    ${opts.title ? `<text x="${padding.left}" y="15" font-family="monospace" font-size="10" fill="rgba(240,240,250,0.6)" text-transform="uppercase" letter-spacing="1">${escapeXml(opts.title)}</text>` : ''}
    ${yLabels}
    <line x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${padding.top + plotH}" stroke="${axisColor}" stroke-width="1"/>
    <line x1="${padding.left}" y1="${padding.top + plotH}" x2="${width - padding.right}" y2="${padding.top + plotH}" stroke="${axisColor}" stroke-width="1"/>
    ${xLabels}
    ${paths}
    ${legend}
  </svg>`;
}

/**
 * Generate a bar chart SVG from labeled values.
 * Useful for comparing scenarios, stakeholders, or categories.
 */
export function renderBarChartSvg(
  bars: Array<{ label: string; value: number; color?: string }>,
  opts: ChartOptions = {},
): string {
  if (!bars || bars.length === 0) return '';
  const width = opts.width || 500;
  const height = opts.height || 200;
  const padding = { top: 30, right: 20, bottom: 45, left: 55 };
  const plotW = width - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;

  const values = bars.map(b => b.value);
  const maxV = Math.max(...values, 0);
  const minV = Math.min(...values, 0);
  const yRange = maxV - minV || 1;

  const barWidth = plotW / bars.length * 0.7;
  const barGap = plotW / bars.length * 0.3;
  const defaultColors = ['#f0f0fa', '#5EEAD4', '#FB7185', '#FBBF24', '#A78BFA', '#60A5FA'];

  const gridColor = 'rgba(240,240,250,0.06)';
  const axisColor = 'rgba(240,240,250,0.25)';

  // Y-axis grid
  const yTicks = Array.from({ length: 4 }, (_, i) => {
    const v = minV + (yRange * i) / 3;
    const y = padding.top + plotH - ((v - minV) / yRange) * plotH;
    return { v, y };
  });

  const yLabels = yTicks.map(t => `
    <line x1="${padding.left}" y1="${t.y}" x2="${width - padding.right}" y2="${t.y}" stroke="${gridColor}" stroke-width="1"/>
    <text x="${padding.left - 8}" y="${t.y + 3}" text-anchor="end" font-family="monospace" font-size="9" fill="rgba(240,240,250,0.4)">${formatNumber(t.v)}</text>`).join('');

  const barsSvg = bars.map((b, i) => {
    const x = padding.left + i * (barWidth + barGap) + barGap / 2;
    const barH = (Math.abs(b.value - minV) / yRange) * plotH;
    const y = b.value >= 0
      ? padding.top + plotH - ((b.value - minV) / yRange) * plotH
      : padding.top + plotH - ((0 - minV) / yRange) * plotH;
    const color = b.color || defaultColors[i % defaultColors.length];
    const label = b.label.length > 15 ? b.label.slice(0, 13) + '…' : b.label;
    return `
      <rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barWidth.toFixed(1)}" height="${barH.toFixed(1)}" fill="${color}" opacity="0.8" rx="2"/>
      <text x="${(x + barWidth / 2).toFixed(1)}" y="${(height - padding.bottom + 15).toFixed(1)}" text-anchor="middle" font-family="monospace" font-size="8" fill="rgba(240,240,250,0.5)">${escapeXml(label)}</text>
      <text x="${(x + barWidth / 2).toFixed(1)}" y="${(y - 5).toFixed(1)}" text-anchor="middle" font-family="monospace" font-size="9" fill="rgba(240,240,250,0.7)">${formatNumber(b.value)}</text>`;
  }).join('');

  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;">
    ${opts.title ? `<text x="${padding.left}" y="15" font-family="monospace" font-size="10" fill="rgba(240,240,250,0.6)" text-transform="uppercase" letter-spacing="1">${escapeXml(opts.title)}</text>` : ''}
    ${yLabels}
    <line x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${padding.top + plotH}" stroke="${axisColor}" stroke-width="1"/>
    <line x1="${padding.left}" y1="${padding.top + plotH}" x2="${width - padding.right}" y2="${padding.top + plotH}" stroke="${axisColor}" stroke-width="1"/>
    ${barsSvg}
  </svg>`;
}

/**
 * Render a scenario probability chart — bar chart of scenario probabilities.
 */
export function renderScenarioChartSvg(
  scenarios: Array<{ name: string; probabilityValue?: number; probability?: string }>,
): string {
  const bars = scenarios
    .filter(s => s.probabilityValue != null || s.probability)
    .map(s => {
      const v = s.probabilityValue ?? (s.probability === 'high' ? 0.75 : s.probability === 'medium' ? 0.5 : 0.25);
      return {
        label: s.name.length > 20 ? s.name.slice(0, 18) + '…' : s.name,
        value: v * 100,
        unit: '%',
      };
    });
  if (bars.length === 0) return '';
  return renderBarChartSvg(bars, { title: 'Scenario Probabilities', height: 180 });
}

function formatNumber(v: number): string {
  if (Math.abs(v) >= 1000) return (v / 1000).toFixed(1) + 'k';
  if (Math.abs(v) >= 100) return v.toFixed(0);
  if (Math.abs(v) >= 10) return v.toFixed(1);
  return v.toFixed(2);
}

/**
 * Inject a quantitative data section (with SVG charts) into an HTML brief.
 *
 * Looks for a `<!-- QUANT_CHARTS -->` placeholder or appends before `</article>`.
 * Each QuantSeries becomes a line or bar chart depending on its shape.
 */
export function injectQuantSection(html: string, chartData: QuantSeries[]): string {
  if (!chartData || chartData.length === 0) return html;

  const charts = chartData
    .map((series) => {
      // Use line chart for time-series (x-axis is dates), bar chart otherwise
      const hasTimeAxis = series.points?.[0]?.t && /^\d{4}/.test(String(series.points[0].t));
      const svg = hasTimeAxis
        ? renderLineChartSvg([series], { title: series.label })
        : renderBarChartSvg(
            series.points.map((p) => ({ label: String(p.t), value: p.v })),
            { title: series.label }
          );
      return svg ? `<figure class="nx-chart">${svg}</figure>` : '';
    })
    .filter(Boolean)
    .join('\n');

  if (!charts) return html;

  const section = `<section id="quantitative-data" class="nx-quant-section">
  <h2>Quantitative Data</h2>
  ${charts}
</section>`;

  // Try to replace placeholder, otherwise insert before </article>
  if (html.includes('<!-- QUANT_CHARTS -->')) {
    return html.replace('<!-- QUANT_CHARTS -->', section);
  }
  if (html.includes('</article>')) {
    return html.replace('</article>', `${section}\n</article>`);
  }
  return html + section;
}

function escapeXml(s: string): string {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
