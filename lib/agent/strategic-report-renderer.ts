/**
 * Strategic Report HTML Renderer
 * Renders comprehensive 10-15 page Strategic Reports with:
 * - Professional styling
 * - Table of contents
 * - Section numbering
 * - Source references
 * - Charts placeholders
 */

import { StrategicAnalysisOutput } from './strategic-analyst-agent';
import { AgentRole,assertPermission } from '../governance/index';
import { renderEvidenceGaugeSVG, renderStakeholderImpactSVG, renderScenariosSVG, renderSourceDistributionSVG } from './chart-generator';
import { inlineLockupSvg } from '@/lib/brand/logo-inline';
// logo-inline import kept for backward compat but no longer used in render
import { BRAND_EMAIL_TAGLINE, BRAND_NAME, BRAND_MANIFESTO } from '@/lib/brand/public-copy';

const esc = (s: string) =>
  String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const formatCitations = (text: string) => {
  return esc(text).replace(
    /\[SRC-(\d+)\]/g,
    '<sup class="citation" data-src="$1">[$1]</sup>'
  );
};

const STYLES = `
<style>
  @import url('https://fonts.googleapis.com/css2?family=Barlow+Semi+Condensed:wght@600;700&family=Barlow:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');

  .report-wrapper {
    font-family: 'Barlow', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    line-height: 1.75;
    color: rgba(240,240,250,0.78);
    max-width: 52rem;
    margin: 0 auto;
    padding: 0 2rem 4rem;
    background: #000000;
  }
  .report-wrapper * { box-sizing: border-box; }

  /* Header */
  .report-wrapper .report-header { border-bottom: 1px solid rgba(240,240,250,0.08); padding: 3rem 0 2rem; margin-bottom: 2rem; }
  .report-wrapper .report-brand { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem 0.75rem; color: #f0f0fa; margin-bottom: 2rem; }
  .report-wrapper .report-brand-tag { font-family: 'JetBrains Mono', monospace; font-size: 0.5625rem; text-transform: uppercase; letter-spacing: 0.18em; color: rgba(240,240,250,0.35); }
  .report-wrapper .report-title { font-family: 'Barlow Semi Condensed', sans-serif; font-size: clamp(2rem, 5vw, 3.75rem); font-weight: 700; color: #f0f0fa; margin: 0 0 1.25rem 0; line-height: 0.92; letter-spacing: -0.01em; text-transform: uppercase; }
  .report-wrapper .report-meta { display: flex; gap: 1.5rem; flex-wrap: wrap; font-family: 'JetBrains Mono', monospace; font-size: 0.6875rem; color: rgba(240,240,250,0.25); padding-top: 1.25rem; border-top: 1px solid rgba(240,240,250,0.08); letter-spacing: 0.04em; }
  .report-wrapper .meta-item { display: flex; align-items: center; gap: 6px; }
  .report-wrapper .badge { display: inline-block; padding: 0.35rem 0.7rem; font-family: 'JetBrains Mono', monospace; font-size: 0.5625rem; font-weight: 400; text-transform: uppercase; letter-spacing: 0.14em; border: 1px solid rgba(240,240,250,0.08); color: rgba(240,240,250,0.35); }
  .report-wrapper .badge-critical { border-color: rgba(240,240,250,0.14); color: rgba(240,240,250,0.62); }
  .report-wrapper .badge-high     { border-color: rgba(240,240,250,0.14); color: rgba(240,240,250,0.62); }
  .report-wrapper .badge-medium   { color: rgba(240,240,250,0.35); }
  .report-wrapper .badge-low      { color: rgba(240,240,250,0.25); }
  .report-wrapper .badge-confidence-high   { border-color: rgba(240,240,250,0.14); color: rgba(240,240,250,0.62); }
  .report-wrapper .badge-confidence-medium { color: rgba(240,240,250,0.35); }
  .report-wrapper .badge-confidence-low    { color: rgba(240,240,250,0.25); }

  /* Table of Contents */
  .report-wrapper .toc { background: rgba(240,240,250,0.015); border: 1px solid rgba(240,240,250,0.08); padding: 1.75rem; margin: 1.75rem 0; }
  .report-wrapper .toc-title { font-family: 'JetBrains Mono', monospace; font-size: 0.5625rem; font-weight: 400; text-transform: uppercase; letter-spacing: 0.18em; color: rgba(240,240,250,0.35); margin: 0 0 1rem 0; padding-bottom: 0.75rem; border-bottom: 1px solid rgba(240,240,250,0.08); }
  .report-wrapper .toc-list { list-style: none; padding: 0; margin: 0; columns: 2; column-gap: 2rem; }
  .report-wrapper .toc-list li { margin-bottom: 0.5rem; break-inside: avoid; }
  .report-wrapper .toc-list a { color: rgba(240,240,250,0.55); text-decoration: none; font-size: 0.9375rem; transition: color 150ms ease; }
  .report-wrapper .toc-list a:hover { color: #f0f0fa; }
  .report-wrapper .toc-num { color: rgba(240,240,250,0.25); margin-right: 0.5rem; font-family: 'JetBrains Mono', monospace; font-size: 0.75rem; }

  /* Sections */
  .report-wrapper .section { margin: 2.5rem 0; page-break-inside: avoid; }
  .report-wrapper .section-title { font-family: 'Barlow Semi Condensed', sans-serif; font-size: 1.35em; font-weight: 700; color: #f0f0fa; margin: 0 0 1rem 0; padding-bottom: 0.5rem; border-bottom: 1px solid rgba(240,240,250,0.08); display: flex; align-items: center; gap: 0.75rem; text-transform: uppercase; letter-spacing: 0.02em; }
  .report-wrapper .section-num { background: rgba(240,240,250,0.04); color: rgba(240,240,250,0.55); width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; font-family: 'JetBrains Mono', monospace; font-size: 0.75rem; flex-shrink: 0; border: 1px solid rgba(240,240,250,0.08); }
  .report-wrapper .subsection-title { font-family: 'Barlow Semi Condensed', sans-serif; font-size: 1.05em; font-weight: 600; color: rgba(240,240,250,0.70); margin: 1.5rem 0 0.75rem 0; text-transform: uppercase; letter-spacing: 0.04em; }

  /* Executive Summary */
  .report-wrapper .executive-summary { background: rgba(240,240,250,0.015); border: 1px solid rgba(240,240,250,0.10); border-left: 2px solid #f0f0fa; color: rgba(240,240,250,0.78); padding: 1.75rem; margin: 1.75rem 0; }
  .report-wrapper .executive-summary h2 { color: #f0f0fa; border-bottom-color: rgba(240,240,250,0.12); margin-top: 0; }
  .report-wrapper .executive-summary p { font-size: 1.0625rem; line-height: 1.75; }
  .report-wrapper .executive-summary .citation { color: rgba(240,240,250,0.55); }

  /* Key Findings */
  .report-wrapper .key-findings { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1rem; margin: 1.5rem 0; }
  .report-wrapper .finding-card { background: rgba(240,240,250,0.015); border-left: 2px solid rgba(240,240,250,0.25); padding: 1rem 1.125rem; transition: border-color 200ms ease; }
  .report-wrapper .finding-card:hover { border-left-color: rgba(240,240,250,0.5); }
  .report-wrapper .finding-card p { margin: 0; font-size: 0.9375rem; color: rgba(240,240,250,0.68); line-height: 1.6; }

  /* Content */
  .report-wrapper .content { font-size: 1.0625rem; line-height: 1.75; }
  .report-wrapper .content p { margin: 1rem 0; color: rgba(240,240,250,0.72); }
  .report-wrapper strong { color: rgba(240,240,250,0.90); }
  .report-wrapper em     { color: rgba(240,240,250,0.58); }

  /* Tables */
  .report-wrapper .data-table { width: 100%; border-collapse: collapse; margin: 1.5rem 0; font-size: 0.9375rem; }
  .report-wrapper .data-table th { background: rgba(240,240,250,0.03); padding: 0.75rem 1rem; text-align: left; font-weight: 600; color: rgba(240,240,250,0.80); border-bottom: 1px solid rgba(240,240,250,0.12); font-family: 'JetBrains Mono', monospace; font-size: 0.6875rem; text-transform: uppercase; letter-spacing: 0.1em; }
  .report-wrapper .data-table td { padding: 0.75rem 1rem; border-bottom: 1px solid rgba(240,240,250,0.06); vertical-align: top; color: rgba(240,240,250,0.68); }
  .report-wrapper .data-table tr:hover td { background: rgba(240,240,250,0.02); }

  /* Impact — monochrome only */
  .report-wrapper .impact-positive { color: rgba(240,240,250,0.85); font-weight: 600; }
  .report-wrapper .impact-negative  { color: rgba(240,240,250,0.55); font-weight: 600; }
  .report-wrapper .impact-mixed     { color: rgba(240,240,250,0.70); font-weight: 600; }
  .report-wrapper .magnitude-high   { font-weight: 700; }
  .report-wrapper .magnitude-medium { font-weight: 500; }
  .report-wrapper .magnitude-low    { font-weight: 400; opacity: 0.6; }

  /* Debate — monochrome, flat */
  .report-wrapper .debate-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; margin: 1.5rem 0; }
  @media (max-width: 700px) { .report-wrapper .debate-grid { grid-template-columns: 1fr; } }
  .report-wrapper .debate-position { padding: 1.5rem; }
  .report-wrapper .debate-for      { background: rgba(240,240,250,0.02); border: 1px solid rgba(240,240,250,0.08); }
  .report-wrapper .debate-for h4   { color: rgba(240,240,250,0.85); font-family: 'Barlow Semi Condensed', sans-serif; text-transform: uppercase; letter-spacing: 0.04em; }
  .report-wrapper .debate-against    { background: rgba(240,240,250,0.01); border: 1px solid rgba(240,240,250,0.06); }
  .report-wrapper .debate-against h4 { color: rgba(240,240,250,0.55); font-family: 'Barlow Semi Condensed', sans-serif; text-transform: uppercase; letter-spacing: 0.04em; }
  .report-wrapper .debate-synthesis  { background: rgba(240,240,250,0.03); border: 1px solid rgba(240,240,250,0.10); border-left: 2px solid #f0f0fa; padding: 1.5rem; margin-top: 1.5rem; }

  /* Scenarios — flat, monochrome */
  .report-wrapper .scenario-card { background: rgba(240,240,250,0.015); border: 1px solid rgba(240,240,250,0.08); padding: 1.5rem; margin: 1rem 0; transition: border-color 200ms ease; }
  .report-wrapper .scenario-card:hover { border-color: rgba(240,240,250,0.14); }
  .report-wrapper .scenario-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem; }
  .report-wrapper .scenario-name { font-family: 'Barlow Semi Condensed', sans-serif; font-weight: 600; font-size: 1em; color: rgba(240,240,250,0.88); text-transform: uppercase; letter-spacing: 0.04em; }
  .report-wrapper .probability-high   { border: 1px solid rgba(240,240,250,0.14); color: rgba(240,240,250,0.62); }
  .report-wrapper .probability-medium { border: 1px solid rgba(240,240,250,0.08); color: rgba(240,240,250,0.45); }
  .report-wrapper .probability-low    { border: 1px solid rgba(240,240,250,0.06); color: rgba(240,240,250,0.30); }

  /* Recommendations — flat, monochrome */
  .report-wrapper .recommendations-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 1.25rem; margin: 1.5rem 0; }
  @media (max-width: 700px) { .report-wrapper .recommendations-grid { grid-template-columns: 1fr; } }
  .report-wrapper .rec-card { padding: 1.25rem; }
  .report-wrapper .rec-immediate { background: rgba(240,240,250,0.03); border-left: 2px solid rgba(240,240,250,0.62); }
  .report-wrapper .rec-short     { background: rgba(240,240,250,0.02); border-left: 2px solid rgba(240,240,250,0.35); }
  .report-wrapper .rec-long      { background: rgba(240,240,250,0.015); border-left: 2px solid rgba(240,240,250,0.18); }
  .report-wrapper .rec-risk      { background: rgba(240,240,250,0.01); border-left: 2px solid rgba(240,240,250,0.10); }
  .report-wrapper .rec-card h4 { margin: 0 0 0.75rem 0; font-family: 'JetBrains Mono', monospace; font-size: 0.5625rem; text-transform: uppercase; letter-spacing: 0.14em; color: rgba(240,240,250,0.55); }
  .report-wrapper .rec-card ul { margin: 0; padding-left: 1.125rem; }
  .report-wrapper .rec-card li { margin: 0.5rem 0; font-size: 0.9375rem; color: rgba(240,240,250,0.68); line-height: 1.6; }

  /* Citations */
  .report-wrapper .citation { color: rgba(240,240,250,0.55); font-family: 'JetBrains Mono', monospace; font-size: 0.5625rem; cursor: help; font-weight: 500; transition: color 150ms ease; }
  .report-wrapper .citation:hover { color: #f0f0fa; }

  /* Sources */
  .report-wrapper .sources-section { background: rgba(240,240,250,0.015); border: 1px solid rgba(240,240,250,0.08); padding: 1.75rem; margin-top: 3rem; }
  .report-wrapper .source-item { padding: 0.625rem 0; border-bottom: 1px solid rgba(240,240,250,0.06); display: grid; grid-template-columns: 60px 1fr; gap: 1rem; align-items: start; transition: color 150ms ease; }
  .report-wrapper .source-item:last-child { border-bottom: none; }
  .report-wrapper .source-item:hover { color: rgba(240,240,250,0.85); }
  .report-wrapper .source-num { background: rgba(240,240,250,0.04); color: rgba(240,240,250,0.55); padding: 0.25rem 0.75rem; font-family: 'JetBrains Mono', monospace; font-weight: 500; font-size: 0.6875rem; text-align: center; border: 1px solid rgba(240,240,250,0.08); }
  .report-wrapper .source-details { font-size: 0.8125rem; }
  .report-wrapper .source-title { font-weight: 600; color: rgba(240,240,250,0.82); }
  .report-wrapper .source-meta  { color: rgba(240,240,250,0.35); font-size: 0.8125rem; margin-top: 0.25rem; }

  /* Evidence Quality — monochrome */
  .report-wrapper .quality-meter { background: rgba(240,240,250,0.02); padding: 1.5rem; margin: 1.5rem 0; border: 1px solid rgba(240,240,250,0.08); }
  .report-wrapper .quality-score { display: flex; align-items: center; gap: 1rem; margin-bottom: 1rem; }
  .report-wrapper .score-value   { font-family: 'JetBrains Mono', monospace; font-size: 3em; font-weight: 300; color: #f0f0fa; }
  .report-wrapper .score-label   { font-family: 'JetBrains Mono', monospace; font-size: 0.6875rem; text-transform: uppercase; letter-spacing: 0.14em; color: rgba(240,240,250,0.35); }
  .report-wrapper .quality-bar   { height: 4px; background: rgba(240,240,250,0.08); overflow: hidden; }
  .report-wrapper .quality-fill  { height: 100%; background: rgba(240,240,250,0.62); }

  /* Print */
  @media print {
    .report-wrapper { padding: 0; max-width: none; }
    .report-wrapper .section { page-break-inside: avoid; }
  }

  @media (max-width: 640px) {
    .report-wrapper { padding: 0 1rem 2.5rem; }
    .report-wrapper .report-title { font-size: 1.75rem; }
    .report-wrapper .toc-list { columns: 1; }
    .report-wrapper .nx-block { padding: 1.25rem; }
  }
</style>
`;

