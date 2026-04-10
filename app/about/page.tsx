"use client";
/**
 * About Page — Agentic Think Tank
 * 
 * Purpose: Who we are, why NomosX exists, our vision for autonomous research
 * UX: Storytelling, institutional credibility, convert curiosity → trust
 */

import React from 'react';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AuthModal from '@/components/AuthModal';
import PublicNav from '@/components/PublicNav';
import { RESEARCHERS } from '@/lib/researchers';
import { Brain, Shield, ArrowRight, Globe, Lightbulb } from 'lucide-react';
import { NomosXLogo } from '@/components/brand/NomosXLogo';
import SiteFooter from '@/components/SiteFooter';
import { motion } from 'framer-motion';

export default function AboutPage() {
  const router = useRouter();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const vision = [
    {
      icon: Globe,
      title: "Intelligence for everyone, not just institutions",
      description: "Verified research should not be reserved for Fortune 500 organizations. We built an autonomous council of 22 AI researchers so that anyone — from a student to a policy team — can access the complete, sourced picture."
    },
    {
      icon: Brain,
      title: "Multi-agent research architecture",
      description: "16-agent sequential pipeline: SCOUT → INDEX → EMBED → RANK → READER → ANALYST → COUNCIL (22 researchers) → GUARD → VERIFIER → CRITICAL → DEBATE → META → DEVIL → GRAPH → EDITOR → PUBLISH. Each agent validates the previous output."
    },
    {
      icon: Shield,
      title: "Trust through traceability",
      description: "Every claim links to its source. Every source links to its DOI. Every decision is logged. In an era of misinformation, traceability is the only path to trust."
    },
    {
      icon: Lightbulb,
      title: "Signal over noise",
      description: "250M+ sources generate noise. Our 16-agent pipeline filters for quality, cross-validates through adversarial review, and delivers only verified, evidence-based intelligence."
    }
  ];

  const timeline = [
    {
      year: "2024",
      title: "The diagnosis",
      description: "Traditional think tanks publish in months. Most AI tools produce shallow summaries. Decision teams need a middle path: fast, rigorous, and reliable."
    },
    {
      year: "2025",
      title: "The experimentation",
      description: "We built the first autonomous research pipeline: multi-agent orchestration, editorial filters, and hard quality thresholds. Institutional rigor delivered at unprecedented speed."
    },
    {
      year: "2026",
      title: "The institution",
      description: "NomosX now operates as a fully autonomous think tank. 250M+ sources monitored, institution-grade publications delivered to decision-makers worldwide."
    }
  ];

  const values = [
    {
      title: "Rigor before speed",
      description: "We prefer being slower and right over fast and wrong. Every publication goes through multiple validation layers."
    },
    {
      title: "Quality before quantity",
      description: "Every publication meets institutional standards. Our editorial filter ensures only rigorous intelligence is delivered."
    },
    {
      title: "Transparency before trust",
      description: "We do not ask for blind trust. We show our sources, reasoning, and confidence levels."
    },
    {
      title: "Autonomy before control",
      description: "The council operates with full editorial independence. An autonomous system that thinks, evaluates, and publishes like a real research institution."
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
        <PublicNav currentPage="about" onSignInClick={() => setShowAuthModal(true)} />

        <div className="relative z-10 max-w-5xl mx-auto px-6 sm:px-8 py-20 sm:py-28">
          {/* Hero */}
          <div className={`text-center mb-24 ${mounted ? 'animate-fade-in' : 'opacity-0'}`}>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-indigo-500/20 bg-indigo-500/5 mb-8">
              <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse-glow" />
              <span className="text-xs text-indigo-300 font-medium tracking-wide">ABOUT</span>
            </div>

            <h1 className="font-display text-4xl sm:text-5xl md:text-6xl font-semibold leading-[1.08] tracking-tight mb-6">
              <span className="text-white">The first autonomous</span>
              <br />
              <span className="nx-gradient-text">think tank.</span>
            </h1>

            <p className="text-lg text-white/50 leading-relaxed max-w-2xl mx-auto mb-8 font-light">
              Autonomous research infrastructure. {RESEARCHERS.length} domain-specialized researchers. 16-agent verification pipeline. 250M+ academic sources. Every claim sourced, every source verified.
            </p>

            <button 
              onClick={() => setShowAuthModal(true)}
              className="group px-6 py-3 rounded-lg bg-gradient-to-r from-indigo-500 to-violet-500 hover:from-indigo-400 hover:to-violet-400 text-white font-medium text-sm transition-all duration-300 shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40 hover:scale-[1.03] inline-flex items-center gap-2"
            >
              Access institutional intelligence — Free tier
              <ArrowRight size={16} className="group-hover:translate-x-0.5 transition-transform" />
            </button>
          </div>

          {/* Stats row */}
          <motion.div
            className="flex flex-wrap items-center justify-center gap-8 sm:gap-16 border-t border-b border-white/[0.05] py-10 mb-24"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            {[
              { value: `${RESEARCHERS.length}`, label: 'PhD researchers' },
              { value: '16', label: 'Autonomous agents' },
              { value: '250M+', label: 'Academic sources' },
              { value: '60+', label: 'Data providers' },
            ].map((s, i) => (
              <div key={i} className="text-center">
                <div className="font-display text-3xl sm:text-4xl font-bold nx-gradient-text">{s.value}</div>
                <div className="text-xs text-white/30 mt-1 tracking-wide">{s.label}</div>
              </div>
            ))}
          </motion.div>

          {/* Vision */}
          <div className="mb-24">
            <div className="mb-12">
              <p className="text-xs text-indigo-400/80 font-medium tracking-[0.2em] uppercase mb-4">Our vision</p>
              <h2 className="font-display text-3xl sm:text-4xl font-semibold text-white mb-3">
                Why NomosX exists
              </h2>
              <p className="text-base text-white/40 max-w-2xl">
                The future of strategic intelligence is autonomous, transparent, 
                and accessible to every decisive team.
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              {vision.map((item, i) => (
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
          </div>

          {/* Timeline */}
          <div className="mb-24">
            <div className="mb-12">
              <p className="text-xs text-indigo-400/80 font-medium tracking-[0.2em] uppercase mb-4">Our timeline</p>
              <h2 className="font-display text-3xl sm:text-4xl font-semibold text-white mb-3">
                From idea to institution
              </h2>
              <p className="text-base text-white/40 max-w-2xl">
                The path from diagnosis to a fully autonomous think tank.
              </p>
            </div>

            <div className="space-y-4">
              {timeline.map((item, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: i * 0.12, ease: [0.23, 1, 0.32, 1] }}
                  className="group flex items-start gap-6 p-7 rounded-xl border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/[0.12] hover:-translate-y-0.5 transition-all duration-300"
                >
                  <div className="flex-shrink-0 w-16 h-16 rounded-xl bg-gradient-to-br from-indigo-500/10 to-violet-500/5 border border-indigo-500/15 flex items-center justify-center group-hover:border-indigo-500/30 transition-colors">
                    <span className="font-display text-lg font-semibold text-indigo-400">{item.year}</span>
                  </div>
                  <div>
                    <h3 className="font-display text-base font-semibold text-white mb-1.5">{item.title}</h3>
                    <p className="text-sm text-white/40 leading-relaxed">{item.description}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>

          {/* Values */}
          <div className="mb-24">
            <div className="mb-12">
              <p className="text-xs text-indigo-400/80 font-medium tracking-[0.2em] uppercase mb-4">Our principles</p>
              <h2 className="font-display text-3xl sm:text-4xl font-semibold text-white mb-3">
                What guides us
              </h2>
              <p className="text-base text-white/40 max-w-2xl">
                Four principles guiding every council-level decision.
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              {values.map((item, i) => (
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
                Autonomous research infrastructure.<br /><span className="nx-gradient-text">Open access.</span>
              </h2>
              <p className="text-base text-white/40 mb-8 max-w-xl mx-auto">
                22 researchers. 16 agents. 250M+ sources. Free tier available.
              </p>
              <button
                onClick={() => setShowAuthModal(true)}
                className="group px-6 py-3 rounded-lg bg-gradient-to-r from-indigo-500 to-violet-500 hover:from-indigo-400 hover:to-violet-400 text-white font-medium text-sm transition-all duration-300 shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40 hover:scale-[1.03] inline-flex items-center gap-2"
              >
                Access institutional intelligence — Free tier
                <ArrowRight size={16} className="group-hover:translate-x-0.5 transition-transform" />
              </button>
              <div className="flex items-center justify-center gap-5 mt-6 text-xs text-white/30">
                <span>Free 30-day trial</span>
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
