/**
 * Public reasoning lenses — domain analytical models (no personas).
 * Derived from internal researcher registry; front exposes lenses only.
 */

import { RESEARCHERS } from "@/lib/researchers";

export interface ReasoningLens {
  id: string;
  domain: string;
  focus: string;
  approach: string;
  frameworks: string[];
  colorHex: string;
  tier: "core" | "advanced" | "specialized";
}

export function getReasoningLenses(): ReasoningLens[] {
  const seen = new Set<string>();
  const lenses: ReasoningLens[] = [];

  for (const r of RESEARCHERS) {
    const key = r.domain.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    lenses.push({
      id: r.id,
      domain: r.domain,
      focus: r.specialty,
      approach:
        r.analyticalSignature ??
        `Cross-domain analysis with adversarial review in ${r.domain.toLowerCase()}.`,
      frameworks: (r.frameworks ?? r.fields ?? []).slice(0, 3),
      colorHex: r.colorHex,
      tier: r.tier,
    });
  }

  const tierOrder = { core: 0, advanced: 1, specialized: 2 };
  return lenses.sort(
    (a, b) => tierOrder[a.tier] - tierOrder[b.tier] || a.domain.localeCompare(b.domain)
  );
}

export const REASONING_LENS_COUNT = getReasoningLenses().length;
