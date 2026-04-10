/**
 * NomosX LIVE SOURCE MONITOR — Real-Time Academic Feed Watcher
 *
 * Monitors academic preprint servers and journals for new publications
 * relevant to NomosX's 11 verticals. When a significant new paper drops,
 * it creates a Signal for the editorial pipeline.
 *
 * Sources monitored:
 * - arXiv (AI, economics, quantitative finance, physics, law)
 * - PubMed/NCBI (health, biomedical, epidemiology)
 * - SSRN (economics, law, finance, social sciences)
 * - Crossref (all disciplines — recent DOIs)
 *
 * All APIs are FREE and require no authentication.
 *
 * Runs as part of auto-scan cron (after provider search).
 * New significant papers → Signal creation → Editorial planner picks up.
 */

import { prisma } from '../db';

// ============================================================================
// TYPES
// ============================================================================

export interface MonitoredPaper {
  externalId: string;
  title: string;
  authors: string[];
  abstract: string;
  publishedDate: Date;
  source: 'arxiv' | 'pubmed' | 'ssrn' | 'crossref';
  url: string;
  categories?: string[];
  doi?: string;
}

export interface MonitorResult {
  source: string;
  papersFound: number;
  signalsCreated: number;
  errors: string[];
}

export interface LiveMonitorOutput {
  results: MonitorResult[];
  totalPapers: number;
  totalSignals: number;
  durationMs: number;
}

// ============================================================================
// VERTICAL → SEARCH QUERIES MAPPING
// ============================================================================

const VERTICAL_FEEDS: Record<string, {
  arxiv?: string[];     // arXiv category codes
  pubmed?: string[];    // PubMed search terms
  ssrn?: string[];      // SSRN search terms
  crossref?: string[];  // Crossref search terms
}> = {
  'tech-innovation': {
    arxiv: ['cs.AI', 'cs.LG', 'cs.CL', 'cs.CV'],
    ssrn: ['platform regulation', 'digital identity', 'e-government'],
    crossref: ['artificial intelligence regulation', 'AI safety', 'digital governance'],
  },
  'macro-finance': {
    arxiv: ['econ.GN', 'q-fin.GN', 'q-fin.EC'],
    ssrn: ['monetary policy', 'fiscal policy', 'inflation', 'trade policy'],
    crossref: ['economic policy 2025', 'central bank'],
  },
  'health-bioethics': {
    pubmed: ['pandemic preparedness', 'mRNA therapeutics', 'antimicrobial resistance'],
    crossref: ['public health policy', 'biotech regulation', 'bioethics'],
  },
  'climate-energy': {
    arxiv: ['physics.ao-ph', 'eess.SY'],
    crossref: ['carbon capture', 'energy transition', 'climate policy'],
  },
  'geopolitics': {
    ssrn: ['geopolitical risk', 'sanctions policy', 'defense strategy', 'cyber warfare', 'military AI'],
    crossref: ['international security', 'nuclear proliferation', 'defense technology'],
  },
  'law-regulation': {
    ssrn: ['AI regulation', 'data privacy law', 'antitrust'],
    crossref: ['regulatory framework', 'digital services act'],
  },
  'social-policy': {
    ssrn: ['labor market', 'remote work', 'education technology', 'migration policy', 'demographic transition'],
    crossref: ['workforce automation', 'skills gap', 'immigration reform', 'social inequality'],
  },
  'development-global': {
    ssrn: ['development economics', 'supply chain', 'urbanization'],
    crossref: ['trade agreement', 'WTO reform', 'sustainable development goals'],
  },
  'cognitive-behavioral': {
    arxiv: ['q-bio.NC'],
    ssrn: ['behavioral economics', 'cognitive bias', 'nudge policy'],
    crossref: ['decision making', 'neuroeconomics'],
  },
  'complexity-quantitative': {
    arxiv: ['nlin.AO', 'physics.soc-ph'],
    ssrn: ['systemic risk', 'agent-based modeling'],
    crossref: ['complex systems', 'network analysis'],
  },
  'humanities-ethics': {
    ssrn: ['ethics AI', 'digital humanities', 'political philosophy'],
    crossref: ['cultural criticism', 'intellectual history'],
  },
};

// ============================================================================
// arXiv API — Free, no auth, RSS/Atom feed
// ============================================================================

