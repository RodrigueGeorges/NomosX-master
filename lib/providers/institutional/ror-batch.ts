/**
 * ROR Batch Provider — collapses pure OpenAlex-ROR institutional wrappers
 * into a single batched OpenAlex call per query.
 *
 * Context: ~30 institutional providers (ema, ecdc, cnrs, swp…) are thin
 * wrappers around `searchOpenAlex(query, { filter: ror:… })`. Fanning them
 * out individually costs N calls per query variation (several even fire 2
 * ROR calls each) — that fan-out exhausted the per-execution OpenAlex budget
 * mid-scout and starved later planner nodes. OpenAlex supports OR filters
 * (`ror:R1|R2|…`), so one call covers them all. Results are retagged to the
 * provider whose ROR appears in authorships.
 *
 * Only PURE ROR wrappers are batchable here — providers with a real native
 * API (imf SDMX, worldbank WDS, bis RSS, eurostat SDMX, fred, insee,
 * who-direct IRIS, cisa, nist) keep their individual call path.
 */

import { searchOpenAlex } from '../openalex';

interface RorEntry {
  rors: string[];     // bare ROR ids (no https://ror.org/ prefix); a provider may fan out over several
  issuer: string;
  issuerType: string;
}

const ROR_BATCHED_PROVIDERS: Record<string, RorEntry> = {
  // Health
  'ema':              { rors: ['01z0wsw92'], issuer: 'EMA', issuerType: 'health' },
  'ecdc':             { rors: ['00s9v1h75'], issuer: 'ECDC', issuerType: 'health' },
  'cochrane':         { rors: ['00dbkrq51'], issuer: 'Cochrane', issuerType: 'health' },
  'inserm':           { rors: ['02vjkv261'], issuer: 'INSERM', issuerType: 'health' },
  'nih':              { rors: ['01cwqze88'], issuer: 'NIH', issuerType: 'health' },
  'cdc':              { rors: ['042twtr12'], issuer: 'CDC', issuerType: 'health' },
  // Think tanks
  'swp':              { rors: ['05frkc804'], issuer: 'SWP', issuerType: 'think_tank' },
  'iai':              { rors: ['028a36g75'], issuer: 'IAI', issuerType: 'think_tank' },
  'sipri':            { rors: ['05e8ym512'], issuer: 'SIPRI', issuerType: 'think_tank' },
  'ecfr':             { rors: ['03q12x978'], issuer: 'ECFR', issuerType: 'think_tank' },
  'iddri':            { rors: ['02j05s068'], issuer: 'IDDRI', issuerType: 'think_tank' },
  // French institutions
  'cnrs':             { rors: ['02feahw73'], issuer: 'CNRS', issuerType: 'academic' },
  'inria':            { rors: ['02kvxyf05'], issuer: 'Inria', issuerType: 'academic' },
  'ens':              { rors: ['05a0dhs15', '04zmssz18'], issuer: 'ENS', issuerType: 'academic' },
  'ademe':            { rors: ['05rth8x13'], issuer: 'ADEME', issuerType: 'government' },
  'cea':              { rors: ['00jjx8s55'], issuer: 'CEA', issuerType: 'research' },
  'inrae':            { rors: ['003vg9w96'], issuer: 'INRAE', issuerType: 'research' },
  'france-strategie': { rors: ['00mpxgs49'], issuer: 'France Stratégie', issuerType: 'government' },
  // Tech research
  'allen-ai':         { rors: ['05w520734'], issuer: 'Allen Institute for AI', issuerType: 'research' },
  'max-planck':       { rors: ['01hhn8329'], issuer: 'Max Planck Society', issuerType: 'research' },
  'eth-zurich':       { rors: ['05a28rw58'], issuer: 'ETH Zurich', issuerType: 'academic' },
  // Economics — ecb/oecd/nber/eib resolve through searchByInstitution's
  // KNOWN_INSTITUTIONS RORs (openalex-institution.ts)
  'eib':              { rors: ['03zxry661'], issuer: 'EIB', issuerType: 'economic' },
  'ecb':              { rors: ['00ajckn66'], issuer: 'ECB', issuerType: 'economic' },
  'oecd':             { rors: ['0438wbg98'], issuer: 'OECD', issuerType: 'economic' },
  'nber':             { rors: ['04grmx538'], issuer: 'NBER', issuerType: 'economic' },
  // Multilateral
  'un':               { rors: ['006kxhp52'], issuer: 'United Nations', issuerType: 'multilateral' },
  'undp':             { rors: ['051777d98'], issuer: 'UNDP', issuerType: 'multilateral' },
  'unctad':           { rors: ['02szg9b20'], issuer: 'UNCTAD', issuerType: 'multilateral' },
  // Energy
  'iaea':             { rors: ['02zt1gg83'], issuer: 'IAEA', issuerType: 'multilateral' },
  'irena':            { rors: ['01dej0523'], issuer: 'IRENA', issuerType: 'multilateral' },
  // Defense — multi-ROR providers keep both RORs in the same OR batch
  'nato':             { rors: ['05xagc088', '00f2z7n96'], issuer: 'NATO/RAND', issuerType: 'defense' },
  'eeas':             { rors: ['01bmvkm47', '00k4n6c32'], issuer: 'EEAS/EUISS', issuerType: 'defense' },
  'eda':              { rors: ['01bmvkm47', '02mkv8r24'], issuer: 'EDA/EUISS', issuerType: 'defense' },
  'sgdsn':            { rors: ['00ny8df12', '00mpxgs49'], issuer: 'SGDSN', issuerType: 'defense' },
  // Cyber
  'enisa':            { rors: ['00wqx6897'], issuer: 'ENISA', issuerType: 'cyber' },
};

