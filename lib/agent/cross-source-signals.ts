/**
 * Cross-Source Signal Detection — NomosX
 *
 * Inspired by:
 * - Signal Hunter: Cross-source signals with 1.5x multiplier for topics
 *   in 2+ sources, velocity tracking (accelerating, new, fading, steady)
 * - Breaking News Monitor: Multi-source corroboration (2+ sources = higher confidence)
 * - SignalForge: 3-stage LLM pipeline with 6-factor scoring
 * - GlobalPulse: 35+ data layers with AI-powered risk scoring
 *
 * Architecture:
 * - After topic radar collects items from RSS feeds, cluster by topic
 * - Detect cross-source corroboration (same topic in 2+ independent feeds)
 * - Track velocity (appearance rate over 7 days)
 * - Score: base + corroboration bonus + velocity bonus + cross-domain bonus
 *
 * Integration:
 * - topic-radar.ts: call detectCrossSourceSignals() after collecting RSS items
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface NewsItem {
  title: string;
  source: string; // feed name
  url?: string;
  publishedAt: Date;
  summary?: string;
  tier?: 'A' | 'B' | 'C';
  vertical?: string;
}

export interface SignalCluster {
  topic: string;
  items: NewsItem[];
  sourceCount: number; // unique sources
  itemCount: number;
  corroborationScore: number; // 0-1
  velocity: 'accelerating' | 'new' | 'fading' | 'steady';
  velocityScore: number; // 0-1
  crossDomainScore: number; // 0-1
  totalScore: number; // 0-100
  independentSources: number; // sources from different organizations
  tierASources: number;
}

// ─── Clustering ─────────────────────────────────────────────────────────────

/**
 * Cluster news items by topic similarity.
 * Uses simple keyword overlap for clustering (production: use embeddings).
 */
export function clusterByTopic(items: NewsItem[]): SignalCluster[] {
  const clusters: Array<{ keywords: Set<string>; items: NewsItem[] }> = [];

  for (const item of items) {
    const itemKeywords = extractKeywords(item.title + ' ' + (item.summary || ''));

    // Find best matching cluster
    let bestCluster: typeof clusters[0] | null = null;
    let bestOverlap = 0;

    for (const cluster of clusters) {
      const overlap = [...itemKeywords].filter(k => cluster.keywords.has(k)).length;
      const similarity = overlap / Math.max(itemKeywords.size, cluster.keywords.size);
      if (similarity > 0.3 && overlap > bestOverlap) {
        bestCluster = cluster;
        bestOverlap = overlap;
      }
    }

    if (bestCluster) {
      bestCluster.items.push(item);
      // Merge keywords
      for (const kw of itemKeywords) bestCluster.keywords.add(kw);
    } else {
      clusters.push({ keywords: itemKeywords, items: [item] });
    }
  }

  // Convert to SignalClusters
  return clusters.map(c => buildSignalCluster(c.items, c.keywords));
}

function extractKeywords(text: string): Set<string> {
  const stopWords = new Set([
    'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had',
    'her', 'was', 'one', 'our', 'out', 'with', 'from', 'this', 'that',
    'have', 'been', 'they', 'what', 'when', 'where', 'which', 'their',
    'about', 'would', 'there', 'could', 'other', 'into', 'more', 'some',
    'than', 'them', 'very', 'after', 'also', 'over', 'such', 'only',
    'these', 'will', 'each', 'make', 'like', 'just', 'between', 'says',
    'said', 'new', 'report', 'according', 'week', 'year',
  ]);

  const words = text.toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3 && !stopWords.has(w));

  return new Set(words.slice(0, 10)); // Top 10 keywords
}

function buildSignalCluster(items: NewsItem[], keywords: Set<string>): SignalCluster {
  const sources = new Set(items.map(i => i.source));
  const sourceCount = sources.size;
  const itemCount = items.length;

  // Corroboration score: how many independent sources cover this?
  const independentSources = countIndependentSources(sources);
  const corroborationScore = Math.min(independentSources / 3, 1); // 3+ independent = max

  // Velocity: appearance rate over time
  const velocity = computeVelocity(items);
  const velocityScore = computeVelocityScore(velocity, items);

  // Cross-domain: do items span different verticals?
  const verticals = new Set(items.map(i => i.vertical).filter(Boolean));
  const crossDomainScore = Math.min(verticals.size / 3, 1); // 3+ verticals = max

  // Tier A sources
  const tierASources = items.filter(i => i.tier === 'A' && sources.has(i.source)).length;

  // Total score
  const baseScore = 30;
  const corroborationBonus = corroborationScore * 25; // up to +25
  const velocityBonus = velocityScore * 20; // up to +20
  const crossDomainBonus = crossDomainScore * 15; // up to +15
  const tierABonus = tierASources > 0 ? 10 : 0;

  const totalScore = Math.round(baseScore + corroborationBonus + velocityBonus + crossDomainBonus + tierABonus);

  return {
    topic: [...keywords].slice(0, 5).join(' '),
    items,
    sourceCount,
    itemCount,
    corroborationScore,
    velocity,
    velocityScore,
    crossDomainScore,
    totalScore,
    independentSources,
    tierASources,
  };
}

