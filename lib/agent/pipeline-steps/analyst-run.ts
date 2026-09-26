/**
 * ANALYST EXECUTION — MoA (opt-in) → durable multipass → test-time scaling
 * (second candidate on strategic + budget headroom, best citation coverage
 * wins) → stats.analyst.
 *
 * `analysis` is returned — a successful opt-in MoA result is adopted, not
 * overwritten by the multipass fallback.
 */

import { runMixtureOfAgents } from '../moa/mixture-of-agents';
import type { PipelineStep } from '../pipeline-progress';

export interface AnalystRunDeps {
  query: string;
  topSources: any[];
  slimReadings: any[];
  fullContextBlock: string | undefined;
  detectedDomain: string;
  isStrategic: boolean;
  useMixtureOfAgents: boolean;
  runningCostUsd: number;
  maxBudgetUsd: number | undefined;
  stats: Record<string, any>;
  label: string;
  pipelineRunId: string;
  pipelineStart: number;
  emitProgress: (runId: string, step: PipelineStep, status: 'completed' | 'started' | 'failed' | 'skipped', message: string, metadata?: Record<string, any>) => void;
  addCost: (usd: number | undefined, step: string) => void;
  durable: <T>(name: string, fn: () => Promise<T>, costUsd?: number) => Promise<T>;
  analystMultipass: (query: string, topSources: any[], readings: any[], opts: any) => Promise<any>;
  bumpAnalysisArtifact: () => void;
  ctx: {
    setAnalystOutput: (analysis: any) => void;
    recordAgentTiming: (agent: string, ms: number) => void;
  };
}

export interface AnalystRunResult {
  analysis: any;
  analystCostUsd: number | undefined;
}

