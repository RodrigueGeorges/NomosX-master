/**
 * Overton Provider — World's Largest Policy Document Index
 *
 * Overton (overton.io) indexes 20M+ policy documents from governments,
 * think tanks, IGOs, and NGOs worldwide. Includes grey literature that
 * is systematically absent from academic databases: policy briefs,
 * white papers, regulatory documents, working papers from 180+ countries.
 *
 * API: REST API requiring api_key parameter.
 *   Set OVERTON_API_KEY environment variable.
 *   Free for academic research (contact support@overton.io).
 *   Rate limit: 1 request per second (enforced via rate limiter).
 * Docs: https://app.overton.io/swagger.php
 *
 * KEY VALUE: The #1 gap in NomosX's current coverage. Policy Atlas
 * (Nesta, 2026) found that grey literature is "very valuable for
 * grounding empirical evidence in the policy context" — Overton is
 * the canonical source for this.
 *
 * Graceful skip: If OVERTON_API_KEY is not set, returns empty array.
 */

import { getRateLimiter } from '../http-client';

export interface OvertonResult {
  id: string;
  provider: string;
  type: string;
  title: string;
  abstract: string | null;
  url: string | null;
  pdfUrl: string | null;
  year: number | null;
  authors: any[];
  doi: string | null;
  topics: string[];
  institutions: { name: string }[];
  citationCount: number | null;
  oaStatus: string;
  documentType: string;
  publishedDate: string | null;
  raw: any;
}

/**
 * Search Overton for policy documents matching the query.
 * Returns policy documents (not scholarly articles).
 */
export async function searchOverton(query: string, limit = 25): Promise<OvertonResult[]> {
  const apiKey = process.env.OVERTON_API_KEY;

  if (!apiKey) {
    console.log('[Overton] No OVERTON_API_KEY set, skipping');
    return [];
  }

  try {
    // Overton rate limit: 1 req/sec — use rate limiter to serialize
    const limiter = getRateLimiter('overton');
    if (limiter) await limiter.acquire();

    const encoded = encodeURIComponent(query);
    const url = `https://app.overton.io/policies.php?api_key=${apiKey}&search_terms=${encoded}&limit=${Math.min(limit, 100)}&format=json`;

    const res = await fetch(url, {
      signal: AbortSignal.timeout(20000),
      headers: {
        Accept: 'application/json',
        'User-Agent': 'NomosX Research Bot (+https://nomosx.com)',
      },
    });

    if (!res.ok) {
      console.warn(`[Overton] HTTP ${res.status}`);
      return [];
    }

    const data: any = await res.json();
    const docs: any[] = data?.results || [];

    console.log(`[Overton] Found ${docs.length} policy documents`);

    const results: OvertonResult[] = docs
      .filter((d: any) => d.title)
      .map((d: any) => {
        const abstract = d.abstract || d.summary || d.description || "";
        const year = d.year ? parseInt(d.year) : (d.published ? new Date(d.published).getFullYear() : null);
        const policyId = d.policy_document_id || d.pdf_document_id || d.id;
        const sourceOrg = d.source?.name || d.publisher || d.source_organization || 'Unknown';

        return {
          id: `overton:${policyId || encodeURIComponent(d.title).slice(0, 40)}`,
          provider: 'overton',
          type: 'policy_document',
          title: d.title || "",
          abstract: abstract || null,
          url: d.document_url || d.url || null,
          pdfUrl: d.pdf_url || null,
          year,
          authors: d.authors?.map((a: any) => ({ name: a.name || a, institution: a.affiliation || null })) || [],
          doi: d.doi || null,
          topics: d.tags || d.subjects || d.keywords || [],
          institutions: [{ name: sourceOrg }],
          citationCount: d.citation_count ?? d.citations ?? null,
          oaStatus: 'open',
          documentType: d.document_type || d.type || 'policy_document',
          publishedDate: d.published || d.publication_date || null,
          raw: d,
        };
      });

    console.log(`[Overton] ${results.length}/${docs.length} with metadata`);
    return results;
  } catch (error: any) {
    console.error(`[Overton] Search failed: ${error.message}`);
    return [];
  }
}

/**
 * Search Overton for scholarly articles that cite policy documents.
 * Useful for finding academic research that references specific policies.
 */
export async function searchOvertonScholarly(query: string, limit = 20): Promise<OvertonResult[]> {
  const apiKey = process.env.OVERTON_API_KEY;

  if (!apiKey) {
    return [];
  }

  try {
    const limiter = getRateLimiter('overton');
    if (limiter) await limiter.acquire();

    const encoded = encodeURIComponent(query);
    const url = `https://app.overton.io/articles.php?api_key=${apiKey}&search_terms=${encoded}&limit=${Math.min(limit, 100)}&format=json`;

    const res = await fetch(url, {
      signal: AbortSignal.timeout(20000),
      headers: {
        Accept: 'application/json',
        'User-Agent': 'NomosX Research Bot (+https://nomosx.com)',
      },
    });

    if (!res.ok) return [];

    const data: any = await res.json();
    const docs: any[] = data?.results || [];

    return docs
      .filter((d: any) => d.title)
      .map((d: any) => {
        const year = d.year ? parseInt(d.year) : null;
        return {
          id: `overton-scholarly:${d.doi || encodeURIComponent(d.title).slice(0, 40)}`,
          provider: 'overton-scholarly',
          type: 'journal_article',
          title: d.title || "",
          abstract: d.abstract || null,
          url: d.url || null,
          pdfUrl: null,
          year,
          authors: d.authors?.map((a: any) => ({ name: a.name || a, institution: a.affiliation || null })) || [],
          doi: d.doi || null,
          topics: d.tags || [],
          institutions: [],
          citationCount: d.citation_count ?? null,
          oaStatus: d.open_access ? 'oa' : 'closed',
          documentType: 'journal_article',
          publishedDate: d.published || null,
          raw: d,
        };
      });
  } catch (error: any) {
    console.error(`[Overton] Scholarly search failed: ${error.message}`);
    return [];
  }
}
