/** Shared public-facing brand strings — single source for NomosX DA v2 */

export const BRAND_NAME = "NomosX";

export const BRAND_TITLE = "NomosX — The Agentic Think Tank";

export const BRAND_TAGLINE = "Probable futures. Decisions owned. Evidence verified.";

export const BRAND_SHORT = "Agentic think tank";

export const BRAND_HERO_SUBTITLE_SHORT = "The agentic think tank.";

export const BRAND_DESCRIPTION =
  "Autonomous pipeline for probabilistic foresight: cross-domain mapping, scenario distributions, and institute positions — every claim source-verified.";

export const BRAND_OG_DESCRIPTION = `${BRAND_TAGLINE} Cross-domain foresight with probabilistic verdicts.`;

export const BRAND_MANIFEST_DESCRIPTION = `${BRAND_TAGLINE} Agentic cross-domain foresight with probabilistic institute positions.`;

export const BRAND_HERO_TITLE = "Pushing strategic analysis forward.";

export const BRAND_HERO_SUBTITLE = "The agentic think tank for probable futures.";

export const BRAND_HERO_DETAIL =
  "Cross-domain mapping · probabilistic distributions · institute positions · full traceability";

export const BRAND_MISSION =
  "NomosX believes strategic decisions grounded in a distribution of probable futures — not a frozen state of the art — change how institutions anticipate the world.";

export const BRAND_SOURCES_LABEL = "250M+";

export const BRAND_SOURCES_LINE = `${BRAND_SOURCES_LABEL} sources`;

export const BRAND_EMAIL_TAGLINE = "The Agentic Think Tank";

export const BRAND_EMAIL_FOOTER = `${BRAND_NAME} · ${BRAND_EMAIL_TAGLINE}`;

export const BRAND_BRIEF_FOOTER = `${BRAND_NAME} — ${BRAND_TAGLINE}`;

export const METHOD_STEPS = ["Map", "Confront", "Quantify", "Decide"] as const;

export const METHOD_STEPS_INLINE = METHOD_STEPS.join(" · ");

export const METHOD_BLOCKS = [
  {
    name: METHOD_STEPS[0],
    desc: `Cross-domain evidence from ${BRAND_SOURCES_LINE} — collisions between fields, not siloed summaries.`,
  },
  {
    name: METHOD_STEPS[1],
    desc: "Contradictions surfaced, steel-man debate, adversarial review before any position is taken.",
  },
  {
    name: METHOD_STEPS[2],
    desc: "Probabilistic trajectories and scenario distributions — futures as ranges, not single forecasts.",
  },
  {
    name: METHOD_STEPS[3],
    desc: "An institute position with confidence bounds and full [SRC-N] traceability on every claim.",
  },
] as const;

export const ABOUT_CTA_HEADLINE = "Probable futures.";
export const ABOUT_CTA_HEADLINE_ACCENT = "Open by default.";

export const METHODOLOGY_INTRO =
  "Four stages. One agentic pipeline. Every inquiry evidence-bound before publication.";
