/**
 * MEGA FEED REGISTRY — aggregates all feed registries into one searchable set.
 *
 * Total: ~560 registered sources. Per query, `searchMegaFeeds` selects at most
 * `maxFeeds` feeds scored by domain/keyword relevance — the scout never fires
 * all 500, so latency stays bounded (~20 feeds × 9s worst-case = <30s).
 */

import { searchFeedSet, type FeedSource } from './feed-engine';
import { CENTRAL_BANK_FEEDS } from './central-banks';
import { STATS_OFFICE_FEEDS } from './stats-offices';
import { UN_SYSTEM_FEEDS, EU_AGENCY_FEEDS } from './un-eu-agencies';
import { GLOBAL_PRESS_FEEDS } from './global-press';
import { THINK_TANK_EXTENDED_FEEDS, DEVELOPMENT_FEEDS } from './think-tanks-extended';
import { ACADEMIA_FEEDS, CIVIL_SOCIETY_FEEDS } from './academia-society';

export const MEGA_FEEDS: FeedSource[] = [
  ...CENTRAL_BANK_FEEDS,
  ...STATS_OFFICE_FEEDS,
  ...UN_SYSTEM_FEEDS,
  ...EU_AGENCY_FEEDS,
  ...GLOBAL_PRESS_FEEDS,
  ...THINK_TANK_EXTENDED_FEEDS,
  ...DEVELOPMENT_FEEDS,
  ...ACADEMIA_FEEDS,
  ...CIVIL_SOCIETY_FEEDS,
];

/** Curated subsets exposed as named scout providers. */
export const FEED_SUBSETS: Record<string, FeedSource[]> = {
  'mega-central-banks': CENTRAL_BANK_FEEDS,
  'mega-stats': STATS_OFFICE_FEEDS,
  'mega-un': UN_SYSTEM_FEEDS,
  'mega-eu': EU_AGENCY_FEEDS,
  'mega-press': GLOBAL_PRESS_FEEDS,
  'mega-thinktanks': THINK_TANK_EXTENDED_FEEDS,
  'mega-development': DEVELOPMENT_FEEDS,
  'mega-academia': ACADEMIA_FEEDS,
  'mega-civil-society': CIVIL_SOCIETY_FEEDS,
};

/** Names that trigger a specific subset vs the whole registry. */
export function searchFeedSubset(name: string, query: string, limit = 20, domainHint?: string) {
  const feeds = FEED_SUBSETS[name] ?? MEGA_FEEDS;
  // Smaller subsets can afford more feeds per query.
  const maxFeeds = feeds.length <= 60 ? 20 : 24;
  return searchFeedSet(query, feeds, { limit, maxFeeds, domainHint });
}