export async function runAnalystExecution(deps: AnalystRunDeps): Promise<AnalystRunResult> {
  const {
    query, topSources, slimReadings, fullContextBlock, detectedDomain,
    isStrategic, useMixtureOfAgents, runningCostUsd, maxBudgetUsd,
    stats, label, pipelineRunId, pipelineStart, emitProgress, addCost,
    durable, analystMultipass, bumpAnalysisArtifact, ctx,
  } = deps;
  let analysis: any;

  // ── ANALYST: MoA (opt-in) vs classic multipass ──
  // MoA mode: multiple specialist analysts collaborate
  // Classic mode: the analyst receives all sources and synthesizes in 3 passes
  if (useMixtureOfAgents) {
    console.log(`${label} ANALYST: Mixture of Agents mode — multiple specialists collaborating`);
    emitProgress(pipelineRunId, "ANALYST", "started", `Mixture of Agents analysis (${isStrategic ? "strategic" : "brief"})...`);
    try {
      // S16-01: Graph-of-Agents (ICLR 2026) — select top-3 agents by capability match
      // instead of using all N agents. Reduces cost while improving quality.
      let selectedAgentIds: string[] | undefined;
      try {
        const { selectAgents, DEFAULT_GOA_CONFIG } = await import('../graph-of-agents');
        const availableAgents = [
          { id: 'evidence', role: 'evidence specialist', capabilities: ['data analysis', 'source evaluation', 'fact checking'], model: 'deepseek' },
          { id: 'synthesis', role: 'synthesis specialist', capabilities: ['synthesis', 'integration', 'narrative'], model: 'deepseek' },
          { id: 'skeptic', role: 'skeptic', capabilities: ['criticism', 'risk analysis', 'counter-arguments'], model: 'glm' },
          { id: 'uncertainty', role: 'uncertainty specialist', capabilities: ['uncertainty quantification', 'confidence estimation'], model: 'kimi' },
          { id: 'methodologist', role: 'methodologist', capabilities: ['methodology', 'research design', 'statistics'], model: 'deepseek' },
          { id: 'domain_expert', role: 'domain expert', capabilities: ['domain knowledge', 'expertise', 'context'], model: 'glm' },
        ];
        const selected = selectAgents(query, availableAgents, DEFAULT_GOA_CONFIG);
        selectedAgentIds = selected.map(a => a.id);
        console.log(`${label} GoA: selected ${selectedAgentIds.length} agents: ${selectedAgentIds.join(', ')}`);
      } catch (e) { /* non-blocking — use all agents */ }

      const moaResult = await runMixtureOfAgents(
        query,
        topSources.map((s: any) => ({ id: s.id, title: s.title, abstract: s.abstract, fullText: s.fullText })),
        fullContextBlock || '',
        { isStrategic, ...(selectedAgentIds ? { agents: selectedAgentIds as any } : {}) },
      );
      console.log(`${label} ANALYST: MoA complete — ${moaResult.specialistAnalyses.length} specialists, ${moaResult.consensus.length} consensus points, ${moaResult.controversies.length} controversies, confidence=${moaResult.overallConfidence.toFixed(2)}`);
      emitProgress(pipelineRunId, "ANALYST", "completed", `MoA: ${moaResult.specialistAnalyses.length} specialists, confidence ${moaResult.overallConfidence.toFixed(2)}`);

      // Use the aggregated analysis as the final analysis
      analysis = {
        title: query,
        summary: moaResult.aggregatedAnalysis.slice(0, 500),
        consensus: moaResult.consensus.join('\n\n'),
        disagreements: moaResult.controversies.map(c => `${c.topic}: ${c.resolution}`).join('\n\n'),
        debate: {
          pro: moaResult.controversies.map(c => c.positions.find(p => p.agent)?.position).filter(Boolean).join('\n'),
          con: moaResult.controversies.map(c => c.positions.slice(1).map(p => p.position).join('\n')).filter(Boolean).join('\n'),
          synthesis: moaResult.controversies.map(c => c.resolution).join('\n\n'),
        },
        evidence: moaResult.specialistAnalyses.find(a => a.agentId === 'evidence')?.analysis || '',
        implications: moaResult.specialistAnalyses.find(a => a.agentId === 'synthesis')?.analysis || '',
        risks: moaResult.specialistAnalyses.find(a => a.agentId === 'skeptic')?.analysis || '',
        open_questions: moaResult.controversies.map(c => c.topic).join('\n'),
        what_changes_mind: moaResult.specialistAnalyses.find(a => a.agentId === 'uncertainty')?.keyInsights.join('\n') || '',
        _meta: {
          moaResult,
          mode: 'mixture_of_agents',
          agentCount: moaResult.specialistAnalyses.length,
          overallConfidence: moaResult.overallConfidence,
          totalCostUsd: moaResult.totalCostUsd,
        },
      };
      bumpAnalysisArtifact();
      addCost(moaResult.totalCostUsd, 'ANALYST MOA');
      (stats as any).moa = {
        agentCount: moaResult.specialistAnalyses.length,
        consensus: moaResult.consensus.length,
        controversies: moaResult.controversies.length,
        uniqueInsights: moaResult.uniqueInsights.length,
        overallConfidence: moaResult.overallConfidence,
      };
    } catch (err: any) {
      console.warn(`${label} ANALYST: MoA failed, falling back to classic: ${err.message}`);
      emitProgress(pipelineRunId, "ANALYST", "started", `MoA failed — falling back to classic multipass...`);
      // Fall through to classic multipass below
    }
  }

  if (!analysis) {
    analysis = await durable('analyst', () => analystMultipass(query, topSources, slimReadings, {
      contextBlock: fullContextBlock,
      domain: detectedDomain,
      depth: isStrategic ? "strategic" : "brief",
    }));
    bumpAnalysisArtifact();
  }

  // S14-G: Test-Time Scaling (ICLR 2026 — Zeng et al.)
  // For strategic queries with sufficient budget, generate a second candidate
  // and pick the one with better citation coverage. This is a simplified version
  // of the asymmetric verification pattern: generate N candidates (cheap, parallel),
  // verify deterministically (citation count), select the best.
  if (isStrategic && runningCostUsd < (maxBudgetUsd ?? 5) * 0.4) {
    try {
      console.log(`${label} TEST-TIME SCALING: generating second candidate for comparison...`);
      const candidate2 = await analystMultipass(query, topSources, slimReadings, {
        contextBlock: fullContextBlock,
        domain: detectedDomain,
        depth: "strategic",
      });
      const citeCount1 = Array.from((analysis as any).html?.matchAll(/\[SRC-\d+\]/g) ?? []).length;
      const citeCount2 = Array.from((candidate2 as any).html?.matchAll(/\[SRC-\d+\]/g) ?? []).length;
      const len1 = (analysis as any).html?.length ?? 0;
      const len2 = (candidate2 as any).html?.length ?? 0;
      // Pick the better candidate: prefer more citations, then longer analysis
      if (citeCount2 > citeCount1 || (citeCount2 === citeCount1 && len2 > len1 * 1.1)) {
        console.log(`${label} TEST-TIME SCALING: candidate 2 selected (cites: ${citeCount2} vs ${citeCount1}, len: ${len2} vs ${len1})`);
        analysis = candidate2;
        bumpAnalysisArtifact();
      } else {
        console.log(`${label} TEST-TIME SCALING: candidate 1 kept (cites: ${citeCount1} vs ${citeCount2}, len: ${len1} vs ${len2})`);
      }
      stats.testTimeScaling = { activated: true, candidatesCompared: 2, winnerCitations: Math.max(citeCount1, citeCount2) };
    } catch (ttsErr) {
      console.warn(`${label} TEST-TIME SCALING: failed (non-blocking):`, ttsErr instanceof Error ? ttsErr.message : String(ttsErr));
    }
  }
  const analystCostUsd = typeof analysis._meta?.totalCostUsd === "number" ? analysis._meta.totalCostUsd : undefined;
  stats.analyst = {
    hasDebate: !!analysis.causalChain?.length,
    passes: 3,
    costUsd: analystCostUsd,
    depth: isStrategic ? "strategic" : "brief",
  };
  addCost(analystCostUsd, `ANALYST MULTIPASS (${isStrategic ? 'strategic' : 'brief'})`);
  ctx.setAnalystOutput(analysis);
  ctx.recordAgentTiming('ANALYST', Date.now() - pipelineStart);

  return { analysis, analystCostUsd };
}
