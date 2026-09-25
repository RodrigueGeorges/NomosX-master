/**
 * Wikisource Provider — via Wikimedia Action API
 * API : https://www.wikisource.org/w/api.php (gratuit, sans clé)
 * Couvre : textes sources en domaine public multilingues — discours historiques,
 * traités, constitutions, lettres, manuscrits transcrits, textes religieux,
 * classiques littéraires. Présent sur 70+ sous-domaines linguistiques.
 *
 * KEY VALUE : texte intégral libre pour les sources primaires historiques et
 * juridiques. Complémentaire de Gallica (FR) et Gutenberg (livres entiers).
 * On interroge plusieurs sous-domaines linguistiques (en, fr, de, es, it, la).
 */

import { fetchFromProvider } from '../../http-client';

const WIKISOURCE_DOMAINS = ['en', 'fr', 'de', 'es', 'it', 'la', 'zh', 'ar'];

export async function searchWikisource(query: string, limit = 20): Promise<any[]> {
  const perDomain = Math.max(3, Math.ceil(limit / WIKISOURCE_DOMAINS.length));
  const all: any[] = [];

  await Promise.all(
    WIKISOURCE_DOMAINS.map(async (lang) => {
      try {
        const params = new URLSearchParams({
          action: 'query',
          list: 'search',
          srsearch: query,
          srlimit: String(perDomain),
          srprop: 'snippet|size|wordcount|timestamp',
          format: 'json',
          formatversion: '2',
        });
        const url = `https://${lang}.wikisource.org/w/api.php?${params.toString()}`;
        const data: any = await fetchFromProvider('wikisource', url, {
          // 8s + 1 retry — slow language subdomains (it/la/zh/ar regularly hit
          // 25-59s) must not stall the whole scout. Parallel fan-out means the
          // worst case is ~17s total, not per-language serial timeouts.
          timeout: 8000,
          retries: 1,
        });

        const hits = data?.query?.search || [];
        for (const h of hits) {
          // Strip HTML snippets from MediaWiki search results
          const cleanSnippet = (h.snippet || '').replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').trim();
          const title = h.title || 'Wikisource text';
          all.push({
            id: `wikisource:${lang}:${encodeURIComponent(title)}`,
            provider: 'wikisource',
            type: 'primary-source',
            title,
            abstract: cleanSnippet ? cleanSnippet.slice(0, 1500) : null,
            year: null,
            publishedDate: h.timestamp || null,
            authors: [],
            institutions: ['Wikimedia Foundation'],
            doi: null,
            url: `https://${lang}.wikisource.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`,
            pdfUrl: null,
            oaStatus: 'open',
            citationCount: null,
            contentLength: h.wordcount || 0,
            hasFullText: true,
            contentQuality: (h.wordcount || 0) >= 500 ? 'good' : 'acceptable',
            issuer: 'Wikisource',
            issuerType: 'collaborative-library',
            classification: 'heritage',
            language: lang,
            documentType: 'primary-source',
            topics: ['history', 'primary-source'],
            wordCount: h.wordcount || 0,
            raw: { lang, title, size: h.size },
          });
        }
      } catch {
        // one language failed, continue
      }
    })
  );

  const results = all.slice(0, limit).filter((r) => r.title);
  console.log(`[Wikisource] Found ${results.length} primary-source texts`);
  return results;
}
