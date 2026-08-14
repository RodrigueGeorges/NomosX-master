/**
 * NomosX Author Innovator Detector
 *
 * Identifies the most innovative, cross-domain, and heterodox authors
 * from a pool of sources. Unlike traditional h-index ranking, this system
 * looks for:
 *
 * 1. CITATION VELOCITY — authors whose recent work is being cited faster than their older work
 * 2. CROSS-DOMAIN IMPACT — authors who publish across multiple disciplines
 * 3. HETERODOX SIGNALS — authors who challenge consensus (low agreement with mainstream)
 * 4. EMERGING VOICES — authors with low total citations but high recent impact
 * 5. DISSIDENT INDICATORS — authors published in independent/non-mainstream venues
 *
 * The goal is NOT to find the most-cited authors, but the most INNOVATIVE ones —
 * the thinkers who are asking the questions others aren't, crossing boundaries
 * others don't, and challenging assumptions others accept.
 */

export interface AuthorProfile {
  name: string;
  orcid?: string;
  institutions: string[];
  domains: string[]; // Domains they publish in
  totalSources: number; // Total sources in this pool
  totalCitations: number;
  citationVelocity: number; // Recent citations / older citations (>1 = accelerating)
  crossDomainScore: number; // 0-1, how many different domains they span
  heterodoxScore: number; // 0-1, how much they challenge consensus
  emergingScore: number; // 0-1, high recent impact relative to total career
  dissidentScore: number; // 0-1, how much they publish in independent/non-mainstream venues
  innovatorScore: number; // Weighted composite
  isEmerging: boolean; // Low total citations but high velocity
  isCrossDomain: boolean; // Publishes across 3+ domains
  isHeterodox: boolean; // High heterodox score
  isDissident: boolean; // Publishes in independent venues
  tags: string[]; // ['emerging', 'cross-domain', 'heterodox', 'dissident']
}

export interface InnovatorDetectionResult {
  authors: AuthorProfile[];
  topInnovators: AuthorProfile[]; // Top 10 by innovatorScore
  emergingVoices: AuthorProfile[]; // Authors with isEmerging = true
  crossDomainThinkers: AuthorProfile[]; // Authors with isCrossDomain = true
  heterodoxVoices: AuthorProfile[]; // Authors with isHeterodox = true
  dissidentVoices: AuthorProfile[]; // Authors with isDissident = true
  stats: {
    totalAuthors: number;
    emergingCount: number;
    crossDomainCount: number;
    heterodoxCount: number;
    dissidentCount: number;
  };
}

// ─── Independent / non-mainstream providers ─────────────────────────────────

const INDEPENDENT_PROVIDERS = new Set([
  'independent-media', 'gdelt-independent', 'substack', 'mediapart',
  'the-intercept', 'propublica', 'icij', 'occrp', 'bellingcat',
  'jacobin', 'nakedcapitalism', 'roarmag', 'novaramedia',
  'africaisacountry', 'scroll-in', 'the-wire',
]);

// ─── Domain detection from source metadata ──────────────────────────────────

function detectDomains(source: any): string[] {
  const domains = new Set<string>();
  // From explicit domain field
  if (source.domain) domains.add(source.domain);
  // From topics
  if (source.topics && Array.isArray(source.topics)) {
    for (const t of source.topics) {
      if (typeof t === 'string' && t.length > 2) domains.add(t.toLowerCase());
    }
  }
  // From provider (some providers map to domains)
  if (source.provider) {
    const providerDomainMap: Record<string, string> = {
      'philpapers': 'philosophy',
      'persee': 'humanities',
      'hal': 'multi-domain',
      'ssrn': 'social-sciences',
      'arxiv': 'technology',
      'pubmed': 'health',
      'nber': 'economics',
      'repec': 'economics',
    };
    const mapped = providerDomainMap[source.provider];
    if (mapped) domains.add(mapped);
  }
  // From title/abstract keywords
  const text = ((source.title || '') + ' ' + (source.abstract || '')).toLowerCase();
  const keywordDomainMap: Array<[string[], string]> = [
    [['philosoph', 'ethic', 'moral', 'ontolog', 'epistemolog'], 'philosophy'],
    [['anthropolog', 'ethnograph', 'cultural'], 'anthropology'],
    [['religio', 'theolog', 'sacred', 'spiritual'], 'religious-studies'],
    [['econom', 'market', 'trade', 'financial'], 'economics'],
    [['politic', 'governance', 'policy', 'state'], 'policy'],
    [['sociolog', 'social', 'society'], 'sociology'],
    [['histor', 'historical', 'past'], 'history'],
    [['ai', 'artificial intelligence', 'machine learning', 'algorithm'], 'technology'],
    [['law', 'legal', 'juridical', 'court'], 'law'],
    [['security', 'conflict', 'war', 'military'], 'security'],
    [['climate', 'environment', 'ecolog'], 'environment'],
    [['health', 'medical', 'disease', 'patient'], 'health'],
  ];
  for (const [keywords, domain] of keywordDomainMap) {
    if (keywords.some(kw => text.includes(kw))) domains.add(domain);
  }
  return Array.from(domains);
}

