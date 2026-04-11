"use client";
import React, { useState, useEffect } from 'react';

/**
 * Platform Page — Solve for Truth
 *
 * Nomos (νόμος): the law, the governing order, what must be true.
 * Doxa (δόξα): opinion, belief, the noise.
 * NomosX: we resolve the unknown — the X — into verified truth.
 *
 * This page tells that story. From noise → to ordered knowledge.
 */

import { useRouter } from 'next/navigation';
import AuthModal from '@/components/AuthModal';
import PublicNav from '@/components/PublicNav';
import SiteFooter from '@/components/SiteFooter';
import { Brain, Shield, BarChart3, ArrowRight, Eye, Search, FileText, Users, AlertTriangle, Rss, BookOpen, Scale, Target } from 'lucide-react';
import dynamic from 'next/dynamic';

const TruthOrb = dynamic(() => import('@/components/ui/TruthOrb'), { ssr: false });

export default function PlatformPage() {
  const router = useRouter();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const observer = new IntersectionObserver(
      (entries) => entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('is-visible'); }),
      { threshold: 0.12 }
    );
    document.querySelectorAll('.reveal-up').forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <div className="min-h-screen bg-[#09090b] text-white overflow-x-hidden">
        <div className="nx-noise" aria-hidden="true" />
        <div className="fixed inset-0 pointer-events-none overflow-hidden">
          <div className="absolute w-[900px] h-[700px] rounded-full -top-48 left-1/2 -translate-x-1/2 animate-aurora-1" style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.12) 0%, transparent 70%)' }} />
          <div className="absolute w-[600px] h-[600px] rounded-full top-1/3 -right-32 animate-aurora-2" style={{ background: 'radial-gradient(circle, rgba(212,175,55,0.06) 0%, transparent 70%)' }} />
          <div className="absolute w-[500px] h-[500px] rounded-full bottom-1/4 -left-24 animate-aurora-3" style={{ background: 'radial-gradient(circle, rgba(139,92,246,0.06) 0%, transparent 70%)' }} />
          <div className="nx-grid-bg absolute inset-0 opacity-30" />
        </div>

        <div className="relative z-10">
          <PublicNav currentPage="platform" onSignInClick={() => setShowAuthModal(true)} />

          {/* HERO — Doxa → Nomos */}
          <section className="relative px-6 sm:px-8 pt-24 sm:pt-32 pb-20">
            <div className="max-w-5xl mx-auto text-center">
              {/* TruthOrb — 3D metaphor: chaos resolving into order */}
              <div className={`flex justify-center mb-8 transition-opacity duration-700 ${mounted ? 'opacity-100' : 'opacity-0'}`}>
                <TruthOrb size={260} color="#6366F1" accentColor="#D4AF37" />
              </div>

              <div className={`inline-flex items-center gap-2.5 px-4 py-2 rounded-full border border-amber-500/20 bg-amber-500/5 mb-10 transition-opacity duration-700 delay-100 ${mounted ? 'opacity-100' : 'opacity-0'}`}>
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                <span className="text-xs text-amber-300/80 font-semibold tracking-[0.18em] uppercase">Solve for Truth</span>
              </div>

              <h1 className={`font-display text-4xl sm:text-5xl md:text-[3.8rem] font-bold leading-[1.05] tracking-tight mb-7 transition-all duration-700 delay-150 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-5'}`}>
                <span className="text-white/40">Doxa</span>
                <span className="text-white/20 mx-3 sm:mx-5">→</span>
                <span className="nx-gradient-text">Nomos</span>
              </h1>

              <p className={`text-lg sm:text-xl text-white/50 max-w-2xl mx-auto mb-4 leading-relaxed font-light transition-all duration-700 delay-200 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-5'}`}>
                From opinion to truth.
              </p>
              <p className={`text-sm text-white/30 max-w-xl mx-auto mb-10 leading-relaxed transition-all duration-700 delay-250 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-5'}`}>
                <span className="text-amber-400/60">νόμος</span> — the governing order, what must be true. <span className="text-white/20">δόξα</span> — opinion, the noise. NomosX resolves the unknown — the <span className="text-amber-400/80 font-semibold">X</span> — into verified truth. 250M+ sources. 22 researchers. 16 challenges. No opinion in the output.
              </p>

              <div className={`flex flex-col sm:flex-row gap-3 justify-center transition-all duration-700 delay-300 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-5'}`}>
                <button onClick={() => setShowAuthModal(true)} className="group px-7 py-3.5 rounded-xl bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-[#09090b] font-semibold text-sm transition-all duration-300 shadow-lg shadow-amber-500/20 hover:shadow-amber-500/40 hover:scale-[1.03] flex items-center justify-center gap-2">
                  Read the truth — Free
                  <ArrowRight size={15} className="group-hover:translate-x-0.5 transition-transform" />
                </button>
                <button onClick={() => router.push('/articles')} className="px-7 py-3.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white/60 hover:text-white hover:bg-white/[0.07] hover:border-white/[0.15] font-medium text-sm transition-all duration-200">
                  Browse publications
                </button>
              </div>
            </div>
          </section>

          {/* DOXA → NOMOS — The transformation */}
          <section className="relative px-6 sm:px-8 py-24">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_50%,rgba(99,102,241,0.06),transparent_70%)] pointer-events-none" />
            <div className="max-w-5xl mx-auto relative">
              <div className="text-center mb-14">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-indigo-500/20 bg-indigo-500/5 mb-5">
                  <Shield size={12} className="text-indigo-400" />
                  <span className="text-[11px] text-indigo-300 font-semibold tracking-[0.2em] uppercase">Doxa → Nomos</span>
                </div>
                <h2 className="font-display text-3xl sm:text-4xl font-bold text-white mb-4">Every claim is challenged before it becomes truth.</h2>
                <p className="text-base text-white/40 max-w-xl mx-auto">Doxa is opinion. Nomos is what survives challenge. 16 validation steps ensure only what is verified becomes publication.</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { icon: Search, title: 'From noise to signal', desc: '250M+ sources scanned, enriched, and quality-filtered. Only what matters enters the pipeline.', color: 'indigo' },
                  { icon: Brain, title: 'From claim to tested claim', desc: '3-pass analysis with adversarial debate. Every argument tested against its strongest counter.', color: 'violet' },
                  { icon: Shield, title: 'From assertion to evidence', desc: 'Every [SRC-N] citation validated. Every numerical claim checked against source data.', color: 'emerald' },
                  { icon: AlertTriangle, title: 'From draft to revised truth', desc: 'A dedicated agent challenges every assumption. Fatal flaws trigger automatic revision before publication.', color: 'rose' },
                ].map((s, i) => {
                  const SIcon = s.icon;
                  return (
                    <div key={i} className={`rounded-2xl p-6 border ${
                      s.color === 'indigo' ? 'border-indigo-500/15 bg-indigo-500/[0.03]' :
                      s.color === 'violet' ? 'border-violet-500/15 bg-violet-500/[0.03]' :
                      s.color === 'emerald' ? 'border-emerald-500/15 bg-emerald-500/[0.03]' :
                      'border-rose-500/15 bg-rose-500/[0.03]'
                    } hover:border-white/[0.12] transition-all duration-300`}>
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-4 ${
                        s.color === 'indigo' ? 'bg-indigo-500/10 border border-indigo-500/15' :
                        s.color === 'violet' ? 'bg-violet-500/10 border border-violet-500/15' :
                        s.color === 'emerald' ? 'bg-emerald-500/10 border border-emerald-500/15' :
                        'bg-rose-500/10 border border-rose-500/15'
                      }`}>
                        <SIcon size={16} className={
                          s.color === 'indigo' ? 'text-indigo-400' :
                          s.color === 'violet' ? 'text-violet-400' :
                          s.color === 'emerald' ? 'text-emerald-400' :
                          'text-rose-400'
                        } />
                      </div>
                      <h3 className="text-sm font-semibold text-white mb-2">{s.title}</h3>
                      <p className="text-xs text-white/35 leading-relaxed">{s.desc}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          {/* THE COUNCIL — The differentiator */}
          <section className="relative px-6 sm:px-8 py-24">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_60%_at_50%_50%,rgba(99,102,241,0.08),transparent_70%)] pointer-events-none" />
            <div className="max-w-5xl mx-auto relative">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
                {/* Left: The story */}
                <div>
                  <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-indigo-500/20 bg-indigo-500/5 mb-6">
                    <Brain size={12} className="text-indigo-400" />
                    <span className="text-[11px] text-indigo-300 font-semibold tracking-[0.2em] uppercase">The Council</span>
                  </div>
                  <h2 className="font-display text-3xl sm:text-4xl font-bold text-white mb-6 leading-tight">
                    22 researchers.<br />
                    <span className="nx-gradient-text">Truth survives challenge.</span>
                  </h2>
                  <p className="text-base text-white/40 leading-relaxed mb-8">
                    The Council doesn&apos;t rubber-stamp — it challenges. The strongest counter-arguments are tested first. Every assumption is attacked before publication. Statistical meta-analysis across studies. What survives is truth. What doesn&apos;t, never gets published.
                  </p>

                  <div className="space-y-4">
                    {[
                      { icon: Scale, text: 'Strongest counter-arguments tested first', bg: 'bg-indigo-500/10', border: 'border-indigo-500/15', textC: 'text-indigo-400' },
                      { icon: AlertTriangle, text: 'Every assumption attacked before publication', bg: 'bg-rose-500/10', border: 'border-rose-500/15', textC: 'text-rose-400' },
                      { icon: BarChart3, text: 'Statistical meta-analysis: pooled effects, confidence intervals', bg: 'bg-sky-500/10', border: 'border-sky-500/15', textC: 'text-sky-400' },
                      { icon: Eye, text: 'What survives challenge becomes truth', bg: 'bg-emerald-500/10', border: 'border-emerald-500/15', textC: 'text-emerald-400' },
                    ].map((f, i) => {
                      const FIcon = f.icon;
                      return (
                        <div key={i} className="flex items-start gap-3">
                          <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${f.bg} ${f.border}`}>
                            <FIcon size={14} className={f.textC} />
                          </div>
                          <span className="text-sm text-white/55 pt-1">{f.text}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Right: Visual representation */}
                <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-8 relative overflow-hidden flex items-center justify-center">
                  <div className="absolute top-0 left-0 right-0 h-px" style={{ background: 'linear-gradient(90deg,#6366F1,#8B5CF6,transparent)' }} />
                  <div className="text-center">
                    <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
                      style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.30)' }}>
                      <span className="text-2xl font-bold text-indigo-300">22</span>
                    </div>
                    <p className="text-xs text-white/40 mb-2">Domain experts</p>
                    <p className="text-[10px] text-white/25">Across 22 disciplines</p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* OUTPUT — What you get */}
          <section className="relative px-6 sm:px-8 py-24">
            <div className="max-w-5xl mx-auto">
              <div className="text-center mb-14">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-violet-500/20 bg-violet-500/5 mb-5">
                  <BookOpen size={12} className="text-violet-400" />
                  <span className="text-[11px] text-violet-300 font-semibold tracking-[0.2em] uppercase">What truth looks like</span>
                </div>
                <h2 className="font-display text-3xl sm:text-4xl font-bold text-white mb-4">Two formats. One standard: truth.</h2>
                <p className="text-base text-white/40 max-w-xl mx-auto">Every publication — brief or strategic — survives the same 16 challenges. Same rigour. Different depth.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Brief */}
                <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-8 relative overflow-hidden hover:border-indigo-500/15 transition-all duration-300">
                  <div className="absolute top-0 left-0 right-0 h-px" style={{ background: 'linear-gradient(90deg,#6366F1,transparent)' }} />
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/15 flex items-center justify-center">
                      <FileText size={18} className="text-indigo-400" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-white">Executive Brief</h3>
                      <p className="text-xs text-white/30">3-5 pages</p>
                    </div>
                  </div>
                  <p className="text-sm text-white/40 leading-relaxed mb-6">Concise, decision-ready truth. Key findings, consensus, disagreements, and strategic implications — every claim traced to its source.</p>
                  <div className="space-y-2">
                    {['Consensus & disagreements', 'Pro/con debate synthesis', 'Evidence quality score', 'Full [SRC-N] citations'].map((f, i) => (
                      <div key={i} className="flex items-center gap-2.5">
                        <div className="w-3.5 h-3.5 rounded-full border border-indigo-400/40 flex items-center justify-center flex-shrink-0"><div className="w-1 h-1 rounded-full bg-indigo-400" /></div>
                        <span className="text-xs text-white/45">{f}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Strategic */}
                <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-8 relative overflow-hidden hover:border-violet-500/15 transition-all duration-300">
                  <div className="absolute top-0 left-0 right-0 h-px" style={{ background: 'linear-gradient(90deg,#8B5CF6,transparent)' }} />
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-xl bg-violet-500/10 border border-violet-500/15 flex items-center justify-center">
                      <Target size={18} className="text-violet-400" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-white">Strategic Report</h3>
                      <p className="text-xs text-white/30">10-15 pages</p>
                    </div>
                  </div>
                  <p className="text-sm text-white/40 leading-relaxed mb-6">Comprehensive truth with scenario planning, stakeholder impact, implementation roadmap, and full Council deliberations.</p>
                  <div className="space-y-2">
                    {['Literature review & thematic analysis', 'Scenario planning (3-5 scenarios)', 'Stakeholder impact matrix', 'Implementation roadmap & metrics'].map((f, i) => (
                      <div key={i} className="flex items-center gap-2.5">
                        <div className="w-3.5 h-3.5 rounded-full border border-violet-400/40 flex items-center justify-center flex-shrink-0"><div className="w-1 h-1 rounded-full bg-violet-400" /></div>
                        <span className="text-xs text-white/45">{f}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* NEWSLETTER — The delivery */}
          <section className="relative px-6 sm:px-8 py-24">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_60%_at_50%_50%,rgba(99,102,241,0.07),transparent_70%)] pointer-events-none" />
            <div className="max-w-3xl mx-auto">
              <div className="relative rounded-2xl border border-amber-500/15 bg-amber-500/[0.02] p-10 sm:p-14 overflow-hidden text-center">
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_110%,rgba(212,175,55,0.08),transparent_70%)] pointer-events-none" />
                <div className="relative">
                  <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-amber-500/20 bg-amber-500/5 mb-6">
                    <Rss size={11} className="text-amber-400" />
                    <span className="text-[11px] text-amber-300/80 font-semibold tracking-[0.2em] uppercase">Weekly Truth Dispatch</span>
                  </div>
                  <h2 className="font-display text-3xl sm:text-4xl font-bold text-white mb-4 leading-tight">
                    Truth, delivered weekly.<br />
                    <span className="bg-gradient-to-r from-amber-400 to-yellow-300 bg-clip-text text-transparent">Free.</span>
                  </h2>
                  <p className="text-base text-white/40 max-w-xl mx-auto mb-8">The most significant findings from 250M+ academic sources. What survived the Council. Every claim sourced. Every source verified. No opinion — just what the evidence says.</p>
                  <button onClick={() => setShowAuthModal(true)} className="group px-7 py-3.5 rounded-xl bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-[#09090b] font-semibold text-sm transition-all duration-300 shadow-lg shadow-amber-500/20 hover:shadow-amber-500/40 flex items-center justify-center gap-2 mx-auto">
                    Subscribe — free
                    <ArrowRight size={15} className="group-hover:translate-x-0.5 transition-transform" />
                  </button>
                  <p className="mt-5 text-xs text-white/20">No spam. Unsubscribe anytime. Weekly cadence.</p>
                </div>
              </div>
            </div>
          </section>


          {/* CTA */}
          <section className="relative px-6 sm:px-8 py-24">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_60%_at_50%_100%,rgba(99,102,241,0.07),transparent_70%)] pointer-events-none" />
            <div className="max-w-3xl mx-auto text-center">
              <h2 className="font-display text-3xl sm:text-4xl font-bold text-white mb-4">
                From doxa to nomos.<br />
                <span className="nx-gradient-text">From opinion to truth.</span>
              </h2>
              <p className="text-base text-white/40 max-w-xl mx-auto mb-8">Start reading what survived the Council. Free tier includes the weekly truth dispatch and access to all publications.</p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <button onClick={() => setShowAuthModal(true)} className="group px-7 py-3.5 rounded-xl bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-[#09090b] font-semibold text-sm transition-all duration-300 shadow-lg shadow-amber-500/20 hover:shadow-amber-500/40 flex items-center justify-center gap-2">
                  Start free
                  <ArrowRight size={15} className="group-hover:translate-x-0.5 transition-transform" />
                </button>
                <button onClick={() => router.push('/pricing')} className="px-7 py-3.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white/60 hover:text-white hover:bg-white/[0.07] font-medium text-sm transition-all duration-200">
                  View pricing
                </button>
              </div>
            </div>
          </section>

          <SiteFooter onSignInClick={() => setShowAuthModal(true)} />
        </div>
      </div>

      {showAuthModal && <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} />}
    </>
  );
}
