/**
 * Terra Nova - French progressive think tank
 * Fetches publications via Terra Nova RSS/API feed
 * Website: https://tnova.fr
 */

export async function searchTerraNova(query: string, limit = 15): Promise<any[]> {
  console.log(`[TERRA-NOVA] Searching RSS for: "${query}"`);
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    const res = await fetch(
      'https://tnova.fr/feed/',
      { signal: controller.signal, headers: { 'User-Agent': 'NomosX/1.0 (research aggregator)' } }
    );
    clearTimeout(timeout);

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml = await res.text();

    const items = xml.match(/<item>([\s\S]*?)<\/item>/g) || [];
    const queryLower = query.toLowerCase();
    const keywords = queryLower.split(/\s+/).filter(w => w.length > 3);

    const results: any[] = [];
    for (const item of items) {
      const title = (item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) || item.match(/<title>(.*?)<\/title>/))?.[1] || '';
      const link = (item.match(/<link>(.*?)<\/link>/))?.[1] || '';
      const desc = (item.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/) || item.match(/<description>(.*?)<\/description>/))?.[1] || '';
      const pubDate = (item.match(/<pubDate>(.*?)<\/pubDate>/))?.[1] || '';

      const text = `${title} ${desc}`.toLowerCase();
      const matches = keywords.filter(k => text.includes(k)).length;
      if (matches === 0 && keywords.length > 0) continue;

      results.push({
        id: `terra-nova:${Buffer.from(link).toString('base64').slice(0, 20)}`,
        title: title.replace(/<[^>]+>/g, '').trim(),
        abstract: desc.replace(/<[^>]+>/g, '').trim().slice(0, 500),
        url: link,
        publishedDate: pubDate ? new Date(pubDate).toISOString().split('T')[0] : undefined,
        provider: 'terra-nova',
        issuer: 'Terra Nova',
        issuerType: 'think-tank',
        qualityScore: 65,
        language: 'fr',
      });

      if (results.length >= limit) break;
    }

    console.log(`[TERRA-NOVA] Found ${results.length} publications`);
    return results;
  } catch (error: any) {
    console.error(`[TERRA-NOVA] Search failed: ${error.message}`);
    return [];
  }
}
