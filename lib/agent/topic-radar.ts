/**
 * NomosX TOPIC RADAR V3 — Maximum Coverage Breaking Topic Detection
 *
 * 6 parallel source sweeps, <35 seconds total:
 *
 *   1. GDELT      — 14 verticals: geopolitics, AI, climate, health, finance,
 *                   energy, trade, cyber, biotech, emerging-mkts, social, science, EU, digital
 *   2. RSS Elite  — 30 feeds: think tanks + news wires + central banks + policy orgs
 *   3. Academic   — OpenAlex trending + arXiv (cs/econ/q-fin) + Semantic Scholar
 *   4. Policy/Data— NBER, VoxEU, World Bank, IMF Blog, Eurostat, UN News
 *   5. Institutions— ECB, BIS, OECD, WTO, ILO, WHO, NATO, IAEA releases (RSS)
 *   6. DB Signals — Existing high-priority unprocessed signals
 *
 * Scoring:  base_score + recency_decay + source_tier_bonus + urgency_keyword_bonus
 * Dedup:    Jaccard word-overlap (≥60% → merge, keep highest score)
 * Output:   Top N topics, scored, deduped, vertically tagged
 */

import { prisma } from '../db';
import { getTopicRadarQueries } from '../researchers';
import { fetchFromProvider, httpGet } from '../http-client';
import {
  computeTopicVelocities,
  detectAnticipatoryOutliers,
  classifySourceDomain,
  type SignalTrajectory,
  type TopicVelocity,
  type AnticipatoryOutlier,
} from './radar-innovations';

// In-memory TTL cache: avoids hammering APIs on rapid repeated calls
let _cachedResult: { result: RadarSweepResult; expiresAt: number } | null = null;
const CACHE_TTL_MS = 12 * 60 * 1000; // 12 minutes

// ============================================================================
// TYPES
// ============================================================================

export interface RadarTopic {
  id: string;
  title: string;
  summary: string;
  url?: string;
  source: string;
  sourceType: 'news' | 'think-tank' | 'academic' | 'signal' | 'data' | 'policy' | 'institutional';
  publishedAt: Date | null;
  score: number;
  vertical?: string;
  crossChannelBoost?: number;
  channels?: string[];
  signalStrength?: 'breaking' | 'emerging' | 'routine';
  // ── 2026 Innovations ──
  trajectory?: SignalTrajectory;       // C: emerging/bursting/stable/fading/new
  velocityBonus?: number;              // A: BERTrend velocity boost
  isAnticipatoryOutlier?: boolean;     // B: doesn't match any cluster
  outlierBoost?: number;               // B: score boost for anticipatory outliers
  sourceDomain?: string;               // I: academic/news/government/think-tank/general
  credibilityScore?: number;           // I: domain-aware credibility 0-1
}

export interface RadarSweepResult {
  topics: RadarTopic[];
  stats: {
    gdeltFetched: number;
    rssFetched: number;
    academicFetched: number;
    policyFetched: number;
    institutionalFetched: number;
    dbSignals: number;
    totalRaw: number;
    afterDedup: number;
    crossChannelCollisions: number;
    durationMs: number;
    crossSourceSignals?: { clustersDetected: number; topScore: number };
  };
}

// ============================================================================
// CONFIGURATION V3 — Maximum coverage
// ============================================================================

/** 14 verticals — high-recall queries with urgency bonus */
const GDELT_SWEEP_QUERIES: { query: string; vertical: string; urgencyBonus: number }[] = [
  { query: "war OR military strike OR sanctions OR coup OR invasion OR ceasefire OR nuclear threat OR armed conflict", vertical: "geopolitics", urgencyBonus: 15 },
  { query: "EU regulation OR European Commission OR AI Act OR ECB decision OR eurozone OR Brussels directive", vertical: "eu-policy", urgencyBonus: 5 },
  { query: "climate emergency OR IPCC report OR COP OR carbon tax OR extreme weather OR heatwave record OR sea level", vertical: "climate", urgencyBonus: 10 },
  { query: "artificial intelligence OR AGI OR large language model OR AI regulation OR AI safety OR generative AI", vertical: "ai-technology", urgencyBonus: 10 },
  { query: "financial crisis OR central bank OR interest rate hike OR bank failure OR recession OR sovereign debt", vertical: "finance-macro", urgencyBonus: 12 },
  { query: "pandemic OR epidemic OR WHO emergency OR drug approval OR clinical trial OR antimicrobial resistance", vertical: "health-biotech", urgencyBonus: 15 },
  { query: "energy crisis OR oil price OR gas pipeline OR nuclear plant OR renewable breakthrough OR energy security", vertical: "energy", urgencyBonus: 10 },
  { query: "trade war OR tariffs OR WTO ruling OR supply chain OR semiconductor OR export controls OR trade deal", vertical: "trade", urgencyBonus: 8 },
  { query: "cyber attack OR data breach OR ransomware OR critical infrastructure hack OR state-sponsored espionage", vertical: "cybersecurity", urgencyBonus: 15 },
  { query: "China economy OR India GDP OR BRICS OR emerging market crisis OR IMF bailout OR debt restructuring", vertical: "emerging-markets", urgencyBonus: 5 },
  { query: "biotech OR CRISPR therapy OR gene editing OR mRNA OR longevity research OR synthetic biology", vertical: "biotechnology", urgencyBonus: 8 },
  { query: "social unrest OR protests OR inequality OR labor strike OR food insecurity OR migration crisis", vertical: "social-stability", urgencyBonus: 10 },
  { query: "platform regulation OR antitrust tech OR Big Tech lawsuit OR data privacy law OR digital sovereignty", vertical: "digital-governance", urgencyBonus: 5 },
  { query: "quantum computing OR nuclear fusion breakthrough OR space mission OR Nobel Prize OR scientific discovery", vertical: "science-frontier", urgencyBonus: 8 },
  // P1-H: Global South verticals (BENI Global 10 inspired)
  { query: "Africa development OR African Union OR ECOWAS OR Sahel conflict OR debt relief Africa OR African tech startup", vertical: "africa", urgencyBonus: 8 },
  { query: "Latin America election OR Amazon deforestation OR cocaine trafficking OR leftist government OR lithium mining", vertical: "latin-america", urgencyBonus: 8 },
  { query: "Southeast Asia ASEAN OR South China Sea OR Myanmar crisis OR Indonesia election OR Vietnam economy", vertical: "southeast-asia", urgencyBonus: 8 },
  { query: "Middle East conflict OR Iran nuclear OR Saudi Arabia OR Israel Palestine OR Gulf states OR oil price OPEC", vertical: "middle-east", urgencyBonus: 12 },
  { query: "India election OR Modi OR Pakistan crisis OR Bangladesh garment OR Sri Lanka economy OR Nepal", vertical: "south-asia", urgencyBonus: 8 },
];

