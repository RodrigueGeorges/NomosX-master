/**
 * Nomos Engine pricing — pay-per-study, aligned with the 4 canonical formats.
 *
 * Positioning: premium but accessible. Benchmark against ResearchOS ($1,649),
 * Revv Research ($295), StratBear ($699 white-label).
 */
export const STUDIOX_PRICES: Record<string, { amountCents: number; display: string }> = {
  SUMMARY_BRIEF:     { amountCents: 3900,   display: "39 €" },
  DECISION_MEMO:     { amountCents: 9900,   display: "99 €" },
  ARTICLE:           { amountCents: 19900,  display: "199 €" },
  STRATEGIC_REPORT:  { amountCents: 69900,  display: "699 €" },

  // Legacy aliases — mapped to canonical price via resolveFormatType
  RESEARCH_BRIEF:    { amountCents: 9900,   display: "99 €" },   // → Decision Memo
  EXECUTIVE_BRIEF:   { amountCents: 9900,   display: "99 €" },   // → Decision Memo
  POLICY_NOTE:       { amountCents: 9900,   display: "99 €" },   // → Decision Memo
  UPDATE_NOTE:       { amountCents: 3900,   display: "39 €" },   // → Signal Brief
  DATA_NOTE:         { amountCents: 3900,   display: "39 €" },   // → Signal Brief
  DOSSIER:           { amountCents: 69900,  display: "699 €" },  // → Strategic Report
};

import { resolveFormatType } from "@/lib/publication-formats";

export function getStudioXPrice(formatType?: string | null) {
  const resolved = resolveFormatType(formatType);
  return STUDIOX_PRICES[resolved] ?? STUDIOX_PRICES.ARTICLE;
}
