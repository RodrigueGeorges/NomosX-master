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
  .report-wrapper {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    line-height: 1.7;
    color: rgba(255,255,255,0.80);
    max-width: 900px;
    margin: 0 auto;
    padding: 32px 24px;
    background: transparent;
  }
  .report-wrapper * { box-sizing: border-box; }
  
  /* Header */
  .report-wrapper .report-header { border-bottom: 1px solid rgba(255,255,255,0.12); padding-bottom: 24px; margin-bottom: 32px; }
  .report-wrapper .report-brand { font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: rgba(255,255,255,0.35); margin-bottom: 8px; }
  .report-wrapper .report-title { font-size: 2em; font-weight: 700; color: #ffffff; margin: 0 0 16px 0; line-height: 1.2; }
  .report-wrapper .report-meta { display: flex; gap: 24px; flex-wrap: wrap; font-size: 0.9em; color: rgba(255,255,255,0.45); }
  .report-wrapper .meta-item { display: flex; align-items: center; gap: 6px; }
  .report-wrapper .badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 0.8em; font-weight: 600; text-transform: uppercase; }
  .report-wrapper .badge-critical { background: rgba(239,68,68,0.15); color: #f87171; }
  .report-wrapper .badge-high     { background: rgba(251,146,60,0.15); color: #fb923c; }
  .report-wrapper .badge-medium   { background: rgba(251,191,36,0.15); color: #fbbf24; }
  .report-wrapper .badge-low      { background: rgba(52,211,153,0.15); color: #34d399; }
  .report-wrapper .badge-confidence-high   { background: rgba(52,211,153,0.15); color: #34d399; }
  .report-wrapper .badge-confidence-medium { background: rgba(251,191,36,0.15); color: #fbbf24; }
  .report-wrapper .badge-confidence-low    { background: rgba(239,68,68,0.15); color: #f87171; }

  /* Table of Contents */
  .report-wrapper .toc { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; padding: 24px; margin: 32px 0; }
  .report-wrapper .toc-title { font-size: 1.1em; font-weight: 600; color: rgba(255,255,255,0.85); margin: 0 0 16px 0; padding-bottom: 8px; border-bottom: 1px solid rgba(255,255,255,0.08); }
  .report-wrapper .toc-list { list-style: none; padding: 0; margin: 0; columns: 2; column-gap: 32px; }
  .report-wrapper .toc-list li { margin-bottom: 8px; break-inside: avoid; }
  .report-wrapper .toc-list a { color: rgba(255,255,255,0.55); text-decoration: none; font-size: 0.95em; }
  .report-wrapper .toc-list a:hover { color: #ffffff; }
  .report-wrapper .toc-num { color: rgba(255,255,255,0.25); margin-right: 8px; font-weight: 500; }

  /* Sections */
  .report-wrapper .section { margin: 48px 0; page-break-inside: avoid; }
  .report-wrapper .section-title { font-size: 1.35em; font-weight: 700; color: rgba(255,255,255,0.92); margin: 0 0 16px 0; padding-bottom: 8px; border-bottom: 1px solid rgba(255,255,255,0.08); display: flex; align-items: center; gap: 12px; }
  .report-wrapper .section-num { background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.75); width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.8em; flex-shrink: 0; }
  .report-wrapper .subsection-title { font-size: 1.05em; font-weight: 600; color: rgba(255,255,255,0.70); margin: 24px 0 12px 0; }

  /* Executive Summary */
  .report-wrapper .executive-summary { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.10); color: rgba(255,255,255,0.88); padding: 32px; border-radius: 0; margin: 32px 0; }
  .report-wrapper .executive-summary h2 { color: white; border-bottom-color: rgba(255,255,255,0.12); margin-top: 0; }
  .report-wrapper .executive-summary p { font-size: 1.05em; line-height: 1.8; }
  .report-wrapper .executive-summary .citation { color: rgba(255,255,255,0.65); }

  /* Key Findings */
  .report-wrapper .key-findings { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 16px; margin: 24px 0; }
  .report-wrapper .finding-card { background: rgba(255,255,255,0.04); border-left: 3px solid rgba(255,255,255,0.25); padding: 16px; border-radius: 0; }
  .report-wrapper .finding-card p { margin: 0; font-size: 0.95em; color: rgba(255,255,255,0.78); }

  /* Content */
  .report-wrapper .content { font-size: 1em; line-height: 1.8; }
  .report-wrapper .content p { margin: 16px 0; color: rgba(255,255,255,0.72); }
  .report-wrapper strong { color: rgba(255,255,255,0.90); }
  .report-wrapper em     { color: rgba(255,255,255,0.58); }

  /* Tables */
  .report-wrapper .data-table { width: 100%; border-collapse: collapse; margin: 24px 0; font-size: 0.9em; }
  .report-wrapper .data-table th { background: rgba(255,255,255,0.05); padding: 12px 16px; text-align: left; font-weight: 600; color: rgba(255,255,255,0.80); border-bottom: 1px solid rgba(255,255,255,0.12); }
  .report-wrapper .data-table td { padding: 12px 16px; border-bottom: 1px solid rgba(255,255,255,0.06); vertical-align: top; color: rgba(255,255,255,0.68); }
  .report-wrapper .data-table tr:hover td { background: rgba(255,255,255,0.03); }
  
  /* Impact */
  .report-wrapper .impact-positive { color: #34d399; font-weight: 600; }
  .report-wrapper .impact-negative  { color: #f87171; font-weight: 600; }
  .report-wrapper .impact-mixed     { color: #fbbf24; font-weight: 600; }
  .report-wrapper .magnitude-high   { font-weight: 700; }
  .report-wrapper .magnitude-medium { font-weight: 500; }
  .report-wrapper .magnitude-low    { font-weight: 400; opacity: 0.7; }

  /* Debate */
  .report-wrapper .debate-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin: 24px 0; }
  @media (max-width: 700px) { .report-wrapper .debate-grid { grid-template-columns: 1fr; } }
  .report-wrapper .debate-position { padding: 24px; border-radius: 12px; }
  .report-wrapper .debate-for      { background: rgba(20,184,166,0.09); border: 1px solid rgba(20,184,166,0.28); }
  .report-wrapper .debate-for h4   { color: #5eead4; }
  .report-wrapper .debate-against    { background: rgba(239,68,68,0.09); border: 1px solid rgba(239,68,68,0.28); }
  .report-wrapper .debate-against h4 { color: #fca5a5; }
  .report-wrapper .debate-synthesis  { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.10); padding: 24px; border-radius: 12px; margin-top: 24px; }

  /* Scenarios */
  .report-wrapper .scenario-card { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 24px; margin: 16px 0; }
  .report-wrapper .scenario-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
  .report-wrapper .scenario-name { font-weight: 600; font-size: 1.1em; color: rgba(255,255,255,0.88); }
  .report-wrapper .probability-high   { background: rgba(52,211,153,0.15); color: #34d399; }
  .report-wrapper .probability-medium { background: rgba(251,191,36,0.15); color: #fbbf24; }
  .report-wrapper .probability-low    { background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.45); }

  /* Recommendations */
  .report-wrapper .recommendations-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; margin: 24px 0; }
  @media (max-width: 700px) { .report-wrapper .recommendations-grid { grid-template-columns: 1fr; } }
  .report-wrapper .rec-card { padding: 20px; border-radius: 8px; }
  .report-wrapper .rec-immediate { background: rgba(239,68,68,0.08);  border-left: 3px solid #f87171; }
  .report-wrapper .rec-short     { background: rgba(251,191,36,0.08); border-left: 3px solid #fbbf24; }
  .report-wrapper .rec-long      { background: rgba(52,211,153,0.08); border-left: 3px solid #34d399; }
  .report-wrapper .rec-risk      { background: rgba(255,255,255,0.04); border-left: 3px solid rgba(255,255,255,0.18); }
  .report-wrapper .rec-card h4 { margin: 0 0 12px 0; font-size: 0.9em; text-transform: uppercase; letter-spacing: 0.05em; color: rgba(255,255,255,0.75); }
  .report-wrapper .rec-card ul { margin: 0; padding-left: 20px; }
  .report-wrapper .rec-card li { margin: 8px 0; font-size: 0.95em; color: rgba(255,255,255,0.68); }

  /* Citations */
  .report-wrapper .citation { color: rgba(255,255,255,0.65); font-size: 0.75em; cursor: help; font-weight: 600; }

  /* Sources */
  .report-wrapper .sources-section { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); padding: 32px; border-radius: 12px; margin-top: 48px; }
  .report-wrapper .source-item { padding: 12px 0; border-bottom: 1px solid rgba(255,255,255,0.06); display: grid; grid-template-columns: 60px 1fr; gap: 16px; align-items: start; }
  .report-wrapper .source-item:last-child { border-bottom: none; }
  .report-wrapper .source-num { background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.75); padding: 4px 12px; border-radius: 0; font-weight: 600; font-size: 0.85em; text-align: center; }
  .report-wrapper .source-details { font-size: 0.9em; }
  .report-wrapper .source-title { font-weight: 600; color: rgba(255,255,255,0.82); }
  .report-wrapper .source-meta  { color: rgba(255,255,255,0.40); font-size: 0.9em; margin-top: 4px; }

  /* Evidence Quality */
  .report-wrapper .quality-meter { background: rgba(255,255,255,0.04); border-radius: 8px; padding: 24px; margin: 24px 0; }
  .report-wrapper .quality-score { display: flex; align-items: center; gap: 16px; margin-bottom: 16px; }
  .report-wrapper .score-value   { font-size: 3em; font-weight: 700; color: #ffffff; }
  .report-wrapper .score-label   { font-size: 0.9em; color: rgba(255,255,255,0.45); }
  .report-wrapper .quality-bar   { height: 12px; background: rgba(255,255,255,0.08); border-radius: 6px; overflow: hidden; }
  .report-wrapper .quality-fill  { height: 100%; background: linear-gradient(90deg, #f87171 0%, #fbbf24 50%, #34d399 100%); border-radius: 6px; }

  /* Print */
  @media print {
    .report-wrapper { padding: 0; max-width: none; }
    .report-wrapper .section { page-break-inside: avoid; }
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
    <!-- Header -->
    <header class="report-header">
      <div class="report-brand">NomosX Strategic Intelligence Report</div>
      <h1 class="report-title">${esc(analysis.title)}</h1>
      <div class="report-meta">
        <span class="meta-item">📅 ${now}</span>
        <span class="meta-item">📊 ${sources.length} sources analyzed</span>
        <span class="meta-item">
          <span class="badge ${urgencyClass}">${analysis.urgencyLevel} urgency</span>
        </span>
        <span class="meta-item">
          <span class="badge ${confidenceClass}">${analysis.confidenceLevel} confidence</span>
        </span>
      </div>
    </header>

    <!-- Table of Contents -->
    <nav class="toc">
      <h3 class="toc-title">Table of Contents</h3>
      <ol class="toc-list">
        <li><a href="#executive"><span class="toc-num">1</span>Executive Summary</a></li>
        <li><a href="#literature"><span class="toc-num">2</span>Literature Review</a></li>
        <li><a href="#themes"><span class="toc-num">3</span>Thematic Analysis</a></li>
        <li><a href="#debate"><span class="toc-num">4</span>Debate & Perspectives</a></li>
        <li><a href="#evidence"><span class="toc-num">5</span>Evidence Assessment</a></li>
        <li><a href="#stakeholders"><span class="toc-num">6</span>Stakeholder Impact</a></li>
        <li><a href="#scenarios"><span class="toc-num">7</span>Scenario Planning</a></li>
        <li><a href="#recommendations"><span class="toc-num">8</span>Recommendations</a></li>
        <li><a href="#implementation"><span class="toc-num">9</span>Implementation</a></li>
        <li><a href="#conclusion"><span class="toc-num">10</span>Conclusion</a></li>
      </ol>
    </nav>

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
      ${renderSourceDistributionSVG(sources)}
      ${renderSources()}
    </section>

    <!-- Footer -->
    <footer style="margin-top: 48px; padding-top: 24px; border-top: 1px solid rgba(255,255,255,0.08); text-align: center; color: rgba(255,255,255,0.40); font-size: 0.85em;">
      <p>Generated by <strong>NomosX</strong> &ndash; The Agentic Think Tank</p>
      <p>This report was produced through automated analysis of ${sources.length} sources. Always verify critical findings with primary sources.</p>
    </footer>
  </article>
</div>`;
}
