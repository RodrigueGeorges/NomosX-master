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
  BRAND_HERO_SUBTITLE,
  BRAND_HERO_TITLE,
  BRAND_MANIFESTO,
  NOMOS_PHILOSOPHY_PILLARS,
} from "@/lib/brand/public-copy";

import { ErrorBoundary } from "@/components/ErrorBoundary";

import { PUBLIC_ROUTES } from "@/lib/public-urls";

import { ArrowRight } from "lucide-react";



type PublicBrief = {

  id: string;

  title: string;

  summary: string;

  type: string;

  publishedAt: string;

  readTime: number;

  sources: number;

  topics: string[];

  trustScore?: number | null;

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

  };

}



const FALLBACK_INQUIRIES: InquiryCardData[] = [

  {

    id: "f1",

    slug: "f1",

    title: "Will sovereign AI infrastructure reshape European policy?",

    summary: "Regulatory momentum and compute sovereignty targets converge before 2028.",

    domain: "TECHNOLOGY",

    watermark: "map",

    verdict: { value: "74%", label: "Confidence" },

    sourceCount: 42,

    publishedAt: new Date().toISOString(),

    readTime: 8,

  },

  {

    id: "f2",

    slug: "f2",

    title: "Can border carbon adjustments prevent industrial leakage?",

    summary: "Evidence suggests partial mitigation when paired with revenue recycling.",

    domain: "CLIMATE",

    watermark: "chart",

    verdict: { value: "61%", label: "Confidence" },

    sourceCount: 38,

    publishedAt: new Date(Date.now() - 86400000 * 3).toISOString(),

    readTime: 6,

  },

  {

    id: "f3",

    slug: "f3",

    title: "Will labor markets absorb AI displacement by 2030?",

    summary: "Sectoral reallocation lags in high-inequality economies without active policy.",

    domain: "SOCIETY",

    watermark: "globe",

    verdict: { value: "52%", label: "Confidence" },

    sourceCount: 31,

    publishedAt: new Date(Date.now() - 86400000 * 7).toISOString(),

    readTime: 5,

  },

];



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

      <div className="min-h-screen bg-black flex items-center justify-center">

        <div className="w-8 h-8 border border-white/20 border-t-white rounded-full animate-spin" />

      </div>

    );

  }



  const displayInquiries = latestInquiries.length > 0 ? latestInquiries : FALLBACK_INQUIRIES;



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

            <div className="nx-grid-bg nx-grid-bg-animated" aria-hidden="true" />

            <div className="nx-horizon-glow" aria-hidden="true" />

            <div className="relative max-w-4xl mx-auto text-center w-full">

              <div className="flex items-center justify-center mb-10 animate-rise">

                <span className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-white/35">

                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/70 animate-pulse" />

                  The think tank, always on

                </span>

              </div>

              <h1 className="nx-spx-hero mb-8 animate-rise max-w-4xl mx-auto">

                {BRAND_HERO_TITLE}

              </h1>

              <p className="text-base sm:text-lg text-[var(--nx-text-secondary)] max-w-2xl mx-auto leading-[1.5] mb-6 animate-rise">

                {BRAND_HERO_SUBTITLE}

              </p>

              <div className="flex flex-wrap items-start justify-center gap-x-12 gap-y-6 mb-14 animate-rise">

                {[

                  { value: "250M+", label: "Sources indexed" },

                  { value: "24/7", label: "Continuous operation" },

                  { value: "100%", label: "Claims traceable" },

                ].map((stat, i) => (

                  <div key={stat.label} className={`text-center animate-rise delay-${(i + 1) * 100}`} style={{ opacity: 0 }}>

                    <p className="font-mono text-2xl sm:text-3xl font-light text-white tabular-nums leading-none mb-2">

                      {stat.value}

                    </p>

                    <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-white/30">

                      {stat.label}

                    </p>

                  </div>

                ))}

              </div>

              <div className="flex flex-col sm:flex-row gap-4 justify-center animate-rise">

                <button

                  type="button"

                  onClick={() => router.push(PUBLIC_ROUTES.archives)}

                  className="group nx-spx-cta"

                >

                  Browse intelligence

                  <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform" />

                </button>

                <button

                  type="button"

                  onClick={openStudio}

                  className="group nx-public-btn-secondary"

                >

                  Commission an inquiry

                  <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform" />

                </button>

              </div>

            </div>

          </section>

          {/* Manifesto — the Nomos philosophy */}

          <section className="px-6 sm:px-8 py-24 sm:py-32 border-b border-white/[0.06]">

            <div className="max-w-3xl mx-auto text-center">

              <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-white/30 mb-8">The principle</p>

              <div className="space-y-6">

                <p className="text-xl sm:text-2xl text-white/80 leading-[1.4] font-light">

                  The world doesn't suffer from a lack of information.

                </p>

                <p className="text-xl sm:text-2xl text-white/80 leading-[1.4] font-light">

                  It suffers from a lack of structure.

                </p>

                <div className="h-px w-12 bg-white/15 mx-auto my-8" />

                <p className="text-base sm:text-lg text-white/50 leading-[1.6]">

                  Knowledge without order creates noise.

                </p>

                <p className="text-base sm:text-lg text-white/50 leading-[1.6]">

                  Order creates understanding.

                </p>

                <p className="text-base sm:text-lg text-white/50 leading-[1.6]">

                  Understanding creates better decisions.

                </p>

                <p className="text-sm font-mono uppercase tracking-[0.2em] text-white/35 pt-6">

                  That is NomosX.

                </p>

              </div>

            </div>

          </section>

          {/* Six pillars */}

          <section className="px-6 sm:px-8 py-20 sm:py-24 border-b border-white/[0.06]">

            <div className="max-w-5xl mx-auto">

              <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-white/30 mb-12 text-center">Six editorial pillars</p>

              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">

                {NOMOS_PHILOSOPHY_PILLARS.map((pillar, i) => (

                  <div key={pillar} className="border border-white/[0.06] p-5 hover:border-white/[0.14] transition-colors">

                    <p className="font-mono text-[9px] text-white/25 mb-3">0{i + 1}</p>

                    <p className="text-sm text-white/60 leading-[1.5]">{pillar}</p>

                  </div>

                ))}

              </div>

            </div>

          </section>

          {/* Live positions ticker */}

          <div className="border-y border-white/[0.06] bg-white/[0.01] overflow-hidden" aria-hidden="true">

            <div className="flex items-center">

              <span className="shrink-0 flex items-center gap-2 px-5 py-3 border-r border-white/[0.06] font-mono text-[9px] uppercase tracking-[0.2em] text-white/35 bg-black">

                <span className="w-1 h-1 rounded-full bg-emerald-400/70 animate-pulse" />

                Latest positions

              </span>

              <div className="flex whitespace-nowrap animate-marquee-slow">

                {[...displayInquiries, ...displayInquiries].map((inq, i) => (

                  <span key={`${inq.id}-${i}`} className="flex items-center font-mono text-[10px] uppercase tracking-[0.14em] text-white/30 py-3">

                    <span className="px-6 text-white/15">///</span>

                    <span className="text-white/45">{inq.domain}</span>

                    <span className="px-2 text-white/20">—</span>

                    {inq.title}

                    {inq.verdict && (

                      <span className="ml-2 text-emerald-400/50">{inq.verdict.value}</span>

                    )}

                  </span>

                ))}

              </div>

            </div>

          </div>

          {/* Mission statement */}

          <section className="nx-public-section px-6 sm:px-8">

            <div className="max-w-4xl mx-auto grid sm:grid-cols-2 gap-10 sm:gap-16">

              <div>

                <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-white/30 mb-5">The challenge</p>

                <p className="text-lg sm:text-xl text-[var(--nx-text-secondary)] leading-[1.55]">

                  Strategic decisions are still made on single forecasts, opaque sources, and borrowed convictions.

                </p>

              </div>

              <div>

                <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-white/30 mb-5">Our answer</p>

                <p className="text-lg sm:text-xl text-[var(--nx-text-secondary)] leading-[1.55]">

                  An institute that maps the evidence, confronts every assumption, and publishes positions anyone can verify — as a public good.

                </p>

              </div>

            </div>

          </section>

          {/* Live verdict proof */}

          <section className="px-6 sm:px-8 py-20 sm:py-28 border-t border-white/[0.08]">

            <div className="max-w-lg mx-auto">

              <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-white/30 mb-8 text-center">Latest position</p>

              <FeaturedVerdictCard data={featuredVerdict} />

            </div>

          </section>



          <PipelineStrip />



          {/* Latest inquiries */}

          <section className="px-6 sm:px-8 py-24 sm:py-32 border-t border-white/[0.08]">

            <div className="max-w-6xl mx-auto">

              <div className="flex items-end justify-between gap-4 mb-12">

                <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-white/35">

                  Active intelligence

                </p>

                <button

                  type="button"

                  onClick={() => router.push(PUBLIC_ROUTES.archives)}

                  className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-white/40 hover:text-white transition-colors"

                >

                  Full archive

                  <ArrowRight size={14} />

                </button>

              </div>

              <div className="grid md:grid-cols-3 gap-4">

                {displayInquiries.map((inquiry) => (

                  <InquiryCard

                    key={inquiry.id}

                    inquiry={inquiry}

                    {...(inquiry.slug.startsWith("f")

                      ? { href: PUBLIC_ROUTES.archives }

                      : {})}

                  />

                ))}

              </div>

            </div>

          </section>



          <StudioPreview

            onGetStarted={openStudio}

            onLearnMore={() => router.push(PUBLIC_ROUTES.pricing)}

          />



          {/* Newsletter */}

          <section id="newsletter" className="px-6 sm:px-8 py-24 border-t border-white/[0.08]">

            <div className="max-w-md mx-auto text-center">

              <h2 className="font-display text-xl sm:text-2xl font-semibold text-white mb-3 tracking-tight">Intelligence dispatch</h2>

              <p className="text-xs text-white/35 mb-8 font-mono uppercase tracking-[0.14em]">Structure, not noise. Delivered.</p>

              {newsletterStatus === "success" ? (

                <p className="text-sm text-white/55">{newsletterMessage}</p>

              ) : (

                <form onSubmit={handleNewsletterSubmit} className="flex flex-col sm:flex-row gap-2">

                  <input

                    type="email"

                    value={newsletterEmail}

                    onChange={(e) => setNewsletterEmail(e.target.value)}

                    placeholder="analyst@institution.org"

                    required

                    className="flex-1 px-4 py-3 bg-white/[0.04] border border-white/[0.12] text-sm text-white focus:outline-none focus:border-white/30"

                  />

                  <button

                    type="submit"

                    disabled={newsletterStatus === "loading"}

                    className="px-6 py-3 bg-white text-black text-[11px] font-semibold uppercase tracking-[0.14em] disabled:opacity-50 hover:bg-white/90 transition-colors"

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

        <div className="min-h-screen bg-black flex items-center justify-center">

          <div className="w-8 h-8 border border-white/20 border-t-white rounded-full animate-spin" />

        </div>

      }

    >

      <HomePageContent />

    </Suspense>

  );

}


