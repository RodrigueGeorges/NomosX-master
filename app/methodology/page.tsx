"use client";
import React from 'react';
import { useState, useEffect } from 'react';

/**
 * Methodology Page — Agentic Think Tank
 * 
 * Purpose: Explain the agent pipeline, data sources, scoring, and editorial process
 * UX: Technical credibility, transparency, convert skeptics → believers
 */

import { useRouter } from 'next/navigation';
import AuthModal from '@/components/AuthModal';
import PublicNav from '@/components/PublicNav';
import { Search, Database, BarChart3, FileText, Brain, Shield, ArrowRight, Globe, Zap, CheckCircle, Eye, Scale, Users, Microscope, Flame, Layers, TrendingUp } from 'lucide-react';
import SiteFooter from '@/components/SiteFooter';
import { motion } from 'framer-motion';
import PipelineDemo from '@/components/ui/PipelineDemo';
import { GreekProtocolStrip } from '@/components/brand/GreekProtocol';

export default function MethodologyPage() {
  const router = useRouter();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authRedirect, setAuthRedirect] = useState<'dashboard' | 'studio'>('dashboard');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const pillars = [
    {
      icon: Globe,
      title: "Comprehensive coverage",
      description: "24/7 monitoring of 250M+ academic sources across 60+ providers. Real-time intelligence at institutional quality."
    },
    {
      icon: Brain,
      title: "22 domain researchers",
      description: "Specialized researchers across economics, geopolitics, AI regulation, climate, health, etc. Multi-domain validation."
    },
    {
      icon: Shield,
      title: "Academic rigor",
      description: "Verified citations, cross-validation, and full traceability for every insight."
    }
  ];

  const agents = [
    {
      name: "Collection",
      icon: Search,
      purpose: "Source discovery",
      description: "Queries 250M+ academic publications in parallel across 60+ institutional providers.",
      inputs: ["Research question", "Domain scope"],
      outputs: ["Source corpus", "Quality scores", "Provenance metadata"],
      providers: ["60+ academic & institutional databases"],
      color: "bg-indigo-500"
    },
    {
      name: "Enrichment",
      icon: Database,
      purpose: "Identity enrichment",
      description: "Normalizes sources, resolves author identities, and maps institutional affiliations globally.",
      inputs: ["Raw source corpus"],
      outputs: ["Enriched sources", "Author profiles", "Institution profiles"],
      providers: ["Global academic identity registries"],
      color: "bg-violet-500"
    },
    {
      name: "Semantic mapping",
      icon: Zap,
      purpose: "Semantic vectors",
      description: "Generates semantic representations for all sources, enabling deduplication and similarity-based selection.",
      inputs: ["Enriched sources"],
      outputs: ["Semantic index", "Deduplicated source list"],
      providers: ["Proprietary semantic engine"],
      color: "bg-blue-500"
    },
    {
      name: "Evidence ranking",
      icon: BarChart3,
      purpose: "Strategic selection",
      description: "Selects the strongest sources using composite scoring: quality, novelty, recency, and diversity controls.",
      inputs: ["Source corpus", "Research context"],
      outputs: ["Ranked evidence set", "Quality scores"],
      providers: ["Proprietary scoring model"],
      color: "bg-purple-500"
    },
    {
      name: "Content analysis",
      icon: FileText,
      purpose: "Deep reading",
      description: "Extracts key claims, methods, quantitative results, and limitations from full-text content including PDFs.",
      inputs: ["Ranked sources"],
      outputs: ["Structured findings", "Quantitative data", "Confidence scores"],
      providers: ["Proprietary extraction pipeline"],
      color: "bg-fuchsia-500"
    },
    {
      name: "Synthesis",
      icon: Brain,
      purpose: "Multi-pass synthesis",
      description: "Multi-pass analysis: thematic mapping, contradiction detection, then unified synthesis with strategic implications.",
      inputs: ["Structured findings", "Research question"],
      outputs: ["Structured analysis", "Key findings", "Strategic implications"],
      providers: ["Council AI deliberation"],
      color: "bg-pink-500"
    },
    {
      name: "Council review",
      icon: Users,
      purpose: "22-researcher validation",
      description: "22 domain-specialized researchers review the analysis in parallel — each within their domain: economics, geopolitics, climate, health, AI regulation, law, and 16 others.",
      inputs: ["Analysis draft", "Domain context"],
      outputs: ["Domain validations", "Expert annotations", "Consensus score"],
      providers: ["22 PhD-calibrated researchers"],
      color: "bg-indigo-600"
    },
    {
      name: "Citation integrity",
      icon: CheckCircle,
      purpose: "Citation validation",
      description: "Validates that every [SRC-N] citation maps to a real, accessible source. Rejects any analysis with unverified citations.",
      inputs: ["Full analysis", "Source corpus"],
      outputs: ["Validity score", "Citation map"],
      providers: ["Proprietary validation engine"],
      color: "bg-emerald-500"
    },
    {
      name: "Claim verification",
      icon: Microscope,
      purpose: "Semantic cross-check",
      description: "Cross-validates every key claim against its cited sources. Flags unsupported assertions and downgrades confidence where evidence is insufficient.",
      inputs: ["Analysis claims", "Source corpus"],
      outputs: ["Verified claim list", "Confidence scores", "Flagged assertions"],
      providers: ["Proprietary verification engine"],
      color: "bg-amber-500"
    },
    {
      name: "Critical review",
      icon: Eye,
      purpose: "Iterative critique",
      description: "Parallel critics review the analysis for epistemic flaws. If issues are found, the analysis is revised until quality thresholds are met.",
      inputs: ["Analysis draft", "Quality thresholds"],
      outputs: ["Critique report", "Revised analysis"],
      providers: ["Adversarial review panel"],
      color: "bg-indigo-500"
    },
    {
      name: "Adversarial debate",
      icon: Scale,
      purpose: "Steel-man challenge",
      description: "Two-pass adversarial debate: the strongest possible counter-arguments are constructed, then a balanced synthesis is produced.",
      inputs: ["Analysis", "Key claims"],
      outputs: ["Pro/con arguments", "Synthesis", "Confidence assessment"],
      providers: ["Adversarial deliberation engine"],
      color: "bg-red-500"
    },
    {
      name: "Statistical analysis",
      icon: BarChart3,
      purpose: "Quantitative rigor",
      description: "Computes effect sizes, heterogeneity measures, and publication bias tests across quantitative findings. Generates summary statistics.",
      inputs: ["Quantitative findings"],
      outputs: ["Effect summaries", "Pooled estimates", "Bias assessments"],
      providers: ["Proprietary statistical engine"],
      color: "bg-teal-500"
    },
    {
      name: "Final stress-test",
      icon: Flame,
      purpose: "Publication gate",
      description: "Final adversarial challenge using the full deliberation context. Attempts to invalidate the core thesis before publication is cleared.",
      inputs: ["Full analysis", "Deliberation context"],
      outputs: ["Adversarial assessment", "Publication gate score"],
      providers: ["Independent challenge panel"],
      color: "bg-orange-500"
    },
    {
      name: "Knowledge tracking",
      icon: Globe,
      purpose: "Longitudinal intelligence",
      description: "Builds and maintains a concept graph across publications. Tracks how claims evolve and which evidence strengthens or weakens over time.",
      inputs: ["Verified analysis"],
      outputs: ["Concept graph updates", "Trend signals"],
      providers: ["Proprietary knowledge engine"],
      color: "bg-indigo-700"
    },
    {
      name: "Publication render",
      icon: Layers,
      purpose: "Source-grounded render",
      description: "Renders the verified analysis into a structured brief. All citations are traceable, evidence quality is visualized, and source provenance is fully documented.",
      inputs: ["Verified analysis", "Source corpus"],
      outputs: ["Structured brief", "Citation map", "Evidence quality report"],
      providers: ["Proprietary render engine"],
      color: "bg-slate-500"
    },
    {
      name: "Publication",
      icon: TrendingUp,
      purpose: "Autonomous release",
      description: "Triggers autonomous publication when all confidence thresholds are met. Notifies subscribers and updates the longitudinal knowledge base.",
      inputs: ["Cleared brief", "Gate score"],
      outputs: ["Published brief", "Subscriber notifications", "Knowledge base update"],
      providers: ["Council publication system"],
      color: "bg-green-600"
    }
  ];

  const guarantees = [
    {
      title: "Rigor before speed",
      description: "Every publication goes through multiple validation layers. We prefer slower and correct over fast and wrong."
    },
    {
      title: "Quality before quantity",
      description: "Our editorial filter ensures that only rigorous, decision-grade intelligence is delivered."
    },
    {
      title: "Transparency before trust",
      description: "We show sources, reasoning, and confidence levels. No black box."
    },
    {
      title: "Autonomy before control",
      description: "The council operates with full editorial independence, like a real research institution."
    }
  ];

  return (
    <>
      <div className="min-h-screen bg-[#09090b] text-white overflow-hidden">
        <div className="nx-noise" aria-hidden="true" />
        {/* Background — aurora */}
        <div className="fixed inset-0 pointer-events-none overflow-hidden">
          <div className="absolute w-[900px] h-[700px] rounded-full -top-48 left-1/2 -translate-x-1/2 animate-aurora-1" style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.15) 0%, transparent 70%)' }} />
          <div className="absolute w-[600px] h-[600px] rounded-full top-1/3 -right-32 animate-aurora-2" style={{ background: 'radial-gradient(circle, rgba(139,92,246,0.09) 0%, transparent 70%)' }} />
          <div className="absolute w-[500px] h-[500px] rounded-full bottom-1/4 -left-24 animate-aurora-3" style={{ background: 'radial-gradient(circle, rgba(212,175,55,0.06) 0%, transparent 70%)' }} />
          <div className="nx-grid-bg absolute inset-0 opacity-30" />
        </div>

        {/* Nav */}
        <PublicNav currentPage="methodology" onSignInClick={() => setShowAuthModal(true)} />

        <div className="relative z-10 max-w-5xl mx-auto px-6 sm:px-8 py-20 sm:py-28">
          {/* Hero */}
          <div className={`text-center mb-24 ${mounted ? 'animate-fade-in' : 'opacity-0'}`}>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-indigo-500/20 bg-indigo-500/5 mb-8">
              <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse-glow" />
              <span className="text-xs text-indigo-300 font-medium tracking-wide">METHODOLOGY</span>
            </div>

            <h1 className="font-display text-4xl sm:text-5xl md:text-6xl font-bold leading-[1.08] tracking-tight mb-6">
              <span className="text-white">16-stage verification.</span>
              <br />
              <span className="nx-gradient-text">Every claim traced.</span>
            </h1>

            <p className="text-xl text-white/40 leading-relaxed max-w-2xl mx-auto mb-5 font-light tracking-wide">
              The autonomous verification pipeline.
            </p>
            <p className="text-sm text-white/25 max-w-md mx-auto mb-10 leading-loose tracking-wide">
              22 researchers · 16 verification stages · 250M+ sources · full source traceability
            </p>

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                onClick={() => { setAuthRedirect('dashboard'); setShowAuthModal(true); }}
                className="group px-8 py-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm tracking-wide transition-all duration-300 shadow-lg shadow-amber-300/10 hover:shadow-amber-300/20 hover:scale-[1.02] inline-flex items-center gap-2"
              >
                Access the Council — free
                <ArrowRight size={16} className="group-hover:translate-x-0.5 transition-transform" />
              </button>
              <button
                onClick={() => { setAuthRedirect('studio'); setShowAuthModal(true); }}
                className="px-8 py-4 rounded-xl border border-white/[0.07] bg-white/[0.03] text-white/50 font-medium text-sm tracking-wide hover:bg-white/[0.06] hover:text-white/80 hover:border-white/[0.12] transition-all duration-200"
              >
                Commission research
              </button>
            </div>
          </div>

          {/* Protocol core */}
          <GreekProtocolStrip className="mb-8" />

          {/* Protocol core */}
          <div className="relative mb-24 rounded-[28px] border border-indigo-400/15 bg-[#0b0b12]/80 overflow-hidden">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_20%,rgba(99,102,241,0.16),transparent_32%),radial-gradient(circle_at_86%_46%,rgba(212,175,55,0.08),transparent_34%)]" />
            <div className="absolute inset-0 nx-grid-bg opacity-20" />
            <div className="relative p-7 sm:p-10">
              <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-8 mb-8">
                <div>
                  <p className="text-xs text-indigo-300/75 font-medium tracking-[0.22em] uppercase mb-4">Protocol Core</p>
                  <h2 className="font-display text-3xl sm:text-4xl font-bold text-white mb-3">The publication gate is a machine.</h2>
                  <p className="text-sm text-white/40 max-w-2xl leading-relaxed">
                    Every report moves through a controlled sequence: collect, enrich, rank, read, synthesize, challenge, verify, render, publish. Failure at any gate downgrades, revises, or blocks publication.
                  </p>
                </div>
                <div className="rounded-xl border border-white/[0.07] bg-white/[0.035] px-5 py-4">
                  <div className="text-[10px] text-white/25 uppercase tracking-[0.18em]">Gate status</div>
                  <div className="mt-1 text-lg text-emerald-300 font-semibold">fail-closed</div>
                </div>
              </div>

              <div className="grid md:grid-cols-4 gap-3">
                {[
                  { label: "Corpus", value: "source diversity", icon: Database },
                  { label: "Claims", value: "span-bound", icon: FileText },
                  { label: "Dissent", value: "steel-man", icon: Scale },
                  { label: "Release", value: "thresholded", icon: Shield },
                ].map((item) => {
                  const CIcon = item.icon;
                  return (
                    <div key={item.label} className="rounded-xl border border-white/[0.06] bg-black/20 p-4">
                      <CIcon size={16} className="text-indigo-300/75 mb-5" />
                      <div className="text-[10px] text-white/25 uppercase tracking-[0.16em]">{item.label}</div>
                      <div className="text-sm text-white/75 font-medium mt-1">{item.value}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Pillars */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-24">
            {pillars.map((item, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: i * 0.1, ease: [0.23, 1, 0.32, 1] }}
                className="group relative p-7 rounded-xl border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] hover:border-indigo-500/15 hover:-translate-y-1 transition-all duration-300 overflow-hidden"
              >
                <div className="absolute top-0 left-0 right-0 h-px" style={{ background: 'linear-gradient(90deg,rgba(99,102,241,0.4),rgba(139,92,246,0.3),transparent)' }} />
                <div className="w-10 h-10 rounded-lg bg-indigo-500/[0.08] border border-indigo-500/15 flex items-center justify-center mb-5 group-hover:border-indigo-500/30 transition-colors">
                  <item.icon size={18} className="text-indigo-400/70" />
                </div>
                <h3 className="font-display text-base font-semibold text-white mb-2">{item.title}</h3>
                <p className="text-sm text-white/40 leading-relaxed">{item.description}</p>
              </motion.div>
            ))}
          </div>

          {/* Pipeline Demo */}
          {(() => {
            const DEMO_STEPS = [
              { label: "Collecting sources",   detail: "847 documents retrieved across 60+ providers",       duration: 1400 },
              { label: "Indexing & enriching", detail: "Authors, institutions, DOIs resolved",                duration: 1200 },
              { label: "Ranking evidence",     detail: "Top 22 sources selected by quality & recency",       duration: 1000 },
              { label: "Reading abstracts",    detail: "Claims, methods, results extracted per source",      duration: 1300 },
              { label: "Synthesizing",         detail: "Consensus · Disagreements · Strategic implications",  duration: 1500 },
              { label: "Verifying citations",  detail: "All [SRC-N] references validated against sources",   duration: 900  },
              { label: "Publishing",           detail: "Report signed and released to the Council",          duration: 800  },
            ];
            const DEMO_QUERY = "What is the macroeconomic impact of carbon pricing on industrial competitiveness?";
            const DEMO_EXCERPT = `Carbon pricing mechanisms demonstrate a statistically significant negative correlation with short-term industrial output in energy-intensive sectors [SRC-3][SRC-7], though longitudinal evidence suggests competitive adaptation within 5–8 years [SRC-1][SRC-12]. Border carbon adjustments substantially mitigate leakage risks [SRC-5], while revenue recycling into R&D amplifies net productivity gains [SRC-9][SRC-14].`;
            return (
              <div className="-mx-6 sm:-mx-8 mb-24">
                <PipelineDemo
                  steps={DEMO_STEPS}
                  query={DEMO_QUERY}
                  excerpt={DEMO_EXCERPT}
                  onCTA={() => setShowAuthModal(true)}
                />
              </div>
            );
          })()}

          {/* Agent Pipeline */}
          <div className="mb-24">
            <div className="mb-12">
              <p className="text-xs text-indigo-400/70 font-medium tracking-[0.2em] uppercase mb-4">Architecture</p>
              <h2 className="font-display text-3xl sm:text-4xl font-bold text-white mb-3">
                16-stage autonomous pipeline
              </h2>
              <p className="text-base text-white/40 max-w-2xl">
                Single responsibility principle. Sequential execution. Each agent validates the previous step's output. 
                Input: research question. Output: verified brief with source traceability.
              </p>
            </div>

            <div className="space-y-3">
              {agents.map((agent, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -12 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, delay: Math.min(i * 0.025, 0.35), ease: [0.23, 1, 0.32, 1] }}
                  className="group relative p-6 rounded-xl border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.03] hover:border-white/[0.10] hover:-translate-y-0.5 transition-all duration-300 overflow-hidden"
                >
                  <div className={`absolute left-0 top-3 bottom-3 w-[3px] ${agent.color} rounded-full opacity-50`} />
                  <div className="flex items-start gap-5">
                    {/* Step indicator */}
                    <div className="flex-shrink-0 flex flex-col items-center">
                      <div className={`w-10 h-10 rounded-lg ${agent.color} flex items-center justify-center shadow-lg`}>
                        <agent.icon size={16} className="text-white" />
                      </div>
                      {i < agents.length - 1 && (
                        <div className="w-px h-full min-h-[20px] bg-white/[0.06] mt-2" />
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-1">
                        <h3 className="font-display text-sm font-semibold text-white">{agent.name}</h3>
                        <span className="text-[10px] font-mono text-white/20 bg-white/[0.04] px-2 py-0.5 rounded">{String(i + 1).padStart(2, '0')}</span>
                        <span className="text-xs text-white/30">{agent.purpose}</span>
                      </div>
                      <p className="text-sm text-white/40 mb-3">{agent.description}</p>

                      {/* IO chips */}
                      <div className="flex flex-wrap gap-4 text-xs">
                        <div className="flex items-center gap-2">
                          <span className="text-white/20">In:</span>
                          <div className="flex flex-wrap gap-1">
                            {agent.inputs.map((inp, j) => (
                              <span key={j} className="px-2 py-0.5 bg-white/[0.04] border border-white/[0.06] rounded text-white/40">{inp}</span>
                            ))}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-white/20">Out:</span>
                          <div className="flex flex-wrap gap-1">
                            {agent.outputs.map((out, j) => (
                              <span key={j} className="px-2 py-0.5 bg-indigo-500/[0.06] border border-indigo-500/10 rounded text-indigo-300/60">{out}</span>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Providers */}
                      <div className="flex flex-wrap gap-1 mt-2">
                        {agent.providers.map((p, j) => (
                          <span key={j} className="text-[10px] text-white/20">{p}{j < agent.providers.length - 1 ? " ·" : ""}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>

          {/* Guarantees */}
          <div className="mb-24">
            <div className="mb-12">
              <p className="text-xs text-indigo-400/70 font-medium tracking-[0.2em] uppercase mb-4">Guarantees</p>
              <h2 className="font-display text-3xl sm:text-4xl font-bold text-white mb-3">
                Foundational principles
              </h2>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              {guarantees.map((item, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.45, delay: i * 0.08, ease: [0.23, 1, 0.32, 1] }}
                  className="group relative p-7 rounded-xl border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/[0.12] hover:-translate-y-0.5 transition-all duration-300 overflow-hidden"
                >
                  <div className="absolute top-0 left-0 right-0 h-px" style={{ background: 'linear-gradient(90deg,rgba(212,175,55,0.4),rgba(99,102,241,0.2),transparent)' }} />
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-6 h-6 rounded-md bg-white/[0.06] flex items-center justify-center text-xs font-mono text-white/30 font-medium">
                      {String(i + 1).padStart(2, '0')}
                    </div>
                    <h3 className="font-display text-base font-semibold text-white">{item.title}</h3>
                  </div>
                  <p className="text-sm text-white/40 leading-relaxed pl-9">{item.description}</p>
                </motion.div>
              ))}
            </div>
          </div>

          {/* CTA */}
          <div className="relative text-center py-16">
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-[400px] h-[250px] bg-indigo-500/[0.07] rounded-full blur-[100px]" />
            </div>
            <div className="relative">
              <h2 className="font-display text-3xl sm:text-4xl font-bold text-white mb-4">
                Read the Council's latest brief.<br /><span className="nx-gradient-text">Free — no account required.</span>
              </h2>
              <p className="text-base text-white/35 mb-8 max-w-xl mx-auto tracking-wide">
                Every publication is open. Commission your own research through StudioX.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-6">
                <button
                  onClick={() => { setAuthRedirect('dashboard'); setShowAuthModal(true); }}
                  className="group px-8 py-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm tracking-wide transition-all duration-300 shadow-lg shadow-amber-300/10 hover:shadow-amber-300/20 hover:scale-[1.02] inline-flex items-center gap-2"
                >
                  Access the Council — free
                  <ArrowRight size={16} className="group-hover:translate-x-0.5 transition-transform" />
                </button>
                <button
                  onClick={() => { setAuthRedirect('studio'); setShowAuthModal(true); }}
                  className="px-8 py-4 rounded-xl border border-white/[0.07] bg-white/[0.03] text-white/50 font-medium text-sm tracking-wide hover:bg-white/[0.06] hover:text-white/80 hover:border-white/[0.12] transition-all duration-200"
                >
                  Commission research
                </button>
              </div>
              <div className="flex items-center justify-center gap-5 text-xs text-white/30">
                <span>Free — no account required</span>
                <span className="w-1 h-1 rounded-full bg-white/10" />
                <span>StudioX on demand</span>
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
          onSignupSuccess={() => {
            setShowAuthModal(false);
            router.push(authRedirect === 'studio' ? '/studio' : '/dashboard');
          }}
        />
      )}
    </>
  );
}
