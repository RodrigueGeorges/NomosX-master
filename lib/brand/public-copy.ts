/** Shared public-facing brand strings — single source for NomosX DA v2 */

export const BRAND_NAME = "NomosX";

export const BRAND_POSITIONING = "The first AI think tank, always on";

export const BRAND_TITLE = "NomosX — From Chaos to Nomos";

export const BRAND_TAGLINE = "From Chaos to Nomos.";

export const BRAND_SHORT = BRAND_TAGLINE;

export const BRAND_HERO_SUBTITLE_SHORT = BRAND_TAGLINE;

export const BRAND_DESCRIPTION =
  "NomosX is an autonomous think tank that transforms the chaos of information into scenario-weighted, source-verified positions — not opinions.";

export const BRAND_OG_DESCRIPTION = `${BRAND_TAGLINE} Cross-domain scenario reasoning with verified positions.`;

export const BRAND_MANIFEST_DESCRIPTION = `${BRAND_TAGLINE} Cross-domain scenario reasoning with verified positions.`;

export const BRAND_HERO_TITLE = BRAND_TAGLINE;

export const BRAND_HERO_SUBTITLE = "The world doesn't suffer from a lack of information. It suffers from a lack of verifiable order.";

export const BRAND_HERO_DETAIL =
  "250M+ sources · multi-scenario reasoning · verified positions";

export const BRAND_MANIFESTO =
  "The world doesn't suffer from a lack of information. It suffers from a lack of structure.\n\nKnowledge without order creates noise. Order without verification creates opinion. Verification without scenarios creates hindsight. We bind all three.\n\nThat is NomosX.";

export const BRAND_MISSION =
  "Strategic decisions are still made on single forecasts, opaque sources, and borrowed convictions. We built an institute that does better: map the evidence across every relevant domain, force the strongest counter-argument before any position stands, stress-test it against multiple futures, and publish the result — traceable, defensible, agenda-free.";

export const NOMOS_PHILOSOPHY_PILLARS = [
  "Transform chaos into order",
  "Meaning before answers",
  "Map knowledge, do not accumulate it",
  "Connect ideas across domains",
  "Scenarios, not single forecasts",
  "Combat novlangue, guard the truth",
] as const;

export const NOMOS_PHILOSOPHY_STATEMENT =
  "The Nomos is not merely the law. It is the order that gives meaning to the world — tracing boundaries, organizing chaos, and allowing humans to inhabit a territory, physical, intellectual, or digital.";

export const BRAND_SOURCES_LABEL = "250M+";

export const BRAND_SOURCES_LINE = `${BRAND_SOURCES_LABEL} sources`;

export const BRAND_EMAIL_TAGLINE = "From Chaos to Nomos";

export const BRAND_EMAIL_FOOTER = `${BRAND_NAME} · ${BRAND_EMAIL_TAGLINE}`;

export const BRAND_BRIEF_FOOTER = `${BRAND_NAME} — ${BRAND_TAGLINE}`;

export const METHOD_STEPS = ["Map", "Confront", "Quantify", "Decide"] as const;

export const METHOD_STEPS_INLINE = METHOD_STEPS.join(" · ");

export const METHOD_BLOCKS = [
  {
    name: METHOD_STEPS[0],
    desc: `We pull from ${BRAND_SOURCES_LABEL} sources across every relevant domain — academic research, institutional positions, primary data. We don't accumulate sources — we map the intellectual territory, showing where evidence is dense, where it's absent, and where it contradicts itself.`,
  },
  {
    name: METHOD_STEPS[1],
    desc: "Every claim is challenged. Every assumption attacked. We force the strongest counter-argument before we let any position stand. The friction is the point — it's where certainty goes to get tested.",
  },
  {
    name: METHOD_STEPS[2],
    desc: "Not one forecast. Multiple futures, each with a probability. Because the world doesn't move in straight lines — and decisions shouldn't either. We structure the uncertainty, not just the answer.",
  },
  {
    name: METHOD_STEPS[3],
    desc: "A clear position, with the confidence to back it. Sources visible. Doubts logged. Scenarios stress-tested. The map, not just the terrain — everything you need to brief a room or sign a decision.",
  },
] as const;

export const ABOUT_CTA_HEADLINE = "The briefing room,";
export const ABOUT_CTA_HEADLINE_ACCENT = "open to everyone.";

export const METHODOLOGY_INTRO =
  "Four stages. No shortcuts. Chaos in, nomos out — a position worth defending, with the receipts.";
