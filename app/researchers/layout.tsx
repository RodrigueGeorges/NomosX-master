import { Metadata } from "next";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://nomosx.com";

export const metadata: Metadata = {
  title: "Reasoning Lenses — Cross-Domain Models",
  description:
    "Domain reasoning models used by NomosX to map collisions, quantify trajectories, and arbitrate institute positions — no editorial agenda.",
  alternates: { canonical: `${BASE_URL}/researchers` },
  openGraph: {
    title: "NomosX Reasoning Lenses",
    description: "Cross-domain analytical models for probabilistic foresight and decision-ready positions.",
  },
};

export default function ResearchersLayout({ children }: { children: React.ReactNode }) {
  return children;
}
