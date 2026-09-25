/**
 * Canon matcher — deterministic relevance scoring between a research question
 * and the foundational-text corpus. No LLM call: pure keyword/domain scoring
 * so it runs in microseconds and costs nothing.
 */

import type { CanonEntry } from './types';
import { PHILOSOPHY_CANON } from './corpus-philosophy';
import { SOCIOLOGY_CANON } from './corpus-sociology';
import { ECONOMICS_IR_CANON } from './corpus-economics';
import { TECHNOLOGY_CANON } from './corpus-technology';

export const CANON: CanonEntry[] = [
  ...PHILOSOPHY_CANON,
  ...SOCIOLOGY_CANON,
  ...ECONOMICS_IR_CANON,
  ...TECHNOLOGY_CANON,
];

// Stopwords (EN + FR) — excluded from query tokenization so "the future of
// work in africa" scores on work/africa, not on the/of/in.
const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'in', 'on', 'at', 'to', 'for', 'is',
  'are', 'was', 'were', 'be', 'by', 'with', 'from', 'as', 'that', 'this',
  'it', 'its', 'will', 'would', 'can', 'could', 'how', 'what', 'when',
  'where', 'which', 'who', 'why', 'does', 'do', 'did', 'future', 'impact',
  'implications', 'consequences', 'analysis', 'study', 'between', 'about',
  'le', 'la', 'les', 'de', 'des', 'du', 'et', 'ou', 'en', 'un', 'une',
  'dans', 'sur', 'pour', 'avec', 'par', 'est', 'sont', 'au', 'aux', 'ce',
  'ces', 'son', 'sa', 'ses', 'que', 'qui', 'quoi', 'dont', 'où', 'quel',
  'quelle', 'quels', 'quelles', 'comment', 'pourquoi', 'quand', 'vers',
  'leur', 'leurs', 'nous', 'vous', 'ils', 'elles', 'être', 'avoir', 'fait',
  'faire', 'plus', 'moins', 'très', 'aussi', 'mais', 'donc', 'car', 'si',
]);

/** Map common query vocabulary → canon domains (bidirectional EN/FR). */
const DOMAIN_HINTS: Record<string, string[]> = {
  geopolitics: ['geopolitics', 'géopolitique', 'war', 'guerre', 'conflict', 'conflit', 'alliance', 'territory', 'border', 'sanctions', 'empire', 'hegemony', 'hégémonie', 'power', 'puissance', 'diplomacy', 'diplomatie', 'rivalry', 'rivalité', 'china', 'chine', 'usa', 'russia', 'russie', 'supply chain', 'chaîne', 'minerals', 'minerais', 'strategic', 'stratégique', 'chokepoint'],
  economics: ['economy', 'économie', 'market', 'marché', 'capital', 'capitalisme', 'trade', 'commerce', 'labor', 'travail', 'inequality', 'inégalités', 'wealth', 'richesse', 'poverty', 'pauvreté', 'development', 'développement', 'supply chain', 'chaîne', 'tariff', 'tarif', 'industrial', 'industriel'],
  politics: ['democracy', 'démocratie', 'state', 'état', 'government', 'gouvernement', 'election', 'legitimacy', 'légitimité', 'citizen', 'citoyen', 'revolution', 'révolution', 'regulation', 'régulation', 'policy', 'politique'],
  technology: ['technology', 'technologie', 'ai', 'ia', 'artificial intelligence', 'intelligence artificielle', 'algorithm', 'algorithme', 'platform', 'plateforme', 'data', 'données', 'digital', 'numérique', 'internet', 'automation', 'automatisation', 'semiconductor', 'semiconducteur'],
  environment: ['climate', 'climat', 'environment', 'environnement', 'energy', 'énergie', 'carbon', 'carbone', 'fossil', 'fossile', 'ecology', 'écologie', 'pollution', 'sustainability', 'durabilité', 'minerals', 'minerais', 'mining', 'extraction'],
  social_sciences: ['society', 'société', 'culture', 'class', 'classe', 'inequality', 'identity', 'identité', 'norm', 'norme', 'institution', 'social'],
  history: ['history', 'histoire', 'historical', 'historique', 'past', 'passé', 'empire', 'revolution', 'century', 'siècle', 'colonial'],
  security: ['security', 'sécurité', 'defense', 'défense', 'military', 'militaire', 'war', 'guerre', 'threat', 'menace', 'intelligence', 'renseignement', 'supply chain', 'chaîne', 'chokepoint'],
  africa: ['africa', 'afrique', 'sahel', 'nigeria', 'kenya', 'mercosur', 'subsaharan'],
  latin_america: ['latin america', 'amérique latine', 'mercosur', 'brazil', 'brésil', 'argentina', 'argentine', 'mexico', 'mexique', 'colombia', 'colombie', 'chile', 'chili'],
  asia: ['asia', 'asie', 'china', 'chine', 'japan', 'japon', 'korea', 'corée', 'india', 'inde', 'vietnam'],
};

