/**
 * Shared CSS for position-first brief HTML (Editorial V2).
 * Values mirror --nx-* tokens from app/globals.css (standalone briefs load Barlow via Google Fonts).
 */
export const POSITION_FIRST_BRIEF_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Barlow+Semi+Condensed:wght@600;700&family=Barlow:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');

  :root {
    --nx-bg: #000000;
    --nx-bg-elevated: #0a0a0a;
    --nx-bg-panel: #111111;
    --nx-text-hero: #f0f0fa;
    --nx-text-primary: #f0f0fa;
    --nx-text-secondary: rgba(240, 240, 250, 0.62);
    --nx-text-tertiary: rgba(240, 240, 250, 0.35);
    --nx-text-quaternary: rgba(240, 240, 250, 0.18);
    --nx-border-subtle: rgba(240, 240, 250, 0.08);
    --nx-border-medium: rgba(240, 240, 250, 0.14);
    --nx-border-cta: rgba(240, 240, 250, 0.35);
    --nx-hero-ls: -0.01em;
    --nx-read-max-width: 42rem;
    --nx-read-size: 1.0625rem;
    --nx-read-lh: 1.75;
    --nx-read-color: rgba(240, 240, 250, 0.78);
    --nx-font-heading: 'Barlow Semi Condensed', 'Arial Narrow', sans-serif;
    --nx-font-body: 'Barlow', 'DIN Alternate', 'Segoe UI', sans-serif;
    --nx-font-mono: 'JetBrains Mono', ui-monospace, monospace;
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }

  article.nomosx-brief {
    max-width: 52rem;
    margin: 0 auto;
    padding: 0 2rem 4rem;
    font-family: var(--nx-font-body);
    font-size: var(--nx-read-size);
    line-height: var(--nx-read-lh);
    color: var(--nx-read-color);
    background: var(--nx-bg);
  }

  /* ── Hero image ── */
  .hero-image {
    margin: 0 -2rem 0;
    width: calc(100% + 4rem);
    overflow: hidden;
    border-bottom: 1px solid var(--nx-border-subtle);
  }
  .hero-image img {
    width: 100%;
    height: auto;
    display: block;
    object-fit: cover;
    max-height: 480px;
    filter: brightness(0.92) contrast(1.08);
  }

  /* ── Brief hero ── */
  .brief-hero {
    margin-bottom: 3rem;
    padding: 3rem 0 2rem;
    border-bottom: 1px solid var(--nx-border-subtle);
  }

  .brief-brand {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.625rem 0.75rem;
    margin-bottom: 2rem;
    color: var(--nx-text-primary);
  }
  .brief-brand-tag {
    font-family: var(--nx-font-mono);
    font-size: 0.5625rem;
    font-weight: 400;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--nx-text-tertiary);
  }

  .nx-eyebrow {
    font-family: var(--nx-font-mono);
    font-size: 0.5625rem;
    font-weight: 400;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--nx-text-tertiary);
    margin-bottom: 0.75rem;
  }

  .brief-hero h1 {
    font-family: var(--nx-font-heading);
    font-size: clamp(2rem, 5vw, 3.75rem);
    font-weight: 700;
    line-height: 0.92;
    letter-spacing: var(--nx-hero-ls);
    text-transform: uppercase;
    color: var(--nx-text-hero);
    margin-bottom: 1.25rem;
    max-width: 22ch;
  }

  .collision-line {
    font-size: 1rem;
    color: var(--nx-text-secondary);
    margin-bottom: 0.5rem;
    max-width: var(--nx-read-max-width);
    line-height: 1.55;
  }

  .urgency {
    display: inline-block;
    font-family: var(--nx-font-mono);
    font-size: 0.5625rem;
    font-weight: 400;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    border: 1px solid var(--nx-border-subtle);
    padding: 0.35rem 0.7rem;
    color: var(--nx-text-tertiary);
    margin-top: 1rem;
  }

  .metadata-bar {
    font-family: var(--nx-font-mono);
    font-size: 0.6875rem;
    color: var(--nx-text-quaternary);
    margin-top: 1.25rem;
    padding-top: 1.25rem;
    border-top: 1px solid var(--nx-border-subtle);
    letter-spacing: 0.04em;
  }

  /* ── Content blocks ── */
  .nx-block {
    border: 1px solid var(--nx-border-subtle);
    background: rgba(240, 240, 250, 0.015);
    padding: 1.75rem;
    margin: 1.75rem 0;
    transition: border-color 200ms ease;
  }
  .nx-block:hover {
    border-color: var(--nx-border-medium);
  }
  .nx-block h2,
  .nx-block .nx-eyebrow { margin-bottom: 0.875rem; }

  /* ── Methodology box ── */
  .methodology-box {
    background: var(--nx-bg-elevated) !important;
    border: 1px solid var(--nx-border-subtle) !important;
    border-radius: 0;
    padding: 1.25rem 1.75rem !important;
  }

  /* ── Team grid ── */
  .team-grid { display: grid; gap: 0.75rem; margin-top: 0.875rem; }
  .team-card {
    border: 1px solid var(--nx-border-subtle);
    padding: 1rem 1.125rem;
    background: rgba(240, 240, 250, 0.015);
    transition: border-color 200ms ease, background 200ms ease;
  }
  .team-card:hover {
    border-color: var(--nx-border-medium);
    background: rgba(240, 240, 250, 0.03);
  }
  .team-role {
    font-family: var(--nx-font-mono);
    font-size: 0.5625rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--nx-text-tertiary);
    margin-bottom: 0.35rem;
  }
  .team-domain {
    font-family: var(--nx-font-heading);
    font-size: 0.9375rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--nx-text-primary);
    margin-bottom: 0.4rem;
  }
  .team-mandate {
    font-size: 0.9375rem;
    color: var(--nx-text-secondary);
    line-height: 1.55;
  }

  /* ── Scenarios ── */
  .scenario-row {
    border-top: 1px solid var(--nx-border-subtle);
    padding: 1.125rem 0;
    transition: padding-left 200ms ease;
  }
  .scenario-row:first-child { border-top: none; padding-top: 0; }
  .scenario-row:hover { padding-left: 0.5rem; }
  .scenario-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 0.75rem;
    margin-bottom: 0.5rem;
  }
  .scenario-name {
    font-family: var(--nx-font-heading);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    font-size: 0.875rem;
    color: var(--nx-text-primary);
  }
  .scenario-prob {
    font-family: var(--nx-font-mono);
    font-size: 0.75rem;
    color: var(--nx-text-tertiary);
    letter-spacing: 0.04em;
  }
  .scenario-desc {
    font-size: var(--nx-read-size);
    color: var(--nx-read-color);
    line-height: var(--nx-read-lh);
  }

  /* ── Verdict / position block ── */
  .verdict-block {
    border-left: 2px solid var(--nx-text-primary);
    padding-left: 1.5rem;
    margin: 1.25rem 0;
    max-width: var(--nx-read-max-width);
  }
  .verdict-block p {
    margin-bottom: 1.25em;
    color: var(--nx-read-color);
    line-height: var(--nx-read-lh);
  }
  .verdict-block p:last-child { margin-bottom: 0; }

  /* ── Through line ── */
  .through-line {
    font-size: 1.125rem !important;
    font-weight: 500;
    color: var(--nx-text-secondary) !important;
    margin: 1.75em 0 !important;
    line-height: 1.5 !important;
    max-width: var(--nx-read-max-width);
  }

  /* ── Causal chain ── */
  .causal-chain { padding: 1.75rem; }
  .chain-link {
    padding: 1.25rem 0;
    border-top: 1px solid var(--nx-border-subtle);
  }
  .chain-link:first-child { border-top: none; padding-top: 0; }
  .chain-link.chain-connected {
    position: relative;
  }
  .chain-link.chain-connected::after {
    content: '';
    position: absolute;
    left: 0;
    bottom: -1px;
    width: 24px;
    height: 1px;
    background: var(--nx-border-medium);
  }
  .chain-status {
    display: inline-block;
    font-family: var(--nx-font-mono);
    font-size: 0.5rem;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--nx-text-tertiary);
    border: 1px solid var(--nx-border-subtle);
    padding: 0.2rem 0.5rem;
    margin-bottom: 0.75rem;
  }
  .chain-status-present_fact { color: var(--nx-text-primary); border-color: var(--nx-border-medium); }
  .chain-status-active_mechanism { color: var(--nx-text-secondary); }
  .chain-status-future_extrapolation { color: var(--nx-text-tertiary); }
  .chain-claim p { color: var(--nx-read-color); line-height: var(--nx-read-lh); margin-bottom: 0.75em; }
  .chain-claim p:last-child { margin-bottom: 0; }
  .chain-evidence, .chain-warrant {
    font-size: 0.9375rem;
    color: var(--nx-text-secondary);
    line-height: 1.6;
    margin-top: 0.5em;
  }
  .chain-evidence p, .chain-warrant p { margin-bottom: 0.5em; }
  .chain-evidence p:last-child, .chain-warrant p:last-child { margin-bottom: 0; }
  .chain-label {
    font-family: var(--nx-font-mono);
    font-size: 0.5625rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--nx-text-tertiary);
    margin-right: 0.5rem;
  }

  /* ── Rejected alternatives ── */
  .rejected-alt {
    padding: 1rem 0;
    border-top: 1px solid var(--nx-border-subtle);
  }
  .rejected-alt:first-child { border-top: none; padding-top: 0; }
  .rejected-scenario p { color: var(--nx-text-primary); font-weight: 500; }
  .rejected-why, .rejected-risk { font-size: 0.9375rem; color: var(--nx-text-secondary); margin-top: 0.5em; }

  /* ── Recommendations ── */
  .recommendations ul {
    padding-left: 1.125rem;
    margin-top: 0.5rem;
  }
  .recommendations li {
    font-size: var(--nx-read-size);
    color: var(--nx-read-color);
    line-height: var(--nx-read-lh);
    margin: 0.5rem 0;
  }

  /* ── Lists in blocks ── */
  .nx-block ul {
    padding-left: 1.125rem;
  }
  .nx-block li {
    font-size: var(--nx-read-size);
    color: var(--nx-read-color);
    line-height: var(--nx-read-lh);
    margin: 0.5rem 0;
  }
  .objections li, .trace li {
    font-size: var(--nx-read-size);
    color: var(--nx-read-color);
    line-height: var(--nx-read-lh);
    margin: 0.5rem 0;
  }
  .objections ul, .trace ul { padding-left: 1.125rem; }

  /* ── Confidence ── */
  .confidence {
    font-family: var(--nx-font-mono);
    font-size: 0.6875rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--nx-text-tertiary);
    margin-top: 0.75rem;
  }

  /* ── References ── */
  .references-section {
    margin-top: 3rem;
    padding-top: 2rem;
    border-top: 1px solid var(--nx-border-subtle);
  }
  .references-section h2 {
    font-family: var(--nx-font-mono);
    font-size: 0.5625rem;
    font-weight: 400;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--nx-text-tertiary);
    margin-bottom: 1.25rem;
  }
  .apa-ref {
    display: block;
    padding: 0.625rem 0 0.625rem 2.5rem;
    text-indent: -2.5rem;
    font-size: 0.8125rem;
    color: var(--nx-text-secondary);
    line-height: 1.55;
    border-bottom: 1px solid var(--nx-border-subtle);
    transition: color 150ms ease;
  }
  .apa-ref:hover { color: var(--nx-text-primary); }
  .apa-ref:last-child { border-bottom: none; }
  .ref-num {
    font-family: var(--nx-font-mono);
    font-size: 0.6875rem;
    color: var(--nx-text-tertiary);
  }

  /* ── Citations ── */
  sup.cite a {
    color: var(--nx-text-secondary);
    text-decoration: none;
    font-family: var(--nx-font-mono);
    font-size: 0.5625rem;
    font-weight: 500;
    transition: color 150ms ease;
  }
  sup.cite a:hover { color: var(--nx-text-primary); }

  /* ── Footer ── */
  .brief-footer {
    margin-top: 3rem;
    padding-top: 2rem;
    border-top: 1px solid var(--nx-border-subtle);
    font-family: var(--nx-font-mono);
    font-size: 0.5625rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--nx-text-quaternary);
    text-align: center;
  }

  /* ── Responsive ── */
  @media (max-width: 640px) {
    article.nomosx-brief { padding: 0 1rem 2.5rem; }
    .brief-hero h1 { font-size: 1.75rem; }
    .hero-image { margin: 0 -1rem 0; width: calc(100% + 2rem); }
    .nx-block { padding: 1.25rem; }
  }
`;