/**
 * Detect heterodox signals — authors who challenge consensus.
 * Heuristic: sources with "critique", "challenge", "reconsider", "against",
 * "problematic", "limitation", "failure" in title/abstract.
 */
function detectHeterodoxy(source: any): number {
  const text = ((source.title || '') + ' ' + (source.abstract || '')).toLowerCase();
  const heterodoxKeywords = [
    'critique', 'challenge', 'reconsider', 'against', 'problematic',
    'limitation', 'failure', 'myth', 'illusion', 'deconstruct',
    'question', 'rethink', 'paradigm shift', 'anomal', 'contradict',
    'heterodox', 'dissent', 'alternative', 'unconventional', 'radical',
  ];
  const matches = heterodoxKeywords.filter(kw => text.includes(kw)).length;
  return Math.min(1, matches / 3); // 3+ heterodox keywords = score 1.0
}

/**
 * Detect emerging voices — authors with low total citations but high recent activity.
 */
function computeEmergingScore(
  totalCitations: number,
  recentSources: number,
  totalSources: number,
): number {
  if (totalSources === 0) return 0;
  // Low citations + high recent activity = emerging
  const citationFactor = Math.max(0, 1 - totalCitations / 500); // <500 citations → high score
  const recencyFactor = totalSources > 0 ? recentSources / totalSources : 0;
  return citationFactor * 0.6 + recencyFactor * 0.4;
}

/**
 * Main function: detect innovator authors from a pool of sources.
 */
export function detectInnovatorAuthors(sources: any[]): InnovatorDetectionResult {
  // Group sources by author
  const authorMap = new Map<string, {
    sources: any[];
    orcid?: string;
    institutions: Set<string>;
    domains: Set<string>;
    totalCitations: number;
    recentCitations: number; // citations from sources in last 3 years
    olderCitations: number;
    recentSources: number;
    independentCount: number;
    heterodoxSum: number;
  }>();

  const currentYear = new Date().getFullYear();
  const recentThreshold = currentYear - 3;

  for (const source of sources) {
    const authors = source.authors || (source.author ? [source.author] : []);
    if (!Array.isArray(authors) || authors.length === 0) continue;

    const sourceDomains = detectDomains(source);
    const sourceHeterodoxy = detectHeterodoxy(source);
    const sourceYear = source.year || source.publishedDate ? new Date(source.publishedDate).getFullYear() : currentYear;
    const isRecent = sourceYear >= recentThreshold;
    const isIndependent = INDEPENDENT_PROVIDERS.has(source.provider);
    const citations = source.citationCount || 0;

    for (const authorName of authors) {
      const name = typeof authorName === 'string' ? authorName.trim() : (authorName?.name || '').trim();
      if (!name || name.length < 3) continue;

      let entry = authorMap.get(name);
      if (!entry) {
        entry = {
          sources: [],
          institutions: new Set(),
          domains: new Set(),
          totalCitations: 0,
          recentCitations: 0,
          olderCitations: 0,
          recentSources: 0,
          independentCount: 0,
          heterodoxSum: 0,
        };
        authorMap.set(name, entry);
      }

      entry.sources.push(source);
      entry.totalCitations += citations;
      if (isRecent) {
        entry.recentCitations += citations;
        entry.recentSources++;
      } else {
        entry.olderCitations += citations;
      }
      if (isIndependent) entry.independentCount++;
      entry.heterodoxSum += sourceHeterodoxy;
      for (const d of sourceDomains) entry.domains.add(d);
      // Extract institution
      const inst = source.institutions?.[0]?.name || source.institution;
      if (inst) entry.institutions.add(inst);
      // Extract ORCID
      if (source.orcid && !entry.orcid) entry.orcid = source.orcid;
    }
  }

  // Compute profiles
  const profiles: AuthorProfile[] = [];
  for (const [name, entry] of authorMap) {
    const totalSources = entry.sources.length;
    if (totalSources === 0) continue;

    // Citation velocity: recent citations / older citations
    const citationVelocity = entry.olderCitations > 0
      ? entry.recentCitations / entry.olderCitations
      : entry.recentCitations > 0 ? 2.0 : 1.0; // All recent = high velocity

    // Cross-domain score: how many different domains
    const crossDomainScore = Math.min(1, entry.domains.size / 4); // 4+ domains = score 1.0

    // Heterodox score: average heterodoxy across sources
    const heterodoxScore = totalSources > 0 ? entry.heterodoxSum / totalSources : 0;

    // Emerging score
    const emergingScore = computeEmergingScore(entry.totalCitations, entry.recentSources, totalSources);

    // Dissident score: fraction of sources in independent venues
    const dissidentScore = totalSources > 0 ? entry.independentCount / totalSources : 0;

    // Innovator composite — weighted to favor cross-domain + heterodox + emerging
    const innovatorScore =
      crossDomainScore * 0.30 +
      heterodoxScore * 0.25 +
      emergingScore * 0.20 +
      Math.min(2, citationVelocity) / 2 * 0.15 +
      dissidentScore * 0.10;

    const isEmerging = emergingScore > 0.6 && entry.totalCitations < 1000;
    const isCrossDomain = entry.domains.size >= 3;
    const isHeterodox = heterodoxScore > 0.4;
    const isDissident = dissidentScore > 0.3;

    const tags: string[] = [];
    if (isEmerging) tags.push('emerging');
    if (isCrossDomain) tags.push('cross-domain');
    if (isHeterodox) tags.push('heterodox');
    if (isDissident) tags.push('dissident');

    profiles.push({
      name,
      orcid: entry.orcid,
      institutions: Array.from(entry.institutions).slice(0, 3),
      domains: Array.from(entry.domains),
      totalSources,
      totalCitations: entry.totalCitations,
      citationVelocity,
      crossDomainScore,
      heterodoxScore,
      emergingScore,
      dissidentScore,
      innovatorScore,
      isEmerging,
      isCrossDomain,
      isHeterodox,
      isDissident,
      tags,
    });
  }

  // Sort by innovator score
  profiles.sort((a, b) => b.innovatorScore - a.innovatorScore);

  const topInnovators = profiles.slice(0, 10);
  const emergingVoices = profiles.filter(p => p.isEmerging).slice(0, 10);
  const crossDomainThinkers = profiles.filter(p => p.isCrossDomain).slice(0, 10);
  const heterodoxVoices = profiles.filter(p => p.isHeterodox).slice(0, 10);
  const dissidentVoices = profiles.filter(p => p.isDissident).slice(0, 10);

  return {
    authors: profiles,
    topInnovators,
    emergingVoices,
    crossDomainThinkers,
    heterodoxVoices,
    dissidentVoices,
    stats: {
      totalAuthors: profiles.length,
      emergingCount: profiles.filter(p => p.isEmerging).length,
      crossDomainCount: profiles.filter(p => p.isCrossDomain).length,
      heterodoxCount: profiles.filter(p => p.isHeterodox).length,
      dissidentCount: profiles.filter(p => p.isDissident).length,
    },
  };
}