/**
 * Count independent sources (different organizations).
 * Sources from the same organization (e.g., NYT and NYT Politics) count as 1.
 */
function countIndependentSources(sources: Set<string>): number {
  const orgMap: Record<string, string> = {
    'ICG Crisis Group': 'crisisgroup',
    'CSIS': 'csis',
    'CFR': 'cfr',
    'Brookings': 'brookings',
    'RAND': 'rand',
    'Chatham House': 'chathamhouse',
    'The Intercept': 'intercept',
    'ProPublica': 'propublica',
    'ICIJ': 'icij',
    'OCCRP': 'occrp',
    'Bellingcat': 'bellingcat',
    'Mediapart': 'mediapart',
    'Jacobin': 'jacobin',
    'Naked Capitalism': 'nakedcapitalism',
    'Roar Magazine': 'roar',
    'Novara Media': 'novara',
    'Marginal Revolution': 'marginalrevolution',
    'LessWrong': 'lesswrong',
    'Astral Codex Ten': 'astralcodexten',
    'Africa Is a Country': 'africaisacountry',
    'Scroll.in': 'scroll',
    'The Wire India': 'thewire',
  };

  const orgs = new Set<string>();
  for (const source of sources) {
    const org = orgMap[source] || source.toLowerCase().replace(/[^a-z]/g, '');
    orgs.add(org);
  }
  return orgs.size;
}

/**
 * Compute velocity of a signal cluster.
 * Based on publication dates of items.
 */
function computeVelocity(items: NewsItem[]): 'accelerating' | 'new' | 'fading' | 'steady' {
  if (items.length < 2) return 'new';

  const now = new Date();
  const sorted = items.sort((a, b) => a.publishedAt.getTime() - b.publishedAt.getTime());

  // Divide into first half and second half by time
  const midpoint = sorted[Math.floor(sorted.length / 2)].publishedAt;
  const firstHalf = sorted.filter(i => i.publishedAt < midpoint);
  const secondHalf = sorted.filter(i => i.publishedAt >= midpoint);

  // Compute rates (items per day)
  const firstSpan = Math.max((midpoint.getTime() - sorted[0].publishedAt.getTime()) / (1000 * 60 * 60 * 24), 1);
  const secondSpan = Math.max((now.getTime() - midpoint.getTime()) / (1000 * 60 * 60 * 24), 1);

  const firstRate = firstHalf.length / firstSpan;
  const secondRate = secondHalf.length / secondSpan;

  // All items within last 24h = new
  const allRecent = items.every(i => (now.getTime() - i.publishedAt.getTime()) < (24 * 60 * 60 * 1000));
  if (allRecent && items.length <= 2) return 'new';

  if (secondRate > firstRate * 1.5) return 'accelerating';
  if (secondRate < firstRate * 0.5) return 'fading';
  return 'steady';
}

function computeVelocityScore(velocity: string, items: NewsItem[]): number {
  switch (velocity) {
    case 'accelerating': return 1.0;
    case 'new': return 0.7;
    case 'steady': return 0.5;
    case 'fading': return 0.2;
    default: return 0.3;
  }
}

// ─── Main Entry Point ───────────────────────────────────────────────────────

/**
 * Detect cross-source signals from a collection of news items.
 * Returns clusters sorted by total score (highest first).
 */
export function detectCrossSourceSignals(items: NewsItem[]): SignalCluster[] {
  if (items.length === 0) return [];

  // Cluster by topic
  const clusters = clusterByTopic(items);

  // Filter: only clusters with 2+ items
  const significant = clusters.filter(c => c.itemCount >= 2);

  // Sort by total score
  significant.sort((a, b) => b.totalScore - a.totalScore);

  return significant;
}

/**
 * Format signal clusters for logging/display.
 */
export function formatSignalClusters(clusters: SignalCluster[]): string {
  const lines: string[] = ['=== CROSS-SOURCE SIGNAL DETECTION ==='];
  lines.push(`${clusters.length} significant signal clusters detected:`);

  for (const cluster of clusters.slice(0, 10)) {
    lines.push(`\n[${cluster.totalScore}/100] ${cluster.topic}`);
    lines.push(`  Sources: ${cluster.sourceCount} (${cluster.independentSources} independent) | Items: ${cluster.itemCount}`);
    lines.push(`  Velocity: ${cluster.velocity} | Cross-domain: ${Math.round(cluster.crossDomainScore * 100)}%`);
    lines.push(`  Corroboration: ${Math.round(cluster.corroborationScore * 100)}% | Tier-A: ${cluster.tierASources}`);
    lines.push(`  Sources: ${[...new Set(cluster.items.map(i => i.source))].join(', ')}`);
  }

  lines.push('\n=== END SIGNAL DETECTION ===');
  return lines.join('\n');
}
