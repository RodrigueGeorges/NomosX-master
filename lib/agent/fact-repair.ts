/**
 * FACT REPAIR — anchored correction of fact-checker fatal discrepancies.
 *
 * The generic revision editor cannot fix these: the fact-checker's `claim`
 * strings come from stripHtmlForEvidence(html) (sup→[SRC-N], tags stripped),
 * so a verbatim `find` can never match raw HTML across citations and inline
 * tags, and the editor only ever saw 12KB of an ~90KB article. This repairer
 * prompts on the claim sentences alone and applies edits tolerantly —
 * whitespace/tags inside the find span are ignored, the span must not cross
 * a block or citation boundary, and the replacement may only carry the
 * figure the source states (or drop it).
 *
 * Cost: 1 LLM call (~$0.005). Never throws.
 */

import { callLLM, type LLMFamily } from '../llm/unified-llm';
import { parseJson } from './json-utils';

export interface FactualDiscrepancy {
  claim: string;
  number: string;
  sourceRef: string;
  sourceSays: string;
  fix: string;
}

export interface FactRepairResult {
  html: string;
  applied: number;
  skipped: number;
  skippedReasons: string[];
  costUsd: number;
}

const MAX_EDITS = 8;
const BLOCK_OR_CITATION = /<\/?(p|h[1-6]|li|ul|ol|div|section|table|tr|td|sup|figure)\b|data-evidence=|\[SRC-\d+\]/i;

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Entity-flexible token pattern: claims come from stripHtmlForEvidence
 * (entities decoded, smart punctuation preserved) while raw HTML keeps
 * `&rsquo;`/`&mdash;`/`&#8217;` encodings — a verbatim token then never
 * matches (observed live: 5/8 fact-repair edits failed `not_found`).
 * Applied AFTER escapeRe on chars escapeRe leaves literal.
 */
