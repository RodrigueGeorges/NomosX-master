/**
 * Research Protocol & AI Disclaimer — auto-generated sections for transparency.
 *
 * Inspired by:
 * - RAND 2022 Standards: "document purpose, scope, sources, assumptions, data, methods, limitations"
 * - CFR: "The Council takes no institutional position"
 * - Brookings: "All work represents the sole conclusions of its authors"
 *
 * These sections are NOT LLM-generated. They are computed from pipeline metadata
 * to ensure factual accuracy about the research process itself.
 */

export interface ProtocolMetadata {
  query: string;
  providers: string[];          // e.g., ["openalex", "crossref", "overton", "wanfang"]
  sourcesFound: number;         // total results from all providers
  sourcesRetained: number;      // after ranking/filtering
  minQuality: number;           // quality threshold applied
  recentOnly: boolean;          // date filter
  maxPerProvider: number;       // diversity control
  llmFamily: string;            // e.g., "openai", "anthropic"
  llmModel: string;             // e.g., "gpt-4o", "claude-3.5-sonnet"
  generationDate: string;       // ISO date
  pipelineVersion: string;      // e.g., "v2"
  trustScore?: number;          // final trust score
  citationCount?: number;       // total citations in report
  claimCount?: number;          // atomic claims verified
  groundedness?: number;        // 0-1, NLI groundedness
}

/**
 * Generate the Research Protocol HTML section.
 * This documents the NomosX pipeline process for reproducibility.
 */
