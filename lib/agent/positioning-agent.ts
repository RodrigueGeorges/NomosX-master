/**
 * Positioning Agent — editorial differentiation vs the field.
 *
 * What a senior editor does before green-lighting a piece: "what has the
 * competition already published on this, and what do we add?" Publications
 * that re-synthesize the field consensus are commodity; the differentiator
 * is occupying a position nobody else holds — with better evidence.
 *
 * Pipeline:
 *   1. COMPETITOR CORPUS: retrieve competing analyses from think-tank
 *      providers (brookings, carnegie, chatham-house, rand, cfr, ecfr, swp,
 *      iiss, stimson, mckinsey…) + Tavily domain-filtered editorial search.
 *      These are a BENCHMARK corpus — read differently from evidence sources.
 *   2. FIELD MAP: one LLM pass extracts what the field covers, where it
 *      converges (consensus), what nobody covers (gap map, taxonomy from
 *      research-gap-finder: methodological/theoretical/applied/interdisciplinary),
 *      and which competitor claims are weakly supported.
 *   3. DIFFERENTIATION BRIEF: 3-5 concrete directives injected into the
 *      analyst context — cover the missing dimension, challenge the thin
 *      consensus, or out-deep the strongest competitor mechanism.
 *   4. The critic panel scores "value-added vs field" as a 5th dimension
 *      when the brief exists (see critic-panel.ts fieldContext).
 *
 * Contrarian-drift guard: directives favor coverage/depth/challenge-by-evidence,
 * never position-taking for its own sake. The critic vetoes stay sovereign.
 */

import { callLLM } from '../llm/unified-llm';
import { parseJson } from './json-utils';
import { searchTavily } from '../providers/tavily-provider';
import { searchExtendedProviders } from '../providers/registry-bridge';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CompetitorPiece {
  title: string;
  outlet: string;          // provider or domain
  abstract: string;
  url: string;
  year?: number;
}

export interface DifferentiationDirective {
  axis: string;            // what to do: "cover", "challenge", "outdeep"
  target: string;          // the dimension/claim/piece it applies to
  directive: string;       // concrete instruction for the analyst
}

export interface PositioningBrief {
  competitorsFound: number;
  fieldCoverage: string[];        // dimensions the field covers
  consensusClaims: string[];      // points of field convergence
  uncoveredDimensions: string[];  // the gap map
  weakClaims: string[];           // thinly-supported competitor claims
  strongestPiece: string | null;  // the competitor to beat
  directives: DifferentiationDirective[];
  contextBlock: string;           // rendered text for analyst injection
  costUsd: number;
  durationMs: number;
}

// ─── Competitor corpus ──────────────────────────────────────────────────────

const THINK_TANK_PROVIDERS = [
  'brookings', 'carnegie', 'chatham-house', 'rand', 'cfr',
  'wilson-center', 'iiss', 'stimson-center', 'ecfr', 'swp',
  'heritage-foundation', 'new-america', 'cato-institute',
];

// Editorial competitors via domain-filtered web search
const EDITORIAL_DOMAINS = [
  'brookings.edu', 'csis.org', 'rand.org', 'carnegieendowment.org',
  'chathamhouse.org', 'ecfr.eu', 'crisisgroup.org', 'cfr.org',
  'iiss.org', 'atlanticcouncil.org', 'foreignpolicy.com', 'warontherocks.com',
];

async function retrieveCompetitorCorpus(query: string, maxPieces = 10): Promise<CompetitorPiece[]> {
  const [thinkTank, editorial] = await Promise.allSettled([
    searchExtendedProviders(query, { providers: THINK_TANK_PROVIDERS, limit: 12 }).catch(() => []),
    searchTavily(query, 8, { include_domains: EDITORIAL_DOMAINS }).catch(() => []),
  ]);

  const raw: any[] = [
    ...(thinkTank.status === 'fulfilled' ? thinkTank.value : []),
    ...(editorial.status === 'fulfilled' ? editorial.value : []),
  ];

  const seen = new Set<string>();
  const pieces: CompetitorPiece[] = [];
  for (const s of raw) {
    if (!s?.title || s.title.length < 15) continue;
    const key = (s.url || s.title).toLowerCase().replace(/\/$/, '');
    if (seen.has(key)) continue;
    seen.add(key);
    const abstract = s.abstract || s.content || '';
    if (abstract.length < 80) continue; // need substance to map coverage
    pieces.push({
      title: s.title.slice(0, 200),
      outlet: s.provider || (() => { try { return new URL(s.url).hostname; } catch { return 'web'; } })(),
      abstract: abstract.slice(0, 900),
      url: s.url || '',
      year: s.year,
    });
    if (pieces.length >= maxPieces) break;
  }
  return pieces;
}

// ─── Field map extraction ───────────────────────────────────────────────────

