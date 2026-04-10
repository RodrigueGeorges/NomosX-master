/**
 * Chart Generator — SVG Charts for Pipeline HTML Reports
 * 
 * Generates inline SVG charts that can be embedded directly in HTML briefs
 * and strategic reports without requiring client-side JavaScript.
 * 
 * Used by: renderBriefHTML, renderStrategicReportHTML
 */

// ─── Colors ────────────────────────────────────────────────────────────────
const PALETTE = [
  '#6366f1', '#8b5cf6', '#a78bfa', '#818cf8',
  '#7c3aed', '#4f46e5', '#6d28d9', '#5b21b6',
  '#c084fc', '#a855f7', '#9333ea', '#7e22ce',
];

const POSITIVE_COLOR = '#38a169';
const NEGATIVE_COLOR = '#e53e3e';
const MIXED_COLOR = '#d69e2e';
const GRID_COLOR = '#e2e8f0';
const TEXT_COLOR = '#4a5568';
const LABEL_COLOR = '#718096';

// ─── Evidence Quality Gauge ────────────────────────────────────────────────

/**
 * Renders a semi-circular gauge for evidence quality score (1-10).
 */
export function renderEvidenceGaugeSVG(score: number, label = 'Evidence Quality'): string {
  const clamped = Math.max(0, Math.min(10, score));
  const percent = clamped / 10;
  const angle = percent * 180;
  const color = clamped >= 7 ? POSITIVE_COLOR : clamped >= 4 ? MIXED_COLOR : NEGATIVE_COLOR;
  
  // Arc calculation
  const cx = 120, cy = 110, r = 80;
  const startAngle = Math.PI;
  const endAngle = Math.PI + (angle * Math.PI / 180);
  const x1 = cx + r * Math.cos(startAngle);
  const y1 = cy + r * Math.sin(startAngle);
  const x2 = cx + r * Math.cos(endAngle);
  const y2 = cy + r * Math.sin(endAngle);
  const largeArc = angle > 180 ? 1 : 0;

  return `
  <svg viewBox="0 0 240 140" xmlns="http://www.w3.org/2000/svg" style="max-width:280px;margin:16px auto;display:block;">
    <!-- Background arc -->
    <path d="M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}" fill="none" stroke="${GRID_COLOR}" stroke-width="16" stroke-linecap="round"/>
    <!-- Score arc -->
    <path d="M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}" fill="none" stroke="${color}" stroke-width="16" stroke-linecap="round"/>
    <!-- Score text -->
    <text x="${cx}" y="${cy - 8}" text-anchor="middle" font-size="32" font-weight="700" fill="${color}">${clamped.toFixed(1)}</text>
    <text x="${cx}" y="${cy + 14}" text-anchor="middle" font-size="11" fill="${LABEL_COLOR}">/10</text>
    <!-- Label -->
    <text x="${cx}" y="${cy + 34}" text-anchor="middle" font-size="11" fill="${TEXT_COLOR}" font-weight="500">${escSvg(label)}</text>
  </svg>`;
}

// ─── Horizontal Bar Chart ──────────────────────────────────────────────────

export interface BarChartItem {
  label: string;
  value: number;
  color?: string;
}

/**
 * Renders a horizontal bar chart (e.g., for stakeholder impact, scenario probabilities).
 */
export function renderHorizontalBarSVG(
  items: BarChartItem[],
  title?: string,
  options?: { maxValue?: number; width?: number; showValues?: boolean }
): string {
  if (!items.length) return '';
  const { maxValue, width = 500, showValues = true } = options || {};
  const max = maxValue || Math.max(...items.map(i => i.value), 1);
  const barHeight = 28;
  const gap = 8;
  const labelWidth = 140;
  const chartWidth = width - labelWidth - 60;
  const totalHeight = items.length * (barHeight + gap) + (title ? 32 : 0) + 16;

  const bars = items.map((item, i) => {
    const y = (title ? 36 : 8) + i * (barHeight + gap);
    const barW = Math.max(2, (item.value / max) * chartWidth);
    const color = item.color || PALETTE[i % PALETTE.length];
    return `
      <text x="${labelWidth - 8}" y="${y + barHeight / 2 + 4}" text-anchor="end" font-size="11" fill="${TEXT_COLOR}">${escSvg(item.label)}</text>
      <rect x="${labelWidth}" y="${y}" width="${barW}" height="${barHeight}" rx="4" fill="${color}" opacity="0.85"/>
      ${showValues ? `<text x="${labelWidth + barW + 6}" y="${y + barHeight / 2 + 4}" font-size="11" fill="${LABEL_COLOR}" font-weight="600">${item.value}</text>` : ''}
    `;
  }).join('');

  return `
  <svg viewBox="0 0 ${width} ${totalHeight}" xmlns="http://www.w3.org/2000/svg" style="max-width:${width}px;margin:16px auto;display:block;">
    ${title ? `<text x="${width / 2}" y="20" text-anchor="middle" font-size="13" font-weight="600" fill="${TEXT_COLOR}">${escSvg(title)}</text>` : ''}
    ${bars}
  </svg>`;
}

// ─── Donut Chart ───────────────────────────────────────────────────────────

export interface DonutItem {
  label: string;
  value: number;
  color?: string;
}

/**
 * Renders a donut chart (e.g., for source distribution by provider).
 */
