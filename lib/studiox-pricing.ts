export const STUDIOX_PRICES: Record<string, { amountCents: number; display: string }> = {
  SUMMARY_BRIEF:    { amountCents: 900,   display: "9 €" },
  UPDATE_NOTE:      { amountCents: 900,   display: "9 €" },
  DATA_NOTE:        { amountCents: 1900,  display: "19 €" },
  POLICY_NOTE:      { amountCents: 2900,  display: "29 €" },
  RESEARCH_BRIEF:   { amountCents: 4900,  display: "49 €" },
  EXECUTIVE_BRIEF:  { amountCents: 4900,  display: "49 €" },
  STRATEGIC_REPORT: { amountCents: 14900, display: "149 €" },
  DOSSIER:          { amountCents: 29900, display: "299 €" },
};

export function getStudioXPrice(formatType?: string | null) {
  return STUDIOX_PRICES[formatType ?? ""] ?? STUDIOX_PRICES.RESEARCH_BRIEF;
}
