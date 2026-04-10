/**
 * OECD Direct API - iLibrary + OECD.Stat
 * Uses OECD iLibrary search API (no key required for metadata)
 * Supplements the OpenAlex-based OECD provider with direct iLibrary results
 */

export async function searchOECDDirect(query: string, limit = 15): Promise<any[]> {
  console.log(`[OECD-DIRECT] Searching iLibrary for: "${query}"`);
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const encoded = encodeURIComponent(query);
    const res = await fetch(
      `https://www.oecd-ilibrary.org/search/feed?query=${encoded}&contentType=10,11,12,13,14&sort=relevance&language=en`,
      {
        signal: controller.signal,
        headers: {
          'Accept': 'application/rss+xml, text/xml',
          'User-Agent': 'NomosX/1.0 (research aggregator)',
        },
      }
    );
    clearTimeout(timeout);

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml = await res.text();

    const items = xml.match(/<item>([\s\S]*?)<\/item>/g) || [];
    const results: any[] = [];

    for (const item of items.slice(0, limit)) {
      const title = (item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) || item.match(/<title>(.*?)<\/title>/))?.[1] || '';
      const link = (item.match(/<link>(.*?)<\/link>/))?.[1]?.trim() || '';
      const desc = (item.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/) || item.match(/<description>(.*?)<\/description>/))?.[1] || '';
      const pubDate = (item.match(/<pubDate>(.*?)<\/pubDate>/))?.[1] || '';
      const doi = (item.match(/<dc:identifier>(.*?)<\/dc:identifier>/))?.[1]?.replace('doi:', '') || '';

      results.push({
        id: `oecd-direct:${doi || Buffer.from(link).toString('base64').slice(0, 20)}`,
        title: title.replace(/<[^>]+>/g, '').trim(),
        abstract: desc.replace(/<[^>]+>/g, '').trim().slice(0, 600),
        url: link,
        doi: doi || undefined,
        publishedDate: pubDate ? new Date(pubDate).toISOString().split('T')[0] : undefined,
        provider: 'oecd-direct',
        issuer: 'OECD',
        issuerType: 'economic',
        qualityScore: 85,
      });
    }

    console.log(`[OECD-DIRECT] Found ${results.length} publications`);
    return results;
  } catch (error: any) {
    console.error(`[OECD-DIRECT] Search failed: ${error.message}`);
    return [];
  }
}
