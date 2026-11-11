/**
 * Research agenda — the desk's cumulative coverage account.
 *
 * The radar sees what is happening; the agenda knows what the institution
 * has been covering. These tests pin the deficit math, the flagship
 * selection, the prompt block, and the deterministic priority boost.
 */

import { buildResearchAgendaContext, agendaPriorityBoost } from '@/lib/agent/research-agenda';
import { prisma } from '@/lib/db';

jest.mock('@/lib/db', () => ({
  prisma: {
    vertical: { findMany: jest.fn() },
    thinkTankPublication: { findMany: jest.fn() },
  },
}));

const verticalFindMany = prisma.vertical.findMany as jest.Mock;
const pubFindMany = prisma.thinkTankPublication.findMany as jest.Mock;

const VERTICALS = [
  { id: 'v-eu', slug: 'eu-policy', name: 'EU Policy' },
  { id: 'v-gp', slug: 'geopolitics', name: 'Geopolitics' },
  { id: 'v-cl', slug: 'climate-industry', name: 'Climate & Industry' },
  { id: 'v-ai', slug: 'ai-labor', name: 'AI & Labor' },
  { id: 'v-fi', slug: 'finance-regulation', name: 'Finance & Regulation' },
];

function pubsFor(slugCounts: Record<string, number>) {
  const idBySlug = Object.fromEntries(VERTICALS.map(v => [v.slug, v.id]));
  const out: { verticalId: string; title: string; trustScore: number }[] = [];
  for (const [slug, n] of Object.entries(slugCounts)) {
    for (let i = 0; i < n; i++) {
      out.push({ verticalId: idBySlug[slug], title: `${slug} piece ${i}`, trustScore: 70 + i });
    }
  }
  return out;
}

beforeEach(() => {
  jest.clearAllMocks();
  verticalFindMany.mockResolvedValue(VERTICALS);
});

describe('buildResearchAgendaContext', () => {
  it('returns empty agenda when no active verticals', async () => {
    verticalFindMany.mockResolvedValue([]);
    const ctx = await buildResearchAgendaContext();
    expect(ctx.coverage).toEqual([]);
    expect(ctx.promptBlock).toBe('');
  });

  it('computes equal-share deficits across the trailing window', async () => {
    // 10 pubs total, all eu-policy → target 2.0 per vertical
    pubFindMany.mockResolvedValue(pubsFor({ 'eu-policy': 10 }));
    const ctx = await buildResearchAgendaContext({ windowDays: 30 });

    const eu = ctx.coverage.find(c => c.slug === 'eu-policy')!;
    const cl = ctx.coverage.find(c => c.slug === 'climate-industry')!;
    expect(eu.pubsInWindow).toBe(10);
    expect(eu.targetPubs).toBeCloseTo(2);
    expect(eu.deficit).toBeLessThan(0); // over-covered
    expect(cl.pubsInWindow).toBe(0);
    expect(cl.deficit).toBe(1); // fully uncovered
    expect(ctx.deficitSlugs).toContain('climate-industry');
    expect(ctx.deficitSlugs).toContain('ai-labor');
    expect(ctx.deficitSlugs).toContain('finance-regulation');
    expect(ctx.deficitSlugs).toContain('geopolitics');
    expect(ctx.deficitSlugs).not.toContain('eu-policy');
  });

  it('produces no deficit signal when coverage is balanced', async () => {
    pubFindMany.mockResolvedValue(pubsFor({
      'eu-policy': 2, 'geopolitics': 2, 'climate-industry': 2, 'ai-labor': 2, 'finance-regulation': 2,
    }));
    const ctx = await buildResearchAgendaContext();
    expect(ctx.deficitSlugs).toEqual([]);
    expect(ctx.promptBlock).toBe('');
  });

  it('surfaces flagship questions only for deficit domains with history', async () => {
    // climate has 1 pub (below 60% of target 2.0 → deficit), others 0
    pubFindMany.mockResolvedValue(pubsFor({ 'eu-policy': 9, 'climate-industry': 1 }));
    const ctx = await buildResearchAgendaContext();
    expect(ctx.flagshipQuestions.some(q => q.includes('climate-industry piece'))).toBe(true);
    expect(ctx.promptBlock).toContain('UNDER-COVERED');
    expect(ctx.promptBlock).toContain('DOMAIN COVERAGE');
  });

  it('fails open on DB errors', async () => {
    pubFindMany.mockRejectedValue(new Error('db down'));
    const ctx = await buildResearchAgendaContext();
    expect(ctx.coverage).toEqual([]);
    expect(ctx.promptBlock).toBe('');
  });
});

describe('agendaPriorityBoost', () => {
  it('boosts most-deficit domain most, decaying by rank', async () => {
    pubFindMany.mockResolvedValue(pubsFor({ 'eu-policy': 10 }));
    const ctx = await buildResearchAgendaContext();
    const top = agendaPriorityBoost(ctx.deficitSlugs[0], ctx);
    const second = agendaPriorityBoost(ctx.deficitSlugs[1], ctx);
    expect(top).toBe(15);
    expect(second).toBe(11);
    expect(agendaPriorityBoost('eu-policy', ctx)).toBe(0);
    expect(agendaPriorityBoost(undefined, ctx)).toBe(0);
    expect(agendaPriorityBoost('anything', undefined)).toBe(0);
  });
});
