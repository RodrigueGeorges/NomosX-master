import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, setRequestLocale } from "next-intl/server";
import { PublicPageShell } from "@/components/layout/PublicPageShell";
import { PageHeader, PageSection } from "@/components/layout/PageHeader";
import { InquiryCard } from "@/components/signature";
import { mapBriefToInquiryCard } from "@/lib/inquiry-mapper";
import { domainCoverCredit } from "@/lib/brand/domain-figures";
import { DomainCover } from "@/components/signature/DomainCover";
import { DOMAINS } from "@/lib/brand/domains";
import { VERTICAL_TO_DOMAIN } from "@/lib/brand/god-fields";
import { getResearcher, DESK_FOR_DOMAIN } from "@/lib/researchers";
import { archivesDomainUrl, PUBLIC_ROUTES } from "@/lib/public-urls";
import { Link } from "@/i18n/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { prisma } from "@/lib/db";
import { publicPublicationWhere } from "@/lib/publication-visibility";
import { extractTopics } from "@/lib/queries/public-inquiry";

/** DOMAINS key → canonical researcher id (single source: lib/researchers.ts). */
const DOMAIN_RESEARCHER = DESK_FOR_DOMAIN;

interface Props {
  params: Promise<{ domain: string; locale: string }>;
}

export function generateStaticParams() {
  return DOMAINS.map((d) => ({ domain: d.key }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { domain } = await params;
  const d = DOMAINS.find((x) => x.key === domain);
  if (!d) return { title: "Desk — NomosX" };
  return {
    title: `${d.en} Desk — NomosX`,
    description: d.descEn,
    alternates: { canonical: `/desk/${d.key}` },
  };
}

export default async function DeskDomainPage({ params }: Props) {
  const { domain } = await params;
  const locale = await getLocale();
  const fr = locale === "fr";
  setRequestLocale(locale);

  const d = DOMAINS.find((x) => x.key === domain);
  if (!d) notFound();

  const researcher = getResearcher(DOMAIN_RESEARCHER[d.key] ?? d.key);
  const verticalSlugs = Object.entries(VERTICAL_TO_DOMAIN)
    .filter(([, dom]) => dom === d.key)
    .map(([slug]) => slug);

  const latest = verticalSlugs.length
    ? await prisma.thinkTankPublication.findMany({
        where: {
          ...publicPublicationWhere(),
          vertical: { is: { slug: { in: verticalSlugs } } },
        },
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
      })
    : [];

  const coverMeta = domainCoverCredit(d.key);

  return (
    <PublicPageShell currentPage="desk">
      <PageSection className="max-w-5xl">
        <Link
          href={PUBLIC_ROUTES.desk}
          className="inline-flex items-center gap-2 text-sm text-black/50 dark:text-white/50 hover:text-black dark:hover:text-white transition-colors mb-8"
        >
          <ArrowLeft size={14} />
          {fr ? "Research Desk" : "Research Desk"}
        </Link>

        {/* Desk frontispiece — the domain figure as an engraved plate */}
        <figure className="mb-8">
          <div className="relative w-full h-52 sm:h-72 overflow-hidden border border-black/[0.08] dark:border-white/[0.08]">
            <DomainCover domain={d.key} animated className="opacity-95" />
          </div>
          {coverMeta && (
            <figcaption className="mt-2 font-mono text-[10px] uppercase tracking-[0.14em] text-black/40 dark:text-white/40">
              {coverMeta.title} — {coverMeta.credit}
            </figcaption>
          )}
        </figure>

        <PageHeader
          eyebrow={fr ? "Desk NomosX" : "NomosX Desk"}
          title={fr ? d.fr : d.en}
          description={fr ? d.descFr : d.descEn}
        />

        {/* The desk's identity — canonical name + analytical signature */}
        {researcher && (
          <div className="nx-public-surface p-6 mb-12">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-black/45 dark:text-white/45 mb-3">
              {fr ? "Responsable du desk" : "Desk lead"}
            </p>
            <p className="font-display text-xl font-semibold text-black dark:text-white mb-1">
              <Link
                href={`/researchers/${researcher.id}`}
                className="hover:underline underline-offset-4 transition-colors"
              >
                {researcher.name}
              </Link>
            </p>
            <p className="text-sm text-black/60 dark:text-white/60 mb-4">
              {researcher.title} · {researcher.specialty} · {researcher.institution}
            </p>
            {researcher.analyticalSignature && (
              <p className="text-sm text-black/70 dark:text-white/70 leading-relaxed border-l-2 border-black/20 dark:border-white/20 pl-4">
                {researcher.analyticalSignature}
              </p>
            )}
            {researcher.frameworks && researcher.frameworks.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {researcher.frameworks.slice(0, 6).map((f) => (
                  <span
                    key={f}
                    className="px-2 py-1 border border-black/[0.12] dark:border-white/[0.12] font-mono text-[10px] uppercase tracking-wider text-black/55 dark:text-white/55"
                  >
                    {f}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Latest from this desk */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-display text-lg font-semibold text-black dark:text-white">
            {fr ? "Publications du desk" : "From this desk"}
          </h2>
          <Link
            href={archivesDomainUrl(d.en)}
            className="font-mono text-[11px] uppercase tracking-wider text-black/50 dark:text-white/50 hover:text-black dark:hover:text-white transition-colors"
          >
            {fr ? "Archives" : "Archives"} →
          </Link>
        </div>

        {latest.length > 0 ? (
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
        ) : (
          <div className="nx-public-surface p-8 text-center">
            <p className="text-sm text-black/55 dark:text-white/55 max-w-md mx-auto">
              {fr
                ? "Ce desk est actif — ses prochaines publications sont en cours de vérification éditoriale."
                : "This desk is active — its next publications are going through editorial verification."}
            </p>
            <Link
              href={PUBLIC_ROUTES.archives}
              className="inline-flex items-center gap-2 mt-4 font-mono text-[11px] uppercase tracking-wider text-black dark:text-white hover:underline"
            >
              {fr ? "Toutes les publications" : "All publications"}
              <ArrowRight size={12} />
            </Link>
          </div>
        )}
      </PageSection>
    </PublicPageShell>
  );
}
