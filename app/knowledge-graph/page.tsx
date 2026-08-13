import { fetchKnowledgeGraph } from "@/lib/queries/knowledge-graph";
import { KnowledgeGraph } from "@/components/knowledge-graph/KnowledgeGraph";
import { PublicPageShell } from "@/components/layout/PublicPageShell";
import { PageHeader, PageSection } from "@/components/layout/PageHeader";
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
    <PublicPageShell>
      <PageSection>
        <PageHeader
          eyebrow="Epistemic Map"
          title="Knowledge Graph"
          description="Every concept NomosX has encountered across its analyses, mapped by relationship type. Nodes sized by occurrence count, edges colored by relationship type."
        />

        <KnowledgeGraph data={data} />
      </PageSection>
    </PublicPageShell>
  );
}
