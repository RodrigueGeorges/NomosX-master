/**
 * Foresight GraphRAG — entity graph from academic sources + scenarios
 * Clean-room alternative to MiroFish seed graph (no AGPL code)
 */

import { callLLM } from "@/lib/llm/unified-llm";
import { parseJson } from "./json-utils";

export interface SourceEvidence {
  id: string;
  title: string;
  excerpt: string;
  qualityScore: number;
  provider: string;
}

export interface ForesightNode {
  id: string;
  label: string;
  type: "entity" | "policy" | "event" | "stakeholder" | "claim";
  sourceIds: string[];
  weight: number;
}

export interface ForesightEdge {
  from: string;
  to: string;
  relation: string;
  strength: number;
}

export interface ForesightGraph {
  nodes: ForesightNode[];
  edges: ForesightEdge[];
  scenarioLinks: Record<string, string[]>;
  extractionMethod: "llm" | "heuristic";
}

export interface ScenarioSpec {
  name: string;
  description: string;
}

function tokenize(text: string): Set<string> {
  return new Set(
    text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 3)
  );
}

function overlap(a: string, b: string): number {
  const ta = tokenize(a);
  const tb = tokenize(b);
  if (!ta.size || !tb.size) return 0;
  let hit = 0;
  for (const w of ta) if (tb.has(w)) hit++;
  return hit / Math.max(ta.size, tb.size);
}

function heuristicGraph(
  question: string,
  scenarios: ScenarioSpec[],
  evidence: SourceEvidence[]
): ForesightGraph {
  const nodes: ForesightNode[] = [];
  const edges: ForesightEdge[] = [];
  const scenarioLinks: Record<string, string[]> = {};

  evidence.slice(0, 12).forEach((src, i) => {
    const id = `src-node-${i}`;
    nodes.push({
      id,
      label: src.title.slice(0, 80),
      type: "claim",
      sourceIds: [src.id],
      weight: src.qualityScore / 100,
    });
    edges.push({
      from: "q-root",
      to: id,
      relation: "evidence_for",
      strength: src.qualityScore / 100,
    });
  });

  nodes.unshift({
    id: "q-root",
    label: question.slice(0, 120),
    type: "event",
    sourceIds: [],
    weight: 1,
  });

  for (const sc of scenarios) {
    const linked = nodes
      .filter((n) => n.id !== "q-root")
      .map((n) => ({
        id: n.id,
        score: overlap(`${sc.name} ${sc.description}`, n.label) * n.weight,
      }))
      .filter((x) => x.score > 0.08)
      .sort((a, b) => b.score - a.score)
      .slice(0, 4)
      .map((x) => x.id);
    scenarioLinks[sc.name] = linked;
    for (const lid of linked) {
      edges.push({
        from: lid,
        to: `sc-${sc.name.slice(0, 24)}`,
        relation: "supports_scenario",
        strength: 0.5,
      });
    }
    if (!nodes.find((n) => n.id === `sc-${sc.name.slice(0, 24)}`)) {
      nodes.push({
        id: `sc-${sc.name.slice(0, 24)}`,
        label: sc.name,
        type: "policy",
        sourceIds: [],
        weight: 0.7,
      });
    }
  }

  return { nodes, edges, scenarioLinks, extractionMethod: "heuristic" };
}

interface LLMGraphPayload {
  nodes: Array<{ id: string; label: string; type: ForesightNode["type"]; sourceIndex?: number }>;
  edges: Array<{ from: string; to: string; relation: string; strength: number }>;
  scenarioLinks: Record<string, string[]>;
}

export async function buildForesightGraph(
  question: string,
  scenarios: ScenarioSpec[],
  evidence: SourceEvidence[],
  budget: { remaining: number }
): Promise<ForesightGraph> {
  if (!evidence.length || budget.remaining < 0.12) {
    return heuristicGraph(question, scenarios, evidence);
  }

  const srcBlock = evidence
    .slice(0, 10)
    .map((e, i) => `[${i}] ${e.title}: ${e.excerpt.slice(0, 180)}`)
    .join("\n");
  const scBlock = scenarios.map((s) => `- ${s.name}: ${s.description.slice(0, 120)}`).join("\n");

  try {
    const res = await callLLM({
      task: "extraction",
      temperature: 0.15,
      maxTokens: 1200,
      jsonMode: true,
      messages: [
        {
          role: "system",
          content:
            "Extract a knowledge graph for policy foresight. JSON: { nodes: [{id,label,type,sourceIndex?}], edges: [{from,to,relation,strength}], scenarioLinks: {scenarioName:[nodeIds]} }. Max 20 nodes, 30 edges. Ground in sources.",
        },
        {
          role: "user",
          content: `Question: ${question}\nScenarios:\n${scBlock}\nSources:\n${srcBlock}`,
        },
      ],
    });
    budget.remaining -= res.costUsd;

    const parsed = parseJson<LLMGraphPayload>(res.content);
    if (!parsed || !parsed.nodes?.length) return heuristicGraph(question, scenarios, evidence);

    const nodes: ForesightNode[] = parsed.nodes.map((n) => ({
      id: n.id,
      label: n.label,
      type: n.type ?? "entity",
      sourceIds:
        typeof n.sourceIndex === "number" && evidence[n.sourceIndex]
          ? [evidence[n.sourceIndex].id]
          : [],
      weight: 0.6,
    }));

    for (const n of nodes) {
      if (n.sourceIds.length) {
        const src = evidence.find((e) => e.id === n.sourceIds[0]);
        if (src) n.weight = src.qualityScore / 100;
      }
    }

    return {
      nodes,
      edges: parsed.edges ?? [],
      scenarioLinks: parsed.scenarioLinks ?? {},
      extractionMethod: "llm",
    };
  } catch {
    return heuristicGraph(question, scenarios, evidence);
  }
}

/** Score scenario momentum boost from graph connectivity */
export function graphScenarioBoost(
  graph: ForesightGraph,
  scenarioName: string
): number {
  const linked = graph.scenarioLinks[scenarioName] ?? [];
  if (!linked.length) return 0;
  let boost = 0;
  for (const nodeId of linked) {
    const node = graph.nodes.find((n) => n.id === nodeId);
    if (node) boost += node.weight;
    for (const edge of graph.edges) {
      if (edge.to === nodeId || edge.from === nodeId) boost += edge.strength * 0.15;
    }
  }
  return Math.min(0.35, boost / Math.max(linked.length, 1));
}
