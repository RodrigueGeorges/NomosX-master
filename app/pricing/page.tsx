"use client";



import React, { useState } from "react";

import { useRouter } from "next/navigation";

import AuthModal from "@/components/AuthModal";

import { PublicPageShell } from "@/components/layout/PublicPageShell";

import { PUBLIC_ROUTES } from "@/lib/public-urls";

import { cn } from "@/lib/utils";

import {

  ArrowRight,

  BookOpen,

  Brain,

  Check,

  ChevronDown,

  FileText,

  Sparkles,

} from "lucide-react";

import { AnimatePresence, motion } from "framer-motion";



const READER_FEATURES = [

  "All published inquiries & briefs",

  "Weekly truth dispatch",

  "Full source traceability on every claim",

  "22-researcher Council publications",

  "Archives & domain filters",

];



const STUDIO_FEATURES = [

  "Commission a custom inquiry on any question",

  "Multi-agent Foresight (1024+ swarm, GraphRAG)",

  "Choose depth: standard → strategic",

  "Adversarial debate + citation export",

  "Priority pipeline queue",

  "White-label & API access (beta)",

];



const STUDIO_STEPS = [

  { label: "Define question", detail: "0 / 240 characters" },

  { label: "Select focus areas", detail: "Technology · Economics · Policy · …" },

  { label: "Delivery & access", detail: "AI inquiry · Simulation · Verified sources" },

];



const FAQ = [

  {

    q: "What is the Reader plan?",

    a: "Reader is free, forever. Everything the autonomous pipeline publishes — inquiries, briefs, signals, and the weekly dispatch — is open. No credit card.",

  },

  {

    q: "What is NomosX Studio?",

    a: "Studio lets you commission the full agent pipeline on your research question: scout, rank, read, simulate, challenge, and publish — with a probabilistic verdict and full [SRC-N] traceability.",

  },

  {

    q: "How is Studio priced?",

    a: "Pay per commission. Price depends on depth and format; shown before you confirm. No subscription.",

  },

];



