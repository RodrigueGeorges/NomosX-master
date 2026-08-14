/**
 * Consolidated Institutional Provider (V3.1)
 *
 * Instead of 30+ separate OpenAlex requests (one per institution),
 * this provider makes a SINGLE OpenAlex request with all ROR IDs
 * combined using OR filters.
 *
 * OpenAlex filter syntax for OR: filter=authorships.institutions.ror:ROR1|ROR2|ROR3
 * This reduces 30+ API calls to 1, eliminating rate-limit cascades.
 *
 * Inspired by: OpenAlex best practices for batch institutional queries.
 */

import { searchOpenAlex } from '../openalex';

// ─── ROR Registry by Domain ────────────────────────────────────────────────
// All institutional ROR IDs grouped by domain.
// Source: https://ror.org/ (verified 2025-01)

interface InstitutionEntry {
  ror: string;
  name: string;
  provider: string; // original provider name for tagging
}

const INSTITUTION_REGISTRY: Record<string, InstitutionEntry[]> = {
  economic: [
    { ror: 'https://ror.org/05m4rmw09', name: 'IMF', provider: 'imf' },
    { ror: 'https://ror.org/00ae7jd04', name: 'World Bank', provider: 'worldbank' },
    { ror: 'https://ror.org/0438wbg98', name: 'OECD', provider: 'oecd' },
    { ror: 'https://ror.org/00d062t77', name: 'BIS', provider: 'bis' },
    { ror: 'https://ror.org/00ajckn66', name: 'ECB', provider: 'ecb' },
    { ror: 'https://ror.org/03zxry661', name: 'EIB', provider: 'eib' },
    { ror: 'https://ror.org/04grmx538', name: 'NBER', provider: 'nber' },
  ],
  defense: [
    { ror: 'https://ror.org/04h1x9h76', name: 'NATO', provider: 'nato' },
    { ror: 'https://ror.org/00f4d4n36', name: 'EEAS', provider: 'eeas' },
    { ror: 'https://ror.org/028a36g75', name: 'IAI', provider: 'iai' },
    { ror: 'https://ror.org/05frkc804', name: 'SWP', provider: 'swp' },
    { ror: 'https://ror.org/05e8ym512', name: 'SIPRI', provider: 'sipri' },
  ],
  french: [
    { ror: 'https://ror.org/02feahw73', name: 'CNRS', provider: 'cnrs' },
    { ror: 'https://ror.org/02kvxyf05', name: 'Inria', provider: 'inria' },
    { ror: 'https://ror.org/05a0dhs15', name: 'ENS Paris', provider: 'ens' },
    { ror: 'https://ror.org/04zmssz18', name: 'ENS Lyon', provider: 'ens' },
    { ror: 'https://ror.org/00jjx8s55', name: 'CEA', provider: 'cea' },
    { ror: 'https://ror.org/003vg9w96', name: 'INRAE', provider: 'inrae' },
    { ror: 'https://ror.org/03v6yxf25', name: 'INSEE', provider: 'insee' },
    { ror: 'https://ror.org/05rth8x13', name: 'ADEME', provider: 'ademe' },
  ],
  health: [
    { ror: 'https://ror.org/01f80g185', name: 'WHO', provider: 'who-direct' },
    { ror: 'https://ror.org/042twtr12', name: 'CDC', provider: 'cdc' },
    { ror: 'https://ror.org/01cwqze88', name: 'NIH', provider: 'nih' },
    { ror: 'https://ror.org/00s9v1h75', name: 'ECDC', provider: 'ecdc' },
    { ror: 'https://ror.org/01z0wsw92', name: 'EMA', provider: 'ema' },
    { ror: 'https://ror.org/00dbkrq51', name: 'Cochrane', provider: 'cochrane' },
  ],
  cyber: [
    { ror: 'https://ror.org/05k9w3r76', name: 'NIST', provider: 'nist' },
    { ror: 'https://ror.org/00wqx6897', name: 'ENISA', provider: 'enisa' },
  ],
  tech: [
    { ror: 'https://ror.org/05w520734', name: 'Allen AI', provider: 'allen-ai' },
    { ror: 'https://ror.org/01hhn8329', name: 'Max Planck', provider: 'max-planck' },
    { ror: 'https://ror.org/05a28rw58', name: 'ETH Zurich', provider: 'eth-zurich' },
  ],
  multilateral: [
    { ror: 'https://ror.org/006kxhp52', name: 'UN', provider: 'un' },
    { ror: 'https://ror.org/051777d98', name: 'UNDP', provider: 'undp' },
  ],
};

