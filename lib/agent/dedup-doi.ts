/**
 * DOI-First Deduplication with Union-Find Clustering
 *
 * Inspired by BibFusion (2026) and risforge (2026):
 * - DOI-first matching cascade with conservative fallbacks
 * - Union-find for transitive clustering (A=B, B=C → A=B=C)
 * - Zero data loss on merge: best record is base, others supplement
 *
 * Cascade:
 *   1. DOI exact match (100% confidence)
 *   2. Normalized title + first-author surname match (99% confidence)
 *   3. Fuzzy title similarity ≥90% + year validation (90% confidence)
 *
 * Non-destructive merge: the most complete record (longest abstract, most
 * metadata fields) is used as base, and every other record in the cluster
 * supplements it with whatever fields it has that the base is missing.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DedupSource {
  id: string;
  title: string;
  doi?: string | null;
  abstract?: string | null;
  authors?: Array<{ name: string }> | string[] | null;
  year?: number | null;
  url?: string | null;
  pdfUrl?: string | null;
  citationCount?: number | null;
  provider?: string;
  [key: string]: any;
}

export interface DedupResult<T extends DedupSource> {
  deduplicated: T[];
  removed: number;
  clusters: number;
  auditTrail: Array<{ kept: string; removed: string[]; method: string }>;
}

// ─── Union-Find ──────────────────────────────────────────────────────────────

class UnionFind {
  private parent: Map<number, number> = new Map();
  private rank: Map<number, number> = new Map();

  find(x: number): number {
    if (!this.parent.has(x)) {
      this.parent.set(x, x);
      this.rank.set(x, 0);
      return x;
    }
    let root = x;
    while (this.parent.get(root)! !== root) {
      root = this.parent.get(root)!;
    }
    // Path compression
    let curr = x;
    while (this.parent.get(curr)! !== root) {
      const next = this.parent.get(curr)!;
      this.parent.set(curr, root);
      curr = next;
    }
    return root;
  }

  union(a: number, b: number): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra === rb) return;
    const rankA = this.rank.get(ra) || 0;
    const rankB = this.rank.get(rb) || 0;
    if (rankA < rankB) {
      this.parent.set(ra, rb);
    } else if (rankA > rankB) {
      this.parent.set(rb, ra);
    } else {
      this.parent.set(rb, ra);
      this.rank.set(ra, rankA + 1);
    }
  }

  clusters(n: number): Map<number, number[]> {
    const groups = new Map<number, number[]>();
    for (let i = 0; i < n; i++) {
      const root = this.find(i);
      if (!groups.has(root)) groups.set(root, []);
      groups.get(root)!.push(i);
    }
    return groups;
  }
}

// ─── Normalization ────────────────────────────────────────────────────────────

function normalizeDOI(doi: string | null | undefined): string | null {
  if (!doi) return null;
  let d = doi.trim().toLowerCase();
  // Strip common prefixes
  d = d.replace(/^https?:\/\/(dx\.)?doi\.org\//, '');
  d = d.replace(/^doi:\s*/, '');
  // Remove trailing whitespace/punctuation
  d = d.replace(/[\s.]+$/, '');
  return d || null;
}

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // strip diacritics
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 120);
}

function getFirstAuthorSurname(source: DedupSource): string | null {
  const authors = source.authors;
  if (!authors || authors.length === 0) return null;
  const first = authors[0];
  const name = typeof first === 'string' ? first : first?.name;
  if (!name) return null;
  // Extract surname: last word, or first word before comma
  const parts = name.split(/[,\s]+/).filter(Boolean);
  if (parts.length === 0) return null;
  // If format is "Smith, John", surname is parts[0]
  // If format is "John Smith", surname is parts[parts.length - 1]
  const surname = name.includes(',') ? parts[0] : parts[parts.length - 1];
  return surname.toLowerCase().replace(/[^a-z]/g, '').slice(0, 20);
}

// ─── Fuzzy Title Similarity (Jaccard on character trigrams) ───────────────────

function trigramSet(s: string): Set<string> {
  const set = new Set<string>();
  for (let i = 0; i <= s.length - 3; i++) {
    set.add(s.slice(i, i + 3));
  }
  return set;
}

function jaccardSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const setA = trigramSet(a);
  const setB = trigramSet(b);
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const t of setA) {
    if (setB.has(t)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return intersection / union;
}

// ─── Completeness Score (for selecting base record) ───────────────────────────

function completenessScore(s: DedupSource): number {
  let score = 0;
  if (s.title) score += 2;
  if (s.abstract && s.abstract.length > 100) score += Math.min(s.abstract.length / 100, 10);
  if (s.doi) score += 3;
  if (s.authors && s.authors.length > 0) score += 2;
  if (s.year) score += 1;
  if (s.url) score += 1;
  if (s.pdfUrl) score += 1;
  if (s.citationCount != null) score += 1;
  return score;
}

// ─── Non-destructive Merge ────────────────────────────────────────────────────

function mergeSources<T extends DedupSource>(base: T, others: T[]): T {
  const merged: Record<string, any> = { ...base };
  for (const other of others) {
    // Only fill missing fields — never overwrite existing ones
    if (!merged.abstract && other.abstract) merged.abstract = other.abstract;
    if (!merged.doi && other.doi) merged.doi = other.doi;
    if (!merged.year && other.year) merged.year = other.year;
    if (!merged.url && other.url) merged.url = other.url;
    if (!merged.pdfUrl && other.pdfUrl) merged.pdfUrl = other.pdfUrl;
    if (merged.citationCount == null && other.citationCount != null) {
      merged.citationCount = other.citationCount;
    }
    if (!merged.authors || merged.authors.length === 0) {
      if (other.authors && other.authors.length > 0) merged.authors = other.authors;
    }
    // Merge any other custom fields that base is missing
    for (const key of Object.keys(other)) {
      if (key === 'id' || key === 'title' || key === 'provider') continue;
      if (merged[key] == null && (other as Record<string, any>)[key] != null) {
        merged[key] = (other as Record<string, any>)[key];
      }
    }
  }
  return merged as T;
}

// ─── Main Deduplication Function ──────────────────────────────────────────────

export function dedupSources<T extends DedupSource>(sources: T[]): DedupResult<T> {
  const n = sources.length;
  if (n <= 1) {
    return { deduplicated: sources, removed: 0, clusters: n, auditTrail: [] };
  }

  const uf = new UnionFind();
  const matchMethods: Map<string, string> = new Map(); // "i-j" → method

  // Pre-compute normalized fields
  const normDOIs = sources.map(s => normalizeDOI(s.doi));
  const normTitles = sources.map(s => normalizeTitle(s.title || ''));
  const authorSurnames = sources.map(s => getFirstAuthorSurname(s));

  // ── Tier 1: DOI exact match ──────────────────────────────────────────────
  const doiMap = new Map<string, number[]>();
  for (let i = 0; i < n; i++) {
    const doi = normDOIs[i];
    if (!doi) continue;
    if (!doiMap.has(doi)) doiMap.set(doi, []);
    doiMap.get(doi)!.push(i);
  }
  for (const indices of doiMap.values()) {
    for (let k = 1; k < indices.length; k++) {
      uf.union(indices[0], indices[k]);
      matchMethods.set(`${indices[0]}-${indices[k]}`, 'doi-exact');
    }
  }

  // ── Tier 2: Normalized title + first-author surname ──────────────────────
  const titleAuthorMap = new Map<string, number[]>();
  for (let i = 0; i < n; i++) {
    if (!normTitles[i]) continue;
    const surname = authorSurnames[i] || '';
    const key = `${normTitles[i]}|${surname}`;
    if (!titleAuthorMap.has(key)) titleAuthorMap.set(key, []);
    titleAuthorMap.get(key)!.push(i);
  }
  for (const indices of titleAuthorMap.values()) {
    for (let k = 1; k < indices.length; k++) {
      if (uf.find(indices[0]) !== uf.find(indices[k])) {
        uf.union(indices[0], indices[k]);
        matchMethods.set(`${indices[0]}-${indices[k]}`, 'title+author');
      }
    }
  }

  // ── Tier 3: Fuzzy title similarity ≥90% + year validation ────────────────
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (uf.find(i) === uf.find(j)) continue; // already matched
      const sim = jaccardSimilarity(normTitles[i], normTitles[j]);
      if (sim >= 0.90) {
        // Year validation: must be same or within 1 year
        const yi = sources[i].year;
        const yj = sources[j].year;
        if (yi && yj && Math.abs(yi - yj) > 1) continue;
        uf.union(i, j);
        matchMethods.set(`${i}-${j}`, `fuzzy-title(${(sim * 100).toFixed(0)}%)`);
      }
    }
  }

  // ── Build clusters and merge ──────────────────────────────────────────────
  const clusters = uf.clusters(n);
  const deduplicated: T[] = [];
  const auditTrail: Array<{ kept: string; removed: string[]; method: string }> = [];
  let removedCount = 0;

  for (const indices of clusters.values()) {
    if (indices.length === 1) {
      deduplicated.push(sources[indices[0]]);
      continue;
    }

    // Sort by completeness score (descending) — most complete is base
    indices.sort((a, b) => completenessScore(sources[b]) - completenessScore(sources[a]));
    const baseIdx = indices[0];
    const otherIndices = indices.slice(1);

    // Collect match methods for audit
    const methods = otherIndices
      .map(idx => matchMethods.get(`${Math.min(baseIdx, idx)}-${Math.max(baseIdx, idx)}`) || 'transitive')
      .filter(Boolean);

    const merged = mergeSources(sources[baseIdx], otherIndices.map(i => sources[i]));
    deduplicated.push(merged);
    removedCount += otherIndices.length;

    auditTrail.push({
      kept: sources[baseIdx].id,
      removed: otherIndices.map(i => sources[i].id),
      method: methods[0] || 'transitive',
    });
  }

  return {
    deduplicated,
    removed: removedCount,
    clusters: clusters.size,
    auditTrail,
  };
}
