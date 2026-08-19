/**
 * Self-Discover — NomosX Sprint 6 (Gap 14)
 *
 * Composition automatique de structures de raisonnement à partir de modules atomiques.
 * Inspiré de :
 * - Self-Discover (Google DeepMind, NeurIPS 2024, arxiv 2402.03620)
 * - Plan-and-Solve (ICLR 2024) — explicit planning before reasoning
 * - Tree of Thoughts (NeurIPS 2024) — branching reasoning
 *
 * Le problème :
 * Les agents NomosX ont des prompts fixes avec une structure de raisonnement
 * prédéfinie. Self-Discover permet au LLM de *composer* sa propre structure de
 * raisonnement à partir de modules atomiques, adaptée à la tâche spécifique.
 *
 * Architecture Self-Discover :
 * 1. Select — sélectionner les modules de raisonnement pertinents pour la tâche
 * 2. Compose — composer les modules en une structure explicite
 * 3. Follow — suivre la structure pendant le raisonnement
 *
 * Modules atomiques (inspirés du papier) :
 * - decomposition : diviser le problème en sous-problèmes
 * - abstraction : identifier les principes abstraits
 * - causal : analyser les relations causales
 * - comparative : comparer différentes options
 * - temporal : analyser l'évolution temporelle
 * - counterfactual : explorer les contre-factuels
 * - analogical : trouver des analogies
 * - deductive : déduction logique
 * - inductive : induction à partir d'exemples
 * - abductive : inférence de la meilleure explication
 * - synthesis : synthétiser des perspectives multiples
 * - verification : vérifier les conclusions
 *
 * Intégration : phase préliminaire pour l'ANALYST avant la multipass analysis.
 */

import { callLLM } from '../llm/unified-llm';
import { parseJson } from './json-utils';

// ─── Types ──────────────────────────────────────────────────────────────────

export type ReasoningModule =
  | 'decomposition'
  | 'abstraction'
  | 'causal'
  | 'comparative'
  | 'temporal'
  | 'counterfactual'
  | 'analogical'
  | 'deductive'
  | 'inductive'
  | 'abductive'
  | 'synthesis'
  | 'verification'
  | 'stakeholder'
  | 'risk'
  | 'scenario';

export interface ReasoningStep {
  /** Which module this step uses */
  module: ReasoningModule;
  /** The instruction for this step */
  instruction: string;
  /** What this step should produce */
  expectedOutput: string;
}

export interface ReasoningStructure {
  /** The query this structure is for */
  query: string;
  /** Selected modules */
  selectedModules: ReasoningModule[];
  /** The composed reasoning steps (in order) */
  steps: ReasoningStep[];
  /** Why this structure was chosen */
  rationale: string;
  /** Cost in USD */
  costUsd: number;
}

// ─── Module Descriptions ────────────────────────────────────────────────────

