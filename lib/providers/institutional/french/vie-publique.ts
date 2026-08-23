/**
 * Vie Publique - French Public Affairs Documentation
 * Official French government public policy reference portal
 * Uses RSS feed + search API (no key required)
 * Website: https://www.vie-publique.fr
 */

import { fetchFromProvider } from '../../../http-client';

export async function searchViePublique(query: string, limit = 15): Promise<any[]> {
  console.log(`[VIE-PUBLIQUE] Searching for: "${query}"`);
  try {
    const encoded = encodeURIComponent(query);
    const html: string = await fetchFromProvider('rss', `https://www.vie-publique.fr/recherche?keys=${encoded}&type=All&op=Rechercher`, { timeout: 12000, retries: 2, responseType: 'text', headers: { 'User-Agent': 'NomosX/1.0 (research aggregator)', 'Accept': 'text/html' } });
    if (!html) throw new Error('Request failed');

    const articlePattern = /<article[^>]*>([\s\S]*?)<\/article>/g;
    const results: any[] = [];
    let match;

    while ((match = articlePattern.exec(html)) !== null && results.length < limit) {
      const block = match[1];
      const titleMatch = block.match(/<h[23][^>]*>.*?<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
      const descMatch = block.match(/<p[^>]*class="[^"]*lead[^"]*"[^>]*>([\s\S]*?)<\/p>/) ||
                        block.match(/<p[^>]*>([\s\S]*?)<\/p>/);
      const dateMatch = block.match(/datetime="([^"]+)"/);

      if (!titleMatch) continue;

      const url = `https://www.vie-publique.fr${titleMatch[1]}`;
      const title = titleMatch[2].replace(/<[^>]+>/g, '').trim();
      const desc = (descMatch?.[1] || '').replace(/<[^>]+>/g, '').trim().slice(0, 400);

      results.push({
        id: `vie-publique:${Buffer.from(url).toString('base64').slice(0, 20)}`,
        title,
        abstract: desc,
        url,
        publishedDate: dateMatch ? dateMatch[1].split('T')[0] : undefined,
        provider: 'vie-publique',
        issuer: 'Vie Publique',
        issuerType: 'government',
        qualityScore: 72,
        language: 'fr',
      });
    }

    console.log(`[VIE-PUBLIQUE] Found ${results.length} results`);
    return results;
  } catch (error: any) {
    console.error(`[VIE-PUBLIQUE] Search failed: ${error.message}`);
    return [];
  }
}