export function renderDonutSVG(items: DonutItem[], title?: string): string {
  if (!items.length) return '';
  const total = items.reduce((s, i) => s + i.value, 0);
  if (total === 0) return '';

  const cx = 120, cy = 120, r = 80, innerR = 50;
  let currentAngle = -Math.PI / 2;
  const slices: string[] = [];
  const legends: string[] = [];

  items.forEach((item, i) => {
    const angle = (item.value / total) * 2 * Math.PI;
    const color = item.color || PALETTE[i % PALETTE.length];
    const x1 = cx + r * Math.cos(currentAngle);
    const y1 = cy + r * Math.sin(currentAngle);
    const x2 = cx + r * Math.cos(currentAngle + angle);
    const y2 = cy + r * Math.sin(currentAngle + angle);
    const ix1 = cx + innerR * Math.cos(currentAngle + angle);
    const iy1 = cy + innerR * Math.sin(currentAngle + angle);
    const ix2 = cx + innerR * Math.cos(currentAngle);
    const iy2 = cy + innerR * Math.sin(currentAngle);
    const largeArc = angle > Math.PI ? 1 : 0;

    slices.push(`<path d="M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} L ${ix1} ${iy1} A ${innerR} ${innerR} 0 ${largeArc} 0 ${ix2} ${iy2} Z" fill="${color}" opacity="0.85"/>`);

    const pct = Math.round((item.value / total) * 100);
    const ly = 16 + i * 20;
    legends.push(`
      <rect x="260" y="${ly}" width="12" height="12" rx="2" fill="${color}"/>
      <text x="278" y="${ly + 10}" font-size="11" fill="${TEXT_COLOR}">${escSvg(item.label)} (${pct}%)</text>
    `);

    currentAngle += angle;
  });

  const height = Math.max(240, items.length * 20 + 20);
  return `
  <svg viewBox="0 0 440 ${height}" xmlns="http://www.w3.org/2000/svg" style="max-width:440px;margin:16px auto;display:block;">
    ${title ? `<text x="120" y="${height - 4}" text-anchor="middle" font-size="12" font-weight="600" fill="${TEXT_COLOR}">${escSvg(title)}</text>` : ''}
    <!-- Center label -->
    <text x="${cx}" y="${cy - 4}" text-anchor="middle" font-size="22" font-weight="700" fill="${TEXT_COLOR}">${total}</text>
    <text x="${cx}" y="${cy + 14}" text-anchor="middle" font-size="10" fill="${LABEL_COLOR}">total</text>
    ${slices.join('')}
    ${legends.join('')}
  </svg>`;
}

// ─── Scenario Probability Chart ────────────────────────────────────────────

export interface ScenarioData {
  name: string;
  probability: 'high' | 'medium' | 'low';
  description?: string;
}

/**
 * Renders a scenario probability visualization.
 */
export function renderScenariosSVG(scenarios: ScenarioData[]): string {
  if (!scenarios.length) return '';
  const probMap: Record<string, number> = { high: 75, medium: 50, low: 25 };
  const probColor: Record<string, string> = { high: POSITIVE_COLOR, medium: MIXED_COLOR, low: NEGATIVE_COLOR };

  const items: BarChartItem[] = scenarios.map(s => ({
    label: s.name.length > 25 ? s.name.slice(0, 22) + '...' : s.name,
    value: probMap[s.probability] || 50,
    color: probColor[s.probability] || MIXED_COLOR,
  }));

  return renderHorizontalBarSVG(items, 'Scenario Probability Assessment', { maxValue: 100, showValues: false });
}

// ─── Source Distribution Chart ─────────────────────────────────────────────

/**
 * Builds a donut chart of source distribution by provider type.
 */
export function renderSourceDistributionSVG(sources: Array<{ provider: string }>): string {
  if (!sources.length) return '';
  const counts: Record<string, number> = {};
  for (const s of sources) {
    const provider = s.provider || 'unknown';
    const category = categorizeProvider(provider);
    counts[category] = (counts[category] || 0) + 1;
  }

  const items: DonutItem[] = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([label, value]) => ({ label, value }));

  return renderDonutSVG(items, 'Source Distribution');
}

function categorizeProvider(provider: string): string {
  if (['openalex', 'crossref', 'semanticscholar', 'arxiv', 'pubmed', 'europepmc', 'doaj', 'core', 'base'].includes(provider)) return 'Academic';
  if (['gdelt-news', 'newsapi', 'mediastack', 'thenewsapi', 'gnews', 'eventregistry'].includes(provider)) return 'News';
  if (['thesesfr', 'hal'].includes(provider)) return 'French Academic';
  if (provider === 'linkup') return 'Web/Grey Lit';
  if (['ssrn', 'repec', 'nber'].includes(provider)) return 'Working Papers';
  return 'Institutional';
}

// ─── Stakeholder Impact Matrix ─────────────────────────────────────────────

export interface StakeholderData {
  stakeholder: string;
  impact: 'positive' | 'negative' | 'mixed';
  magnitude: 'high' | 'medium' | 'low';
}

/**
 * Renders a stakeholder impact visualization as colored horizontal bars.
 */
export function renderStakeholderImpactSVG(stakeholders: StakeholderData[]): string {
  if (!stakeholders.length) return '';
  const magMap: Record<string, number> = { high: 90, medium: 60, low: 30 };
  const impactColor: Record<string, string> = {
    positive: POSITIVE_COLOR,
    negative: NEGATIVE_COLOR,
    mixed: MIXED_COLOR,
  };

  const items: BarChartItem[] = stakeholders.map(s => ({
    label: s.stakeholder.length > 20 ? s.stakeholder.slice(0, 17) + '...' : s.stakeholder,
    value: magMap[s.magnitude] || 60,
    color: impactColor[s.impact] || MIXED_COLOR,
  }));

  return renderHorizontalBarSVG(items, 'Stakeholder Impact Matrix', { maxValue: 100, showValues: false });
}

// ─── Utility ───────────────────────────────────────────────────────────────

function escSvg(s: string): string {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
