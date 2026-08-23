import { fetchPublicBriefs } from "@/lib/queries/public-briefs";
import { ArchivesClient } from "@/components/archives/ArchivesClient";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Archives");
  return {
    title: `${t("title")} — NomosX`,
    description: t("description"),
    alternates: {
      canonical: "/archives",
    },
  };
}

export default async function ArchivesPage() {
  const briefs = await fetchPublicBriefs(48);

  return <ArchivesClient initialBriefs={briefs} />;
}
