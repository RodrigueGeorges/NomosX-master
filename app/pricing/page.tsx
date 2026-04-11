"use client";
import React from 'react';
import { useState, useEffect } from 'react';

/**
 * NomosX Pricing Page — Agentic Think Tank
 * 
 * Three tiers: Analyst (€0) + Researcher (€19/month) + Studio (€49/month)
 * 30-day trial without credit card
 * Public marketing page — same layout as About/Methodology
 */

import { useRouter } from 'next/navigation';
import AuthModal from '@/components/AuthModal';
import PublicNav from '@/components/PublicNav';
import { Shield, Zap, Users, ArrowRight, ChevronDown } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { NomosXLogo3D } from '@/components/brand/NomosXLogo3D';
import SiteFooter from '@/components/SiteFooter';

export default function PricingPage() {
  const router = useRouter();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  useEffect(() => { setMounted(true); }, []);

  const plans = [
    {
      name: "Analyst",
      price: "0",
      period: "/month",
      description: "Read the autonomous output. Subscribe to the weekly dispatch.",
      accent: "text-white/40",
      border: "border-white/[0.07]",
      bg: "bg-white/[0.02]",
      dotBorder: "border-white/15",
      dotFill: "bg-white/35",
      features: [
        "Weekly intelligence dispatch",
        "Access to published brief summaries",
        "Signal radar (read-only)",
        "Weak-signal alerts",
      ],
      highlighted: false,
      cta: "Start free"
    },
    {
      name: "Researcher",
      price: "19",
      period: "/month",
      description: "Commission briefs and strategic reports. Full pipeline access.",
      accent: "text-indigo-300",
      border: "border-indigo-500/30",
      bg: "bg-indigo-500/[0.04]",
      dotBorder: "border-indigo-400/50",
      dotFill: "bg-indigo-400",
      features: [
        "Everything in Analyst +",
        "Full access to all briefs & reports",
        "Commission research briefs on any topic",
        "Strategic reports (10-15 page deep dives)",
        "22-researcher Council deliberations",
        "Adversarial debate & meta-analysis",
        "Verified citation export",
      ],
      highlighted: true,
      cta: "Start free trial"
    },
    {
      name: "Studio",
      price: "49",
      period: "/month",
      description: "Full editorial control. Publish under your own brand.",
      accent: "text-violet-300",
      border: "border-violet-500/20",
      bg: "bg-violet-500/[0.02]",
      dotBorder: "border-violet-400/35",
      dotFill: "bg-violet-400",
      features: [
        "Everything in Researcher +",
        "Publications Studio (custom questions)",
        "Council Q&A sessions (direct researcher access)",
        "Custom research verticals",
        "White-label export & API access",
        "Priority pipeline queue",
      ],
      highlighted: false,
      cta: "Start free trial"
    }
  ];

  const trust = [
    {
      icon: Shield,
      title: "Autonomous pipeline",
      description: "16-agent verification pipeline. 22 domain researchers. Continuous operation. Publications validated and published autonomously."
    },
    {
      icon: Zap,
      title: "250M+ academic sources",
      description: "Continuous monitoring across OpenAlex, CrossRef, PubMed, arXiv, and 60+ institutional providers. Real-time intelligence at institutional quality."
    },
    {
      icon: Users,
      title: "22 domain researchers",
      description: "Specialized researchers across 22 domains. Multi-pass validation: ANALYST → COUNCIL → DEBATE → META-ANALYSIS."
    }
  ];

  const faq = [
    {
      q: "What does 'autonomous' mean?",
      a: "The 16-agent pipeline operates without human intervention. Input: research question. Process: 16 sequential agents — from SCOUT (source discovery) through COUNCIL (22 researchers), adversarial DEBATE, META-ANALYSIS, to PUBLISH. Output: verified brief with full source traceability. Average cycle: 3-5 minutes."
    },
    {
      q: "What is the difference between a Brief and a Strategic Report?",
      a: "A Brief is a focused 2-4 page synthesis on a specific question, produced by the standard 16-agent pipeline. A Strategic Report is a 10-15 page deep dive with scenario planning, stakeholder analysis, and full meta-analysis with effect sizes — produced by the extended pipeline with all 22 PhD researchers."
    },
    {
      q: "What is Publications Studio?",
      a: "Studio gives you full editorial control over the pipeline output: choose your research question, select providers, set the format, and publish under your own brand. It is a separate product layer on top of the autonomous pipeline."
    },
    {
      q: "Can I change plan at any time?",
      a: "Yes. Upgrades take effect immediately. You only pay the prorated difference. Downgrades apply at the next billing cycle."
    },
    {
      q: "Is there a long-term commitment?",
      a: "No. All plans are month-to-month and can be cancelled at any time without penalties."
    }
  ];

  return (
    <>
      <div className="min-h-screen bg-[#09090b] text-white overflow-hidden">
        <div className="nx-noise" aria-hidden="true" />
        {/* Background — aurora */}
        <div className="fixed inset-0 pointer-events-none overflow-hidden">
          <div className="absolute w-[800px] h-[600px] rounded-full -top-32 left-1/2 -translate-x-1/2 animate-aurora-1" style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.15) 0%, transparent 70%)' }} />
          <div className="absolute w-[500px] h-[500px] rounded-full top-1/3 -right-24 animate-aurora-2" style={{ background: 'radial-gradient(circle, rgba(139,92,246,0.09) 0%, transparent 70%)' }} />
          <div className="absolute w-[400px] h-[400px] rounded-full bottom-1/3 -left-16 animate-aurora-3" style={{ background: 'radial-gradient(circle, rgba(16,185,129,0.05) 0%, transparent 70%)' }} />
          <div className="nx-grid-bg absolute inset-0 opacity-25" />
        </div>

        {/* Nav */}
        <PublicNav currentPage="pricing" onSignInClick={() => setShowAuthModal(true)} />

        <div className="relative z-10 max-w-5xl mx-auto px-6 sm:px-8 py-20 sm:py-28">
          {/* Hero */}
          <div className={`text-center mb-16 ${mounted ? 'animate-fade-in' : 'opacity-0'}`}>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-indigo-500/20 bg-indigo-500/5 mb-8">
              <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse-glow" />
              <span className="text-xs text-indigo-300 font-medium tracking-wide">PRICING</span>
            </div>

            <h1 className="font-display text-4xl sm:text-5xl md:text-6xl font-semibold leading-[1.08] tracking-tight mb-6">
              <span className="text-white">Think tank rigor.</span>
              <br />
              <span className="nx-gradient-text">AI speed. Accessible pricing.</span>
            </h1>

            <p className="text-lg text-white/50 leading-relaxed max-w-2xl mx-auto font-light">
              Free tier: read-only access to published briefs. Paid tiers: commission custom research through the 16-agent pipeline. 250M+ sources. Multi-researcher validation. Full traceability.
            </p>
          </div>

          {/* Pricing Cards — 3 tiers */}
          <div className={`grid grid-cols-1 md:grid-cols-3 gap-4 mb-24 ${mounted ? 'animate-fade-in delay-200' : 'opacity-0'}`}>
            {plans.map((plan, index) => {
              const cardInner = (
                <>
                  {plan.highlighted && (
                    <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 z-10">
                      <div className="px-3 py-1 bg-indigo-500 text-white text-[10px] font-bold rounded-full tracking-widest uppercase">Most popular</div>
                    </div>
                  )}
                  <div className="mb-7">
                    <p className={`text-[10px] font-semibold tracking-[0.25em] uppercase mb-3 ${plan.accent}`}>{plan.name}</p>
                    <div className="flex items-baseline gap-1 mb-2">
                      <span className="text-3xl font-display font-bold text-white">€{plan.price}</span>
                      <span className="text-sm text-white/30">{plan.period}</span>
                    </div>
                    <p className="text-xs text-white/40 leading-relaxed">{plan.description}</p>
                  </div>
                  <div className="space-y-2.5 mb-7">
                    {plan.features.map((feature, fi) => (
                      <div key={fi} className="flex items-center gap-2.5">
                        <div className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center flex-shrink-0 ${plan.dotBorder}`}>
                          <div className={`w-1 h-1 rounded-full ${plan.dotFill}`} />
                        </div>
                        <span className="text-xs text-white/55">{feature}</span>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() => setShowAuthModal(true)}
                    className={`w-full px-5 py-2.5 rounded-lg text-sm font-medium transition-all duration-300 ${
                      plan.highlighted
                        ? 'bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-[#09090b] shadow-lg shadow-amber-500/20 hover:shadow-amber-500/30'
                        : plan.name === 'Studio'
                          ? 'border border-violet-500/25 bg-violet-500/[0.06] text-violet-300 hover:bg-violet-500/[0.12]'
                          : 'bg-white/[0.04] border border-white/[0.08] text-white/50 hover:text-white/70 hover:bg-white/[0.07]'
                    }`}
                  >
                    {plan.cta}
                  </button>
                </>
              );
              if (plan.highlighted) return (
                <div key={index} className="relative p-[1px] rounded-xl overflow-hidden hover:-translate-y-1 transition-all duration-300">
                  <div className="absolute inset-0 rounded-xl animate-beam-spin" style={{ background: 'conic-gradient(from 0deg, transparent 0deg, rgba(99,102,241,0.9) 45deg, rgba(139,92,246,0.7) 90deg, transparent 135deg)' }} />
                  <div className={`relative p-7 rounded-xl ${plan.bg} shadow-xl shadow-indigo-500/10`}>{cardInner}</div>
                </div>
              );
              return (
                <div key={index} className={`relative p-7 rounded-xl border ${plan.border} ${plan.bg} transition-all duration-300 hover:-translate-y-1 ${plan.name === 'Studio' ? 'hover:border-violet-500/30 hover:shadow-lg hover:shadow-violet-500/[0.05]' : 'hover:border-white/[0.14] hover:shadow-lg hover:shadow-indigo-500/[0.06]'}`}>
                  {cardInner}
                </div>
              );
            })}
          </div>

          {/* Trust */}
          <div className="mb-24">
            <div className="text-center mb-12">
              <p className="text-xs text-indigo-400/80 font-medium tracking-[0.2em] uppercase mb-4">Trust</p>
              <h2 className="font-display text-2xl sm:text-3xl font-semibold text-white">
                Why researchers and analysts choose NomosX
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {trust.map((item, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: i * 0.1, ease: [0.23, 1, 0.32, 1] }}
                  className="group relative text-center p-7 rounded-xl border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] hover:border-indigo-500/20 hover:-translate-y-1 transition-all duration-300 overflow-hidden"
                >
                  <div className="absolute top-0 left-0 right-0 h-px" style={{ background: 'linear-gradient(90deg,transparent,rgba(99,102,241,0.5),transparent)' }} />
                  <div className="w-10 h-10 rounded-lg bg-indigo-500/10 border border-indigo-500/15 flex items-center justify-center mx-auto mb-4 group-hover:border-indigo-500/30 transition-colors">
                    <item.icon size={18} className="text-indigo-400" />
                  </div>
                  <h4 className="font-display text-sm font-semibold text-white mb-2">{item.title}</h4>
                  <p className="text-sm text-white/40 leading-relaxed">{item.description}</p>
                </motion.div>
              ))}
            </div>
          </div>

          {/* FAQ */}
          <div className="max-w-2xl mx-auto mb-24">
            <div className="text-center mb-12">
              <p className="text-xs text-indigo-400/80 font-medium tracking-[0.2em] uppercase mb-4">FAQ</p>
              <h2 className="font-display text-2xl sm:text-3xl font-semibold text-white">
                Frequently asked questions
              </h2>
            </div>
            
            <motion.div
              className="space-y-2"
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
            >
              {faq.map((item, i) => (
                <div
                  key={i}
                  className={`rounded-xl border transition-all duration-300 overflow-hidden ${
                    openFaq === i ? 'border-indigo-500/25 bg-indigo-500/[0.04]' : 'border-white/[0.06] bg-white/[0.02] hover:border-white/[0.10]'
                  }`}
                >
                  <button
                    onClick={() => setOpenFaq(openFaq === i ? null : i)}
                    className="w-full flex items-center justify-between px-6 py-5 text-left gap-4"
                  >
                    <span className="font-display text-sm font-semibold text-white">{item.q}</span>
                    <ChevronDown
                      size={15}
                      className={`text-white/30 flex-shrink-0 transition-transform duration-300 ${openFaq === i ? 'rotate-180 text-indigo-400' : ''}`}
                    />
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
            </motion.div>
          </div>

          {/* CTA */}
          <div className="relative text-center py-16">
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-[400px] h-[250px] bg-indigo-500/[0.08] rounded-full blur-[100px]" />
            </div>
            <div className="relative">
              <h2 className="font-display text-3xl sm:text-4xl font-semibold text-white mb-4">
                Research infrastructure.<br /><span className="nx-gradient-text">Open access.</span>
              </h2>
              <p className="text-base text-white/40 mb-8 max-w-xl mx-auto">
                22 researchers. 16 agents. 250M+ sources. Free tier available.
              </p>
              <button
                onClick={() => setShowAuthModal(true)}
                className="group px-6 py-3 rounded-lg bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-[#09090b] font-medium text-sm transition-all duration-300 shadow-lg shadow-amber-500/20 hover:shadow-amber-500/30 hover:scale-[1.03] inline-flex items-center gap-2"
              >
                Access institutional intelligence — Free tier
                <ArrowRight size={16} className="group-hover:translate-x-0.5 transition-transform" />
              </button>
            </div>
          </div>
        </div>

        <SiteFooter onSignInClick={() => setShowAuthModal(true)} />
      </div>

      {showAuthModal && (
        <AuthModal 
          isOpen={showAuthModal}
          onClose={() => setShowAuthModal(false)}
          onSignupSuccess={() => setShowAuthModal(false)}
        />
      )}
    </>
  );
}
