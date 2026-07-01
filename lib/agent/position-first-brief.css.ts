/**
 * Shared CSS for position-first brief HTML (Editorial V2).
 * Values mirror --nx-* tokens from app/globals.css (standalone briefs load Barlow via Google Fonts).
 */
export const POSITION_FIRST_BRIEF_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Barlow+Semi+Condensed:wght@600;700&family=Barlow:wght@400;500;600&display=swap');

  :root {
    --nx-bg: #000000;
    --nx-text-hero: #f0f0fa;
    --nx-text-primary: #f0f0fa;
    --nx-text-secondary: rgba(240, 240, 250, 0.62);
    --nx-text-tertiary: rgba(240, 240, 250, 0.35);
    --nx-border-subtle: rgba(240, 240, 250, 0.08);
    --nx-border-cta: rgba(240, 240, 250, 0.35);
    --nx-hero-ls: -0.01em;
    --nx-read-max-width: 42rem;
    --nx-read-size: 1.0625rem;
    --nx-read-lh: 1.75;
    --nx-read-color: rgba(240, 240, 250, 0.78);
    --nx-font-heading: 'Barlow Semi Condensed', 'Arial Narrow', sans-serif;
    --nx-font-body: 'Barlow', 'DIN Alternate', 'Segoe UI', sans-serif;
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }

  article.nomosx-brief {
    max-width: 52rem;
    margin: 0 auto;
    padding: 3rem 2rem 4rem;
    font-family: var(--nx-font-body);
    font-size: var(--nx-read-size);
    line-height: var(--nx-read-lh);
    color: var(--nx-read-color);
    background: var(--nx-bg);
  }

  .brief-hero {
    margin-bottom: 3rem;
    padding-bottom: 2rem;
    border-bottom: 1px solid var(--nx-border-subtle);
  }

  .brief-brand {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.625rem 0.75rem;
    margin-bottom: 1.25rem;
    color: var(--nx-text-primary);
  }
  .brief-brand-tag {
    font-size: 0.625rem;
    font-weight: 400;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--nx-text-tertiary);
  }

  .nx-eyebrow {
    font-size: 0.625rem;
    font-weight: 400;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--nx-text-tertiary);
    margin-bottom: 0.75rem;
  }

  .brief-hero h1 {
    font-family: var(--nx-font-heading);
    font-size: clamp(2rem, 5vw, 3.75rem);
    font-weight: 600;
    line-height: 0.92;
    letter-spacing: var(--nx-hero-ls);
    text-transform: uppercase;
    color: var(--nx-text-hero);
    margin-bottom: 1rem;
    max-width: 20ch;
  }

  .collision-line {
    font-size: var(--nx-read-size);
    color: var(--nx-text-secondary);
    margin-bottom: 0.5rem;
    max-width: var(--nx-read-max-width);
  }

  .urgency {
    display: inline-block;
    font-size: 0.625rem;
    font-weight: 400;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    border: 1px solid var(--nx-border-subtle);
    padding: 0.35rem 0.65rem;
    color: var(--nx-text-tertiary);
    margin-top: 0.75rem;
    border-radius: 4px;
  }

  .nx-block {
    border: 1px solid var(--nx-border-subtle);
    background: rgba(240, 240, 250, 0.02);
    padding: 1.5rem;
    margin: 1.5rem 0;
    border-radius: 4px;
  }

  .nx-block h2,
  .nx-block .nx-eyebrow { margin-bottom: 0.75rem; }

  .team-grid { display: grid; gap: 0.75rem; margin-top: 0.75rem; }
  .team-card {
    border: 1px solid var(--nx-border-subtle);
    padding: 0.875rem 1rem;
    background: rgba(240, 240, 250, 0.02);
    border-radius: 4px;
  }
  .team-role {
    font-size: 0.625rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--nx-text-tertiary);
    margin-bottom: 0.25rem;
  }
  .team-domain {
    font-size: 0.9375rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--nx-text-primary);
    margin-bottom: 0.35rem;
  }
  .team-mandate { font-size: var(--nx-read-size); color: var(--nx-text-secondary); line-height: var(--nx-read-lh); }

  .scenario-row { border-top: 1px solid var(--nx-border-subtle); padding: 1rem 0; }
  .scenario-row:first-child { border-top: none; padding-top: 0; }
  .scenario-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 0.75rem;
    margin-bottom: 0.5rem;
  }
  .scenario-name {
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    font-size: 0.875rem;
    color: var(--nx-text-primary);
  }
  .scenario-prob { font-size: 0.875rem; color: var(--nx-text-secondary); }
  .scenario-desc { font-size: var(--nx-read-size); color: var(--nx-read-color); line-height: var(--nx-read-lh); }

  .verdict-block {
    border-left: 3px solid var(--nx-text-primary);
    padding-left: 1.25rem;
    margin: 1rem 0;
    max-width: var(--nx-read-max-width);
  }
  .verdict-block p {
    margin-bottom: 1.25em;
    color: var(--nx-read-color);
    line-height: var(--nx-read-lh);
  }
  .verdict-block p:last-child { margin-bottom: 0; }

  .confidence {
    font-size: 0.75rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--nx-text-tertiary);
    margin-top: 0.75rem;
  }

  .objections li, .trace li {
    font-size: var(--nx-read-size);
    color: var(--nx-read-color);
    line-height: var(--nx-read-lh);
    margin: 0.5rem 0;
  }
  .objections ul, .trace ul { padding-left: 1.125rem; }

  .metadata-bar {
    font-size: 0.75rem;
    color: var(--nx-text-tertiary);
    margin-top: 1rem;
    padding-top: 1rem;
    border-top: 1px solid var(--nx-border-subtle);
  }

  .references-section { margin-top: 2.5rem; padding-top: 1.5rem; border-top: 1px solid var(--nx-border-subtle); }
  .references-section h2 {
    font-size: 0.625rem;
    font-weight: 400;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--nx-text-tertiary);
    margin-bottom: 1rem;
  }
  .apa-ref {
    display: block;
    padding: 0.5rem 0 0.5rem 2.25rem;
    text-indent: -2.25rem;
    font-size: 0.8125rem;
    color: var(--nx-text-secondary);
    line-height: 1.55;
    border-bottom: 1px solid var(--nx-border-subtle);
  }
  sup.cite a { color: var(--nx-text-secondary); text-decoration: none; font-size: 0.625rem; font-weight: 600; }

  .brief-footer {
    margin-top: 2.5rem;
    font-size: 0.6875rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--nx-text-tertiary);
    text-align: center;
  }

  @media (max-width: 640px) {
    article.nomosx-brief { padding: 1.75rem 1rem 2.5rem; }
    .brief-hero h1 { font-size: 1.75rem; }
  }
`;
