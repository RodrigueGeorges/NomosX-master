/**
 * OpenAlex Institution Resolver
 *
 * Many institutional providers (OECD, WorldBank, IMF, NBER, ECB, ...) previously
 * hardcoded ROR IDs to filter OpenAlex works. A diagnostic revealed that ~40 of
 * these hardcoded RORs were wrong/outdated and returned 0 works.
 *
 * This helper resolves an institution's OpenAlex ID *by name* at runtime (cached
 * in-memory + persisted process-wide) and filters works by the resolved ID. This
 * is self-healing: if an institution's ROR changes, we still find it by name.
 */

import { searchOpenAlex } from '../openalex';
import { env } from '../../env';
import { fetchFromProvider } from '../../http-client';

type ResolvedInstitution = {
  openAlexId: string | null; // e.g. "I1321305853"
  ror: string | null;
  displayName: string | null;
  worksCount: number;
};

// In-memory cache: institution name (lowercased) → resolution
const institutionCache = new Map<string, ResolvedInstitution>();
// In-flight deduplication: prevent concurrent callers from firing N HTTP requests for the same institution
const inflight = new Map<string, Promise<ResolvedInstitution>>();

// Pre-seeded known institutions — ROR IDs verified via api.ror.org (2025-01).
// openAlexId is null here so searchByInstitution will use the ROR-based filter
// as fallback. The cache prevents repeated HTTP resolution attempts.
// Format: lowercase name → { openAlexId, ror, displayName, worksCount }
const KNOWN_INSTITUTIONS: Record<string, ResolvedInstitution> = {
  'international monetary fund':          { openAlexId: null, ror: 'https://ror.org/05m4rmw09', displayName: 'International Monetary Fund',                      worksCount: 30000 },
  'world bank':                           { openAlexId: null, ror: 'https://ror.org/00ae7jd04', displayName: 'World Bank',                                       worksCount: 60000 },
  'organisation for economic co-operation and development': { openAlexId: null, ror: 'https://ror.org/0438wbg98', displayName: 'Organisation for Economic Co-operation and Development', worksCount: 20000 },
  'national bureau of economic research': { openAlexId: null, ror: 'https://ror.org/04grmx538', displayName: 'National Bureau of Economic Research',             worksCount: 50000 },
  'european central bank':                { openAlexId: null, ror: 'https://ror.org/00ajckn66', displayName: 'European Central Bank',                           worksCount: 10000 },
  'bank for international settlements':   { openAlexId: null, ror: 'https://ror.org/00d062t77', displayName: 'Bank for International Settlements',               worksCount: 8000  },
  'european investment bank':             { openAlexId: null, ror: 'https://ror.org/03zxry661', displayName: 'European Investment Bank',                        worksCount: 3000  },
};

// Pre-seed cache at module load time
for (const [name, resolved] of Object.entries(KNOWN_INSTITUTIONS)) {
  institutionCache.set(name, resolved);
}

/**
 * Resolve an institution's OpenAlex ID by searching its name.
 * Picks the highest works_count match. Cached for the process lifetime.
 * Concurrent calls for the same institution share one in-flight request.
 */
export async function resolveInstitution(name: string): Promise<ResolvedInstitution> {
  const key = name.toLowerCase().trim();
  const cached = institutionCache.get(key);
  if (cached) return cached;

  // Return existing in-flight promise if one is already running for this key
  const existing = inflight.get(key);
  if (existing) return existing;

  const promise = (async (): Promise<ResolvedInstitution> => {
    const mailto = env.UNPAYWALL_EMAIL || 'contact@nomosx.com';
    const auth = env.OPENALEX_API_KEY
      ? `api_key=${encodeURIComponent(env.OPENALEX_API_KEY)}`
      : `mailto=${encodeURIComponent(mailto)}`;
    const url = `https://api.openalex.org/institutions?search=${encodeURIComponent(name)}&per-page=5&${auth}`;

    try {
      // Route through fetchFromProvider → OpenAlex rate limiter + 429/5xx backoff retries
      const data: any = await fetchFromProvider('openalex', url, { timeout: 15000, retries: 4 });
      const results: any[] = data?.results || [];

      if (results.length === 0) {
        const empty: ResolvedInstitution = { openAlexId: null, ror: null, displayName: null, worksCount: 0 };
        institutionCache.set(key, empty);
        return empty;
      }

      // Pick the result with the highest works_count (most authoritative match)
      const best = results.reduce((a, b) => (b.works_count > a.works_count ? b : a));
      const resolved: ResolvedInstitution = {
        openAlexId: String(best.id || '').replace('https://openalex.org/', '') || null,
        ror: best.ror || null,
        displayName: best.display_name || null,
        worksCount: best.works_count || 0,
      };
      institutionCache.set(key, resolved);
      return resolved;
    } catch (error: any) {
      console.warn(`[InstitutionResolver] Failed to resolve "${name}": ${error.message}`);
      return { openAlexId: null, ror: null, displayName: null, worksCount: 0 };
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, promise);
  return promise;
}

/**
 * Search OpenAlex works authored by a given institution (resolved by name).
 * Returns sources tagged with the provided provider id.
 *
 * @param institutionName Canonical institution name (e.g. "International Monetary Fund")
 * @param query           Search query
 * @param provider        Provider id to tag results with (e.g. "imf")
 * @param options         limit, issuer, issuerType metadata
 */
export async function searchByInstitution(
  institutionName: string | string[],
  query: string,
  provider: string,
  options: { limit?: number; issuer?: string; issuerType?: string } = {}
): Promise<any[]> {
  const { limit = 15, issuer, issuerType } = options;
  const names = Array.isArray(institutionName) ? institutionName : [institutionName];

  // Resolve all institutions (cached), keep the ones that resolved to an ID or at least have a ROR
  const resolved = await Promise.all(names.map(resolveInstitution));

  // Prefer OpenAlex ID filter (most precise); fall back to ROR filter when ID is missing
  const openAlexIds = resolved.map(r => r.openAlexId).filter(Boolean) as string[];
  const rors = resolved.filter(r => !r.openAlexId && r.ror).map(r => r.ror) as string[];

  let filter: string;
  if (openAlexIds.length > 0) {
    filter = `authorships.institutions.id:${openAlexIds.join('|')}`;
  } else if (rors.length > 0) {
    filter = `authorships.institutions.ror:${rors.join('|')}`;
  } else {
    console.warn(`[${provider}] Could not resolve any institution ID or ROR for: ${names.join(', ')}`);
    return [];
  }

  try {
    const results = await searchOpenAlex(query, limit, { filter });
    const mapped = results.map(r => ({
      ...r,
      id: `${provider}:${String(r.id || '').replace('https://openalex.org/', '')}`,
      provider,
      ...(issuer ? { issuer } : {}),
      ...(issuerType ? { issuerType } : {}),
    }));
    const usedIds = openAlexIds.length > 0 ? openAlexIds : rors;
    console.log(`[${provider}] Found ${mapped.length} publications (filter: ${usedIds.join(', ')})`);
    return mapped;
  } catch (error: any) {
    console.error(`[${provider}] Search failed: ${error.message}`);
    return [];
  }
}
