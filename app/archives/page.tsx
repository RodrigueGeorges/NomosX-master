import { fetchPublicBriefs } from "@/lib/queries/public-briefs";
import { ArchivesClient } from "@/components/archives/ArchivesClient";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Brief archive",
  description: "Every position NomosX has published — chaos legislated into nomos. Filter by depth, domain, and confidence.",
  alternates: {
    canonical: "/archives",
  },
};

export default async function ArchivesPage() {
  const briefs = await fetchPublicBriefs(48);

  return <ArchivesClient initialBriefs={briefs} />;
}
