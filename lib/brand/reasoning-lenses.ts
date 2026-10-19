/**
 * Public reasoning lenses — domain analytical models backed by named
 * NomosX desk identities (Greek canon, never fabricated human credentials).
 * Derived from the canonical registry in lib/researchers.ts.
 */

import { RESEARCHERS, getDeskName } from "@/lib/researchers";
import { DESK_PORTRAITS, deskPortraitUrl } from "@/lib/brand/researcher-portraits";

export interface ReasoningLens {
  id: string;
  domain: string;
  /** Canonical desk identity, e.g. "Dr. Athena (Ἀθηνᾶ)" */
  deskName: string;
  /** Researcher title, e.g. "Security Analyst" */
  title: string;
  /** Greek monogram for avatars, e.g. "ΑΑ" */
  initials: string;
  /** Fresco portrait of the desk's patron mythic figure, when commissioned */
  portraitUrl?: string;
  /** The patron mythological figure's archetype (why this figure owns the desk) */
  portraitArchetype?: string;
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
      deskName: getDeskName(r.id),
      title: r.title,
      initials: r.initials,
      portraitUrl: DESK_PORTRAITS[r.id] ? deskPortraitUrl(r.id) : undefined,
      portraitArchetype: DESK_PORTRAITS[r.id]?.archetype,
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
