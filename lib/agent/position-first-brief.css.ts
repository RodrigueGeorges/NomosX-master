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

  .format-badge {
    display: inline-block;
    font-family: var(--nx-font-mono);
    font-size: 0.625rem;
    font-weight: 500;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--nx-text-primary);
    background: rgba(240, 240, 250, 0.08);
    border: 1px solid rgba(240, 240, 250, 0.18);
    padding: 0.15rem 0.5rem;
    border-radius: 2px;
    margin-right: 0.5rem;
    vertical-align: middle;
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

  /* ── Narrative acts (4-act structure) ── */
  .nx-act {
    margin: 2.5rem 0;
  }
  .nx-act:first-of-type { margin-top: 1.75rem; }
  .act-method-label {
    font-family: var(--nx-font-mono);
    font-size: 0.5625rem;
    font-weight: 400;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: var(--nx-text-tertiary);
    margin: 0 0 0.5rem 0;
    padding: 0;
  }
  /* CSS-level safety net: hide any <sup> citations that slipped into
     data-no-cite protected zones (triple protection with JS + CSS) */
  [data-no-cite] sup.cite { display: none !important; }
  .act-title {
    font-family: var(--nx-font-heading);
    font-size: 1.5rem;
    font-weight: 700;
    line-height: 1.15;
    letter-spacing: -0.01em;
    color: var(--nx-text-primary);
    margin-bottom: 1.5rem;
    padding-bottom: 0.75rem;
    border-bottom: 1px solid var(--nx-border-medium);
    max-width: var(--nx-read-max-width);
  }

  /* ── In Brief (McKinsey-style opening summary) ── */
  .in-brief {
    background: rgba(240, 240, 250, 0.03) !important;
    border: 1px solid var(--nx-border-medium) !important;
    margin: 1.75rem 0 2.5rem !important;
  }
  .in-brief-list {
    list-style: none;
    padding: 0;
    margin: 0;
  }
  .in-brief-list li {
    font-size: 1rem;
    color: var(--nx-text-primary);
    line-height: 1.6;
    padding: 0.5rem 0 0.5rem 1.5rem;
    position: relative;
    border-bottom: 1px solid var(--nx-border-subtle);
  }
  .in-brief-list li:last-child { border-bottom: none; }
  .in-brief-list li::before {
    content: '→';
    position: absolute;
    left: 0;
    top: 0.5rem;
    color: var(--nx-text-tertiary);
    font-family: var(--nx-font-mono);
    font-size: 0.875rem;
  }

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

  /* ── Scenario comparison table (the exhibit) ── */
  .scenario-table-wrap {
    margin: 1.25rem 0;
    overflow-x: auto;
  }
  .scenario-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.8125rem;
  }
  .scenario-table th {
    font-family: var(--nx-font-mono);
    font-size: 0.625rem;
    font-weight: 500;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--nx-text-tertiary);
    text-align: left;
    padding: 0.375rem 0.625rem;
    border-bottom: 1px solid var(--nx-border-subtle);
  }
  .scenario-table td {
    padding: 0.5rem 0.625rem;
    border-bottom: 1px solid var(--nx-border-subtle);
    color: var(--nx-text-secondary);
    vertical-align: top;
  }
  .scenario-table td:first-child {
    font-family: var(--nx-font-heading);
    font-weight: 500;
    color: var(--nx-text-primary);
  }
  .scenario-table tr.scenario-central-row td {
    background: rgba(240, 240, 250, 0.04);
  }
  .scenario-table tr:last-child td { border-bottom: none; }

  /* ── Key Judgments (NIC/Belfer exec summary) ── */
  .key-judgments .bottom-line {
    font-size: 1.05em;
    font-weight: 500;
    color: var(--nx-text-primary);
    line-height: 1.5;
    margin: 0.375rem 0 0.75rem;
  }
  .key-judgments-list {
    margin: 0;
    padding-left: 1.25rem;
    counter-reset: judgment;
    list-style: none;
  }
  .key-judgments-list li {
    counter-increment: judgment;
    position: relative;
    padding-left: 1.75rem;
    margin-bottom: 0.5rem;
    font-size: var(--nx-read-size);
    line-height: var(--nx-read-lh);
    color: var(--nx-read-color);
  }
  .key-judgments-list li::before {
    content: counter(judgment);
    position: absolute;
    left: 0;
    top: 0.1em;
    font-family: var(--nx-font-mono);
    font-size: 0.7rem;
    font-weight: 600;
    color: var(--nx-text-tertiary);
    border: 1px solid var(--nx-border-subtle);
    border-radius: 50%;
    width: 1.25rem;
    height: 1.25rem;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  /* ── 2×2 uncertainty matrix (Shell-style exhibit) ── */
  .pf-matrix {
    margin: 1.25rem 0;
  }
  .pf-matrix-y-label,
  .pf-matrix-x-label {
    font-family: var(--nx-font-mono);
    font-size: 0.6875rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--nx-text-tertiary);
    text-align: center;
    margin: 0.375rem 0;
  }
  .pf-matrix-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1px;
    background: var(--nx-border-subtle);
    border: 1px solid var(--nx-border-subtle);
  }
  .pf-matrix-cell {
    background: var(--nx-bg, #0a0a0f);
    min-height: 5rem;
    padding: 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }
  .pf-matrix-cell-label {
    font-family: var(--nx-font-mono);
    font-size: 0.625rem;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--nx-text-tertiary);
  }
  .pf-matrix-scenario {
    font-family: var(--nx-font-heading);
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--nx-text-primary);
    padding: 0.125rem 0.5rem;
    border: 1px solid var(--nx-border-subtle);
    border-radius: 2px;
    width: fit-content;
  }
  .pf-matrix-legend {
    font-size: 0.8125rem;
    color: var(--nx-text-tertiary);
    font-style: italic;
    margin-top: 0.5rem;
  }

  /* ── Signal monitor table (decision-grade) ── */
  .signal-monitor-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.8125rem;
    margin: 0.5rem 0 1rem;
  }
  .signal-monitor-table th {
    font-family: var(--nx-font-mono);
    font-size: 0.625rem;
    font-weight: 500;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--nx-text-tertiary);
    text-align: left;
    padding: 0.375rem 0.625rem;
    border-bottom: 1px solid var(--nx-border-subtle);
  }
  .signal-monitor-table td {
    padding: 0.5rem 0.625rem;
    border-bottom: 1px solid var(--nx-border-subtle);
    color: var(--nx-text-secondary);
    vertical-align: top;
  }
  .signal-monitor-table tr:last-child td { border-bottom: none; }
  .signal-monitor-table .signal-favors {
    font-family: var(--nx-font-heading);
    font-weight: 500;
    color: var(--nx-text-primary);
    white-space: nowrap;
  }

  /* ── Action Priority Matrix (Harvard M-RCBG exhibit) ── */
  .action-matrix {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.8125rem;
    margin: 0.5rem 0;
  }
  .action-matrix th {
    font-family: var(--nx-font-mono);
    font-size: 0.625rem;
    font-weight: 500;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--nx-text-tertiary);
    text-align: left;
    padding: 0.375rem 0.625rem;
    border-bottom: 1px solid var(--nx-border-subtle);
  }
  .action-matrix td {
    padding: 0.5rem 0.625rem;
    border-bottom: 1px solid var(--nx-border-subtle);
    color: var(--nx-text-secondary);
    vertical-align: top;
  }
  .action-matrix tr:last-child td { border-bottom: none; }
  .action-matrix .action-num {
    font-family: var(--nx-font-mono);
    font-size: 0.75rem;
    color: var(--nx-text-tertiary);
    width: 2rem;
  }
  .action-matrix .action-horizon {
    font-family: var(--nx-font-mono);
    font-size: 0.6875rem;
    color: var(--nx-text-tertiary);
    white-space: nowrap;
  }
  .action-matrix .action-type {
    font-family: var(--nx-font-mono);
    font-size: 0.6875rem;
    white-space: nowrap;
  }
  .action-matrix .action-type-hedge { color: rgba(140, 200, 140, 0.85); }
  .action-matrix .action-type-central { color: var(--nx-text-tertiary); }

  /* ── Decision logic + colophon ── */
  .decision-logic {
    font-size: 0.875rem;
    font-style: italic;
    color: var(--nx-text-tertiary);
    border-left: 2px solid var(--nx-border-subtle);
    padding-left: 0.75rem;
    margin: 0.75rem 0 1.25rem;
  }
  .colophon {
    margin-top: 2rem;
    padding-top: 1rem;
    border-top: 1px solid var(--nx-border-subtle);
  }
  .colophon-text {
    font-size: 0.8125rem;
    color: var(--nx-text-tertiary);
    line-height: 1.6;
  }

  /* ── Scenario signals ── */
  .scenario-signals {
    margin-top: 0.5rem;
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
    align-items: center;
  }
  .signal-label {
    font-family: var(--nx-font-mono);
    font-size: 0.5625rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--nx-text-tertiary);
  }
  .signal-tag {
    font-size: 0.6875rem;
    color: var(--nx-text-secondary);
    background: var(--nx-surface-raised, rgba(255,255,255,0.04));
    padding: 0.125rem 0.5rem;
    border-radius: 0.25rem;
    border: 1px solid var(--nx-border-subtle);
  }

  /* ── Delphi foresight metrics ── */
  .scenario-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem 0.75rem;
    margin-top: 0.375rem;
    font-family: var(--nx-font-mono);
    font-size: 0.625rem;
    color: var(--nx-text-tertiary);
  }
  .scenario-meta span {
    white-space: nowrap;
  }
  .scenario-drivers {
    margin-top: 0.5rem;
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
    align-items: center;
  }
  .driver-tag {
    font-size: 0.6875rem;
    color: rgba(80, 200, 120, 0.7);
    background: rgba(80, 200, 120, 0.06);
    padding: 0.125rem 0.5rem;
    border-radius: 0.25rem;
    border: 1px solid rgba(80, 200, 120, 0.15);
  }
  .blocker-tag {
    font-size: 0.6875rem;
    color: rgba(220, 100, 100, 0.7);
    background: rgba(220, 100, 100, 0.06);
    padding: 0.125rem 0.5rem;
    border-radius: 0.25rem;
    border: 1px solid rgba(220, 100, 100, 0.15);
  }

  /* ── PhD-level prospective blocks ── */
  .scenario-narrative {
    font-size: 1rem;
    line-height: 1.7;
    color: var(--nx-read-color);
    margin: 0.75rem 0 1rem;
    max-width: var(--nx-read-max-width);
    font-style: italic;
    border-left: 2px solid rgba(180, 180, 200, 0.15);
    padding-left: 1rem;
  }
  .scenario-narrative p { margin-bottom: 0.75em; }
  .scenario-narrative p:last-child { margin-bottom: 0; }

  .scenario-tipping {
    margin: 0.5rem 0;
    font-size: 0.875rem;
    color: rgba(255, 200, 100, 0.8);
  }
  .scenario-cross-impact {
    margin: 0.5rem 0;
    font-size: 0.875rem;
    color: rgba(150, 180, 220, 0.7);
  }
  .scenario-uncertainty {
    margin: 0.5rem 0 0.75rem;
  }
  .uncertainty-tag {
    font-size: 0.6875rem;
    color: rgba(200, 180, 100, 0.7);
    background: rgba(200, 180, 100, 0.06);
    padding: 0.125rem 0.5rem;
    border-radius: 0.25rem;
    border: 1px solid rgba(200, 180, 100, 0.15);
    margin: 0 0.25rem 0.25rem 0;
    display: inline-block;
  }

  /* ── Prospective Framework block ── */
  .prospective-framework {
    border: 1px solid rgba(180, 180, 200, 0.1);
    border-radius: 0.5rem;
    padding: 1.25rem 1.5rem;
    margin: 1.5rem 0;
    background: rgba(255, 255, 255, 0.015);
  }
  .prospective-framework .nx-eyebrow {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: rgba(180, 180, 220, 0.5);
    margin-bottom: 0.75rem;
  }
  .pf-horizon, .pf-base-rate, .pf-fermi, .pf-cross-impact {
    margin: 0.5rem 0;
    font-size: 0.9rem;
    line-height: 1.6;
    color: var(--nx-read-color);
  }
  .pf-horizon .chain-label, .pf-base-rate .chain-label, .pf-fermi .chain-label, .pf-cross-impact .chain-label {
    color: rgba(180, 180, 220, 0.5);
    font-weight: 600;
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .pf-uncertainties {
    margin: 0.75rem 0;
  }
  .pf-snow-leopards {
    margin: 0.75rem 0;
  }
  .snow-leopard-tag {
    font-size: 0.6875rem;
    color: rgba(220, 180, 255, 0.7);
    background: rgba(220, 180, 255, 0.06);
    padding: 0.125rem 0.5rem;
    border-radius: 0.25rem;
    border: 1px solid rgba(220, 180, 255, 0.15);
    margin: 0 0.25rem 0.25rem 0;
    display: inline-block;
  }
  .pf-methodology {
    margin-top: 1rem;
    padding-top: 0.75rem;
    border-top: 1px dashed rgba(180, 180, 200, 0.08);
  }

  /* ── The Lede (Economist standfirst) ── */
  .nx-lede {
    font-family: var(--nx-font-heading);
    font-size: 1.125rem;
    line-height: 1.55;
    color: var(--nx-text-primary);
    margin: 1.25rem 0 1.5rem;
    padding-left: 1rem;
    border-left: 3px solid var(--nx-accent, #8b7ff0);
    font-weight: 500;
  }

  /* ── Scenario matrix (Shell method) ── */
  .pf-predetermined {
    margin: 0.875rem 0;
    padding: 0.75rem 1rem;
    background: rgba(139, 127, 240, 0.05);
    border-left: 2px solid rgba(139, 127, 240, 0.4);
    border-radius: 0 6px 6px 0;
  }
  .pf-predetermined-title, .pf-axes-title {
    font-family: var(--nx-font-mono);
    font-size: 0.6875rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: rgba(180, 180, 220, 0.6);
    margin-bottom: 0.5rem;
  }
  .pf-predetermined-list {
    margin: 0;
    padding-left: 1.125rem;
    font-size: 0.875rem;
    line-height: 1.55;
    color: var(--nx-read-color);
  }
  .pf-predetermined-list li { margin-bottom: 0.25rem; }
  .pf-axes { margin: 0.875rem 0; }
  .pf-axis {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    margin-bottom: 0.5rem;
    padding: 0.5rem 0.75rem;
    border: 1px dashed var(--nx-border-subtle);
    border-radius: 6px;
  }
  .pf-axis-name {
    font-weight: 600;
    font-size: 0.8125rem;
    color: var(--nx-text-primary);
  }
  .pf-axis-poles {
    font-size: 0.8125rem;
    color: var(--nx-text-secondary);
  }
  .pf-axis-sep {
    color: var(--nx-accent, #8b7ff0);
    margin: 0 0.375rem;
  }
  .scenario-axis {
    font-size: 0.75rem;
    color: var(--nx-text-tertiary);
    margin-bottom: 0.375rem;
  }
  .signature-moment {
    font-size: 0.9375rem;
    color: var(--nx-text-secondary);
    margin-bottom: 0.625rem;
    padding-left: 0.75rem;
    border-left: 2px solid var(--nx-accent, #8b7ff0);
  }
  .scenario-wildcard {
    border-top-color: rgba(220, 180, 255, 0.3);
    background: linear-gradient(90deg, rgba(220, 180, 255, 0.03), transparent 60%);
  }
  .scenario-wildcard .scenario-name { color: rgba(220, 180, 255, 0.85); }

  /* ── Adversarial review (published dissent) ── */
  .nx-adversarial-review {
    margin: 1.5rem 0;
    padding: 1rem 1.25rem;
    border: 1px solid rgba(220, 120, 120, 0.25);
    border-left: 3px solid rgba(220, 120, 120, 0.6);
    border-radius: 0 8px 8px 0;
    background: rgba(220, 120, 120, 0.04);
  }
  .da-verdict-line {
    font-size: 0.8125rem;
    color: var(--nx-text-secondary);
    margin: 0 0 0.5rem;
  }
  .da-killshot {
    font-family: var(--nx-font-heading);
    font-size: 1rem;
    line-height: 1.5;
    color: var(--nx-text-primary);
    margin: 0.625rem 0;
    padding-left: 0.875rem;
    border-left: 2px solid rgba(220, 120, 120, 0.5);
  }
  .da-challenges {
    margin: 0.5rem 0;
    padding-left: 1.125rem;
    font-size: 0.875rem;
    line-height: 1.55;
    color: var(--nx-read-color);
  }
  .da-challenges li { margin-bottom: 0.375rem; }
  .da-challenge-type {
    font-family: var(--nx-font-mono);
    font-size: 0.6875rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: rgba(220, 140, 140, 0.8);
    margin-right: 0.375rem;
  }
  .da-vuln {
    font-size: 0.8125rem;
    color: var(--nx-text-secondary);
    margin: 0.5rem 0 0;
    padding-top: 0.5rem;
    border-top: 1px dashed rgba(220, 120, 120, 0.2);
  }

  /* ── Nomos Arc transitions ── */
  .nx-act-transition {
    letter-spacing: 0.02em;
  }

  /* ── Brief footer ── */
  .nx-brief-footer {
    letter-spacing: 0.05em;
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
