/**
 * SCOUT BLOCK — STEP 1: durable-resume seedIds → deep planner (DAG scout +
 * mutable expansion + dynamic replan) → flat scout with speculative parallel
 * reformulations → witness observe → orchestrator assess → RE_SCOUT loop
 * with adaptive providers + stuck-loop detection.
 *
 * Returns `allSourceIds` + `planNodesForAudit` (consumed by the post-render
 * process audit). `orchState` and `stats` are mutated in place.
 */

import { callLLMWithCascade, DEFAULT_C3PO_CONFIG } from '../../llm/unified-llm';
import { generateStormPerspectives } from '../research-patterns';
import { generateExpandedTerms } from '../orchestrator';
import { buildObservation, type WitnessContext } from '../witness/integration';
import { durableResume } from '../durable-execution';
import { withExecutionScope } from '../../worker/execution-scope';
import type { PipelineStep } from '../pipeline-progress';

async function generateQueryReformulations(query: string): Promise<string[]> {
  try {
    const { parseJson } = await import('../json-utils');
    // K15: C3PO cascade — try cheap model first, escalate if confidence is low
    const response = await callLLMWithCascade({
      messages: [{
        role: "user",
        content: `Reformulate this research query into 2 alternative phrasings that would find different but relevant academic sources. Use different terminology, synonyms, or framing — but keep the same research intent.

Original query: "${query}"

Return JSON: { "reformulations": ["alternative query 1", "alternative query 2"] }`
      }],
      temperature: 0.3,
      jsonMode: true,
      maxTokens: 500,
      enableCache: true,
      task: 'query_enhancement',
    }, {
      ...DEFAULT_C3PO_CONFIG,
      budgetCapUsd: 0.02, // Small budget for query reformulation
    });
    const result = parseJson<{ reformulations?: string[] }>(response.content);
    if (result?.reformulations && Array.isArray(result.reformulations)) {
      return result.reformulations.filter(q => typeof q === 'string' && q.length > 10).slice(0, 1);
    }
    return [];
  } catch {
    return [];
  }
}

/**
 * Generate reformulations using STORM perspectives.
 * Each perspective produces 2-3 questions, giving broader coverage than simple synonyms.
 */
async function generateStormReformulations(query: string, label: string): Promise<string[]> {
  try {
    const { perspectives } = await generateStormPerspectives(query);
    const questions = perspectives.flatMap(p => p.questions).filter(q => typeof q === 'string' && q.length > 10);
    console.log(`${label} STORM: generated ${questions.length} perspective-driven reformulations`);
    return questions.slice(0, 5);
  } catch (err) {
    console.warn(`${label} STORM reformulations failed, falling back:`, err);
    return generateQueryReformulations(query).catch(() => []);
  }
}

export interface ScoutBlockDeps {
  query: string;
  providers: any[];
  perProvider: number;
  isStrategic: boolean;
  useStorm: boolean;
  seedSourceIds: string[] | undefined;
  minSeedSourcesToSkipScout: number | undefined;
  domain: string | undefined;
  durableKey: string | null;
  scout: (query: string, providers: any, perProvider?: number) => Promise<any>;
  stats: Record<string, any>;
  label: string;
  pipelineRunId: string;
  pipelineStart: number;
  emitProgress: (runId: string, step: PipelineStep, status: 'completed' | 'started' | 'failed' | 'skipped', message: string, metadata?: Record<string, any>) => void;
  isBudgetConstrained: () => boolean;
  orchState: Record<string, any>;
  assessAfterScout: (state: any) => any;
  recordDecision: (state: any, decision: any) => void;
  recordTransformation: (lineage: any, step: any, input: number, output: number, ms: number, meta: any) => void;
  lineage: any;
  witnessCtx: WitnessContext | null;
  ctx: {
    setScoutSources: (ids: string[]) => void;
    recordAgentTiming: (agent: string, ms: number) => void;
    addFinding: (agent: string, type: 'gap' | 'warning' | 'insight' | 'recommendation', content: string, metadata?: Record<string, unknown>) => void;
    getSummary: () => unknown;
  };
}

