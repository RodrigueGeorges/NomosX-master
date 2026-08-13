export type EvidenceSupportStatus =
  | "verified"
  | "partially_verified"
  | "unsupported"
  | "unverified";

export interface EvidenceLedgerClaim {
  id: string;
  text: string;
  citations: number[];
  supportStatus: EvidenceSupportStatus;
}

export interface EvidenceLedger {
  claimCount: number;
  citedClaimCount: number;
  uncitedClaimCount: number;
  citationCount: number;
  uniqueCitationCount: number;
  claims: EvidenceLedgerClaim[];
}

const CLAIM_HINTS = [
  "shows",
  "suggests",
  "finds",
  "indicates",
  "increases",
  "reduces",
  "causes",
  "correlates",
  "demonstrates",
  "reveals",
  "confirms",
  "decreases",
  "improves",
  "worsens",
  "montre",
  "suggere",
  "indique",
  "augmente",
  "reduit",
  "demontre",
  "prouve",
];

const WEAK_HINTS = [
  "evidence",
  "impact",
  "risk",
  "policy",
  "study",
  "research",
  "according",
  "preuve",
  "risque",
  "etude",
  "recherche",
];

export function stripHtmlForEvidence(html: string): string {
  return html
    .replace(/<sup class="cite"><a href="#ref-(\d+)"[^>]*>\s*(\d+)\s*<\/a><\/sup>/gi, "[SRC-$1]")
    .replace(/<sup class="cite"><a href="#ref-(\d+)"[^>]*>([\s\S]*?)<\/a><\/sup>/gi, "[SRC-$1]")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<\/(p|li|h[1-6]|blockquote|section|article|div)>/gi, ". ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractCitationNumbers(text: string): number[] {
  const normalized = text
    .replace(/<sup class="cite"><a href="#ref-(\d+)"[^>]*>\s*(\d+)\s*<\/a><\/sup>/gi, "[SRC-$1]")
    .replace(/<sup class="cite"><a href="#ref-(\d+)"[^>]*>([\s\S]*?)<\/a><\/sup>/gi, "[SRC-$1]");
  const matches = normalized.matchAll(/\[SRC-(\d+)\]/g);
  return Array.from(new Set(Array.from(matches, (match) => Number(match[1]))))
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((a, b) => a - b);
}

function looksLikeClaim(sentence: string): boolean {
  const normalized = sentence.toLowerCase();
  if (sentence.length < 45) return false;
  // Cited sentences are always claims
  if (/\[SRC-\d+\]/.test(sentence)) return true;
  // Uncited sentences need a strong causal/empirical verb
  if (CLAIM_HINTS.some((hint) => normalized.includes(hint))) return true;
  // Weak hints alone (policy, risk, study...) are editorial prose, not claims
  return false;
}

export function buildEvidenceLedger(html: string): EvidenceLedger {
  const text = stripHtmlForEvidence(html);
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .filter(looksLikeClaim);

  const claims = sentences.slice(0, 250).map((sentence, index) => {
    const citations = extractCitationNumbers(sentence);
    return {
      id: `claim-${index + 1}`,
      text: sentence,
      citations,
      supportStatus: citations.length > 0 ? "unverified" : "unsupported",
    } satisfies EvidenceLedgerClaim;
  });

  const citedClaimCount = claims.filter((claim) => claim.citations.length > 0).length;
  const allCitations = claims.flatMap((claim) => claim.citations);

  return {
    claimCount: claims.length,
    citedClaimCount,
    uncitedClaimCount: claims.length - citedClaimCount,
    citationCount: allCitations.length,
    uniqueCitationCount: new Set(allCitations).size,
    claims,
  };
}