/**
 * Standing canon per domain — works that are always relevant interpretive
 * lenses regardless of specific query phrasing. The canon is not just a
 * retrieval index; it is the intellectual background the analyst must know.
 */
const DOMAIN_CANON_DEFAULTS: Record<string, string[]> = {
  geopolitics: ['thucydides-peloponnesian-war', 'clausewitz-on-war', 'polanyi-great-transformation', 'schelling-strategy-conflict'],
  economics: ['smith-wealth-nations', 'polanyi-great-transformation', 'keynes-general-theory', 'schumpeter-creative-destruction'],
  politics: ['tocqueville-democracy-america', 'weber-economy-society', 'arendt-human-condition', 'foucault-governmentality'],
  technology: ['ellul-technique', 'mcluhan-media', 'winner-artifacts-politics', 'zuboff-surveillance'],
  ai: ['wiener-cybernetics', 'crawford-atlas-ai', 'noble-algorithms-oppression', 'heidegger-technology'],
  environment: ['ostrom-commons', 'carson-silent-spring', 'mitchell-carbon-democracy', 'beck-risk-society'],
  climate: ['ostrom-commons', 'meadows-limits-growth', 'beck-risk-society', 'mitchell-carbon-democracy'],
  energy: ['mitchell-carbon-democracy', 'malm-fossil-capital', 'polanyi-great-transformation'],
  social_sciences: ['durkheim-division-labour', 'weber-protestant-ethic', 'bourdieu-distinction', 'foucault-discipline-punish'],
  history: ['braudel-longue-duree', 'ibn-khaldun-muqaddimah', 'tocqueville-democracy-america', 'wallerstein-world-systems'],
  security: ['clausewitz-on-war', 'schelling-strategy-conflict', 'foucault-discipline-punish'],
  defense: ['clausewitz-on-war', 'sunzi-art-of-war', 'schelling-strategy-conflict', 'morgenthau-politics-nations'],
  finance: ['minkowski-hyman-minsky', 'polanyi-great-transformation', 'friedman-money'],
  foreign_policy: ['thucydides-peloponnesian-war', 'morgenthau-politics-nations', 'schelling-strategy-conflict'],
  european_policy: ['kant-perpetual-peace', 'bull-anarchical-society', 'polanyi-great-transformation'],
  law: ['rawls-justice', 'hobbes-leviathan', 'locke-two-treatises'],
  africa: ['wallerstein-world-systems', 'fanon-wretched-earth', 'acemoglu-why-nations-fail', 'said-orientalism'],
  latin_america: ['wallerstein-world-systems', 'chang-kicking-ladder', 'fanon-wretched-earth', 'polanyi-great-transformation'],
  asia: ['kautilya-arthashastra', 'confucius-analects', 'wallerstein-world-systems', 'pomeranz-great-divergence'],
};

export interface CanonMatch {
  entry: CanonEntry;
  score: number;
  matchedConcepts: string[];
}

/**
 * Score canon entries against a query.
 * Scoring: concept phrase match (+3/word-length normalized), domain hint (+2),
 * author/work name hit (+4). Top N sorted by score desc, deterministic.
 */
