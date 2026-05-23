"use client";



import React, { useEffect, useState, Suspense } from "react";

import { useRouter, useSearchParams } from "next/navigation";

import AuthModal from "@/components/AuthModal";

import { PublicPageShell } from "@/components/layout/PublicPageShell";

import {

  FeaturedVerdictCard,

  InquiryCard,

  PipelineStrip,

  PolicyNetwork,

  StudioPreview,

  type FeaturedVerdictData,

  type InquiryCardData,

  type InquiryWatermark,

} from "@/components/signature";

import { ErrorBoundary } from "@/components/ErrorBoundary";

import { PUBLIC_ROUTES } from "@/lib/public-urls";

import { ArrowRight, Rss } from "lucide-react";



const FEATURED_VERDICT: FeaturedVerdictData = {

  question: "Will sovereign AI infrastructure reshape European policy?",

  verdictPrefix: "Yes",

  verdictBody: "consolidation is likely around sovereign infrastructure models.",

  confidence: "74%",

  simulation: "1024+ swarm · 30 voix LLM",

  sources: 42,

  objections: 3,

  updatedAt: "MAY 18, 2026",

  serialId: "NX-2026-0518-01",

  sparkline: [52, 58, 61, 68, 72, 74, 73, 74],

};



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



    fetch("/api/public/briefs?limit=3")

      .then((r) => (r.ok ? r.json() : null))

      .then((d) => {

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

      <div className="min-h-screen bg-bg flex items-center justify-center">

        <div className="w-8 h-8 border border-white/20 border-t-accent rounded-full animate-spin" />

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

        particles={22}

      >

          {/* Hero */}

          <section className="relative px-6 sm:px-8 pt-16 sm:pt-24 pb-16 sm:pb-24">

            <div className="max-w-6xl mx-auto relative">

              <PolicyNetwork className="top-0 h-[420px] sm:h-[480px]" />

              <div className="relative grid lg:grid-cols-[1fr_minmax(300px,400px)] gap-10 lg:gap-14 items-center">

                <div className="animate-rise pt-4 lg:pt-8">

                  <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-accent mb-6">

                    Autonomous · Independent · Evidence-first

                  </p>

                  <h1 className="font-display text-4xl sm:text-5xl lg:text-[3.15rem] font-semibold leading-[1.08] tracking-tight mb-6">

                    The autonomous think tank for{" "}

                    <span className="text-accent">probable futures.</span>

                  </h1>

                  <p className="text-base text-white/50 max-w-lg leading-relaxed mb-10">

                    NomosX publishes AI-generated inquiries with probabilistic verdicts,

                    multi-agent simulation, and full source traceability — no editorial agenda.

                  </p>

                  <div className="flex flex-col sm:flex-row gap-3">

                    <button

                      type="button"

                      onClick={() => router.push(PUBLIC_ROUTES.archives)}

                      className="group inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl bg-accent hover:brightness-110 text-bg text-sm font-semibold transition-colors"

                    >

                      Read latest inquiries

                      <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform" />

                    </button>

                    <button

                      type="button"

                      onClick={openStudio}

                      className="group inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl border border-white/[0.12] bg-bg-elevated/50 text-white/65 text-sm font-medium hover:border-accent/30 hover:text-white transition-colors"

                    >

                      Enter Studio

                      <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform" />

                    </button>

                  </div>

                </div>

                <FeaturedVerdictCard data={FEATURED_VERDICT} className="relative z-[2]" />

              </div>

            </div>

          </section>



          <PipelineStrip />



          {/* Latest inquiries */}

          <section className="px-6 sm:px-8 py-20 sm:py-24">

            <div className="max-w-6xl mx-auto">

              <div className="flex items-end justify-between gap-4 mb-10">

                <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-accent/80 flex items-center gap-2">

                  <span className="w-1.5 h-1.5 rounded-full bg-accent" />

                  Latest inquiries

                </p>

                <button

                  type="button"

                  onClick={() => router.push(PUBLIC_ROUTES.archives)}

                  className="inline-flex items-center gap-2 text-sm font-mono text-accent/80 hover:text-accent"

                >

                  View all inquiries

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

          <section className="px-6 sm:px-8 py-16 border-t border-white/[0.05]">

            <div className="max-w-md mx-auto text-center">

              <Rss className="w-4 h-4 text-accent/60 mx-auto mb-3" strokeWidth={1.25} />

              <h2 className="font-display text-lg font-semibold mb-2">Weekly dispatch</h2>

              <p className="text-xs text-white/40 mb-6">What survived verification — delivered weekly.</p>

              {newsletterStatus === "success" ? (

                <p className="text-sm text-white/55">{newsletterMessage}</p>

              ) : (

                <form onSubmit={handleNewsletterSubmit} className="flex flex-col sm:flex-row gap-2">

                  <input

                    type="email"

                    value={newsletterEmail}

                    onChange={(e) => setNewsletterEmail(e.target.value)}

                    placeholder="your@institution.edu"

                    required

                    className="flex-1 px-4 py-2.5 rounded-xl bg-bg-elevated border border-white/[0.08] text-sm focus:outline-none focus:border-accent/30"

                  />

                  <button

                    type="submit"

                    disabled={newsletterStatus === "loading"}

                    className="px-5 py-2.5 rounded-xl bg-accent text-bg text-sm font-semibold disabled:opacity-50"

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

            router.push(authRedirect === "studio" ? PUBLIC_ROUTES.studio : "/dashboard");

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

        <div className="min-h-screen bg-bg flex items-center justify-center">

          <div className="w-8 h-8 border border-white/20 border-t-accent rounded-full animate-spin" />

        </div>

      }

    >

      <HomePageContent />

    </Suspense>

  );

}


