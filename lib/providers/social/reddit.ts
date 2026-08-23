/**
 * Reddit Social Signal Provider — Expert Subreddit Monitoring
 *
 * Reddit hosts expert communities across virtually every domain. Key
 * subreddits for research signal detection:
 *   - r/science, r/AskScience — peer-reviewed research discussion
 *   - r/economics, r/AskEconomics — economic policy debates
 *   - r/geopolitics, r/foreignpolicy — strategic analysis
 *   - r/MachineLearning, r/artificial — AI/ML research community
 *   - r/energy, r/nuclear — energy policy & technology
 *   - r/climate, r/environment — climate science discussion
 *
 * API: Reddit API v1, requires app credentials.
 *   Set REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET environment variables.
 *   Free tier: 100 requests/minute (OAuth2 client_credentials flow).
 * Docs: https://www.reddit.com/dev/api/
 *
 * USAGE: Signal detection only — feeds signal-detector.ts and
 *   radar-agent.ts. Never enters the SCOUT→INDEX→RANK evidence pipeline.
 *   Returns SocialSignal objects, not ScoutResult.
 *
 * Graceful skip: If credentials not set, returns empty array.
 */

import { fetchFromProvider, httpPost } from '../../http-client';

export interface SocialSignal {
  id: string;
  platform: 'reddit' | 'hackernews' | 'bluesky';
  type: 'social_post' | 'social_comment' | 'social_thread';
  title: string;
  body: string;
  url: string | null;
  author: string | null;
  community: string | null; // subreddit, HN, bluesky handle
  score: number; // upvotes, points, likes
  commentCount: number;
  createdAt: string | null;
  keywords: string[];
  raw: any;
}

// Expert subreddits to monitor — curated for signal quality
const EXPERT_SUBREDDITS: Record<string, string[]> = {
  science: ['science', 'AskScience', 'EverythingScience'],
  economics: ['economics', 'AskEconomics', 'EconomicsFinance'],
  geopolitics: ['geopolitics', 'foreignpolicy', 'CredibleDefense', 'LessCredibleDefence'],
  ai: ['MachineLearning', 'artificial', 'MachineLearningDiscussions', 'deeplearning'],
  energy: ['energy', 'nuclear', 'RenewableEnergy', 'electricity'],
  climate: ['climate', 'environment', 'ClimateActionPlan', 'ClimateOffensive'],
  policy: ['PolicyAB', 'policy', 'worldnews', 'geopolitics'],
  tech: ['technology', 'Futurology', 'realtech'],
  health: ['PublicHealth', 'Health', 'medicine', 'Epidemiology'],
  law: ['law', 'LegalAdvice', 'LawFirm'],
};

let cachedToken: { token: string; expires: number } | null = null;

async function getRedditToken(): Promise<string | null> {
  const clientId = process.env.REDDIT_CLIENT_ID;
  const clientSecret = process.env.REDDIT_CLIENT_SECRET;

  if (!clientId || !clientSecret) return null;

  // Return cached token if still valid
  if (cachedToken && cachedToken.expires > Date.now() + 60000) {
    return cachedToken.token;
  }

  try {
    // OAuth2 client_credentials flow requires POST with form-urlencoded body
    const data: any = await httpPost('https://www.reddit.com/api/v1/access_token',
      'grant_type=client_credentials',
      {
        timeout: 10000,
        retries: 2,
        rateLimiterKey: 'reddit',
        headers: {
          'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'NomosX/1.0 (research bot)',
        },
      });

    if (!data) return null;
    cachedToken = {
      token: data.access_token,
      expires: Date.now() + (data.expires_in * 1000),
    };
    return data.access_token;
  } catch {
    return null;
  }
}

/**
 * Search Reddit for posts matching the query across expert subreddits.
 * Returns SocialSignal objects for signal detection.
 */
export async function searchRedditSignals(query: string, limit = 25): Promise<SocialSignal[]> {
  const token = await getRedditToken();
  if (!token) {
    console.log('[Reddit] No REDDIT_CLIENT_ID/REDDIT_CLIENT_SECRET set, skipping');
    return [];
  }

  // Detect relevant subreddits from query keywords
  const queryLower = query.toLowerCase();
  const relevantSubreddits = new Set<string>();
  for (const [domain, subs] of Object.entries(EXPERT_SUBREDDITS)) {
    if (queryLower.includes(domain) || queryLower.includes(domain.slice(0, -1))) {
      subs.forEach(s => relevantSubreddits.add(s));
    }
  }
  // Always include r/science and r/worldnews as baseline
  relevantSubreddits.add('science');
  relevantSubreddits.add('worldnews');

  const subreddits = Array.from(relevantSubreddits).slice(0, 5);
  const signals: SocialSignal[] = [];

  for (const subreddit of subreddits) {
    try {
      const url = `https://oauth.reddit.com/r/${subreddit}/search?q=${encodeURIComponent(query)}&restrict_sr=1&sort=relevance&t=year&limit=${Math.ceil(limit / subreddits.length)}`;

      const data: any = await fetchFromProvider('reddit', url, {
        timeout: 10000,
        retries: 2,
        headers: {
          'Authorization': `Bearer ${token}`,
          'User-Agent': 'NomosX/1.0 (research bot)',
        },
      });

      if (!data) continue;
      const posts = data?.data?.children || [];

      for (const post of posts) {
        const p = post.data;
        signals.push({
          id: `reddit:${p.id}`,
          platform: 'reddit',
          type: 'social_post',
          title: p.title || '',
          body: (p.selftext || '').slice(0, 2000),
          url: p.url && !p.url.startsWith('/r/') ? p.url : `https://reddit.com${p.permalink}`,
          author: p.author || null,
          community: `r/${p.subreddit}`,
          score: p.score || 0,
          commentCount: p.num_comments || 0,
          createdAt: p.created_utc ? new Date(p.created_utc * 1000).toISOString() : null,
          keywords: [],
          raw: { id: p.id, subreddit: p.subreddit, score: p.score, comments: p.num_comments },
        });
      }
    } catch (error: any) {
      console.warn(`[Reddit] r/${subreddit} failed: ${error.message}`);
    }
  }

  console.log(`[Reddit] Found ${signals.length} signals from ${subreddits.length} subreddits`);
  return signals;
}
