import { fetchKnowledgeGraph } from "@/lib/queries/knowledge-graph";
import { KnowledgeGraph } from "@/components/knowledge-graph/KnowledgeGraph";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Knowledge Graph",
  description: "Concepts and relationships extracted from NomosX analyses — explore the intellectual landscape.",
  alternates: {
    canonical: "/knowledge-graph",
  },
};

export default async function KnowledgeGraphPage() {
  const data = await fetchKnowledgeGraph(60);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
      <div className="mb-8">
        <p className="nx-eyebrow mb-4">Epistemic Map</p>
        <h1 className="text-3xl font-light text-white mb-3">Knowledge Graph</h1>
        <p className="text-sm text-white/50 max-w-2xl leading-relaxed">
          Every concept NomosX has encountered across its analyses, mapped by relationship type.
          Nodes sized by occurrence count, edges colored by relationship type.
        </p>
      </div>

      <KnowledgeGraph data={data} />
    </div>
  );
}