export function renderStrategicReportHTML(
  analysis: StrategicAnalysisOutput,
  sources: any[]
): string {
  assertPermission(AgentRole.EDITOR, "write:draft");

  const urgencyClass = `badge-${analysis.urgencyLevel}`;
  const confidenceClass = `badge-confidence-${analysis.confidenceLevel}`;

  const renderKeyFindings = () => {
    if (!analysis.keyFindings?.length) return "";
    return `
      <div class="key-findings">
        ${analysis.keyFindings
          .slice(0, 5)
          .map(
            (f) => `
          <div class="finding-card">
            <p>${formatCitations(f)}</p>
          </div>
        `
          )
          .join("")}
      </div>
    `;
  };

  const renderKeyStudies = () => {
    if (!analysis.keyStudies?.length) return "";
    return `
      <table class="data-table">
        <thead>
          <tr>
            <th>Source</th>
            <th>Contribution</th>
            <th>Limitations</th>
          </tr>
        </thead>
        <tbody>
          ${analysis.keyStudies
            .map(
              (study) => `
            <tr>
              <td><strong>${formatCitations(study.citation)}</strong></td>
              <td>${formatCitations(study.contribution)}</td>
              <td>${formatCitations(study.limitations)}</td>
            </tr>
          `
            )
            .join("")}
        </tbody>
      </table>
    `;
  };

  const renderThemes = () => {
    if (!analysis.themes?.length) return "";
    return analysis.themes
      .map(
        (theme) => `
      <div class="subsection-title">${esc(theme.name)}</div>
      <div class="content">
        <p>${formatCitations(theme.description)}</p>
        <p><strong>Evidence:</strong> ${formatCitations(theme.evidence)}</p>
        <p><em>Sources: ${theme.sources?.join(", ") || "N/A"}</em></p>
      </div>
    `
      )
      .join("");
  };

  const renderDebate = () => {
    if (!analysis.debate) return "";
    const { position1, position2, synthesis, nuances } = analysis.debate;
    return `
      <div class="debate-grid">
        <div class="debate-position debate-for">
          <h4>📗 ${esc(position1.label)}</h4>
          <p>${formatCitations(position1.arguments)}</p>
          <p><strong>Evidence:</strong> ${formatCitations(position1.evidence)}</p>
          <p><em>Proponents: ${formatCitations(position1.proponents)}</em></p>
        </div>
        <div class="debate-position debate-against">
          <h4>📕 ${esc(position2.label)}</h4>
          <p>${formatCitations(position2.arguments)}</p>
          <p><strong>Evidence:</strong> ${formatCitations(position2.evidence)}</p>
          <p><em>Proponents: ${formatCitations(position2.proponents)}</em></p>
        </div>
      </div>
      <div class="debate-synthesis">
        <h4>⚖️ Synthesis</h4>
        <p>${formatCitations(synthesis)}</p>
        ${nuances ? `<p><strong>Nuances:</strong> ${formatCitations(nuances)}</p>` : ""}
      </div>
    `;
  };

  const renderEvidenceQuality = () => {
    if (!analysis.evidenceQuality) return "";
    const eq = analysis.evidenceQuality;
    const scorePercent = (eq.overallScore / 10) * 100;
    return `
      <div class="quality-meter">
        <div class="quality-score">
          <span class="score-value">${eq.overallScore}</span>
          <span class="score-label">/10<br/>Overall Evidence Quality</span>
        </div>
        <div class="quality-bar">
          <div class="quality-fill" style="width: ${scorePercent}%"></div>
        </div>
      </div>
      <div class="content">
        <p><strong>Methodology:</strong> ${formatCitations(eq.methodology)}</p>
        <p><strong>Sample Sizes:</strong> ${formatCitations(eq.sampleSizes)}</p>
        <p><strong>Replication:</strong> ${formatCitations(eq.replication)}</p>
        <p><strong>Potential Biases:</strong> ${formatCitations(eq.biases)}</p>
        <p><strong>Evidence Gaps:</strong> ${formatCitations(eq.gaps)}</p>
      </div>
    `;
  };

  const renderStakeholders = () => {
    if (!analysis.stakeholderAnalysis?.length) return "";
    return `
      <table class="data-table">
        <thead>
          <tr>
            <th>Stakeholder</th>
            <th>Impact</th>
            <th>Magnitude</th>
            <th>Details</th>
          </tr>
        </thead>
        <tbody>
          ${analysis.stakeholderAnalysis
            .map(
              (s) => `
            <tr>
              <td><strong>${esc(s.stakeholder)}</strong></td>
              <td class="impact-${s.impact}">${s.impact.toUpperCase()}</td>
              <td class="magnitude-${s.magnitude}">${s.magnitude.toUpperCase()}</td>
              <td>${formatCitations(s.details)}</td>
            </tr>
          `
            )
            .join("")}
        </tbody>
      </table>
    `;
  };

  const renderScenarios = () => {
    if (!analysis.scenarios?.length) return "";
    return analysis.scenarios
      .map(
        (s) => `
      <div class="scenario-card">
        <div class="scenario-header">
          <span class="scenario-name">${esc(s.name)}</span>
          <span class="badge probability-${s.probability}">${s.probability.toUpperCase()} PROBABILITY</span>
        </div>
        <p>${formatCitations(s.description)}</p>
        <p><strong>Implications:</strong> ${formatCitations(s.implications)}</p>
        <p><strong>Early Signals:</strong> ${formatCitations(s.signals)}</p>
      </div>
    `
      )
      .join("");
  };

  const renderRecommendations = () => {
    if (!analysis.recommendations) return "";
    const r = analysis.recommendations;
    return `
      <div class="recommendations-grid">
        <div class="rec-card rec-immediate">
          <h4>🚨 Immediate Actions</h4>
          <ul>${(r.immediate || []).map((i) => `<li>${formatCitations(i)}</li>`).join("")}</ul>
        </div>
        <div class="rec-card rec-short">
          <h4>📅 Short-Term (3-12 months)</h4>
          <ul>${(r.shortTerm || []).map((i) => `<li>${formatCitations(i)}</li>`).join("")}</ul>
        </div>
        <div class="rec-card rec-long">
          <h4>🎯 Long-Term (1-5 years)</h4>
          <ul>${(r.longTerm || []).map((i) => `<li>${formatCitations(i)}</li>`).join("")}</ul>
        </div>
        <div class="rec-card rec-risk">
          <h4>🛡️ Risk Mitigation</h4>
          <ul>${(r.riskMitigation || []).map((i) => `<li>${formatCitations(i)}</li>`).join("")}</ul>
        </div>
      </div>
    `;
  };

  const renderImplementation = () => {
    if (!analysis.implementation) return "";
    const impl = analysis.implementation;
    return `
      <div class="content">
        <p><strong>Prerequisites:</strong></p>
        <ul>${(impl.prerequisites || []).map((p) => `<li>${formatCitations(p)}</li>`).join("")}</ul>
        <p><strong>Timeline:</strong> ${formatCitations(impl.timeline)}</p>
        <p><strong>Resources Required:</strong> ${formatCitations(impl.resources)}</p>
        <p><strong>Success Metrics:</strong></p>
        <ul>${(impl.metrics || []).map((m) => `<li>${formatCitations(m)}</li>`).join("")}</ul>
        <p><strong>Anticipated Obstacles:</strong></p>
        <ul>${(impl.obstacles || []).map((o) => `<li>${formatCitations(o)}</li>`).join("")}</ul>
      </div>
    `;
  };

  const renderSources = () => {
    return sources
      .map((s, i) => {
        const authors =
          s.authors
            ?.map((sa: any) => sa.author?.name)
            .filter(Boolean)
            .slice(0, 3)
            .join(", ") || "Unknown";
        return `
        <div class="source-item">
          <span class="source-num">SRC-${i + 1}</span>
          <div class="source-details">
            <div class="source-title">${esc(s.title)}</div>
            <div class="source-meta">
              ${authors} ${s.year ? `(${s.year})` : ""} • ${esc(s.provider)} • 
              Quality: ${s.qualityScore || 0}/100 • Citations: ${s.citationCount || 0}
            </div>
          </div>
        </div>
      `;
      })
      .join("");
  };

  const now = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return `${STYLES}
<div class="report-wrapper">
  <article>
    <div class="report-brand">
      <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 32 32" fill="none" aria-label="NomosX" role="img" style="flex-shrink:0;">
        <line x1="7" y1="7" x2="25" y2="25" stroke="#f0f0fa" stroke-width="2.6" stroke-linecap="round"/>
        <line x1="25" y1="7" x2="7" y2="25" stroke="#f0f0fa" stroke-width="2.6" stroke-linecap="round"/>
        <circle cx="16" cy="16" r="2.6" fill="#f0f0fa" stroke="none"/>
      </svg>
      <span style="font-family:'Barlow Semi Condensed',sans-serif;font-size:1.25rem;font-weight:700;color:#f0f0fa;letter-spacing:-0.01em;text-transform:uppercase;">NOMOS<span style="color:#f0f0fa;">X</span></span>
      <span class="report-brand-tag">From Chaos to Clarity</span>
    </div>
    <h1 class="report-title">${esc(analysis.title)}</h1>
    <div class="report-meta" style="font-size:12px;color:rgba(240,240,250,0.4);margin-bottom:2rem;padding-bottom:1rem;border-bottom:1px solid rgba(240,240,250,0.08);">
      ${now} · ${sources.length} sources · ${analysis.confidenceLevel} confidence
    </div>

    <!-- Section 1: Executive Summary -->
    <section id="executive" class="executive-summary">
      <h2 class="section-title"><span class="section-num">1</span> Executive Summary</h2>
      <div class="content">
        <p>${formatCitations(analysis.executiveSummary)}</p>
      </div>
      <h3 class="subsection-title" style="color: white; border-bottom: 1px solid rgba(255,255,255,0.3);">Key Findings</h3>
      ${renderKeyFindings()}
    </section>

    <!-- Section 2: Literature Review -->
    <section id="literature" class="section">
      <h2 class="section-title"><span class="section-num">2</span> Literature Review</h2>
      <div class="content">
        <p>${formatCitations(analysis.literatureOverview)}</p>
      </div>
      
      <h3 class="subsection-title">Theoretical Frameworks</h3>
      <div class="content">
        <p>${formatCitations(analysis.theoreticalFrameworks)}</p>
      </div>
      
      <h3 class="subsection-title">Methodological Approaches</h3>
      <div class="content">
        <p>${formatCitations(analysis.methodologicalApproaches)}</p>
      </div>
      
      <h3 class="subsection-title">Key Studies</h3>
      ${renderKeyStudies()}
    </section>

    <!-- Section 3: Thematic Analysis -->
    <section id="themes" class="section">
      <h2 class="section-title"><span class="section-num">3</span> Thematic Analysis</h2>
      ${renderThemes()}
      
      <h3 class="subsection-title">Consensus</h3>
      <div class="content">
        <p>${formatCitations(analysis.consensus)}</p>
      </div>
      
      <h3 class="subsection-title">Controversies</h3>
      <div class="content">
        <p>${formatCitations(analysis.controversies)}</p>
      </div>
      
      <h3 class="subsection-title">Emerging Trends</h3>
      <div class="content">
        <p>${formatCitations(analysis.emergingTrends)}</p>
      </div>
    </section>

    <!-- Section 4: Debate & Perspectives -->
    <section id="debate" class="section">
      <h2 class="section-title"><span class="section-num">4</span> Debate & Perspectives</h2>
      ${renderDebate()}
    </section>

    <!-- Section 5: Evidence Assessment -->
    <section id="evidence" class="section">
      <h2 class="section-title"><span class="section-num">5</span> Evidence Quality Assessment</h2>
      ${analysis.evidenceQuality ? renderEvidenceGaugeSVG(analysis.evidenceQuality.overallScore) : ''}
      ${renderEvidenceQuality()}
    </section>

    <!-- Section 6: Stakeholder Impact -->
    <section id="stakeholders" class="section">
      <h2 class="section-title"><span class="section-num">6</span> Stakeholder Impact Analysis</h2>
      ${analysis.stakeholderAnalysis?.length ? renderStakeholderImpactSVG(analysis.stakeholderAnalysis) : ''}
      ${renderStakeholders()}
    </section>

    <!-- Section 7: Scenario Planning -->
    <section id="scenarios" class="section">
      <h2 class="section-title"><span class="section-num">7</span> Scenario Planning</h2>
      ${analysis.scenarios?.length ? renderScenariosSVG(analysis.scenarios) : ''}
      ${renderScenarios()}
    </section>

    <!-- Section 8: Recommendations -->
    <section id="recommendations" class="section">
      <h2 class="section-title"><span class="section-num">8</span> Strategic Recommendations</h2>
      ${renderRecommendations()}
    </section>

    <!-- Section 9: Implementation -->
    <section id="implementation" class="section">
      <h2 class="section-title"><span class="section-num">9</span> Implementation Roadmap</h2>
      ${renderImplementation()}
    </section>

    <!-- Section 10: Conclusion -->
    <section id="conclusion" class="section">
      <h2 class="section-title"><span class="section-num">10</span> Conclusion</h2>
      <div class="content">
        <p>${formatCitations(analysis.conclusion)}</p>
      </div>
      
      <h3 class="subsection-title">Open Questions</h3>
      <ul>
        ${(analysis.openQuestions || []).map((q) => `<li>${formatCitations(q)}</li>`).join("")}
      </ul>
      
      <h3 class="subsection-title">What Would Change Our Mind</h3>
      <div class="content">
        <p>${formatCitations(analysis.whatChangesMind)}</p>
      </div>
    </section>

    <!-- Sources -->
    <section class="sources-section">
      <h2 class="section-title">Sources</h2>
      ${renderSources()}
    </section>
  </article>
</div>`;
}
