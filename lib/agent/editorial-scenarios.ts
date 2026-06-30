/**
 * Ensure ≥2 scenarios exist before Monte Carlo foresight (Editorial V2).
 * Analyst multipass does not emit scenarios — derive from consensus / debate / implications.
 */

import type { DebateResult } from './debate-agent';

function debateBlock(analysis: Record<string, unknown>): { pro?: string; con?: string; synthesis?: string } | undefined {
  const d = analysis.debate;
  if (!d || typeof d !== 'object') return undefined;
  const block = d as Record<string, unknown>;
  return {
    pro: block.pro ? String(block.pro) : undefined,
    con: block.con ? String(block.con) : undefined,
    synthesis: block.synthesis ? String(block.synthesis) : undefined,
  };
}

/**
 * Inject base / adverse / accelerated scenarios when analysis has fewer than 2.
 * Idempotent when scenarios already exist.
 */
export function ensureEditorialScenarios(
  analysis: Record<string, unknown>,
  options?: { debate?: DebateResult | null; question?: string }
): Record<string, unknown> {
  const existing = analysis.scenarios as Array<Record<string, unknown>> | undefined;
  if (existing && existing.length >= 2) return analysis;

  const debate = debateBlock(analysis);
  const consensus = String(analysis.consensus ?? analysis.summary ?? analysis.executiveSummary ?? '').trim();
  const disagreements = String(analysis.disagreements ?? debate?.con ?? '').trim();
  const implications = String(analysis.implications ?? debate?.pro ?? '').trim();
  const question = options?.question ?? '';

  const baseDescription =
    consensus.slice(0, 420) ||
    debate?.synthesis?.slice(0, 420) ||
    `Most likely trajectory for: ${question.slice(0, 120)}`;

  const adverseDescription =
    options?.debate?.position2?.arguments?.[0]?.claim?.slice(0, 420) ||
    disagreements.slice(0, 420) ||
    options?.debate?.position2?.label?.slice(0, 420) ||
    'Material downside if counterevidence or implementation friction dominates.';

  const acceleratedDescription =
    implications.slice(0, 420) ||
    debate?.pro?.slice(0, 420) ||
    'Favorable drivers compound faster than the baseline assumes.';

  const scenarios = [
    {
      name: 'Base case',
      description: baseDescription,
      probability: '50%',
      signals: [] as string[],
    },
    {
      name: 'Adverse case',
      description: adverseDescription,
      probability: '30%',
      signals: [] as string[],
    },
    {
      name: 'Accelerated case',
      description: acceleratedDescription,
      probability: '20%',
      signals: [] as string[],
    },
  ];

  return { ...analysis, scenarios };
}
