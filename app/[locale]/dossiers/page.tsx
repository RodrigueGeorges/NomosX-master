import { fetchWatchedDossiers } from "@/lib/queries/dossiers";
import { DossierList } from "@/components/dossiers/DossierList";
import { PublicPageShell } from "@/components/layout/PublicPageShell";
import { PageHeader, PageSection } from "@/components/layout/PageHeader";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Followed Dossiers",
  description:
    "Subjects NomosX keeps under surveillance: open predictions on past analyses and the update notes published when the world moves.",
  alternates: {
    canonical: "/dossiers",
  },
};

export default async function DossiersPage() {
  const dossiers = await fetchWatchedDossiers(30);

  return (
    <PublicPageShell>
      <PageSection className="max-w-4xl">
        <PageHeader
          eyebrow="Watch loop"
          title="Followed Dossiers"
          description="Each published analysis that issues prospective claims becomes a dossier under watch. When radar signals match a prediction trigger, NomosX reopens the question and publishes an update note — linked back here."
        />

        <DossierList dossiers={dossiers} />
      </PageSection>
    </PublicPageShell>
  );
}
