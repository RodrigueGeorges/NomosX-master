/**
 * Vertical resolution — the slug bridge between researcher routing
 * (VERTICAL_RESEARCHER_MAP slugs) and DB publication verticals.
 *
 * Regression: classification emitted slugs like "tech-innovation" that
 * never matched DB slugs ("ai-labor"), so every publication fell through
 * to an arbitrary findFirst vertical — 100% of pubs landed in eu-policy
 * and geopolitics while 3 verticals stayed empty for the platform's life.
 */

import { resolveDbVerticalSlug, VERTICAL_SLUG_ALIASES } from '@/lib/think-tank/verticals';
import { prisma } from '@/lib/db';
import {
  resolveVerticalRecord,
  pickLeastCoveredVertical,
} from '@/lib/agent/vertical-resolution';

jest.mock('@/lib/db', () => ({
  prisma: {
    vertical: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    thinkTankPublication: {
      groupBy: jest.fn(),
    },
  },
}));

const vFindUnique = prisma.vertical.findUnique as jest.Mock;
const vFindMany = prisma.vertical.findMany as jest.Mock;
const vFindFirst = prisma.vertical.findFirst as jest.Mock;
const pubGroupBy = prisma.thinkTankPublication.groupBy as jest.Mock;

const DB_VERTICALS = [
  { id: 'v-eu', slug: 'eu-policy', config: {} },
  { id: 'v-cl', slug: 'climate-industry', config: {} },
  { id: 'v-ai', slug: 'ai-labor', config: {} },
  { id: 'v-gp', slug: 'geopolitics', config: {} },
  { id: 'v-fi', slug: 'finance-regulation', config: {} },
  { id: 'v-hb', slug: 'health-bioethics', config: {} },
];

beforeEach(() => {
  jest.clearAllMocks();
  vFindFirst.mockResolvedValue(null);
});

describe('resolveDbVerticalSlug', () => {
  it('maps researcher slugs to DB vertical slugs', () => {
    expect(resolveDbVerticalSlug('climate-energy')).toBe('climate-industry');
    expect(resolveDbVerticalSlug('macro-finance')).toBe('finance-regulation');
    expect(resolveDbVerticalSlug('tech-innovation')).toBe('ai-labor');
  });

  it('passes through slugs that already exist in the DB vocabulary', () => {
    expect(resolveDbVerticalSlug('geopolitics')).toBe('geopolitics');
    expect(resolveDbVerticalSlug('health-bioethics')).toBe('health-bioethics');
    expect(resolveDbVerticalSlug('social-policy')).toBe('social-policy');
  });

  it('handles empty input', () => {
    expect(resolveDbVerticalSlug(undefined)).toBeUndefined();
    expect(resolveDbVerticalSlug(null)).toBeUndefined();
    expect(resolveDbVerticalSlug('')).toBeUndefined();
  });

  it('every alias target is itself a canonical DB vertical slug', () => {
    const { VERTICALS } = jest.requireActual('@/lib/think-tank/verticals');
    const canonical = new Set(VERTICALS.map((v: { slug: string }) => v.slug));
    for (const target of Object.values(VERTICAL_SLUG_ALIASES)) {
      expect(canonical.has(target)).toBe(true);
    }
  });
});

describe('resolveVerticalRecord', () => {
  it('resolves an explicit verticalId first', async () => {
    vFindUnique.mockResolvedValueOnce({ id: 'v-x', slug: 'eu-policy' });
    const v = await resolveVerticalRecord('v-x', 'tech-innovation');
    expect(v?.slug).toBe('eu-policy');
    expect(vFindUnique).toHaveBeenCalledTimes(1);
  });

  it('applies the slug alias before lookup', async () => {
    vFindUnique.mockResolvedValueOnce({ id: 'v-ai', slug: 'ai-labor' });
    const v = await resolveVerticalRecord(undefined, 'tech-innovation');
    expect(v?.slug).toBe('ai-labor');
    expect(vFindUnique).toHaveBeenCalledTimes(1);
    expect(vFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { slug: 'ai-labor' } })
    );
  });

  it('falls back to the least-covered active vertical, not findFirst', async () => {
    vFindUnique.mockResolvedValue(null); // slug unmatched
    vFindMany.mockResolvedValue(DB_VERTICALS);
    pubGroupBy.mockResolvedValue([
      { verticalId: 'v-eu', _count: { _all: 54 } },
      { verticalId: 'v-gp', _count: { _all: 18 } },
    ]);
    const v = await resolveVerticalRecord(undefined, 'unknown-slug');
    // All 4 zero-pub verticals tie → deterministic slug order → ai-labor
    expect(v?.slug).toBe('ai-labor');
  });
});

describe('pickLeastCoveredVertical', () => {
  it('returns null when no active verticals', async () => {
    vFindMany.mockResolvedValue([]);
    pubGroupBy.mockResolvedValue([]);
    expect(await pickLeastCoveredVertical()).toBeNull();
  });

  it('picks the vertical with fewest publications', async () => {
    vFindMany.mockResolvedValue(DB_VERTICALS);
    pubGroupBy.mockResolvedValue([
      { verticalId: 'v-eu', _count: { _all: 54 } },
      { verticalId: 'v-gp', _count: { _all: 18 } },
      { verticalId: 'v-ai', _count: { _all: 7 } },
    ]);
    const v = await pickLeastCoveredVertical();
    // Zero-count verticals: climate-industry + health-bioethics → slug order
    expect(v?.slug).toBe('climate-industry');
    expect(v?.slug).not.toBe('eu-policy');
  });
});
