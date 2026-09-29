import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import { setRequestLocale } from "next-intl/server";
import { PublicPageShell } from "@/components/layout/PublicPageShell";
import { PageHeader, PageSection } from "@/components/layout/PageHeader";
import { InquiryCard } from "@/components/signature";
import { mapBriefToInquiryCard } from "@/lib/inquiry-mapper";
import { DomainCover } from "@/components/signature/DomainCover";
import { DOMAINS } from "@/lib/brand/domains";
import { PUBLIC_ROUTES } from "@/lib/public-urls";
import { Link } from "@/i18n/navigation";
import { ArrowRight } from "lucide-react";
import { prisma } from "@/lib/db";
import { publicPublicationWhere } from "@/lib/publication-visibility";
import { extractTopics } from "@/lib/queries/public-inquiry";

export const metadata: Metadata = {
  title: "NomosX Research Desk",
  description:
    "The desk behind every NomosX publication — eight domains, one analytical discipline.",
  alternates: { canonical: "/desk" },
};

export default async function DeskPage() {
  const locale = await getLocale();
  const fr = locale === "fr";
  setRequestLocale(locale);

  const latest = await prisma.thinkTankPublication.findMany({
    where: publicPublicationWhere(),
    orderBy: { publishedAt: "desc" },
    take: 6,
    select: {
      id: true,
      title: true,
      type: true,
      publishedAt: true,
      wordCount: true,
      sourceIds: true,
      trustScore: true,
      heroImageUrl: true,
    },
  });

  return (
    <PublicPageShell currentPage="desk">
      <PageSection className="max-w-5xl">
        <PageHeader
          eyebrow="NomosX"
          title={fr ? "NomosX Research Desk" : "NomosX Research Desk"}
          description={
            fr
              ? "Le bureau derrière chaque publication : huit domaines, une seule discipline analytique — chaque pièce est produite, contestée et vérifiée avant de paraître."
              : "The desk behind every publication: eight domains, one analytical discipline — every piece is produced, contested and verified before it ships."
          }
        />

        {/* The desk's domains — covers + links to filtered archives */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-14">
          {DOMAINS.map((d) => {
            return (
              <Link
                key={d.key}
                href={`/desk/${d.key}`}
                className="group border border-black/[0.08] dark:border-white/[0.08] bg-black/[0.02] dark:bg-white/[0.02] hover:border-black/25 dark:hover:border-white/25 transition-colors"
              >
                <div className="relative h-36 overflow-hidden border-b border-black/[0.08] dark:border-white/[0.08]">
                  <DomainCover domain={d.key} variant="sm" />
                </div>
                <div className="p-4 flex items-center justify-between">
                  <h2 className="font-display text-base font-semibold text-black dark:text-white">
                    {fr ? d.fr : d.en}
                  </h2>
                  <ArrowRight
                    size={13}
                    className="text-black/30 dark:text-white/30 group-hover:text-black dark:group-hover:text-white group-hover:translate-x-0.5 transition-all"
                  />
                </div>
              </Link>
            );
          })}
        </div>

        {/* Latest from the desk */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-display text-lg font-semibold text-black dark:text-white">
            {fr ? "Dernières publications" : "Latest publications"}
          </h2>
          <Link
            href={PUBLIC_ROUTES.archives}
            className="font-mono text-[11px] uppercase tracking-wider text-black/50 dark:text-white/50 hover:text-black dark:hover:text-white transition-colors"
          >
            {fr ? "Archives" : "Archives"} →
          </Link>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {latest.map((p, i) => (
            <InquiryCard
              key={p.id}
              inquiry={mapBriefToInquiryCard(
                {
                  id: p.id,
                  title: p.title,
                  summary: "",
                  type: p.type,
                  publishedAt: p.publishedAt?.toISOString() ?? new Date().toISOString(),
                  readTime: Math.max(1, Math.ceil((p.wordCount ?? 0) / 200)),
                  sources: p.sourceIds?.length ?? 0,
                  topics: extractTopics(p.title ?? ""),
                  trustScore: p.trustScore,
                  heroImageUrl: p.heroImageUrl ?? null,
                },
                i
              )}
              href={`/inquiry/${p.id}`}
            />
          ))}
        </div>
      </PageSection>
    </PublicPageShell>
  );
}
