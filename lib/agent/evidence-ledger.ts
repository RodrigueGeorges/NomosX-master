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
  "evidence",
  "impact",
  "risk",
  "policy",
  "study",
  "research",
  "according",
  "montre",
  "suggere",
  "indique",
  "augmente",
  "reduit",
  "preuve",
  "risque",
  "etude",
  "recherche",
];

export function stripHtmlForEvidence(html: string): string {
  return html
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
  const matches = text.matchAll(/\[SRC-(\d+)\]/g);
  return Array.from(new Set(Array.from(matches, (match) => Number(match[1]))))
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((a, b) => a - b);
}

function looksLikeClaim(sentence: string): boolean {
  const normalized = sentence.toLowerCase();
  if (sentence.length < 45) return false;
  if (/\[SRC-\d+\]/.test(sentence)) return true;
  return CLAIM_HINTS.some((hint) => normalized.includes(hint));
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