/** Source tier score bonuses */
const TIER_BONUS: Record<'A' | 'B' | 'C', number> = { A: 15, B: 8, C: 3 };

/** Urgency keywords that boost score */
const URGENCY_PATTERNS: { re: RegExp; bonus: number }[] = [
  { re: /\b(breaking|emergency|crisis|urgent|alert|imminent|immediate)\b/i, bonus: 18 },
  { re: /\b(collapse|invasion|attack|outbreak|explosion|crash|breach|failure)\b/i, bonus: 14 },
  { re: /\b(record|unprecedented|historic|landmark|breakthrough|first.ever)\b/i, bonus: 9 },
  { re: /\b(ban|sanction|embargo|resign|election|summit|vote)\b/i, bonus: 6 },
  // NomosX: Provocative/contrarian keywords — boost topics that challenge consensus
  { re: /\b(scandal|cover.up|whistleblower|leak|expose|revealed|secret|hidden)\b/i, bonus: 12 },
  { re: /\b(critique|challenge|reconsider|contradicts|debunk|myth|illusion|deception)\b/i, bonus: 10 },
  { re: /\b(paradigm.shift|game.changer|revolutionary|radical|unconventional|heterodox)\b/i, bonus: 8 },
];

/** 28 elite feeds: think tanks + news + policy + central banks + institutional */
const PREMIUM_RSS_FEEDS: { name: string; url: string; tier: 'A' | 'B' | 'C'; vertical?: string }[] = [
  // === TIER A: Premier Think Tanks ===
  { name: "ICG Crisis Group",       url: "https://www.crisisgroup.org/rss.xml",                               tier: "A", vertical: "geopolitics" },
  { name: "CSIS",                   url: "https://www.csis.org/rss.xml",                                      tier: "A", vertical: "security" },
  { name: "CFR",                    url: "https://feeds.cfr.org/cfr_main",                                    tier: "A", vertical: "geopolitics" },
  { name: "Brookings",              url: "https://www.brookings.edu/feed/",                                   tier: "A" },
  { name: "RAND",                   url: "https://www.rand.org/feeds/research.xml",                           tier: "A" },
  { name: "Chatham House",          url: "https://www.chathamhouse.org/rss.xml",                              tier: "A", vertical: "geopolitics" },
  { name: "Peterson Institute",     url: "https://www.piie.com/rss.xml",                                      tier: "A", vertical: "economics" },
  { name: "Bruegel",                url: "https://www.bruegel.org/rss.xml",                                   tier: "A", vertical: "eu-policy" },
  { name: "Atlantic Council",       url: "https://www.atlanticcouncil.org/feed/",                             tier: "A" },
  { name: "CSET Georgetown",        url: "https://cset.georgetown.edu/feed/",                                  tier: "A", vertical: "ai-policy" },
  { name: "Future of Life Inst.",   url: "https://futureoflife.org/feed/",                                    tier: "A", vertical: "ai-safety" },
  { name: "CGD",                    url: "https://www.cgdev.org/feeds/rss",                                   tier: "A", vertical: "development" },
  // === TIER B: Policy & Academic ===
  { name: "World Bank Blog",        url: "https://blogs.worldbank.org/feed",                                  tier: "B", vertical: "development" },
  { name: "IMF Blog",               url: "https://www.imf.org/en/Blogs/rss",                                  tier: "B", vertical: "finance-macro" },
  { name: "VoxEU / CEPR",           url: "https://cepr.org/voxeu/rss.xml",                                   tier: "B", vertical: "economics" },
  { name: "NBER Digest",            url: "https://www.nber.org/rss/new_research_articles_digest",             tier: "B", vertical: "economics" },
  { name: "IZA World of Labor",     url: "https://wol.iza.org/rss.xml",                                      tier: "B", vertical: "labor" },
  { name: "Nature News",            url: "https://www.nature.com/nature.rss",                                 tier: "B", vertical: "science" },
  { name: "MIT Technology Review",  url: "https://www.technologyreview.com/feed/",                            tier: "B", vertical: "ai-technology" },
  { name: "AI Now Institute",       url: "https://ainowinstitute.org/feed",                                   tier: "B", vertical: "ai-policy" },
  { name: "IISS",                   url: "https://www.iiss.org/rss",                                         tier: "B", vertical: "security" },
  { name: "Euractiv",               url: "https://www.euractiv.com/feed/",                                    tier: "B", vertical: "eu-policy" },
  // === TIER C: Institutional / Regulatory ===
  { name: "UN News",                url: "https://news.un.org/feed/subscribe/en/news/all/rss.xml",            tier: "C" },
  { name: "WHO News",               url: "https://www.who.int/feeds/entity/mediacentre/news/en/rss.xml",      tier: "C", vertical: "health" },
  { name: "OECD Insights",          url: "https://oecdinsights.org/feed/",                                    tier: "C", vertical: "economics" },
  { name: "BIS Research",           url: "https://www.bis.org/rss/index.htm",                                 tier: "C", vertical: "finance-macro" },
  { name: "ILO News",               url: "https://www.ilo.org/rss/ilonews.xml",                              tier: "C", vertical: "labor" },
  { name: "WTO News",               url: "https://www.wto.org/rss/rss_news_e.xml",                           tier: "C", vertical: "trade" },
  // === TIER B: Health, Climate, Science ===
  { name: "Lancet",                url: "https://www.thelancet.com/rssfeed/lancet_current.xml",              tier: "B", vertical: "health-biotech" },
  { name: "Nature Climate",        url: "https://www.nature.com/nclimate.rss",                               tier: "B", vertical: "climate" },
  { name: "Science Magazine",      url: "https://www.science.org/action/showFeed?type=etoc&feed=rss&jc=science", tier: "B", vertical: "science-frontier" },
  { name: "Reuters Health",        url: "https://www.reuters.com/arc/outboundfeeds/rss/category/health/?outputType=xml", tier: "C", vertical: "health-biotech" },
  // === TIER A: Independent Investigative Journalism (NomosX addition) ===
  { name: "The Intercept",         url: "https://theintercept.com/feed/",                                    tier: "A", vertical: "geopolitics" },
  { name: "ProPublica",            url: "https://feeds.propublica.org/propublica/main",                      tier: "A" },
  { name: "ICIJ",                  url: "https://www.icij.org/feed/",                                        tier: "A", vertical: "geopolitics" },
  { name: "OCCRP",                 url: "https://www.occrp.org/en/rss.xml",                                  tier: "A", vertical: "geopolitics" },
  { name: "Bellingcat",            url: "https://www.bellingcat.com/feed/",                                  tier: "A", vertical: "security" },
  { name: "Mediapart",             url: "https://www.mediapart.fr/articles/feed",                            tier: "A", vertical: "eu-policy" },
  // === TIER B: Heterodox / Independent Analysis ===
  { name: "Jacobin",               url: "https://jacobin.com/feeds/posts.atom",                              tier: "B", vertical: "social-stability" },
  { name: "Naked Capitalism",      url: "https://www.nakedcapitalism.com/feed",                              tier: "B", vertical: "finance-macro" },
  { name: "Roar Magazine",         url: "https://roarmag.org/feed/",                                          tier: "B", vertical: "social-stability" },
  { name: "Novara Media",          url: "https://novaramedia.com/feed/",                                      tier: "B", vertical: "eu-policy" },
  { name: "Current Affairs",       url: "https://www.currentaffairs.org/feed",                                tier: "B" },
  // === TIER B: Expert Blogs ===
  { name: "Marginal Revolution",   url: "https://marginalrevolution.com/feed",                                tier: "B", vertical: "economics" },
  { name: "LessWrong",             url: "https://www.lesswrong.com/feed.xml",                                 tier: "B", vertical: "ai-technology" },
  { name: "Astral Codex Ten",      url: "https://astralcodexten.substack.com/feed",                           tier: "B", vertical: "ai-technology" },
  // === TIER B: Global South / Non-Western ===
  { name: "Africa Is a Country",   url: "https://africaisacountry.com/feed",                                  tier: "B", vertical: "emerging-markets" },
  { name: "Scroll.in",             url: "https://scroll.in/rss",                                              tier: "B", vertical: "emerging-markets" },
  { name: "The Wire India",        url: "https://thewire.in/feed",                                            tier: "B", vertical: "emerging-markets" },
  // P1-H: Expanded Global South coverage (BENI Global 10 inspired)
  // African institutions
  { name: "AfDB Blog",             url: "https://www.afdb.org/en/news-and-events/rss",                        tier: "B", vertical: "emerging-markets" },
  { name: "ACBF",                  url: "https://www.afdb.org/en/acbf/rss",                                   tier: "C", vertical: "emerging-markets" },
  { name: "ISS Africa",            url: "https://issafrica.org/rss",                                          tier: "B", vertical: "security" },
  { name: "SAIIA",                 url: "https://saiia.org.za/feed/",                                         tier: "B", vertical: "geopolitics" },
  { name: "African Arguments",     url: "https://africanarguments.org/feed/",                                 tier: "B", vertical: "emerging-markets" },
  { name: "Daily Maverick",        url: "https://www.dailymaverick.co.za/feed/",                              tier: "C", vertical: "emerging-markets" },
  // Asian institutions
  { name: "ADB Blog",              url: "https://blogs.adb.org/rss",                                          tier: "B", vertical: "emerging-markets" },
  { name: "ISEAS Singapore",       url: "https://www.iseas.edu.sg/feed/",                                     tier: "B", vertical: "geopolitics" },
  { name: "ORF India",             url: "https://www.orfonline.org/feed/",                                    tier: "B", vertical: "geopolitics" },
  { name: "Carnegie China",        url: "https://carnegiechina.org/feed/",                                    tier: "B", vertical: "geopolitics" },
  { name: "CSIS Indonesia",        url: "https://www.csis.or.id/rss",                                         tier: "C", vertical: "emerging-markets" },
  { name: "East Asia Forum",       url: "https://www.eastasiaforum.org/feed/",                                tier: "B", vertical: "emerging-markets" },
  // Latin American institutions
  { name: "CAF Development Bank",  url: "https://www.caf.com/en/feed/",                                       tier: "B", vertical: "emerging-markets" },
  { name: "CEPAL",                 url: "https://www.cepal.org/en/rss",                                       tier: "C", vertical: "emerging-markets" },
  { name: "Folha de S.Paulo",      url: "https://feeds.folha.uol.com.br/poder/rss",                          tier: "C", vertical: "emerging-markets" },
  { name: "El País América",       url: "https://feeds.elconfidencial.com/mundo",                             tier: "C", vertical: "emerging-markets" },
  // Middle East
  { name: "Al-Monitor",            url: "https://www.al-monitor.com/rss",                                     tier: "B", vertical: "geopolitics" },
  { name: "Carnegie ME",           url: "https://carnegie-mec.org/feed/",                                     tier: "B", vertical: "geopolitics" },
  // Independent media (Global South)
  { name: "GroundUp South Africa", url: "https://www.groundup.org.za/feed/",                                  tier: "C", vertical: "emerging-markets" },
  { name: "The Conversation Africa", url: "https://theconversation.com/africa/articles.atom",                 tier: "B", vertical: "emerging-markets" },
];

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

