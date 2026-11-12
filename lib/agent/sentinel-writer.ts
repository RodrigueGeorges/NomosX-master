/**
 * SENTINEL WRITER — short-horizon, checkable predictions.
 *
 * Strategic horizons are pluriannual, so they give no calibration signal for
 * years. A sentinel is a 30/60/90-day observable tied to one uncertain link
 * of the causal chain: if the link is heading the way the chain says, this
 * should be visible by that date. One cheap LLM call drafts them; a
 * deterministic validator rejects anything that cannot be resolved
 * (no threshold, no source, wrong window). The swarm then PRICES them in the
 * same ballots as the links, so their Brier scores measure the swarm.
 */

import { callLLM } from '../llm/unified-llm';
import { parseJson } from './json-utils';

export interface SentinelDraft {
  /** Vote id — kept clear of real chain link ids. */
  voteId: number;
  linkId: number;
  statement: string;
  dueAt: string; // ISO date
  resolutionCriteria: string;
  resolutionSource: string;
}

export const SENTINEL_VOTE_ID_BASE = 9000;
const WINDOWS = [30, 60, 90] as const;

/** Deterministic validity: resolvable by a third party at the due date. */
export function validateSentinel(
  d: { statement?: unknown; dueInDays?: unknown; resolutionCriteria?: unknown; resolutionSource?: unknown; linkId?: unknown },
  allowedLinkIds: number[],
): string[] {
  const issues: string[] = [];
  const statement = String(d.statement ?? '').trim();
  const criteria = String(d.resolutionCriteria ?? '').trim();
  const source = String(d.resolutionSource ?? '').trim();
  const days = Number(d.dueInDays);
  if (statement.length < 20) issues.push('statement too short');
  if (!WINDOWS.includes(days as (typeof WINDOWS)[number])) issues.push('dueInDays must be 30, 60 or 90');
  if (!/\d/.test(criteria)) issues.push('criteria need a number, threshold or date');
  if (criteria.length < 20) issues.push('criteria too short');
  if (source.length < 4) issues.push('no resolution source');
  if (!allowedLinkIds.includes(Number(d.linkId))) issues.push('unknown linkId');
  // A year beyond the window means the statement is not about the window.
  const latestYear = new Date(Date.now() + 90 * 86_400_000).getFullYear();
  if ([...statement.matchAll(/\b(20\d{2})\b/g)].some(m => Number(m[1]) > latestYear)) issues.push('statement dated beyond the sentinel window');
  return issues;
}

export async function writeSentinels(input: {
  question: string;
  uncertainties: Array<{ linkId: number; claim: string }>;
  runId?: string;
  now?: Date;
}): Promise<{ sentinels: SentinelDraft[]; rejected: number; costUsd: number }> {
  const now = input.now ?? new Date();
  const allowed = input.uncertainties.map(u => u.linkId);
  try {
    const res = await callLLM({
      task: 'fact_check',
      temperature: 0.2,
      maxTokens: 700,
      jsonMode: true,
      runId: input.runId,
      traceName: 'sentinel_writer',
      maxCostUsd: 0.02,
      messages: [
        {
          role: 'system',
          content: `You write early-warning forecasts. For each uncertain causal link, write ONE observable that should be visible within 30, 60 or 90 days if the link is heading the way it claims. Requirements, all mandatory:
- A yes/no statement about a public, datable fact (a published figure crossing a threshold, a scheduled decision, a vote, a filing). Not a restatement of the long-term claim.
- Resolution criteria naming the exact figure, threshold or date.
- A resolution source: the public body, dataset or publication where anyone can check it.
- It must be genuinely uncertain today.
Return ONLY JSON: {"sentinels":[{"linkId":<number>,"statement":"...","dueInDays":30|60|90,"resolutionCriteria":"...","resolutionSource":"..."}]}. At most 3. Return fewer rather than invent an uncheckable one.`,
        },
        {
          role: 'user',
          content: `TODAY: ${now.toISOString().slice(0, 10)}\nQUESTION: ${input.question}\n\nUNCERTAIN LINKS:\n${input.uncertainties.map(u => `LINK #${u.linkId}: ${u.claim}`).join('\n')}`,
        },
      ],
    });
    const parsed = parseJson<{ sentinels?: Array<Record<string, unknown>> }>(res.content);
    const drafts = Array.isArray(parsed?.sentinels) ? parsed!.sentinels.slice(0, 3) : [];
    const sentinels: SentinelDraft[] = [];
    let rejected = 0;
    for (const d of drafts) {
      if (validateSentinel(d, allowed).length > 0) { rejected++; continue; }
      const days = Number(d.dueInDays);
      sentinels.push({
        voteId: SENTINEL_VOTE_ID_BASE + sentinels.length + 1,
        linkId: Number(d.linkId),
        statement: String(d.statement).trim().slice(0, 500),
        dueAt: new Date(now.getTime() + days * 86_400_000).toISOString().slice(0, 10),
        resolutionCriteria: String(d.resolutionCriteria).trim().slice(0, 500),
        resolutionSource: String(d.resolutionSource).trim().slice(0, 300),
      });
    }
    return { sentinels, rejected, costUsd: res.costUsd ?? 0 };
  } catch {
    return { sentinels: [], rejected: 0, costUsd: 0 };
  }
}