export interface ScoutBlockResult {
  allSourceIds: string[];
  planNodesForAudit: Array<{ subQuestion: string; status: string; sourceCount?: number }>;
  /** True when a durable scout checkpoint was restored into seedIds. */
  scoutCkptRestored: boolean;
}

export async function runScoutBlock(deps: ScoutBlockDeps): Promise<ScoutBlockResult> {
  const {
    query, providers, perProvider, isStrategic, useStorm, domain, durableKey,
    scout, stats, label, pipelineRunId, pipelineStart, emitProgress,
    isBudgetConstrained, orchState, assessAfterScout, recordDecision,
    recordTransformation, lineage, witnessCtx, ctx,
  } = deps;

  // STEP 1: SCOUT (with Orchestrator RE_SCOUT loop)
  emitProgress(pipelineRunId, "SCOUT", "started", `Searching ${providers.length} providers...`);
  let allSourceIds: string[] = [];
  // Function-scope copy of deep-planner nodes — `planResult` lives inside the
  // else-block below, but the post-render process audit needs the nodes.
  let planNodesForAudit: Array<{ subQuestion: string; status: string; sourceCount?: number }> = [];
  const seedIds = [...new Set((deps.seedSourceIds ?? []).filter(Boolean))];
  // DURABLE RESUME: a crashed/timed-out run's scout checkpoint re-enters as
  // seedIds — the existing skipScout path does the bookkeeping uniformly.
  const scoutCkpt = durableKey
    ? await durableResume<{ allSourceIds: string[] }>(durableKey, 'scout')
    : null;
  if (scoutCkpt?.allSourceIds?.length) {
    seedIds.push(...scoutCkpt.allSourceIds.filter(id => !seedIds.includes(id)));
    console.log(`${label} DURABLE: scout checkpoint restored — ${scoutCkpt.allSourceIds.length} source ids (skipScout path)`);
  }
  const minSeedSkip = deps.minSeedSourcesToSkipScout ?? 8;
  const skipScout = seedIds.length >= minSeedSkip;

  if (skipScout) {
    console.log(`${label} SCOUT: skipped — using ${seedIds.length} seedSourceIds`);
    allSourceIds = seedIds;
    recordTransformation(lineage, "scout", seedIds.length, seedIds.length, 0, {
      sourceIds: seedIds,
      filters: { skipped: true, reason: "seedSourceIds" },
    });
    stats.scout = { found: seedIds.length, upserted: 0, sourceIds: seedIds, skipped: true };
    orchState.sourcesFound = seedIds.length;
    orchState.providerDiversity = new Set(seedIds.map((id) => id.split(":")[0])).size;
    // Seeds from a durable checkpoint carry no quality score — assessing
    // against avgQuality=0 fabricates a RE_SCOUT decision on every resume.
    // Quality is judged downstream on read sources, not on seed ids.
    const seedScoutDecision = {
      action: "PROCEED" as const,
      reason: `Seed/checkpoint sources restored (${seedIds.length} ids) — scout quality assessment deferred to reader`,
    };
    recordDecision(orchState, seedScoutDecision);
    stats.orchestrator = { decisions: [seedScoutDecision] };
    emitProgress(pipelineRunId, "SCOUT", "completed", `Seed sources: ${seedIds.length} (scout skipped)`);
  } else {
  console.log(`${label} SCOUT: query="${query}" (${providers.length} providers, ${perProvider}/provider)`);
  const scoutStart = Date.now();

  // ── LOT 2.1/2.2: DEEP PLANNER — decompose question into DAG, scout each node ──
  let planResult: { plan: any; costUsd: number; error?: string } | null = null;
  try {
    const { deepPlan, topologicalSort, getAncestorSourceIds } = await import('../deep-planner');
    planResult = await deepPlan(query, { domain: domain || 'general', isStrategic });
    if (planResult.error) {
      console.log(`${label} DEEP PLANNER: ${planResult.error}, falling back to flat scout`);
    }
    if (planResult.plan.nodes.length > 1) {
      console.log(`${label} DEEP PLANNER: ${planResult.plan.nodes.length} sub-questions planned`);
      // PLAN PREVIEW — expose the research plan to the UI before execution
      // (Gemini collaborative-planning pattern). Consumers of the progress
      // stream can render the intended investigation structure.
      emitProgress(pipelineRunId, "SCOUT", "started",
        `Research plan: ${planResult.plan.nodes.length} investigation branches`, {
        planPreview: planResult.plan.nodes.map((n: any) => ({
          id: n.id,
          subQuestion: n.subQuestion,
          producers: n.producers,
          dependsOn: n.parentIds,
        })),
      });
      const sortedNodes = topologicalSort(planResult.plan.nodes);
      const perNodeProvider = isStrategic ? Math.max(perProvider, 80) : perProvider;

      // Known providers set — used to filter Deep Planner LLM output
      const KNOWN_PROVIDERS = new Set([
        "openalex", "crossref", "semanticscholar", "arxiv", "hal", "pubmed", "base",
        "core", "europepmc", "doaj", "ssrn", "repec", "nber", "who-gho",
        "imf", "worldbank", "oecd", "bis", "ecb", "eurostat", "fred", "eib",
        "nist", "cisa", "un", "undp", "unctad", "iaea", "irena", "cea", "iea",
        "bruegel", "nato", "eeas", "linkup", "tavily", "exa", "apitube",
        "gdelt-news", "newsapi", "eventregistry", "springer", "osti", "datacite",
        "google-books", "dimensions", "lens", "zenodo", "openaire",
        "brookings", "rand", "cfr", "carnegie", "csis", "iiss", "chatham-house",
        "swp", "sipri", "iai", "ecfr", "dgap", "rsis", "cis",
        // V3.1: Global omniscience providers
        "consolidated-institutions", "global-intelligence", "global-orgs", "global-think-tanks", "global-science",
      ]);

      // Sub-question scouts must be LEAN — inheriting the full provider set
      // turned each DAG node into a 60-provider × 4-query fan-out (~2min each),
      // blowing the pipeline timeout. A compact core set is enough for a
      // targeted sub-question; breadth lives in the root scout. Hoisted so the
      // expansion and replan paths share the same constraint.
      const NODE_CORE_PROVIDERS = ["openalex", "crossref", "europepmc", "linkup", "tavily", "exa"] as const;

      for (const node of sortedNodes) {
        node.status = 'scouting';
        // Use node-specific producers if available, otherwise fall back to global providers
        // Filter to known providers only — LLM may generate invalid names (e.g. 'area_studies')
        const validNodeProducers = node.producers.filter(p => KNOWN_PROVIDERS.has(p));
        const nodeProviders = (validNodeProducers.length >= 3
          ? Array.from(new Set([...validNodeProducers.slice(0, 8), ...NODE_CORE_PROVIDERS.slice(0, 4), 'no-routing']))
          : Array.from(new Set([...validNodeProducers, ...NODE_CORE_PROVIDERS, 'no-routing']))) as any;
        // Per-node execution scope: fresh budget ledger so one greedy node
        // cannot starve its siblings — the job-root ledger still bounds the
        // total across all nodes.
        const nodeResult = await withExecutionScope(`dp-node:${node.id}`, () =>
          scout(node.subQuestion, nodeProviders, perNodeProvider));
        const nodeSourceIds = Array.isArray(nodeResult) ? nodeResult.map(s => s.id) : (nodeResult.sourceIds || []);
        node.sourceIds = nodeSourceIds;
        node.sourceCount = nodeSourceIds.length;
        node.status = nodeSourceIds.length > 0 ? 'done' : 'failed';
        allSourceIds.push(...nodeSourceIds);
        console.log(`${label} DEEP PLANNER: node ${node.id} "${node.subQuestion.slice(0, 60)}" → ${nodeSourceIds.length} sources`);

        // LOT 2.3: DAG mutable — if < 5 sources, try expanded search with parent context
        if (nodeSourceIds.length < 5) {
          const ancestorIds = getAncestorSourceIds(node.id, planResult.plan.nodes);
          if (ancestorIds.length > 0) {
            // Inject parent context as additional search terms
            const parentNodes = planResult.plan.nodes.filter((n: any) => node.parentIds.includes(n.id));
            const contextTerms = parentNodes.map((n: any) => n.subQuestion.split(' ').slice(0, 3).join(' ')).join(' ');
            if (contextTerms) {
              const expandedQuery = `${node.subQuestion} ${contextTerms}`;
              // Lean set — expansion is a targeted retry, not a second full
              // sweep. Passing the full `providers` list burned the shared
              // root budget (139 providers × 12 queries observed live).
              const expandResult = await withExecutionScope(`dp-expand:${node.id}`, () =>
                scout(expandedQuery, nodeProviders, 25));
              const expandIds = Array.isArray(expandResult) ? expandResult.map(s => s.id) : (expandResult.sourceIds || []);
              allSourceIds.push(...expandIds);
              node.sourceIds = [...new Set([...(node.sourceIds || []), ...expandIds])];
              node.sourceCount = node.sourceIds.length;
              node.status = 'expanded';
              console.log(`${label} DEEP PLANNER: node ${node.id} expanded → +${expandIds.length} sources`);
            }
          }
        }
      }
      allSourceIds = [...new Set(allSourceIds)];

      // ── DYNAMIC REPLANNING: if nodes failed or returned thin, generate
      // follow-up sub-questions from execution findings and scout them. ──
      const thinOrFailed = planResult.plan.nodes.filter(
        (n: any) => n.status === 'failed' || (n.sourceCount ?? 0) < 5
      );
      if (thinOrFailed.length > 0 && !isBudgetConstrained()) {
        try {
          const { replanFromFindings } = await import('../deep-planner');
          const replan = await replanFromFindings(query, planResult.plan.nodes, 3);
          if (replan.nodes.length > 0) {
            console.log(`${label} DEEP PLANNER REPLAN: ${replan.nodes.length} follow-up nodes for ${thinOrFailed.length} thin/failed`);
            for (const node of replan.nodes) {
              node.status = 'scouting';
              const validP = node.producers.filter(p => KNOWN_PROVIDERS.has(p));
              const nodeProviders = validP.length >= 3
                ? Array.from(new Set([...validP.slice(0, 8), ...providers.slice(0, 4), 'no-routing'])) as any
                : Array.from(new Set([...validP, ...NODE_CORE_PROVIDERS, 'no-routing'])) as any;
              const res = await withExecutionScope(`dp-replan:${node.id}`, () =>
                scout(node.subQuestion, nodeProviders, isStrategic ? 30 : 25));
              const ids = Array.isArray(res) ? res.map(s => s.id) : (res.sourceIds || []);
              node.sourceIds = ids;
              node.sourceCount = ids.length;
              node.status = ids.length > 0 ? 'expanded' : 'failed';
              allSourceIds.push(...ids);
              planResult.plan.nodes.push(node);
              console.log(`${label} DEEP PLANNER REPLAN: ${node.id} "${node.subQuestion.slice(0, 60)}" → ${ids.length} sources`);
            }
            allSourceIds = [...new Set(allSourceIds)];
          }
        } catch (err) {
          console.warn(`${label} DEEP PLANNER REPLAN: failed (non-blocking):`, err);
        }
      }

      stats.deepPlanner = { nodes: planResult.plan.nodes.length, costUsd: planResult.costUsd };
      planNodesForAudit = planResult.plan.nodes.map((n: any) => ({
        subQuestion: n.subQuestion, status: n.status, sourceCount: n.sourceCount,
      }));
    } else {
      // Single node — fall through to normal scout
      planResult = null;
    }
  } catch (err) {
    console.warn(`${label} DEEP PLANNER: failed (non-blocking), falling back to flat scout:`, err);
  }

  // If DeepPlanner didn't produce results, run the original flat scout
  if (allSourceIds.length === 0) {
  // ── SPECULATIVE PARALLEL SCOUT (2026 pattern) ──
  // Launch original query + 2 LLM reformulations in parallel to broaden coverage.
  // This replaces the sequential RE_SCOUT loop for the initial pass.
  const scoutPerProvider = isStrategic ? Math.max(perProvider, 75) : perProvider;

  // Generate reformulations in parallel with the original query scout
  const reformulationPromise = isBudgetConstrained()
    ? Promise.resolve([] as string[])
    : useStorm
      ? generateStormReformulations(query, label)
      : generateQueryReformulations(query).catch(() => [] as string[]);

  const [scoutResult, reformulations] = await Promise.all([
    scout(query, providers, scoutPerProvider),
    reformulationPromise,
  ]);

  // Handle both cached array and fresh result object
  const sourceIds = Array.isArray(scoutResult) ? scoutResult.map(s => s.id) : (scoutResult.sourceIds || []);
  const found = Array.isArray(scoutResult) ? scoutResult.length : (scoutResult.found || 0);

  allSourceIds = [...sourceIds];

  // Launch speculative parallel scouts for each reformulation
  if (reformulations.length > 0) {
    console.log(`${label} SPECULATIVE SCOUT: launching ${reformulations.length} parallel reformulations`);
    const speculativeResults = await Promise.allSettled(
      reformulations.map(rq => scout(rq, providers.slice(0, Math.min(providers.length, 10)) as any, Math.floor(scoutPerProvider * 0.6)))
    );
    for (let i = 0; i < speculativeResults.length; i++) {
      const r = speculativeResults[i];
      if (r.status === "fulfilled") {
        const specIds = Array.isArray(r.value) ? r.value.map(s => s.id) : (r.value.sourceIds || []);
        const specFound = Array.isArray(r.value) ? r.value.length : (r.value.found || 0);
        allSourceIds.push(...specIds);
        console.log(`${label} SPECULATIVE SCOUT: "${reformulations[i].slice(0, 60)}" → +${specFound} sources`);
      }
    }
    allSourceIds = [...new Set(allSourceIds)];
    ctx.addFinding('SPECULATIVE_SCOUT', 'insight', `Parallel reformulations: ${reformulations.length} queries, ${allSourceIds.length} total sources after merge`);
  }
  if (seedIds.length) {
    allSourceIds = [...new Set([...allSourceIds, ...seedIds])];
    console.log(`${label} SCOUT: merged ${seedIds.length} seed sources → ${allSourceIds.length} total`);
  }
  ctx.setScoutSources(allSourceIds);
  ctx.recordAgentTiming('SCOUT', Date.now() - pipelineStart);

  recordTransformation(lineage, "scout", 1, sourceIds.length, Date.now() - scoutStart, {
    sourceIds,
    filters: { providers },
  });
  stats.scout = scoutResult;

  // ── WITNESS: Observe SCOUT step ──
  if (witnessCtx) {
    try {
      await witnessCtx.observe(buildObservation('scout', {
        success: true,
        costUsd: 0.02,
        durationMs: Date.now() - pipelineStart,
        outputSummary: `Found ${found} sources from ${allSourceIds.length} IDs`,
        metrics: { sourcesFound: found, providerDiversity: new Set(allSourceIds.map(id => id.split(":")[0])).size },
        errors: [],
      }, pipelineStart));
    } catch (err) {
      console.warn(`${label} WITNESS: scout observation failed:`, err);
    }
  }

  // Orchestrator checkpoint: assess source quality
  orchState.sourcesFound = found;
  orchState.providerDiversity = new Set(allSourceIds.map(id => id.split(":")[0])).size;
  const scoutDecision = assessAfterScout(orchState);
  recordDecision(orchState, scoutDecision);
  stats.orchestrator = { decisions: [scoutDecision] };

  // RE_SCOUT loop — all formats (autonomous source collection)
  if (scoutDecision.action === "RE_SCOUT" && orchState.iteration < orchState.maxIterations) {
    console.log(`${label} ORCHESTRATOR: RE_SCOUT — ${scoutDecision.reason}`);
    // Stuck-loop detection (2026 best practice): track unique sources before re-search
    const preReScoutIds = new Set(allSourceIds);
    try {
      // Adaptive provider adjustment: analyze what was found and add missing providers
      const foundProviderPrefixes = new Set(allSourceIds.map(id => id.split(":")[0]));
      const newsProvidersList = ["gdelt-news", "newsapi", "gnews", "mediastack", "thenewsapi", "eventregistry", "apitube", "tavily"];
      const academicProvidersList = ["openalex", "crossref", "semanticscholar", "arxiv", "hal", "pubmed", "ssrn", "nber", "repec", "europepmc", "base", "doaj", "springer", "osti", "datacite", "lens", "dimensions", "google-books", "plos", "worldbank-docs", "cordis", "ipcc", "internet-archive", "hathitrust", "jstor", "unesco", "club-of-rome", "millennium-project"];
      const hasNews = newsProvidersList.some(p => foundProviderPrefixes.has(p));
      const hasAcademic = academicProvidersList.some(p => foundProviderPrefixes.has(p));

      const adaptiveProviders = [...providers];
      // If no news sources found, add news providers for real-time coverage
      if (!hasNews) {
        adaptiveProviders.push(...["gdelt-news", "newsapi"] as any);
        console.log(`${label} RE_SCOUT: no news sources found — adding gdelt-news, newsapi`);
      }
      // If no academic sources found, add core academic providers + foundational sources
      if (!hasAcademic) {
        adaptiveProviders.push(...["openalex", "crossref", "semanticscholar", "arxiv", "europepmc", "base", "doaj", "ipcc", "internet-archive", "hathitrust", "jstor", "unesco", "opencitations"] as any);
        console.log(`${label} RE_SCOUT: no academic sources found — adding core academic + foundational sources (IPCC, Internet Archive, HathiTrust, JSTOR, UNESCO)`);
      }
      // If total sources are critically low, add web search as fallback
      if (allSourceIds.length < 5) {
        adaptiveProviders.push(...["linkup", "tavily", "exa", "gdelt-news", "newsapi", "apitube"] as any);
        console.log(`${label} RE_SCOUT: only ${allSourceIds.length} sources — adding linkup, tavily, exa, gdelt-news, newsapi, apitube as web search fallback`);
      }
      const uniqueAdaptiveProviders = Array.from(new Set(adaptiveProviders)) as any;

      const expanded = await generateExpandedTerms(query, found, uniqueAdaptiveProviders);
      stats.orchestrator.expandedTerms = expanded.terms;
      const maxTerms = isStrategic ? 7 : 5;
      const extraResults = await Promise.allSettled(
        expanded.terms.slice(0, maxTerms).map(term => scout(term, uniqueAdaptiveProviders, isStrategic ? 30 : 25))
      );
      for (let i = 0; i < extraResults.length; i++) {
        const r = extraResults[i];
        if (r.status === "fulfilled") {
          const extraSourceIds = Array.isArray(r.value) ? r.value.map(s => s.id) : (r.value.sourceIds || []);
          const extraFound = Array.isArray(r.value) ? r.value.length : (r.value.found || 0);
          allSourceIds.push(...extraSourceIds);
          console.log(`${label} RE_SCOUT: "${expanded.terms[i]}" → +${extraFound} sources`);
        }
      }
      allSourceIds = [...new Set(allSourceIds)];
      orchState.sourcesFound = allSourceIds.length;

      // Stuck-loop detection (2026 best practice): if >70% of sources already existed, topic is niche — stop re-searching
      const newUniqueIds = allSourceIds.filter(id => !preReScoutIds.has(id));
      const overlapRatio = allSourceIds.length > 0 ? (allSourceIds.length - newUniqueIds.length) / allSourceIds.length : 0;
      if (overlapRatio > 0.70) {
        console.log(`${label} RE_SCOUT: stuck-loop detected — ${Math.round(overlapRatio * 100)}% overlap with pre-existing sources, only ${newUniqueIds.length} new. Topic is likely niche — stopping re-search.`);
      } else {
        console.log(`${label} RE_SCOUT: +${newUniqueIds.length} new unique sources (${Math.round((1 - overlapRatio) * 100)}% novelty)`);
      }
    } catch (err) {
      console.warn(`${label} RE_SCOUT: failed (non-blocking):`, err);
    }
  }

  // ── STEP 2: INDEX ──
  emitProgress(pipelineRunId, "SCOUT", "completed", `Found ${allSourceIds.length} sources`, { blackboard: ctx.getSummary() });
  } // end if (flat scout fallback)
  } // end scout else branch

  return { allSourceIds, planNodesForAudit, scoutCkptRestored: !!scoutCkpt };
}