const BATCH_SIZE = 15; // OpenAlex filter length ceiling — same as consolidated-institutions

/** Names of providers covered by ROR batching (for tests and providerSet surgery). */
export function isRorBatchedProvider(name: string): boolean {
  return name in ROR_BATCHED_PROVIDERS;
}

/**
 * One OpenAlex OR-filter call (per ≤15-ROR chunk) covering `providers`.
 * Each result is retagged with the provider whose ROR matched its authorships.
 */
export async function searchRorBatch(
  query: string,
  providers: string[],
  limit = 15,
): Promise<any[]> {
  const entries = providers
    .map(p => [p, ROR_BATCHED_PROVIDERS[p]] as const)
    .filter((e): e is readonly [string, RorEntry] => !!e[1]);
  if (entries.length === 0) return [];

  // Flatten (provider, ror) pairs — a provider may carry several RORs.
  const pairs: (readonly [string, RorEntry, string])[] = entries.flatMap(
    ([p, e]) => e.rors.map(ror => [p, e, ror] as const)
  );

  const chunks: (readonly [string, RorEntry, string])[][] = [];
  for (let i = 0; i < pairs.length; i += BATCH_SIZE) {
    chunks.push(pairs.slice(i, i + BATCH_SIZE));
  }

  const settled = await Promise.allSettled(
    chunks.map(async (chunk) => {
      const filter = `authorships.institutions.ror:${chunk.map(([, , ror]) => `https://ror.org/${ror}`).join('|')}`;
      const results = await searchOpenAlex(query, Math.max(limit, Math.ceil(limit * chunk.length / 4)), { filter });
      const rorToProvider = new Map(chunk.map(([p, e, ror]) => [ror, [p, e] as const]));
      return results.map((r: any) => {
        const hit = (r.institutions ?? [])
          .map((i: any) => i.rorId?.replace('https://ror.org/', ''))
          .find((id: string | undefined) => id && rorToProvider.has(id));
        const [provider, entry] = (hit && rorToProvider.get(hit)) || ['institution', undefined];
        return {
          ...r,
          id: `${provider}:${r.id?.replace('https://openalex.org/', '') || ''}`,
          provider,
          issuer: entry?.issuer || r.issuer || 'Institution',
          issuerType: entry?.issuerType || r.issuerType,
        };
      });
    }),
  );

  return settled
    .filter((r): r is PromiseFulfilledResult<any[]> => r.status === 'fulfilled')
    .flatMap(r => r.value);
}
