/**
 * Domain → extended-provider routing tests.
 *
 * Guards the thin-domain coverage invariant: disciplines that previously
 * matched nothing in the scout's keyword map fell back to generic
 * OpenAlex providers and starved the corpus. Every DOMAIN_EXTENDED_PROVIDERS
 * entry must resolve to a real call path (known registry case, ROR batch,
 * source-id batch, or alias) — invented ids collapse into a shared generic
 * OpenAlex call and add nothing.
 */
import {
  DOMAIN_EXTENDED_PROVIDERS,
  PROVIDER_ALIASES,
  ROR_PROVIDERS,
  SOURCE_PROVIDERS,
  getAvailableProviders,
  getExtendedProvidersForDomain,
} from '../../../lib/providers/registry-bridge';

const KNOWN = new Set(getAvailableProviders());

function resolves(id: string): boolean {
  const lower = id.toLowerCase();
  const alias = PROVIDER_ALIASES[lower] ?? lower;
  return KNOWN.has(alias) || !!ROR_PROVIDERS[alias] || !!SOURCE_PROVIDERS[alias];
}

describe('DOMAIN_EXTENDED_PROVIDERS integrity', () => {
  const domains = Object.keys(DOMAIN_EXTENDED_PROVIDERS);

  it('covers the thin disciplines that starved the corpus', () => {
    for (const d of [
      'social-sciences', 'humanities', 'history', 'sociology', 'psychology',
      'public-health', 'epidemiology', 'medicine', 'law', 'education',
      'development', 'migration', 'demography', 'gender-studies',
      'philosophy', 'criminology', 'linguistics', 'archaeology',
      'media-studies', 'international-relations', 'anthropology',
      'futures-studies', 'complexity-science', 'data-science',
      'neuroscience', 'bioethics', 'political-science',
    ]) {
      expect(domains).toContain(d);
    }
  });

  it('every provider id resolves to a real call path (no invented ids)', () => {
    const dead: string[] = [];
    for (const [domain, ids] of Object.entries(DOMAIN_EXTENDED_PROVIDERS)) {
      for (const id of ids) {
        if (!resolves(id)) dead.push(`${domain}:${id}`);
      }
    }
    expect(dead).toEqual([]);
  });

  it('no duplicate provider ids within a domain entry', () => {
    for (const [domain, ids] of Object.entries(DOMAIN_EXTENDED_PROVIDERS)) {
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('thin domains get at least 3 distinct providers (not generic fallback)', () => {
    for (const d of ['sociology', 'humanities', 'public-health', 'development', 'futures-studies']) {
      const ids = getExtendedProvidersForDomain(d);
      const generic = getAvailableProviders().slice(0, 8);
      expect(ids.length).toBeGreaterThanOrEqual(3);
      // A thin-domain entry must differ from the unknown-domain fallback.
      expect(ids).not.toEqual(generic);
    }
  });

  it('unknown domain falls back to generic providers', () => {
    expect(getExtendedProvidersForDomain('nonexistent-domain'))
      .toEqual(getAvailableProviders().slice(0, 8));
  });

  it('discipline-specific ids are present for their domains', () => {
    expect(getExtendedProvidersForDomain('sociology')).toContain('sociology');
    expect(getExtendedProvidersForDomain('humanities')).toContain('persee');
    expect(getExtendedProvidersForDomain('public-health')).toContain('pubmed');
    expect(getExtendedProvidersForDomain('history')).toContain('isidore');
    expect(getExtendedProvidersForDomain('development')).toContain('fao');
    expect(getExtendedProvidersForDomain('futures-studies')).toContain('copenhagen-institute');
  });
});
