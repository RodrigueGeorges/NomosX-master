import { prisma } from "@/lib/db";

export interface GraphNode {
  id: string;
  name: string;
  type: string;
  description: string;
  confidence: number;
  occurrenceCount: number;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: string;
  strength: number;
}

export interface KnowledgeGraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export async function fetchKnowledgeGraph(limit: number = 50): Promise<KnowledgeGraphData> {
  const concepts = await prisma.conceptNode.findMany({
    take: limit,
    orderBy: { occurrenceCount: "desc" },
    include: {
      relationsFrom: { select: { id: true, toConceptId: true, type: true, strength: true } },
      relationsTo: { select: { id: true, fromConceptId: true, type: true, strength: true } },
    },
  });

  const nodeIds = new Set(concepts.map((c) => c.id));
  const nodes: GraphNode[] = concepts.map((c) => ({
    id: c.id,
    name: c.name,
    type: c.type,
    description: c.description,
    confidence: c.confidence,
    occurrenceCount: c.occurrenceCount,
  }));

  const edgeSet = new Map<string, GraphEdge>();
  for (const c of concepts) {
    for (const r of c.relationsFrom) {
      if (nodeIds.has(r.toConceptId)) {
        const key = `${c.id}->${r.toConceptId}`;
        if (!edgeSet.has(key)) {
          edgeSet.set(key, {
            id: r.id,
            source: c.id,
            target: r.toConceptId,
            type: r.type,
            strength: r.strength,
          });
        }
      }
    }
  }

  return { nodes, edges: Array.from(edgeSet.values()) };
}
