/**
 * NomosX DAG Pipeline Declaration
 *
 * Inspired by PARNESS + FAROS (NeurIPS 2025).
 *
 * Declares the pipeline as a DAG (Directed Acyclic Graph) in a structured
 * format, enabling:
 * - Conditional step execution (skip if prerequisites not met)
 * - Easy experimentation with new pipeline configurations
 * - Visual pipeline auditing
 * - Step-level feature flags
 *
 * This is a DECLARATION file — the actual execution logic remains in
 * pipeline-v2.ts. This file serves as documentation and configuration
 * for future refactoring toward a fully declarative pipeline engine.
 */

export type StepStatus = 'always' | 'conditional' | 'optional' | 'strategic_only';
export type StepCategory = 'intake' | 'processing' | 'analysis' | 'quality' | 'output';

export interface PipelineStepDef {
  id: string;
  name: string;
  category: StepCategory;
  status: StepStatus;
  description: string;
  dependsOn: string[];
  outputs: string[];
  configKey?: string;
  estimatedCostUsd?: number;
  estimatedDurationMs?: number;
}

export interface PipelineDAG {
  version: string;
  steps: PipelineStepDef[];
  edges: Array<{ from: string; to: string; condition?: string }>;
}

/**
 * The canonical NomosX pipeline DAG.
 * This mirrors the execution flow in pipeline-v2.ts runPipelineCore().
 */