export async function runTopicRadar(options?: {
  maxTopics?: number;
  includeAcademic?: boolean;
  bypassCache?: boolean;
}): Promise<RadarSweepResult> {
  const start = Date.now();
  const maxTopics = options?.maxTopics ?? 20;
  const includeAcademic = options?.includeAcademic ?? true;

  // Serve from TTL cache if available and not bypassed
  if (!options?.bypassCache && _cachedResult && Date.now() < _cachedResult.expiresAt) {
    console.log(`[TOPIC RADAR V3] Cache hit — serving ${_cachedResult.result.topics.length} topics (expires in ${Math.round((_cachedResult.expiresAt - Date.now()) / 60000)}m)`);
    return _cachedResult.result;
  }

  console.log('[TOPIC RADAR V3] Starting maximum coverage sweep...');

  const stats: {
    gdeltFetched: number; rssFetched: number; academicFetched: number;
    policyFetched: number; institutionalFetched: number; dbSignals: number;
    totalRaw: number; afterDedup: number; crossChannelCollisions: number;
    durationMs: number;
    crossSourceSignals?: { clustersDetected: number; topScore: number };
  } = {
    gdeltFetched: 0, rssFetched: 0, academicFetched: 0,
    policyFetched: 0, institutionalFetched: 0, dbSignals: 0,
    totalRaw: 0, afterDedup: 0, crossChannelCollisions: 0,
    durationMs: 0,
  };

  // 5 parallel sweeps simultaneously
  const [gdeltR, rssR, academicR, dbR] = await Promise.allSettled([
    sweepGDELT(),
    sweepRSS(),
    includeAcademic ? sweepAcademic() : Promise.resolve([]),
    sweepDBSignals(),
  ]);

  const all: RadarTopic[] = [];
  if (gdeltR.status === 'fulfilled')    { all.push(...gdeltR.value);    stats.gdeltFetched    = gdeltR.value.length; }
  if (rssR.status === 'fulfilled')      { all.push(...rssR.value);      stats.rssFetched      = rssR.value.length; }
  if (academicR.status === 'fulfilled') { all.push(...academicR.value); stats.academicFetched = academicR.value.length; }
  if (dbR.status === 'fulfilled')       { all.push(...dbR.value);       stats.dbSignals       = dbR.value.length; }

  // ── CROSS-SOURCE SIGNAL DETECTION (V3.1) — corroboration + velocity ──
  let signalClusters: { topic: string; items: any[]; totalScore: number; corroborationScore: number }[] = [];
  try {
    const { detectCrossSourceSignals } = await import('./cross-source-signals');
    const newsItems = all.map(t => ({
      title: t.title,
      source: t.source || 'unknown',
      url: t.url,
      publishedAt: t.publishedAt || new Date(),
      summary: t.summary,
      tier: (t as any).tier,
      vertical: t.vertical,
    }));
    signalClusters = detectCrossSourceSignals(newsItems);
    if (signalClusters.length > 0) {
      console.log(`[TOPIC RADAR V3] CROSS-SOURCE SIGNALS: ${signalClusters.length} high-confidence clusters (top score: ${signalClusters[0]?.totalScore})`);
      stats.crossSourceSignals = { clustersDetected: signalClusters.length, topScore: signalClusters[0]?.totalScore || 0 } as any;
      // Boost topics that appear in high-scoring signal clusters
      for (const cluster of signalClusters.slice(0, 5)) {
        const matchingTopics = all.filter(t => cluster.items.some(item => item.title === t.title));
        for (const topic of matchingTopics) {
          topic.score = Math.min(100, (topic.score || 0) + Math.round(cluster.corroborationScore * 10));
        }
      }
    }
  } catch (err) {
    console.warn('[TOPIC RADAR V3] Cross-source signal detection failed (non-blocking):', err);
  }

  stats.totalRaw = all.length;
  const deduped = deduplicateTopicsJaccard(all);
  stats.afterDedup = deduped.length;

  // ── CROSS-CHANNEL COLLISION DETECTION (LOT 1.1) ──
  // Group deduped topics by title similarity (Jaccard ≥ 0.40 — looser than dedup threshold)
  // to detect the same story appearing across different source types (channels)
  const collisionGroups = groupByCrossChannel(deduped);
  for (const group of collisionGroups) {
    if (group.channels.size >= 3) {
      // Boost: ≥ 3 distinct channels → +15
      const boost = 15;
      for (const topic of group.topics) {
        topic.crossChannelBoost = boost;
        topic.channels = [...group.channels];
        topic.score = clampScore(topic.score + boost);
      }
      stats.crossChannelCollisions++;
    }
  }

  // ── SCORING BOOSTS (LOT 1.7) ──
  for (const topic of deduped) {
    // jointRecentBoost: new (< 24h) AND cross-channel → +20
    if (topic.crossChannelBoost && topic.publishedAt) {
      const hoursAgo = (Date.now() - topic.publishedAt.getTime()) / 3600000;
      if (hoursAgo < 24) {
        topic.score = clampScore(topic.score + 20);
      }
    }
  }

  // ── 2026 INNOVATIONS: Temporal Trajectories + Velocity + Anticipatory Outliers ──
  try {
    // C + A: Compute temporal velocities (compares against previous radar runs)
    const velocities = await computeTopicVelocities(
      deduped.map(t => ({ id: t.id, title: t.title, source: t.source }))
    );

    // B: Detect anticipatory outliers (topics that don't match any cluster)
    const clusterKeywords = signalClusters.map(c => ({
      topic: c.topic,
      keywords: new Set(c.topic.split(' ')),
    }));
    const outliers = detectAnticipatoryOutliers(
      deduped.map(t => ({ id: t.id, title: t.title, summary: t.summary, source: t.source })),
      clusterKeywords
    );

    // I: Domain-aware credibility scoring
    for (const topic of deduped) {
      topic.sourceDomain = classifySourceDomain(topic.source, topic.url);
    }

    // Apply velocity + outlier boosts
    let emergingCount = 0, burstingCount = 0, newCount = 0, fadingCount = 0;
    let outlierCount = 0;
    for (const topic of deduped) {
      const vel = velocities.get(topic.id);
      if (vel) {
        topic.trajectory = vel.trajectory;
        topic.velocityBonus = vel.velocityBonus;
        topic.score = clampScore(topic.score + vel.velocityBonus);
        if (vel.trajectory === 'emerging') emergingCount++;
        else if (vel.trajectory === 'bursting') burstingCount++;
        else if (vel.trajectory === 'new') newCount++;
        else if (vel.trajectory === 'fading') fadingCount++;
      }

      const outlier = outliers.get(topic.id);
      if (outlier) {
        topic.isAnticipatoryOutlier = outlier.isAnticipatory;
        topic.outlierBoost = outlier.outlierBoost;
        topic.score = clampScore(topic.score + outlier.outlierBoost);
        if (outlier.isAnticipatory || outlier.becameCluster) outlierCount++;
      }
    }

    if (emergingCount + burstingCount + newCount + outlierCount > 0) {
      console.log(`[TOPIC RADAR V3] Trajectories: ${emergingCount} emerging, ${burstingCount} bursting, ${newCount} new, ${fadingCount} fading | Anticipatory outliers: ${outlierCount}`);
    }
  } catch (err) {
    console.warn('[TOPIC RADAR V3] Innovation scoring failed (non-blocking):', err);
  }

  deduped.sort((a, b) => b.score - a.score);

  // ── ADAPTIVE SIGNAL STRENGTH (replaces rigid cutoff) ──
  // Instead of a hard cutoff at 60, tag each topic with signal strength
  // so the Editor-in-Chief LLM can reason about the full spectrum.
  // - breaking: score ≥ 70 — strong, multi-channel signal
  // - emerging: score 45-69 — worth investigating, may be early signal
  // - routine: score < 45 — weak signal, LLM can choose to skip
  const top = deduped.slice(0, maxTopics);
  for (const topic of top) {
    topic.signalStrength = topic.score >= 70 ? 'breaking' : topic.score >= 45 ? 'emerging' : 'routine';
  }
  const breakingCount = top.filter(t => t.signalStrength === 'breaking').length;
  const emergingCount = top.filter(t => t.signalStrength === 'emerging').length;
  const routineCount = top.filter(t => t.signalStrength === 'routine').length;
  console.log(`[TOPIC RADAR V3] Signal distribution: ${breakingCount} breaking, ${emergingCount} emerging, ${routineCount} routine`);

  stats.durationMs = Date.now() - start;
  const result: RadarSweepResult = { topics: top, stats };

  // Store in TTL cache
  _cachedResult = { result, expiresAt: Date.now() + CACHE_TTL_MS };

  console.log(`[TOPIC RADAR V3] ✅ ${stats.totalRaw} raw → ${stats.afterDedup} deduped → ${top.length} topics in ${stats.durationMs}ms | gdelt:${stats.gdeltFetched} rss:${stats.rssFetched} academic:${stats.academicFetched} db:${stats.dbSignals}`);
  return result;
}

