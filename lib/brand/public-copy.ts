/** Shared public-facing brand strings — single source for NomosX DA v2 */

export const BRAND_NAME = "NomosX";

export const BRAND_TITLE = "NomosX — Strategic Intelligence, Always On";

export const BRAND_TAGLINE = "Verified positions. No editorial agenda.";

export const BRAND_SHORT = "Strategic foresight, on demand";

export const BRAND_HERO_SUBTITLE_SHORT = "Strategic foresight, on demand.";

export const BRAND_DESCRIPTION =
  "NomosX produces strategic intelligence that institutions trust: verified sources, challenged assumptions, and a clear position — published without agenda.";

export const BRAND_OG_DESCRIPTION = `${BRAND_TAGLINE} Cross-domain foresight with defensible positions.`;

export const BRAND_MANIFEST_DESCRIPTION = `${BRAND_TAGLINE} Cross-domain foresight with verified positions.`;

export const BRAND_HERO_TITLE = "Making the future legible.";

export const BRAND_HERO_SUBTITLE = "NomosX is a think tank publishing verified positions on the questions that will define the next decade.";

export const BRAND_HERO_DETAIL =
  "250M+ sources · multi-scenario foresight · verified positions";

export const BRAND_MISSION =
  "The challenge: strategic decisions are still made on single forecasts, opaque sources, and borrowed convictions. Our answer: an institute that maps the evidence, confronts every assumption, and publishes positions anyone can verify — as a public good.";

export const BRAND_SOURCES_LABEL = "250M+";

export const BRAND_SOURCES_LINE = `${BRAND_SOURCES_LABEL} sources`;

export const BRAND_EMAIL_TAGLINE = "Strategic Intelligence, Always On";

export const BRAND_EMAIL_FOOTER = `${BRAND_NAME} · ${BRAND_EMAIL_TAGLINE}`;

export const BRAND_BRIEF_FOOTER = `${BRAND_NAME} — ${BRAND_TAGLINE}`;

export const METHOD_STEPS = ["Map", "Confront", "Quantify", "Decide"] as const;

export const METHOD_STEPS_INLINE = METHOD_STEPS.join(" · ");

export const METHOD_BLOCKS = [
  {
    name: METHOD_STEPS[0],
    desc: `We pull from ${BRAND_SOURCES_LABEL} sources across every relevant domain — academic research, institutional positions, primary data. The picture is never one-sided.`,
  },
  {
    name: METHOD_STEPS[1],
    desc: "Every claim is challenged. Every assumption attacked. We force the strongest counter-argument before we let any position stand.",
  },
  {
    name: METHOD_STEPS[2],
    desc: "Not one forecast. Multiple futures, each with a probability. Because the world doesn't move in straight lines — and decisions shouldn't either.",
  },
  {
    name: METHOD_STEPS[3],
    desc: "A clear position, with the confidence to back it. Sources visible. Doubts logged. Everything you need to brief a room or sign a decision.",
  },
] as const;

export const ABOUT_CTA_HEADLINE = "The briefing room,";
export const ABOUT_CTA_HEADLINE_ACCENT = "open to everyone.";

export const METHODOLOGY_INTRO =
  "Four stages. No shortcuts. A position worth defending at the end.";