export default function PricingPage() {

  const router = useRouter();

  const [showAuthModal, setShowAuthModal] = useState(false);

  const [authRedirect, setAuthRedirect] = useState<"studio" | "free">("free");

  const [openFaq, setOpenFaq] = useState<number | null>(null);



  function openStudioAuth() {

    setAuthRedirect("studio");

    setShowAuthModal(true);

  }



  function openFreeAuth() {

    setAuthRedirect("free");

    setShowAuthModal(true);

  }



  function handleAuthSuccess() {

    setShowAuthModal(false);

    router.push(authRedirect === "studio" ? PUBLIC_ROUTES.studio : "/dashboard");

  }



  return (

    <>

      <PublicPageShell currentPage="pricing" onSignInClick={() => setShowAuthModal(true)} particles={20}>

          <div className="max-w-5xl mx-auto px-6 sm:px-8 py-20 sm:py-28">

            <header className="text-center mb-20 animate-rise">

              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-accent/70 mb-5">

                Access

              </p>

              <h1 className="font-display text-4xl sm:text-5xl font-semibold tracking-tight mb-5">

                Read free.{" "}

                <span className="text-accent">Commission when it matters.</span>

              </h1>

              <p className="text-base text-white/50 max-w-2xl mx-auto leading-relaxed">
                The autonomous think tank publishes inquiries 24/7 — free to read.
                Studio is the add-on for custom commissions, foresight simulation, and
                evidence-bound deliverables on demand.
              </p>

            </header>



            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-24">

              <div

                className={cn(

                  "relative rounded-2xl p-8 sm:p-9",

                  "border border-white/[0.07] bg-bg-elevated",

                  "shadow-card"

                )}

              >

                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-20 h-px bg-accent/30" />

                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/40 mb-4">

                  Reader

                </p>

                <div className="flex items-baseline gap-2 mb-2">

                  <span className="font-mono text-5xl font-light text-text">Free</span>

                  <span className="text-sm text-white/35">forever</span>

                </div>

                <p className="text-sm text-white/45 mb-8">

                  Open access to every published inquiry. Evidence-first, no paywall.

                </p>

                <ul className="space-y-3 mb-9">

                  {READER_FEATURES.map((text) => (

                    <li key={text} className="flex items-start gap-3 text-sm text-white/55">

                      <Check className="w-4 h-4 text-accent/80 flex-shrink-0 mt-0.5" strokeWidth={1.5} />

                      {text}

                    </li>

                  ))}

                </ul>

                <button

                  type="button"

                  onClick={openFreeAuth}

                  className="w-full py-3.5 rounded-xl border border-white/[0.10] text-white/70 text-sm font-medium hover:border-accent/30 hover:text-white transition-colors"

                >

                  Start reading

                </button>

              </div>



              <div

                className={cn(

                  "relative rounded-2xl p-8 sm:p-9",

                  "border border-accent/20 bg-bg-elevated",

                  "shadow-glow"

                )}

              >

                <div className="absolute -top-3 left-8">

                  <span className="px-3 py-1 rounded-full bg-accent text-bg text-[10px] font-mono font-semibold tracking-[0.14em] uppercase">

                    Private beta

                  </span>

                </div>

                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent/70 mb-4 mt-2">

                  NomosX Studio

                </p>

                <div className="flex items-baseline gap-2 mb-2">

                  <span className="font-display text-3xl font-semibold text-text">

                    On demand

                  </span>

                </div>

                <p className="text-sm text-white/45 mb-8">

                  Custom inquiries with simulation, debate, and verified citations.

                </p>

                <ul className="space-y-3 mb-9">

                  {STUDIO_FEATURES.map((text) => (

                    <li key={text} className="flex items-start gap-3 text-sm text-white/60">

                      <Check className="w-4 h-4 text-accent flex-shrink-0 mt-0.5" strokeWidth={1.5} />

                      {text}

                    </li>

                  ))}

                </ul>

                <button

                  type="button"

                  onClick={openStudioAuth}

                  className="w-full py-3.5 rounded-xl bg-accent hover:brightness-110 text-bg text-sm font-semibold transition-colors flex items-center justify-center gap-2 group"

                >

                  Commission an inquiry

                  <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform" />

                </button>

              </div>

            </div>



            <section className="mb-24 rounded-2xl border border-white/[0.06] bg-bg-elevated/80 overflow-hidden">

              <div className="p-8 sm:p-10 border-b border-white/[0.06]">

                <div className="flex flex-wrap items-center gap-3 mb-4">

                  <Sparkles className="w-4 h-4 text-accent/70" />

                  <h2 className="font-display text-xl font-semibold text-text">

                    NomosX Studio

                  </h2>

                  <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-accent/50 px-2 py-0.5 border border-accent/20 rounded-full">

                    Interface preview

                  </span>

                </div>

                <p className="text-sm text-white/45 max-w-xl">

                  Define a question, select domains, and receive a verdict-backed inquiry with

                  multi-agent convergence metrics.

                </p>

              </div>

              <div className="grid sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-white/[0.06]">

                {STUDIO_STEPS.map((step, i) => (

                  <div key={step.label} className="p-6 sm:p-8">

                    <span className="font-mono text-[10px] text-accent/50">

                      {String(i + 1).padStart(2, "0")}

                    </span>

                    <p className="text-sm font-medium text-text mt-2 mb-1">{step.label}</p>

                    <p className="font-mono text-[10px] text-white/30">{step.detail}</p>

                  </div>

                ))}

              </div>

              <div className="p-8 sm:p-10 flex flex-col sm:flex-row sm:items-center justify-between gap-6 border-t border-white/[0.06]">

                <div>

                  <h3 className="font-display text-lg font-medium text-text mb-1">

                    Commission a custom inquiry

                  </h3>

                  <p className="text-sm text-white/40">Full pipeline · simulation · publication-ready</p>

                </div>

                <button

                  type="button"

                  onClick={openStudioAuth}

                  className="px-8 py-3.5 rounded-xl bg-accent hover:brightness-110 text-bg text-sm font-semibold shrink-0"

                >

                  Get started

                </button>

              </div>

            </section>



            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-24">

              {[

                { value: "250M+", label: "Sources indexed", icon: BookOpen },

                { value: "22", label: "Domain researchers", icon: Brain },

                { value: "7", label: "Pipeline stages", icon: FileText },

                { value: "3–5 min", label: "Standard cycle", icon: Sparkles },

              ].map(({ value, label, icon: Icon }) => (

                <div

                  key={label}

                  className="rounded-xl border border-white/[0.06] bg-bg-elevated p-5 text-center"

                >

                  <Icon className="w-4 h-4 text-accent/50 mx-auto mb-3" strokeWidth={1.25} />

                  <div className="font-mono text-2xl font-light text-text tabular-nums">{value}</div>

                  <div className="font-mono text-[10px] text-white/35 mt-1 uppercase tracking-[0.12em]">

                    {label}

                  </div>

                </div>

              ))}

            </div>



            <div className="mb-16">

              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent/50 text-center mb-8">

                Questions

              </p>

              <div className="space-y-2">

                {FAQ.map((item, i) => (

                  <div

                    key={item.q}

                    className={cn(

                      "rounded-xl border overflow-hidden transition-colors",

                      openFaq === i

                        ? "border-accent/20 bg-bg-elevated"

                        : "border-white/[0.06] bg-bg-elevated/60"

                    )}

                  >

                    <button

                      type="button"

                      onClick={() => setOpenFaq(openFaq === i ? null : i)}

                      className="w-full flex items-center justify-between px-6 py-5 text-left gap-4"

                    >

                      <span className="text-sm font-medium text-text">{item.q}</span>

                      <ChevronDown

                        size={15}

                        className={cn(

                          "text-white/30 flex-shrink-0 transition-transform",

                          openFaq === i && "rotate-180 text-accent"

                        )}

                      />

                    </button>

                    <AnimatePresence initial={false}>

                      {openFaq === i && (

                        <motion.div

                          initial={{ height: 0, opacity: 0 }}

                          animate={{ height: "auto", opacity: 1 }}

                          exit={{ height: 0, opacity: 0 }}

                          transition={{ duration: 0.25 }}

                        >

                          <p className="text-sm text-white/45 leading-relaxed px-6 pb-5">{item.a}</p>

                        </motion.div>

                      )}

                    </AnimatePresence>

                  </div>

                ))}

              </div>

            </div>



            <div className="text-center py-12">

              <h2 className="font-display text-2xl sm:text-3xl font-semibold mb-4">

                Evidence-first intelligence.{" "}

                <span className="text-accent">Open by default.</span>

              </h2>

              <div className="flex flex-col sm:flex-row gap-3 justify-center mt-8">

                <button

                  type="button"

                  onClick={openFreeAuth}

                  className="px-7 py-3.5 rounded-xl border border-white/[0.10] text-sm text-white/70 hover:text-white"

                >

                  Enter the think tank

                </button>

                <button

                  type="button"

                  onClick={openStudioAuth}

                  className="px-7 py-3.5 rounded-xl bg-accent text-bg text-sm font-semibold hover:brightness-110 flex items-center justify-center gap-2 group"

                >

                  Open Studio

                  <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform" />

                </button>

              </div>

            </div>

          </div>

      </PublicPageShell>



      {showAuthModal && (

        <AuthModal

          isOpen={showAuthModal}

          onClose={() => setShowAuthModal(false)}

          onSignupSuccess={handleAuthSuccess}

        />

      )}

    </>

  );

}


