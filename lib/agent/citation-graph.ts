/**
 * Citation Graph Traversal — finds hub papers and bridge papers.
 *
 * After the initial source collection, this module traverses the citation graph
 * to find:
 * 1. HUB PAPERS: Sources cited by many of the collected sources (foundational work)
 * 2. BRIDGE PAPERS: Sources that connect different clusters (interdisciplinary)
 * 3. CLUSTERS: Groups of sources that cite each other (schools of thought)
 *
 * This is the Paper Circle (ACL 2026) pattern: use the citation network
 * to discover important sources that keyword search misses.
 *
 * Data source: OpenAlex API (free, no key needed, provides referenced_works)
 */

import { httpGet } from '../http-client';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CitationNode {
  sourceId: string; // NomosX source ID
  openalexId?: string;
  title: string;
  doi?: string | null;
  citationCount: number;
  referencedWorkIds: string[]; // OpenAlex IDs of cited works
}

export interface HubPaper {
  openalexId: string;
  title: string;
  doi?: string | null;
  citationCount: number;
  inDegree: number; // How many of our sources cite this paper
  isHub: true;
}

export interface BridgePaper {
  openalexId: string;
  title: string;
  doi?: string | null;
  connectsClusters: number; // How many distinct clusters it connects
  isBridge: true;
}

export interface CitationCluster {
  id: string;
  sourceIds: string[];
  centroidTitle: string;
  size: number;
}

export interface CitationGraphResult {
  hubs: HubPaper[];
  bridges: BridgePaper[];
  clusters: CitationCluster[];
  newSourceIds: string[]; // IDs of hub/bridge papers added to the pool
  totalNodes: number;
  totalEdges: number;
}

// ─── OpenAlex Citation Fetching ─────────────────────────────────────────────

/**
 * Fetch referenced works (outgoing citations) for an OpenAlex work ID.
 * OpenAlex API: https://api.openalex.org/works/{id}
 * Returns up to 200 referenced_works IDs.
 */
async function fetchReferencedWorks(openalexId: string): Promise<string[]> {
  try {
    const url = `https://api.openalex.org/works/${openalexId}?select=referenced_works`;
    const data = await httpGet<any>(url, { timeout: 10000 });
    return (data.referenced_works || []).slice(0, 200);
  } catch {
    return [];
  }
}

/**
 * Fetch work metadata for an OpenAlex work ID.
 */
async function fetchWorkMetadata(openalexId: string): Promise<{ title: string; doi?: string; citedByCount: number } | null> {
  try {
    const url = `https://api.openalex.org/works/${openalexId}?select=title,doi,cited_by_count`;
    const data = await httpGet<any>(url, { timeout: 10000 });
    return {
      title: data.title || '',
      doi: data.doi?.replace('https://doi.org/', '') || undefined,
      citedByCount: data.cited_by_count || 0,
    };
  } catch {
    return null;
  }
}

// ─── Hub Detection ──────────────────────────────────────────────────────────

/**
 * Find hub papers — works that are cited by many of our collected sources.
 *
 * A hub paper is one that appears in the referenced_works of multiple sources.
 * These are typically foundational papers in the field.
 *
 * Algorithm:
 * 1. For each source with an OpenAlex ID, fetch its referenced_works
 * 2. Count how many sources reference each work (in-degree)
 * 3. Works with in-degree >= 3 are hubs
 */