const entityFlex = (tok: string) => tok
  .replace(/'/g, `(?:'|’|&rsquo;|&apos;|&#0*39;|&#x0*27;)`)
  .replace(/"/g, `(?:"|“|”|&quot;|&ldquo;|&rdquo;|&#0*34;|&#x0*22;)`)
  .replace(/&/g, `(?:&amp;|&)`)
  .replace(/—/g, `(?:—|–|-|&mdash;|&ndash;|&#0*8212;|&#0*8211;)`)
  .replace(/–/g, `(?:–|-|&ndash;|&#0*8211;)`)
  .replace(/…/g, `(?:…|\\.\\.\\.)`);

/**
 * Apply one find→replace edit tolerantly: the find's tokens may be separated
 * by whitespace/&nbsp;/inline tags in the html, and each token may be wrapped
 * in inline tags. The match must be unique and must not span a block or
 * citation boundary. Exported for tests.
 */
export function applyTolerantEdit(
  html: string,
  find: string,
  replace: string,
): { html: string; ok: boolean; reason?: string } {
  const tokens = find.trim().split(/\s+/).filter(Boolean).map(t => entityFlex(escapeRe(t)));
  if (tokens.length === 0) return { html, ok: false, reason: 'empty_find' };
  const pattern = tokens
    .map(t => `(?:<[^>]+>)*${t}(?:<[^>]+>)*`)
    .join('(?:\\s|&nbsp;|<[^>]+>)+');
  const re = new RegExp(pattern, 'g');
  const matches = [...html.matchAll(re)];
  if (matches.length === 0) return { html, ok: false, reason: 'not_found' };
  if (matches.length > 1) return { html, ok: false, reason: 'ambiguous' };
  const idx = matches[0].index ?? -1;
  if (idx < 0) return { html, ok: false, reason: 'not_found' };

  // The greedy token wrappers may absorb adjacent tags (e.g. a <sup> citation
  // sitting right after the figure). Only the core text span is replaceable:
  // peel edge tags off so the boundary check and the splice operate on text,
  // never on markup we must preserve.
  let start = idx;
  let core = matches[0][0];
  const lead = core.match(/^(?:<[^>]+>)+/);
  if (lead) { start += lead[0].length; core = core.slice(lead[0].length); }
  const tail = core.match(/(?:<[^>]+>)+$/);
  if (tail) core = core.slice(0, core.length - tail[0].length);
  if (!core) return { html, ok: false, reason: 'not_found' };

  if (BLOCK_OR_CITATION.test(core)) return { html, ok: false, reason: 'spans_boundary' };
  if (/<|\[SRC-|\[E-/.test(replace)) return { html, ok: false, reason: 'bad_replace' };
  if (replace.length > find.length * 3 + 100) return { html, ok: false, reason: 'bad_replace' };
  return { html: html.slice(0, start) + replace + html.slice(start + core.length), ok: true };
}

export async function repairFactualDiscrepancies(
  html: string,
  discrepancies: FactualDiscrepancy[],
  opts?: { producerFamily?: LLMFamily; maxEdits?: number },
): Promise<FactRepairResult> {
  const items = discrepancies.slice(0, opts?.maxEdits ?? MAX_EDITS);
  if (items.length === 0) return { html, applied: 0, skipped: 0, skippedReasons: [], costUsd: 0 };

  let response: Awaited<ReturnType<typeof callLLM>>;
  try {
    response = await callLLM({
      messages: [
        {
          role: 'system',
          content:
            'You are a fact-correction editor. Each numbered item is a CLAIM sentence from an article with a figure ' +
            'the fact-checker proved wrong. Output valid JSON only: {"edits":[{"i":<item number>,"find":"…","replace":"…"}]}. ' +
            'Rules: find must be a SHORT span (8-160 chars) copied verbatim from that CLAIM sentence; it must contain the ' +
            'NUMBER figure and must NOT contain any [SRC-N] citation token. replace is the same span with the figure corrected ' +
            'to the one stated under SOURCE SAYS / FIX, or with the figure removed while keeping the qualitative claim. ' +
            'The find span must be UNIQUE — if the figure or phrase could occur more than once, include enough surrounding ' +
            'words so the span occurs exactly once. Never introduce any number not given under SOURCE SAYS / FIX. ' +
            'If SOURCE SAYS / FIX provides no corrected figure (e.g. the source is unrelated to the claim), prefer removing ' +
            'the figure over omitting. Only omit an item when no safe edit exists.',
        },
        {
          role: 'user',
          content: items.map((d, i) =>
            `${i + 1}. CLAIM: ${d.claim} | NUMBER: ${d.number} | SOURCE SAYS: ${d.sourceSays} | FIX: ${d.fix}`
          ).join('\n'),
        },
      ],
      task: 'fact_check',
      temperature: 0.1,
      maxTokens: 3000,
      jsonMode: true,
      enableCache: true,
      producerFamily: opts?.producerFamily,
    });
  } catch (err) {
    console.warn('[FACT-REPAIR] LLM call failed:', err);
    return { html, applied: 0, skipped: items.length, skippedReasons: ['llm_error'], costUsd: 0 };
  }

  const parsed = parseJson<{ edits?: { i?: number; find?: string; replace?: string }[] }>(response.content);
  const edits = Array.isArray(parsed?.edits) ? parsed.edits : null;
  if (!edits) {
    return { html, applied: 0, skipped: items.length, skippedReasons: ['llm_error'], costUsd: response.costUsd };
  }

  let out = html;
  let applied = 0;
  const skippedReasons: string[] = [];
  for (const e of edits) {
    const idx = (e.i ?? 0) - 1;
    if (idx < 0 || idx >= items.length || typeof e.find !== 'string' || typeof e.replace !== 'string') {
      skippedReasons.push('bad_edit_ref');
      continue;
    }
    const r = applyTolerantEdit(out, e.find, e.replace);
    if (r.ok) {
      out = r.html;
      applied++;
    } else {
      skippedReasons.push(`${r.reason}:${items[idx].number}`);
    }
  }
  const skipped = items.length - applied;
  return { html: out, applied, skipped, skippedReasons, costUsd: response.costUsd };
}
