/**
 * SOURCE QUALITY FILTER
 *
 * Blocks SEO content farms, spam directories, and irrelevant sources from
 * entering the NomosX pipeline. Applied at two stages:
 *   1. SCOUT (pipeline-v2.ts) — before upserting raw results to the database
 *   2. RANK (enhanced-ranker.ts) — defensive second pass to catch stragglers
 *
 * Design notes:
 *  - `academia.edu` is intentionally NOT blacklisted — it is a legitimate
 *    academic sharing platform.
 *  - Medium posts from non-verified authors are blocked, but institutional
 *    Medium blogs (e.g. medium.com/@anthropic, medium.com/netflix-techblog)
 *    are kept.
 *  - The relevance check (federal-register / internet-archive topicality) is
 *    intentionally NOT done here — it belongs at the SCOUT query level.
 *    This module only implements the blacklist + spam-title filter.
 */

// ────────────────────────────────────────────────────────────────────────────
// DOMAIN BLACKLIST
// ────────────────────────────────────────────────────────────────────────────

/**
 * Hard-blacklisted domains (SEO farms, spam directories, content mills).
 * Matches against the hostname of a source URL. Subdomains are covered by
 * the `endsWith` check in `isBlacklistedDomain`.
 */
export const DOMAIN_BLACKLIST: string[] = [
  // sustainability-directory.com — SEO farm that aggregates "sustainability" content
  // Covers all subdomains: lifestyle., prism., esg., fashion., etc.
  'sustainability-directory.com',

  // Generic *-directory.com SEO farms are caught by the pattern below, but a
  // few high-volume ones are listed explicitly for clarity / faster matching.
  'article-directory.com',
  'press-release-directory.com',
  'news-directory.com',
  'blog-directory.com',

  // ── V3.2: Content farms & low-quality aggregators ──
  // Video platforms — not peer-reviewed, not citable for strategic reports
  'youtube.com',
  'youtu.be',
  'vimeo.com',
  'tiktok.com',
  'dailymotion.com',

  // Document sharing platforms — user-uploaded, no editorial control
  'scribd.com',
  'slideshare.net',
  'docplayer.net',
  'coursehero.com',
  'chegg.com',

  // Educational content mills — simplified explanations, not research
  'study.com',
  'khanacademy.org',       // Legit but not a research source
  'quizlet.com',
  'sparknotes.com',
  'cliffsnotes.com',
  'bartleby.com',
  'coursehero.com',

  // Personal blogs & self-publishing (non-institutional)
  'troylendman.com',
  'medium.com',            // Handled separately by isLowQualityMediumPost()

  // Q&A sites — not primary sources
  'quora.com',
  'reddit.com',
  'stackexchange.com',
  'stackoverflow.com',     // Legit for coding but not for policy research
  'answers.com',
  'wikihow.com',

  // Encyclopedias — tertiary sources, not primary research
  'wikipedia.org',         // Good for orientation, not for citing in reports
  'britannica.com',
  'encyclopedia.com',

  // SEO & marketing sites
  'sustainability-directory.com',
  'semrush.com',
  'ahrefs.com',
  'moz.com',

  // AI-generated content farms
  'chatgpt-demo.com',
  'ai-content-generator.com',

  // ── V3.2: SEO directory submission sites (from content-farm-lists) ──
  'linkcentre.com',
  'ontoplist.com',
  'avivadirectory.com',
  'bloggernity.com',
  'exactseek.com',
  'alive-directory.com',
  'abc-directory.com',
  'bloghints.com',
  'cipinet.com',
  'prolinkdirectory.com',
  'submissionwebdirectory.com',
  'directoryvault.com',
  '10directory.com',
  'alistdirectory.com',
  '9sites.net',
  'directoryworld.net',
  'infotiger.com',
  'freewebsitedirectory.com',
  'mastermoz.com',
  'linkpedia.net',
  'upsdirectory.com',
  'directory6.org',
  'marketinginternetdirectory.com',
  '1websdirectory.com',
  'highrankdirectory.com',

  // NOTE: academia.edu is deliberately excluded — it is a legitimate academic
  // preprint/sharing platform and should NOT be filtered.
];

/**
 * Domains that are whitelisted even if they would match a blacklist pattern.
 * This protects legitimate platforms from over-eager pattern matching.
 */
const DOMAIN_WHITELIST: string[] = [
  'academia.edu',
  // V3.2: Legitimate academic platforms that could be caught by patterns
  'researchgate.net',
  'mendeley.com',
  'scholar.google.com',
  'doaj.org',
  'core.ac.uk',
  'unpaywall.org',
  'orcid.org',
  'ror.org',
];

/**
 * Regex patterns for domains that are spam/SEO farms by structure.
 * e.g. any `*-directory.com` hostname.
 */
