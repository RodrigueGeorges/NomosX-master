/**
 * SCOUT ENRICHMENT + INDEX — the zone between the raw scout fan-out and the
 * rank: web fallback (only when critically low on sources), intelligent
 * scout (multi-lens), citation graph traversal, durable checkpoint, then
 * INDEX → EMBED → DEDUPLICATE.
 *
 * Perf: the eight web-fallback providers run concurrently — each only
 * contributes source ids; results are appended in deterministic provider
 * order after the barrier.
 */

import { prisma } from '../../db';
import { searchLinkUp } from '../../providers/linkup-sdk';
import { searchTavily, searchTavilyNews } from '../../providers/tavily-provider';
import { searchExaPublications } from '../../providers/exa-provider';
import { searchAPITube } from '../../providers/apitube-provider';
import { searchOSTI } from '../../providers/osti-provider';
import { searchDataCite } from '../../providers/datacite-provider';
import { embedSourcesBatch } from '../semantic-engine';
import { deduplicateSources } from '../index-agent';
import type { Providers } from './provider-lists';

export interface ScoutEnrichmentIndexDeps {
  allSourceIds: string[];
  query: string;
  label: string;
  stats: Record<string, any>;
  /** true when resuming from a durable scout checkpoint — enrichment skipped */
  scoutCkpt: boolean;
  format: 'strategic' | 'dossier' | 'memo' | 'brief';
  domain: string;
  scout: (q: string, provs: Providers, perProv: number) => Promise<any>;
  durableKey: string | null;
  saveDurableStep: (key: string, step: string, payload: any) => Promise<unknown>;
  index: (ids: string[]) => Promise<any>;
}

