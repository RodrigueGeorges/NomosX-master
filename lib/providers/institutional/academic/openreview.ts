/**
 * OpenReview — Conference papers (ICLR, NeurIPS, ICML, etc.)
 * API: https://api2.openreview.net/ (free, no key required)
 * Provides AI/ML conference submissions, reviews, and decisions
 */

import axios from 'axios';

const OPENREVIEW_API = 'https://api2.openreview.net/notes/search';
const USER_AGENT = 'NomosX Research Bot (+https://nomosx.com)';

export async function searchOpenReview(query: string, limit = 20): Promise<any[]> {
  console.log(`[OpenReview] Searching for: "${query}"`);
  const sources: any[] = [];

  try {
    const { data } = await axios.get(OPENREVIEW_API, {
      params: {
        term: query,
        type: 'terms',
        source: 'forum',
        limit,
      },
      headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/json' },
      timeout: 15000,
    });

    const notes = data?.notes || data?.results || [];
    for (const note of notes) {
      const content = note?.content || {};
      const title = content?.title?.value || content?.title || note?.forum?.title || '';
      const abstract = content?.abstract?.value || content?.abstract || '';
      const authors = content?.authors?.value || content?.authors || [];
      const venue = content?.venue?.value || content?.venue || '';
      const year = note?.pdate ? new Date(note.pdate).getFullYear() :
                   content?.pubdate?.value ? new Date(content.pubdate.value).getFullYear() : null;

      if (title) {
        sources.push({
          id: `openreview:${note.id || note.forum}`,
          provider: 'openreview',
          type: 'conference-paper',
          title: typeof title === 'string' ? title : String(title),
          abstract: typeof abstract === 'string' ? abstract.slice(0, 2000) : '',
          authors: Array.isArray(authors) ? authors : [],
          url: `https://openreview.net/forum?id=${note.forum || note.id}`,
          pdfUrl: content?.pdf?.value
            ? (content.pdf.value.startsWith('http')
              ? content.pdf.value
              : `https://openreview.net${content.pdf.value}`)
            : null,
          year,
          venue: typeof venue === 'string' ? venue : '',
          issuer: venue || 'OpenReview',
          issuerType: 'conference',
          language: 'en',
          oaStatus: 'open',
          hasFullText: !!content?.pdf?.value,
          topics: ['ai', 'ml', 'conference'],
          raw: { source: 'openreview', noteId: note.id, forum: note.forum },
        });
      }
    }

    console.log(`[OpenReview] Found ${sources.length} papers`);
  } catch (error: any) {
    console.error(`[OpenReview] Search failed: ${error.message}`);
  }

  return sources;
}