export const REASONING_MODULES: Record<ReasoningModule, { name: string; description: string; prompt: string }> = {
  decomposition: {
    name: 'Decomposition',
    description: 'Diviser le problème en sous-problèmes indépendants',
    prompt: 'Break this problem into smaller, independent sub-problems. List each sub-problem.',
  },
  abstraction: {
    name: 'Abstraction',
    description: 'Identifier les principes abstraits sous-jacents',
    prompt: 'What are the abstract principles at play here? Identify the general patterns.',
  },
  causal: {
    name: 'Causal Analysis',
    description: 'Analyser les relations causales entre les variables',
    prompt: 'Map the causal relationships. What causes what? Identify feedback loops.',
  },
  comparative: {
    name: 'Comparative Analysis',
    description: 'Comparer différentes options ou perspectives',
    prompt: 'Compare the different options/perspectives. What are the trade-offs?',
  },
  temporal: {
    name: 'Temporal Analysis',
    description: 'Analyser l\'évolution temporelle et les dynamiques',
    prompt: 'How has this evolved over time? What are the temporal dynamics?',
  },
  counterfactual: {
    name: 'Counterfactual Reasoning',
    description: 'Explorer les scénarios contre-factuels',
    prompt: 'What would happen if key conditions were different? Explore counterfactuals.',
  },
  analogical: {
    name: 'Analogical Reasoning',
    description: 'Trouver des analogies avec d\'autres domaines',
    prompt: 'What analogous situations exist in other domains? What can we learn from them?',
  },
  deductive: {
    name: 'Deductive Reasoning',
    description: 'Déduction logique à partir de prémisses',
    prompt: 'Apply deductive reasoning: what follows logically from the premises?',
  },
  inductive: {
    name: 'Inductive Reasoning',
    description: 'Induction à partir d\'exemples spécifiques',
    prompt: 'What general patterns can we induce from the specific examples?',
  },
  abductive: {
    name: 'Abductive Reasoning',
    description: 'Inférer la meilleure explication',
    prompt: 'What is the best explanation for the observed evidence? Consider alternatives.',
  },
  synthesis: {
    name: 'Synthesis',
    description: 'Synthétiser des perspectives multiples',
    prompt: 'Synthesize the different perspectives into a coherent whole.',
  },
  verification: {
    name: 'Verification',
    description: 'Vérifier les conclusions contre les sources',
    prompt: 'Verify each conclusion against the sources. Flag unsupported claims.',
  },
  stakeholder: {
    name: 'Stakeholder Analysis',
    description: 'Analyser les impacts sur les différentes parties prenantes',
    prompt: 'Who are the stakeholders? How are they affected? What are their interests?',
  },
  risk: {
    name: 'Risk Analysis',
    description: 'Identifier et évaluer les risques',
    prompt: 'What are the key risks? How likely are they? How severe? How can they be mitigated?',
  },
  scenario: {
    name: 'Scenario Planning',
    description: 'Générer et évaluer des scénarios alternatifs',
    prompt: 'Generate 3-5 plausible scenarios. Assess probability and implications of each.',
  },
};

// ─── Self-Discover: Select Phase ────────────────────────────────────────────

/**
 * Select the reasoning modules most relevant to the query.
 * This is the "Select" phase of Self-Discover.
 */
export async function selectReasoningModules(
  query: string,
  domain?: string,
): Promise<{ modules: ReasoningModule[]; rationale: string; costUsd: number }> {
  const moduleList = Object.entries(REASONING_MODULES)
    .map(([key, m]) => `- ${key}: ${m.description}`)
    .join('\n');

  try {
    const response = await callLLM({
      messages: [
        {
          role: 'system',
          content: `You are a Reasoning Structure Designer (Self-Discover pattern).

Given a research query, select the 3-6 reasoning modules most relevant to answering it well.

Available modules:
${moduleList}

Respond with JSON:
{
  "modules": ["causal", "comparative", "synthesis"],
  "rationale": "why these modules are relevant for this query"
}

Guidelines:
- Select modules that match the TYPE of question (causal questions → causal module)
- Always include "synthesis" and "verification" as final steps
- For policy questions, include "stakeholder" and "risk"
- For trend questions, include "temporal"
- For "what if" questions, include "counterfactual" and "scenario"
- For complex questions, include "decomposition" first`,
        },
        {
          role: 'user',
          content: `Query: "${query}"
${domain ? `Domain: ${domain}` : ''}

Select the most relevant reasoning modules:`,
        },
      ],
      temperature: 0.3,
      jsonMode: true,
      maxTokens: 300,
      task: 'enrichment_reasoner',
    });

    const parsed = parseJson<{ modules: ReasoningModule[]; rationale: string }>(response.content);
    if (parsed?.modules && Array.isArray(parsed.modules)) {
      // Always ensure synthesis and verification are included
      const allModules = [...parsed.modules, 'synthesis', 'verification'];
      const modules = Array.from(new Set(allModules)) as ReasoningModule[];
      return {
        modules: modules.slice(0, 7), // Max 7 modules
        rationale: parsed.rationale || 'Selected based on query type',
        costUsd: response.costUsd,
      };
    }
  } catch (err) {
    console.warn('[SelfDiscover] module selection failed:', err);
  }

  // Fallback: default modules
  return {
    modules: ['decomposition', 'causal', 'comparative', 'synthesis', 'verification'],
    rationale: 'Default module set (fallback)',
    costUsd: 0,
  };
}

