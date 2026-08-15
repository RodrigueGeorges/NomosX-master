/**
 * Hacker News Social Signal Provider — Tech & Policy Discussion
 *
 * Hacker News (news.ycombinator.com) is the premier community for
 * technology, startups, and policy-adjacent discussions. Run by Y
 * Combinator. High-signal discussions on AI, cybersecurity, tech
 * policy, economics, and emerging technologies.
 *
 * API: Public REST API (JSON), no key required.
 *   Algolia HN Search API: https://hn.algolia.com/api
 *   Official Firebase API: https://github.com/HackerNews/API
 * Rate limit: None (Algolia), generous.
 *
 * USAGE: Signal detection only — feeds signal-detector.ts and
 *   radar-agent.ts. Never enters the SCOUT→INDEX→RANK evidence pipeline.
 */

import { getRateLimiter } from '../../http-client';
import type { SocialSignal } from './reddit';

/**
 * Search Hacker News for stories and comments matching the query.
 * Uses the Algolia search API for full-text search.
 */
export async function searchHackerNewsSignals(query: string, limit = 25): Promise<SocialSignal[]> {
  try {
    const limiter = getRateLimiter('hackernews');
    if (limiter) await limiter.acquire();

    // Algolia HN Search — search stories (more substantive than comments)
    const url = `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(query)}&tags=story&hitsPerPage=${Math.min(limit, 50)}`;

    const res = await fetch(url, {
      signal: AbortSignal.timeout(10000),
      headers: {
        Accept: 'application/json',
        'User-Agent': 'NomosX Research Bot (+https://nomosx.com)',
      },
    });

    if (!res.ok) {
      console.warn(`[HackerNews] HTTP ${res.status}`);
      return [];
    }

    const data: any = await res.json();
    const hits: any[] = data?.hits || [];

    const signals: SocialSignal[] = hits
      .filter((h: any) => h.title || h.story_title)
      .map((h: any) => ({
        id: `hackernews:${h.objectID}`,
        platform: 'hackernews' as const,
        type: 'social_post' as const,
        title: h.title || h.story_title || '',
        body: (h.story_text || h.comment_text || '').slice(0, 2000),
        url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
        author: h.author || null,
        community: 'Hacker News',
        score: h.points || 0,
        commentCount: h.num_comments || 0,
        createdAt: h.created_at || null,
        keywords: h._tags || [],
        raw: { id: h.objectID, points: h.points, comments: h.num_comments },
      }));

    console.log(`[HackerNews] Found ${signals.length} signals`);
    return signals;
  } catch (error: any) {
    console.error(`[HackerNews] Search failed: ${error.message}`);
    return [];
  }
}
