/**
 * Reference editors registry — authority domain matching used by the
 * enhanced ranker to lift agency/institute documents above generic web
 * sources regardless of delivery provider.
 */

import { authorityMatch } from '@/lib/agent/reference-editors';
import { classifyTrustTier } from '@/lib/agent/enhanced-ranker';

describe('authorityMatch', () => {
  it('matches tier-A multilateral domains, including subdomains', () => {
    expect(authorityMatch('https://www.iea.org/reports/world-energy-outlook-2026')?.tier).toBe('A');
    expect(authorityMatch('https://reports.worldbank.org/en/publication/x')?.tier).toBe('A');
    expect(authorityMatch('https://unfccc.int/process-and-meetings')?.tier).toBe('A');
  });

  it('matches tier-B government and statistical domains', () => {
    expect(authorityMatch('https://www.federalreserve.gov/releases/h41/')?.tier).toBe('B');
    expect(authorityMatch('https://ec.europa.eu/eurostat/databrowser')?.tier).toBe('B');
    expect(authorityMatch('https://www.insee.fr/en/statistiques')?.tier).toBe('B');
  });

  it('matches tier-C institute domains', () => {
    expect(authorityMatch('https://www.sipri.org/yearbook/2026')?.tier).toBe('A'); // SIPRI is tier A
    expect(authorityMatch('https://www.bruegel.org/analysis/post')?.tier).toBe('C');
    expect(authorityMatch('https://merics.org/en/report')?.tier).toBe('C');
  });

  it('returns null for non-registry domains', () => {
    expect(authorityMatch('https://example-blog.com/post')).toBeNull();
    expect(authorityMatch('https://random-news-site.net/article')).toBeNull();
    expect(authorityMatch(null)).toBeNull();
    expect(authorityMatch('')).toBeNull();
  });

  it('does not match on partial domain segments', () => {
    // "notiea.org" must not match "iea.org"
    expect(authorityMatch('https://notiea.org/page')).toBeNull();
    // suffix rule requires a dot boundary
    expect(authorityMatch('https://fake-imf.org.evil.com/x')).toBeNull();
  });
});

describe('classifyTrustTier — authority domain lift', () => {
  it('lifts an authority-domain document out of untrusted when it lacks DOI/citations', () => {
    const src = {
      provider: 'tavily',
      url: 'https://www.iea.org/reports/key-world-energy-statistics-2026',
      title: 'Key World Energy Statistics 2026',
      abstract: 'short',
    };
    const { tier, weight } = classifyTrustTier(src);
    expect(tier).toBe('verified');
    expect(weight).toBeGreaterThanOrEqual(0.8);
  });

  it('keeps canonical academic sources above authority domains', () => {
    const src = {
      provider: 'semanticscholar',
      doi: '10.1234/x',
      citationCount: 500,
      abstract: 'a'.repeat(600),
      title: 'Peer reviewed paper',
      url: 'https://www.iea.org/some-page',
    };
    expect(classifyTrustTier(src).tier).toBe('canonical');
  });
});
