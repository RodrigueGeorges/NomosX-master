import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Track record — falsifiable predictions, resolved in public",
  description:
    "Every prediction NomosX publishes is dated, falsifiable, and resolved in public. Judge us on our calls — hit rate, Brier score, and every prediction we got wrong.",
  alternates: {
    canonical: "/track-record",
  },
  openGraph: {
    title: "NomosX Track Record — falsifiable predictions, resolved in public",
    description:
      "Every prediction we publish is dated, falsifiable, and resolved in public. Hit rate, Brier score, and every call we got wrong.",
    url: "/track-record",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "NomosX Track Record — falsifiable predictions",
    description:
      "Every prediction we publish is dated, falsifiable, and resolved in public.",
  },
};

export default function TrackRecordLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
