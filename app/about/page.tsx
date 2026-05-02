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
import { Brain, Shield, ArrowRight, Globe, Lightbulb, Database, Activity, Scale } from 'lucide-react';
import SiteFooter from '@/components/SiteFooter';
import { motion } from 'framer-motion';

export default function AboutPage() {
  const router = useRouter();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authRedirect, setAuthRedirect] = useState<'dashboard' | 'studio'>('dashboard');
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
      description: "A 16-stage sequential verification pipeline processes every research question — from source collection to adversarial challenge — before any publication is cleared. Each stage validates the output of the previous."
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
          <div className="absolute w-[900px] h-[700px] rounded-full -top-48 left-1/2 -translate-x-1/2 animate-aurora-1" style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.15) 0%, transparent 70%)' }} />
          <div className="absolute w-[600px] h-[600px] rounded-full top-1/3 -right-32 animate-aurora-2" style={{ background: 'radial-gradient(circle, rgba(139,92,246,0.09) 0%, transparent 70%)' }} />
          <div className="absolute w-[500px] h-[500px] rounded-full bottom-1/4 -left-24 animate-aurora-3" style={{ background: 'radial-gradient(circle, rgba(212,175,55,0.06) 0%, transparent 70%)' }} />
          <div className="nx-grid-bg absolute inset-0 opacity-30" />
        </div>

        {/* Nav */}
        <PublicNav currentPage="about" onSignInClick={() => setShowAuthModal(true)} />

        <div className="relative z-10 max-w-5xl mx-auto px-6 sm:px-8 py-20 sm:py-28">
          {/* Hero */}
          <div className={`nx-ancient-frame text-center mb-24 p-10 sm:p-12 ${mounted ? 'animate-fade-in' : 'opacity-0'}`}>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-amber-300/20 bg-amber-300/8 mb-8 nx-ancient-banner">
              <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse-glow" />
              <span className="text-xs text-indigo-300 font-medium tracking-wide">ABOUT</span>
            </div>

            <h1 className="font-display text-4xl sm:text-5xl md:text-6xl font-bold leading-[1.08] tracking-tight mb-6">
              <span className="text-white">The first autonomous</span>
              <br />
              <span className="nx-gradient-text">think tank.</span>
            </h1>

            <p className="text-xl text-white/40 leading-relaxed max-w-2xl mx-auto mb-5 font-light tracking-wide">
              The first fully autonomous think tank.
            </p>
            <p className="text-sm text-white/25 max-w-md mx-auto mb-10 leading-loose tracking-wide">
              {RESEARCHERS.length} researchers · 16-stage verification · 250M+ sources · every claim traced
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

          {/* Stats row */}
          <motion.div
            className="flex flex-wrap items-center justify-center border-t border-b border-white/[0.05] py-12 mb-24"
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

          {/* Institution OS */}
          <div className="mb-24 nx-oracle-panel overflow-hidden relative">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_22%,rgba(99,102,241,0.14),transparent_32%),radial-gradient(circle_at_84%_50%,rgba(212,175,55,0.08),transparent_34%)]" />
            <div className="absolute inset-0 nx-grid-bg opacity-20" />
            <div className="relative p-7 sm:p-10">
              <p className="text-xs text-indigo-300/75 font-medium tracking-[0.22em] uppercase mb-4">Institution OS</p>
              <h2 className="font-display text-3xl sm:text-4xl font-bold text-white mb-4">Not a chatbot. An operating institution.</h2>
              <p className="text-sm text-white/40 max-w-2xl leading-relaxed mb-8">
                NomosX is designed as a research organism: memory, source reputation, adversarial dissent, cadence, and publication thresholds are part of the operating system.
              </p>
              <div className="grid md:grid-cols-3 gap-3">
                {[
                  { icon: Database, title: "Institutional memory", text: "Concepts, claims, sources, and prior positions persist across reports." },
                  { icon: Scale, title: "Mandatory dissent", text: "Every thesis is challenged before it becomes a publication." },
                  { icon: Activity, title: "Continuous radar", text: "Signals are scanned continuously, but publication remains scarce." },
                ].map((item) => {
                  const OIcon = item.icon;
                  return (
                    <div key={item.title} className="rounded-xl border border-white/[0.06] bg-black/20 p-5">
                      <OIcon size={17} className="text-indigo-300/75 mb-5" />
                      <h3 className="text-sm font-semibold text-white mb-2">{item.title}</h3>
                      <p className="text-xs text-white/35 leading-relaxed">{item.text}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Vision */}
          <div className="mb-24">
            <div className="mb-12">
              <p className="text-xs text-indigo-400/70 font-medium tracking-[0.2em] uppercase mb-4">Our vision</p>
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
                  className="group nx-codex-cell"
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
          </div>

          {/* Timeline */}
          <div className="mb-24">
            <div className="mb-12">
              <p className="text-xs text-indigo-400/70 font-medium tracking-[0.2em] uppercase mb-4">Our timeline</p>
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
                  className="group nx-codex-cell"
                >
                  <div className="flex-shrink-0 w-16 h-16 rounded-xl bg-indigo-500/[0.06] border border-indigo-500/15 flex items-center justify-center group-hover:border-indigo-500/30 transition-colors">
                    <span className="font-display text-lg font-semibold text-indigo-400/80">{item.year}</span>
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
              <p className="text-xs text-indigo-400/70 font-medium tracking-[0.2em] uppercase mb-4">Our principles</p>
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
                  className="group nx-codex-cell"
                >
                  <div className="absolute top-0 left-0 right-0 h-px" style={{ background: 'linear-gradient(90deg,rgba(99,102,241,0.4),rgba(139,92,246,0.2),transparent)' }} />
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-6 h-6 rounded-md bg-indigo-500/[0.08] border border-indigo-500/15 flex items-center justify-center text-xs font-mono text-indigo-400/50 font-medium">
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
                The Council is open.<br /><span className="nx-gradient-text">Every brief is free.</span>
              </h2>
              <p className="text-base text-white/35 mb-8 max-w-xl mx-auto tracking-wide">
                22 researchers. 250M+ sources. Fully autonomous. No account required to read.
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
