/**
 * Meta-Controller — NomosX
 *
 * Méta-contrôleur LLM-driven inspiré de COMPASS (arXiv 2026) et D2Plan.
 * Contrairement à l'orchestrateur déterministe (orchestrator.ts) qui utilise
 * des règles if/else statiques, le méta-contrôleur utilise un LLM pour raisonner
 * sur l'état du pipeline et décider de la prochaine action.
 *
 * Avantages :
 * - Contextuel : tient compte de la query spécifique, pas juste des métriques
 * - Adaptatif : peut suggérer des actions que les règles statiques ne prévoient pas
 * - Explicable : produit un raisonnement en langage naturel
 *
 * Sécurité :
 * - Borné : max 3 interventions par run (contrôle du coût)
 * - Fallback : si le LLM échoue, retombe sur l'orchestrateur déterministe
 * - Validé : l'action suggérée doit être dans la liste autorisée
 *
 * Pattern : COMPASS (LLM as controller) + D2Plan (hierarchical planning-execution)
 */

import { callLLM } from '../llm/unified-llm';
import { parseJson } from './json-utils';
import {
  type OrchestratorAction,
  type OrchestratorDecision,
  type PipelineState,
  assessAfterScout,
  assessAfterReader,
  assessAfterAnalyst,
} from './orchestrator';

// ─── Types ──────────────────────────────────────────────────────────────────

export type ControllerPhase = 'after_scout' | 'after_reader' | 'after_analyst' | 'after_critical_loop';

export interface ControllerContext {
  phase: ControllerPhase;
  query: string;
  state: PipelineState;
  /** Recent findings from the blackboard (for context) */
  recentFindings?: string[];
  /** Cost so far in USD */
  currentCostUsd?: number;
  /** Budget cap in USD */
  budgetCapUsd?: number;
}

export interface ControllerDecision extends OrchestratorDecision {
  /** LLM-generated reasoning explaining the decision */
  reasoning: string;
  /** Whether this decision came from the LLM or the deterministic fallback */
  source: 'llm' | 'deterministic_fallback';
  /** Cost of the controller call */
  costUsd: number;
  /** Confidence in the decision (0-1) */
  confidence: number;
}

// ─── LLM-Driven Controller ──────────────────────────────────────────────────

/**
 * The meta-controller uses an LLM to reason about the pipeline state and
 * decide the next action. Falls back to deterministic rules if the LLM fails.
 */
export async function metaControllerDecide(
  ctx: ControllerContext
): Promise<ControllerDecision> {
  const { phase, query, state } = ctx;

  // Budget check — don't call the LLM controller if we're near the budget cap
  if (ctx.budgetCapUsd && ctx.currentCostUsd && ctx.currentCostUsd > ctx.budgetCapUsd * 0.8) {
    console.log('[MetaController] Near budget cap — using deterministic fallback');
    return deterministicFallback(ctx);
  }

  // Build the prompt with full context
  const prompt = buildControllerPrompt(ctx);

  try {
    const response = await callLLM({
      messages: [
        {
          role: 'system',
          content: `You are the meta-controller of a research analysis pipeline. Your job is to assess the current state and decide the next action.

You are running the pipeline for this research question:
"${query}"

Current phase: ${phase}
Pipeline iteration: ${state.iteration}/${state.maxIterations}

Current state metrics:
- Sources found: ${state.sourcesFound}
- Sources with abstract: ${state.sourcesWithAbstract}
- Sources with full text: ${state.sourcesWithFullText}
- Average quality score: ${state.avgQualityScore}/100
- Provider diversity: ${state.providerDiversity} providers
- Analyst confidence: ${state.analystConfidence || 'N/A'}
- Citation coverage: ${state.citationCoverage !== null ? `${Math.round((state.citationCoverage || 0) * 100)}%` : 'N/A'}
- Trust score: ${state.trustScore !== null ? `${state.trustScore}/100` : 'N/A'}
- Known concepts: ${state.knownConceptCount}
- Prior briefs on this topic: ${state.priorBriefCount}

${ctx.recentFindings?.length ? `Recent findings from the blackboard:\n${ctx.recentFindings.map(f => `- ${f}`).join('\n')}` : ''}

Previous decisions in this run:
${state.decisions.map(d => `- ${d.action}: ${d.reason}`).join('\n') || '(none)'}

Decide the next action. You MUST respond with valid JSON:
{
  "action": "PROCEED" | "RE_SCOUT" | "DEEPEN" | "RE_ANALYZE" | "DEBATE" | "PIVOT" | "ABORT",
  "reason": "Brief explanation of why this action",
  "reasoning": "Detailed reasoning — what specifically about the state motivated this decision",
  "params": {
    "newTerms": ["term1", "term2"],
    "sourceIds": ["id1"],
    "focus": "specific focus for re-analysis",
    "debateTopic": "specific question to debate",
    "suggestedAngle": "new angle to explore"
  },
  "confidence": 0.0 to 1.0
}

Guidelines:
- PROCEED when the state is sufficient for the next phase
- RE_SCOUT when sources are too few (< 10) or quality is low (< 70) or provider diversity is poor (< 3)
- DEEPEN when sources lack abstracts/full-text but are otherwise good
- RE_ANALYZE when the analysis has low citation coverage (< 50%) or low confidence
- DEBATE when sources disagree on a key point and a structured debate would resolve it
- PIVOT when the knowledge graph reveals a more important angle than the original question
- ABORT only when there are fundamentally insufficient sources (< 5) after multiple attempts

Be conservative: prefer PROCEED unless there's a clear quality issue. Each non-PROCEED action costs time and money.`,
        },
        {
          role: 'user',
          content: `Assess the current state and decide the next action for phase "${phase}".`,
        },
      ],
      temperature: 0.2,
      jsonMode: true,
      maxTokens: 800,
      task: 'enrichment_reasoner',
    });

    const parsed = parseJson<ControllerDecision>(response.content);

    if (parsed && isValidAction(parsed.action)) {
      return {
        action: parsed.action,
        reason: parsed.reason || '',
        params: parsed.params,
        reasoning: parsed.reasoning || parsed.reason || '',
        source: 'llm',
        costUsd: response.costUsd,
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.7,
      };
    }

    // Invalid response — fall back
    console.warn('[MetaController] LLM returned invalid action, falling back');
    return deterministicFallback(ctx, response.costUsd);
  } catch (err) {
    console.warn('[MetaController] LLM call failed, falling back:', err);
    return deterministicFallback(ctx);
  }
}

