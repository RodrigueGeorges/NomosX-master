/**
 * QUANT BRIDGE — Shared types
 *
 * The QUANT BRIDGE orchestrates deterministic quantitative models
 * (parametric costing, FIGARO input-output analysis) and produces
 * a MODEL EVIDENCE block for the STRATEGIC ANALYST, plus structured
 * tables for Excel/CSV export.
 *
 * Every number carries full lineage: model, parameters, data source.
 * Models are referenced as [MODEL-N] in reports (validated by the
 * extended citation guard).
 */

export type QuantModelKind = "parametric-cost" | "figaro-io" | "external";

export interface ModelParameter {
  name: string;
  value: number | string;
  unit?: string;
  source: string; // e.g. "Eurostat nama_10_gdp (2023)" — where the parameter comes from
}

export interface ModelResultRow {
  label: string;
  value: number;
  unit: string;
  low?: number;   // lower bound of uncertainty range
  high?: number;  // upper bound of uncertainty range
  note?: string;
}

export interface ModelResult {
  /** 1-based index used for [MODEL-N] citations */
  modelRef: number;
  kind: QuantModelKind;
  name: string;              // "Parametric cost estimate — pilot deployment"
  methodology: string;       // one-paragraph defensible description of the method
  dataSources: string[];     // e.g. ["Eurostat FIGARO 2021", "OECD unit labour costs"]
  parameters: ModelParameter[];
  rows: ModelResultRow[];
  caveats: string[];         // explicit limits of validity
  computedAt: string;        // ISO timestamp
  durationMs: number;
}

export interface QuantBridgeOutput {
  models: ModelResult[];
  /** Prompt block injected into the ANALYST context; empty string if no model ran */
  evidenceBlock: string;
  /** Providers/services actually used */
  usedModels: QuantModelKind[];
  durationMs: number;
}

// ── Parametric costing inputs ──

export interface CostLineInput {
  label: string;
  referenceCostId?: string;  // id in the reference cost database
  unitCost?: number;         // override / custom unit cost
  unit?: string;
  quantity: number;
  /** relative uncertainty, e.g. 0.25 = ±25% (defaults to reference DB value or 0.3) */
  uncertainty?: number;
}

export interface ParametricCostInput {
  title: string;
  currency?: string;             // default EUR
  lines: CostLineInput[];
  /** multiplicative risk/overhead factors applied to the total, e.g. { "contingency": 0.15 } */
  riskFactors?: Record<string, number>;
  horizonYears?: number;
  discountRatePct?: number;      // if set with horizonYears, reports NPV of recurring costs
}

// ── FIGARO IO service ──

export interface FigaroShockRequest {
  /** ISO-2 country code, e.g. "FR", or "EU27" */
  region: string;
  /** NACE/FIGARO industry code, e.g. "C26" (electronics) */
  industry: string;
  /** final demand shock in million EUR (positive = expansion) */
  demandShockMeur: number;
  year?: number;
}

export interface FigaroShockResponse {
  region: string;
  industry: string;
  year: number;
  demandShockMeur: number;
  outputImpactMeur: number;       // total output effect (direct + indirect)
  valueAddedImpactMeur: number;
  outputMultiplier: number;       // Leontief type-I multiplier
  employmentImpactFte?: number;   // if employment extension available
  emissionsImpactKtCo2e?: number; // if emissions extension available
  topSpilloverSectors: Array<{ industry: string; outputMeur: number }>;
  dataSource: string;             // e.g. "Eurostat FIGARO 2021 release"
  methodology: string;
}
