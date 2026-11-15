/**
 * Vertical resolution — bridges the researcher-routing vocabulary
 * (VERTICAL_RESEARCHER_MAP slugs emitted by topic classification) to the
 * publication Vertical rows in the DB.
 *
 * Historically `resolveVertical` did `findUnique({ slug })` then fell back
 * to `findFirst({ isActive: true })` — an arbitrary, stable-first vertical.
 * Since classification slugs (tech-innovation, macro-finance, …) never
 * matched DB slugs, effectively every publication landed in eu-policy or
 * geopolitics. This module:
 *   1. maps researcher slugs → DB slugs (VERTICAL_SLUG_ALIASES),
 *   2. falls back to the least-published active vertical instead of an
 *      arbitrary first row, so unmatched topics still spread coverage.
 */

import { prisma } from '../db';
import { resolveDbVerticalSlug } from '../think-tank/verticals';

export interface ResolvedVertical {
  id: string;
  slug: string;
}

const SELECT = { id: true, slug: true } as const;

/**
 * Active vertical with the fewest publications all-time. Deterministic
 * tie-break by slug. Degrades to the previous `findFirst` behaviour when
 * the coverage query is unavailable — coverage-aware, never blocking.
 */
export async function pickLeastCoveredVertical(): Promise<ResolvedVertical | null> {
  try {
    const [verticals, pubCounts] = await Promise.all([
      prisma.vertical.findMany({ where: { isActive: true }, select: SELECT }),
      prisma.thinkTankPublication.groupBy({ by: ['verticalId'], _count: { _all: true } }),
    ]);
    if (verticals.length === 0) {
      return prisma.vertical.findFirst({ where: { isActive: true }, select: SELECT });
    }
    const countById = new Map(pubCounts.map(c => [c.verticalId, c._count._all]));
    return [...verticals].sort((a, b) => {
      const ca = countById.get(a.id) ?? 0;
      const cb = countById.get(b.id) ?? 0;
      return ca - cb || a.slug.localeCompare(b.slug);
    })[0];
  } catch {
    return prisma.vertical.findFirst({
      where: { isActive: true },
      select: SELECT,
    });
  }
}

/**
 * Resolve a dispatch/classification vertical reference to a DB vertical.
 * Order: explicit id → aliased slug → least-covered active vertical.
 */
export async function resolveVerticalRecord(
  verticalId?: string,
  verticalSlug?: string,
): Promise<ResolvedVertical | null> {
  if (verticalId) {
    const v = await prisma.vertical.findUnique({ where: { id: verticalId }, select: SELECT });
    if (v) return v;
  }
  const dbSlug = resolveDbVerticalSlug(verticalSlug);
  if (dbSlug) {
    const v = await prisma.vertical.findUnique({ where: { slug: dbSlug }, select: SELECT });
    if (v) return v;
  }
  return pickLeastCoveredVertical();
}

/** Dispatcher variant — includes the vertical config for capacity checks. */
export async function pickLeastCoveredVerticalForDispatch(): Promise<{
  id: string;
  slug: string;
  config: unknown;
} | null> {
  try {
    const [verticals, pubCounts] = await Promise.all([
      prisma.vertical.findMany({
        where: { isActive: true },
        select: { id: true, slug: true, config: true },
      }),
      prisma.thinkTankPublication.groupBy({ by: ['verticalId'], _count: { _all: true } }),
    ]);
    if (verticals.length === 0) {
      return prisma.vertical.findFirst({
        where: { isActive: true },
        select: { id: true, slug: true, config: true },
      });
    }
    const countById = new Map(pubCounts.map(c => [c.verticalId, c._count._all]));
    return [...verticals].sort((a, b) => {
      const ca = countById.get(a.id) ?? 0;
      const cb = countById.get(b.id) ?? 0;
      return ca - cb || a.slug.localeCompare(b.slug);
    })[0];
  } catch {
    return prisma.vertical.findFirst({
      where: { isActive: true },
      select: { id: true, slug: true, config: true },
    });
  }
}