// ─── Deterministic Fallback ─────────────────────────────────────────────────

function deterministicFallback(ctx: ControllerContext, costUsd = 0): ControllerDecision {
  let decision: OrchestratorDecision;
  switch (ctx.phase) {
    case 'after_scout':
      decision = assessAfterScout(ctx.state);
      break;
    case 'after_reader':
      decision = assessAfterReader(ctx.state);
      break;
    case 'after_analyst':
      decision = assessAfterAnalyst(ctx.state);
      break;
    default:
      decision = { action: 'PROCEED', reason: 'Default proceed' };
  }

  return {
    ...decision,
    reasoning: decision.reason,
    source: 'deterministic_fallback',
    costUsd,
    confidence: 0.5,
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function buildControllerPrompt(ctx: ControllerContext): string {
  // Already built inline in the system prompt above
  return '';
}

function isValidAction(action: string): action is OrchestratorAction {
  return ['PROCEED', 'RE_SCOUT', 'DEEPEN', 'RE_ANALYZE', 'DEBATE', 'PIVOT', 'ABORT'].includes(action);
}

// ─── Batch Controller (for multi-phase planning) ────────────────────────────

/**
 * Plan multiple phases at once (D2Plan pattern — hierarchical planning).
 * Returns a sequence of expected decisions for the remaining phases.
 * This is a "soft plan" — each phase still calls metaControllerDecide() at runtime,
 * but the plan provides context for what to expect.
 */
export async function planRemainingPhases(
  query: string,
  state: PipelineState,
  remainingPhases: ControllerPhase[]
): Promise<{
  plan: Array<{ phase: ControllerPhase; expectedAction: OrchestratorAction; rationale: string }>;
  costUsd: number;
}> {
  if (remainingPhases.length === 0) {
    return { plan: [], costUsd: 0 };
  }

  try {
    const response = await callLLM({
      messages: [
        {
          role: 'system',
          content: `You are planning a research analysis pipeline. Given the current state and remaining phases, predict what action each phase will likely need.

Research question: "${query}"
Current state: ${JSON.stringify({ sourcesFound: state.sourcesFound, avgQuality: state.avgQualityScore, iteration: state.iteration })}

Remaining phases: ${remainingPhases.join(', ')}

Respond with JSON:
{
  "plan": [
    { "phase": "after_reader", "expectedAction": "PROCEED", "rationale": "..." },
    { "phase": "after_analyst", "expectedAction": "DEBATE", "rationale": "..." }
  ]
}

Only include phases from the remaining list. Be realistic — most phases should be PROCEED.`,
        },
        { role: 'user', content: 'Plan the remaining phases.' },
      ],
      temperature: 0.2,
      jsonMode: true,
      maxTokens: 600,
      task: 'enrichment_reasoner',
    });

    const parsed = parseJson<{ plan: Array<{ phase: ControllerPhase; expectedAction: OrchestratorAction; rationale: string }> }>(response.content);
    if (parsed?.plan && Array.isArray(parsed.plan)) {
      return { plan: parsed.plan, costUsd: response.costUsd };
    }
  } catch (err) {
    console.warn('[MetaController] Plan failed:', err);
  }

  // Fallback: all PROCEED
  return {
    plan: remainingPhases.map(phase => ({
      phase,
      expectedAction: 'PROCEED' as OrchestratorAction,
      rationale: 'Default plan',
    })),
    costUsd: 0,
  };
}