async function fetchArxivRecent(categories: string[], maxResults = 10): Promise<MonitoredPaper[]> {
  const papers: MonitoredPaper[] = [];

  for (const category of categories) {
    try {
      const url = `https://export.arxiv.org/api/query?search_query=cat:${category}&sortBy=submittedDate&sortOrder=descending&max_results=${maxResults}`;
      const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!response.ok) continue;

      const xml = await response.text();

      // Parse Atom XML entries
      const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
      let match;
      while ((match = entryRegex.exec(xml)) !== null) {
        const entry = match[1];
        const title = extractXmlTag(entry, 'title')?.replace(/\s+/g, ' ').trim();
        const summary = extractXmlTag(entry, 'summary')?.replace(/\s+/g, ' ').trim();
        const published = extractXmlTag(entry, 'published');
        const id = extractXmlTag(entry, 'id');

        // Extract authors
        const authorRegex = /<author>\s*<name>([^<]+)<\/name>/g;
        const authors: string[] = [];
        let authorMatch;
        while ((authorMatch = authorRegex.exec(entry)) !== null) {
          authors.push(authorMatch[1].trim());
        }

        // Extract categories
        const catRegex = /category[^>]*term="([^"]+)"/g;
        const cats: string[] = [];
        let catMatch;
        while ((catMatch = catRegex.exec(entry)) !== null) {
          cats.push(catMatch[1]);
        }

        if (title && summary && id) {
          // Only include papers from last 7 days
          const pubDate = published ? new Date(published) : new Date();
          const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
          if (pubDate >= sevenDaysAgo) {
            papers.push({
              externalId: `arxiv:${id.split('/abs/').pop() || id}`,
              title,
              authors: authors.slice(0, 5),
              abstract: summary.slice(0, 1000),
              publishedDate: pubDate,
              source: 'arxiv',
              url: id.replace('http://', 'https://'),
              categories: cats,
            });
          }
        }
      }
    } catch (err: any) {
      console.warn(`[LIVE MONITOR] arXiv ${category} failed: ${err.message}`);
    }
  }

  return papers;
}

function extractXmlTag(xml: string, tag: string): string | null {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`);
  const match = xml.match(regex);
  return match ? match[1].trim() : null;
}

// ============================================================================
// PubMed/NCBI E-Utilities — Free, no auth for low volume
// ============================================================================

async function fetchPubMedRecent(terms: string[], maxResults = 5): Promise<MonitoredPaper[]> {
  const papers: MonitoredPaper[] = [];

  for (const term of terms) {
    try {
      // Step 1: Search for recent IDs
      const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(term)}&retmax=${maxResults}&sort=date&retmode=json&datetype=pdat&reldate=7`;
      const searchResponse = await fetch(searchUrl, { signal: AbortSignal.timeout(10000) });
      if (!searchResponse.ok) continue;

      const searchData = await searchResponse.json();
      const ids: string[] = searchData.esearchresult?.idlist || [];
      if (ids.length === 0) continue;

      // Step 2: Fetch summaries
      const fetchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${ids.join(',')}&retmode=json`;
      const fetchResponse = await fetch(fetchUrl, { signal: AbortSignal.timeout(10000) });
      if (!fetchResponse.ok) continue;

      const fetchData = await fetchResponse.json();
      const results = fetchData.result || {};

      for (const id of ids) {
        const article = results[id];
        if (!article || !article.title) continue;

        const authors = (article.authors || []).map((a: any) => a.name).slice(0, 5);
        const pubDate = article.pubdate ? new Date(article.pubdate) : new Date();

        papers.push({
          externalId: `pubmed:${id}`,
          title: article.title.replace(/<[^>]+>/g, ''),
          authors,
          abstract: article.sorttitle || article.title,
          publishedDate: pubDate,
          source: 'pubmed',
          url: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
        });
      }

      // Rate limit: 3 requests/second for NCBI
      await new Promise(resolve => setTimeout(resolve, 400));
    } catch (err: any) {
      console.warn(`[LIVE MONITOR] PubMed "${term}" failed: ${err.message}`);
    }
  }

  return papers;
}

// ============================================================================
// Crossref API — Free, no auth (polite pool with email)
// ============================================================================

async function fetchCrossrefRecent(terms: string[], maxResults = 5): Promise<MonitoredPaper[]> {
  const papers: MonitoredPaper[] = [];
  const email = process.env.UNPAYWALL_EMAIL || '';

  for (const term of terms) {
    try {
      const params = new URLSearchParams({
        query: term,
        rows: String(maxResults),
        sort: 'published',
        order: 'desc',
        filter: `from-pub-date:${getDateDaysAgo(7)}`,
        ...(email && { mailto: email }),
      });

      const url = `https://api.crossref.org/works?${params}`;
      const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!response.ok) continue;

      const data = await response.json();
      const items = data.message?.items || [];

      for (const item of items) {
        const title = Array.isArray(item.title) ? item.title[0] : item.title;
        if (!title) continue;

        const authors = (item.author || [])
          .map((a: any) => `${a.given || ''} ${a.family || ''}`.trim())
          .filter(Boolean)
          .slice(0, 5);

        const pubDate = item.published?.['date-parts']?.[0]
          ? new Date(item.published['date-parts'][0].join('-'))
          : new Date();

        papers.push({
          externalId: `crossref:${item.DOI || title.slice(0, 50)}`,
          title,
          authors,
          abstract: (item.abstract || '').replace(/<[^>]+>/g, '').slice(0, 1000),
          publishedDate: pubDate,
          source: 'crossref',
          url: item.URL || `https://doi.org/${item.DOI}`,
          doi: item.DOI,
        });
      }
    } catch (err: any) {
      console.warn(`[LIVE MONITOR] Crossref "${term}" failed: ${err.message}`);
    }
  }

  return papers;
}

