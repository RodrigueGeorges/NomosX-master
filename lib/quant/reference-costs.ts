/**
 * QUANT BRIDGE — Reference cost database
 *
 * Curated unit costs from official/public statistical sources.
 * Every entry carries its source and reference year so that any
 * estimate built on it is fully traceable and defensible.
 *
 * Extend this table as engagements require — keep entries sourced.
 * NEVER add an entry without a verifiable public source.
 */

export interface ReferenceCost {
  id: string;
  label: string;
  unitCost: number;
  unit: string;
  currency: "EUR" | "USD";
  /** default relative uncertainty (±) */
  uncertainty: number;
  source: string;
  referenceYear: number;
}

export const REFERENCE_COSTS: ReferenceCost[] = [
  // ── Labour (EU) ──
  {
    id: "eu-labour-hour-avg",
    label: "Average hourly labour cost, EU27 (whole economy)",
    unitCost: 33.5, unit: "hour", currency: "EUR", uncertainty: 0.10,
    source: "Eurostat lc_lci_lev (2024)", referenceYear: 2024,
  },
  {
    id: "fr-labour-hour-avg",
    label: "Average hourly labour cost, France (whole economy)",
    unitCost: 43.4, unit: "hour", currency: "EUR", uncertainty: 0.10,
    source: "Eurostat lc_lci_lev (2024)", referenceYear: 2024,
  },
  {
    id: "eu-engineer-day",
    label: "Senior engineer/consultant day rate, EU (loaded)",
    unitCost: 850, unit: "person-day", currency: "EUR", uncertainty: 0.30,
    source: "Derived from Eurostat lc_lci_lev ICT sector × 1.9 overhead factor", referenceYear: 2024,
  },
  {
    id: "eu-researcher-year",
    label: "Full-time researcher, EU (loaded annual cost)",
    unitCost: 95_000, unit: "person-year", currency: "EUR", uncertainty: 0.25,
    source: "EC Horizon Europe unit costs for personnel (2024)", referenceYear: 2024,
  },
  // ── Energy / climate ──
  {
    id: "eu-electricity-mwh-industry",
    label: "Industrial electricity price, EU27 average",
    unitCost: 165, unit: "MWh", currency: "EUR", uncertainty: 0.25,
    source: "Eurostat nrg_pc_205 (S2 2024, band IC)", referenceYear: 2024,
  },
  {
    id: "eu-carbon-ets-tonne",
    label: "EU ETS carbon allowance price",
    unitCost: 70, unit: "tCO2e", currency: "EUR", uncertainty: 0.35,
    source: "EEX EUA spot, 2024 annual average", referenceYear: 2024,
  },
  {
    id: "solar-utility-kw",
    label: "Utility-scale solar PV capex",
    unitCost: 750, unit: "kW installed", currency: "EUR", uncertainty: 0.20,
    source: "IEA World Energy Investment 2024, Europe", referenceYear: 2024,
  },
  {
    id: "onshore-wind-kw",
    label: "Onshore wind capex",
    unitCost: 1_300, unit: "kW installed", currency: "EUR", uncertainty: 0.20,
    source: "IEA World Energy Investment 2024, Europe", referenceYear: 2024,
  },
  // ── Digital / IT ──
  {
    id: "cloud-vcpu-year",
    label: "Cloud compute, reserved vCPU-year (EU region)",
    unitCost: 280, unit: "vCPU-year", currency: "EUR", uncertainty: 0.30,
    source: "Public list prices, major EU cloud regions (2024 average)", referenceYear: 2024,
  },
  {
    id: "llm-1m-tokens-frontier",
    label: "Frontier LLM inference, blended input/output",
    unitCost: 8, unit: "1M tokens", currency: "USD", uncertainty: 0.40,
    source: "Public API list prices, frontier models (2025 average)", referenceYear: 2025,
  },
  // ── Public policy / studies ──
  {
    id: "eu-impact-assessment",
    label: "EU-level policy impact assessment study (full)",
    unitCost: 350_000, unit: "study", currency: "EUR", uncertainty: 0.40,
    source: "EC framework contract award values, TED database (2022-2024 median)", referenceYear: 2024,
  },
  {
    id: "eu-evaluation-study",
    label: "EU programme evaluation study",
    unitCost: 200_000, unit: "study", currency: "EUR", uncertainty: 0.40,
    source: "EC framework contract award values, TED database (2022-2024 median)", referenceYear: 2024,
  },
];

export const REFERENCE_COST_BY_ID: Record<string, ReferenceCost> = Object.fromEntries(
  REFERENCE_COSTS.map((c) => [c.id, c])
);

/**
 * Staleness check — returns entries whose referenceYear is older than
 * `maxAgeYears` (default 2) relative to the current year.
 * Call this at startup or periodically to flag costs that need updating.
 */
export function staleReferenceCosts(maxAgeYears = 2, now = new Date()): ReferenceCost[] {
  const currentYear = now.getFullYear();
  return REFERENCE_COSTS.filter((c) => currentYear - c.referenceYear > maxAgeYears);
}

/**
 * Audit log — returns a summary of all reference costs with their age.
 * Useful for the Excel export's methodology sheet or for a maintenance report.
 */
export function referenceCostAudit(now = new Date()): Array<{ id: string; label: string; ageYears: number; stale: boolean }> {
  const currentYear = now.getFullYear();
  return REFERENCE_COSTS.map((c) => ({
    id: c.id,
    label: c.label,
    ageYears: currentYear - c.referenceYear,
    stale: currentYear - c.referenceYear > 2,
  }));
}
