/**
 * COPY EDITOR — NomosX
 *
 * The missing newsroom role: style gates and the editorial panel DETECT prose
 * defects (AI tells, filler, clichés) but nothing fixed them. This agent turns
 * detections into surgical, verified edits.
 *
 * Design (edit-list contract, not free-form rewrite):
 * - The LLM receives the flagged phrases + editorial findings and returns a
 *   list of { find, replace, reason } edits — never full HTML. This avoids the
 *   failure mode of polishEditorial (stripped text in, "HTML" out = lost tags).
 * - Each edit is applied deterministically and only if it verifies:
 *   · `find` must be a verbatim substring of the HTML
 *   · `replace` must contain no raw tags and must preserve every [SRC-N]/[E-N]
 *     citation token present in `find`
 *   · bounded sizes — a "copy edit" must not rewrite whole sections
 * - Caller re-runs runStyleGates to measure the improvement.
 *
 * Cost: 1 LLM call (~$0.005) — only when violations or editorial findings exist.
 */

import { callLLM } from '../llm/unified-llm';
import { parseJson } from './json-utils';
import type { StyleViolation } from './style-gates';

export interface CopyEditResult {
  html: string;
  applied: number;
  skipped: number;
  editReasons: string[];
  costUsd: number;
}

export interface RawEdit { find?: unknown; replace?: unknown; reason?: unknown }

const CITATION_RE = /\[(?:SRC|E)-\d+\]|data-evidence="E\d+"/g;
const MAX_EDITS = 30;
const MIN_FIND_LEN = 8;
const MAX_FIND_LEN = 600;

function citationsOf(s: string): string[] {
  return s.match(CITATION_RE) ?? [];
}

/**
 * Deterministically apply verified {find, replace} edits — shared by the copy
 * editor and the revision editor. An edit is applied only if:
 *  · `find` is a verbatim substring of the HTML (bounded size)
 *  · `replace` contains no raw HTML tags
 *  · every citation token in `find` survives in `replace`
 * Returns the patched HTML plus per-edit outcomes.
 */
export function applySurgicalEdits(
  html: string,
  edits: RawEdit[],
  opts: { maxEdits?: number } = {},
): { html: string; applied: number; skipped: number; editReasons: string[] } {
  let out = html;
  let applied = 0;
  let skipped = 0;
  const editReasons: string[] = [];

  for (const e of edits.slice(0, opts.maxEdits ?? MAX_EDITS)) {
    const find = typeof e?.find === 'string' ? e.find : '';
    const replace = typeof e?.replace === 'string' ? e.replace : '';
    if (
      find.length < MIN_FIND_LEN || find.length > MAX_FIND_LEN ||
      replace.length > find.length * 3 + 200 ||
      /<[^>]*>/.test(replace) ||
      !out.includes(find)
    ) { skipped++; continue; }
    // Citation preservation: every citation token in `find` must survive in `replace`
    const findCites = citationsOf(find);
    if (findCites.length > 0 && !findCites.every(c => replace.includes(c))) { skipped++; continue; }

    out = out.split(find).join(replace);
    applied++;
    if (typeof e?.reason === 'string' && editReasons.length < 15) editReasons.push(e.reason.slice(0, 120));
  }

  return { html: out, applied, skipped, editReasons };
}

export async function copyEditHtml(
  html: string,
  opts: { violations: StyleViolation[]; editorialFindings?: string[] },
): Promise<CopyEditResult> {
  const violations = opts.violations.slice(0, 20);
  const findings = (opts.editorialFindings ?? []).slice(0, 5);
  if (violations.length === 0 && findings.length === 0) {
    return { html, applied: 0, skipped: 0, editReasons: [], costUsd: 0 };
  }

  const violationList = violations
    .map(v => `- "${v.match}" → ${v.suggestion}`)
    .join('\n');
  const findingList = findings.map(f => `- ${f}`).join('\n');

  const response = await callLLM({
    messages: [
      {
        role: 'system',
        content:
          'You are a copy editor at a premium research publication. You fix flagged phrases with surgical find/replace edits. ' +
          'Output valid JSON only: {"edits":[{"find":"verbatim text from the article","replace":"improved text","reason":"why"}]}. ' +
          'Rules: find must be a short verbatim phrase (8-200 chars) exactly as written; replace must fix ONLY that phrase; ' +
          'preserve every [SRC-N] and [E-N] citation token inside find; never add facts, numbers or citations; ' +
          'think-tank register — direct, precise, no filler. Max 30 edits. If a flag cannot be fixed safely, omit it.',
      },
      {
        role: 'user',
        content:
          `STYLE VIOLATIONS:\n${violationList || '(none)'}\n\n` +
          `EDITORIAL FINDINGS:\n${findingList || '(none)'}\n\n` +
          `ARTICLE EXCERPT (for context — find strings must come from here):\n${html.replace(/<[^>]+>/g, ' ').slice(0, 9000)}`,
      },
    ],
    task: 'reader_v3',
    temperature: 0.2,
    maxTokens: 3000,
    jsonMode: true,
    enableCache: true,
  });

  const parsed = parseJson<{ edits?: RawEdit[] }>(response.content);
  const edits = Array.isArray(parsed?.edits) ? parsed.edits : [];
  const { html: out, applied, skipped, editReasons } = applySurgicalEdits(html, edits);
  return { html: out, applied, skipped, editReasons, costUsd: response.costUsd };
}
