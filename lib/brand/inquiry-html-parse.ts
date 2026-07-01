/**
 * Parse Editorial V2 (position-first) brief HTML for structured inquiry UI.
 */

import { isPositionFirstBrief } from "@/lib/agent/brief-html-extract";

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/\[SRC-\d+\]/g, "")
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
  collision: string;
  detectedReason: string;
  urgency: string;
  productiveFriction: string;
  team: EditorialTeamMember[];
  scenarios: EditorialScenario[];
  verdictHtml: string;
  confidence: string;
  objections: string[];
  whatChangesMind: string[];
  evidenceTraceHtml: string;
  sourcesHtml: string;
}

function matchInner(html: string, pattern: RegExp): string {
  const m = html.match(pattern);
  return m?.[1]?.trim() ?? "";
}

function parseListItems(fragment: string): string[] {
  return [...fragment.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)]
    .map((m) => stripHtml(m[1]))
    .filter(Boolean);
}

/** Extract structured editorial blocks from position-first HTML. */
export function parseEditorialInquiry(html: string): ParsedEditorialInquiry | null {
  const raw = (html || "").replace(/^```html?\s*/i, "").replace(/\s*```\s*$/, "").trim();
  if (!raw || !isPositionFirstBrief(raw)) return null;

  const collisionLines = [...raw.matchAll(/<p class="collision-line"[^>]*>([\s\S]*?)<\/p>/gi)].map((m) =>
    stripHtml(m[1])
  );

  const team = [...raw.matchAll(/<div class="team-card">([\s\S]*?)<\/div>/gi)].map((m) => {
    const block = m[1];
    const role = stripHtml(matchInner(block, /<div class="team-role"[^>]*>([\s\S]*?)<\/div>/i)).replace(
      /\s*lens$/i,
      ""
    );
    const domain = stripHtml(matchInner(block, /<div class="team-domain"[^>]*>([\s\S]*?)<\/div>/i));
    const mandateRaw = matchInner(block, /<div class="team-mandate"[^>]*>([\s\S]*?)<\/div>/i);
    const friction = mandateRaw.match(/↔\s*([^<]+)/)?.[1]?.trim();
    const mandate = stripHtml(mandateRaw.split("↔")[0] ?? mandateRaw);
    return { role, domain, mandate, frictionWith: friction };
  });

  const scenarios = [...raw.matchAll(/<div class="scenario-row">([\s\S]*?)<\/div>/gi)].map((m) => {
    const block = m[1];
    const nameRaw = stripHtml(matchInner(block, /<span class="scenario-name"[^>]*>([\s\S]*?)<\/span>/i));
    const isBase = nameRaw.includes("· base");
    const name = nameRaw.replace(/\s*·\s*base$/i, "").trim();
    const probability = stripHtml(matchInner(block, /<span class="scenario-prob"[^>]*>([\s\S]*?)<\/span>/i));
    const description = stripHtml(matchInner(block, /<div class="scenario-desc"[^>]*>([\s\S]*?)<\/div>/i));
    return { name, probability, description, isBase };
  });

  const verdictHtml = matchInner(
    raw,
    /Institute position<\/p>\s*<div class="verdict-block">\s*([\s\S]*?)<\/div>/i
  );

  const confidence = stripHtml(matchInner(raw, /<p class="confidence"[^>]*>([\s\S]*?)<\/p>/i));

  const objectionsBlock = matchInner(
    raw,
    /Strongest objections<\/p>\s*<ul>([\s\S]*?)<\/ul>/i
  );
  const changeMindBlock = matchInner(
    raw,
    /What would change our mind<\/p>\s*<ul>([\s\S]*?)<\/ul>/i
  );

  const evidenceTraceHtml = matchInner(
    raw,
    /Evidence trace<\/p>\s*([\s\S]*?)<\/section>/i
  ).replace(/<section[\s\S]*$/, "");

  const sourcesHtml = matchInner(raw, /<section class="references-section">([\s\S]*?)<\/section>/i);

  const frictionParagraph = matchInner(
    raw,
    /Dedicated team<\/p>\s*<p[^>]*>([\s\S]*?)<\/p>/i
  );

  return {
    collision: collisionLines[0] ?? "",
    detectedReason: collisionLines[1] ?? collisionLines[0] ?? "",
    urgency: stripHtml(matchInner(raw, /<span class="urgency"[^>]*>([\s\S]*?)<\/span>/i)),
    productiveFriction: stripHtml(frictionParagraph),
    team,
    scenarios,
    verdictHtml,
    confidence,
    objections: parseListItems(objectionsBlock),
    whatChangesMind: parseListItems(changeMindBlock),
    evidenceTraceHtml,
    sourcesHtml,
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
