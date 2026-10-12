/**
 * OpenAlex citation snowballing — the recall lever PaperQA2 identified:
 * keyword search finds what the query names; the strongest supporting or
 * contradicting evidence is often what the best sources CITE (backward,
 * `cited_by`) or what CITES them (forward, `cites`).
 *
 * Bounded: at most `maxSeeds` seed works × `perSeed` works per direction,
 * capped at `cap` persisted candidates. Failures degrade to an empty result —
 * the caller treats this as a non-blocking enrichment pass.
 */

import { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { env } from '../env';
import { clamp } from '../text';
import { scoreSource } from '../score';
import { fetchOpenAlexJson, normalizeOpenAlexWork, openAlexAuthParam } from './openalex';

type Resp = { results?: any[] };

export interface SnowballResult {
  addedIds: string[];
  seedsUsed: number;
  candidatesFetched: number;
}

const WORK_SELECT = 'id,doi,title,abstract_inverted_index,publication_year,primary_location,open_access,authorships,cited_by_count';
const pgText = (v: unknown): unknown => (typeof v === 'string' ? v.replace(/\u0000/g, '') : v);

function openAlexIdOf(work: any): string | null {
  const id = typeof work?.id === 'string' ? work.id : '';
  const m = /openalex\.org\/(W\d+)/i.exec(id);
  return m ? m[1] : null;
}

async function resolveSeedWorkId(seed: any): Promise<string | null> {
  const rawId = seed?.raw?.id ?? seed?.raw?.openalexId;
  const fromRaw = typeof rawId === 'string' ? /openalex\.org\/(W\d+)/i.exec(rawId)?.[1] : null;
  if (fromRaw) return fromRaw;
  const fromUrl = typeof seed?.url === 'string' ? /openalex\.org\/(W\d+)/i.exec(seed.url)?.[1] : null;
  if (fromUrl) return fromUrl;
  if (typeof seed?.doi !== 'string' || !seed.doi) return null;
  const base = env.OPENALEX_API;
  const work = await fetchOpenAlexJson<{ id?: string }>(
    `${base}/doi:${encodeURIComponent(seed.doi)}?select=id${openAlexAuthParam()}`,
    { timeout: 15000, retries: 1 },
  );
  return openAlexIdOf(work);
}

export async function snowballFromSeeds(
  seeds: Array<{ doi?: string | null; url?: string | null; raw?: any }>,
  opts: { maxSeeds?: number; perSeed?: number; cap?: number } = {},
): Promise<SnowballResult> {
  const maxSeeds = opts.maxSeeds ?? 6;
  const perSeed = opts.perSeed ?? 4;
  const cap = opts.cap ?? 24;
  const base = env.OPENALEX_API;

  const workIds: string[] = [];
  for (const seed of seeds.slice(0, maxSeeds)) {
    try {
      const id = await resolveSeedWorkId(seed);
      if (id) workIds.push(id);
    } catch { /* single-seed failure must not abort the pass */ }
  }
  if (workIds.length === 0) return { addedIds: [], seedsUsed: 0, candidatesFetched: 0 };

  const seen = new Set<string>();
  const works: any[] = [];
  for (const wid of workIds) {
    // backward = works the seed cites (`cited_by`); forward = works citing it (`cites`)
    for (const filter of [`cited_by:${wid}`, `cites:${wid}`]) {
      try {
        const data = await fetchOpenAlexJson<Resp>(
          `${base}?filter=${encodeURIComponent(filter)}&per-page=${perSeed}&select=${WORK_SELECT}${openAlexAuthParam()}`,
          { timeout: 20000, retries: 1 },
        );
        for (const w of data?.results ?? []) {
          const oid = openAlexIdOf(w) ?? w?.id;
          if (oid && !seen.has(oid)) { seen.add(oid); works.push(w); }
        }
      } catch { /* one direction failing keeps the other + remaining seeds */ }
    }
  }
  if (works.length === 0) return { addedIds: [], seedsUsed: workIds.length, candidatesFetched: 0 };

  const addedIds: string[] = [];
  for (const w of works.slice(0, cap)) {
    const s = normalizeOpenAlexWork(w);
    // Same id scheme as the scout path (`provider:slug`) so a work already
    // retrieved by keyword search upserts onto its own row instead of
    // creating a duplicate.
    const slug = (s.doi || openAlexIdOf(w) || s.title || 'unknown')
      .replace(/[^a-z0-9]/gi, '-').slice(0, 60).toLowerCase();
    const id = `openalex:${slug}`;
    try {
      const qualityScore = await scoreSource({
        year: s.year ?? null,
        citationCount: s.citationCount ?? null,
        oaStatus: s.oaStatus ?? null,
        institutions: s.institutions?.map((inst: any) => inst.name) ?? [],
        provider: s.provider,
        type: s.type,
        abstract: s.abstract ?? null,
        hasFullText: null,
        contentLength: s.abstract?.length ?? null,
      });
      const data = {
        provider: 'openalex',
        type: 'paper',
        title: (pgText(s.title) as string) || '',
        abstract: s.abstract ? clamp(String(pgText(s.abstract)), 8000) : null,
        year: s.year ?? null,
        doi: (pgText(s.doi) as string | null) ?? null,
        url: (pgText(s.url) as string | null) ?? null,
        pdfUrl: (pgText(s.pdfUrl) as string | null) ?? null,
        oaStatus: (pgText(s.oaStatus) as string | null) ?? null,
        topics: (s.topics ?? []).map((t: unknown) => String(pgText(t))).filter(Boolean),
        jelCodes: [],
        citationCount: s.citationCount ?? null,
        qualityScore,
        raw: { snowballedFrom: workIds[0], authors: s.authors ?? [], institutions: s.institutions ?? [] } as Prisma.InputJsonValue,
      };
      await prisma.source.upsert({ where: { id }, update: data, create: { id, ...data } });
      addedIds.push(id);
    } catch { /* a single bad row must not kill the batch */ }
  }

  return { addedIds, seedsUsed: workIds.length, candidatesFetched: works.length };
}
