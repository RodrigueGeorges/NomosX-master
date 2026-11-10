import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { PublicPageShell } from "@/components/layout/PublicPageShell";
import { PageSection } from "@/components/layout/PageHeader";
import { InquiryCard } from "@/components/signature";
import { mapBriefToInquiryCard } from "@/lib/inquiry-mapper";
import { extractTopics } from "@/lib/queries/public-inquiry";
import { RESEARCHERS, SUB_LENS_IDENTITIES, getResearcher, getDomainForDesk } from "@/lib/researchers";
import { getResearcherTrackRecord } from "@/lib/agent/researcher-identity";
import { getResearcherKB } from "@/lib/agent/researcher-kb";
import { fetchDeskPredictions } from "@/lib/queries/predictions";
import { DOMAINS } from "@/lib/brand/domains";
import { VERTICAL_TO_DOMAIN, resolveDomainKey } from "@/lib/brand/god-fields";
import { domainFigureUrl, domainCoverCredit } from "@/lib/brand/domain-figures";
import { DomainCover } from "@/components/signature/DomainCover";
import { archivesDomainUrl, absoluteUrl, PUBLIC_ROUTES } from "@/lib/public-urls";
import { Link } from "@/i18n/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { prisma } from "@/lib/db";
import { publicPublicationWhere } from "@/lib/publication-visibility";
import { getDeskPortrait, deskPortraitUrl } from "@/lib/brand/researcher-portraits";
import { existsSync } from "fs";
import { join } from "path";
import type { DomainExpertise } from "@/lib/agent/types";

const TIER_ORDER = { core: 0, advanced: 1, specialized: 2 } as const;

interface Props {
  params: Promise<{ id: string; locale: string }>;
}

export function generateStaticParams() {
  return [
    ...RESEARCHERS.map((r) => ({ id: r.id })),
    ...Object.keys(SUB_LENS_IDENTITIES).map((id) => ({ id })),
  ];
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const r = getResearcher(id);
  const name = r?.name ?? SUB_LENS_IDENTITIES[id];
  if (!name) return { title: "Researcher — NomosX" };
  const domain = r?.domain ?? id;
  const domainKey = getDomainForDesk(id);
  const ogImage = domainKey ? domainFigureUrl(domainKey) : undefined;
  return {
    title: `${name} — ${domain} desk · NomosX`,
    description: r
      ? `${name}, ${r.title} — ${r.analyticalSignature}`
      : `${name} — a specialized reasoning desk of the NomosX council.`,
    alternates: { canonical: `/researchers/${id}` },
    openGraph: ogImage
      ? { title: `${name} — ${domain} desk`, images: [{ url: absoluteUrl(ogImage) }] }
      : undefined,
  };
}

function Chip({ children }: { children: ReactNode }) {
  return (
    <span className="font-mono text-[10px] uppercase tracking-[0.14em] px-2 py-1 border border-black/[0.1] dark:border-white/[0.1] text-black/55 dark:text-white/55">
      {children}
    </span>
  );
}

function statusTone(status: string): string {
  switch (status) {
    case "CONFIRMED":
    case "RESOLVED":
      return "border-emerald-500/40 text-emerald-700 dark:text-emerald-400";
    case "REFUTED":
    case "EXPIRED":
      return "border-rose-500/40 text-rose-700 dark:text-rose-400";
    default:
      return "border-black/[0.15] dark:border-white/[0.15] text-black/50 dark:text-white/50";
  }
}

