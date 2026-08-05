"use client";



import React, { useEffect, useState, Suspense } from "react";

import { useRouter, useSearchParams } from "next/navigation";

import AuthModal from "@/components/AuthModal";

import { PublicPageShell } from "@/components/layout/PublicPageShell";

import {

  FeaturedVerdictCard,

  InquiryCard,

  PipelineStrip,

  StudioPreview,

  type FeaturedVerdictData,

  type InquiryCardData,

  type InquiryWatermark,

} from "@/components/signature";

import { FALLBACK_FEATURED_VERDICT } from "@/lib/brand/featured-verdict";
import {
  BRAND_DESCRIPTION,
  BRAND_HERO_TITLE,
  BRAND_MANIFESTO,
  NOMOS_PHILOSOPHY_PILLARS,
} from "@/lib/brand/public-copy";

import { ErrorBoundary } from "@/components/ErrorBoundary";

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

};



const WATERMARKS: InquiryWatermark[] = ["map", "chart", "globe"];



const DATA_SOURCES: { id: string; name: string; desc: string }[] = [
  { id: "openalex", name: "OpenAlex", desc: "250M+ scholarly works" },
  { id: "crossref", name: "Crossref", desc: "DOI registry" },
  { id: "pubmed", name: "PubMed", desc: "biomedical literature" },
  { id: "arxiv", name: "arXiv", desc: "preprints · physics & CS" },
  { id: "ssrn", name: "SSRN", desc: "social science research" },
  { id: "reuters", name: "Reuters", desc: "real-time wire" },
  { id: "crunchbase", name: "Crunchbase", desc: "market intelligence" },
  { id: "worldbank", name: "World Bank", desc: "open data" },
  { id: "imf", name: "IMF", desc: "macroeconomic indicators" },
  { id: "oecd", name: "OECD", desc: "policy statistics" },
  { id: "nato", name: "NATO", desc: "strategic reports" },
  { id: "rand", name: "RAND", desc: "defense analysis" },
  { id: "brookings", name: "Brookings", desc: "policy research" },
  { id: "cia-foia", name: "CIA FOIA", desc: "declassified archives" },
  { id: "nara", name: "NARA", desc: "national archives" },
  { id: "google-patents", name: "Google Patents", desc: "IP landscape" },
];



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

  };

}







