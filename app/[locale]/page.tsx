"use client";



import React, { useEffect, useState, Suspense } from "react";

import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";

import AuthModal from "@/components/AuthModal";

import { PublicPageShell } from "@/components/layout/PublicPageShell";

import {

  CouncilRoster,

  DomainMap,

  FeaturedVerdictCard,

  InquiryCard,

  InstitutePulse,

  LensPrism,

  ReadingRoom,

  StudioPreview,

  type FeaturedVerdictData,

  type InquiryCardData,

  type InquiryWatermark,

} from "@/components/signature";

import { FALLBACK_FEATURED_VERDICT, isEmptyVerdict } from "@/lib/brand/featured-verdict";


import { ErrorBoundary } from "@/components/ErrorBoundary";

import { ManifestoCrawl } from "@/components/brand/ManifestoCrawl";
import { GhostCharField } from "@/components/brand/GhostCharField";
import { MeanderDivider } from "@/components/brand/MeanderDivider";
import { NomosXLogo } from "@/components/brand/NomosXLogo";

import { PUBLIC_ROUTES } from "@/lib/public-urls";

import { ScrollReveal } from "@/components/ui/ScrollReveal";
import { ScrollProgress } from "@/components/ui/ScrollProgress";
import { StatCounter } from "@/components/ui/StatCounter";
import { WordReveal } from "@/components/ui/WordReveal";
import { MagneticButton } from "@/components/ui/MagneticButton";

import { ArrowRight } from "lucide-react";



type PublicBrief = {

  id: string;

  title: string;

  summary: string;

  type: string;

  displayType?: string;

  publishedAt: string;

  readTime: number;

  sources: number;

  topics: string[];

  trustScore?: number | null;

  heroImageUrl?: string | null;

};



const WATERMARKS: InquiryWatermark[] = ["map", "chart", "globe"];



function mapBriefToInquiry(b: PublicBrief, index: number): InquiryCardData {

  return {

    id: b.id,

    slug: b.id,

    title: b.title,

    summary: b.summary,

    domain: b.topics?.[0]?.toUpperCase() ?? "GENERAL",

    watermark: WATERMARKS[index % WATERMARKS.length],

    verdict: b.trustScore != null ? { value: `${b.trustScore}%`, label: "Confidence" } : undefined,

    sourceCount: b.sources,

    publishedAt: b.publishedAt,

    readTime: b.readTime,

    formatLabel: b.displayType,

    heroImageUrl: b.heroImageUrl ?? null,

  };

}







