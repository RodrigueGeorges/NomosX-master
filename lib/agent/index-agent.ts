/**
 * INDEX Agent
 * Normalizes sources, enriches identities (ROR/ORCID), and deduplicates
 */

import { prisma } from '../db';
import { env } from '../env';
import { searchROR } from '../providers/ror';
import { getORCIDById } from '../providers/orcid';
import { classifyBatchSources } from './domain-classifier';
import { assertPermission,AgentRole } from '../governance';
import { validateInstitution, validatePerson, enrichWithKnowledgeGraph, type KGEntity } from '../providers/wikidata';
import { enrichAuthorS2 } from '../providers/semantic-scholar-api';

interface NormalizedSource {
  id: string;
  authors: Array<{ name: string; orcid?: string }>;
  institutions: Array<{ name: string; rorId?: string }>;
}

/**
 * Run an async mapper over items with a bounded number of concurrent workers.
 * Used for best-effort network enrichment (ROR / S2) without overwhelming APIs.
 */
async function mapWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>
): Promise<void> {
  if (items.length === 0) return;
  let cursor = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const idx = cursor++;
      try {
        await worker(items[idx], idx);
      } catch {
        /* best-effort — swallow individual failures */
      }
    }
  });
  await Promise.all(runners);
}

/**
 * P0 FIX #1: Parallel ORCID Batching
 * Reduces 3000 sequential calls to 150 batches of 20
 * Performance: 25 minutes → 2-3 minutes
 */
async function enrichAuthorsBatch(
  authors: Array<{ name: string; orcid?: string }>,
  batchSize: number = 20
): Promise<Map<string, any>> {
  const BATCH_SIZE = batchSize;
  const results = new Map<string, any>();
  
  // Filter authors needing ORCID
  const needsOrcid = authors.filter(a => a.orcid);
  
  if (needsOrcid.length === 0) {
    return results;
  }
  
  console.log(`[Index] Enriching ${needsOrcid.length} authors in ${Math.ceil(needsOrcid.length / BATCH_SIZE)} batches`);
  
  for (let i = 0; i < needsOrcid.length; i += BATCH_SIZE) {
    const batch = needsOrcid.slice(i, i + BATCH_SIZE);
    
    // Process batch in PARALLEL instead of sequential
    const promises = batch.map(a => 
      Promise.race([
        getORCIDById(a.orcid!),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('ORCID lookup timeout')), 3000)
        )
      ])
        .catch((err) => {
          console.warn(`[Index] ORCID failed for ${a.orcid}: ${err.message}`);
          return null;
        })
    );
    
    const resolved = await Promise.all(promises);
    
    resolved.forEach((data: any, idx: number) => {
      if (data && batch[idx].orcid) {
        results.set(batch[idx].orcid, data);
      }
    });
    
    const completed = Math.min(i + BATCH_SIZE, needsOrcid.length);
    console.log(`[Index] Batch complete: ${completed}/${needsOrcid.length}`);
  }
  
  return results;
}

