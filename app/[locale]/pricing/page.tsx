"use client";



import React, { useState } from "react";

import { useRouter } from "next/navigation";

import AuthModal from "@/components/AuthModal";

import { PublicPageShell } from "@/components/layout/PublicPageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { ScrollReveal } from "@/components/ui/ScrollReveal";

import { PUBLIC_ROUTES } from "@/lib/public-urls";

import { cn } from "@/lib/utils";
import { nx } from "@/lib/brand/public-ui";
import { PUBLICATION_FORMATS } from "@/lib/publication-formats";
import { getStudioXPrice } from "@/lib/studiox-pricing";

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

import { FaqJsonLd } from "@/components/seo/JsonLd";



const READER_FEATURES = [
  "Every published position — open, no paywall",
  "Weekly intelligence dispatch",
  "Full source traceability on every claim",
  "Positions with confidence bounds, not opinions",
  "Archives, domain filters, and depth controls",
];

const STUDIO_FEATURES = [
  "Commission a custom study on any question",
  "Chaos structured into a source-verified, scenario-weighted position",
  "Scenario distributions — multiple futures, each with a probability",
  "Adversarial debate before any position is published",
  "4 formats: Signal Brief → Decision Memo → Article → Strategic Report",
  "Priority processing queue + white-label (beta)",
];



const STUDIO_STEPS = [

  { label: "Define question", detail: "0 / 240 characters" },

  { label: "Select focus areas", detail: "Technology · Economics · Policy · …" },

  { label: "Delivery & access", detail: "Institute position · Distribution · Verified sources" },

];