// ============================================================================
// SIGNAL CREATION — Convert significant papers to editorial signals
// ============================================================================

async function createSignalFromPaper(paper: MonitoredPaper, verticalSlug: string): Promise<boolean> {
  try {
    // Check if signal already exists for this paper
    const existing = await prisma.signal.findFirst({
      where: {
        title: { contains: paper.title.slice(0, 100) },
        createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      },
    });

    if (existing) return false;

    // Find the vertical
    const vertical = await prisma.vertical.findFirst({
      where: { slug: verticalSlug },
    });

    if (!vertical) {
      console.warn(`[LIVE MONITOR] Vertical not found: ${verticalSlug}`);
      return false;
    }

    // Create signal
    const priority = estimatePriority(paper);
    await prisma.signal.create({
      data: {
        title: `New paper: ${paper.title.slice(0, 200)}`,
        summary: `${paper.abstract.slice(0, 500)}\n\nAuthors: ${paper.authors.join(', ')}\nSource: ${paper.source}\nURL: ${paper.url}`,
        signalType: 'NEW_EVIDENCE',
        verticalId: vertical.id,
        noveltyScore: Math.min(95, priority + 10),
        impactScore: priority,
        confidenceScore: paper.doi ? 85 : 65,
        urgencyScore: 60,
        priorityScore: priority,
        sourceIds: [],
        status: 'NEW',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    return true;
  } catch (err: any) {
    console.warn(`[LIVE MONITOR] Signal creation failed for "${paper.title.slice(0, 50)}": ${err.message}`);
    return false;
  }
}

function estimatePriority(paper: MonitoredPaper): number {
  let priority = 50;

  // High-impact indicators
  if (paper.authors.length >= 5) priority += 5; // Collaborative = more credible
  if (paper.abstract.length > 500) priority += 5; // Detailed abstract
  if (paper.doi) priority += 10; // Has DOI = published/peer-reviewed

  // Source credibility
  if (paper.source === 'pubmed') priority += 10; // Peer-reviewed
  if (paper.source === 'crossref') priority += 10; // Published

  // Keyword boosters
  const hotKeywords = ['breakthrough', 'novel', 'first', 'unprecedented', 'paradigm', 'crisis', 'emergency', 'reform'];
  const titleLower = paper.title.toLowerCase();
  for (const kw of hotKeywords) {
    if (titleLower.includes(kw)) { priority += 5; break; }
  }

  return Math.min(95, priority);
}

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

/**
 * Scan all configured feeds for new papers and create signals.
 * Called by auto-scan cron after the main provider search.
 *
 * @param verticalSlugs - Optional: only scan specific verticals
 */
export async function runLiveSourceMonitor(
  verticalSlugs?: string[],
): Promise<LiveMonitorOutput> {
  const start = Date.now();
  console.log(`[LIVE MONITOR] Starting live source monitoring...`);

  const slugsToScan = verticalSlugs || Object.keys(VERTICAL_FEEDS);
  const results: MonitorResult[] = [];
  let totalPapers = 0;
  let totalSignals = 0;

  for (const slug of slugsToScan) {
    const feeds = VERTICAL_FEEDS[slug];
    if (!feeds) continue;

    const result: MonitorResult = {
      source: slug,
      papersFound: 0,
      signalsCreated: 0,
      errors: [],
    };

    // Fetch from all configured sources in parallel
    const [arxivPapers, pubmedPapers, crossrefPapers] = await Promise.allSettled([
      feeds.arxiv ? fetchArxivRecent(feeds.arxiv, 5) : Promise.resolve([]),
      feeds.pubmed ? fetchPubMedRecent(feeds.pubmed, 3) : Promise.resolve([]),
      feeds.crossref ? fetchCrossrefRecent(feeds.crossref, 3) : Promise.resolve([]),
    ]);

    const allPapers: MonitoredPaper[] = [];
    for (const res of [arxivPapers, pubmedPapers, crossrefPapers]) {
      if (res.status === 'fulfilled') {
        allPapers.push(...res.value);
      } else {
        result.errors.push(String(res.reason));
      }
    }

    result.papersFound = allPapers.length;

    // Create signals for significant papers (top 3 per vertical)
    const topPapers = allPapers
      .sort((a, b) => estimatePriority(b) - estimatePriority(a))
      .slice(0, 3);

    for (const paper of topPapers) {
      const created = await createSignalFromPaper(paper, slug);
      if (created) result.signalsCreated++;
    }

    totalPapers += result.papersFound;
    totalSignals += result.signalsCreated;
    results.push(result);

    console.log(`[LIVE MONITOR] ${slug}: ${result.papersFound} papers found, ${result.signalsCreated} signals created`);
  }

  const durationMs = Date.now() - start;
  console.log(`[LIVE MONITOR] ✅ Complete: ${totalPapers} papers scanned, ${totalSignals} signals created (${durationMs}ms)`);

  return { results, totalPapers, totalSignals, durationMs };
}

// ============================================================================
// HELPERS
// ============================================================================

function getDateDaysAgo(days: number): string {
  const d = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return d.toISOString().split('T')[0];
}