// ─── Self-Discover: Compose Phase ───────────────────────────────────────────

/**
 * Compose the selected modules into an explicit reasoning structure.
 * This is the "Compose" phase of Self-Discover.
 */
export async function composeReasoningStructure(
  query: string,
  modules: ReasoningModule[],
  domain?: string,
): Promise<{ steps: ReasoningStep[]; costUsd: number }> {
  const moduleDescriptions = modules
    .map(m => `- ${m}: ${REASONING_MODULES[m].description} — Prompt: "${REASONING_MODULES[m].prompt}"`)
    .join('\n');

  try {
    const response = await callLLM({
      messages: [
        {
          role: 'system',
          content: `You are a Reasoning Structure Composer (Self-Discover pattern).

Given a query and selected reasoning modules, compose them into an explicit, ordered reasoning structure.

Each step should:
1. Use one module
2. Have a specific instruction adapted to the query
3. Have a clear expected output

Respond with JSON:
{
  "steps": [
    {
      "module": "decomposition",
      "instruction": "Break the question 'X' into sub-questions about A, B, C",
      "expectedOutput": "List of 3-5 sub-questions"
    },
    ...
  ]
}

Order the steps logically: start with decomposition/abstraction, then analysis modules, then synthesis, then verification.`,
        },
        {
          role: 'user',
          content: `Query: "${query}"
${domain ? `Domain: ${domain}` : ''}

Selected modules:
${moduleDescriptions}

Compose the reasoning structure:`,
        },
      ],
      temperature: 0.3,
      jsonMode: true,
      maxTokens: 1000,
      task: 'enrichment_reasoner',
    });

    const parsed = parseJson<{ steps: ReasoningStep[] }>(response.content);
    if (parsed?.steps && Array.isArray(parsed.steps)) {
      return { steps: parsed.steps, costUsd: response.costUsd };
    }
  } catch (err) {
    console.warn('[SelfDiscover] composition failed:', err);
  }

  // Fallback: use default prompts from modules
  const steps: ReasoningStep[] = modules.map(module => ({
    module,
    instruction: REASONING_MODULES[module].prompt,
    expectedOutput: `Output of ${REASONING_MODULES[module].name}`,
  }));
  return { steps, costUsd: 0 };
}

// ─── Main Self-Discover Function ────────────────────────────────────────────

/**
 * Run Self-Discover to create a reasoning structure for a query.
 *
 * Flow:
 * 1. Select — choose relevant reasoning modules
 * 2. Compose — compose them into an ordered structure
 *
 * The resulting structure can be injected into the agent's prompt to guide
 * its reasoning in a way that's adapted to the specific query.
 *
 * @param query - The research query
 * @param domain - Optional domain hint
 * @returns The reasoning structure
 */
export async function selfDiscover(
  query: string,
  domain?: string,
): Promise<ReasoningStructure> {
  // Step 1: Select modules
  const { modules, rationale, costUsd: selectCost } = await selectReasoningModules(query, domain);

  // Step 2: Compose structure
  const { steps, costUsd: composeCost } = await composeReasoningStructure(query, modules, domain);

  return {
    query,
    selectedModules: modules,
    steps,
    rationale,
    costUsd: selectCost + composeCost,
  };
}

// ─── Build Prompt Injection ─────────────────────────────────────────────────

/**
 * Build a prompt injection string from a reasoning structure.
 * This is injected into the agent's system prompt to guide its reasoning.
 */
export function buildReasoningStructureInjection(structure: ReasoningStructure): string {
  const stepsText = structure.steps
    .map((step, i) => `### Step ${i + 1}: ${REASONING_MODULES[step.module].name}
${step.instruction}
Expected output: ${step.expectedOutput}`)
    .join('\n\n');

  return `
=== DISCOVERED REASONING STRUCTURE (Self-Discover) ===
This query requires the following reasoning approach:

${stepsText}

Follow this structure in your analysis. Each step builds on the previous one.
Rationale: ${structure.rationale}
=== END REASONING STRUCTURE ===`.trim();
}
