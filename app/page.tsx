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

import { ErrorBoundary } from "@/components/ErrorBoundary";

import { PUBLIC_ROUTES } from "@/lib/public-urls";

import { ArrowRight } from "lucide-react";



const FEATURED_VERDICT: FeaturedVerdictData = {

  question: "Will sovereign AI infrastructure reshape European policy?",

  verdictPrefix: "Yes",

  verdictBody: "consolidation is likely around sovereign infrastructure models.",

  confidence: "74%",

  simulation: "3 trajectories · 1024 runs",

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

          <section className="relative px-6 sm:px-8 min-h-[calc(100svh-3.5rem)] flex flex-col items-center justify-center py-16 sm:py-20">

            <div className="max-w-4xl mx-auto text-center w-full">

              <p className="font-mono text-[10px] uppercase tracking-[0.32em] text-white/30 mb-10 animate-rise">

                Agentic · Independent · Prospective

              </p>

              <h1 className="font-display text-[2.75rem] sm:text-5xl lg:text-[5rem] font-semibold leading-[1.02] tracking-[-0.03em] text-white mb-8 animate-rise">

                Pushing strategic analysis forward.

              </h1>

              <p className="text-lg sm:text-xl text-white/50 max-w-2xl mx-auto leading-relaxed mb-6 animate-rise">

                The agentic think tank for probable futures.

              </p>

              <p className="text-sm text-white/30 max-w-lg mx-auto leading-relaxed mb-14 animate-rise">

                Cross-domain mapping · probabilistic distributions · institute positions · full traceability

              </p>

              <div className="flex flex-col sm:flex-row gap-4 justify-center animate-rise">

                <button

                  type="button"

                  onClick={() => router.push(PUBLIC_ROUTES.archives)}

                  className="group inline-flex items-center justify-center gap-2 px-10 py-4 bg-white hover:bg-white/90 text-black text-[11px] font-semibold uppercase tracking-[0.18em] transition-colors"

                >

                  Explore

                  <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform" />

                </button>

                <button

                  type="button"

                  onClick={openStudio}

                  className="group inline-flex items-center justify-center gap-2 px-10 py-4 border border-white/30 bg-transparent text-white/80 text-[11px] font-medium uppercase tracking-[0.18em] hover:border-white/60 hover:text-white transition-colors"

                >

                  Launch study

                  <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform" />

                </button>

              </div>

            </div>

          </section>



          {/* Mission statement */}

          <section className="px-6 sm:px-8 py-24 sm:py-32 border-t border-white/[0.08]">

            <div className="max-w-3xl mx-auto text-center">

              <p className="font-display text-2xl sm:text-3xl lg:text-[2.25rem] font-light text-white/75 leading-[1.35] tracking-[-0.02em]">

                NomosX believes strategic decisions grounded in a distribution of probable futures —

                not a frozen state of the art — change how institutions anticipate the world.

              </p>

            </div>

          </section>



          {/* Live verdict proof */}

          <section className="px-6 sm:px-8 py-20 sm:py-28 border-t border-white/[0.08]">

            <div className="max-w-lg mx-auto">

              <FeaturedVerdictCard data={FEATURED_VERDICT} />

            </div>

          </section>



          <PipelineStrip />



          {/* Latest inquiries */}

          <section className="px-6 sm:px-8 py-24 sm:py-32 border-t border-white/[0.08]">

            <div className="max-w-6xl mx-auto">

              <div className="flex items-end justify-between gap-4 mb-12">

                <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-white/35">

                  Latest inquiries

                </p>

                <button

                  type="button"

                  onClick={() => router.push(PUBLIC_ROUTES.archives)}

                  className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-white/40 hover:text-white transition-colors"

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

          <section id="newsletter" className="px-6 sm:px-8 py-24 border-t border-white/[0.08]">

            <div className="max-w-md mx-auto text-center">

              <h2 className="font-display text-xl sm:text-2xl font-semibold text-white mb-3 tracking-tight">Weekly dispatch</h2>

              <p className="text-xs text-white/35 mb-8 font-mono uppercase tracking-[0.14em]">What survived arbitration</p>

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


