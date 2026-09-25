/**
 * REVISION EDITOR — NomosX
 *
 * The content-level counterpart of the copy editor: when the publication gate
 * or the Devil's Advocate finds substantive defects (fatal challenges, weak
 * argumentation, overclaims), this agent produces surgical {find, replace}
 * edits that address them — qualify overstated conclusions, add the missing
 * caveat, name the counter-argument — without rewriting the document.
 *
 * Same safety contract as the copy editor (applySurgicalEdits): find must be
 * verbatim, replace carries no HTML tags and preserves every citation token.
 * Content edits may be somewhat larger (a caveat needs room) but are still
 * bounded and never add facts, numbers, or new citations.
 *
 * Cost: 1 LLM call (~$0.005). Only runs when the gate has repairable reasons.
 */

import { callLLM } from '../llm/unified-llm';
import { parseJson } from './json-utils';
import { applySurgicalEdits, type RawEdit } from './copy-editor';

export interface RevisionEditResult {
  html: string;
  applied: number;
  skipped: number;
  editReasons: string[];
  costUsd: number;
}

const MAX_REVISION_EDITS = 8;

export async function reviseForFindings(
  html: string,
  opts: {
    gateReasons: string[];
    daChallenges?: { type: string; text: string }[];
    killShot?: string;
    weakFindings?: string[];
  },
): Promise<RevisionEditResult> {
  const challenges = (opts.daChallenges ?? []).slice(0, 4);
  const weakFindings = (opts.weakFindings ?? []).slice(0, 6);
  const gateReasons = opts.gateReasons.slice(0, 6);
  if (challenges.length === 0 && weakFindings.length === 0 && gateReasons.length === 0) {
    return { html, applied: 0, skipped: 0, editReasons: [], costUsd: 0 };
  }

  const response = await callLLM({
    messages: [
      {
        role: 'system',
        content:
          'You are a senior editor revising an analytical publication after adversarial review. ' +
          'Address each objection with surgical find/replace edits — never a full rewrite. ' +
          'Output valid JSON only: {"edits":[{"find":"verbatim text from the article","replace":"revised text","reason":"which objection it addresses"}]}. ' +
          'Rules: find must be verbatim text exactly as written in the article (8-600 chars); ' +
          'replace fixes that passage — qualify overclaims ("is" → "remains contested"), acknowledge the counter-argument, ' +
          'or tighten a logical leap. Replace may be up to 2x longer than find to fit a caveat, but must contain no HTML tags. ' +
          'Preserve every [SRC-N] and [E-N] citation token inside find. Never add facts, numbers, or citations — ' +
          'only strengthen, qualify, or reframe what is already supported. ' +
          `Max ${MAX_REVISION_EDITS} edits — address the most damaging objections first. If an objection cannot be fixed without new evidence, omit it.`,
      },
      {
        role: 'user',
        content:
          `PUBLICATION GATE REASONS:\n${gateReasons.map(r => `- ${r}`).join('\n') || '(none)'}\n\n` +
          `ADVERSARIAL CHALLENGES (Devil's Advocate):\n${challenges.map(c => `- [${c.type}] ${c.text}`).join('\n') || '(none)'}\n\n` +
          (opts.killShot ? `KILL SHOT: ${opts.killShot}\n\n` : '') +
          `EDITORIAL PANEL WEAK FINDINGS:\n${weakFindings.map(f => `- ${f}`).join('\n') || '(none)'}\n\n` +
          `ARTICLE TEXT (find strings must come verbatim from here):\n${html.replace(/<[^>]+>/g, ' ').slice(0, 12000)}`,
      },
    ],
    task: 'reader_v3',
    temperature: 0.3,
    maxTokens: 4000,
    jsonMode: true,
    enableCache: true,
  });

  const parsed = parseJson<{ edits?: RawEdit[] }>(response.content);
  const edits = Array.isArray(parsed?.edits) ? parsed.edits : [];
  const { html: out, applied, skipped, editReasons } = applySurgicalEdits(html, edits, { maxEdits: MAX_REVISION_EDITS });
  return { html: out, applied, skipped, editReasons, costUsd: response.costUsd };
}