const FIELD_MAP_PROMPT = `You are the research director of a think tank preparing a publication that must BEAT the existing field.

TOPIC: "{query}"

Below are the abstracts of the strongest competing analyses already published on this topic.

COMPETITOR CORPUS:
{corpus}

Produce a field map as STRICT JSON:
{
  "fieldCoverage": ["dimensions/angles the field collectively covers", ...],
  "consensusClaims": ["claims nearly all competitors agree on", ...],
  "uncoveredDimensions": ["important dimensions NOBODY covers — classify as methodological/theoretical/applied/interdisciplinary/historical/regional/actor-level", ...],
  "weakClaims": ["competitor claims that are asserted but thinly evidenced", ...],
  "strongestPiece": "<title of the single best competing piece, or null>",
  "directives": [
    {"axis": "cover|challenge|outdeep", "target": "the dimension or claim", "directive": "one-sentence concrete instruction for our analyst"}
  ]
}

Rules:
- 3-5 directives max, ordered by expected reader value.
- "cover" = include a dimension the field missed. "challenge" = attack a weakly-evidenced consensus claim WITH evidence. "outdeep" = beat the strongest piece on mechanism depth (who does what, through which channel, with which numbers).
- NEVER propose contrarianism for its own sake — every directive must be executable with real evidence.`;

async function extractFieldMap(
  query: string,
  corpus: CompetitorPiece[],
): Promise<{ map: any | null; costUsd: number }> {
  const corpusText = corpus
    .map((c, i) => `[${i + 1}] ${c.outlet} — "${c.title}"${c.year ? ` (${c.year})` : ''}\n${c.abstract}`)
    .join('\n\n')
    .slice(0, 9000);

  try {
    const res = await callLLM({
      messages: [{
        role: 'user',
        content: FIELD_MAP_PROMPT.replace('{query}', query.slice(0, 300)).replace('{corpus}', corpusText),
      }],
      temperature: 0.3,
      jsonMode: true,
      maxTokens: 2500,
      enableCache: false,
      task: 'reader_v3',
    });
    return { map: parseJson(res.content), costUsd: typeof res.costUsd === 'number' ? res.costUsd : 0 };
  } catch (err) {
    console.warn('[POSITIONING] Field map extraction failed:', String(err).slice(0, 120));
    return { map: null, costUsd: 0 };
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Build a differentiation brief for the analyst: what the field already
 * published, and the 3-5 concrete ways this publication must beat it.
 * Returns null-safe empty brief when no competitor corpus is found.
 */
export async function buildPositioningBrief(
  query: string,
  options?: { maxPieces?: number; timeoutMs?: number },
): Promise<PositioningBrief | null> {
  const start = Date.now();

  const { captureInput } = await import('./frozen-inputs');
  // Frozen-input channel: the competitor corpus is a live web scout — the
  // field-map prompt embeds it verbatim, so an unfrozen replay drifts.
  const corpus = await captureInput('positioning:corpus', () =>
    retrieveCompetitorCorpus(query, options?.maxPieces ?? 10));
  if (corpus.length < 3) {
    console.log(`[POSITIONING] Only ${corpus.length} competitor pieces found — too thin to map the field, skipping`);
    return null;
  }

  const { map, costUsd } = await extractFieldMap(query, corpus);
  if (!map) return null;

  const directives: DifferentiationDirective[] = (Array.isArray(map.directives) ? map.directives : [])
    .filter((d: any) => d && typeof d.directive === 'string' && ['cover', 'challenge', 'outdeep'].includes(d.axis))
    .slice(0, 5)
    .map((d: any) => ({ axis: d.axis, target: String(d.target || '').slice(0, 200), directive: d.directive.slice(0, 300) }));

  const brief: PositioningBrief = {
    competitorsFound: corpus.length,
    fieldCoverage: (map.fieldCoverage || []).slice(0, 10).map(String),
    consensusClaims: (map.consensusClaims || []).slice(0, 8).map(String),
    uncoveredDimensions: (map.uncoveredDimensions || []).slice(0, 8).map(String),
    weakClaims: (map.weakClaims || []).slice(0, 6).map(String),
    strongestPiece: typeof map.strongestPiece === 'string' ? map.strongestPiece : null,
    directives,
    contextBlock: '',
    costUsd,
    durationMs: Date.now() - start,
  };

  // Render compact context block for analyst injection (~1000 chars)
  const lines: string[] = [
    '## COMPETITIVE POSITIONING (mandatory differentiation)',
    `The field has published ${corpus.length} analyses on this topic (${corpus.slice(0, 4).map(c => c.outlet).join(', ')}…).`,
  ];
  if (brief.fieldCoverage.length) lines.push(`Field covers: ${brief.fieldCoverage.slice(0, 6).join('; ')}`);
  if (brief.uncoveredDimensions.length) lines.push(`NOBODY covers: ${brief.uncoveredDimensions.slice(0, 5).join('; ')}`);
  if (brief.weakClaims.length) lines.push(`Weakly-evidenced consensus: ${brief.weakClaims.slice(0, 3).join('; ')}`);
  if (brief.strongestPiece) lines.push(`Best competitor to beat: "${brief.strongestPiece}"`);
  if (directives.length) {
    lines.push('DIFFERENTIATION DIRECTIVES — your analysis MUST visibly beat the field on at least 2 of these:');
    directives.forEach((d, i) => lines.push(`${i + 1}. [${d.axis.toUpperCase()}] ${d.directive}`));
  }
  brief.contextBlock = lines.join('\n');

  console.log(`[POSITIONING] ${corpus.length} competitors → ${brief.uncoveredDimensions.length} gaps, ${directives.length} directives (${brief.durationMs}ms, $${costUsd.toFixed(4)})`);
  return brief;
}