export async function findHubPapers(
  sources: Array<{ sourceId: string; openalexId?: string; title: string; doi?: string | null }>,
  minInDegree: number = 3,
  maxHubs: number = 10,
): Promise<HubPaper[]> {
  // Extract OpenAlex IDs from sources
  const openalexSources = sources.filter(s => s.openalexId);
  if (openalexSources.length === 0) {
    // Try to extract from DOI — OpenAlex IDs can be derived
    // For now, skip if no OpenAlex IDs
    console.log('[CitationGraph] No OpenAlex IDs found, skipping hub detection');
    return [];
  }

  console.log(`[CitationGraph] Fetching referenced works for ${openalexSources.length} sources...`);

  // Fetch referenced works in parallel (batched to avoid rate limits)
  const BATCH = 10;
  const referenceMap = new Map<string, Set<string>>(); // sourceId → Set of referenced work IDs

  for (let i = 0; i < openalexSources.length; i += BATCH) {
    const batch = openalexSources.slice(i, i + BATCH);
    const results = await Promise.allSettled(
      batch.map(async (s) => {
        const refs = await fetchReferencedWorks(s.openalexId!);
        return { sourceId: s.sourceId, refs };
      }),
    );

    for (const r of results) {
      if (r.status === 'fulfilled') {
        referenceMap.set(r.value.sourceId, new Set(r.value.refs));
      }
    }

    // Rate limit: 10 requests per second
    if (i + BATCH < openalexSources.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  // Count in-degree for each referenced work
  const inDegreeMap = new Map<string, number>();
  for (const refs of referenceMap.values()) {
    for (const refId of refs) {
      inDegreeMap.set(refId, (inDegreeMap.get(refId) || 0) + 1);
    }
  }

  // Filter to hubs (in-degree >= minInDegree)
  const hubIds = Array.from(inDegreeMap.entries())
    .filter(([_, inDegree]) => inDegree >= minInDegree)
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxHubs)
    .map(([id, inDegree]) => ({ id, inDegree }));

  console.log(`[CitationGraph] Found ${hubIds.length} hub papers (in-degree >= ${minInDegree})`);

  // Fetch metadata for hub papers
  const hubs: HubPaper[] = [];
  for (const hub of hubIds) {
    const metadata = await fetchWorkMetadata(hub.id);
    if (metadata) {
      hubs.push({
        openalexId: hub.id,
        title: metadata.title,
        doi: metadata.doi,
        citationCount: metadata.citedByCount,
        inDegree: hub.inDegree,
        isHub: true,
      });
    }
  }

  return hubs;
}

// ─── Cluster Detection (simplified) ─────────────────────────────────────────

/**
 * Detect clusters of sources using co-citation similarity.
 *
 * Two sources are in the same cluster if they share many referenced works
 * (co-citation). This identifies "schools of thought".
 *
 * Uses a simple greedy clustering algorithm:
 * 1. Compute Jaccard similarity between all pairs of sources (based on referenced works)
 * 2. Group sources with similarity > threshold
 */
export function detectClusters(
  referenceMap: Map<string, Set<string>>,
  sourceTitles: Map<string, string>,
  similarityThreshold: number = 0.3,
): CitationCluster[] {
  const sourceIds = Array.from(referenceMap.keys());
  if (sourceIds.length < 2) return [];

  // Compute pairwise Jaccard similarity
  const similarityMatrix = new Map<string, number>();
  for (let i = 0; i < sourceIds.length; i++) {
    for (let j = i + 1; j < sourceIds.length; j++) {
      const a = referenceMap.get(sourceIds[i])!;
      const b = referenceMap.get(sourceIds[j])!;
      const intersection = new Set([...a].filter(x => b.has(x)));
      const union = new Set([...a, ...b]);
      const jaccard = union.size > 0 ? intersection.size / union.size : 0;
      if (jaccard >= similarityThreshold) {
        const key = `${sourceIds[i]}|${sourceIds[j]}`;
        similarityMatrix.set(key, jaccard);
      }
    }
  }

  // Greedy clustering: union-find
  const parent = new Map<string, string>();
  for (const id of sourceIds) parent.set(id, id);

  function find(x: string): string {
    if (parent.get(x) === x) return x;
    const root = find(parent.get(x)!);
    parent.set(x, root);
    return root;
  }

  function union(x: string, y: string) {
    const px = find(x);
    const py = find(y);
    if (px !== py) parent.set(px, py);
  }

  for (const [key, _] of similarityMatrix) {
    const [a, b] = key.split('|');
    union(a, b);
  }

  // Build clusters
  const clusterMap = new Map<string, string[]>();
  for (const id of sourceIds) {
    const root = find(id);
    if (!clusterMap.has(root)) clusterMap.set(root, []);
    clusterMap.get(root)!.push(id);
  }

  const clusters: CitationCluster[] = [];
  let clusterIdx = 0;
  for (const [root, members] of clusterMap) {
    if (members.length < 2) continue; // Skip singleton clusters
    clusters.push({
      id: `cluster_${clusterIdx++}`,
      sourceIds: members,
      centroidTitle: sourceTitles.get(root) || '',
      size: members.length,
    });
  }

  return clusters.sort((a, b) => b.size - a.size);
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Run citation graph traversal on a set of sources.
 *
 * @param sources - Sources to analyze (must have openalexId or doi)
 * @returns Hubs, bridges, clusters, and new source IDs to add to the pool
 */
export async function traverseCitationGraph(
  sources: Array<{ sourceId: string; openalexId?: string; title: string; doi?: string | null }>,
): Promise<CitationGraphResult> {
  console.log(`[CitationGraph] Traversing citation graph for ${sources.length} sources...`);

  // Find hub papers
  const hubs = await findHubPapers(sources);

  // For cluster detection, we need the reference map
  // Reuse the data from hub detection (but we don't have it here — re-fetch for simplicity)
  // In production, this would be cached
  const referenceMap = new Map<string, Set<string>>();
  const sourceTitles = new Map<string, string>();
  const openalexSources = sources.filter(s => s.openalexId);

  for (let i = 0; i < Math.min(openalexSources.length, 50); i += 10) {
    const batch = openalexSources.slice(i, Math.min(i + 10, 50));
    const results = await Promise.allSettled(
      batch.map(async (s) => {
        const refs = await fetchReferencedWorks(s.openalexId!);
        return { sourceId: s.sourceId, refs, title: s.title };
      }),
    );
    for (const r of results) {
      if (r.status === 'fulfilled') {
        referenceMap.set(r.value.sourceId, new Set(r.value.refs));
        sourceTitles.set(r.value.sourceId, r.value.title);
      }
    }
  }

  const clusters = detectClusters(referenceMap, sourceTitles);

  // Bridge papers: works that appear in multiple clusters' reference sets
  const clusterReferenceSets = clusters.map(c => {
    const refs = new Set<string>();
    for (const sourceId of c.sourceIds) {
      const sourceRefs = referenceMap.get(sourceId);
      if (sourceRefs) for (const r of sourceRefs) refs.add(r);
    }
    return refs;
  });

  const bridgeInDegree = new Map<string, number>();
  for (let i = 0; i < clusterReferenceSets.length; i++) {
    for (let j = i + 1; j < clusterReferenceSets.length; j++) {
      const intersection = new Set([...clusterReferenceSets[i]].filter(x => clusterReferenceSets[j].has(x)));
      for (const id of intersection) {
        bridgeInDegree.set(id, (bridgeInDegree.get(id) || 0) + 1);
      }
    }
  }

  const bridgeIds = Array.from(bridgeInDegree.entries())
    .filter(([_, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const bridges: BridgePaper[] = [];
  for (const [id, count] of bridgeIds) {
    const metadata = await fetchWorkMetadata(id);
    if (metadata) {
      bridges.push({
        openalexId: id,
        title: metadata.title,
        doi: metadata.doi,
        connectsClusters: count,
        isBridge: true,
      });
    }
  }

  // New source IDs: hubs and bridges that aren't already in the pool
  const existingDois = new Set(sources.map(s => s.doi?.toLowerCase()).filter(Boolean));
  const newSourceIds: string[] = [];

  for (const hub of hubs) {
    if (hub.doi && !existingDois.has(hub.doi.toLowerCase())) {
      newSourceIds.push(`openalex:${hub.openalexId}`);
    }
  }
  for (const bridge of bridges) {
    if (bridge.doi && !existingDois.has(bridge.doi.toLowerCase())) {
      newSourceIds.push(`openalex:${bridge.openalexId}`);
    }
  }

  const totalEdges = Array.from(referenceMap.values()).reduce((sum, refs) => sum + refs.size, 0);

  console.log(`[CitationGraph] Found ${hubs.length} hubs, ${bridges.length} bridges, ${clusters.length} clusters, +${newSourceIds.length} new sources`);

  return {
    hubs,
    bridges,
    clusters,
    newSourceIds,
    totalNodes: sources.length,
    totalEdges,
  };
}
