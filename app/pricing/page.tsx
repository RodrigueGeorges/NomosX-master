"use client";
import React from 'react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import AuthModal from '@/components/AuthModal';
import PublicNav from '@/components/PublicNav';
import { ArrowRight, ChevronDown, BookOpen, Brain, Database, FileText, Target, Shield, Zap } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import SiteFooter from '@/components/SiteFooter';

export default function PricingPage() {
  const router = useRouter();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authRedirect, setAuthRedirect] = useState<'studio' | 'free'>('free');
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  function openStudioAuth() {
    setAuthRedirect('studio');
    setShowAuthModal(true);
  }

  function openFreeAuth() {
    setAuthRedirect('free');
    setShowAuthModal(true);
  }

  function handleAuthSuccess() {
    setShowAuthModal(false);
    if (authRedirect === 'studio') {
      router.push('/studio');
    } else {
      router.push('/dashboard');
    }
  }

  const freeFeatures = [
    { icon: BookOpen, text: "All published briefs & strategic reports" },
    { icon: Brain,    text: "22-researcher Council publications" },
    { icon: Database, text: "Full source traceability on every claim" },
    { icon: FileText, text: "Weekly truth dispatch" },
    { icon: Target,   text: "Signal feed (read-only)" },
  ];

  const studioFeatures = [
    "Commission research on any question",
    "Choose format: Executive Brief or Strategic Report",
    "Full 22-researcher Council deliberations",
    "Adversarial debate + statistical meta-analysis",
    "Verified [SRC-N] citation export",
    "White-label output & API access",
    "Priority pipeline queue",
    "Custom research verticals",
  ];

  const faq = [
    {
      q: "Is the Think Tank really free?",
      a: "Yes. Everything the autonomous pipeline publishes — briefs, strategic reports, the weekly dispatch — is freely accessible. No credit card, no subscription, no expiry. The Council publishes; you read."
    },
    {
      q: "What is StudioX?",
      a: "StudioX lets you commission the full 16-agent pipeline on any research question of your choice. You set the question, choose the format (Executive Brief or Strategic Report), and receive a fully validated, source-traced publication. It is the research arm on demand, for organizations and professionals who need custom intelligence."
    },
    {
      q: "How does the pipeline work?",
      a: "Input: your research question. The pipeline runs 16 sequential verification stages — source collection across 250M+ documents, enrichment, relevance ranking, extraction, synthesis, then Council validation (22 domain researchers debate and meta-analyze). Output: verified brief with full [SRC-N] citation traceability. Average cycle: 3–5 minutes.",
    },
    {
      q: "What is the difference between a Brief and a Strategic Report?",
      a: "An Executive Brief is a focused 3–5 page synthesis: consensus, disagreements, pro/con debate, evidence quality score, strategic implications. A Strategic Report is 10–15 pages: full literature review, thematic analysis, scenario planning (3–5 scenarios with probabilities), stakeholder impact matrix, and implementation roadmap."
    },
    {
      q: "Is StudioX priced per report or per subscription?",
      a: "Pricing details for StudioX are available on request — it depends on volume, format, and vertical. Get in touch to discuss your use case."
    },
  ];

  return (
    <>
      <div className="min-h-screen bg-[#09090b] text-white overflow-hidden">
        <div className="nx-noise" aria-hidden="true" />
        <div className="fixed inset-0 pointer-events-none overflow-hidden">
          <div className="absolute w-[800px] h-[600px] rounded-full -top-32 left-1/2 -translate-x-1/2" style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.10) 0%, transparent 70%)' }} />
          <div className="absolute w-[500px] h-[500px] rounded-full top-1/3 -right-24" style={{ background: 'radial-gradient(circle, rgba(139,92,246,0.05) 0%, transparent 70%)' }} />
          <div className="nx-grid-bg absolute inset-0 opacity-25" />
        </div>

        <PublicNav currentPage="pricing" onSignInClick={() => setShowAuthModal(true)} />

        <div className="relative z-10 max-w-5xl mx-auto px-6 sm:px-8 py-20 sm:py-28">

          {/* HERO */}
          <div className="text-center mb-20">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-indigo-500/20 bg-indigo-500/5 mb-7">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
              <span className="text-xs text-indigo-300 font-medium tracking-[0.2em] uppercase">Access</span>
            </div>
            <h1 className="font-display text-4xl sm:text-5xl md:text-6xl font-bold leading-[1.08] tracking-tight mb-6">
              The Think Tank is open.<br />
              <span className="nx-gradient-text">Research is free.</span>
            </h1>
            <p className="text-lg text-white/45 leading-relaxed max-w-2xl mx-auto">
              Everything the Council publishes is freely accessible — no account required. StudioX is for those who want to commission their own research through the full 16-agent pipeline.
            </p>
          </div>

          {/* Access protocol */}
          <div className="mb-20 rounded-[28px] border border-indigo-400/15 bg-[#0b0b12]/80 overflow-hidden relative">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(99,102,241,0.14),transparent_30%),radial-gradient(circle_at_80%_38%,rgba(212,175,55,0.08),transparent_34%)]" />
            <div className="absolute inset-0 nx-grid-bg opacity-20" />
            <div className="relative p-7 sm:p-10">
              <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-8 mb-8">
                <div>
                  <p className="text-xs text-indigo-300/75 font-medium tracking-[0.22em] uppercase mb-4">Access Protocol</p>
                  <h2 className="font-display text-3xl sm:text-4xl font-bold text-white mb-3">Open reading. Commissioned intelligence.</h2>
                  <p className="text-sm text-white/40 max-w-2xl leading-relaxed">
                    The public institution publishes openly. StudioX opens the engine: custom questions, priority pipeline, deeper formats, and exportable evidence.
                  </p>
                </div>
                <div className="text-[10px] text-white/25 font-mono tracking-[0.18em]">PUBLIC_LAYER / STUDIO_LAYER</div>
              </div>
              <div className="grid md:grid-cols-3 gap-3">
                {[
                  { icon: BookOpen, label: "Read", value: "free forever" },
                  { icon: Zap, label: "Commission", value: "on demand" },
                  { icon: Shield, label: "Verify", value: "source-bound" },
                ].map((item) => {
                  const AIcon = item.icon;
                  return (
                    <div key={item.label} className="rounded-xl border border-white/[0.06] bg-black/20 p-4">
                      <AIcon size={16} className="text-indigo-300/75 mb-5" />
                      <div className="text-[10px] text-white/25 uppercase tracking-[0.16em]">{item.label}</div>
                      <div className="text-sm text-white/75 font-medium mt-1">{item.value}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* TWO COLUMNS */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-24">

            {/* Free */}
            <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-9 relative overflow-hidden hover:border-white/[0.12] transition-all duration-300">
              <div className="absolute top-0 left-0 right-0 h-px" style={{ background: 'linear-gradient(90deg,rgba(255,255,255,0.14),transparent)' }} />
              <p className="text-[10px] text-white/35 font-semibold tracking-[0.25em] uppercase mb-5">Think Tank — Open access</p>
              <div className="flex items-baseline gap-2 mb-2">
                <span className="text-5xl font-display font-bold text-white">Free</span>
              </div>
              <p className="text-sm text-white/30 mb-7">No credit card. No expiry. No catch.</p>
              <div className="space-y-3 mb-9">
                {freeFeatures.map((f, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-lg bg-white/[0.04] border border-white/[0.08] flex items-center justify-center flex-shrink-0">
                      <f.icon size={13} className="text-white/40" />
                    </div>
                    <span className="text-sm text-white/55">{f.text}</span>
                  </div>
                ))}
              </div>
              <button
                onClick={openFreeAuth}
                className="w-full py-3.5 rounded-xl border border-white/[0.10] bg-white/[0.03] text-white/60 font-medium text-sm hover:bg-white/[0.07] hover:text-white/80 transition-all duration-200"
              >
                Access the Council — free
              </button>
            </div>

            {/* StudioX */}
            <div className="relative p-[1px] rounded-2xl overflow-hidden">
              <div className="absolute inset-0 rounded-2xl" style={{ background: 'conic-gradient(from 0deg, transparent 0deg, rgba(99,102,241,0.5) 45deg, rgba(139,92,246,0.3) 90deg, transparent 135deg)' }} />
              <div className="relative rounded-2xl p-9 h-full" style={{ background: 'linear-gradient(145deg, rgba(99,102,241,0.07) 0%, rgba(9,9,11,1) 55%)' }}>
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                  <span className="px-4 py-1 rounded-full bg-indigo-600 text-white text-[10px] font-bold tracking-widest uppercase shadow-lg shadow-indigo-500/30">StudioX</span>
                </div>
                <p className="text-[10px] text-indigo-400/70 font-semibold tracking-[0.25em] uppercase mb-5 mt-1">Custom research on demand</p>
                <div className="flex items-baseline gap-2 mb-2">
                  <span className="text-5xl font-display font-bold text-white">On demand</span>
                </div>
                <p className="text-sm text-white/30 mb-7">Commission the pipeline. Pricing on request.</p>
                <div className="space-y-2.5 mb-9">
                  {studioFeatures.map((f, i) => (
                    <div key={i} className="flex items-center gap-2.5">
                      <div className="w-3.5 h-3.5 rounded-full border border-indigo-400/40 flex items-center justify-center flex-shrink-0">
                        <div className="w-1 h-1 rounded-full bg-indigo-400" />
                      </div>
                      <span className="text-sm text-white/60">{f}</span>
                    </div>
                  ))}
                </div>
                <button
                  onClick={openStudioAuth}
                  className="w-full py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm transition-all duration-200 shadow-lg shadow-indigo-500/20 flex items-center justify-center gap-2 group"
                >
                  Commission research
                  <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
                </button>
              </div>
            </div>
          </div>

          {/* PIPELINE STATS */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-24">
            {[
              { value: "250M+", label: "Academic sources" },
              { value: "16", label: "Verification stages" },
              { value: "22", label: "Domain researchers" },
              { value: "3–5 min", label: "Pipeline cycle" },
            ].map((s, i) => (
              <div
                key={i}
                className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5 text-center"
              >
                <div className="text-2xl font-display font-bold text-white mb-1">{s.value}</div>
                <div className="text-xs text-white/30">{s.label}</div>
              </div>
            ))}
          </div>

          {/* FAQ */}
          <div className="max-w-2xl mx-auto mb-24">
            <div className="text-center mb-10">
              <p className="text-[11px] text-white/30 font-semibold tracking-[0.2em] uppercase mb-4">FAQ</p>
              <h2 className="font-display text-2xl sm:text-3xl font-bold text-white">Questions</h2>
            </div>
            <div className="space-y-2">
              {faq.map((item, i) => (
                <div
                  key={i}
                  className={`rounded-xl border transition-all duration-300 overflow-hidden ${
                    openFaq === i ? 'border-indigo-500/20 bg-indigo-500/[0.03]' : 'border-white/[0.06] bg-white/[0.02] hover:border-white/[0.10]'
                  }`}
                >
                  <button
                    onClick={() => setOpenFaq(openFaq === i ? null : i)}
                    className="w-full flex items-center justify-between px-6 py-5 text-left gap-4"
                  >
                    <span className="font-display text-sm font-semibold text-white">{item.q}</span>
                    <ChevronDown size={15} className={`text-white/30 flex-shrink-0 transition-transform duration-300 ${openFaq === i ? 'rotate-180 text-indigo-400' : ''}`} />
                  </button>
                  <AnimatePresence initial={false}>
                    {openFaq === i && (
                      <motion.div
                        key="answer"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                      >
                        <p className="text-sm text-white/45 leading-relaxed px-6 pb-5">{item.a}</p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ))}
            </div>
          </div>

          {/* CTA */}
          <div className="relative text-center py-16">
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-[500px] h-[280px] rounded-full blur-[120px]" style={{ background: 'radial-gradient(circle, rgba(212,175,55,0.08) 0%, rgba(99,102,241,0.06) 50%, transparent 100%)' }} />
            </div>
            <div className="relative">
              <h2 className="font-display text-3xl sm:text-4xl font-bold text-white mb-4">
                The Council publishes.<br />
                <span className="nx-gradient-text">You read. Free.</span>
              </h2>
              <p className="text-base text-white/40 mb-8 max-w-xl mx-auto">22 researchers. 16 agents. 250M+ sources. Every claim sourced. No opinion.</p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <button
                  onClick={openFreeAuth}
                  className="group px-7 py-3.5 rounded-xl border border-white/[0.10] bg-white/[0.03] text-white/70 font-medium text-sm hover:bg-white/[0.07] hover:text-white transition-all duration-200 flex items-center justify-center gap-2"
                >
                  Access the Council — free
                </button>
                <button
                  onClick={openStudioAuth}
                  className="group px-7 py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm transition-all duration-200 shadow-lg shadow-indigo-500/20 flex items-center justify-center gap-2"
                >
                  Commission research
                  <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
                </button>
              </div>
            </div>
          </div>

        </div>

        <SiteFooter onSignInClick={() => setShowAuthModal(true)} />
      </div>

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
