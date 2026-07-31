/**
 * Novlangue Detector — Deterministic euphemism & semantic drift scanner.
 *
 * Pillar 6 made real: "Combat novlangue, guard the truth."
 * This module scans publication HTML for known euphemisms, bureaucratic
 * jargon, and semantic drift patterns. It is DETERMINISTIC (code, not LLM)
 * per the NomosX invariant: "Les garde-fous sur les chiffres sont
 * déterministes (code), jamais confiés à un LLM."
 *
 * The detector does NOT block publication (that would be censorship of its
 * own kind). It flags violations as warnings so the editorial team can
 * review and the critical loop can rewrite.
 */

export interface NovlangueMatch {
  /** The euphemism or jargon term found in the text. */
  term: string;
  /** What the term likely masks — the true name. */
  trueName: string;
  /** Category of the violation. */
  category: "euphemism" | "bureaucratic" | "semantic_drift" | "passive_obfuscation";
  /** Character offset in the stripped text. */
  offset: number;
  /** Surrounding context (±40 chars). */
  context: string;
}

export interface NovlangueDetectionResult {
  matches: NovlangueMatch[];
  count: number;
  /** Density: matches per 1000 words. */
  density: number;
  /** True if no novlangue detected — the publication is clean. */
  clean: boolean;
}

/**
 * Curated euphemism → true-name mapping.
 * Each entry is a deformation of language that masks violence, accountability,
 * or meaning. The list is intentionally political — novlangue is political.
 */
const EUPHEMISMS: Array<{ term: string; trueName: string; category: NovlangueMatch["category"] }> = [
  // Violence masked as policy
  { term: "collateral damage", trueName: "civilian deaths", category: "euphemism" },
  { term: "enhanced interrogation", trueName: "torture", category: "euphemism" },
  { term: "targeted killing", trueName: "assassination", category: "euphemism" },
  { term: "precision strike", trueName: "bombing", category: "euphemism" },
  { term: "surgical intervention", trueName: "military invasion", category: "euphemism" },
  { term: "peacekeeping operation", trueName: "military deployment", category: "euphemism" },
  { term: "neutralize", trueName: "kill", category: "euphemism" },

  // Economic violence masked as optimization
  { term: "optimization", trueName: "layoffs / cost-cutting", category: "euphemism" },
  { term: "rationalization", trueName: "layoffs / restructuring", category: "euphemism" },
  { term: "downsizing", trueName: "mass layoffs", category: "euphemism" },
  { term: "right-sizing", trueName: "layoffs", category: "euphemism" },
  { term: "restructuring", trueName: "layoffs / reorganization", category: "euphemism" },
  { term: "streamlining", trueName: "layoffs / cost-cutting", category: "euphemism" },
  { term: "austerity measure", trueName: "budget cuts targeting public services", category: "euphemism" },
  { term: "fiscal consolidation", trueName: "spending cuts", category: "euphemism" },
  { term: "labor flexibility", trueName: "precarious employment", category: "euphemism" },
  { term: "human capital", trueName: "workers / employees", category: "euphemism" },

  // Censorship masked as responsibility
  { term: "responsible moderation", trueName: "censorship / content removal", category: "euphemism" },
  { term: "content moderation", trueName: "censorship / content removal", category: "euphemism" },
  { term: "trust and safety", trueName: "censorship / surveillance", category: "euphemism" },
  { term: "misinformation policy", trueName: "censorship / narrative control", category: "euphemism" },
  { term: "deplatforming", trueName: "banning / silencing", category: "euphemism" },
  { term: "sensitivity reading", trueName: "censorship / ideological editing", category: "euphemism" },

  // Surveillance masked as security
  { term: "national security", trueName: "state secrecy / surveillance", category: "euphemism" },
  { term: "metadata collection", trueName: "mass surveillance", category: "euphemism" },
  { term: "bulk data acquisition", trueName: "mass surveillance", category: "euphemism" },
  { term: "smart surveillance", trueName: "automated surveillance", category: "euphemism" },

  // Power masked as reform
  { term: "reform", trueName: "policy change (often deregulation)", category: "semantic_drift" },
  { term: "modernization", trueName: "policy change / deregulation", category: "semantic_drift" },
  { term: "innovation", trueName: "change (value-neutral)", category: "semantic_drift" },
  { term: "disruption", trueName: "market change / displacement", category: "semantic_drift" },
];

/**
 * Bureaucratic jargon patterns — phrases that obscure accountability
 * behind passive voice or institutional abstraction.
 */
const BUREAUCRATIC_PATTERNS: Array<{ regex: RegExp; trueName: string }> = [
  { regex: /\bmistakes were made\b/i, trueName: "we made mistakes (passive voice hides accountability)" },
  { regex: /\bit has been decided\b/i, trueName: "we decided (passive voice hides who decided)" },
  { regex: /\bconcerns have been raised\b/i, trueName: "someone raised concerns (passive voice hides who)" },
  { regex: /\baction will be taken\b/i, trueName: "we will act (passive voice hides who acts)" },
  { regex: /\bmeasures are being considered\b/i, trueName: "we are considering measures (passive voice)" },
  { regex: /\bthe situation is being monitored\b/i, trueName: "we are watching (passive voice implies inaction)" },
  { regex: /\bappropriate steps will be taken\b/i, trueName: "we will do something (vague, no accountability)" },
  { regex: /\bstakeholder engagement\b/i, trueName: "lobbying / consultation (vague)" },
  { regex: /\bsynergy\b/i, trueName: "cost-cutting / merger (meaningless corporate jargon)" },
  { regex: /\bbest practices\b/i, trueName: "conformity to convention (often unexamined)" },
  { regex: /\bvalue proposition\b/i, trueName: "sales pitch (corporate jargon)" },
  { regex: /\bparadigm shift\b/i, trueName: "change (inflated jargon)" },
  { regex: /\bthought leadership\b/i, trueName: "self-promotion (meaningless)" },
];

/**
 * Detect novlangue patterns in publication HTML.
 * Strips HTML tags, then scans the text content.
 */
export function detectNovlangue(html: string): NovlangueDetectionResult {
  const text = html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&[a-z]+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const wordCount = text ? text.split(" ").filter(Boolean).length : 0;
  const matches: NovlangueMatch[] = [];

  // Scan for euphemisms (word-boundary matched, case-insensitive)
  for (const { term, trueName, category } of EUPHEMISMS) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`\\b${escaped}\\b`, "gi");
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      matches.push({
        term: match[0],
        trueName,
        category,
        offset: match.index,
        context: text.slice(Math.max(0, match.index - 40), match.index + match[0].length + 40),
      });
    }
  }

  // Scan for bureaucratic patterns
  for (const { regex, trueName } of BUREAUCRATIC_PATTERNS) {
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      // Avoid duplicate matches at same offset
      if (matches.some((m) => m.offset === match!.index)) continue;
      matches.push({
        term: match[0],
        trueName,
        category: "bureaucratic",
        offset: match.index,
        context: text.slice(Math.max(0, match.index - 40), match.index + match[0].length + 40),
      });
    }
  }

  // Sort by offset for readable output
  matches.sort((a, b) => a.offset - b.offset);

  const density = wordCount > 0 ? (matches.length / wordCount) * 1000 : 0;

  return {
    matches,
    count: matches.length,
    density,
    clean: matches.length === 0,
  };
}