export function matchCanon(query: string, opts?: { topN?: number; minScore?: number }): CanonMatch[] {
  const topN = opts?.topN ?? 6;
  const minScore = opts?.minScore ?? 3;

  const q = query.toLowerCase();
  const tokens = new Set(
    q.replace(/[^a-zàâäéèêëïîôùûüç0-9\s-]/gi, ' ')
      .split(/\s+/)
      .filter(t => t.length > 2 && !STOPWORDS.has(t)),
  );
  // bigrams for phrase concepts like "surplus value", "double movement"
  const tokenArr = [...tokens];
  const bigrams = new Set<string>();
  const rawTokens = q.replace(/[^a-zàâäéèêëïîôùûüç0-9\s-]/gi, ' ').toLowerCase().split(/\s+/).filter(Boolean);
  for (let i = 0; i < rawTokens.length - 1; i++) {
    bigrams.add(`${rawTokens[i]} ${rawTokens[i + 1]}`);
  }

  // Which domains does the query hint at?
  const hintedDomains = new Set<string>();
  for (const [domain, hints] of Object.entries(DOMAIN_HINTS)) {
    for (const hint of hints) {
      if (q.includes(hint)) { hintedDomains.add(domain); break; }
    }
  }

  const matches: CanonMatch[] = [];

  for (const entry of CANON) {
    let score = 0;
    const matched: string[] = [];

    // Concept matching — phrase gets full weight, individual words partial
    for (const concept of entry.concepts) {
      const cl = concept.toLowerCase();
      if (cl.includes(' ')) {
        if (q.includes(cl) || bigrams.has(cl)) {
          score += 4;
          matched.push(cl);
        }
      } else if (tokens.has(cl)) {
        score += 2;
        matched.push(cl);
      }
    }

    // Domain overlap: entry domains ∩ hinted domains
    for (const d of entry.domains) {
      if (hintedDomains.has(d)) { score += 2; break; }
    }

    // Author or work name mentioned directly
    const authorLast = entry.author.split(/\s+/).pop()!.toLowerCase();
    if (tokens.has(authorLast) || q.includes(authorLast)) score += 4;
    const workKey = entry.work.toLowerCase().split(/[\s:]+/).filter(w => w.length > 4);
    for (const w of workKey) {
      if (tokens.has(w)) { score += 1; break; }
    }

    if (score >= minScore && matched.length > 0) {
      matches.push({ entry, score, matchedConcepts: matched });
    }
  }

  matches.sort((a, b) => b.score - a.score);

  // Backfill: if concept matching found fewer than topN, add standing canon
  // entries for the hinted domains — the canon is the intellectual background
  // the analyst should always hold, not a strict keyword index.
  if (matches.length < topN) {
    const seen = new Set(matches.map(m => m.entry.id));
    // Interleave domain canons round-robin so no single domain fills all slots
    const domainIds = [...hintedDomains].map(d => DOMAIN_CANON_DEFAULTS[d] ?? []);
    const backfillIds: string[] = [];
    for (let i = 0; i < 4; i++) {
      for (const ids of domainIds) {
        if (ids[i] && !backfillIds.includes(ids[i])) backfillIds.push(ids[i]);
      }
    }
    for (const id of backfillIds) {
      if (matches.length >= topN) break;
      if (seen.has(id)) continue;
      const entry = CANON.find(e => e.id === id);
      if (entry) {
        matches.push({ entry, score: 1, matchedConcepts: ['domain-canon'] });
        seen.add(id);
      }
    }
  }

  return matches.slice(0, topN);
}

/**
 * Build the analyst-context injection block from canon matches.
 * Compact: ~6 entries × ~40 words each ≈ 250 tokens. Zero API cost.
 */
export function buildCanonBlock(query: string, opts?: { topN?: number }): string | undefined {
  return buildCanonBlockFromMatches(matchCanon(query, opts));
}

export function buildCanonBlockFromMatches(matches: CanonMatch[]): string | undefined {
  if (matches.length === 0) return undefined;

  const lines = matches.map((m, i) => {
    const e = m.entry;
    return `${i + 1}. **${e.author}, ${e.work}** (${e.year}) [${e.tradition}]\n   ${e.thesis}`;
  });

  return [
    '## INTERPRETIVE FRAMEWORKS — FOUNDATIONAL CANON',
    'The following foundational works are analytical lenses selected for this question. Use them to structure the analysis — name the framework, apply its logic, and note where it illuminates or fails. These are interpretive depth, not citable sources; cite [SRC-N] evidence for facts, cite the canon for the intellectual architecture.',
    '',
    ...lines,
  ].join('\n');
}