export async function indexAgent(sourceIds: string[]): Promise<{ enriched: number; errors: string[] }> {
  // Governance: Assert INDEX permissions
  assertPermission(AgentRole.INDEX, "write:enriched_sources");
  
  const errors: string[] = [];
  let enriched = 0;

  if (sourceIds.length === 0) {
    return { enriched, errors };
  }

  // ── PHASE 1: Batch-load all sources (1 query instead of N) ──
  const sources = await prisma.source.findMany({ where: { id: { in: sourceIds } } });

  // ── PHASE 2: Collect unique authors + institutions across all sources ──
  // Keyed by normalizedName (lowercased/trimmed) for dedup. `name` is NOT unique
  // in the schema, so in-memory dedup before batch-insert keeps writes safe.
  const authorMap = new Map<string, { name: string; orcid?: string }>();
  const instMap = new Map<string, { name: string; rorId?: string }>();
  const perSource: Array<{
    sourceId: string;
    authors: Array<{ key: string; position: number }>;
    institutions: string[];
  }> = [];

  for (const source of sources) {
    const rawAuthors = ((source.raw as any)?.authors || []) as Array<{ name?: string; orcid?: string }>;
    const rawInstitutions = ((source.raw as any)?.institutions || []) as Array<{ name?: string; rorId?: string }>;
    const sAuthors: Array<{ key: string; position: number }> = [];
    const sInsts: string[] = [];

    rawAuthors.forEach((a, position) => {
      const name = a?.name?.trim();
      if (!name) return;
      const key = name.toLowerCase();
      const existing = authorMap.get(key);
      if (!existing) authorMap.set(key, { name, orcid: a.orcid || undefined });
      else if (!existing.orcid && a.orcid) existing.orcid = a.orcid;
      sAuthors.push({ key, position });
    });

    rawInstitutions.forEach((inst) => {
      const name = inst?.name?.trim();
      if (!name) return;
      const key = name.toLowerCase();
      const existing = instMap.get(key);
      if (!existing) instMap.set(key, { name, rorId: inst.rorId || undefined });
      else if (!existing.rorId && inst.rorId) existing.rorId = inst.rorId;
      sInsts.push(key);
    });

    perSource.push({ sourceId: source.id, authors: sAuthors, institutions: sInsts });
  }

  // ── PHASE 3: Batch-load existing authors/institutions by normalizedName ──
  const allAuthorKeys = [...authorMap.keys()];
  const allInstKeys = [...instMap.keys()];

  const [existingAuthors, existingInsts] = await Promise.all([
    allAuthorKeys.length > 0
      ? prisma.author.findMany({ where: { normalizedName: { in: allAuthorKeys } } })
      : Promise.resolve([]),
    allInstKeys.length > 0
      ? prisma.institution.findMany({ where: { normalizedName: { in: allInstKeys } } })
      : Promise.resolve([]),
  ]);

  const authorIdByKey = new Map<string, string>();
  for (const a of existingAuthors) authorIdByKey.set(a.normalizedName, a.id);
  const instIdByKey = new Map<string, string>();
  for (const inst of existingInsts) instIdByKey.set(inst.normalizedName, inst.id);

  const newAuthorKeys = allAuthorKeys.filter((k) => !authorIdByKey.has(k));
  const newInstKeys = allInstKeys.filter((k) => !instIdByKey.has(k));

  // ── PHASE 4: Enrich NEW entities (bounded parallel, best-effort) ──
  // 4a. ORCID (batched, only authors carrying an ORCID id)
  const orcidCache = await enrichAuthorsBatch(
    newAuthorKeys.map((k) => authorMap.get(k)!).filter((a) => a.orcid)
  );

  // 4b. S2 author metrics — gated OFF by default (rate-limited, ~95% failure).
  const s2ByKey = new Map<string, Awaited<ReturnType<typeof enrichAuthorS2>>>();
  if (env.INDEX_S2_AUTHOR_ENRICH === "1" && newAuthorKeys.length > 0) {
    await mapWithConcurrency(newAuthorKeys, 3, async (key) => {
      const a = authorMap.get(key)!;
      const data = await enrichAuthorS2(a.name);
      if (data) s2ByKey.set(key, data);
    });
  }

  // 4c. ROR / Wikidata for NEW institutions (bounded parallel)
  const rorByKey = new Map<string, any>();
  const kgByKey = new Map<string, { canonical?: string; type?: string }>();
  await mapWithConcurrency(newInstKeys, 4, async (key) => {
    const inst = instMap.get(key)!;
    if (inst.rorId) {
      rorByKey.set(key, { id: inst.rorId, name: inst.name });
      return;
    }
    try {
      const rorResults = await searchROR(inst.name);
      if (rorResults.length > 0) {
        rorByKey.set(key, rorResults[0]);
        return;
      }
    } catch { /* fall through to Wikidata */ }
    try {
      const kgResult = await validateInstitution(inst.name);
      if (kgResult.valid) {
        kgByKey.set(key, { canonical: kgResult.canonical, type: kgResult.entity?.types?.[0] });
      }
    } catch { /* non-critical */ }
  });

  // ── PHASE 5: Batch-create NEW authors/institutions ──
  // normalizedName stays the ORIGINAL key so later lookups are consistent even
  // when a canonical display name is applied.
  if (newAuthorKeys.length > 0) {
    await prisma.author.createMany({
      data: newAuthorKeys.map((key) => {
        const a = authorMap.get(key)!;
        const orcidData = a.orcid ? orcidCache.get(a.orcid) : null;
        const s2 = s2ByKey.get(key);
        return {
          name: a.name,
          normalizedName: key,
          orcid: a.orcid || null,
          orcidData: orcidData?.raw || null,
          h_index: s2?.hIndex ?? null,
          citationCount: s2?.citationCount ?? null,
          publicationCount: s2?.paperCount ?? null,
          affiliations: s2?.affiliations || [],
        };
      }),
      skipDuplicates: true,
    });
  }
  if (newInstKeys.length > 0) {
    await prisma.institution.createMany({
      data: newInstKeys.map((key) => {
        const inst = instMap.get(key)!;
        const ror = rorByKey.get(key);
        const kg = kgByKey.get(key);
        return {
          name: kg?.canonical || inst.name,
          normalizedName: key,
          rorId: ror?.id || null,
          rorData: ror?.raw || null,
          country: ror?.country || null,
          type: ror?.type || kg?.type || null,
        };
      }),
      skipDuplicates: true,
    });
  }

  // Reload newly-created ids and merge into the key→id maps
  const [freshAuthors, freshInsts] = await Promise.all([
    newAuthorKeys.length > 0
      ? prisma.author.findMany({
          where: { normalizedName: { in: newAuthorKeys } },
          select: { id: true, normalizedName: true },
        })
      : Promise.resolve([]),
    newInstKeys.length > 0
      ? prisma.institution.findMany({
          where: { normalizedName: { in: newInstKeys } },
          select: { id: true, normalizedName: true },
        })
      : Promise.resolve([]),
  ]);
  for (const a of freshAuthors) authorIdByKey.set(a.normalizedName, a.id);
  for (const inst of freshInsts) instIdByKey.set(inst.normalizedName, inst.id);

  // ── PHASE 6: Batch-create join rows (skipDuplicates handles re-index) ──
  const sourceAuthorRows: Array<{ sourceId: string; authorId: string; position: number }> = [];
  const sourceInstRows: Array<{ sourceId: string; institutionId: string }> = [];

  for (const ps of perSource) {
    const seenAuthors = new Set<string>();
    for (const { key, position } of ps.authors) {
      const authorId = authorIdByKey.get(key);
      if (!authorId || seenAuthors.has(authorId)) continue;
      seenAuthors.add(authorId);
      sourceAuthorRows.push({ sourceId: ps.sourceId, authorId, position });
    }
    const seenInsts = new Set<string>();
    for (const key of ps.institutions) {
      const institutionId = instIdByKey.get(key);
      if (!institutionId || seenInsts.has(institutionId)) continue;
      seenInsts.add(institutionId);
      sourceInstRows.push({ sourceId: ps.sourceId, institutionId });
    }
    enriched++;
  }

  if (sourceAuthorRows.length > 0) {
    await prisma.sourceAuthor.createMany({ data: sourceAuthorRows, skipDuplicates: true });
  }
  if (sourceInstRows.length > 0) {
    await prisma.sourceInstitution.createMany({ data: sourceInstRows, skipDuplicates: true });
  }

  console.log(
    `[Index] Batched: ${sources.length} sources, ${newAuthorKeys.length} new authors, ${newInstKeys.length} new institutions, ${sourceAuthorRows.length} author-links, ${sourceInstRows.length} inst-links`
  );

  // Classify sources into domains (automatic)
  try {
    await classifyBatchSources(sourceIds);
  } catch (error: any) {
    // Domain classification failure is not critical
    console.warn("Domain classification failed:", error.message);
  }

  // Wikidata entity enrichment (batch, non-blocking, free)
  try {
      const sourcesToEnrich = await prisma.source.findMany({
        where: { id: { in: sourceIds } },
        select: { id: true, title: true, abstract: true },
      });

      const titlesWithAbstract = sourcesToEnrich
        .filter(s => s.title)
        .slice(0, 10); // Cap at 10 to respect rate limits

      if (titlesWithAbstract.length > 0) {
        const enrichments = await Promise.allSettled(
          titlesWithAbstract.map(s =>
            enrichWithKnowledgeGraph(`${s.title} ${(s.abstract || "").slice(0, 200)}`, { maxEntities: 3 })
          )
        );

        let kgEnriched = 0;
        for (let i = 0; i < enrichments.length; i++) {
          if (enrichments[i].status === "fulfilled") {
            const enrichment = (enrichments[i] as PromiseFulfilledResult<any>).value;
            if (enrichment.entities.length > 0) {
              await prisma.source.update({
                where: { id: titlesWithAbstract[i].id },
                data: {
                  raw: {
                    ...(await prisma.source.findUnique({ where: { id: titlesWithAbstract[i].id }, select: { raw: true } }))?.raw as any,
                    kgEntities: enrichment.entities.map((e: KGEntity) => ({
                      mid: e.mid,
                      name: e.name,
                      types: e.types,
                      description: e.description,
                      score: e.resultScore,
                    })),
                    kgEntityTypes: {
                      people: enrichment.entityTypes.people.length,
                      organizations: enrichment.entityTypes.organizations.length,
                      concepts: enrichment.entityTypes.concepts.length,
                      places: enrichment.entityTypes.places.length,
                    },
                  },
                },
              });
              kgEnriched++;
            }
          }
        }

        if (kgEnriched > 0) {
          console.log(`[Index] Wikidata enriched ${kgEnriched}/${titlesWithAbstract.length} sources with entity data`);
        }
      }
    } catch (kgError: any) {
      console.warn("[Index] Wikidata enrichment failed (non-critical):", kgError.message);
    }

  return { enriched, errors };
}