export function renderResearchProtocol(meta: ProtocolMetadata): string {
  const providerList = meta.providers.length > 0
    ? meta.providers.map(p => `<code style="font-family:var(--font-mono);font-size:0.75rem;background:rgba(240,240,250,0.05);padding:0.125rem 0.375rem;border-radius:2px;">${escapeHtml(p)}</code>`).join(' ')
    : '<em style="color:var(--nx-text-tertiary);">Not recorded</em>';

  const yieldRate = meta.sourcesFound > 0
    ? ((meta.sourcesRetained / meta.sourcesFound) * 100).toFixed(1)
    : 'N/A';

  // Detect potential biases
  const biases: string[] = [];
  const westernProviders = ['openalex', 'crossref', 'semantic-scholar', 'pubmed', 'ssrn'];
  const nonWesternProviders = ['wanfang', 'cyberleninka', 'jstage', 'scielo', 'elibrary'];
  const hasWestern = meta.providers.some(p => westernProviders.includes(p));
  const hasNonWestern = meta.providers.some(p => nonWesternProviders.includes(p));
  if (hasWestern && !hasNonWestern) {
    biases.push('Anglophone/Western source dominance — non-Western perspectives may be underrepresented');
  }
  if (meta.recentOnly) {
    biases.push('Recency filter applied — historical context may be limited to recent sources only');
  }
  if (meta.sourcesRetained < 15) {
    biases.push(`Small source corpus (${meta.sourcesRetained} sources) — findings may not be robust to corpus variation`);
  }
  biases.push('AI-generated synthesis — potential for subtle hallucination or misattribution despite verification gates');

  const biasesHtml = biases.map(b => `<li style="margin-bottom:0.25rem;">${escapeHtml(b)}</li>`).join('');

  return `
    <section class="brief-section">
      <h2>Research Protocol</h2>
      <p style="color:var(--nx-text-tertiary);font-size:0.8125rem;margin-bottom:1rem;">This section documents the NomosX research process for reproducibility. It is auto-generated from pipeline metadata, not LLM-generated.</p>

      <table style="width:100%;font-size:0.8125rem;border-collapse:collapse;">
        <tbody>
          <tr><td style="padding:0.5rem 0.75rem;color:var(--nx-text-tertiary);font-family:var(--font-mono);text-transform:uppercase;letter-spacing:0.08em;font-size:0.5625rem;width:40%;border-bottom:1px solid var(--nx-border-subtle);">Research Question</td><td style="padding:0.5rem 0.75rem;border-bottom:1px solid var(--nx-border-subtle);">${escapeHtml(meta.query)}</td></tr>
          <tr><td style="padding:0.5rem 0.75rem;color:var(--nx-text-tertiary);font-family:var(--font-mono);text-transform:uppercase;letter-spacing:0.08em;font-size:0.5625rem;border-bottom:1px solid var(--nx-border-subtle);">Providers Interrogated</td><td style="padding:0.5rem 0.75rem;border-bottom:1px solid var(--nx-border-subtle);">${providerList}</td></tr>
          <tr><td style="padding:0.5rem 0.75rem;color:var(--nx-text-tertiary);font-family:var(--font-mono);text-transform:uppercase;letter-spacing:0.08em;font-size:0.5625rem;border-bottom:1px solid var(--nx-border-subtle);">Sources Found</td><td style="padding:0.5rem 0.75rem;border-bottom:1px solid var(--nx-border-subtle);">${meta.sourcesFound}</td></tr>
          <tr><td style="padding:0.5rem 0.75rem;color:var(--nx-text-tertiary);font-family:var(--font-mono);text-transform:uppercase;letter-spacing:0.08em;font-size:0.5625rem;border-bottom:1px solid var(--nx-border-subtle);">Sources Retained</td><td style="padding:0.5rem 0.75rem;border-bottom:1px solid var(--nx-border-subtle);">${meta.sourcesRetained} <span style="color:var(--nx-text-tertiary);">(${yieldRate}% yield)</span></td></tr>
          <tr><td style="padding:0.5rem 0.75rem;color:var(--nx-text-tertiary);font-family:var(--font-mono);text-transform:uppercase;letter-spacing:0.08em;font-size:0.5625rem;border-bottom:1px solid var(--nx-border-subtle);">Quality Threshold</td><td style="padding:0.5rem 0.75rem;border-bottom:1px solid var(--nx-border-subtle);">≥ ${meta.minQuality}/100</td></tr>
          <tr><td style="padding:0.5rem 0.75rem;color:var(--nx-text-tertiary);font-family:var(--font-mono);text-transform:uppercase;letter-spacing:0.08em;font-size:0.5625rem;border-bottom:1px solid var(--nx-border-subtle);">Recency Filter</td><td style="padding:0.5rem 0.75rem;border-bottom:1px solid var(--nx-border-subtle);">${meta.recentOnly ? 'Last 3 years only' : 'No date restriction'}</td></tr>
          <tr><td style="padding:0.5rem 0.75rem;color:var(--nx-text-tertiary);font-family:var(--font-mono);text-transform:uppercase;letter-spacing:0.08em;font-size:0.5625rem;border-bottom:1px solid var(--nx-border-subtle);">Diversity Control</td><td style="padding:0.5rem 0.75rem;border-bottom:1px solid var(--nx-border-subtle);">Max ${meta.maxPerProvider} per provider</td></tr>
          <tr><td style="padding:0.5rem 0.75rem;color:var(--nx-text-tertiary);font-family:var(--font-mono);text-transform:uppercase;letter-spacing:0.08em;font-size:0.5625rem;border-bottom:1px solid var(--nx-border-subtle);">Pipeline Version</td><td style="padding:0.5rem 0.75rem;border-bottom:1px solid var(--nx-border-subtle);">${escapeHtml(meta.pipelineVersion)}</td></tr>
          ${meta.trustScore != null ? `<tr><td style="padding:0.5rem 0.75rem;color:var(--nx-text-tertiary);font-family:var(--font-mono);text-transform:uppercase;letter-spacing:0.08em;font-size:0.5625rem;border-bottom:1px solid var(--nx-border-subtle);">Trust Score</td><td style="padding:0.5rem 0.75rem;border-bottom:1px solid var(--nx-border-subtle);">${meta.trustScore}/100</td></tr>` : ''}
          ${meta.citationCount != null ? `<tr><td style="padding:0.5rem 0.75rem;color:var(--nx-text-tertiary);font-family:var(--font-mono);text-transform:uppercase;letter-spacing:0.08em;font-size:0.5625rem;border-bottom:1px solid var(--nx-border-subtle);">Citations</td><td style="padding:0.5rem 0.75rem;border-bottom:1px solid var(--nx-border-subtle);">${meta.citationCount}</td></tr>` : ''}
          ${meta.claimCount != null ? `<tr><td style="padding:0.5rem 0.75rem;color:var(--nx-text-tertiary);font-family:var(--font-mono);text-transform:uppercase;letter-spacing:0.08em;font-size:0.5625rem;border-bottom:1px solid var(--nx-border-subtle);">Claims Verified</td><td style="padding:0.5rem 0.75rem;border-bottom:1px solid var(--nx-border-subtle);">${meta.claimCount} ${meta.groundedness != null ? `(groundedness: ${(meta.groundedness * 100).toFixed(0)}%)` : ''}</td></tr>` : ''}
        </tbody>
      </table>

      <h3 style="font-size:0.8125rem;margin-top:1.25rem;margin-bottom:0.5rem;color:var(--nx-text-secondary);">Potential Biases</h3>
      <ul style="font-size:0.8125rem;color:var(--nx-text-secondary);padding-left:1.25rem;">
        ${biasesHtml}
      </ul>
    </section>`;
}

/**
 * Generate the AI Disclaimer footer.
 * Modeled on CFR ("takes no institutional position") and Brookings ("sole conclusions of authors").
 */
export function renderAIDisclaimer(meta: ProtocolMetadata): string {
  return `
    <section class="brief-section" style="margin-top:3rem;padding-top:2rem;border-top:1px solid var(--nx-border-subtle);">
      <div style="font-family:var(--font-mono);font-size:0.5625rem;text-transform:uppercase;letter-spacing:0.14em;color:var(--nx-text-tertiary);margin-bottom:0.75rem;">Methodological Note</div>
      <p style="font-size:0.75rem;color:var(--nx-text-tertiary);line-height:1.6;">
        This report was generated by the NomosX autonomous research pipeline (${escapeHtml(meta.pipelineVersion)}) on ${escapeHtml(meta.generationDate)}.
        Synthesis engine: <strong>${escapeHtml(meta.llmFamily)} / ${escapeHtml(meta.llmModel)}</strong>.
        No human editorial review was applied. All claims have been automatically verified against cited sources using NLI-based claim grounding.
        NomosX takes no institutional position. Analysis reflects source synthesis, not editorial stance.
        Potential biases include AI-generated synthesis artifacts, provider selection effects, and linguistic/cultural source skew.
        Readers should consult primary sources before making policy decisions based on this report.
      </p>
    </section>`;
}

function escapeHtml(s: string): string {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
