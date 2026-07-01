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
    team.push({
      lensId: 'general',
      domain: 'Policy',
      role: 'lead',
      mandate: `Primary analytical lens on: ${question.slice(0, 120)}`,
    });
    return {
      team,
      collisionSummary: question,
      productiveFriction: 'Single-domain inquiry — adversarial review applied at institute gate.',
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
  }

  if (dimensions.length >= 3) {
    team.push({
      lensId: dimensions[2].domain,
      domain: formatDomainLabel(dimensions[2].domain),
      role: 'stress-test',
      mandate: dimensions[2].angle,
      frictionWith: formatDomainLabel(dimensions[1].domain),
    });
  } else if (isCrossDomain && dimensions.length === 1) {
    team.push({
      lensId: 'stress-test',
      domain: 'Evidence integrity',
      role: 'stress-test',
      mandate: 'Challenge causal claims and test whether conclusions survive missing counterevidence.',
      frictionWith: formatDomainLabel(dimensions[0].domain),
    });
  }

  const collisionSummary = dimensions.map((d) => d.label).join(' × ');

  return {
    team,
    collisionSummary,
    productiveFriction:
      dimensions.length >= 2
        ? `${formatDomainLabel(dimensions[1].domain)} stress-tests assumptions from ${formatDomainLabel(dimensions[0].domain)} before institute position.`
        : 'Institute gate applies adversarial review on a focused domain lens.',
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

Rules: 2-3 lenses max. Roles must include exactly one lead. Use domain labels only.`,
        },
      ],
      temperature: 0.15,
      maxTokens: 500,
      jsonMode: true,
      task: 'casting',
      enableCache: true,
    });

    const parsed = parseJson<Record<string, unknown>>(response.content);
    if (!parsed) throw new SyntaxError('Casting agent: failed to parse LLM JSON');
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