const FAQ = [

  {

    q: "What is the Reader plan?",

    a: "Reader is free, forever. Every position NomosX publishes — inquiries, briefs, signals, and the weekly dispatch — is open. No credit card, no paywall.",

  },

  {

    q: "What is Nomos Engine?",

    a: "Nomos Engine lets you commission a custom study on your own question. Same verification protocol, same traceability — the chaos of evidence structured into a position you can defend, with scenarios stress-tested and sources on trial.",

  },

  {

    q: "How is Engine priced?",

    a: "Pay per study. Price depends on format and depth — shown before you confirm. No subscription, no lock-in.",

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

    router.push(authRedirect === "studio" ? PUBLIC_ROUTES.studio : "/archives");

  }



  return (

    <>

      <FaqJsonLd items={FAQ} />

      <PublicPageShell currentPage="pricing" onSignInClick={() => setShowAuthModal(true)} particles={0}>

          <div className="max-w-5xl mx-auto px-6 sm:px-8 py-16 sm:py-20">

            <PageHeader
              eyebrow="Access"
              title={
                <>
                  Read free.{" "}
                  <span className="text-white">Commission when it matters.</span>
                </>
              }
              description="The world doesn't suffer from a lack of information — it suffers from a lack of verifiable order. NomosX publishes positions 24/7, free to read. Nomos Engine is the add-on for custom studies, scenario stress-testing, and evidence-bound deliverables on demand."
              align="center"
            />



            <ScrollReveal stagger className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-16">

              <div

                className="relative p-6 sm:p-7 nx-surface"

              >

                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-20 h-px bg-white/60" />

                <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-white/55 mb-4">

                  Reader

                </p>

                <div className="flex items-baseline gap-2 mb-2">

                  <span className="font-mono text-4xl font-light text-text">Free</span>

                  <span className="text-sm text-white/50">forever</span>

                </div>

                <p className="text-sm text-white/60 mb-8">

                  Open access to every published position. Evidence-first, no paywall.

                </p>

                <ul className="space-y-3 mb-9">

                  {READER_FEATURES.map((text) => (

                    <li key={text} className="flex items-start gap-3 text-sm text-white/70">

                      <Check className="w-4 h-4 text-white flex-shrink-0 mt-0.5" strokeWidth={1.5} />

                      {text}

                    </li>

                  ))}

                </ul>

                <button

                  type="button"

                  onClick={openFreeAuth}

                  className="w-full py-3.5 border border-white/30 text-white text-sm font-medium hover:border-white/60 hover:text-white transition-colors"

                >

                  Start reading

                </button>

              </div>



              <div

                className="relative p-6 sm:p-7 nx-surface border-white/20"

              >

                <div className="absolute -top-3 left-8">

                  <span className="px-3 py-1 bg-white text-black text-[11px] font-mono font-semibold tracking-[0.14em] uppercase">

                    Pay per study

                  </span>

                </div>

                <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-white/50 mb-4 mt-2">

                  Nomos Engine

                </p>

                <div className="flex items-baseline gap-2 mb-2">

                  <span className="font-display text-3xl font-semibold text-text">

                    From €39

                  </span>

                  <span className="text-sm text-white/50">per study</span>

                </div>

                <p className="text-sm text-white/60 mb-8">

                  Custom inquiries with scenario distributions, adversarial debate, and verified citations.

                </p>

                <ul className="space-y-3 mb-9">

                  {STUDIO_FEATURES.map((text) => (

                    <li key={text} className="flex items-start gap-3 text-sm text-white/75">

                      <Check className="w-4 h-4 text-white flex-shrink-0 mt-0.5" strokeWidth={1.5} />

                      {text}

                    </li>

                  ))}

                </ul>

                <button

                  type="button"

                  onClick={openStudioAuth}

                  className={cn(nx.btnPrimary, "w-full group")}

                >

                  Commission a study

                  <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform" />

                </button>

              </div>

            </ScrollReveal>



            {/* ── 4 formats pricing grid ── */}
            <section className="mb-16">
              <div className="text-center mb-8">
                <p className={cn(nx.eyebrow, "mb-3")}>4 formats · 4 angles</p>
                <h2 className="font-display text-xl sm:text-2xl font-semibold text-text mb-2">
                  Pay per study. No subscription.
                </h2>
                <p className="text-sm text-white/55 max-w-lg mx-auto">
                  Each format serves a different editorial angle. Same verification protocol, same rigor — choose the depth that fits your question.
                </p>
              </div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {PUBLICATION_FORMATS.map((format) => {
                  const price = getStudioXPrice(format.type);
                  return (
                    <div key={format.type} className="nx-surface p-5 flex flex-col">
                      <div className="text-sm text-white font-semibold mb-1">{format.label}</div>
                      <div className="text-[10px] font-mono uppercase tracking-[0.12em] text-white/40 mb-3">{format.pages}</div>
                      <p className="text-xs text-white/55 leading-relaxed mb-4 flex-1">{format.description}</p>
                      <div className="border-t border-white/[0.08] pt-3">
                        <div className="text-2xl font-display font-semibold text-text">{price.display}</div>
                        <div className="text-[10px] text-white/35 uppercase tracking-wide mt-0.5">per study</div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="text-center mt-6">
                <button
                  type="button"
                  onClick={openStudioAuth}
                  className={cn(nx.btnPrimary)}
                >
                  Commission a study
                  <ArrowRight size={14} className="ml-2" />
                </button>
                <p className="mt-3 text-[11px] text-white/35">
                  Money-back guarantee · Secure checkout via Stripe · No subscription
                </p>
              </div>
            </section>

            <section className="mb-16 nx-surface overflow-hidden">

              <div className="p-6 sm:p-8 border-b border-white/[0.08]">

                <div className="flex flex-wrap items-center gap-3 mb-4">

                  <Sparkles className="w-4 h-4 text-white/50" />

                  <h2 className="font-display text-xl font-semibold text-text">

                    Nomos Engine

                  </h2>

                  <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/55 px-2 py-0.5 border border-white/20">

                    Interface preview

                  </span>

                </div>

                <p className="text-sm text-white/60 max-w-xl">
                  Define a question, select domains, and receive a position backed by a source-verified, scenario-weighted chain —
                  with prospective distributions, adversarial review, and full source traceability.
                </p>

              </div>

              <div className="grid sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-white/[0.08]">

                {STUDIO_STEPS.map((step, i) => (

                  <div key={step.label} className="p-5 sm:p-6">

                    <span className="font-mono text-[11px] text-white/55">

                      {String(i + 1).padStart(2, "0")}

                    </span>

                    <p className="text-sm font-medium text-text mt-2 mb-1">{step.label}</p>

                    <p className="font-mono text-[11px] text-white/50">{step.detail}</p>

                  </div>

                ))}

              </div>

              <div className="p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-6 border-t border-white/[0.08]">

                <div>

                  <h3 className="font-display text-lg font-medium text-text mb-1">

                    Commission a custom study

                  </h3>

                  <p className="text-sm text-white/55">Full pipeline · distribution · publication-ready</p>

                </div>

                <button

                  type="button"

                  onClick={openStudioAuth}

                  className={cn(nx.btnPrimary, "shrink-0")}

                >

                  Get started

                </button>

              </div>

            </section>



            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-16">

              {[

                { value: "250M+", label: "Sources indexed", icon: BookOpen },

                { value: "12+", label: "Domain lenses", icon: Brain },

                { value: "4", label: "Method stages", icon: FileText },

                { value: "48", label: "Data providers", icon: Sparkles },

              ].map(({ value, label, icon: Icon }) => (

                <div

                  key={label}

                  className="nx-surface p-4 text-center"

                >

                  <Icon className="w-4 h-4 text-white/55 mx-auto mb-3" strokeWidth={1.25} />

                  <div className="font-mono text-2xl font-light text-text tabular-nums">{value}</div>

                  <div className="font-mono text-[11px] text-white/50 mt-1 uppercase tracking-[0.12em]">

                    {label}

                  </div>

                </div>

              ))}

            </div>



            <div className="mb-16">

              <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-white/55 text-center mb-8">

                Questions

              </p>

              <div className="space-y-2">

                {FAQ.map((item, i) => (

                  <div

                    key={item.q}

                    className={cn(
                      "nx-surface overflow-hidden transition-colors",
                      openFaq === i && "border-white/20"
                    )}

                  >

                    <button

                      type="button"

                      onClick={() => setOpenFaq(openFaq === i ? null : i)}

                      className="w-full flex items-center justify-between px-5 py-4 text-left gap-4"

                    >

                      <span className="text-sm font-medium text-text">{item.q}</span>

                      <ChevronDown

                        size={15}

                        className={cn(

                          "text-white/50 flex-shrink-0 transition-transform",

                          openFaq === i && "rotate-180 text-white"

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

                          <p className="text-sm text-white/60 leading-relaxed px-6 pb-5">{item.a}</p>

                        </motion.div>

                      )}

                    </AnimatePresence>

                  </div>

                ))}

              </div>

            </div>



            <div className="text-center py-12">

              <h2 className="font-display text-xl sm:text-2xl font-semibold mb-4">
                From Chaos to Nomos.{" "}
                <span className="text-white/70">Open by default.</span>
              </h2>

              <div className="flex flex-col sm:flex-row gap-3 justify-center mt-8">

                <button

                  type="button"

                  onClick={openFreeAuth}

                  className="px-7 py-3.5 border border-white/30 text-sm text-white hover:text-white hover:border-white/60"

                >

                  Enter the think tank

                </button>

                <button

                  type="button"

                  onClick={openStudioAuth}

                  className={cn(nx.btnPrimary, "group")}

                >

                  Open Engine

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


