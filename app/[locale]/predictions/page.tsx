import { fetchPredictions, fetchPredictionStats } from "@/lib/queries/predictions";
import { PredictionTracker } from "@/components/predictions/PredictionTracker";
import { PublicPageShell } from "@/components/layout/PublicPageShell";
import { PageHeader, PageSection } from "@/components/layout/PageHeader";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Prediction Tracker",
  description: "Every prediction NomosX has made, tracked to resolution. Accountability through transparency.",
  alternates: {
    canonical: "/predictions",
  },
};

export default async function PredictionsPage() {
  const [{ predictions }, stats] = await Promise.all([
    fetchPredictions({ limit: 100 }),
    fetchPredictionStats(),
  ]);

  return (
    <PublicPageShell>
      <PageSection className="max-w-4xl">
        <PageHeader
          eyebrow="Accountability"
          title="Prediction Tracker"
          description="Every prospective claim NomosX publishes is registered here with resolution criteria and falsification conditions. When the horizon arrives, we record what actually happened."
        />

        <PredictionTracker predictions={predictions} stats={stats} />
      </PageSection>
    </PublicPageShell>
  );
}
