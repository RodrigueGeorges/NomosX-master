import { z } from 'zod';

const patchSchema = z.object({
  patches: z.array(z.object({
    path: z.array(z.union([z.string().min(1), z.number().int().nonnegative()])).min(1).max(8),
    before: z.string(),
    after: z.string().min(1).max(6000),
  }).strict()).min(1).max(24),
}).strict();

const editableFields = new Set([
  'title', 'throughLine', 'anchoringBasis', 'causalChain', 'keyFindings',
  'trajectory', 'rejectedAlternatives', 'whatToWatch', 'evidenceAssessment',
]);
const blockedFields = new Set(['__proto__', 'prototype', 'constructor', 'id', 'sourceRef', 'derivesFrom', 'temporalStatus']);

export function applyAnalysisRepair<T extends Record<string, unknown>>(
  original: T, response: unknown, sourceIndices: Set<number>,
): T {
  const { patches } = patchSchema.parse(response);
  const result = structuredClone(original);
  const seen = new Set<string>();
  for (const patch of patches) {
    const pathKey = JSON.stringify(patch.path);
    if (seen.has(pathKey) || !editableFields.has(String(patch.path[0])) ||
        patch.path.some(p => typeof p === 'string' && (p.startsWith('_') || blockedFields.has(p)))) {
      throw new Error('Repair path is not editable');
    }
    seen.add(pathKey);
    let target: any = result;
    for (const key of patch.path.slice(0, -1)) {
      if (!target || typeof target !== 'object' || !Object.prototype.hasOwnProperty.call(target, key)) {
        throw new Error('Repair path does not exist');
      }
      target = target[key];
    }
    const key = patch.path[patch.path.length - 1];
    if (!target || typeof target !== 'object' || !Object.prototype.hasOwnProperty.call(target, key) ||
        typeof target[key] !== 'string' || target[key] !== patch.before || patch.before === patch.after) {
      throw new Error('Repair precondition failed');
    }
    for (const match of patch.after.matchAll(/\[SRC-(\d+)\]/g)) {
      if (!sourceIndices.has(Number(match[1]))) throw new Error('Repair cites unavailable evidence');
    }
    target[key] = patch.after;
  }
  return result;
}

export function criticReviewText(analysis: Record<string, unknown>): string {
  const excluded = new Set([
    '_meta', '_deliberationContext', '_harvardCouncil', 'rejectedAlternatives',
    'whatToWatch', 'trajectory', 'evidenceAssessment', 'convictionLevel',
  ]);
  return JSON.stringify(Object.fromEntries(Object.entries(analysis).filter(([key]) => !excluded.has(key))))
    .replace(/\[E(\d+)\]/g, '[SRC-$1]');
}

interface RepairReview {
  overallScore: number;
  groundedness: number;
  verdict: string;
  contradictions: unknown[];
  citationIssues: unknown[];
}

export function repairImproves(before: RepairReview, after: RepairReview): boolean {
  return [before.overallScore, after.overallScore, before.groundedness, after.groundedness].every(Number.isFinite)
    && after.verdict !== 'reject'
    && after.overallScore > before.overallScore
    && after.groundedness >= before.groundedness
    && after.contradictions.length <= before.contradictions.length
    && after.citationIssues.length <= before.citationIssues.length;
}