export const PIPELINE_DAG: PipelineDAG = {
  version: '2.0',
  steps: [
    // ── INTAKE ──
    {
      id: 'context_primer',
      name: 'Context Primer',
      category: 'intake',
      status: 'always',
      description: 'Load known concepts, prior briefs, emerging trends from AgentMemory',
      dependsOn: [],
      outputs: ['knownConcepts', 'coverageGap'],
      estimatedCostUsd: 0.01,
      estimatedDurationMs: 5000,
    },
    {
      id: 'scout',
      name: 'SCOUT Agent',
      category: 'intake',
      status: 'always',
      description: 'Query academic APIs in parallel, normalize, enrich with Unpaywall',
      dependsOn: ['context_primer'],
      outputs: ['rawSources'],
      estimatedCostUsd: 0.05,
      estimatedDurationMs: 30000,
    },
    {
      id: 'index',
      name: 'INDEX Agent',
      category: 'processing',
      status: 'always',
      description: 'Normalize sources, enrich identities (ROR/ORCID), deduplicate',
      dependsOn: ['scout'],
      outputs: ['enrichedSources'],
      estimatedCostUsd: 0.02,
      estimatedDurationMs: 20000,
    },
    {
      id: 'embed',
      name: 'EMBED',
      category: 'processing',
      status: 'always',
      description: 'Generate semantic embeddings for all sources',
      dependsOn: ['index'],
      outputs: ['embeddedSources'],
      estimatedCostUsd: 0.01,
      estimatedDurationMs: 15000,
    },
    {
      id: 'deduplicate',
      name: 'DEDUPLICATE',
      category: 'processing',
      status: 'always',
      description: 'Group by DOI, keep earliest, delete duplicates',
      dependsOn: ['embed'],
      outputs: ['dedupedSourceIds'],
      estimatedCostUsd: 0,
      estimatedDurationMs: 5000,
    },
    {
      id: 'rank',
      name: 'RANK Agent V3',
      category: 'processing',
      status: 'always',
      description: 'Composite scoring, relevance filtering, diversity constraints',
      dependsOn: ['deduplicate'],
      outputs: ['topSources', 'evidenceRegistry'],
      configKey: 'rankOpts',
      estimatedCostUsd: 0,
      estimatedDurationMs: 10000,
    },
    {
      id: 'structured_refusal',
      name: 'Structured Refusal Check',
      category: 'processing',
      status: 'conditional',
      description: 'If sourceCount < min, return structured refusal instead of proceeding',
      dependsOn: ['rank'],
      outputs: ['refusalOrContinue'],
      estimatedCostUsd: 0,
      estimatedDurationMs: 100,
    },

    // ── ANALYSIS ──
    {
      id: 'topic_classification',
      name: 'Topic Classification',
      category: 'analysis',
      status: 'always',
      description: 'LLM-based domain classification with rules fallback',
      dependsOn: ['rank'],
      outputs: ['primaryDomain', 'dimensions'],
      estimatedCostUsd: 0.01,
      estimatedDurationMs: 10000,
    },
    {
      id: 'casting',
      name: 'Casting Agent',
      category: 'analysis',
      status: 'conditional',
      description: 'Assemble cross-domain reasoning team (editorialV2 only)',
      dependsOn: ['topic_classification'],
      outputs: ['castingResult'],
      configKey: 'editorialV2',
      estimatedCostUsd: 0.02,
      estimatedDurationMs: 15000,
    },
    {
      id: 'reader',
      name: 'READER V3',
      category: 'analysis',
      status: 'always',
      description: 'Deep extraction: claims, methods, results, limitations from abstracts + full text',
      dependsOn: ['rank'],
      outputs: ['readings'],
      estimatedCostUsd: 0.10,
      estimatedDurationMs: 60000,
    },
    {
      id: 'analyst',
      name: 'ANALYST (Multipass or Strategic)',
      category: 'analysis',
      status: 'always',
      description: '3-pass synthesis or strategic 16K-token analysis with debate structure',
      dependsOn: ['reader', 'casting'],
      outputs: ['analysis'],
      configKey: 'isStrategic',
      estimatedCostUsd: 0.30,
      estimatedDurationMs: 120000,
    },
    {
      id: 'gap_aware_append',
      name: 'Gap-Aware Evidence Append',
      category: 'analysis',
      status: 'optional',
      description: 'Identify low-coverage sections, generate targeted queries, re-scout, re-rank',
      dependsOn: ['analyst'],
      outputs: ['expandedSources'],
      estimatedCostUsd: 0.05,
      estimatedDurationMs: 30000,
    },
    {
      id: 'structural_editor',
      name: 'Structural Editor',
      category: 'analysis',
      status: 'always',
      description: 'McKinsey pyramid principle storyline review',
      dependsOn: ['analyst'],
      outputs: ['structuralReview'],
      estimatedCostUsd: 0.05,
      estimatedDurationMs: 30000,
    },
    {
      id: 'harvard_council',
      name: 'Harvard Council',
      category: 'analysis',
      status: 'conditional',
      description: 'Multi-expert council with CEBM evidence grading',
      dependsOn: ['analyst'],
      outputs: ['councilSynthesis'],
      configKey: 'tier >= premium',
      estimatedCostUsd: 0.15,
      estimatedDurationMs: 90000,
    },
    {
      id: 'phd_deliberation',
      name: 'PhD Collaborative Deliberation',
      category: 'analysis',
      status: 'conditional',
      description: 'Cross-examination + position revision + consensus extraction',
      dependsOn: ['harvard_council'],
      outputs: ['deliberationResult'],
      configKey: 'tier >= premium',
      estimatedCostUsd: 0.10,
      estimatedDurationMs: 60000,
    },

    // ── QUALITY ──
    {
      id: 'citation_guard',
      name: 'Citation Guard',
      category: 'quality',
      status: 'always',
      description: 'Validate [SRC-N] format and index bounds',
      dependsOn: ['analyst'],
      outputs: ['guardResult'],
      estimatedCostUsd: 0,
      estimatedDurationMs: 1000,
    },
    {
      id: 'editor_render',
      name: 'Editorial Rendering',
      category: 'output',
      status: 'always',
      description: 'Render professional HTML (position-first or classic template)',
      dependsOn: ['citation_guard', 'casting'],
      outputs: ['html'],
      estimatedCostUsd: 0,
      estimatedDurationMs: 5000,
    },
    {
      id: 'citation_filter',
      name: 'Post-Generation Citation Filter',
      category: 'quality',
      status: 'always',
      description: 'Back-track implicit citations, flag/remove uncited factual claims',
      dependsOn: ['editor_render'],
      outputs: ['filteredHtml'],
      estimatedCostUsd: 0,
      estimatedDurationMs: 2000,
    },
    {
      id: 'citation_verifier_nli',
      name: 'NLI Citation Verifier',
      category: 'quality',
      status: 'always',
      description: 'Semantic + lexical + entity entailment verification (fast, free)',
      dependsOn: ['citation_filter'],
      outputs: ['verificationReport'],
      estimatedCostUsd: 0,
      estimatedDurationMs: 15000,
    },
    {
      id: 'fact_checker',
      name: 'Fact-Checker',
      category: 'quality',
      status: 'always',
      description: 'Numerical claim verification using full-text readings',
      dependsOn: ['citation_filter'],
      outputs: ['factCheckResult'],
      estimatedCostUsd: 0.05,
      estimatedDurationMs: 30000,
    },
    {
      id: 'critical_loop',
      name: 'Critical Loop V2',
      category: 'quality',
      status: 'always',
      description: 'Iterative peer review: methodology + adversarial + calibration → rewrite',
      dependsOn: ['citation_verifier_nli', 'fact_checker'],
      outputs: ['criticalLoopResult', 'revisedHtml'],
      configKey: 'maxIterations',
      estimatedCostUsd: 0.15,
      estimatedDurationMs: 120000,
    },
    {
      id: 'debate',
      name: 'Debate Agent',
      category: 'quality',
      status: 'conditional',
      description: 'Adversarial steel-man debate with position scoring',
      dependsOn: ['critical_loop'],
      outputs: ['debateResult'],
      configKey: 'tier >= premium',
      estimatedCostUsd: 0.08,
      estimatedDurationMs: 60000,
    },
    {
      id: 'meta_analysis',
      name: 'Meta-Analysis',
      category: 'quality',
      status: 'conditional',
      description: 'Random/fixed effects meta-analysis with heterogeneity assessment',
      dependsOn: ['critical_loop'],
      outputs: ['metaAnalysisResult'],
      configKey: 'tier >= premium',
      estimatedCostUsd: 0.05,
      estimatedDurationMs: 30000,
    },
    {
      id: 'devils_advocate',
      name: "Devil's Advocate",
      category: 'quality',
      status: 'conditional',
      description: 'Epistemic + strategic + institutional adversarial challenge',
      dependsOn: ['critical_loop'],
      outputs: ['advocateReport'],
      configKey: 'tier >= premium',
      estimatedCostUsd: 0.12,
      estimatedDurationMs: 60000,
    },
    {
      id: 'triangular_judge',
      name: 'Triangular Judge',
      category: 'quality',
      status: 'conditional',
      description: 'Arbitrate DA vs Critical Loop disputes with third-party LLM',
      dependsOn: ['devils_advocate'],
      outputs: ['triangularJudgment'],
      estimatedCostUsd: 0.02,
      estimatedDurationMs: 15000,
    },
    {
      id: 'publication_gate',
      name: 'Publication Gate',
      category: 'quality',
      status: 'always',
      description: 'Final quality gate: source depth, trust, citations, word count, DA score',
      dependsOn: ['triangular_judge', 'debate', 'meta_analysis'],
      outputs: ['publicationDecision'],
      estimatedCostUsd: 0,
      estimatedDurationMs: 1000,
    },

    // ── OUTPUT ──
    {
      id: 'publisher',
      name: 'Publisher',
      category: 'output',
      status: 'always',
      description: 'Save brief to database with full stats and lineage',
      dependsOn: ['publication_gate'],
      outputs: ['briefId'],
      estimatedCostUsd: 0,
      estimatedDurationMs: 5000,
    },
    {
      id: 'knowledge_graph',
      name: 'Knowledge Graph Extraction',
      category: 'output',
      status: 'conditional',
      description: 'Extract concepts and relations for the knowledge graph',
      dependsOn: ['publisher'],
      outputs: ['graphNodes', 'graphEdges'],
      configKey: 'tier >= premium',
      estimatedCostUsd: 0.03,
      estimatedDurationMs: 30000,
    },
  ],
  edges: [
    { from: 'context_primer', to: 'scout' },
    { from: 'scout', to: 'index' },
    { from: 'index', to: 'embed' },
    { from: 'embed', to: 'deduplicate' },
    { from: 'deduplicate', to: 'rank' },
    { from: 'rank', to: 'structured_refusal', condition: 'sourceCount < min' },
    { from: 'rank', to: 'topic_classification', condition: 'sourceCount >= min' },
    { from: 'rank', to: 'reader', condition: 'sourceCount >= min' },
    { from: 'topic_classification', to: 'casting', condition: 'editorialV2' },
    { from: 'reader', to: 'analyst' },
    { from: 'casting', to: 'analyst' },
    { from: 'analyst', to: 'gap_aware_append' },
    { from: 'analyst', to: 'structural_editor' },
    { from: 'analyst', to: 'harvard_council', condition: 'tier >= premium' },
    { from: 'harvard_council', to: 'phd_deliberation', condition: 'tier >= premium' },
    { from: 'analyst', to: 'citation_guard' },
    { from: 'citation_guard', to: 'editor_render' },
    { from: 'editor_render', to: 'citation_filter' },
    { from: 'citation_filter', to: 'citation_verifier_nli' },
    { from: 'citation_filter', to: 'fact_checker' },
    { from: 'citation_verifier_nli', to: 'critical_loop' },
    { from: 'fact_checker', to: 'critical_loop' },
    { from: 'critical_loop', to: 'debate', condition: 'tier >= premium' },
    { from: 'critical_loop', to: 'meta_analysis', condition: 'tier >= premium' },
    { from: 'critical_loop', to: 'devils_advocate', condition: 'tier >= premium' },
    { from: 'devils_advocate', to: 'triangular_judge', condition: 'DA vs CL dispute' },
    { from: 'triangular_judge', to: 'publication_gate' },
    { from: 'debate', to: 'publication_gate' },
    { from: 'meta_analysis', to: 'publication_gate' },
    { from: 'publication_gate', to: 'publisher', condition: 'decision == publish || revise' },
    { from: 'publisher', to: 'knowledge_graph', condition: 'tier >= premium' },
  ],
};