// ============================================================================
// SOURCE 1: GDELT V3 — 14 verticals, recency decay + urgency scoring
// ============================================================================

async function sweepGDELT(): Promise<RadarTopic[]> {
  const promises = GDELT_SWEEP_QUERIES.map(async ({ query, vertical, urgencyBonus }) => {
    try {
      const params = new URLSearchParams({ query, mode: "ArtList", maxrecords: "8", timespan: "24h", format: "json", sort: "DateDesc" });
      const data: any = await fetchFromProvider('gdelt-news', `https://api.gdeltproject.org/api/v2/doc/doc?${params}`, {
        timeout: 12000, retries: 2, responseType: 'text',
      }).catch(() => null);
      if (!data) return [];
      let parsed: any;
      try { parsed = JSON.parse(data); } catch { return []; }
      return (parsed.articles || []).slice(0, 4).map((a: any, i: number) => {
        const pub = parseGDELTDate(a.seendate);
        return {
          id: `gdelt:${hashStr(a.url || a.title)}`,
          title: cleanText(a.title),
          summary: `[${vertical}] ${a.domain} — ${cleanText(a.title)}`,
          url: a.url,
          source: a.domain || 'GDELT',
          sourceType: 'news' as const,
          publishedAt: pub,
          score: clampScore(68 + urgencyBonus + (4 - i) * 3 + recencyDecay(pub) + urgencyKeywordBonus(a.title)),
          vertical,
        };
      });
    } catch { return []; }
  });
  const out: RadarTopic[] = [];
  for (const r of await Promise.allSettled(promises)) if (r.status === 'fulfilled') out.push(...r.value);
  return out;
}

