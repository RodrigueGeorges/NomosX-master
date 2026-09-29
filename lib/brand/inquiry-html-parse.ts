/**
 * Parse Editorial V2 (position-first) brief HTML for structured inquiry UI.
 *
 * Sections are matched on their stable `nx-block <name>` class — NOT on the
 * localized eyebrow labels, which vary per persona and locale (7 variants).
 */

import { isPositionFirstBrief } from "@/lib/agent/brief-html-extract";

function stripHtml(html: string): string {
  return html
    // Remove citation superscripts entirely (<sup class="cite"><a href="#ref-N">N</a></sup>)
    // — stripping tags alone leaves orphan "N" numbers in the text
    .replace(/<sup[^>]*>[\s\S]*?<\/sup>/gi, "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\[SRC-\d+\]/g, "")
    .replace(/&#0?39;/gi, "'")
    .replace(/&#x?27;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&nbsp;/gi, " ")
    // Decode &amp; LAST to avoid double-decoding (&amp;lt; should stay as &lt;, not become <)
    .replace(/&amp;/gi, "&")
    .replace(/\[LIVE-DATA\]/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

export interface EditorialTeamMember {
  role: string;
  domain: string;
  mandate: string;
  frictionWith?: string;
}

export interface EditorialScenario {
  name: string;
  probability: string;
  description: string;
  isBase: boolean;
}

export interface ParsedEditorialInquiry {
  /** Editorial dek — the nx-lede paragraph (or through-line fallback). */
  lede: string;
  collision: string;
  detectedReason: string;
  urgency: string;
  productiveFriction: string;
  team: EditorialTeamMember[];
  scenarios: EditorialScenario[];
  centralScenario?: {
    name: string;
    description: string;
    rationale: string;
    rationaleHtml: string;
    horizon: string;
    confidence: string;
    implications: string[];
    revisionTriggers: string[];
  };
  verdictHtml: string;
  confidence: string;
  objections: string[];
  whatChangesMind: string[];
  evidenceTraceHtml: string;
  sourcesHtml: string;
  // Extended Editorial V2 sections
  causalChainHtml: string;
  trajectoryHtml: string;
  rejectedAltsHtml: string;
  signalsHtml: string;
  evidenceAssessmentHtml: string;
  keyFindingsHtml: string;
  recommendationsHtml: string;
  anchoringBasisHtml: string;
  heroImageUrl: string;
}

function matchInner(html: string, pattern: RegExp): string {
  const m = html.match(pattern);
  return m?.[1]?.trim() ?? "";
}

/**
 * Extract the inner HTML of `<section class="nx-block <cls>">...</section>`.
 * Non-greedy match stops at the first closing </section> — nx-block sections
 * are siblings inside nx-act wrappers and never nested inside each other.
 */
function extractBlock(raw: string, cls: string): string {
  return matchInner(
    raw,
    new RegExp(`<section class="nx-block ${cls}"[^>]*>([\\s\\S]*?)</section>`, "i")
  );
}

/** Remove the leading eyebrow label (localized — must not be shown verbatim). */
function stripEyebrow(html: string): string {
  return html.replace(/^\s*<p class="nx-eyebrow"[^>]*>[\s\S]*?<\/p>\s*/i, "").trim();
}

function parseListItems(fragment: string): string[] {
  return [...fragment.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)]
    .map((m) => stripHtml(m[1]))
    .filter(Boolean);
}

/** Extract text of each top-level <p> (excluding the eyebrow) as list items. */
function parseParagraphItems(sectionHtml: string): string[] {
  const body = stripEyebrow(sectionHtml);
  return [...body.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((m) => stripHtml(m[1]))
    .filter(Boolean);
}

/** Extract structured editorial blocks from position-first HTML. */
export function parseEditorialInquiry(html: string): ParsedEditorialInquiry | null {
  const raw = (html || "").replace(/^```html?\s*/i, "").replace(/\s*```\s*$/, "").trim();
  if (!raw || !isPositionFirstBrief(raw)) return null;

  // ── Lede / dek (p.nx-lede, fallback p.through-line) ────────────────────
  const lede = stripHtml(
    matchInner(raw, /<p class="nx-lede"[^>]*>([\s\S]*?)<\/p>/i)
    || matchInner(raw, /<p class="through-line"[^>]*>([\s\S]*?)<\/p>/i)
  );

  // ── Detected subject (nx-block detected-subject-block) ─────────────────
  const detectedBlock = extractBlock(raw, "detected-subject-block");
  const collisionLines = [
    ...detectedBlock.matchAll(/<p class="(?:detected-subject|collision-line)"[^>]*>([\s\S]*?)<\/p>/gi),
  ].map((m) => stripHtml(m[1]));
  // Fallback for older renders that used collision-line outside the block
  if (collisionLines.length === 0) {
    collisionLines.push(
      ...[...raw.matchAll(/<p class="collision-line"[^>]*>([\s\S]*?)<\/p>/gi)].map((m) =>
        stripHtml(m[1])
      )
    );
  }

  // ── Dedicated team (nx-block dedicated-team-block → .team-card) ────────
  const teamBlock = extractBlock(raw, "dedicated-team-block") ||
    // legacy renders used a bare "Dedicated team" label outside the block
    matchInner(raw, /Dedicated team<\/p>([\s\S]*?)<\/section>/i);

  // .team-card divs contain nested <div> (role/domain/mandate) — a naive
  // [\s\S]*?</div> stops at the first inner </div>. Use a lookahead: each
  // card ends at the next sibling .team-card or the closing .dedicated-team.
  const teamSource = [...teamBlock.matchAll(
    /<div class="team-card">([\s\S]*?)(?=<div class="team-card">|<\/div>\s*<\/div>\s*$|<\/section>)/gi
  )].map((m) => m[1]);

  const teamParsed = teamSource.map((block) => {
    const role = stripHtml(matchInner(block, /<div class="team-role"[^>]*>([\s\S]*?)<\/div>/i)).replace(
      /\s*lens$/i,
      ""
    );
    const domain = stripHtml(matchInner(block, /<div class="team-domain"[^>]*>([\s\S]*?)<\/div>/i));
    const mandateRaw = matchInner(block, /<div class="team-mandate"[^>]*>([\s\S]*?)<\/div>/i);
    const friction = mandateRaw.match(/↔\s*([^<]+)/)?.[1]?.trim();
    const mandate = stripHtml(mandateRaw.split("↔")[0] ?? mandateRaw);
    return { role, domain, mandate, frictionWith: friction };
  }).filter((t) => t.role || t.mandate);

  // Friction paragraph = any plain <p> between eyebrow and .dedicated-team
  const frictionParagraph = matchInner(
    stripEyebrow(teamBlock),
    /^\s*<p[^>]*>([\s\S]*?)<\/p>\s*<div class="dedicated-team"/i
  );

  // ── Scenarios (.scenario-row — class stable across personas) ───────────
  const scenarios = [...raw.matchAll(/<div\b[^>]*class="[^"]*\bscenario-row\b[^"]*"[^>]*>([\s\S]*?)(?=<div\b[^>]*class="[^"]*\bscenario-row\b|<\/section>)/gi)]
    .map((m) => {
      const block = m[1];
      const nameRaw = stripHtml(matchInner(block, /<span class="scenario-name"[^>]*>([\s\S]*?)<\/span>/i));
      const isBase = /·\s*(base|central)\b/i.test(nameRaw);
      const name = nameRaw.replace(/\s*·\s*(?:base|central|wildcard)\b/gi, "").trim();
      const probability = stripHtml(matchInner(block, /<span class="scenario-prob"[^>]*>([\s\S]*?)<\/span>/i));
      const description = stripHtml(matchInner(block, /<div class="scenario-narrative"[^>]*>([\s\S]*?)<\/div>/i)
        || matchInner(block, /<div class="scenario-desc"[^>]*>([\s\S]*?)<\/div>/i));
      return { name, probability, description, isBase };
    })
    .filter((s) => s.name);

  // ── Verdict (nx-block verdict → .verdict-block) ────────────────────────
  const verdictHtml = matchInner(
    extractBlock(raw, "verdict"),
    /<div class="verdict-block"[^>]*>([\s\S]*?)<\/div>/i
  );

  // ── Anchoring basis (nx-block anchoring → .verdict-block) ──────────────
  const anchoringBasisHtml = matchInner(
    extractBlock(raw, "anchoring"),
    /<div class="verdict-block"[^>]*>([\s\S]*?)<\/div>/i
  );

  // ── Content sections (strip the localized eyebrow, keep the body) ──────
  const causalChainHtml = stripEyebrow(extractBlock(raw, "causal-chain"));
  const trajectoryHtml = stripEyebrow(extractBlock(raw, "trajectory"));
  const rejectedAltsHtml = stripEyebrow(extractBlock(raw, "rejected-alternatives"));
  const evidenceAssessmentHtml = stripEyebrow(extractBlock(raw, "evidence-assessment"));
  const recommendationsHtml = stripEyebrow(extractBlock(raw, "recommendations"));
  const evidenceTraceHtml = stripEyebrow(extractBlock(raw, "trace"));

  // ── Signals to watch (nx-block what-to-watch) ──────────────────────────
  // Contains .scenario-signals tags + .change-mind + .horizon paragraphs.
  const watchBlock = stripEyebrow(extractBlock(raw, "what-to-watch"));
  const changeMindRaw = matchInner(watchBlock, /<p class="change-mind"[^>]*>([\s\S]*?)<\/p>\s*<p class="horizon"/i)
    || matchInner(watchBlock, /<p class="change-mind"[^>]*>([\s\S]*?)$/i);
  // signalsHtml = block minus the change-mind paragraph (shown separately)
  const signalsHtml = watchBlock
    .replace(/<p class="change-mind"[^>]*>[\s\S]*?<\/p>/i, "")
    .trim();
  // change-mind text without the "What would change our mind:" label span
  const changeMindText = stripHtml(
    changeMindRaw.replace(/<span class="chain-label">[\s\S]*?<\/span>/i, "")
  );

  // ── Objections (nx-block objections — paragraphs, not <ul>) ────────────
  const objections = parseParagraphItems(extractBlock(raw, "objections"));

  // ── In brief / key findings (nx-block in-brief → .in-brief-list) ───────
  const keyFindingsHtml = matchInner(
    extractBlock(raw, "in-brief"),
    /<ul class="in-brief-list"[^>]*>([\s\S]*?)<\/ul>/i
  );

  // ── Confidence / urgency (kept for legacy renders) ─────────────────────
  const confidence = stripHtml(matchInner(raw, /<p class="confidence"[^>]*>([\s\S]*?)<\/p>/i));
  const urgency = stripHtml(matchInner(raw, /<span class="urgency"[^>]*>([\s\S]*?)<\/span>/i));

  const sourcesHtml = matchInner(raw, /<section class="references-section">([\s\S]*?)<\/section>/i);

  // Extract hero image (data URI or URL) from the hero-image div
  const heroImgMatch = raw.match(/<div class="hero-image"[^>]*>[\s\S]*?<img[^>]*src=["']([^"']+)["']/i);
  const heroImageUrl = heroImgMatch?.[1] ?? "";

  const centralBlock = extractBlock(raw, "central-scenario");
  const centralField = (tag: string, cls: string) => matchInner(centralBlock, new RegExp(`<${tag}\\b[^>]*class="${cls}"[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  const centralScenario = centralBlock ? {
    name: stripHtml(centralField('h3', 'central-name')),
    description: stripHtml(centralField('div', 'central-description')),
    rationale: stripHtml(centralField('div', 'central-rationale')),
    rationaleHtml: centralField('div', 'central-rationale'),
    horizon: stripHtml(centralField('span', 'central-horizon')),
    confidence: stripHtml(centralField('span', 'central-confidence')),
    implications: parseListItems(centralField('ul', 'central-implications')),
    revisionTriggers: parseListItems(centralField('ul', 'central-revision')),
  } : undefined;

  return {
    centralScenario,
    lede,
    collision: collisionLines[0] ?? "",
    detectedReason: collisionLines[1] ?? collisionLines[0] ?? "",
    urgency,
    productiveFriction: stripHtml(frictionParagraph),
    team: teamParsed,
    scenarios,
    verdictHtml,
    confidence,
    objections,
    whatChangesMind: changeMindText ? [changeMindText] : [],
    evidenceTraceHtml,
    sourcesHtml,
    causalChainHtml,
    trajectoryHtml,
    rejectedAltsHtml,
    signalsHtml,
    evidenceAssessmentHtml,
    keyFindingsHtml,
    recommendationsHtml,
    anchoringBasisHtml,
    heroImageUrl,
  };
}

/** Body HTML for legacy briefs (strip full document wrapper if present). */
export function extractLegacyArticleBody(html: string): string {
  const raw = (html || "").replace(/^```html?\s*/i, "").replace(/\s*```\s*$/, "").trim();
  const article = raw.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
  if (article) return article[1];
  const body = raw.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (body) return body[1];
  return raw;
}