// ─── Consolidated Search ────────────────────────────────────────────────────

/**
 * Search across multiple institutions in a SINGLE OpenAlex request.
 * Uses OpenAlex OR filter syntax: authorships.institutions.ror:ROR1|ROR2|...
 *
 * @param query - Search query
 * @param domains - Which domain groups to include (e.g. ['economic', 'defense'])
 * @param limit - Max results per institution group
 */
export async function searchConsolidatedInstitutions(
  query: string,
  domains: string[] = ['economic', 'defense', 'french', 'health', 'tech', 'multilateral'],
  limit = 30,
): Promise<any[]> {
  // Collect all ROR IDs for the requested domains
  const allEntries: InstitutionEntry[] = [];
  for (const domain of domains) {
    const entries = INSTITUTION_REGISTRY[domain];
    if (entries) allEntries.push(...entries);
  }

  if (allEntries.length === 0) return [];

  // Build OR filter: authorships.institutions.ror:ROR1|ROR2|ROR3
  // OpenAlex limits filter length, so we batch in groups of 15 RORs
  const BATCH_SIZE = 15;
  const batches: InstitutionEntry[][] = [];
  for (let i = 0; i < allEntries.length; i += BATCH_SIZE) {
    batches.push(allEntries.slice(i, i + BATCH_SIZE));
  }

  console.log(`[CONSOLIDATED-INSTITUTIONS] Searching ${allEntries.length} institutions in ${batches.length} batch(es) for: "${query.slice(0, 60)}..."`);

  const results = await Promise.allSettled(
    batches.map(async (batch) => {
      const rorFilter = batch.map(e => e.ror).join('|');
      const filter = `authorships.institutions.ror:${rorFilter}`;
      const batchResults = await searchOpenAlex(query, limit, { filter });

      // Tag each result with its institution
      return batchResults.map((r: any) => {
        const matchedInst = batch.find(e =>
          r.institutions?.some((inst: any) => inst.rorId === e.ror.replace('https://ror.org/', ''))
        );
        return {
          ...r,
          provider: matchedInst?.provider || 'consolidated-institution',
          issuer: matchedInst?.name || 'Institution',
          id: `${matchedInst?.provider || 'inst'}:${r.id?.replace('https://openalex.org/', '') || ''}`,
        };
      });
    })
  );

  const allResults = results
    .filter((r): r is PromiseFulfilledResult<any[]> => r.status === 'fulfilled')
    .flatMap(r => r.value);

  console.log(`[CONSOLIDATED-INSTITUTIONS] Got ${allResults.length} results from ${allEntries.length} institutions`);
  return allResults;
}

/**
 * Get the list of original provider names that are consolidated.
 * This allows the pipeline to skip individual institutional providers
 * when the consolidated one is used.
 */
export function getConsolidatedProviderNames(domains?: string[]): string[] {
  const names = new Set<string>();
  const domainsToCheck = domains || Object.keys(INSTITUTION_REGISTRY);
  for (const domain of domainsToCheck) {
    const entries = INSTITUTION_REGISTRY[domain];
    if (entries) {
      for (const entry of entries) {
        names.add(entry.provider);
      }
    }
  }
  return [...names];
}

export { INSTITUTION_REGISTRY };
