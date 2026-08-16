/**
 * Project Gutenberg Provider — via Gutendex API
 * API : https://gutendex.com/ (miroir officiel, gratuit, sans clé)
 * Couvre : 70 000+ ebooks libres de droits — classiques littéraires, ouvrages
 * historiques, textes fondateurs en domaine public (XVIIIe–début XXe siècle).
 *
 * KEY VALUE : accès direct au texte intégral des ouvrages classiques et
 * historiques en plusieurs langues (EN, FR, DE, IT...). Idéal pour la recherche
 * sur les sources primaires historiques et littéraires.
 */

import { fetchFromProvider } from '../../http-client';

const GUTENDEX_API = 'https://gutendex.com/books';

export async function searchGutenberg(query: string, limit = 20): Promise<any[]> {
  try {
    const url = `${GUTENDEX_API}?search=${encodeURIComponent(query)}`;
    const data: any = await fetchFromProvider('gutenberg', url, {
      timeout: 15000,
      retries: 3,
    });

    const books = (data?.results || []).slice(0, Math.min(limit, 40));
    const results = books.map((b: any) => {
      const authors = (b.authors || []).map((a: any) => ({
        name: a.name,
        birthYear: a.birth_year ?? null,
        deathYear: a.death_year ?? null,
      }));
      const subjects = b.subjects || [];
      const bookshelves = b.bookshelves || [];
      const languages = b.languages || [];
      const formats = b.formats || {};
      const htmlUrl = formats['text/html'] || formats['text/html; charset=utf-8'] || null;
      const epubUrl = formats['application/epub+zip'] || null;
      const pdfUrl = formats['application/pdf'] || formats['application/octet-stream'] || null;
      const txtUrl = formats['text/plain; charset=us-ascii'] || formats['text/plain; charset=utf-8'] || formats['text/plain'] || null;
      const cover = formats['image/jpeg'] || null;

      const abstract = [
        subjects.length ? `Subjects: ${subjects.slice(0, 6).join('; ')}` : null,
        bookshelves.length ? `Bookshelves: ${bookshelves.slice(0, 4).join('; ')}` : null,
        b.copyright ? `Copyright: ${b.copyright}` : 'Public domain',
      ].filter(Boolean).join(' | ');

      return {
        id: `gutenberg:${b.id}`,
        provider: 'gutenberg',
        type: 'book',
        title: b.title || 'Project Gutenberg ebook',
        abstract: abstract || null,
        year: authors[0]?.birthYear ? authors[0].birthYear : null,
        publishedDate: null,
        authors,
        institutions: ['Project Gutenberg'],
        doi: null,
        url: `https://www.gutenberg.org/ebooks/${b.id}`,
        pdfUrl,
        epubUrl,
        txtUrl,
        htmlUrl,
        imageUrl: cover,
        oaStatus: 'open',
        citationCount: b.download_count || null,
        contentLength: abstract?.length || 0,
        hasFullText: !!txtUrl || !!htmlUrl,
        contentQuality: 'good',
        issuer: 'Project Gutenberg',
        issuerType: 'public-domain-library',
        classification: 'heritage',
        language: languages[0] || 'en',
        documentType: 'book',
        topics: [...subjects.slice(0, 8), ...bookshelves.slice(0, 4)],
        downloadCount: b.download_count || 0,
        raw: b,
      };
    }).filter((r: any) => r.title);

    console.log(`[Gutenberg] Found ${results.length} ebooks`);
    return results;
  } catch (error: any) {
    console.error(`[Gutenberg] Search failed: ${error.message}`);
    return [];
  }
}
