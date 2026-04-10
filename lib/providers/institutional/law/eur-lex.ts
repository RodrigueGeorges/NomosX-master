/**
 * EUR-Lex - EU Law & Official Journal of the European Union
 * Primary: EUR-Lex SPARQL/REST API (free, no key required)
 * API: https://eur-lex.europa.eu/search.html?type=advanced&qid=...
 */

import axios from 'axios';

const USER_AGENT = 'NomosX Research Bot (+https://nomosx.com | contact@nomosx.com)';

export async function searchEURLex(query: string, limit = 15): Promise<any[]> {
  console.log(`[EUR-Lex] Searching for: "${query}"`);
  try {
    // EUR-Lex CELLAR API (SPARQL endpoint over REST)
    const sparql = `
      PREFIX cdm: <http://publications.europa.eu/ontology/cdm#>
      SELECT DISTINCT ?work ?title ?date WHERE {
        ?work cdm:work_has_expression ?expr .
        ?expr cdm:expression_uses_language <http://publications.europa.eu/resource/authority/language/ENG> .
        ?work cdm:work_date_document ?date .
        ?expr cdm:expression_title ?title .
        FILTER(CONTAINS(LCASE(STR(?title)), LCASE("${query.replace(/"/g, '')}")))
      }
      ORDER BY DESC(?date)
      LIMIT ${limit}
    `.trim();

    const { data } = await axios.post(
      'https://publications.europa.eu/webapi/rdf/sparql',
      `query=${encodeURIComponent(sparql)}`,
      {
        headers: {
          'User-Agent': USER_AGENT,
          'Accept': 'application/sparql-results+json',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        timeout: 20000,
      }
    );

    const bindings: any[] = data?.results?.bindings || [];
    if (bindings.length > 0) {
      const mapped = bindings.slice(0, limit).map((b: any) => {
        const workUri = b.work?.value || '';
        const cellarId = workUri.split('/').pop() || '';
        return {
          id: `eur-lex:${cellarId}`,
          provider: 'eur-lex',
          type: 'legislation',
          title: b.title?.value || '',
          abstract: `EU legal act on ${query}`,
          url: `https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=${encodeURIComponent(workUri)}`,
          pdfUrl: null,
          year: b.date?.value ? new Date(b.date.value).getFullYear() : null,
          issuer: 'EUR-Lex / EU',
          issuerType: 'law',
          language: 'en',
          oaStatus: 'public-domain',
          hasFullText: true,
          raw: { source: 'eur-lex', cellarId, searchQuery: query },
        };
      });
      console.log(`[EUR-Lex] Found ${mapped.length} legal acts`);
      return mapped;
    }
  } catch (error: any) {
    console.error(`[EUR-Lex] SPARQL failed: ${error.message}`);
  }
  return [];
}