/**
 * Generate a prompt block for the analyst that highlights innovator authors.
 * This tells the analyst which authors to pay attention to and why.
 */
export function generateInnovatorPromptBlock(result: InnovatorDetectionResult): string {
  if (result.topInnovators.length === 0) return '';

  const lines: string[] = [
    '## INNOVATOR AUTHOR HIGHLIGHTS',
    'The following authors have been identified as particularly innovative, cross-domain, or heterodox.',
    'Pay special attention to their contributions — they may offer the most original insights.',
    '',
  ];

  if (result.topInnovators.length > 0) {
    lines.push('### Top Innovators (by composite score):');
    for (const author of result.topInnovators.slice(0, 5)) {
      const tagStr = author.tags.length > 0 ? ` [${author.tags.join(', ')}]` : '';
      lines.push(`- **${author.name}**${tagStr} — ${author.domains.join(', ')} | ${author.totalSources} sources | innovator score: ${author.innovatorScore.toFixed(2)}`);
    }
    lines.push('');
  }

  if (result.emergingVoices.length > 0) {
    lines.push('### Emerging Voices (low citations, high recent impact):');
    for (const author of result.emergingVoices.slice(0, 3)) {
      lines.push(`- **${author.name}** — ${author.domains.join(', ')} | ${author.totalCitations} total citations | emerging score: ${author.emergingScore.toFixed(2)}`);
    }
    lines.push('');
  }

  if (result.crossDomainThinkers.length > 0) {
    lines.push('### Cross-Domain Thinkers (publish across 3+ domains):');
    for (const author of result.crossDomainThinkers.slice(0, 3)) {
      lines.push(`- **${author.name}** — domains: ${author.domains.join(', ')} | ${author.totalSources} sources`);
    }
    lines.push('');
  }

  if (result.heterodoxVoices.length > 0) {
    lines.push('### Heterodox Voices (challenge consensus):');
    for (const author of result.heterodoxVoices.slice(0, 3)) {
      lines.push(`- **${author.name}** — heterodox score: ${author.heterodoxScore.toFixed(2)} | ${author.domains.join(', ')}`);
    }
    lines.push('');
  }

  if (result.dissidentVoices.length > 0) {
    lines.push('### Dissident Voices (publish in independent/non-mainstream venues):');
    for (const author of result.dissidentVoices.slice(0, 3)) {
      lines.push(`- **${author.name}** — dissident score: ${author.dissidentScore.toFixed(2)} | ${author.domains.join(', ')}`);
    }
  }

  return lines.join('\n');
}
