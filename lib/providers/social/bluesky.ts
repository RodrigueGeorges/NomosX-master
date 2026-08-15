/**
 * Bluesky Social Signal Provider — Decentralized Social Network
 *
 * Bluesky (bsky.social) is a decentralized social network built on the
 * AT Protocol. Increasingly popular with academics, journalists, and
 * policy experts as an alternative to X/Twitter. Many researchers and
 * think tank analysts are active here.
 *
 * API: Public REST API (JSON), no key required for public search.
 *   AT Protocol: https://atproto.com/
 *   Public API: https://public.api.bsky.app/
 * Rate limit: Generous for unauthenticated reads.
 *
 * USAGE: Signal detection only — feeds signal-detector.ts and
 *   radar-agent.ts. Never enters the SCOUT→INDEX→RANK evidence pipeline.
 */

import { getRateLimiter } from '../../http-client';
import type { SocialSignal } from './reddit';

/**
 * Search Bluesky for posts matching the query.
 * Uses the public app.bsky API for searching posts.
 */
export async function searchBlueskySignals(query: string, limit = 25): Promise<SocialSignal[]> {
  try {
    const limiter = getRateLimiter('bluesky');
    if (limiter) await limiter.acquire();

    // Bluesky public search API — search posts
    const url = `https://public.api.bsky.app/xrpc/app.bsky.feed.searchPosts?q=${encodeURIComponent(query)}&limit=${Math.min(limit, 50)}`;

    const res = await fetch(url, {
      signal: AbortSignal.timeout(10000),
      headers: {
        Accept: 'application/json',
        'User-Agent': 'NomosX Research Bot (+https://nomosx.com)',
      },
    });

    if (!res.ok) {
      console.warn(`[Bluesky] HTTP ${res.status}`);
      return [];
    }

    const data: any = await res.json();
    const posts: any[] = data?.posts || [];

    const signals: SocialSignal[] = posts
      .filter((p: any) => p.record?.text)
      .map((p: any) => ({
        id: `bluesky:${p.uri || p.cid}`,
        platform: 'bluesky' as const,
        type: 'social_post' as const,
        title: (p.record?.text || '').slice(0, 200),
        body: (p.record?.text || '').slice(0, 2000),
        url: p.uri ? `https://bsky.app/profile/${p.author?.handle}/post/${p.uri.split('/').pop()}` : null,
        author: p.author?.handle || p.author?.displayName || null,
        community: p.author?.handle || 'Bluesky',
        score: p.likeCount || p.repostCount || 0,
        commentCount: p.replyCount || 0,
        createdAt: p.record?.createdAt || null,
        keywords: [],
        raw: {
          uri: p.uri,
          likeCount: p.likeCount,
          repostCount: p.repostCount,
          replyCount: p.replyCount,
        },
      }));

    console.log(`[Bluesky] Found ${signals.length} signals`);
    return signals;
  } catch (error: any) {
    console.error(`[Bluesky] Search failed: ${error.message}`);
    return [];
  }
}
