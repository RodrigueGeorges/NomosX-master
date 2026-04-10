/**
 * NomosX News Intelligence Provider
 * 
 * Real-time event and news monitoring layer.
 * Complements academic sources (OpenAlex, CrossRef) with live intelligence.
 * 
 * Sources:
 * 1. GDELT Project (free, no key) — Global event monitoring, 100+ languages
 * 2. NewsAPI (optional key) — Headlines from Reuters, AP, BBC, Al Jazeera, etc.
 * 3. RSS Think Tank feeds — IISS, CSIS, ICG, Brookings, Chatham House, RAND
 * 
 * Output: Normalized NewsSignal[] that feeds into signal-detector
 */

// ============================================================================
// TYPES
// ============================================================================

export interface NewsSignal {
  id: string;
  title: string;
  summary: string;
  url: string;
  source: string;
  provider: "gdelt" | "newsapi" | "rss-think-tank";
  publishedAt: Date;
  language: string;
  categories: string[];
  locations: string[];
  relevanceScore: number; // 0-100
  urgency: "critical" | "high" | "medium" | "low";
}

export interface NewsIntelligenceOutput {
  signals: NewsSignal[];
  totalFetched: number;
  byProvider: Record<string, number>;
  durationMs: number;
}

interface GDELTArticle {
  url: string;
  url_mobile: string;
  title: string;
  seendate: string;
  socialimage: string;
  domain: string;
  language: string;
  sourcecountry: string;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const GDELT_BASE = "https://api.gdeltproject.org/api/v2/doc/doc";

const THINK_TANK_RSS_FEEDS: { name: string; url: string; vertical: string }[] = [
  // Security & Geopolitics (verified working)
  { name: "ICG", url: "https://www.crisisgroup.org/rss.xml", vertical: "geopolitics" },
  { name: "CSIS", url: "https://www.csis.org/rss.xml", vertical: "geopolitics" },
  { name: "CFR", url: "https://feeds.cfr.org/cfr_main", vertical: "geopolitics" },
  { name: "Atlantic Council", url: "https://www.atlanticcouncil.org/feed/", vertical: "geopolitics" },
  // EU Policy & Economics (verified working)
  { name: "Bruegel", url: "https://www.bruegel.org/rss.xml", vertical: "eu-policy" },
  // AI & Technology (verified working)
  { name: "CSET Georgetown", url: "https://cset.georgetown.edu/feed/", vertical: "ai-labor" },
  { name: "AI Now Institute", url: "https://ainowinstitute.org/feed", vertical: "ai-labor" },
  // Finance (verified working)
  { name: "ECB Blog", url: "https://www.ecb.europa.eu/rss/blog.html", vertical: "finance-regulation" },
];

// Vertical-specific GDELT queries for comprehensive coverage
const GDELT_QUERIES: { query: string; vertical: string; urgencyBoost: number }[] = [
  // Geopolitics & Security
  { query: "war OR military conflict OR armed forces OR invasion", vertical: "geopolitics", urgencyBoost: 20 },
  { query: "nuclear weapons OR missile OR military escalation", vertical: "geopolitics", urgencyBoost: 25 },
  { query: "sanctions OR embargo OR diplomatic crisis", vertical: "geopolitics", urgencyBoost: 15 },
  { query: "peace talks OR ceasefire OR treaty negotiation", vertical: "geopolitics", urgencyBoost: 10 },
  { query: "coup OR regime change OR political crisis", vertical: "geopolitics", urgencyBoost: 20 },
  { query: "NATO OR UN Security Council OR G7 OR G20", vertical: "geopolitics", urgencyBoost: 10 },
  { query: "Iran OR Russia OR China OR North Korea military", vertical: "geopolitics", urgencyBoost: 15 },
  { query: "Middle East crisis OR Gaza OR Taiwan strait", vertical: "geopolitics", urgencyBoost: 20 },
  { query: "cybersecurity attack OR critical infrastructure", vertical: "geopolitics", urgencyBoost: 15 },
  { query: "terrorism OR insurgency OR extremism", vertical: "geopolitics", urgencyBoost: 15 },
  // EU Policy
  { query: "European Commission regulation OR EU directive", vertical: "eu-policy", urgencyBoost: 10 },
  { query: "EU summit OR European Council decision", vertical: "eu-policy", urgencyBoost: 15 },
  { query: "Brexit OR EU enlargement OR Schengen", vertical: "eu-policy", urgencyBoost: 10 },
  { query: "GDPR enforcement OR Digital Services Act OR AI Act", vertical: "eu-policy", urgencyBoost: 10 },
  // Climate & Energy
  { query: "climate emergency OR extreme weather OR natural disaster", vertical: "climate-industry", urgencyBoost: 15 },
  { query: "COP climate OR IPCC report OR Paris Agreement", vertical: "climate-industry", urgencyBoost: 10 },
  { query: "renewable energy breakthrough OR nuclear fusion", vertical: "climate-industry", urgencyBoost: 10 },
  { query: "carbon tax OR emissions trading OR CBAM", vertical: "climate-industry", urgencyBoost: 10 },
  { query: "oil crisis OR energy shortage OR OPEC", vertical: "climate-industry", urgencyBoost: 15 },
  // AI & Labor
  { query: "artificial intelligence regulation OR AI policy", vertical: "ai-labor", urgencyBoost: 10 },
  { query: "AI breakthrough OR large language model OR AGI", vertical: "ai-labor", urgencyBoost: 10 },
  { query: "automation job loss OR workforce disruption", vertical: "ai-labor", urgencyBoost: 10 },
  { query: "AI safety OR alignment OR existential risk", vertical: "ai-labor", urgencyBoost: 15 },
  // Finance & Regulation
  { query: "financial crisis OR bank collapse OR market crash", vertical: "finance-regulation", urgencyBoost: 20 },
  { query: "central bank interest rate OR monetary policy", vertical: "finance-regulation", urgencyBoost: 10 },
  { query: "cryptocurrency regulation OR stablecoin OR CBDC", vertical: "finance-regulation", urgencyBoost: 10 },
  { query: "Basel regulation OR banking reform OR systemic risk", vertical: "finance-regulation", urgencyBoost: 10 },
];

// ============================================================================
// GDELT PROVIDER (free, no API key required)
// ============================================================================

async function fetchGDELT(query: string, vertical: string, urgencyBoost: number): Promise<NewsSignal[]> {
  try {
    const params = new URLSearchParams({
      query: query,
      mode: "ArtList",
      maxrecords: "10",
      timespan: "48h",
      format: "json",
      sort: "DateDesc",
    });

    const response = await fetch(`${GDELT_BASE}?${params.toString()}`, {
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      console.warn(`[NEWS_INTEL/GDELT] Query "${query.slice(0, 40)}..." returned ${response.status}`);
      return [];
    }

    // GDELT returns plain text errors ("One or more errors...") with HTTP 200
    const rawText = await response.text();
    let data: any;
    try {
      data = JSON.parse(rawText);
    } catch {
      console.warn(`[NEWS_INTEL/GDELT] Non-JSON response: ${rawText.slice(0, 120)}`);
      return [];
    }
    const articles: GDELTArticle[] = data.articles || [];

    return articles.slice(0, 5).map((article, i) => {
      const baseRelevance = 60 + urgencyBoost;
      const relevanceScore = Math.min(baseRelevance + (5 - i) * 3, 100);

      return {
        id: `gdelt:${hashString(article.url)}`,
        title: cleanTitle(article.title),
        summary: `${article.domain} — ${cleanTitle(article.title)}`,
        url: article.url,
        source: article.domain,
        provider: "gdelt" as const,
        publishedAt: parseGDELTDate(article.seendate),
        language: article.language || "English",
        categories: [vertical],
        locations: article.sourcecountry ? [article.sourcecountry] : [],
        relevanceScore,
        urgency: relevanceScore >= 90 ? "critical" : relevanceScore >= 75 ? "high" : relevanceScore >= 60 ? "medium" : "low",
      };
    });
  } catch (error: any) {
    console.warn(`[NEWS_INTEL/GDELT] Fetch failed for "${query.slice(0, 30)}...": ${error.message}`);
    return [];
  }
}

// ============================================================================
// NEWSAPI PROVIDER (optional, requires NEWSAPI_KEY)
// ============================================================================

async function fetchNewsAPI(vertical: string): Promise<NewsSignal[]> {
  const apiKey = process.env.NEWSAPI_KEY;
  if (!apiKey) return [];

  const verticalQueries: Record<string, string> = {
    "geopolitics": "war OR military OR sanctions OR diplomacy OR geopolitics",
    "eu-policy": "European Union OR EU regulation OR European Commission",
    "climate-industry": "climate change OR renewable energy OR carbon emissions",
    "ai-labor": "artificial intelligence OR AI regulation OR automation",
    "finance-regulation": "central bank OR financial regulation OR cryptocurrency",
  };

  const query = verticalQueries[vertical];
  if (!query) return [];

  try {
    const params = new URLSearchParams({
      q: query,
      language: "en",
      sortBy: "publishedAt",
      pageSize: "10",
      apiKey,
    });

    const response = await fetch(`https://newsapi.org/v2/everything?${params.toString()}`, {
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) return [];

    const data = await response.json();
    const articles = data.articles || [];

    return articles.slice(0, 5).map((article: any, i: number) => ({
      id: `newsapi:${hashString(article.url || article.title)}`,
      title: cleanTitle(article.title),
      summary: article.description || article.title,
      url: article.url,
      source: article.source?.name || "NewsAPI",
      provider: "newsapi" as const,
      publishedAt: new Date(article.publishedAt),
      language: "en",
      categories: [vertical],
      locations: [],
      relevanceScore: 70 + (5 - i) * 4,
      urgency: i < 2 ? "high" : "medium",
    }));
  } catch (error: any) {
    console.warn(`[NEWS_INTEL/NewsAPI] Fetch failed: ${error.message}`);
    return [];
  }
}

// ============================================================================
// RSS THINK TANK PROVIDER (free, no key)
// ============================================================================

async function fetchRSSFeed(feed: { name: string; url: string; vertical: string }): Promise<NewsSignal[]> {
  try {
    const response = await fetch(feed.url, {
      signal: AbortSignal.timeout(8000),
      headers: { "User-Agent": "NomosX-ThinkTank/1.0" },
    });

    if (!response.ok) return [];

    const xml = await response.text();
    const items = parseRSSItems(xml);

    return items.slice(0, 3).map((item, i) => ({
      id: `rss:${hashString(item.link || item.title)}`,
      title: cleanTitle(item.title),
      summary: cleanHTML(item.description).slice(0, 500),
      url: item.link,
      source: feed.name,
      provider: "rss-think-tank" as const,
      publishedAt: item.pubDate ? new Date(item.pubDate) : new Date(),
      language: "en",
      categories: [feed.vertical],
      locations: [],
      relevanceScore: 75 + (3 - i) * 5,
      urgency: "medium" as const,
    }));
  } catch (error: any) {
    // RSS feeds often fail silently — that's fine
    return [];
  }
}

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

/**
 * Fetch news intelligence from all providers for specified verticals.
 * Called by auto-scan cron to feed into signal detector.
 */
export async function fetchNewsIntelligence(
  verticalSlugs?: string[]
): Promise<NewsIntelligenceOutput> {
  const start = Date.now();
  const allSignals: NewsSignal[] = [];
  const byProvider: Record<string, number> = { gdelt: 0, newsapi: 0, "rss-think-tank": 0 };

  const targetVerticals = verticalSlugs || ["geopolitics", "eu-policy", "climate-industry", "ai-labor", "finance-regulation"];

  console.log(`[NEWS_INTEL] Fetching live intelligence for ${targetVerticals.length} verticals...`);

  // ── GDELT (parallel per query, grouped by vertical) ──
  const gdeltQueries = GDELT_QUERIES.filter(q => targetVerticals.includes(q.vertical));
  const gdeltPromises = gdeltQueries.map(q => fetchGDELT(q.query, q.vertical, q.urgencyBoost));
  const gdeltResults = await Promise.allSettled(gdeltPromises);

  for (const result of gdeltResults) {
    if (result.status === "fulfilled") {
      allSignals.push(...result.value);
      byProvider.gdelt += result.value.length;
    }
  }

  // Rate limit between provider types
  await new Promise(r => setTimeout(r, 500));

  // ── NewsAPI (one call per vertical, optional) ──
  if (process.env.NEWSAPI_KEY) {
    const newsPromises = targetVerticals.map(v => fetchNewsAPI(v));
    const newsResults = await Promise.allSettled(newsPromises);

    for (const result of newsResults) {
      if (result.status === "fulfilled") {
        allSignals.push(...result.value);
        byProvider.newsapi += result.value.length;
      }
    }
  }

  await new Promise(r => setTimeout(r, 500));

  // ── RSS Think Tank feeds (parallel, filtered by vertical) ──
  const targetFeeds = THINK_TANK_RSS_FEEDS.filter(f => targetVerticals.includes(f.vertical));
  const rssPromises = targetFeeds.map(f => fetchRSSFeed(f));
  const rssResults = await Promise.allSettled(rssPromises);

  for (const result of rssResults) {
    if (result.status === "fulfilled") {
      allSignals.push(...result.value);
      byProvider["rss-think-tank"] += result.value.length;
    }
  }

  // ── Deduplicate by title similarity ──
  const deduped = deduplicateSignals(allSignals);

  // ── Sort by relevance ──
  deduped.sort((a, b) => b.relevanceScore - a.relevanceScore);

  const durationMs = Date.now() - start;
  console.log(`[NEWS_INTEL] ✅ ${deduped.length} signals (GDELT: ${byProvider.gdelt}, NewsAPI: ${byProvider.newsapi}, RSS: ${byProvider["rss-think-tank"]}) in ${durationMs}ms`);

  return {
    signals: deduped,
    totalFetched: allSignals.length,
    byProvider,
    durationMs,
  };
}

// ============================================================================
// HELPERS
// ============================================================================

function deduplicateSignals(signals: NewsSignal[]): NewsSignal[] {
  const seen = new Map<string, NewsSignal>();

  for (const signal of signals) {
    const normalized = signal.title.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
    const words = normalized.split(/\s+/).filter(w => w.length > 3);
    const key = words.slice(0, 6).join(" ");

    const existing = seen.get(key);
    if (!existing || signal.relevanceScore > existing.relevanceScore) {
      seen.set(key, signal);
    }
  }

  return Array.from(seen.values());
}

function parseGDELTDate(dateStr: string): Date {
  if (!dateStr) return new Date();
  // GDELT format: "20260306T120000Z" or "2026-03-06"
  try {
    if (dateStr.includes("T")) {
      const y = dateStr.slice(0, 4);
      const m = dateStr.slice(4, 6);
      const d = dateStr.slice(6, 8);
      const h = dateStr.slice(9, 11);
      const min = dateStr.slice(11, 13);
      return new Date(`${y}-${m}-${d}T${h}:${min}:00Z`);
    }
    return new Date(dateStr);
  } catch {
    return new Date();
  }
}

function parseRSSItems(xml: string): { title: string; link: string; description: string; pubDate: string }[] {
  const items: { title: string; link: string; description: string; pubDate: string }[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match;

  while ((match = itemRegex.exec(xml)) !== null) {
    const content = match[1];
    const title = extractTag(content, "title");
    const link = extractTag(content, "link");
    const description = extractTag(content, "description");
    const pubDate = extractTag(content, "pubDate");

    if (title) {
      items.push({ title, link, description, pubDate });
    }
  }

  return items;
}

function extractTag(xml: string, tag: string): string {
  const regex = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>|<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i");
  const match = regex.exec(xml);
  return (match?.[1] || match?.[2] || "").trim();
}

function cleanTitle(title: string): string {
  if (!title) return "";
  return title
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanHTML(html: string): string {
  if (!html) return "";
  return html.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}