function HomePageContent() {

  const t = useTranslations();
  const router = useRouter();

  const searchParams = useSearchParams();

  const [showAuthModal, setShowAuthModal] = useState(false);

  const [authRedirect, setAuthRedirect] = useState<"dashboard" | "studio">("dashboard");

  const [isAuthenticated, setIsAuthenticated] = useState(false);

  const [isLoading, setIsLoading] = useState(true);

  const [latestInquiries, setLatestInquiries] = useState<InquiryCardData[]>([]);

  const [featuredVerdict, setFeaturedVerdict] = useState<FeaturedVerdictData>(FALLBACK_FEATURED_VERDICT);

  const [newsletterEmail, setNewsletterEmail] = useState("");

  const [newsletterStatus, setNewsletterStatus] = useState<"idle" | "loading" | "success" | "error">("idle");

  const [newsletterMessage, setNewsletterMessage] = useState("");

  const [trackRecord, setTrackRecord] = useState<{
    total: number;
    open: number;
    resolved: number;
    accuracyPct: number | null;
    brierScore: number | null;
  } | null>(null);



  useEffect(() => {

    fetch("/api/auth/me")

      .then((r) => {

        if (r.ok) setIsAuthenticated(true);

      })

      .catch(() => {})

      .finally(() => setIsLoading(false));



    fetch("/api/public/briefs?limit=4&featured=1")

      .then((r) => (r.ok ? r.json() : null))

      .then((d) => {

        if (d?.featuredVerdict) setFeaturedVerdict(d.featuredVerdict);

        if (d?.briefs?.length) {

          setLatestInquiries(d.briefs.map((b: PublicBrief, i: number) => mapBriefToInquiry(b, i)));

        }

      })

      .catch(() => {});



    fetch("/api/public/track-record")

      .then((r) => (r.ok ? r.json() : null))

      .then((d) => {

        if (d?.stats && d.stats.total > 0) setTrackRecord(d.stats);

      })

      .catch((err) => console.warn("[Home] Track record fetch failed (non-blocking):", err));



    if (searchParams.get("auth") === "required") setShowAuthModal(true);

    const nl = searchParams.get("newsletter");

    if (nl === "confirmed") {

      setNewsletterMessage("Subscription confirmed.");

      setNewsletterStatus("success");

    } else if (nl === "expired") setNewsletterStatus("error");

  }, [searchParams]);



  const openStudio = () => {

    setAuthRedirect("studio");

    setShowAuthModal(true);

  };



  const handleNewsletterSubmit = async (e: React.FormEvent) => {

    e.preventDefault();

    if (!newsletterEmail) return;

    setNewsletterStatus("loading");

    try {

      const res = await fetch("/api/newsletter/subscribe", {

        method: "POST",

        headers: { "Content-Type": "application/json" },

        body: JSON.stringify({ email: newsletterEmail }),

      });

      const data = await res.json();

      if (res.ok) {

        setNewsletterMessage(data.message || "Check your inbox.");

        setNewsletterStatus("success");

      } else {

        setNewsletterMessage(data.error || "Unable to subscribe.");

        setNewsletterStatus("error");

      }

    } catch {

      setNewsletterStatus("error");

    }

  };



  if (isLoading) {

    return (

      <div className="min-h-screen bg-white dark:bg-black flex flex-col items-center justify-center gap-6">

        <NomosXLogo variant="wordmark" size={20} className="opacity-40" />

        <div className="relative w-32 h-px bg-black/10 dark:bg-white/10 overflow-hidden">

          <div className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-black/60 dark:via-white/60 to-transparent animate-marquee" />

        </div>

      </div>

    );

  }



  const displayInquiries = latestInquiries;

  // Ambient proof of life — real activity lines derived from the latest briefs
  const pulseItems = displayInquiries.map((i) =>
    t("InstitutePulse.readingLine", {
      count: i.sourceCount,
      title: i.title.length > 72 ? `${i.title.slice(0, 72)}…` : i.title,
    })
  );

  // Section order: 01 Hero · 02 Featured · [ReadingRoom] · 03 Briefs? · 04 Prism ·
  // 05 Council · 06 Manifesto · 07 Domain · 08 Mission · [Track record] · 09 Studio · 10 Newsletter
  // Briefs is hidden when empty, so the denominator adjusts.
  const hasBriefs = displayInquiries.length > 0;
  const sectionCount = hasBriefs ? 10 : 9;
  const sectionTotal = String(sectionCount).padStart(2, "0");
  const prismSectionNum = hasBriefs ? "04" : "03";
  const councilSectionNum = hasBriefs ? "05" : "04";
  const manifestoSectionNum = hasBriefs ? "06" : "05";
  const domainSectionNum = hasBriefs ? "07" : "06";
  const missionSectionNum = hasBriefs ? "08" : "07";
  const studioSectionNum = hasBriefs ? "09" : "08";
  const newsletterSectionNum = hasBriefs ? "10" : "09";



  return (

    <ErrorBoundary>

      <ManifestoCrawl />

      <PublicPageShell

        currentPage="home"

        onSignInClick={() => setShowAuthModal(true)}

        isAuthenticated={isAuthenticated}

        particles={0}

      >

          {/* Hero — SpaceX-style mission block */}

          <section className="relative px-6 sm:px-8 min-h-[calc(100svh-3.5rem)] flex flex-col items-center justify-center py-16 sm:py-20 overflow-hidden">

            <div className="nx-aurora" aria-hidden="true" />

            <GhostCharField cols={14} rows={7} seed={11} className="opacity-[0.06]" />



            <div className="relative max-w-4xl mx-auto text-center w-full">

              <div className="flex items-center justify-center mb-10 animate-rise">

                <span className="nx-eyebrow">

                  <NomosXLogo variant="symbol" size={12} className="nx-glow-x" />

                  {t("Brand.positioning")}

                </span>

              </div>

              <h1 className="nx-spx-hero mb-8 max-w-4xl mx-auto">

                <WordReveal text={t("Brand.heroTitlePrefix")} baseDelay={300} stagger={140} />{" "}

                <WordReveal text={t("Brand.heroNomos")} baseDelay={720} stagger={140} />

              </h1>

              <p className="text-base sm:text-lg text-[var(--nx-text-secondary)] max-w-2xl mx-auto leading-[1.5] mb-6 animate-rise" style={{ animationDelay: "900ms" }}>

                {t("Brand.description")}

              </p>

              <div className="flex flex-wrap items-start justify-center gap-x-12 gap-y-6 mb-10 animate-rise">

                {([

                  { end: 250, suffix: "M+", label: t("Home.sourcesIndexed") },

                  { end: 850, suffix: "+", label: t("Home.dataProviders") },

                  { end: 22, suffix: "", label: t("Home.specialistResearchers") },

                ] as const).map((stat, i) => (

                  <div key={stat.label} className={`text-center animate-rise delay-${(i + 1) * 100}`} style={{ opacity: 0 }}>

                    <p className="font-mono text-2xl sm:text-3xl font-light text-black dark:text-white tabular-nums leading-none mb-2">

                      <StatCounter end={stat.end} suffix={stat.suffix} />

                    </p>

                    <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-black/50 dark:text-white/50">

                      {stat.label}

                    </p>

                  </div>

                ))}

              </div>

              <div className="flex flex-col sm:flex-row gap-4 justify-center animate-rise" style={{ animationDelay: "1100ms" }}>

                <MagneticButton

                  type="button"

                  onClick={() => router.push(PUBLIC_ROUTES.archives)}

                  className="group nx-cta"

                >

                  {t("Home.browseIntelligence")}

                  <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform" />

                </MagneticButton>

                <MagneticButton

                  type="button"

                  onClick={openStudio}

                  className="group nx-cta-secondary"

                  strength={0.18}

                >

                  {t("Home.commissionBrief")}

                  <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform" />

                </MagneticButton>

              </div>

              {/* Ambient proof of life — the institute is working, right now */}

              <div className="mt-12 animate-rise" style={{ animationDelay: "1400ms" }}>

                <InstitutePulse items={pulseItems} />

              </div>

            </div>

          </section>

          {/* Featured verdict — proof first, philosophy later */}

          <section className="nx-section-divide relative px-6 sm:px-8 py-16 sm:py-20">

            <span className="nx-section-index">02 / {sectionTotal}</span>

            <div className="max-w-lg mx-auto">

              <ScrollReveal>
                <p className="nx-eyebrow mb-8 justify-center">{t("Home.featuredBrief")}</p>
              </ScrollReveal>

              <ScrollReveal delay={100}>
                {isEmptyVerdict(featuredVerdict) ? (
                  <div className="nx-surface nx-border-flow relative p-6 sm:p-8 text-center">
                    <span className="w-1.5 h-1.5 rounded-full bg-black/30 dark:bg-white/30 inline-block mb-4 nx-glow-dot" />
                    <p className="font-display text-lg text-black/80 dark:text-white/80 mb-2">{t("FeaturedVerdict.noPositionYet")}</p>
                    <p className="text-sm text-black/45 dark:text-white/45 leading-relaxed max-w-sm mx-auto">{t("FeaturedVerdict.noPositionDesc")}</p>
                  </div>
                ) : (
                  <FeaturedVerdictCard data={featuredVerdict} />
                )}
              </ScrollReveal>

            </div>

          </section>

          {/* The reading room — sources as credibility, not a spec sheet */}

          <ReadingRoom />

          {/* Latest briefs — more proof, if available */}

          {displayInquiries.length > 0 && (

          <section className="nx-section-divide relative px-6 sm:px-8 py-16 sm:py-20">

            <span className="nx-section-index">03 / {sectionTotal}</span>

            <div className="max-w-6xl mx-auto">

              <ScrollReveal className="flex items-end justify-between gap-4 mb-12">

                <p className="nx-eyebrow">{t("Home.latestBriefs")}</p>

                <button

                  type="button"

                  onClick={() => router.push(PUBLIC_ROUTES.archives)}

                  className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.12em] text-black/55 dark:text-white/55 hover:text-black dark:hover:text-white transition-colors"

                >

                  {t("Home.fullArchive")}

                  <ArrowRight size={14} />

                </button>

              </ScrollReveal>

              <ScrollReveal stagger className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">

                {displayInquiries.map((inquiry, i) => (

                  <InquiryCard

                    key={inquiry.id}

                    inquiry={inquiry}

                    featured={i === 0}

                    className={i === 0 ? "md:col-span-2 lg:col-span-3" : undefined}

                  />

                ))}

              </ScrollReveal>

            </div>

          </section>

          )}

          {/* The prism — one question, nine intellectual traditions */}

          <LensPrism
            question={isEmptyVerdict(featuredVerdict) ? undefined : featuredVerdict.question}
            sectionIndex={`${prismSectionNum} / ${sectionTotal}`}
          />

          {/* The council — the named desks behind the lenses, personified */}
          <CouncilRoster sectionIndex={`${councilSectionNum} / ${sectionTotal}`} />

          {/* Manifesto + pillars — the philosophy, now that they've seen the proof */}

          <section className="nx-section-divide relative px-6 sm:px-8 py-20 sm:py-28 overflow-hidden">

            <GhostCharField cols={10} rows={5} seed={23} drift={false} className="opacity-[0.04]" />

            <span className="nx-section-index">{manifestoSectionNum} / {sectionTotal}</span>

            <div className="relative max-w-4xl mx-auto text-center">

              <ScrollReveal>
                <p className="nx-eyebrow mb-10">{t("Home.thePrinciple")}</p>
              </ScrollReveal>

              <ScrollReveal stagger className="space-y-2">

                <p className="nx-manifesto-line">
                  {t("Home.manifestoLine1")}
                </p>

                <p className="nx-manifesto-line">
                  {t("Home.manifestoLine2")}
                </p>

                <div className="w-40 mx-auto my-8 text-[var(--nx-accent,rgba(255,255,255,0.25))]">
                  <MeanderDivider width={160} />
                </div>

                <p className="nx-manifesto-line nx-manifesto-line--accent">
                  {t("Home.manifestoLine3")}
                </p>

              </ScrollReveal>

              <ScrollReveal stagger delay={200} className="mt-12 space-y-1">

                <p className="nx-manifesto-cascade">
                  {t("Home.manifestoCascade1")}
                </p>

                <p className="nx-manifesto-cascade">
                  {t("Home.manifestoCascade2")}
                </p>

                <p className="nx-manifesto-cascade">
                  {t("Home.manifestoCascade3")}
                </p>

              </ScrollReveal>

              <ScrollReveal delay={400}>
                <p className="nx-manifesto-signoff">
                  {t("Home.manifestoSignoff")}<span className="nx-manifesto-signoff-x">X</span>
                </p>
              </ScrollReveal>

            </div>

            {/* Pillars merged into manifesto — what you get */}

            <div className="relative max-w-5xl mx-auto mt-16">

              <ScrollReveal>
                <p className="nx-eyebrow mb-6 text-center">{t("Home.sixPillars")}</p>
              </ScrollReveal>

              <ScrollReveal stagger className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">

                {[0, 1, 2, 3, 4, 5].map((i) => (

                  <div key={i} className="nx-surface nx-pillar p-5">

                    <p className="font-mono text-[11px] text-black/45 dark:text-white/45 mb-3">0{i + 1}</p>

                    <p className="text-sm text-black/70 dark:text-white/70 leading-[1.5]">{t(`Brand.philosophyPillars.${i}`)}</p>

                  </div>

                ))}

              </ScrollReveal>

            </div>

          </section>

          {/* Domain map — where we work (Harvard "Where we work" inspired) */}

          <DomainMap sectionIndex={`${domainSectionNum} / ${sectionTotal}`} />

          {/* Mission statement */}

          <section className="nx-section-divide relative px-6 sm:px-8 py-16 sm:py-20">

            <span className="nx-section-index">{missionSectionNum} / {sectionTotal}</span>

            <div className="max-w-4xl mx-auto grid sm:grid-cols-2 gap-10 sm:gap-16">

              <ScrollReveal>

                <p className="nx-eyebrow mb-6">{t("Home.theChallenge")}</p>

                <p className="text-lg sm:text-xl text-[var(--nx-text-secondary)] leading-[1.55]">

                  {t("Home.challengeText")}

                </p>

              </ScrollReveal>

              <ScrollReveal delay={120}>

                <p className="nx-eyebrow mb-6">{t("Home.ourAnswer")}</p>

                <p className="text-lg sm:text-xl text-[var(--nx-text-secondary)] leading-[1.55]">

                  {t("Home.answerText")}

                </p>

              </ScrollReveal>

            </div>

          </section>

          {/* Track record — public accountability (always visible; pending state when no data) */}

          <section className="nx-section-divide relative px-6 sm:px-8 py-16 sm:py-20">

            <div className="max-w-4xl mx-auto text-center">

              <ScrollReveal>

                <p className="nx-eyebrow mb-4 justify-center">{t("Home.trackRecord")}</p>

                <h2 className="font-display text-lg sm:text-xl font-medium text-black dark:text-white mb-10 tracking-tight">

                  {t("Home.trackRecordDesc")}

                </h2>

              </ScrollReveal>

              <ScrollReveal stagger className="grid grid-cols-2 sm:grid-cols-4 gap-8 sm:gap-10 mb-10">

                <div className="text-center">

                  <p className="font-mono text-3xl font-light text-black dark:text-white tabular-nums leading-none mb-3">

                    <StatCounter end={trackRecord?.total ?? 0} suffix="" />

                  </p>

                  <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-black/50 dark:text-white/50">{t("Home.predictionsMade")}</p>

                </div>

                <div className="text-center">

                  <p className="font-mono text-3xl font-light text-black dark:text-white tabular-nums leading-none mb-3">

                    <StatCounter end={trackRecord?.open ?? 0} suffix="" />

                  </p>

                  <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-black/50 dark:text-white/50">{t("Home.openPredictions")}</p>

                </div>

                <div className="text-center">

                  <p className="font-mono text-3xl font-light text-black dark:text-white tabular-nums leading-none mb-3">

                    {trackRecord?.accuracyPct != null ? (

                      <StatCounter end={Math.round(trackRecord.accuracyPct)} suffix="%" />

                    ) : (

                      <span className="text-black/40 dark:text-white/40 text-xl">{t("Home.pending")}</span>

                    )}

                  </p>

                  <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-black/50 dark:text-white/50">{t("Home.hitRate")}</p>

                </div>

                <div className="text-center">

                  <p className="font-mono text-3xl font-light text-black dark:text-white tabular-nums leading-none mb-3">

                    {trackRecord?.brierScore != null ? (

                      <span>{trackRecord.brierScore}</span>

                    ) : (

                      <span className="text-black/40 dark:text-white/40 text-xl">{t("Home.pending")}</span>

                    )}

                  </p>

                  <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-black/50 dark:text-white/50">{t("Home.brierScore")}</p>

                </div>

              </ScrollReveal>

              <ScrollReveal>

                <button

                  type="button"

                  onClick={() => router.push(PUBLIC_ROUTES.trackRecord)}

                  className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.12em] text-black/55 dark:text-white/55 hover:text-black dark:hover:text-white transition-colors"

                >

                  {t("Home.fullTrackRecord")}

                  <ArrowRight size={14} />

                </button>

              </ScrollReveal>

            </div>

          </section>



          <StudioPreview

            onGetStarted={openStudio}

            onLearnMore={() => router.push(PUBLIC_ROUTES.pricing)}

            sectionIndex={`${studioSectionNum} / ${sectionTotal}`}

          />



          {/* Newsletter */}

          <section id="newsletter" className="nx-section-divide relative px-6 sm:px-8 py-16">

            <span className="nx-section-index">{newsletterSectionNum} / {sectionTotal}</span>

            <div className="max-w-md mx-auto text-center">

              <ScrollReveal>

                <h2 className="font-display text-lg sm:text-xl font-medium text-black dark:text-white mb-3 tracking-tight">{t("Home.intelligenceDispatch")}</h2>

                <p className="nx-eyebrow mb-8 justify-center">{t("Home.structureNotNoise")}</p>

              </ScrollReveal>

              {newsletterStatus === "success" ? (

                <p className="text-sm text-black/70 dark:text-white/70">{newsletterMessage}</p>

              ) : (

                <form onSubmit={handleNewsletterSubmit} className="flex flex-col sm:flex-row gap-2">

                  <input

                    type="email"

                    value={newsletterEmail}

                    onChange={(e) => setNewsletterEmail(e.target.value)}

                    placeholder="analyst@institution.org"

                    required

                    className="nx-input flex-1 px-4 py-3 bg-black/[0.02] dark:bg-white/[0.02] border border-black/[0.12] dark:border-white/[0.12] text-sm text-black dark:text-white placeholder:text-black/40 dark:placeholder:text-white/40 focus:outline-none focus:border-black/30 dark:focus:border-white/30 transition-all"

                  />

                  <button

                    type="submit"

                    disabled={newsletterStatus === "loading"}

                    className="px-6 py-3 bg-black dark:bg-white text-white dark:text-black text-xs font-semibold uppercase tracking-[0.12em] disabled:opacity-50 hover:bg-black/85 dark:hover:bg-white/85 transition-colors"

                  >

                    {t("Home.newsletterButton")}

                  </button>

                </form>

              )}

            </div>

          </section>

      </PublicPageShell>



      {showAuthModal && (

        <AuthModal

          isOpen={showAuthModal}

          onClose={() => setShowAuthModal(false)}

          onSignupSuccess={() => {

            setIsAuthenticated(true);

            setShowAuthModal(false);

            router.push(authRedirect === "studio" ? PUBLIC_ROUTES.studio : "/archives");

          }}

        />

      )}

    </ErrorBoundary>

  );

}



export default function HomePage() {

  return (

    <Suspense

      fallback={

        <div className="min-h-screen bg-white dark:bg-black flex flex-col items-center justify-center gap-6">

          <NomosXLogo variant="wordmark" size={20} className="opacity-40" />

          <div className="relative w-32 h-px bg-black/10 dark:bg-white/10 overflow-hidden">

            <div className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-black/60 dark:via-white/60 to-transparent animate-marquee" />

          </div>

        </div>

      }

    >

      <HomePageContent />

    </Suspense>

  );

}







