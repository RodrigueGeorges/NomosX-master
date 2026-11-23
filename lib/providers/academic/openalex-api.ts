/**
 * OPENALEX API - Academic Search Provider
 * Recherche de publications académiques via OpenAlex
 */

import { fetchFromProvider } from '../../http-client';
import { invertedIndexToText } from '../../text';

export async function searchOpenAlex(query: string, limit: number = 10): Promise<any[]> {
  try {
    const data: any = await fetchFromProvider('openalex', `https://api.openalex.org/works?search=${encodeURIComponent(query)}&per_page=${limit}`, { timeout: 15000, retries: 2, headers: { 'User-Agent': 'NomosX/1.0 (mailto:contact@nomosx.com)' } });
    if (!data) {
      throw new Error('OpenAlex API request failed');
    }
    
    return data.results.map((item: any) => ({
      id: `openalex:${item.id}`,
      provider: 'openalex',
      type: 'academic',
      title: item.title || 'No title',
      // OpenAlex has NO `abstract` field — abstracts live in
      // abstract_inverted_index. item.abstract was always undefined → every
      // record shipped an empty abstract (audit finding).
      abstract: invertedIndexToText(item.abstract_inverted_index) || '',
      // url pointed at the API entity URL, not a fetchable landing page.
      url: item.primary_location?.landing_page_url || item.id,
      doi: item.doi ? String(item.doi).replace(/^https?:\/\/(dx\.)?doi\.org\//i, '').toLowerCase() : null,
      pdfUrl: item.primary_location?.pdf_url || '',
      year: item.publication_year || null,
      authors: item.authorships?.map((a: any) => a.author.display_name) || [],
      citationCount: item.cited_by_count || 0,
      oaStatus: item.open_access?.is_oa ? 'open' : 'closed',
      documentType: item.type || 'unknown',
      issuer: item.primary_location?.source?.display_name || '',
      issuerType: 'journal',
      classification: 'academic',
      publishedDate: item.publication_date || '',
      language: 'en',
      contentFormat: 'text',
      raw: item
    }));
  } catch (error: any) {
    console.error('OpenAlex API error:', error.message);
    return [];
  }
}
