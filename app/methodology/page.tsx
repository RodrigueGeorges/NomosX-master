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
import { NomosXLogo3D } from '@/components/brand/NomosXLogo3D';
import SiteFooter from '@/components/SiteFooter';
import { motion } from 'framer-motion';

export default function MethodologyPage() {
  const router = useRouter();
  const [showAuthModal, setShowAuthModal] = useState(false);
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
      name: "SCOUT",
      icon: Search,
      purpose: "Source discovery",
      description: "Queries 250M+ academic publications in parallel across 60+ providers.",
      inputs: ["Research query", "Provider list"],
      outputs: ["Source IDs", "Quality scores", "Raw metadata"],
      providers: ["OpenAlex", "Crossref", "Semantic Scholar", "arXiv", "PubMed", "CORE", "HAL", "Linkup", "GDELT"],
      color: "bg-indigo-500"
    },
    {
      name: "INDEX",
      icon: Database,
      purpose: "Identity enrichment",
      description: "Normalizes sources, resolves author identities via ORCID, and maps institutional affiliations via ROR.",
      inputs: ["SCOUT source IDs"],
      outputs: ["Enriched sources", "Author profiles", "Institution profiles"],
      providers: ["ORCID API", "ROR API", "Internal deduplication"],
      color: "bg-violet-500"
    },
    {
      name: "EMBED",
      icon: Zap,
      purpose: "Semantic vectors",
      description: "Generates text-embedding vectors for all sources. Powers semantic deduplication and similarity-based selection.",
      inputs: ["Enriched sources", "Title + abstract"],
      outputs: ["Vector embeddings", "Deduplicated source list"],
      providers: ["OpenAI text-embedding-3-small", "pgvector"],
      color: "bg-blue-500"
    },
    {
      name: "RANK",
      icon: BarChart3,
      purpose: "Strategic selection",
      description: "Selects the best sources using composite scoring: quality, novelty, recency, and provider diversity controls.",
      inputs: ["Enriched sources", "Query context"],
      outputs: ["Ranked sources", "Composite scores", "Relevance scores"],
      providers: ["Internal scoring algorithm"],
      color: "bg-purple-500"
    },
    {
      name: "READER V3",
      icon: FileText,
      purpose: "Content analysis",
      description: "Extracts key claims, methods, quantitative results, and limitations from full-text content including PDFs.",
      inputs: ["Ranked sources", "Analysis depth"],
      outputs: ["Structured readings", "Quantitative data", "Confidence scores"],
      providers: ["pdf-parse", "LLM extraction"],
      color: "bg-fuchsia-500"
    },
    {
      name: "ANALYST V3",
      icon: Brain,
      purpose: "3-pass synthesis",
      description: "Three-pass analysis: thematic mapping, contradiction detection, then unified synthesis with strategic implications.",
      inputs: ["Readings", "Research question", "Context"],
      outputs: ["Structured analysis", "Key findings", "Strategic implications"],
      providers: ["GPT-4o multi-pass"],
      color: "bg-pink-500"
    },
    {
      name: "COUNCIL",
      icon: Users,
      purpose: "22-researcher review",
      description: "22 domain-specialized PhD-calibrated AI researchers review the analysis in parallel — each within their domain: economics, geopolitics, climate, health, AI regulation, law, and 16 others.",
      inputs: ["Analysis draft", "Domain tags", "Source context"],
      outputs: ["Domain validations", "Expert annotations", "Consensus score"],
      providers: ["22 PhD-calibrated AI researchers"],
      color: "bg-indigo-600"
    },
    {
      name: "CITATION GUARD",
      icon: CheckCircle,
      purpose: "Citation integrity",
      description: "Validates that every [SRC-N] citation maps to a real, accessible source. Rejects any analysis with orphaned citations.",
      inputs: ["Full analysis", "Source list"],
      outputs: ["Validity score", "Invalid citations detected"],
      providers: ["Semantic validation", "LLM matching"],
      color: "bg-emerald-500"
    },
    {
      name: "VERIFIER",
      icon: Microscope,
      purpose: "Semantic cross-check",
      description: "Cross-validates every key claim against its cited sources. Flags unsupported assertions and downgrades confidence where evidence is insufficient.",
      inputs: ["Analysis claims", "All source content"],
      outputs: ["Verified claim list", "Confidence deltas", "Flagged assertions"],
      providers: ["Semantic engine", "LLM verification"],
      color: "bg-cyan-600"
    },
    {
      name: "CRITICAL LOOP V2",
      icon: Eye,
      purpose: "Iterative critique",
      description: "Three parallel critics review the analysis for 14 epistemic flaw types. If issues are found, the Analyst rewrites until quality thresholds are met.",
      inputs: ["Analysis", "Readings", "Quality thresholds"],
      outputs: ["Critique report", "Revised analysis", "Flaw categories"],
      providers: ["3 parallel LLM critics"],
      color: "bg-amber-500"
    },
    {
      name: "DEBATE",
      icon: Scale,
      purpose: "Adversarial review",
      description: "Steel-man adversarial debate: two LLM passes construct the strongest possible counter-arguments, then synthesize a balanced position.",
      inputs: ["Analysis", "Key claims"],
      outputs: ["Pro/con arguments", "Synthesis", "Confidence shift"],
      providers: ["GPT-4o adversarial"],
      color: "bg-red-500"
    },
    {
      name: "META-ANALYSIS",
      icon: BarChart3,
      purpose: "Statistical rigor",
      description: "Computes effect sizes (Cohen’s d), fixed/random effects models, I² heterogeneity, Egger’s bias test, and generates forest plots.",
      inputs: ["Quantitative readings", "Effect size data"],
      outputs: ["Forest plots", "Pooled estimates", "Heterogeneity stats"],
      providers: ["Statistical engine"],
      color: "bg-teal-500"
    },
    {
      name: "DEVIL'S ADVOCATE",
      icon: Flame,
      purpose: "Final stress-test",
      description: "Final adversarial challenge using the full debate context. Attempts to invalidate the core thesis with the strongest possible evidence-backed counter-argument before publication is allowed.",
      inputs: ["Analysis", "Debate context", "Core claims"],
      outputs: ["Adversarial brief", "Publish gate score"],
      providers: ["GPT-4o adversarial"],
      color: "bg-orange-500"
    },
    {
      name: "KNOWLEDGE GRAPH",
      icon: Globe,
      purpose: "Longitudinal tracking",
      description: "Builds and updates a concept graph across publications. Tracks how ideas evolve, which claims strengthen or weaken over time.",
      inputs: ["Analysis", "Existing graph"],
      outputs: ["ConceptNode updates", "Relation edges", "Trend signals"],
      providers: ["Prisma ORM", "Graph engine"],
      color: "bg-indigo-700"
    },
    {
      name: "EDITOR",
      icon: Layers,
      purpose: "Source-grounded render",
      description: "Renders the verified analysis into a premium HTML brief. All citations are hyperlinked, evidence quality is visualized, and source provenance is fully traced.",
      inputs: ["Final analysis", "Debate + meta results", "Source list"],
      outputs: ["HTML brief", "Citation map", "Evidence charts"],
      providers: ["Internal renderer", "Chart generator"],
      color: "bg-slate-500"
    },
    {
      name: "PUBLISH",
      icon: TrendingUp,
      purpose: "Autonomous publication",
      description: "Triggers autonomous publication if confidence thresholds are met. No human sign-off required. Notifies subscribers and updates the knowledge graph.",
      inputs: ["Rendered brief", "Publish gate score"],
      outputs: ["Published brief", "Subscriber notifications", "Graph update"],
      providers: ["Internal publisher", "Newsletter service"],
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
          <div className="absolute w-[800px] h-[600px] rounded-full -top-32 left-1/2 -translate-x-1/2 animate-aurora-1" style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.15) 0%, transparent 70%)' }} />
          <div className="absolute w-[500px] h-[500px] rounded-full top-1/3 -right-24 animate-aurora-2" style={{ background: 'radial-gradient(circle, rgba(139,92,246,0.09) 0%, transparent 70%)' }} />
          <div className="absolute w-[400px] h-[400px] rounded-full bottom-1/3 -left-16 animate-aurora-3" style={{ background: 'radial-gradient(circle, rgba(16,185,129,0.05) 0%, transparent 70%)' }} />
          <div className="nx-grid-bg absolute inset-0 opacity-25" />
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

            <h1 className="font-display text-4xl sm:text-5xl md:text-6xl font-semibold leading-[1.08] tracking-tight mb-6">
              <span className="text-white">16 autonomous agents.</span>
              <br />
              <span className="nx-gradient-text">Zero human intervention.</span>
            </h1>

            <p className="text-lg text-white/50 leading-relaxed max-w-2xl mx-auto mb-8 font-light">
              Sequential verification pipeline. 16 specialized agents. 22 domain researchers. 250M+ sources. Complete traceability from query to publication.
            </p>

            <button
              onClick={() => setShowAuthModal(true)}
              className="group px-6 py-3 rounded-lg bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-[#09090b] font-medium text-sm transition-all duration-300 shadow-lg shadow-amber-500/20 hover:shadow-amber-500/30 hover:scale-[1.03] inline-flex items-center gap-2"
            >
              Commission a research brief
              <ArrowRight size={16} className="group-hover:translate-x-0.5 transition-transform" />
            </button>
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
                className="group relative p-7 rounded-xl border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] hover:border-indigo-500/20 hover:-translate-y-1 transition-all duration-300 overflow-hidden"
              >
                <div className="absolute top-0 left-0 right-0 h-px" style={{ background: 'linear-gradient(90deg,rgba(99,102,241,0.7),rgba(139,92,246,0.4),transparent)' }} />
                <div className="w-10 h-10 rounded-lg bg-indigo-500/10 border border-indigo-500/15 flex items-center justify-center mb-5 group-hover:border-indigo-500/30 transition-colors">
                  <item.icon size={18} className="text-indigo-400" />
                </div>
                <h3 className="font-display text-base font-semibold text-white mb-2">{item.title}</h3>
                <p className="text-sm text-white/40 leading-relaxed">{item.description}</p>
              </motion.div>
            ))}
          </div>

          {/* Agent Pipeline */}
          <div className="mb-24">
            <div className="mb-12">
              <p className="text-xs text-indigo-400/80 font-medium tracking-[0.2em] uppercase mb-4">Architecture</p>
              <h2 className="font-display text-3xl sm:text-4xl font-semibold text-white mb-3">
                16-agent autonomous pipeline
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
              <p className="text-xs text-indigo-400/80 font-medium tracking-[0.2em] uppercase mb-4">Guarantees</p>
              <h2 className="font-display text-3xl sm:text-4xl font-semibold text-white mb-3">
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
                  <div className="absolute top-0 left-0 right-0 h-px" style={{ background: 'linear-gradient(90deg,rgba(99,102,241,0.5),rgba(139,92,246,0.3),transparent)' }} />
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
              <div className="w-[400px] h-[250px] bg-indigo-500/[0.08] rounded-full blur-[100px]" />
            </div>
            <div className="relative">
              <h2 className="font-display text-3xl sm:text-4xl font-semibold text-white mb-4">
                Pipeline demonstration.<br /><span className="nx-gradient-text">Free tier available.</span>
              </h2>
              <p className="text-base text-white/40 mb-8 max-w-xl mx-auto">
                Commission a research brief. Observe the 16-agent pipeline in operation. Average cycle: 3-5 minutes.
              </p>
              <button
                onClick={() => setShowAuthModal(true)}
                className="group px-6 py-3 rounded-lg bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-[#09090b] font-medium text-sm transition-all duration-300 shadow-lg shadow-amber-500/20 hover:shadow-amber-500/30 hover:scale-[1.03] inline-flex items-center gap-2"
              >
                Access institutional intelligence — Free tier
                <ArrowRight size={16} className="group-hover:translate-x-0.5 transition-transform" />
              </button>
              <div className="flex items-center justify-center gap-5 mt-6 text-xs text-white/30">
                <span>Free</span>
                <span className="w-1 h-1 rounded-full bg-white/10" />
                <span>No credit card</span>
                <span className="w-1 h-1 rounded-full bg-white/10" />
                <span>Cancel anytime</span>
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
          onSignupSuccess={() => setShowAuthModal(false)}
        />
      )}
    </>
  );
}
