/**
 * QUANT BRIDGE — Parametric costing engine
 *
 * Deterministic order-of-magnitude cost estimation:
 *   total = Σ (unitCost × quantity) × Π (1 + riskFactor)
 * with per-line uncertainty propagated to a low/central/high range.
 *
 * Design principles (same as quant-agent):
 * - Zero LLM calls — pure arithmetic, no hallucination possible
 * - Full lineage — every unit cost carries its statistical source
 * - Honest ranges — uncertainty is propagated, never hidden
 */

import { REFERENCE_COST_BY_ID } from "./reference-costs";
import type { ModelParameter, ModelResult, ModelResultRow, ParametricCostInput } from "./types";

const DEFAULT_UNCERTAINTY = 0.3;

function round(n: number, digits = 0): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

/** Present value of an annuity of 1 over n years at rate r. */
function annuityFactor(nYears: number, ratePct: number): number {
  const r = ratePct / 100;
  if (r === 0) return nYears;
  return (1 - (1 + r) ** -nYears) / r;
}

export function runParametricCost(input: ParametricCostInput, modelRef: number): ModelResult {
  const start = Date.now();
  const currency = input.currency || "EUR";
  const parameters: ModelParameter[] = [];
  const rows: ModelResultRow[] = [];
  const caveats: string[] = [
    "Order-of-magnitude estimate for scoping purposes — not a substitute for a bottom-up quotation.",
    "Unit costs are statistical averages; project-specific conditions may fall outside the stated ranges.",
  ];
  const dataSources = new Set<string>();

  let central = 0;
  let low = 0;
  let high = 0;

  for (const line of input.lines) {
    const ref = line.referenceCostId ? REFERENCE_COST_BY_ID[line.referenceCostId] : undefined;
    const unitCost = line.unitCost ?? ref?.unitCost;
    if (unitCost === undefined) {
      caveats.push(`Line "${line.label}" skipped: no unit cost provided and no reference match.`);
      continue;
    }
    if (typeof line.quantity !== "number" || line.quantity <= 0) {
      caveats.push(`Line "${line.label}" skipped: quantity must be a positive number (got ${line.quantity}).`);
      continue;
    }
    if (unitCost < 0) {
      caveats.push(`Line "${line.label}" skipped: unit cost must be non-negative (got ${unitCost}).`);
      continue;
    }
    // Staleness check on reference cost
    if (ref) {
      const ageYears = new Date().getFullYear() - ref.referenceYear;
      if (ageYears > 2) {
        caveats.push(`Reference cost "${ref.id}" is from ${ref.referenceYear} (${ageYears} years old) — may need updating.`);
      }
    }
    const unit = line.unit ?? ref?.unit ?? "unit";
    const uncertainty = line.uncertainty ?? ref?.uncertainty ?? DEFAULT_UNCERTAINTY;
    const lineCentral = unitCost * line.quantity;

    if (ref) dataSources.add(ref.source);
    parameters.push({
      name: line.label,
      value: unitCost,
      unit: `${currency}/${unit}`,
      source: ref ? ref.source : "caller-provided assumption",
    });

    rows.push({
      label: line.label,
      value: round(lineCentral),
      unit: currency,
      low: round(lineCentral * (1 - uncertainty)),
      high: round(lineCentral * (1 + uncertainty)),
      note: `${line.quantity} × ${unitCost} ${currency}/${unit} (±${Math.round(uncertainty * 100)}%)`,
    });

    central += lineCentral;
    low += lineCentral * (1 - uncertainty);
    high += lineCentral * (1 + uncertainty);
  }

  // Multiplicative risk/overhead factors
  let riskMultiplier = 1;
  for (const [name, factor] of Object.entries(input.riskFactors || {})) {
    riskMultiplier *= 1 + factor;
    parameters.push({ name: `Risk factor: ${name}`, value: `+${Math.round(factor * 100)}%`, source: "engagement assumption" });
  }
  central *= riskMultiplier;
  low *= riskMultiplier;
  high *= riskMultiplier;

  rows.push({
    label: "TOTAL (with risk factors)",
    value: round(central),
    unit: currency,
    low: round(low),
    high: round(high),
    note: riskMultiplier !== 1 ? `risk multiplier ×${round(riskMultiplier, 3)}` : undefined,
  });

  // Optional NPV over horizon
  if (input.horizonYears && input.horizonYears > 1) {
    const rate = input.discountRatePct ?? 3;
    const af = annuityFactor(input.horizonYears, rate);
    rows.push({
      label: `NPV over ${input.horizonYears} years (discount ${rate}%)`,
      value: round(central * af),
      unit: currency,
      low: round(low * af),
      high: round(high * af),
      note: `annuity factor ${round(af, 3)} — assumes constant annual recurrence`,
    });
    parameters.push({ name: "Discount rate", value: rate, unit: "%", source: "EC Better Regulation Toolbox default (social discount rate)" });
    caveats.push("NPV assumes the estimated cost recurs annually at constant level over the horizon.");
  }

  return {
    modelRef,
    kind: "parametric-cost",
    name: input.title,
    methodology:
      "Parametric estimation: unit costs from sourced statistical references multiplied by caller-specified volumes, " +
      "with per-line uncertainty (±) propagated to a low/central/high range and multiplicative risk factors applied to the total. " +
      "Deterministic computation — no model-generated figures.",
    dataSources: [...dataSources],
    parameters,
    rows,
    caveats,
    computedAt: new Date().toISOString(),
    durationMs: Date.now() - start,
  };
}