// ============================================================================
// SOURCE 2: RSS Elite — 28 feeds, tiered scoring
// ============================================================================

async function sweepRSS(): Promise<RadarTopic[]> {
  const promises = PREMIUM_RSS_FEEDS.map(async (feed) => {
    try {
      const text = await fetchFromProvider('rss', feed.url, {
        timeout: 7000, retries: 1, responseType: 'text',
        headers: { "User-Agent": "NomosX-Radar/3.0" },
      }).catch(() => null);
      if (!text) return [];
      const items = parseRSSItems(text).slice(0, 3);
      return items.map((item, i) => {
        const pub = item.pubDate ? new Date(item.pubDate) : null;
        return {
          id: `rss:${hashStr(item.link || item.title)}`,
          title: cleanText(item.title),
          summary: cleanHTML(item.description).slice(0, 350),
          url: item.link,
          source: feed.name,
          sourceType: 'think-tank' as const,
          publishedAt: pub,
          score: clampScore(58 + TIER_BONUS[feed.tier] + (3 - i) * 3 + recencyDecay(pub) + urgencyKeywordBonus(item.title)),
          vertical: feed.vertical,
        };
      });
    } catch { return []; }
  });
  const out: RadarTopic[] = [];
  for (const r of await Promise.allSettled(promises)) if (r.status === 'fulfilled') out.push(...r.value);
  return out;
}