export async function runScoutEnrichmentAndIndex(deps: ScoutEnrichmentIndexDeps): Promise<string[]> {
  const { query, label, stats, scoutCkpt, format, domain, scout, durableKey, saveDurableStep, index } = deps;
  let allSourceIds = deps.allSourceIds;

  // ── FINAL FALLBACK: if still critically low on sources, do a direct web search ──
  if (allSourceIds.length < 5) {
    console.log(`${label} WEB FALLBACK: only ${allSourceIds.length} sources — searching web for raw question`);
    // Independent provider searches — concurrent; ids appended in fixed order.
    const results = await Promise.allSettled([
      searchLinkUp(query, 20),
      searchTavily(query, 20, { topic: 'general' }),
      searchTavilyNews(query, 10),
      searchExaPublications(query, 20),
      (async () => (await import('../../providers/news-scout-providers')).searchGDELTNews(query, 20))(),
      searchAPITube(query, 20),
      searchOSTI(query, 20),
      searchDataCite(query, 15),
    ]);
    const labels = ['linkup', 'tavily', 'tavily news', 'exa', 'gdelt', 'apitube', 'osti', 'datacite'];
    results.forEach((r, i) => {
      if (r.status === 'fulfilled' && r.value.length > 0) {
        const ids = r.value.map((s: any) => s.id);
        allSourceIds.push(...ids);
        console.log(`${label} WEB FALLBACK: ${labels[i]} returned ${ids.length} sources`);
      } else if (r.status === 'rejected') {
        console.warn(`${label} WEB FALLBACK: ${labels[i]} failed (non-blocking):`, r.reason);
      }
    });
  }

  // ── INTELLIGENT SCOUT: Multi-lens eclectic enrichment ──
  // Adds sources from 6 strategic lenses (core, contrarian, cross-domain, historical, weak signal, scenario)
  // Uses UCB1 bandit for budget allocation + adaptive search depth (AutoSearch pattern)
  // This is what makes NomosX a think tank, not a search engine: it finds dissent, analogues, and weak signals
  // (skipped on durable resume — the scout checkpoint already includes enrichment)
  if (!scoutCkpt) try {
    const { runIntelligentScout } = await import('../intelligent-scout');

    // Wrapper: delegate to existing scout() and return normalized sources
    const intelligentSearchFn = async (q: string, provs: string[], perProv: number) => {
      const result = await scout(q, provs as Providers, perProv);
      const sourceIds = Array.isArray(result) ? result.map(s => s.id) : (result.sourceIds || []);
      if (sourceIds.length === 0) return [];
      // Fetch source details from DB
      const sources = await prisma.source.findMany({
        where: { id: { in: sourceIds } },
        select: { id: true, title: true, abstract: true, provider: true, year: true, doi: true, citationCount: true, qualityScore: true, noveltyScore: true },
      });
      return sources.map(s => ({
        id: s.id,
        title: s.title,
        abstract: s.abstract,
        provider: s.provider,
        year: s.year,
        doi: s.doi,
        citationCount: s.citationCount,
        qualityScore: s.qualityScore ?? undefined,
        noveltyScore: s.noveltyScore ?? undefined,
      }));
    };

    const eclecticResult = await runIntelligentScout(query, domain, format, intelligentSearchFn);
    const eclecticIds = eclecticResult.allSources.map(s => s.id);
    const beforeCount = allSourceIds.length;
    allSourceIds = [...new Set([...allSourceIds, ...eclecticIds])];
    const addedCount = allSourceIds.length - beforeCount;

    console.log(`${label} INTELLIGENT SCOUT: +${addedCount} eclectic sources (${eclecticResult.uniqueSources} from ${eclecticResult.lenses.length} lenses, diversity=${Math.round(eclecticResult.diversityScore * 100)}%, scenarioRichness=${Math.round(eclecticResult.scenarioRichness * 100)}%)`);
    console.log(`${label} INTELLIGENT SCOUT lenses: ${eclecticResult.lenses.map(l => `${l.type}(${l.sources.length})`).join(', ')}`);

    // ── LENS INSIGHTS → ANALYST CONTEXT ──
    // Each lens produced a PhD-level mini-analysis. Inject them so the
    // analyst sees the disciplinary readings, not just the raw sources.
    if (eclecticResult.lensInsights && eclecticResult.lensInsights.length > 0) {
      const tensionSection = eclecticResult.lensTensions && eclecticResult.lensTensions.length > 0
        ? [
            '',
            '## INTER-LENS TENSIONS — GENUINE DISAGREEMENTS BETWEEN READINGS',
            'These are real axes of debate between disciplinary perspectives. Do NOT flatten them into consensus — either arbitrate with evidence or present the disagreement as a finding itself.',
            ...eclecticResult.lensTensions.map(t =>
              `- ${t.between}: ${t.tension}\n  Weighting advice: ${t.resolution}`
            ),
          ].join('\n')
        : '';
      const insightsBlock = [
        '## LENS INTELLIGENCE — DISCIPLINARY READINGS',
        'Each analytical lens produced its own expert reading of the question. Use these as specialized perspectives — the ontological lens excavates assumptions, the dissident lens surfaces excluded voices, the historical lens names precedents. Integrate them; do not flatten them into consensus.',
        '',
        ...eclecticResult.lensInsights.map(i =>
          `### ${i.lensType.toUpperCase().replace(/_/g, ' ')}\n${i.analysis}\nKey contribution: ${i.keyContribution}${i.knowledgeGaps.length > 0 ? `\nOpen gaps: ${i.knowledgeGaps.join('; ')}` : ''}`
        ),
        tensionSection,
      ].join('\n');
      // Store for injection into the analyst context block (assembled later)
      (stats as any).lensInsightsBlock = insightsBlock;
      (stats as any).lensTensions = eclecticResult.lensTensions?.length ?? 0;
      console.log(`${label} LENS INTELLIGENCE: ${eclecticResult.lensInsights.length} disciplinary analyses${eclecticResult.lensTensions?.length ? `, ${eclecticResult.lensTensions.length} inter-lens tensions` : ''}`);
    }

    stats.intelligentScout = {
      lenses: eclecticResult.lenses.map(l => ({ type: l.type, sources: l.sources.length, yield: l.yield })),
      totalSources: eclecticResult.totalSources,
      uniqueSources: eclecticResult.uniqueSources,
      diversityScore: eclecticResult.diversityScore,
      consensusScore: eclecticResult.consensusScore,
      scenarioRichness: eclecticResult.scenarioRichness,
      adaptiveDepth: eclecticResult.adaptiveDepth,
      costUsd: eclecticResult.costUsd,
      durationMs: eclecticResult.durationMs,
    };
  } catch (err) {
    console.warn(`${label} INTELLIGENT SCOUT: failed (non-blocking, continuing with existing sources):`, err instanceof Error ? err.message : String(err));
  }

  // ── CITATION GRAPH TRAVERSAL: Find hub + bridge papers ──
  // Traverses the citation network to discover foundational papers (hubs)
  // and interdisciplinary connectors (bridges) that keyword search misses.
  // This is the Paper Circle (ACL 2026) pattern.
  if (!scoutCkpt) try {
    const { traverseCitationGraph } = await import('../citation-graph');
    // Get OpenAlex IDs for the top sources (by quality score)
    const topForGraph = await prisma.source.findMany({
      where: { id: { in: allSourceIds.slice(0, 50) } },
      select: { id: true, title: true, doi: true, raw: true, provider: true },
      take: 30,
    });

    const graphSources = topForGraph.map(s => {
      // Extract OpenAlex ID from raw data or source ID
      const raw = s.raw as any;
      const openalexId = s.id.startsWith('openalex:') ? s.id.replace('openalex:', '') : raw?.id?.replace('https://openalex.org/', '');
      return {
        sourceId: s.id,
        openalexId: openalexId || undefined,
        title: s.title,
        doi: s.doi,
      };
    }).filter(s => s.openalexId);

    if (graphSources.length >= 5) {
      const graphResult = await traverseCitationGraph(graphSources);
      const beforeGraph = allSourceIds.length;
      allSourceIds = [...new Set([...allSourceIds, ...graphResult.newSourceIds])];
      const addedByGraph = allSourceIds.length - beforeGraph;

      console.log(`${label} CITATION GRAPH: +${addedByGraph} sources (${graphResult.hubs.length} hubs, ${graphResult.bridges.length} bridges, ${graphResult.clusters.length} clusters)`);

      stats.citationGraph = {
        hubs: graphResult.hubs.length,
        bridges: graphResult.bridges.length,
        clusters: graphResult.clusters.length,
        newSources: addedByGraph,
        totalNodes: graphResult.totalNodes,
        totalEdges: graphResult.totalEdges,
      };
    }
  } catch (err) {
    console.warn(`${label} CITATION GRAPH: failed (non-blocking):`, err instanceof Error ? err.message : String(err));
  }

  // DURABLE CHECKPOINT: allSourceIds is final (scout + re-scout + intelligent
  // scout + citation graph all done). A resume re-enters via seedIds and skips
  // the whole provider fan-out.
  if (durableKey && !scoutCkpt && allSourceIds.length > 0) {
    await saveDurableStep(durableKey, 'scout', { allSourceIds });
  }

  console.log(`${label} INDEX: ${allSourceIds.length} sources`);
  const indexResult = await index(allSourceIds);
  stats.index = indexResult;

  // ── STEP 2b: EMBED (semantic vectors) ──
  console.log(`${label} EMBED: generating semantic vectors...`);
  try {
    const embedResult = await embedSourcesBatch(allSourceIds);
    stats.embed = embedResult;
    console.log(`${label} EMBED: ${embedResult.embedded} new, ${embedResult.skipped} cached`);
  } catch (err) {
    console.warn(`${label} EMBED: failed (non-blocking):`, err);
    stats.embed = { error: String(err) } as any;
  }

  // ── STEP 3: DEDUPLICATE ──
  console.log(`${label} DEDUPLICATE`);
  const dedupeResult = await deduplicateSources();
  stats.dedupe = dedupeResult;

  return allSourceIds;
}