export default async function ResearcherPage({ params }: Props) {
  const { id } = await params;
  const locale = await getLocale();
  setRequestLocale(locale);
  const t = await getTranslations("Researcher");

  const r = getResearcher(id);
  const subName = SUB_LENS_IDENTITIES[id];
  if (!r && !subName) notFound();

  // Extended (sub-lens) desk — identity from SUB_LENS_IDENTITIES, substance
  // from its domain knowledge base (biases, frameworks, data, canon).
  if (!r) {
    const kb = getResearcherKB(id as DomainExpertise);
    const track = await getResearcherTrackRecord(id);
    const hasTrack = track && (track.analyses > 0 || track.predictionsTotal > 0);
    const extDomain = resolveDomainKey(id);
    const extCredit = extDomain ? domainCoverCredit(extDomain) : undefined;
    const extGreek = /\(([^)]*)\)/.exec(subName)?.[1];
    return (
      <PublicPageShell currentPage="research">
        <PageSection className="max-w-4xl">
          <Link
            href={PUBLIC_ROUTES.researchers}
            className="inline-flex items-center gap-2 text-sm text-black/50 dark:text-white/50 hover:text-black dark:hover:text-white transition-colors mb-8"
          >
            <ArrowLeft size={14} />
            {t("backToCouncil")}
          </Link>

          <figure className="mb-10">
            <div className="relative h-36 sm:h-52 overflow-hidden border border-black/[0.08] dark:border-white/[0.08]">
              <DomainCover domain={extDomain} animated className="opacity-95" />
            </div>
            {extCredit && (
              <figcaption className="mt-2 font-mono text-[10px] uppercase tracking-[0.14em] text-black/40 dark:text-white/40">
                {extCredit.title} — {extCredit.credit}
              </figcaption>
            )}
          </figure>

          <div className="flex items-start gap-5">
            <div
              aria-hidden="true"
              className="w-16 h-16 shrink-0 rounded-full flex items-center justify-center font-mono text-2xl font-medium border border-black/[0.14] dark:border-white/[0.14] bg-black/[0.04] dark:bg-white/[0.06] text-black/75 dark:text-white/75"
            >
              {extGreek?.[0] ?? "Ν"}
            </div>
            <div>
              <p className="nx-eyebrow mb-3">{t("eyebrow")}</p>
              <h1 className="font-display text-4xl mb-3">{subName}</h1>
              <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-black/45 dark:text-white/45 mb-8">
                {id} · {t("extendedDeskTitle")}
              </p>
            </div>
          </div>
          <p className="text-black/65 dark:text-white/65 leading-relaxed max-w-2xl mb-10">
            {t("extendedDesk")}
          </p>

          {kb && (
            <div className="grid md:grid-cols-2 gap-8 mb-10">
              <section>
                <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-black/40 dark:text-white/40 mb-3">
                  {t("howItReads")}
                </h2>
                <p className="text-sm text-black/75 dark:text-white/75 leading-relaxed mb-6">
                  {kb.methodology.approach}
                </p>
                <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-black/40 dark:text-white/40 mb-3">
                  {t("skepticalOf")}
                </h2>
                <ul className="space-y-1.5">
                  {kb.knownBiases.map((b) => (
                    <li key={b} className="flex gap-2 text-sm text-black/75 dark:text-white/75 leading-relaxed">
                      <span className="text-black/30 dark:text-white/30">—</span>
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              </section>
              <section>
                <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-black/40 dark:text-white/40 mb-3">
                  {t("frontier")}
                </h2>
                <ul className="space-y-1.5 mb-6">
                  {kb.standingQuestions.map((q) => (
                    <li key={q} className="text-sm text-black/75 dark:text-white/75">· {q}</li>
                  ))}
                </ul>
                <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-black/40 dark:text-white/40 mb-3">
                  {t("frameworks")}
                </h2>
                <div className="flex flex-wrap gap-2">
                  {kb.frameworks.slice(0, 8).map((f) => <Chip key={f.name}>{f.name}</Chip>)}
                </div>
              </section>
            </div>
          )}

          {hasTrack && track && (
            <section className="border border-black/[0.1] dark:border-white/[0.1] bg-black/[0.02] dark:bg-white/[0.02] p-5">
              <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-black/40 dark:text-white/40 mb-4">
                {t("trackRecord")}
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <p className="font-display text-2xl">{track.analyses}</p>
                  <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-black/45 dark:text-white/45">{t("analyses")}</p>
                </div>
                <div>
                  <p className="font-display text-2xl">
                    {track.predictionsResolved}
                    <span className="text-sm text-black/40 dark:text-white/40">/{track.predictionsTotal}</span>
                  </p>
                  <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-black/45 dark:text-white/45">{t("resolved")}</p>
                </div>
                <div>
                  <p className="font-display text-2xl">
                    {track.accuracy !== null ? `${Math.round(track.accuracy * 100)}%` : "—"}
                  </p>
                  <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-black/45 dark:text-white/45">{t("accuracy")}</p>
                </div>
                <div>
                  <p className="font-display text-2xl">
                    {track.avgConfidence !== null ? `${track.avgConfidence}` : "—"}
                  </p>
                  <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-black/45 dark:text-white/45">{t("avgConfidence")}</p>
                </div>
              </div>
            </section>
          )}
        </PageSection>
      </PublicPageShell>
    );
  }

  const domainKey = getDomainForDesk(r.id);
  const coverMeta = domainKey ? domainCoverCredit(domainKey) : undefined;
  const trackRecord = await getResearcherTrackRecord(r.id);

  // Commissioned fresco portrait of the desk's patron mythic figure —
  // shown when the generated plate exists on disk.
  const portrait = getDeskPortrait(r.id);
  const portraitSrc =
    portrait && existsSync(join(process.cwd(), "public", "researchers", `${r.id}.webp`))
      ? deskPortraitUrl(r.id)
      : undefined;

  const domainEn = domainKey ? DOMAINS.find((d) => d.key === domainKey)?.en : undefined;
  const verticalSlugs = domainKey
    ? Object.entries(VERTICAL_TO_DOMAIN).filter(([, dom]) => dom === domainKey).map(([slug]) => slug)
    : [];

  const deskCalls = await fetchDeskPredictions(verticalSlugs);

  const latest = verticalSlugs.length
    ? await prisma.thinkTankPublication.findMany({
        where: {
          ...publicPublicationWhere(),
          vertical: { is: { slug: { in: verticalSlugs } } },
        },
        orderBy: { publishedAt: "desc" },
        take: 3,
        select: {
          id: true,
          publicId: true,
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

  const hasRecord =
    trackRecord && (trackRecord.analyses > 0 || trackRecord.predictionsTotal > 0);

  // ProfilePage JSON-LD — the desk as a named, honest AI entity.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    name: `${r.name} — ${r.domain} desk`,
    description: r.analyticalSignature,
    url: absoluteUrl(`/researchers/${r.id}`),
    mainEntity: {
      "@type": "Thing",
      name: r.name,
      description: `${r.title} — autonomous AI research desk of NomosX Institute`,
      url: absoluteUrl(`/researchers/${r.id}`),
    },
  };

  return (
    <PublicPageShell currentPage="research">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
      />
      <PageSection className="max-w-4xl">
        <Link
          href={PUBLIC_ROUTES.researchers}
          className="inline-flex items-center gap-2 text-sm text-black/50 dark:text-white/50 hover:text-black dark:hover:text-white transition-colors mb-8"
        >
          <ArrowLeft size={14} />
          {t("backToCouncil")}
        </Link>

        {/* Frontispiece — the desk's domain figure as an engraved plate,
            same treatment as the desk archive. Artwork credit under the
            plate, the institutional norm. */}
        <figure className="mb-10">
          <div className="relative h-36 sm:h-52 overflow-hidden border border-black/[0.08] dark:border-white/[0.08]">
            <DomainCover domain={domainKey} animated className="opacity-95" />
          </div>
          {coverMeta && (
            <figcaption className="mt-2 font-mono text-[10px] uppercase tracking-[0.14em] text-black/40 dark:text-white/40">
              {coverMeta.title} — {coverMeta.credit}
            </figcaption>
          )}
        </figure>

        {/* Header — the fellow-page masthead */}
        <div className="flex items-start gap-5 mb-10">
          {portraitSrc ? (
            <figure className="shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={portraitSrc}
                alt={`${portrait!.figure} — patron figure of the ${r.domain} desk`}
                className="w-20 h-20 sm:w-24 sm:h-24 object-cover border border-black/[0.14] dark:border-white/[0.14] bg-[#050507]"
              />
              <figcaption className="mt-1.5 font-mono text-[9px] uppercase tracking-[0.14em] text-black/40 dark:text-white/40 w-20 sm:w-24 leading-snug">
                {portrait!.figure} — {portrait!.archetype.split('—')[0].trim()}
              </figcaption>
            </figure>
          ) : (
            <div
              aria-hidden="true"
              className="w-16 h-16 shrink-0 rounded-full flex items-center justify-center font-mono text-2xl font-medium border border-black/[0.14] dark:border-white/[0.14] bg-black/[0.04] dark:bg-white/[0.06] text-black/75 dark:text-white/75"
            >
              {r.initials}
            </div>
          )}
          <div>
            <p className="nx-eyebrow mb-2">{t("eyebrow")}</p>
            <h1 className="font-display text-3xl sm:text-4xl leading-tight">{r.name}</h1>
            <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.16em] text-black/45 dark:text-white/45">
              {t("deskOf", { domain: r.domain })} · {r.title}
            </p>
            <div className="mt-3 flex flex-wrap gap-2 items-center">
              <Chip>{r.tier} desk</Chip>
              <Chip>{r.institution}</Chip>
              {domainKey && (
                <Link
                  href={`/desk/${domainKey}`}
                  className="font-mono text-[10px] uppercase tracking-[0.14em] text-black/50 dark:text-white/50 hover:text-black dark:hover:text-white transition-colors underline underline-offset-4"
                >
                  {t("visitDesk")} →
                </Link>
              )}
            </div>
            <p className="mt-3 text-xs text-black/45 dark:text-white/45">{t("aiDeskNote")}</p>
          </div>
        </div>

        {/* How it reads — analytical signature */}
        <section className="mb-10">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-black/40 dark:text-white/40 mb-3">
            {t("howItReads")}
          </h2>
          <p className="text-lg font-display leading-relaxed text-black/85 dark:text-white/85">
            {r.analyticalSignature}
          </p>
        </section>

        {/* Track record — the proof nobody else can show */}
        <section className="mb-10 border border-black/[0.1] dark:border-white/[0.1] bg-black/[0.02] dark:bg-white/[0.02] p-5">
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-black/40 dark:text-white/40">
              {t("trackRecord")}
            </h2>
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-black/35 dark:text-white/35">
              {t("live")}
            </span>
          </div>
          {hasRecord ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <p className="font-display text-2xl">{trackRecord!.analyses}</p>
                <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-black/45 dark:text-white/45">{t("analyses")}</p>
              </div>
              <div>
                <p className="font-display text-2xl">
                  {trackRecord!.predictionsResolved}
                  <span className="text-sm text-black/40 dark:text-white/40">/{trackRecord!.predictionsTotal}</span>
                </p>
                <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-black/45 dark:text-white/45">{t("resolved")}</p>
              </div>
              <div>
                <p className="font-display text-2xl">
                  {trackRecord!.accuracy !== null ? `${Math.round(trackRecord!.accuracy * 100)}%` : "—"}
                </p>
                <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-black/45 dark:text-white/45">{t("accuracy")}</p>
              </div>
              <div>
                <p className="font-display text-2xl">
                  {trackRecord!.avgConfidence !== null ? `${trackRecord!.avgConfidence}` : "—"}
                </p>
                <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-black/45 dark:text-white/45">{t("avgConfidence")}</p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-black/60 dark:text-white/60">{t("accruing")}</p>
          )}
        </section>

        {/* Positions on record — what this desk has actually argued */}
        {trackRecord && trackRecord.positions.length > 0 && (
          <section className="mb-10">
            <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-black/40 dark:text-white/40 mb-4">
              {t("positionsOnRecord")}
            </h2>
            <ul className="space-y-4">
              {trackRecord.positions.map((p, i) => (
                <li key={i} className="border-l-2 pl-4 border-black/20 dark:border-white/20">
                  <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-black/40 dark:text-white/40 mb-1">
                    {p.date} · {t("confidence")} {p.confidence}/100
                  </p>
                  <p className="text-sm font-medium text-black/85 dark:text-white/85 mb-1">{p.topic}</p>
                  <p className="text-sm text-black/65 dark:text-white/65 leading-relaxed">{p.stance}</p>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Calls on record — the desk's signed predictions + brief-level calls */}
        {(trackRecord?.predictions.length || deskCalls.length) ? (
          <section className="mb-10">
            <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-black/40 dark:text-white/40 mb-4">
              {t("callsOnRecord")}
            </h2>
            <ul className="space-y-3">
              {(trackRecord?.predictions ?? []).map((p, i) => (
                <li key={`d-${i}`} className="flex items-start justify-between gap-4 border border-black/[0.08] dark:border-white/[0.08] p-3">
                  <div className="min-w-0">
                    <p className="text-sm text-black/80 dark:text-white/80 leading-relaxed">{p.claim}</p>
                    <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-black/40 dark:text-white/40 mt-1">
                      {p.date}{p.timeframe ? ` · ${p.timeframe}` : ""}{p.probability !== null ? ` · p=${Math.round(p.probability * 100)}%` : ""}
                    </p>
                  </div>
                  <span className={`shrink-0 font-mono text-[9px] uppercase tracking-[0.14em] px-2 py-0.5 border ${statusTone(p.resolved ? (p.outcome === "incorrect" ? "REFUTED" : "CONFIRMED") : "OPEN")}`}>
                    {p.resolved ? t(`status.${p.outcome === "incorrect" ? "REFUTED" : "CONFIRMED"}`) : t("status.OPEN")}
                  </span>
                </li>
              ))}
              {deskCalls.map((p) => (
                <li key={p.id} className="flex items-start justify-between gap-4 border border-black/[0.08] dark:border-white/[0.08] p-3">
                  <div className="min-w-0">
                    <p className="text-sm text-black/80 dark:text-white/80 leading-relaxed">{p.claim}</p>
                    <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-black/40 dark:text-white/40 mt-1">
                      {p.createdAt.toISOString().slice(0, 10)} · {p.horizon}{p.probability !== null ? ` · p=${Math.round(p.probability * 100)}%` : ""}
                      {p.publication && (
                        <>
                          {" · "}
                          <Link
                            href={`/inquiry/${p.publication.publicId ?? p.publication.id}`}
                            className="underline underline-offset-2 hover:text-black dark:hover:text-white"
                          >
                            {t("inBrief")}
                          </Link>
                        </>
                      )}
                    </p>
                  </div>
                  <span className={`shrink-0 font-mono text-[9px] uppercase tracking-[0.14em] px-2 py-0.5 border ${statusTone(p.status)}`}>
                    {t(`status.${p.status}`)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <div className="grid md:grid-cols-2 gap-8 mb-10">
          {/* Skeptical of — epistemic priors */}
          <section>
            <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-black/40 dark:text-white/40 mb-3">
              {t("skepticalOf")}
            </h2>
            <ul className="space-y-2">
              {(r.epistemicPriors ?? []).map((p) => (
                <li key={p} className="flex gap-2 text-sm text-black/75 dark:text-white/75 leading-relaxed">
                  <span className="text-black/30 dark:text-white/30">—</span>
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          </section>

          {/* Canon + frontier */}
          <section>
            <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-black/40 dark:text-white/40 mb-3">
              {t("canon")}
            </h2>
            <ul className="space-y-1.5 mb-6">
              {(r.landmarkTopics ?? []).map((topic) => (
                <li key={topic} className="text-sm text-black/75 dark:text-white/75">· {topic}</li>
              ))}
            </ul>
            <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-black/40 dark:text-white/40 mb-3">
              {t("frontier")}
            </h2>
            <ul className="space-y-1.5">
              {(r.hotTopics ?? []).map((topic) => (
                <li key={topic} className="text-sm text-black/75 dark:text-white/75">· {topic}</li>
              ))}
            </ul>
          </section>
        </div>

        {/* Frameworks + data preferences */}
        <div className="grid md:grid-cols-2 gap-8 mb-12">
          <section>
            <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-black/40 dark:text-white/40 mb-3">
              {t("frameworks")}
            </h2>
            <div className="flex flex-wrap gap-2">
              {(r.frameworks ?? []).map((f) => <Chip key={f}>{f}</Chip>)}
            </div>
          </section>
          <section>
            <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-black/40 dark:text-white/40 mb-3">
              {t("dataPrefers")}
            </h2>
            <div className="flex flex-wrap gap-2">
              {(r.dataPreferences ?? []).map((d) => <Chip key={d}>{d}</Chip>)}
            </div>
          </section>
        </div>

        {/* Latest publications from this desk */}
        {latest.length > 0 && (
          <section className="mb-12">
            <div className="flex items-baseline justify-between mb-5">
              <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-black/40 dark:text-white/40">
                {t("latestFrom", { domain: domainEn ?? r.domain })}
              </h2>
              {domainEn && (
                <Link
                  href={archivesDomainUrl(domainEn)}
                  className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.12em] text-black/50 dark:text-white/50 hover:text-black dark:hover:text-white transition-colors"
                >
                  {t("allBriefs")}
                  <ArrowRight size={12} />
                </Link>
              )}
            </div>
            <div className="grid gap-4">
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
                  href={`/inquiry/${p.publicId ?? p.id}`}
                />
              ))}
            </div>
          </section>
        )}

        {/* Council navigation — previous / next desk */}
        <nav className="flex items-center justify-between border-t border-black/[0.08] dark:border-white/[0.08] pt-6">
          {(() => {
            const sorted = [...RESEARCHERS].sort(
              (a, b) => TIER_ORDER[a.tier] - TIER_ORDER[b.tier] || a.domain.localeCompare(b.domain)
            );
            const idx = sorted.findIndex((x) => x.id === r.id);
            const prev = idx > 0 ? sorted[idx - 1] : null;
            const next = idx < sorted.length - 1 ? sorted[idx + 1] : null;
            return (
              <>
                {prev ? (
                  <Link href={`/researchers/${prev.id}`} className="group inline-flex items-center gap-2 text-sm text-black/50 dark:text-white/50 hover:text-black dark:hover:text-white transition-colors">
                    <ArrowLeft size={14} />
                    <span className="font-mono text-[11px] uppercase tracking-[0.12em]">{prev.name}</span>
                  </Link>
                ) : <span />}
                {next ? (
                  <Link href={`/researchers/${next.id}`} className="group inline-flex items-center gap-2 text-sm text-black/50 dark:text-white/50 hover:text-black dark:hover:text-white transition-colors">
                    <span className="font-mono text-[11px] uppercase tracking-[0.12em]">{next.name}</span>
                    <ArrowRight size={14} />
                  </Link>
                ) : <span />}
              </>
            );
          })()}
        </nav>
      </PageSection>
    </PublicPageShell>
  );
}