const DOMAIN_PATTERN_BLACKLIST: RegExp[] = [
  // any subdomain + `-directory.com` (e.g. seo-directory.com, fashion-directory.com)
  /(^|\.)[\w-]+-directory\.com$/i,
  // V3.2: Also catch .net, .org, .info variants
  /(^|\.)[\w-]+-directory\.net$/i,
  /(^|\.)[\w-]+-directory\.org$/i,
  /(^|\.)[\w-]+-directory\.info$/i,
  // Content farm wikis (not legitimate wikis like wikipedia.org which is in explicit blacklist)
  /(^|\.)[\w-]+-wiki\.com$/i,
  // Auto-generated encyclopedia clones
  /(^|\.)[\w-]+-encyclopedia\.com$/i,
  // Content farm answer sites (not stackoverflow.com which is in explicit blacklist)
  /(^|\.)[\w-]+-answers\.com$/i,
];

/**
 * Medium publication slugs that are institutional / verified and should be
 * KEPT even though they live on medium.com. Non-verified personal Medium
 * posts are filtered out.
 */
const MEDIUM_VERIFIED_PUBLICATIONS: string[] = [
  // AI labs & tech companies
  'anthropic',
  'openai',
  'deepmind',
  'google-research',
  'towards-data-science',
  'towardsautonomy',
  'uber-engineering',
  'airbnb-engineering',
  'netflix-techblog',
  'instacart-engineering',
  'instagram-engineering',
  'engineering-at-meta',
  'metaai',
  'msr',
  'amazon-science',
  // Policy / institutional blogs
  'brookings',
  'oecd',
  'imf',
  'worldbank',
  'unicef',
  'undp',
];

// ────────────────────────────────────────────────────────────────────────────
// TITLE SPAM PATTERNS
// ────────────────────────────────────────────────────────────────────────────

/**
 * Regex patterns that identify spam / low-quality titles.
 * A title matching ANY of these is considered low quality.
 */
export const TITLE_SPAM_PATTERNS: RegExp[] = [
  // Sustainability-directory.com titles (SEO farm)
  /sustainability[- ]directory/i,

  // Auto-generated "arrow" taxonomy labels from content farms
  /→\s*(Question|Term|Area|Resource|Scenario)\b/i,
  // Unicode arrow variants (→ may be encoded differently)
  /\u2192\s*(Question|Term|Area|Resource|Scenario)\b/i,

  // Titles that are ONLY a question with no substance
  // e.g. "Why Is Transparency Important In Algorithmic Decision Making?"
  // We require the title to be *predominantly* a question AND short (content
  // farm Q&A pages). A legitimate paper titled "Why Does X Happen? A Study of Y"
  // has content after the question mark, so we only flag titles that END with
  // the question mark (no trailing content).
  /^why\s+is\b.*\?\s*$/i,
  /^what\s+is\b.*\?\s*$/i,
  /^how\s+(do|does|can|could|to)\b.*\?\s*$/i,
  /^is\s+.*\?\s*$/i,
  /^are\s+.*\?\s*$/i,
  /^can\s+.*\?\s*$/i,
  /^should\s+.*\?\s*$/i,
];

// ────────────────────────────────────────────────────────────────────────────
// RELEVANCE KEYWORDS (reference map — used at SCOUT level, not here)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Per-provider relevance keyword hints. This is a reference map for the SCOUT
 * layer: if a source from `federal-register` is about "Greenhouse Gas Emissions"
 * or "Fuel Economy" it is off-topic for an AI/algorithmic-transparency query and
 * should be filtered at the SCOUT relevance stage (not in this blacklist module).
 *
 * Kept here as documentation / future hook. The actual topicality check is
 * performed in the SCOUT relevance filter using the query terms.
 */
export const RELEVANCE_KEYWORDS: Record<string, string[]> = {
  'federal-register': [
    'Greenhouse Gas Emissions',
    'Fuel Economy',
    'Circumvention of Lawful Pathways',
    'Emissions Standards',
    'Vehicle Emissions',
    // V3.2: Added for AI/governance queries
    'Artificial Intelligence',
    'Algorithmic Accountability',
    'Federal Acquisition Regulation',
    'Privacy Act',
    'FOIA',
    'Cybersecurity',
    'National Security',
  ],
  'internet-archive': [
    // Internet Archive returns broad web-archive hits; relevance must be
    // validated against the query terms at the SCOUT level.
  ],
  // V3.2: Added relevance keywords for major institutional providers
  'who': [
    'Public Health', 'Epidemiology', 'Health Policy', 'Disease Control',
    'Global Health', 'Pandemic', 'Vaccine', 'Health Systems',
  ],
  'worldbank': [
    'Development Economics', 'Poverty Reduction', 'Infrastructure',
    'Climate Finance', 'Development Policy', 'Economic Growth',
  ],
  'imf': [
    'Fiscal Policy', 'Monetary Policy', 'Economic Outlook',
    'Financial Stability', 'Exchange Rates', 'Inflation',
  ],
  'oecd': [
    'Economic Policy', 'Social Policy', 'Environmental Policy',
    'Governance', 'Statistics', 'Innovation', 'Digital Economy',
  ],
  'brookings': [
    'Policy Research', 'Governance', 'Economic Policy',
    'Foreign Policy', 'Global Economy', 'Technology Policy',
  ],
  'rand': [
    'Public Policy', 'National Security', 'Defense',
    'Healthcare', 'Education', 'Cybersecurity',
  ],
  'jstor': [
    // JSTOR returns broad humanities/social science hits; relevance must be
    // validated against query terms. Common off-topic patterns:
    'Socratic', 'Dialectic',  // Ancient philosophy — usually off-topic for modern policy
  ],
  'tavily': [
    // Tavily is a web search API — relevance is query-dependent
  ],
  'cordis': [
    'Research Project', 'European Union', 'Horizon',
    'Innovation', 'Technology', 'Science',
  ],
};