/**
 * Get a topological ordering of the pipeline steps.
 */
export function getTopologicalOrder(dag: PipelineDAG = PIPELINE_DAG): string[] {
  const visited = new Set<string>();
  const order: string[] = [];

  function visit(stepId: string) {
    if (visited.has(stepId)) return;
    visited.add(stepId);
    const step = dag.steps.find(s => s.id === stepId);
    if (!step) return;
    for (const dep of step.dependsOn) {
      visit(dep);
    }
    order.push(stepId);
  }

  for (const step of dag.steps) {
    visit(step.id);
  }

  return order;
}

/**
 * Get steps that should run for a given configuration.
 */
export function getActiveSteps(
  config: { editorialV2?: boolean; isStrategic?: boolean; tier?: string },
  dag: PipelineDAG = PIPELINE_DAG,
): PipelineStepDef[] {
  return dag.steps.filter(step => {
    switch (step.status) {
      case 'always': return true;
      case 'conditional':
        if (step.configKey === 'editorialV2') return config.editorialV2 === true;
        if (step.configKey === 'tier >= premium') return config.tier === 'premium' || config.tier === 'enterprise';
        if (step.configKey === 'isStrategic') return config.isStrategic === true;
        return true;
      case 'optional': return true; // Opt-in steps
      case 'strategic_only': return config.isStrategic === true;
      default: return true;
    }
  });
}
