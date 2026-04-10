/**
 * Vie Publique - French Public Affairs Documentation
 * Official French government public policy reference portal
 * Uses RSS feed + search API (no key required)
 * Website: https://www.vie-publique.fr
 */

export async function searchViePublique(query: string, limit = 15): Promise<any[]> {
  console.log(`[VIE-PUBLIQUE] Searching for: "${query}"`);
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    const encoded = encodeURIComponent(query);
    const res = await fetch(
      `https://www.vie-publique.fr/recherche?keys=${encoded}&type=All&op=Rechercher`,
      {
        signal: controller.signal,
        headers: {
          'User-Agent': 'NomosX/1.0 (research aggregator)',
          'Accept': 'text/html',
        },
      }
    );
    clearTimeout(timeout);

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();

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
