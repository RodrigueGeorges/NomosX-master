/**
 * NomosX RESEARCH AGENDA — the editorial desk layer.
 *
 * The radar finds what is happening; the triage picks what is publishable.
 * Neither decides what the INSTITUTION should be covering. This module is
 * that missing layer: a deterministic, DB-grounded account of domain
 * coverage over a trailing window, the flagship questions each domain has
 * answered best, and the deficit signal the Editor-in-Chief needs to keep
 * the publication mix honest over weeks — not just within one cycle.
 *
 * Pure reads, no LLM calls, fail-open: a DB error yields an empty agenda
 * and triage proceeds exactly as before.
 */

import { prisma } from '../db';

export interface DomainCoverage {
  slug: string;
  name: string;
  pubsInWindow: number;
  targetPubs: number;
  /** -1 (over-covered) … 0 (at target) … +1 (fully uncovered) */
  deficit: number;
}

export interface ResearchAgendaContext {
  coverage: DomainCoverage[];
  /** Under-covered domain slugs, most-deficit first. */
  deficitSlugs: string[];
  /** Highest-trust recent questions per deficit domain — what the
   *  institution does best in the domains it neglects. */
  flagshipQuestions: string[];
  /** Ready-to-inject block for the triage prompt. */
  promptBlock: string;
  windowDays: number;
  builtAt: number;
}

const EMPTY: ResearchAgendaContext = {
  coverage: [], deficitSlugs: [], flagshipQuestions: [], promptBlock: '',
  windowDays: 30, builtAt: 0,
};

export async function buildResearchAgendaContext(
  options?: { windowDays?: number }
): Promise<ResearchAgendaContext> {
  const windowDays = options?.windowDays ?? 30;
  const builtAt = Date.now();
  try {
    const since = new Date(builtAt - windowDays * 86_400_000);
    const [verticals, pubs] = await Promise.all([
      prisma.vertical.findMany({
        where: { isActive: true },
        select: { id: true, slug: true, name: true },
      }),
      prisma.thinkTankPublication.findMany({
        where: { status: 'PUBLISHED', publishedAt: { gte: since } },
        select: { verticalId: true, title: true, trustScore: true },
        orderBy: { publishedAt: 'desc' },
        take: 200,
      }),
    ]);
    if (verticals.length === 0) return { ...EMPTY, builtAt };

    const slugByVerticalId = new Map(verticals.map(v => [v.id, v.slug]));
    const nameBySlug = new Map(verticals.map(v => [v.slug, v.name]));
    const pubsBySlug = new Map<string, number>();
    const flagshipBySlug = new Map<string, { title: string; trust: number }[]>();
    for (const p of pubs) {
      const slug = slugByVerticalId.get(p.verticalId);
      if (!slug) continue;
      pubsBySlug.set(slug, (pubsBySlug.get(slug) ?? 0) + 1);
      const list = flagshipBySlug.get(slug) ?? [];
      list.push({ title: p.title, trust: p.trustScore ?? 0 });
      flagshipBySlug.set(slug, list);
    }

    const totalPubs = pubs.length;
    // Equal-share target across ACTIVE verticals. With zero publications
    // every domain is equally uncovered — no deficit signal, no distortion.
    const targetPubs = verticals.length > 0 ? totalPubs / verticals.length : 0;
    const coverage: DomainCoverage[] = verticals.map(v => {
      const actual = pubsBySlug.get(v.slug) ?? 0;
      const deficit = targetPubs > 0
        ? Math.max(-1, Math.min(1, (targetPubs - actual) / targetPubs))
        : 0;
      return { slug: v.slug, name: v.name, pubsInWindow: actual, targetPubs, deficit };
    }).sort((a, b) => b.deficit - a.deficit);

    // A domain counts as under-covered when it sits meaningfully below an
    // equal share — 60% of target is the floor below which coverage is
    // nominal rather than real.
    const deficitSlugs = coverage
      .filter(c => c.pubsInWindow < c.targetPubs * 0.6 && c.targetPubs > 0)
      .map(c => c.slug);

    // Flagship questions: the highest-trust recent piece per deficit
    // domain, then keep the 3 strongest — a domain with publication
    // history is more informative than an empty one, so rank by trust
    // rather than deficit order.
    const flagshipCandidates = deficitSlugs
      .map(slug => {
        const best = (flagshipBySlug.get(slug) ?? [])
          .sort((a, b) => b.trust - a.trust)[0];
        return best ? { slug, title: best.title, trust: best.trust } : null;
      })
      .filter((x): x is { slug: string; title: string; trust: number } => x !== null)
      .sort((a, b) => b.trust - a.trust)
      .slice(0, 3);
    const flagshipQuestions: string[] = flagshipCandidates.map(f =>
      `[${nameBySlug.get(f.slug) ?? f.slug}] ${f.title}`);

    const underCovered = coverage.filter(c => c.deficit > 0.2);
    const promptBlock = underCovered.length > 0
      ? `\nEDITORIAL AGENDA — DOMAIN COVERAGE (last ${windowDays}d, ${totalPubs} publications):\n` +
        underCovered.map(c =>
          `- ${c.name} (${c.slug}): ${c.pubsInWindow} published vs ~${c.targetPubs.toFixed(1)} equal-share target — UNDER-COVERED`
        ).join('\n') +
        (flagshipQuestions.length > 0
          ? `\n\nFLAGSHIP QUESTIONS this institution answers best in under-covered domains:\n${flagshipQuestions.map(q => `- ${q}`).join('\n')}`
          : '') +
        `\n\nAGENDA RULE: when two candidate topics are comparable on novelty/urgency/impact, prefer the one from an UNDER-COVERED domain. Domain balance is an editorial obligation, not a nice-to-have.`
      : '';

    return { coverage, deficitSlugs, flagshipQuestions, promptBlock, windowDays, builtAt };
  } catch (err) {
    console.warn('[RESEARCH AGENDA] build failed (non-blocking):', String(err).slice(0, 120));
    return { ...EMPTY, builtAt };
  }
}

/**
 * Deterministic priority adjustment for agenda-aware selection. A topic in
 * a deficit domain earns up to +15 priority — meaningful against the LLM's
 * 0-100 scale but never enough to override a clearly superior topic.
 */
export function agendaPriorityBoost(
  verticalSlug: string | undefined,
  agenda?: ResearchAgendaContext
): number {
  if (!agenda || !verticalSlug) return 0;
  const idx = agenda.deficitSlugs.indexOf(verticalSlug);
  if (idx < 0) return 0;
  // Most-deficit domain gets the full boost, decaying by rank.
  return Math.max(5, 15 - idx * 4);
}
