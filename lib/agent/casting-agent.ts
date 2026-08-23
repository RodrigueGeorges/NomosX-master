/**
 * CASTING AGENT — Assemble a cross-domain reasoning team for productive friction.
 * Public briefs expose lenses (domains), not PhD personas.
 */

import { callLLM } from '../llm/unified-llm';
import { parseJson } from './json-utils';
import type { TopicClassification } from './topic-classifier';
import {
  dimensionsFromClassification,
  formatDomainLabel,
  type CastingResult,
  type CastTeamMember,
  type EditorialDimension,
} from './editorial-types';

function buildDeterministicTeam(
  question: string,
  dimensions: EditorialDimension[],
  isCrossDomain: boolean
): Omit<CastingResult, 'costUsd'> {
  const team: CastTeamMember[] = [];

  if (dimensions.length === 0) {
    // Even with 0 dimensions, produce 3 team members for productive friction
    team.push({
      lensId: 'general',
      domain: 'Policy',
      role: 'lead',
      mandate: `Primary analytical lens on: ${question.slice(0, 120)}`,
    });
    team.push({
      lensId: 'evidence',
      domain: 'Evidence integrity',
      role: 'friction',
      mandate: 'Challenge causal claims and test whether conclusions survive missing counterevidence.',
      frictionWith: 'Policy',
    });
    team.push({
      lensId: 'foresight',
      domain: 'Strategic foresight',
      role: 'stress-test',
      mandate: 'Stress-test projections against alternative futures and identify black-swan risks.',
      frictionWith: 'Evidence integrity',
    });
    return {
      team,
      collisionSummary: question.slice(0, 100),
      productiveFriction: 'Evidence integrity challenges Policy assumptions; foresight stress-tests against alternative futures.',
    };
  }

  team.push({
    lensId: dimensions[0].domain,
    domain: formatDomainLabel(dimensions[0].domain),
    role: 'lead',
    mandate: dimensions[0].angle,
  });

  if (dimensions.length >= 2) {
    team.push({
      lensId: dimensions[1].domain,
      domain: formatDomainLabel(dimensions[1].domain),
      role: 'friction',
      mandate: dimensions[1].angle,
      frictionWith: formatDomainLabel(dimensions[0].domain),
    });
  } else {
    // Always add a friction lens even with 1 dimension
    team.push({
      lensId: 'evidence',
      domain: 'Evidence integrity',
      role: 'friction',
      mandate: 'Challenge causal claims and test whether conclusions survive missing counterevidence.',
      frictionWith: formatDomainLabel(dimensions[0].domain),
    });
  }

  if (dimensions.length >= 3) {
    team.push({
      lensId: dimensions[2].domain,
      domain: formatDomainLabel(dimensions[2].domain),
      role: 'stress-test',
      mandate: dimensions[2].angle,
      frictionWith: formatDomainLabel(dimensions[1].domain),
    });
  } else {
    // Always add a stress-test lens
    team.push({
      lensId: 'foresight',
      domain: 'Strategic foresight',
      role: 'stress-test',
      mandate: 'Stress-test projections against alternative futures and identify black-swan risks.',
      frictionWith: team[1]?.domain ?? 'Evidence integrity',
    });
  }

  const collisionSummary = dimensions.length >= 2
    ? dimensions.map((d) => d.label).join(' × ')
    : `${dimensions[0]?.label ?? question.slice(0, 60)} × Evidence × Foresight`;

  return {
    team,
    collisionSummary,
    productiveFriction:
      dimensions.length >= 2
        ? `${formatDomainLabel(dimensions[1].domain)} stress-tests assumptions from ${formatDomainLabel(dimensions[0].domain)} before institute position.`
        : 'Evidence integrity challenges the lead lens; foresight stress-tests against alternative futures.',
  };
}

/**
 * Cast a dedicated cross-domain reasoning team for an inquiry.
 */
export async function castingAgent(
  question: string,
  classification: TopicClassification
): Promise<CastingResult> {
  const dimensions = dimensionsFromClassification(classification);
  const fallback = buildDeterministicTeam(question, dimensions, classification.isCrossDomain);

  if (dimensions.length < 2) {
    return { ...fallback, costUsd: 0 };
  }

  try {
    const dimBlock = dimensions
      .map(
        (d, i) =>
          `${i + 1}. ${d.label} (${d.domain}, conf ${(d.confidence * 100).toFixed(0)}%) — ${d.angle}`
      )
      .join('\n');

    const response = await callLLM({
      messages: [
        {
          role: 'system',
          content: `You are the editorial casting director at NomosX, an agentic think tank.
Assign REASONING LENSES (domain analytical models) — never human names or PhD personas.
Goal: productive friction between lenses on a cross-domain collision.`,
        },
        {
          role: 'user',
          content: `INQUIRY: ${question}

COLLISION DIMENSIONS:
${dimBlock}

CLASSIFICATION REASONING: ${classification.reasoning}

Return JSON:
{
  "collisionSummary": "One line: A × B × C collision thesis",
  "productiveFriction": "One sentence on what tension the team must resolve",
  "team": [
    {
      "lensId": "domain_id",
      "domain": "Display label",
      "role": "lead|friction|stress-test",
      "mandate": "What this lens must contribute (1 sentence)",
      "frictionWith": "optional — which lens it challenges"
    }
  ]
}

Rules: 2-3 lenses max. Roles must include exactly one lead. Use domain labels only.
OUTPUT ONLY THE JSON OBJECT. No markdown, no prose, no explanation — just the raw JSON.`,
        },
      ],
      temperature: 0.15,
      maxTokens: 1500,
      jsonMode: true,
      task: 'casting',
      enableCache: true,
    });

    const parsed = parseJson<Record<string, unknown>>(response.content);
    if (!parsed) {
      console.warn('[CASTING] Raw LLM response (first 300 chars):', response.content?.slice(0, 300));
      throw new SyntaxError('Casting agent: failed to parse LLM JSON');
    }
    const team: CastTeamMember[] = ((parsed.team as CastTeamMember[]) ?? [])
      .slice(0, 3)
      .map((m: CastTeamMember) => ({
        lensId: String(m.lensId ?? m.domain ?? 'lens'),
        domain: String(m.domain ?? 'Lens'),
        role: (['lead', 'friction', 'stress-test'].includes(m.role) ? m.role : 'friction') as CastTeamMember['role'],
        mandate: String(m.mandate ?? ''),
        frictionWith: m.frictionWith ? String(m.frictionWith) : undefined,
      }));

    if (team.length === 0 || !team.some((t) => t.role === 'lead')) {
      return { ...fallback, costUsd: response.costUsd };
    }

    return {
      team,
      collisionSummary: String(parsed.collisionSummary ?? fallback.collisionSummary),
      productiveFriction: String(parsed.productiveFriction ?? fallback.productiveFriction),
      costUsd: response.costUsd,
    };
  } catch (err) {
    console.warn('[CASTING] LLM casting failed, using deterministic team:', err);
    return { ...fallback, costUsd: 0 };
  }
}