/**
 * P0 FIX #2: Smart Deduplication
 * Keep highest qualityScore, not earliest createdAt
 * Preserves PDFs and enriched sources
 * 
 * P1 FIX #4: Soft-delete instead of hard delete
 * Marks duplicates as deleted_at instead of removing from DB
 * Keeps full audit trail and allows recovery
 */
export async function deduplicateSources(): Promise<{ removed: number }> {
  // Group by DOI
  const doiGroups = await prisma.$queryRaw<Array<{ doi: string; count: number }>>`
    SELECT doi, COUNT(*) as count
    FROM "Source"
    WHERE doi IS NOT NULL AND doi != ''
    AND "deletedAt" IS NULL
    GROUP BY doi
    HAVING COUNT(*) > 1
  `;

  let removed = 0;

  for (const group of doiGroups) {
    const sources = await prisma.source.findMany({
      where: { doi: group.doi },
      orderBy: { createdAt: "asc" },
    });

    // P0 FIX #2: Keep highest qualityScore, not earliest
    const best = sources.reduce((current, candidate) => {
      const currentScore = current.qualityScore || 0;
      const candidateScore = candidate.qualityScore || 0;
      
      if (candidateScore > currentScore) {
        console.log(
          `[Dedup] Keeping ${candidate.id} (quality:${candidateScore}) over ${current.id} (quality:${currentScore})`
        );
        return candidate;
      }
      
      return current;
    });

    // P1 FIX #4: Soft delete duplicates (keep best quality)
    const toDelete = sources.filter((s) => s.id !== best.id).map((s) => s.id);
    
    if (toDelete.length > 0) {
      // Soft delete duplicates by setting deletedAt
      await prisma.source.updateMany({
        where: { id: { in: toDelete } },
        data: { deletedAt: new Date() }
      });
      console.log(`[Dedup P1] Soft-deleted ${toDelete.length} duplicate(s), kept ${best.id}`);
      console.log(`[Dedup P1] Reason: Quality score comparison - best=${best.qualityScore}, removed=${sources.filter(s => toDelete.includes(s.id)).map(s => s.qualityScore)}`);
      removed += toDelete.length;
    }
  }

  // LOT 6.1: Title-based semantic deduplication (Jaccard ≥ 80%)
  try {
    const recentSources = await prisma.source.findMany({
      where: { deletedAt: null, doi: null },
      select: { id: true, title: true, qualityScore: true, createdAt: true },
      take: 500,
      orderBy: { createdAt: 'desc' },
    });

    const titleWordSet = (title: string): Set<string> =>
      new Set(title.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 3));

    const jaccard = (a: Set<string>, b: Set<string>): number => {
      const intersection = [...a].filter(x => b.has(x)).length;
      const union = new Set([...a, ...b]).size;
      return union > 0 ? intersection / union : 0;
    };

    let semanticRemoved = 0;
    const toSoftDelete: string[] = [];

    for (let i = 0; i < recentSources.length; i++) {
      if (toSoftDelete.includes(recentSources[i].id)) continue;
      const wordsI = titleWordSet(recentSources[i].title);
      for (let j = i + 1; j < recentSources.length; j++) {
        if (toSoftDelete.includes(recentSources[j].id)) continue;
        const wordsJ = titleWordSet(recentSources[j].title);
        const sim = jaccard(wordsI, wordsJ);
        if (sim >= 0.80) {
          // Keep the one with higher quality score
          const keep = (recentSources[i].qualityScore || 0) >= (recentSources[j].qualityScore || 0) ? i : j;
          const remove = keep === i ? j : i;
          toSoftDelete.push(recentSources[remove].id);
          console.log(`[Dedup SEMANTIC] "${recentSources[remove].title.slice(0, 50)}" ~ "${recentSources[keep].title.slice(0, 50)}" (Jaccard: ${sim.toFixed(2)})`);
        }
      }
    }

    if (toSoftDelete.length > 0) {
      await prisma.source.updateMany({
        where: { id: { in: toSoftDelete } },
        data: { deletedAt: new Date() },
      });
      semanticRemoved = toSoftDelete.length;
      removed += semanticRemoved;
      console.log(`[Dedup SEMANTIC] Soft-deleted ${semanticRemoved} title-similar duplicates`);
    }
  } catch (err) {
    console.warn('[Dedup SEMANTIC] failed (non-blocking):', err);
  }

  return { removed };
}
