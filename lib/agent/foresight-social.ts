/**
 * Dual-channel social dynamics — SignalStream + PolicyForum
 * Clean-room inspired by OASIS (Twitter/Reddit parallel) without AGPL code
 */

import type { SwarmLeader, SimulationTickEventLite, PersonaActionType } from "./foresight-types";

export type SocialChannel = "signal" | "forum";

export interface SocialPost {
  id: string;
  tick: number;
  channel: SocialChannel;
  authorId: string;
  content: string;
  scenarioLean: string;
  engagement: number;
  virality: number;
  reposts: number;
}

export interface SocialFeed {
  signal: SocialPost[];
  forum: SocialPost[];
}

const MAX_SIGNAL = 40;
const MAX_FORUM = 30;

function trimFeed(feed: SocialFeed): SocialFeed {
  return {
    signal: feed.signal.sort((a, b) => b.engagement - a.engagement).slice(0, MAX_SIGNAL),
    forum: feed.forum.sort((a, b) => b.engagement - a.engagement).slice(0, MAX_FORUM),
  };
}

export function createEmptyFeed(): SocialFeed {
  return { signal: [], forum: [] };
}

export interface SocialTickResult {
  events: SimulationTickEventLite[];
  feed: SocialFeed;
  viralBoost: Record<string, number>;
  postCount: number;
}

export function runSocialTick(
  tick: number,
  personas: SwarmLeader[],
  scenarioNames: string[],
  feed: SocialFeed,
  llmPosts: Array<{ authorId: string; content: string; scenarioLean: string; channel: SocialChannel }>,
  rand: () => number
): SocialTickResult {
  const events: SimulationTickEvent[] = [];
  let postCount = 0;

  for (const post of llmPosts) {
    const id = `p-${tick}-${post.authorId}-${post.channel}`;
    const entry: SocialPost = {
      id,
      tick,
      channel: post.channel,
      authorId: post.authorId,
      content: post.content,
      scenarioLean: post.scenarioLean,
      engagement: 1,
      virality: 0.3 + rand() * 0.5,
      reposts: 0,
    };
    if (post.channel === "signal") feed.signal.push(entry);
    else feed.forum.push(entry);
    postCount++;
    events.push({
      personaId: post.authorId,
      action: "speak" as PersonaActionType,
      content: post.content,
      cost: 0,
      scenarioLean: post.scenarioLean,
    });
  }

  // Numeric agents react to feed (herd + polarization)
  const active = personas.filter((_, i) => rand() > 0.55).slice(0, 8);
  for (const p of active) {
    const channel: SocialChannel = p.archetype === "media" || p.archetype === "public" ? "signal" : "forum";
    const pool = channel === "signal" ? feed.signal : feed.forum;
    const top = pool.slice(0, 3);
    if (!top.length) continue;

    const lean = top.sort((a, b) => b.engagement - a.engagement)[0];
    if (!lean) continue;

    const strength = 0.08 + rand() * 0.12;
    for (const name of scenarioNames) p.positions[name] *= 1 - strength;
    p.positions[lean.scenarioLean] = (p.positions[lean.scenarioLean] ?? 0) + strength;
    const sum = scenarioNames.reduce((s, n) => s + (p.positions[n] ?? 0), 0) || 1;
    scenarioNames.forEach((n) => { p.positions[n] /= sum; });

    if (rand() > 0.6) {
      const reaction = `${p.archetype} reacts to "${lean.content.slice(0, 60)}..."`;
      const repost: SocialPost = {
        id: `r-${tick}-${p.id}`,
        tick,
        channel,
        authorId: p.id,
        content: reaction,
        scenarioLean: lean.scenarioLean,
        engagement: lean.engagement * 0.4,
        virality: lean.virality * 0.7,
        reposts: 1,
      };
      if (channel === "signal") feed.signal.push(repost);
      else feed.forum.push(repost);
      postCount++;
      lean.reposts++;
      lean.engagement += 0.5;
    }
  }

  // Cross-channel amplification (signal → forum spillover)
  for (const sig of feed.signal.slice(0, 5)) {
    if (sig.engagement > 3 && rand() > 0.7) {
      feed.forum.push({
        ...sig,
        id: `x-${sig.id}`,
        channel: "forum",
        engagement: sig.engagement * 0.6,
      });
      postCount++;
    }
  }

  feed = trimFeed(feed);

  const viralBoost: Record<string, number> = {};
  scenarioNames.forEach((n) => { viralBoost[n] = 0; });
  for (const post of [...feed.signal, ...feed.forum]) {
    viralBoost[post.scenarioLean] =
      (viralBoost[post.scenarioLean] ?? 0) + post.engagement * post.virality * 0.02;
  }
  for (const name of scenarioNames) {
    viralBoost[name] = Math.min(0.45, viralBoost[name] ?? 0);
  }

  return { events, feed, viralBoost, postCount };
}

export function summarizeFeed(feed: SocialFeed): {
  topSignal: string[];
  topForum: string[];
  totalPosts: number;
} {
  return {
    topSignal: feed.signal.slice(0, 3).map((p) => p.content.slice(0, 100)),
    topForum: feed.forum.slice(0, 3).map((p) => p.content.slice(0, 100)),
    totalPosts: feed.signal.length + feed.forum.length,
  };
}