function HomePageContent() {

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



  useEffect(() => {

    fetch("/api/auth/me")

      .then((r) => {

        if (r.ok) setIsAuthenticated(true);

      })

      .catch(() => {})

      .finally(() => setIsLoading(false));



    fetch("/api/public/briefs?limit=3&featured=1")

      .then((r) => (r.ok ? r.json() : null))

      .then((d) => {

        if (d?.featuredVerdict) setFeaturedVerdict(d.featuredVerdict);

        if (d?.briefs?.length) {

          setLatestInquiries(d.briefs.map((b: PublicBrief, i: number) => mapBriefToInquiry(b, i)));

        }

      })

      .catch(() => {});



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

      <div className="min-h-screen bg-black flex flex-col items-center justify-center gap-6">

        <NomosXLogo variant="wordmark" size={20} className="opacity-40" />

        <div className="relative w-32 h-px bg-white/10 overflow-hidden">

          <div className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/60 to-transparent animate-marquee" />

        </div>

      </div>

    );

  }



  const displayInquiries = latestInquiries;

  // Total section count is dynamic: the "Latest briefs" section (05) is
  // hidden when there are no briefs, so the denominator must adjust.
  const sectionCount = displayInquiries.length > 0 ? 8 : 7;
  const sectionTotal = String(sectionCount).padStart(2, "0");
  // Sections after the briefs block shift down by one when briefs are hidden
  // so the numerators stay sequential (01, 02, 03 ...).
  const studioSectionNum = displayInquiries.length > 0 ? "07" : "06";
  const newsletterSectionNum = displayInquiries.length > 0 ? "08" : "07";



  return (

    <ErrorBoundary>

      <PublicPageShell

        currentPage="home"

        onSignInClick={() => setShowAuthModal(true)}

        isAuthenticated={isAuthenticated}

        particles={0}

      >

          {/* Hero — SpaceX-style mission block */}

          <section className="relative px-6 sm:px-8 min-h-[calc(100svh-3.5rem)] flex flex-col items-center justify-center py-16 sm:py-20 overflow-hidden">

            <div className="nx-grid-bg-enhanced nx-grid-bg-animated" aria-hidden="true" />

            <div className="nx-aurora" aria-hidden="true" />

            <div className="relative max-w-4xl mx-auto text-center w-full">

              <div className="flex items-center justify-center mb-10 animate-rise">

                <span className="nx-eyebrow">

                  <span className="w-1.5 h-1.5 rounded-full bg-white/80 nx-glow-dot" />

                  The think tank, always on

                </span>

              </div>

              <h1 className="nx-spx-hero mb-8 max-w-4xl mx-auto">

                <WordReveal text={BRAND_HERO_TITLE} baseDelay={300} stagger={140} />

              </h1>

              <p className="text-base sm:text-lg text-[var(--nx-text-secondary)] max-w-2xl mx-auto leading-[1.5] mb-6 animate-rise" style={{ animationDelay: "900ms" }}>

                {BRAND_DESCRIPTION}

              </p>

              <div className="flex flex-wrap items-start justify-center gap-x-12 gap-y-6 mb-10 animate-rise">

                {([

                  { end: 250, suffix: "M+", label: "Sources indexed" },

                  { end: 48, suffix: "", label: "Data providers" },

                  { end: 100, suffix: "%", label: "Claims traceable" },

                ] as const).map((stat, i) => (

                  <div key={stat.label} className={`text-center animate-rise delay-${(i + 1) * 100}`} style={{ opacity: 0 }}>

                    <p className="font-mono text-2xl sm:text-3xl font-light text-white tabular-nums leading-none mb-2">

                      <StatCounter end={stat.end} suffix={stat.suffix} />

                    </p>

                    <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-white/50">

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

                  Browse intelligence

                  <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform" />

                </MagneticButton>

                <MagneticButton

                  type="button"

                  onClick={openStudio}

                  className="group nx-cta-secondary"

                  strength={0.18}

                >

                  Commission a brief

                  <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform" />

                </MagneticButton>

              </div>

            </div>

          </section>

          {/* Manifesto — the Nomos philosophy */}

          <section className="nx-section-divide relative px-6 sm:px-8 py-16 sm:py-20">

            <span className="nx-section-index">01 / {sectionTotal}</span>

            <div className="max-w-3xl mx-auto text-center">

              <ScrollReveal>
                <p className="nx-eyebrow mb-8">The principle</p>
              </ScrollReveal>

              <ScrollReveal stagger className="space-y-6">

                <p className="text-lg sm:text-xl text-white/85 leading-[1.4] font-light">

                  The world doesn't suffer from a lack of information.

                </p>

                <p className="text-lg sm:text-xl text-white/85 leading-[1.4] font-light">

                  It suffers from a lack of structure.

                </p>

                <div className="nx-divider w-12 mx-auto my-6" />

                <p className="text-base sm:text-lg text-white/65 leading-[1.6]">

                  Knowledge without order creates noise.

                </p>

                <p className="text-base sm:text-lg text-white/65 leading-[1.6]">

                  Order creates understanding.

                </p>

                <p className="text-base sm:text-lg text-white/65 leading-[1.6]">

                  Understanding creates better decisions.

                </p>

                <p className="text-sm font-mono uppercase tracking-[0.2em] text-white/55 pt-6">

                  That is NomosX.

                </p>

              </ScrollReveal>

            </div>

          </section>

          {/* Six pillars */}

          <section className="nx-section-divide relative px-6 sm:px-8 py-16 sm:py-20">

            <span className="nx-section-index">02 / {sectionTotal}</span>

            <div className="max-w-5xl mx-auto">

              <ScrollReveal>
                <p className="nx-eyebrow mb-6 text-center">Six editorial pillars</p>
              </ScrollReveal>

              <ScrollReveal stagger className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">

                {NOMOS_PHILOSOPHY_PILLARS.map((pillar, i) => (

                  <div key={pillar} className="nx-surface nx-pillar p-5">

                    <p className="font-mono text-[11px] text-white/45 mb-3">0{i + 1}</p>

                    <p className="text-sm text-white/70 leading-[1.5]">{pillar}</p>

                  </div>

                ))}

              </ScrollReveal>

            </div>

          </section>

          {/* Data sources ticker */}

          <div className="border-y border-white/[0.08] bg-white/[0.01]">

            <div className="flex items-stretch">

              <span className="shrink-0 flex items-center gap-2 px-5 py-3 border-r border-white/[0.08] font-mono text-[9px] uppercase tracking-[0.2em] text-white/55 bg-black">

                <span className="w-1 h-1 rounded-full bg-white/80 nx-glow-dot" />

                Data sources

              </span>

              <div className="nx-marquee-pause flex-1 overflow-hidden">

                <div className="flex whitespace-nowrap animate-marquee-slow py-3">

                  {[...DATA_SOURCES, ...DATA_SOURCES].map((src, i) => (

                    <span

                      key={`${src.id}-${i}`}

                      className="flex items-center font-mono text-[11px] uppercase tracking-[0.12em] text-white/40 px-5"

                    >

                      <span className="text-white/50 mr-2.5 text-[10px]">●</span>

                      <span className="text-white/65">{src.name}</span>

                      <span className="ml-2 text-white/45 normal-case tracking-normal text-[11px]">{src.desc}</span>

                    </span>

                  ))}

                </div>

              </div>

            </div>

          </div>

          {/* Mission statement */}

          <section className="nx-section-divide relative px-6 sm:px-8 py-16 sm:py-20">

            <span className="nx-section-index">03 / {sectionTotal}</span>

            <div className="max-w-4xl mx-auto grid sm:grid-cols-2 gap-10 sm:gap-16">

              <ScrollReveal>

                <p className="nx-eyebrow mb-6">The challenge</p>

                <p className="text-lg sm:text-xl text-[var(--nx-text-secondary)] leading-[1.55]">

                  Strategic decisions are still made on single forecasts, opaque sources, and borrowed convictions.

                </p>

              </ScrollReveal>

              <ScrollReveal delay={120}>

                <p className="nx-eyebrow mb-6">Our answer</p>

                <p className="text-lg sm:text-xl text-[var(--nx-text-secondary)] leading-[1.55]">

                  An institute that maps the evidence, confronts every assumption, and publishes positions anyone can verify — as a public good.

                </p>

              </ScrollReveal>

            </div>

          </section>

          {/* Live verdict proof */}

          <section className="nx-section-divide relative px-6 sm:px-8 py-16 sm:py-20">

            <span className="nx-section-index">04 / {sectionTotal}</span>

            <div className="max-w-lg mx-auto">

              <ScrollReveal>
                <p className="nx-eyebrow mb-8 justify-center">Featured brief</p>
              </ScrollReveal>

              <ScrollReveal delay={100}>
                <FeaturedVerdictCard data={featuredVerdict} />
              </ScrollReveal>

            </div>

          </section>



          <PipelineStrip />



          {/* Latest briefs */}

          {displayInquiries.length > 0 && (

          <section className="nx-section-divide relative px-6 sm:px-8 py-16 sm:py-20">

            <span className="nx-section-index">05 / {sectionTotal}</span>

            <div className="max-w-6xl mx-auto">

              <ScrollReveal className="flex items-end justify-between gap-4 mb-12">

                <p className="nx-eyebrow">Latest briefs</p>

                <button

                  type="button"

                  onClick={() => router.push(PUBLIC_ROUTES.archives)}

                  className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.12em] text-white/55 hover:text-white transition-colors"

                >

                  Full archive

                  <ArrowRight size={14} />

                </button>

              </ScrollReveal>

              <ScrollReveal stagger className="grid md:grid-cols-3 gap-4">

                {displayInquiries.map((inquiry) => (

                  <InquiryCard

                    key={inquiry.id}

                    inquiry={inquiry}

                  />

                ))}

              </ScrollReveal>

            </div>

          </section>

          )}



          {/* Social proof */}

          <section className="nx-section-divide relative px-6 sm:px-8 py-16 sm:py-20">

            <div className="max-w-4xl mx-auto text-center">

              <ScrollReveal>

                <p className="nx-eyebrow mb-10 justify-center">Built for those who need to be right</p>

              </ScrollReveal>

              <ScrollReveal stagger className="grid sm:grid-cols-3 gap-8 sm:gap-12">

                <div className="text-center">

                  <p className="font-mono text-3xl font-light text-white tabular-nums leading-none mb-3">

                    <StatCounter end={19} suffix="" />

                  </p>

                  <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-white/50">

                    Pipeline stages

                  </p>

                  <p className="text-xs text-white/40 mt-2 leading-relaxed">

                    Scout to publisher — every claim traceable

                  </p>

                </div>

                <div className="text-center">

                  <p className="font-mono text-3xl font-light text-white tabular-nums leading-none mb-3">

                    <StatCounter end={6} suffix="" />

                  </p>

                  <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-white/50">

                    Adversarial reviews

                  </p>

                  <p className="text-xs text-white/40 mt-2 leading-relaxed">

                    Harvard Council, Devil's Advocate, Elenchus

                  </p>

                </div>

                <div className="text-center">

                  <p className="font-mono text-3xl font-light text-white tabular-nums leading-none mb-3">

                    <StatCounter end={100} suffix="%" />

                  </p>

                  <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-white/50">

                    Source-grounded

                  </p>

                  <p className="text-xs text-white/40 mt-2 leading-relaxed">

                    No claim without a verifiable citation

                  </p>

                </div>

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

                <h2 className="font-display text-lg sm:text-xl font-medium text-white mb-3 tracking-tight">Intelligence dispatch</h2>

                <p className="nx-eyebrow mb-8 justify-center">Structure, not noise. Delivered.</p>

              </ScrollReveal>

              {newsletterStatus === "success" ? (

                <p className="text-sm text-white/70">{newsletterMessage}</p>

              ) : (

                <form onSubmit={handleNewsletterSubmit} className="flex flex-col sm:flex-row gap-2">

                  <input

                    type="email"

                    value={newsletterEmail}

                    onChange={(e) => setNewsletterEmail(e.target.value)}

                    placeholder="analyst@institution.org"

                    required

                    className="nx-input flex-1 px-4 py-3 bg-white/[0.04] border border-white/[0.12] text-sm text-white focus:outline-none focus:border-white/30 transition-all"

                  />

                  <button

                    type="submit"

                    disabled={newsletterStatus === "loading"}

                    className="px-6 py-3 bg-white text-black text-xs font-semibold uppercase tracking-[0.12em] disabled:opacity-50 hover:bg-white/90 transition-colors"

                  >

                    Subscribe

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

        <div className="min-h-screen bg-black flex flex-col items-center justify-center gap-6">

          <NomosXLogo variant="wordmark" size={20} className="opacity-40" />

          <div className="relative w-32 h-px bg-white/10 overflow-hidden">

            <div className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/60 to-transparent animate-marquee" />

          </div>

        </div>

      }

    >

      <HomePageContent />

    </Suspense>

  );

}