// ============================================================================
// SOURCE 3: Academic — OpenAlex + arXiv + Semantic Scholar
// ============================================================================

async function sweepAcademic(): Promise<RadarTopic[]> {
  const [oaR, axR, s2R] = await Promise.allSettled([sweepOpenAlex(), sweepArXiv(), sweepSemanticScholar()]);
  const out: RadarTopic[] = [];
  if (oaR.status === 'fulfilled') out.push(...oaR.value);
  if (axR.status === 'fulfilled') out.push(...axR.value);
  if (s2R.status === 'fulfilled') out.push(...s2R.value);
  return out;
}

async function sweepOpenAlex(): Promise<RadarTopic[]> {
  const fromDate = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
  const domainQueries = [
    { concept: 'C162324750', label: 'economics', vertical: 'economics' },
    { concept: 'C71924100', label: 'medicine', vertical: 'health-biotech' },
    { concept: 'C121332964', label: 'physics', vertical: 'science-frontier' },
    { concept: 'C41008148', label: 'computer science', vertical: 'ai-technology' },
    { concept: 'C111472273', label: 'environmental science', vertical: 'climate' },
    { concept: 'C17744445', label: 'political science', vertical: 'geopolitics' },
  ];

  const promises = domainQueries.map(async ({ concept, label, vertical }) => {
    try {
      const params = new URLSearchParams({
        filter: `from_publication_date:${fromDate},concepts.id:${concept},cited_by_count:>2,has_abstract:true`,
        sort: 'cited_by_count:desc', per_page: '4',
        select: 'id,title,publication_date,cited_by_count,primary_location,abstract_inverted_index',
      });
      const data: any = await fetchFromProvider('openalex', `https://api.openalex.org/works?${params}`, {
        timeout: 9000, retries: 2,
        headers: { 'User-Agent': 'NomosX/3.0 (mailto:contact@nomosx.com)' },
      }).catch(() => null);
      if (!data) return [];
      const { results: works = [] } = data;
      return works.slice(0, 3).map((w: any) => ({
        id: `openalex:${w.id?.split('/').pop()}`,
        title: w.title || 'Untitled',
        summary: reconstructAbstract(w.abstract_inverted_index).slice(0, 350),
        url: w.primary_location?.landing_page_url || w.id,
        source: w.primary_location?.source?.display_name || 'OpenAlex',
        sourceType: 'academic' as const,
        publishedAt: w.publication_date ? new Date(w.publication_date) : null,
        score: clampScore(52 + Math.min(22, (w.cited_by_count || 0) * 3) + urgencyKeywordBonus(w.title)),
        vertical,
      }));
    } catch { return []; }
  });
  const out: RadarTopic[] = [];
  for (const r of await Promise.allSettled(promises)) if (r.status === 'fulfilled') out.push(...r.value);
  return out;
}

