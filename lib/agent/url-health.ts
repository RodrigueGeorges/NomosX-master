/**
 * URL Health — the urlhealth pattern (arXiv 2604.03173).
 *
 * 3–13% of citation URLs produced by deep-research agents are hallucinated
 * (no Wayback record, never existed); 5–18% don't resolve at all. A cheap
 * liveness + Wayback check catches both, and is the difference between
 * "citations look real" and "citations are real".
 *
 * Runs post-render on the sources that were actually cited — not the whole
 * pool — so the cost is bounded (~≤25 URLs).
 */

import { assertExecutionActive } from '../worker/execution-scope';

export interface UrlHealthResult {
  checked: number;
  alive: number;
  dead: number;
  /** dead at origin but an archived snapshot exists */
  waybackRescued: number;
  /** dead with no archived snapshot — likely hallucinated/rotten */
  unrecoverable: string[];
  durationMs: number;
}

const MAX_URLS = 25;
const CONCURRENCY = 5;
const FETCH_TIMEOUT_MS = 6000;

async function probeUrl(url: string): Promise<'alive' | 'dead'> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    // HEAD first; some hosts 405 it — fall back to GET
    let res = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'User-Agent': 'NomosX-URLCheck/1.0' },
    }).catch(() => null);
    if (!res || res.status === 405 || res.status === 501) {
      res = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        signal: controller.signal,
        headers: { 'User-Agent': 'NomosX-URLCheck/1.0' },
      }).catch(() => null);
    }
    clearTimeout(timer);
    if (!res) return 'dead';
    return res.status < 400 ? 'alive' : 'dead';
  } catch {
    return 'dead';
  }
}

async function hasWaybackSnapshot(url: string): Promise<boolean> {
  try {
    const res = await fetch(
      `https://archive.org/wayback/available?url=${encodeURIComponent(url)}`,
      { signal: AbortSignal.timeout(5000) },
    );
    if (!res.ok) return false;
    const data = await res.json() as { archived_snapshots?: { closest?: { url?: string } } };
    return Boolean(data?.archived_snapshots?.closest?.url);
  } catch {
    return false;
  }
}

/**
 * Check liveness of the URLs that were actually cited in the rendered HTML.
 * `citationNumbers` = the [SRC-N] indices present in the output.
 */
export async function checkCitedUrlHealth(
  citationNumbers: number[],
  topSources: Array<{ url?: string | null }>,
): Promise<UrlHealthResult> {
  const start = Date.now();
  const urls = [...new Set(citationNumbers)]
    .map(n => ({ n, url: topSources[n - 1]?.url }))
    .filter((x): x is { n: number; url: string } => typeof x.url === 'string' && x.url.startsWith('http'))
    .slice(0, MAX_URLS);

  const result: UrlHealthResult = {
    checked: urls.length,
    alive: 0,
    dead: 0,
    waybackRescued: 0,
    unrecoverable: [],
    durationMs: 0,
  };

  // Bounded-concurrency probe. Abort early when the execution scope is dead:
  // probes merged with an aborted signal all return 'dead' instantly, which
  // would otherwise persist a false "0/N alive — all unrecoverable" metric
  // (observed in the S38 paid run after the pipeline deadline fired).
  for (let i = 0; i < urls.length; i += CONCURRENCY) {
    assertExecutionActive();
    const batch = urls.slice(i, i + CONCURRENCY);
    const probes = await Promise.all(batch.map(u => probeUrl(u.url)));
    const deadUrls = batch.filter((_, j) => probes[j] === 'dead').map(u => u.url);
    result.alive += probes.filter(p => p === 'alive').length;
    result.dead += deadUrls.length;
    // Wayback rescue check on dead URLs only (cap 8 — archive.org is slow)
    for (const deadUrl of deadUrls.slice(0, 8)) {
      if (await hasWaybackSnapshot(deadUrl)) {
        result.waybackRescued++;
      } else {
        result.unrecoverable.push(deadUrl);
      }
    }
    if (deadUrls.length > 8) {
      result.unrecoverable.push(...deadUrls.slice(8));
    }
  }

  result.durationMs = Date.now() - start;
  return result;
}