// ────────────────────────────────────────────────────────────────────────────
// HELPERS
// ────────────────────────────────────────────────────────────────────────────

/**
 * Extract the hostname from a URL string. Returns '' if the URL is malformed
 * or missing a scheme.
 */
function extractHostname(url: string | undefined | null): string {
  if (!url) return '';
  try {
    // Add a scheme if missing so URL parsing works for bare hostnames
    const withScheme = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    const parsed = new URL(withScheme);
    return parsed.hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    // Fallback: crude split
    return String(url)
      .replace(/^https?:\/\//i, '')
      .split('/')[0]
      .replace(/^www\./, '')
      .toLowerCase();
  }
}

/**
 * Returns true if the hostname is on the blacklist (exact or pattern match),
 * accounting for subdomains. Whitelisted domains always return false.
 */
function isBlacklistedDomain(hostname: string): boolean {
  if (!hostname) return false;

  // Whitelist takes precedence (e.g. academia.edu)
  if (DOMAIN_WHITELIST.some(d => hostname === d || hostname.endsWith(`.${d}`))) {
    return false;
  }

  // Exact blacklist match (covers subdomains via endsWith)
  if (DOMAIN_BLACKLIST.some(d => hostname === d || hostname.endsWith(`.${d}`))) {
    return true;
  }

  // Pattern blacklist (e.g. *-directory.com)
  if (DOMAIN_PATTERN_BLACKLIST.some(re => re.test(hostname))) {
    return true;
  }

  return false;
}

/**
 * Returns true if a Medium URL is from a non-verified author (should be
 * filtered). Institutional Medium publications are kept.
 *
 * Medium URL shapes:
 *   - Personal:  medium.com/@username/...        → filter
 *   - Publication: medium.com/publication-slug/... → keep if whitelisted
 */
function isLowQualityMediumPost(url: string | undefined | null): boolean {
  const hostname = extractHostname(url);
  if (hostname !== 'medium.com' && !hostname.endsWith('.medium.com')) return false;

  if (!url) return false;
  try {
    const withScheme = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    const parsed = new URL(withScheme);
    const path = parsed.pathname.toLowerCase();
    // Personal posts: /@username/...
    if (path.startsWith('/@')) {
      return true; // non-verified personal post
    }
    // Publication posts: /publication-slug/...
    const firstSegment = path.split('/').filter(Boolean)[0] || '';
    if (firstSegment) {
      // Keep if it's a known institutional publication
      if (MEDIUM_VERIFIED_PUBLICATIONS.some(p => firstSegment === p)) {
        return false;
      }
      // Unknown publication — be conservative and keep (avoid false positives)
      return false;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Returns true if the title matches any spam pattern.
 */
function isSpamTitle(title: string | undefined | null): boolean {
  if (!title) return false;
  const trimmed = title.trim();
  if (!trimmed) return false;
  return TITLE_SPAM_PATTERNS.some(re => re.test(trimmed));
}

// ────────────────────────────────────────────────────────────────────────────
// PUBLIC API
// ────────────────────────────────────────────────────────────────────────────

export interface SourceQualityInput {
  title?: string;
  url?: string;
  provider?: string;
}

/**
 * Returns true if a source should be filtered out as low quality.
 *
 * Checks (in order):
 *  1. Blacklisted domain (SEO farms, spam directories) — including subdomains
 *  2. Non-verified Medium author posts (institutional blogs kept)
 *  3. Spam title patterns (content-farm Q&A pages, arrow taxonomy labels,
 *     sustainability-directory titles)
 */
export function isLowQualitySource(source: SourceQualityInput): boolean {
  if (!source) return false;

  // 1. Domain blacklist
  const hostname = extractHostname(source.url);
  if (isBlacklistedDomain(hostname)) {
    return true;
  }

  // 2. Medium non-verified author posts
  if (isLowQualityMediumPost(source.url)) {
    return true;
  }

  // 3. Spam title patterns
  if (isSpamTitle(source.title)) {
    return true;
  }

  return false;
}

/**
 * Removes low-quality sources from an array.
 *
 * @param sources  Raw source objects (must have at least `title` and/or `url`)
 * @returns        Filtered array (same shape, low-quality entries removed)
 *
 * @example
 * const clean = filterLowQualitySources(rawPool);
 * console.log(`Removed ${rawPool.length - clean.length} spam sources`);
 */
export function filterLowQualitySources(sources: any[]): any[] {
  if (!Array.isArray(sources) || sources.length === 0) return [];
  return sources.filter(s => !isLowQualitySource(s));
}
