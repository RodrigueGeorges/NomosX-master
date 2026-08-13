/**
 * QUANT BRIDGE — FIGARO IO service client
 *
 * Thin HTTP client for the Python quant-service (see /quant-service).
 * The service computes Leontief multipliers and final-demand shock
 * propagation on Eurostat FIGARO inter-country input-output tables.
 *
 * Fail-safe: returns null on any error — the pipeline never blocks on it.
 * Configure with QUANT_SERVICE_URL (e.g. https://quant.nomosx.com).
 */

import axios from "axios";
import { z } from "zod";
import type { FigaroShockRequest, FigaroShockResponse, ModelResult } from "./types";

const TIMEOUT_MS = 30_000;

export function quantServiceUrl(): string | null {
  return process.env.QUANT_SERVICE_URL?.replace(/\/+$/, "") || null;
}

// Runtime validation schema for the FIGARO service response.
// TypeScript types protect at compile time; Zod protects at runtime against
// a malformed or version-mismatched Python service.
const FigaroShockResponseSchema = z.object({
  region: z.string(),
  industry: z.string(),
  year: z.number(),
  demandShockMeur: z.number(),
  outputImpactMeur: z.number(),
  valueAddedImpactMeur: z.number(),
  outputMultiplier: z.number(),
  employmentImpactFte: z.number().optional(),
  emissionsImpactKtCo2e: z.number().optional(),
  topSpilloverSectors: z.array(z.object({
    industry: z.string(),
    outputMeur: z.number(),
  })),
  dataSource: z.string(),
  methodology: z.string(),
});

export async function figaroShock(req: FigaroShockRequest): Promise<FigaroShockResponse | null> {
  const base = quantServiceUrl();
  if (!base) return null;
  try {
    const { data } = await axios.post(`${base}/v1/io/shock`, req, {
      timeout: TIMEOUT_MS,
      headers: { "Content-Type": "application/json" },
    });
    const parsed = FigaroShockResponseSchema.safeParse(data);
    if (!parsed.success) {
      console.warn(`[QuantBridge] FIGARO response failed Zod validation:`, parsed.error.issues);
      return null;
    }
    return parsed.data;
  } catch (err) {
    console.warn(`[QuantBridge] FIGARO service unavailable:`, err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Deterministic query → FIGARO sector mapping.
 * Only triggers when the query clearly concerns a mappable industry AND
 * an EU/European framing — otherwise IO analysis is not pertinent.
 */
const SECTOR_KEYWORDS: Array<{ pattern: RegExp; industry: string; label: string }> = [
  { pattern: /\b(semiconductor|chip|electronics|microelectronic)/i, industry: "C26", label: "Computer, electronic and optical products" },
  { pattern: /\b(automotive|car industry|vehicle manufactur|ev production)/i, industry: "C29", label: "Motor vehicles" },
  { pattern: /\b(pharma|pharmaceutical|drug manufactur|vaccine)/i, industry: "C21", label: "Pharmaceutical products" },
  { pattern: /\b(steel|metallurg|aluminium|aluminum)/i, industry: "C24", label: "Basic metals" },
  { pattern: /\b(agricultur|farming|food security|crop)/i, industry: "A01", label: "Crop and animal production" },
  { pattern: /\b(construction|housing|building sector|infrastructure invest)/i, industry: "F", label: "Construction" },
  { pattern: /\b(energy|electricity|power sector|renewable|grid)/i, industry: "D35", label: "Electricity, gas, steam" },
  { pattern: /\b(software|it services|digital services|cloud|ai industry|data cent)/i, industry: "J62_63", label: "IT and information services" },
  { pattern: /\b(telecom|5g|broadband|connectivity)/i, industry: "J61", label: "Telecommunications" },
  { pattern: /\b(rail|railway|transport sector|logistics|freight)/i, industry: "H49", label: "Land transport" },
  { pattern: /\b(research and development|r&d invest|r&i polic)/i, industry: "M72", label: "Scientific research and development" },
];

const REGION_KEYWORDS: Array<{ pattern: RegExp; region: string }> = [
  { pattern: /\bfrance|french\b/i, region: "FR" },
  { pattern: /\bgermany|german\b/i, region: "DE" },
  { pattern: /\bitaly|italian\b/i, region: "IT" },
  { pattern: /\bspain|spanish\b/i, region: "ES" },
  { pattern: /\b(eu|europe|european union|european)\b/i, region: "EU27" },
];

export function deriveFigaroRequest(query: string): FigaroShockRequest | null {
  const sector = SECTOR_KEYWORDS.find((s) => s.pattern.test(query));
  if (!sector) return null;
  const region = REGION_KEYWORDS.find((r) => r.pattern.test(query))?.region;
  if (!region) return null; // IO analysis only pertinent with a geographic anchor
  return {
    region,
    industry: sector.industry,
    demandShockMeur: 1000, // normalized €1bn shock — results read as "per €1bn of final demand"
  };
}

export function figaroResponseToModelResult(res: FigaroShockResponse, modelRef: number): ModelResult {
  const rows = [
    { label: `Total output impact (direct + indirect)`, value: res.outputImpactMeur, unit: "M EUR" },
    { label: `Value added impact`, value: res.valueAddedImpactMeur, unit: "M EUR" },
    { label: `Output multiplier (Leontief type I)`, value: res.outputMultiplier, unit: "×" },
    ...(res.employmentImpactFte !== undefined
      ? [{ label: "Employment impact", value: res.employmentImpactFte, unit: "FTE" }]
      : []),
    ...(res.emissionsImpactKtCo2e !== undefined
      ? [{ label: "Emissions impact", value: res.emissionsImpactKtCo2e, unit: "kt CO2e" }]
      : []),
    ...res.topSpilloverSectors.slice(0, 5).map((s) => ({
      label: `Spillover: ${s.industry}`,
      value: s.outputMeur,
      unit: "M EUR",
    })),
  ];
  return {
    modelRef,
    kind: "figaro-io",
    name: `Input-output impact — ${res.industry} (${res.region}), €${res.demandShockMeur}M final demand shock`,
    methodology: res.methodology,
    dataSources: [res.dataSource],
    parameters: [
      { name: "Region", value: res.region, source: "query-derived" },
      { name: "Industry (NACE)", value: res.industry, source: "query-derived" },
      { name: "Final demand shock", value: res.demandShockMeur, unit: "M EUR", source: "normalized scenario" },
      { name: "Reference year", value: res.year, source: res.dataSource },
    ],
    rows,
    caveats: [
      "Leontief type-I multipliers: fixed technical coefficients, no price effects, no supply constraints, no induced (household income) effects.",
      "Results are linear in the shock — read as impact per €1bn of additional final demand.",
      "Static framework — describes structural interdependencies, not a dynamic forecast.",
    ],
    computedAt: new Date().toISOString(),
    durationMs: 0,
  };
}
