import { fetchPredictions, fetchPredictionStats } from "@/lib/queries/predictions";
import { PredictionTracker } from "@/components/predictions/PredictionTracker";
import type { Metadata } from "next";

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
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12">
      <div className="mb-8">
        <p className="nx-eyebrow mb-4">Accountability</p>
        <h1 className="text-3xl font-light text-white mb-3">Prediction Tracker</h1>
        <p className="text-sm text-white/50 max-w-2xl leading-relaxed">
          Every prospective claim NomosX publishes is registered here with resolution criteria
          and falsification conditions. When the horizon arrives, we record what actually happened.
        </p>
      </div>

      <PredictionTracker predictions={predictions} stats={stats} />
    </div>
  );
}