async function sweepArXiv(): Promise<RadarTopic[]> {
  const cats = [
    'cs.AI', 'econ.GN', 'q-fin.GN', 'cs.CY',
    'physics.soc-ph', 'q-bio.QM', 'stat.AP',
    'cs.CR', 'eess.SP', 'math.OC',
  ];
  const verticalMap: Record<string, string> = {
    'cs.AI': 'ai-technology', 'econ.GN': 'economics', 'q-fin.GN': 'finance-macro',
    'cs.CY': 'digital-governance', 'physics.soc-ph': 'social-stability',
    'q-bio.QM': 'biotechnology', 'stat.AP': 'science-frontier',
    'cs.CR': 'cybersecurity', 'eess.SP': 'science-frontier', 'math.OC': 'science-frontier',
  };
  const promises = cats.map(async (cat) => {
    try {
      const text = await fetchFromProvider('arxiv', `https://export.arxiv.org/rss/${cat}`, {
        timeout: 7000, retries: 2, responseType: 'text',
        headers: { 'User-Agent': 'NomosX-Radar/3.0' },
      }).catch(() => null);
      if (!text) return [];
      return parseRSSItems(text).slice(0, 3).map((item) => ({
        id: `arxiv:${hashStr(item.link || item.title)}`,
        title: cleanText(item.title),
        summary: cleanHTML(item.description).slice(0, 350),
        url: item.link,
        source: `arXiv:${cat}`,
        sourceType: 'academic' as const,
        publishedAt: item.pubDate ? new Date(item.pubDate) : null,
        score: clampScore(55 + urgencyKeywordBonus(item.title)),
        vertical: verticalMap[cat],
      }));
    } catch { return []; }
  });
  const out: RadarTopic[] = [];
  for (const r of await Promise.allSettled(promises)) if (r.status === 'fulfilled') out.push(...r.value);
  return out;
}

async function sweepSemanticScholar(): Promise<RadarTopic[]> {
  try {
    // Dynamic queries pulled from PhD researcher hotTopics (Phase 4 KB alignment)
    const baseQueries = getTopicRadarQueries({ tiers: ['core'], limit: 8 });
    const queries = baseQueries.length >= 4 ? baseQueries.slice(0, 8)
      : ['AI regulation policy', 'climate economics', 'geopolitical risk', 'financial stability'];
    // Batch queries 4-at-a-time to respect Semantic Scholar rate limits (~100 req/5min unauthenticated)
    const BATCH_SIZE = 4;
    const out: RadarTopic[] = [];
    for (let i = 0; i < queries.length; i += BATCH_SIZE) {
      const batch = queries.slice(i, i + BATCH_SIZE);
      const batchPromises = batch.map(async (q) => {
        const fields = 'paperId,title,abstract,citationCount,publicationDate,publicationVenue';
        const data: any = await fetchFromProvider('semanticscholar',
          `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(q)}&fields=${fields}&limit=4`,
          { timeout: 8000, retries: 1, headers: { 'User-Agent': 'NomosX/3.0' } }
        ).catch(() => null);
        if (!data) return [];
        const { data: papers = [] } = data;
        return papers.slice(0, 3).map((p: any) => ({
          id: `s2:${p.paperId}`,
          title: p.title || 'Untitled',
          summary: (p.abstract || '').slice(0, 350),
          url: `https://www.semanticscholar.org/paper/${p.paperId}`,
          source: p.publicationVenue?.name || 'Semantic Scholar',
          sourceType: 'academic' as const,
          publishedAt: p.publicationDate ? new Date(p.publicationDate) : null,
          score: clampScore(48 + Math.min(18, p.citationCount || 0) + urgencyKeywordBonus(p.title)),
        }));
      });
      for (const r of await Promise.allSettled(batchPromises)) if (r.status === 'fulfilled') out.push(...r.value);
    }
    return out;
  } catch { return []; }
}

// ============================================================================
// SOURCE 4: Existing DB Signals (unprocessed, high priority)
// ============================================================================

