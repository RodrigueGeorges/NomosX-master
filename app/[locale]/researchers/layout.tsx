import { Metadata } from "next";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://nomosx.com";

export const metadata: Metadata = {
  title: "The Council — Named AI Research Desks",
  description:
    "The NomosX council: named AI research desks, each bound to a discipline with persistent memory of its positions — every question read through several lenses, their disagreement is the analysis.",
  alternates: { canonical: `${BASE_URL}/researchers` },
  openGraph: {
    title: "The NomosX Council",
    description: "Named AI research desks for scenario-weighted reasoning and decision-ready positions.",
  },
};

export default function ResearchersLayout({ children }: { children: React.ReactNode }) {
  return children;
}