async function sweepDBSignals(): Promise<RadarTopic[]> {
  try {
    const signals = await prisma.signal.findMany({
      where: {
        status: 'NEW',
        priorityScore: { gte: 60 },
        detectedAt: { gte: new Date(Date.now() - 48 * 60 * 60 * 1000) },
      },
      orderBy: { priorityScore: 'desc' },
      take: 10,
      select: {
        id: true,
        title: true,
        summary: true,
        priorityScore: true,
        signalType: true,
        detectedAt: true,
      },
    });

    return signals.map(s => ({
      id: `signal:${s.id}`,
      title: s.title,
      summary: (s.summary || '').slice(0, 300),
      source: `Signal (${s.signalType})`,
      sourceType: 'signal' as const,
      publishedAt: s.detectedAt,
      score: s.priorityScore,
    }));
  } catch {
    return [];
  }
}

// ============================================================================
// HELPERS — Scoring + Dedup
// ============================================================================

/** Jaccard similarity deduplication — 60% word overlap threshold */
function deduplicateTopicsJaccard(topics: RadarTopic[]): RadarTopic[] {
  const wordSet = (title: string): Set<string> =>
    new Set(title.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 3));

  const kept: RadarTopic[] = [];
  for (const topic of topics) {
    const ws = wordSet(topic.title);
    if (ws.size === 0) continue;
    let duplicate = false;
    for (const existing of kept) {
      const ews = wordSet(existing.title);
      const intersection = [...ws].filter(w => ews.has(w)).length;
      const union = new Set([...ws, ...ews]).size;
      if (union > 0 && intersection / union >= 0.60) {
        if (topic.score > existing.score) {
          // Replace with higher-scored version
          const idx = kept.indexOf(existing);
          kept[idx] = topic;
        }
        duplicate = true;
        break;
      }
    }
    if (!duplicate) kept.push(topic);
  }
  return kept;
}

/** Group topics by loose title similarity (Jaccard ≥ 0.40) across different source types */
function groupByCrossChannel(topics: RadarTopic[]): { topics: RadarTopic[]; channels: Set<string> }[] {
  const wordSet = (title: string): Set<string> =>
    new Set(title.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 3));

  const groups: { topics: RadarTopic[]; channels: Set<string> }[] = [];
  const assigned = new Set<number>();

  for (let i = 0; i < topics.length; i++) {
    if (assigned.has(i)) continue;
    const ws = wordSet(topics[i].title);
    if (ws.size === 0) continue;
    const group: RadarTopic[] = [topics[i]];
    const channels = new Set<string>([topics[i].sourceType]);
    assigned.add(i);

    for (let j = i + 1; j < topics.length; j++) {
      if (assigned.has(j)) continue;
      const ews = wordSet(topics[j].title);
      const intersection = [...ws].filter(w => ews.has(w)).length;
      const union = new Set([...ws, ...ews]).size;
      if (union > 0 && intersection / union >= 0.40) {
        group.push(topics[j]);
        channels.add(topics[j].sourceType);
        assigned.add(j);
      }
    }

    groups.push({ topics: group, channels });
  }

  return groups;
}

/** Recency decay: fresh content scored higher */
function recencyDecay(pub: Date | null): number {
  if (!pub) return 0;
  const hoursAgo = (Date.now() - pub.getTime()) / 3600000;
  if (hoursAgo < 2)  return 25;
  if (hoursAgo < 6)  return 18;
  if (hoursAgo < 12) return 10;
  if (hoursAgo < 24) return 5;
  if (hoursAgo < 72) return 0;
  return -8;
}

/** Urgency keyword bonus from title */
function urgencyKeywordBonus(title: string): number {
  if (!title) return 0;
  return Math.min(25, URGENCY_PATTERNS.reduce((sum, { re, bonus }) => sum + (re.test(title) ? bonus : 0), 0));
}

/** Clamp score to 0-100 */
function clampScore(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function reconstructAbstract(invertedIndex: Record<string, number[]> | null): string {
  if (!invertedIndex) return '';
  const words: [number, string][] = [];
  for (const [word, positions] of Object.entries(invertedIndex)) {
    for (const pos of positions) {
      words.push([pos, word]);
    }
  }
  words.sort((a, b) => a[0] - b[0]);
  return words.map(w => w[1]).join(' ').slice(0, 500);
}

function parseGDELTDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  try {
    if (dateStr.includes('T') && !dateStr.includes('-')) {
      const y = dateStr.slice(0, 4);
      const m = dateStr.slice(4, 6);
      const d = dateStr.slice(6, 8);
      const h = dateStr.slice(9, 11);
      const min = dateStr.slice(11, 13);
      return new Date(`${y}-${m}-${d}T${h}:${min}:00Z`);
    }
    return new Date(dateStr);
  } catch {
    return null;
  }
}

function parseRSSItems(xml: string): { title: string; link: string; description: string; pubDate: string }[] {
  const items: { title: string; link: string; description: string; pubDate: string }[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match;

  while ((match = itemRegex.exec(xml)) !== null) {
    const content = match[1];
    const title = extractTag(content, 'title');
    const link = extractTag(content, 'link');
    const description = extractTag(content, 'description');
    const pubDate = extractTag(content, 'pubDate');
    if (title) items.push({ title, link, description, pubDate });
  }

  return items;
}

function extractTag(xml: string, tag: string): string {
  const regex = new RegExp(
    `<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>|<${tag}[^>]*>([\\s\\S]*?)</${tag}>`,
    'i'
  );
  const match = regex.exec(xml);
  return (match?.[1] || match?.[2] || '').trim();
}

function cleanText(text: string): string {
  if (!text) return '';
  return text
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanHTML(html: string): string {
  if (!html) return '';
  return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

function hashStr(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}
