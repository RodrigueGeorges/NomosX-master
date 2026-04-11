"use client";

import React, { useState, useEffect, Suspense } from 'react';
import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import AuthModal from '@/components/AuthModal';
import PublicNav from '@/components/PublicNav';
import { Brain, Shield, BarChart3, TrendingUp, ArrowRight, Search, FileText, Microscope, Scale, Leaf, Calculator, Globe2, Rss, Clock, BookOpen, ExternalLink, Database, Zap, CheckCircle, Eye, AlertTriangle, Flame, Network, Activity, DollarSign, Target, Building2, Package } from 'lucide-react';
import { NomosXLogo3D } from '@/components/brand/NomosXLogo3D';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ThreeComponentWrapper } from '@/components/ThreeComponentWrapper';
import SiteFooter from '@/components/SiteFooter';
import { AnimatePresence, motion } from 'framer-motion';
import HoloOrb from '@/components/ui/HoloOrb';
import HoloPortrait from '@/components/ui/HoloPortrait';

const DOMAIN_ICONS: Record<string, React.ComponentType<{ size?: number | string; strokeWidth?: number | string; style?: React.CSSProperties }>> = {
  'Economics':      TrendingUp,
  'AI & Tech':      Brain,
  'Governance':     Network,
  'Health':         Activity,
  'Security':       Shield,
  'Law & Regulation': Scale,
  'Climate':        Leaf,
  'Statistics':     BarChart3,
  'Finance':        DollarSign,
  'Geopolitics':    Globe2,
  'Development':    Package,
  'Political Econ': Calculator,
  'Trade':          Database,
  'Defense':        Target,
  'Env. Law':       Leaf,
  'Peacebuilding':  Globe2,
  'History':        BookOpen,
  'Social Policy':  FileText,
  'Risk Analysis':  AlertTriangle,
  'Fintech':        Zap,
  'Behavioral':     Eye,
  'Urban Policy':   Building2,
};

const COUNCIL_RESEARCHERS = [
  { name: "Dr. Oikonomia (Οἰκονομία)", title: "Econometrics & Policy", institution: "Harvard Kennedy", initials: "ΟΟ", hex: "#6366F1", domain: "Economics", specialty: "Macro policy · Carbon pricing · Labor markets" },
  { name: "Dr. Techne (Τέχνη)", title: "AI & Digital Systems", institution: "Stanford", initials: "ΤΤ", hex: "#0EA5E9", domain: "AI & Tech", specialty: "LLM governance · Tech regulation · Digital infra" },
  { name: "Dr. Politeia (Πολιτεία)", title: "Public Policy", institution: "Oxford", initials: "ΠΠ", hex: "#8B5CF6", domain: "Governance", specialty: "Institutional design · Democracy · Africa policy" },
  { name: "Dr. Hygeia (Ὑγίεια)", title: "Epidemiology & Health", institution: "Johns Hopkins", initials: "ΗΗ", hex: "#10B981", domain: "Health", specialty: "Pandemic prep · Health equity · Biostatistics" },
  { name: "Dr. Aegis (Αἰγίς)", title: "Strategic Security", institution: "Georgetown", initials: "ΑΑ", hex: "#F59E0B", domain: "Security", specialty: "Geopolitics · Defense strategy · Intelligence" },
  { name: "Dr. Nomos (Νόμος)", title: "International Law", institution: "Yale Law", initials: "ΝΝ", hex: "#F43F5E", domain: "Law & Regulation", specialty: "Regulatory frameworks · Trade law · Human rights" },
  { name: "Dr. Gaia (Γαία)", title: "Climate & Environment", institution: "ETH Zürich", initials: "ΓΓ", hex: "#14B8A6", domain: "Climate", specialty: "Climate systems · Carbon markets · Net-zero policy" },
  { name: "Dr. Metron (Μέτρον)", title: "Quantitative Methods", institution: "MIT", initials: "ΜΜ", hex: "#6366F1", domain: "Statistics", specialty: "Causal inference · Meta-analysis · Bayesian methods" },
  { name: "Dr. Chrematistikos (Χρηματιστικός)", title: "Financial Economics", institution: "LSE", initials: "ΧΧ", hex: "#F97316", domain: "Finance", specialty: "Asset pricing · Market microstructure · Risk" },
  { name: "Dr. Polis (Πόλις)", title: "International Relations", institution: "Geneva / UN", initials: "ΠΠ", hex: "#EF4444", domain: "Geopolitics", specialty: "Great power dynamics · Multilateralism · Diplomacy" },
  { name: "Dr. Auxesis (Αὔξησις)", title: "Development Economics", institution: "World Bank", initials: "ΑΑ", hex: "#84CC16", domain: "Development", specialty: "Poverty reduction · Aid effectiveness · Trade" },
  { name: "Dr. Koinonia (Κοινωνία)", title: "Political Economy", institution: "Sciences Po", initials: "ΚΚ", hex: "#A855F7", domain: "Political Econ", specialty: "MENA politics · State capture · Rent economies" },
  { name: "Dr. Energeia (Ἐνέργεια)", title: "Trade & Innovation", institution: "UN ECLAC", initials: "ΕΕ", hex: "#22C55E", domain: "Trade", specialty: "Latin America · Tech transfer · Supply chains" },
  { name: "Dr. Thymos (Θυμός)", title: "Defense & Strategy", institution: "RAND Corp", initials: "ΘΘ", hex: "#FB923C", domain: "Defense", specialty: "Force posture · Deterrence · Nuclear stability" },
  { name: "Dr. Asty (Ἄστυ)", title: "Environmental Law", institution: "Kyoto University", initials: "ΑΑ", hex: "#FDE047", domain: "Env. Law", specialty: "International treaties · Carbon law · Biodiversity" },
  { name: "Dr. Bios (Βίος)", title: "Governance & Peace", institution: "AU Commission", initials: "ΒΒ", hex: "#F472B6", domain: "Peacebuilding", specialty: "Africa stability · Post-conflict · Institutions" },
  { name: "Dr. Logos (Λόγος)", title: "Economic History", institution: "Uppsala U.", initials: "ΛΛ", hex: "#64748B", domain: "History", specialty: "Long-run growth · Institutions · Crises" },
  { name: "Dr. Noesis (Νόησις)", title: "Social Policy", institution: "UNAM", initials: "ΝΝ", hex: "#EC4899", domain: "Social Policy", specialty: "Inequality · Social protection · Gender" },
  { name: "Dr. Digi (Δίγι)", title: "Geopolitical Risk", institution: "HSE Moscow", initials: "ΔΔ", hex: "#06B6D4", domain: "Risk Analysis", specialty: "Eurasia · Hybrid warfare · Sanctions" },
  { name: "Dr. Syntaxis (Σύνταξις)", title: "Fintech & Regulation", institution: "NUS Singapore", initials: "ΣΣ", hex: "#3B82F6", domain: "Fintech", specialty: "CBDC · Crypto regulation · Digital payments" },
  { name: "Dr. Chaos (Χάος)", title: "Behavioral Economics", institution: "INSEAD", initials: "ΧΧ", hex: "#6366F1", domain: "Behavioral", specialty: "Nudge theory · Decision bias · Policy design" },
  { name: "Dr. Kyvernon (Κύβερνον)", title: "Urban & Housing Policy", institution: "UCL", initials: "ΚΚ", hex: "#DC2626", domain: "Urban Policy", specialty: "Smart cities · Housing affordability · Mobility" },
];

type PublicBrief = {
  id: string;
  title: string;
  summary: string;
  type: string;
  publishedAt: string;
  readTime: number;
  sources: number;
  topics: string[];
  tier: string;
};

function HomePageContent() {
  const router = useRouter();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [activeR, setActiveR] = useState<number | null>(null);
  const [autoR, setAutoR]     = useState(0);
  const [newsletterEmail, setNewsletterEmail] = useState("");
  const [newsletterStatus, setNewsletterStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [latestBriefs, setLatestBriefs] = useState<PublicBrief[]>([]);
  const searchParams = useSearchParams();

  const [newsletterMessage, setNewsletterMessage] = useState("");

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries: IntersectionObserverEntry[]) => entries.forEach((e: IntersectionObserverEntry) => { if (e.isIntersecting) e.target.classList.add('is-visible'); }),
      { threshold: 0.12 }
    );
    document.querySelectorAll('.reveal-up').forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, [mounted]);

  useEffect(() => {
    if (activeR !== null) return;
    const t = setInterval(() => setAutoR((n: number) => (n + 1) % COUNCIL_RESEARCHERS.length), 5000);
    return () => clearInterval(t);
  }, [activeR]);

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
        setNewsletterMessage(data.message || "Check your inbox to confirm.");
        setNewsletterStatus("success");
      } else {
        setNewsletterStatus("error");
      }
    } catch { setNewsletterStatus("error"); }
  };

  useEffect(() => {
    setMounted(true);
    fetch('/api/auth/me').then(r => { if (r.ok) setIsAuthenticated(true); }).catch(() => {}).finally(() => setIsLoading(false));
    fetch('/api/public/briefs?limit=3').then(r => r.ok ? r.json() : null).then(d => { if (d?.briefs) setLatestBriefs(d.briefs); }).catch(() => {});

    // Handle auth redirect from middleware
    if (searchParams.get('auth') === 'required') {
      setShowAuthModal(true);
    }

    // Handle newsletter confirmation redirects
    const nl = searchParams.get('newsletter');
    if (nl === 'confirmed') {
      setNewsletterMessage('Subscription confirmed! Welcome to the NomosX dispatch.');
      setNewsletterStatus('success');
    } else if (nl === 'expired') {
      setNewsletterMessage('');
      setNewsletterStatus('error');
    }
  }, [searchParams]);

  const handleAuthSuccess = () => { setIsAuthenticated(true); setShowAuthModal(false); };

  if (isLoading) return (
    <div className="min-h-screen bg-[#09090b] flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
    </div>
  );

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-[#09090b] text-white overflow-x-hidden">

        <div className="nx-noise" aria-hidden="true" />

        <div className="fixed inset-0 pointer-events-none overflow-hidden">
          <div className="absolute w-[900px] h-[700px] rounded-full -top-48 left-1/2 -translate-x-1/2 animate-aurora-1" style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.18) 0%, transparent 70%)' }} />
          <div className="absolute w-[600px] h-[600px] rounded-full top-1/3 -right-32 animate-aurora-2" style={{ background: 'radial-gradient(circle, rgba(139,92,246,0.12) 0%, transparent 70%)' }} />
          <div className="absolute w-[500px] h-[500px] rounded-full bottom-1/4 -left-24 animate-aurora-3" style={{ background: 'radial-gradient(circle, rgba(16,185,129,0.07) 0%, transparent 70%)' }} />
          <div className="nx-grid-bg absolute inset-0 opacity-30" />
        </div>

        <div className="relative z-10">
          <PublicNav currentPage="home" onSignInClick={() => setShowAuthModal(true)} isAuthenticated={isAuthenticated} />

          {/* HERO */}
          <section className="relative px-6 sm:px-8 pt-24 sm:pt-32 pb-16">
            <div className="max-w-5xl mx-auto text-center">
              <div className={`flex justify-center mb-8 transition-opacity duration-700 ${mounted ? 'opacity-100' : 'opacity-0'}`}>
                <ThreeComponentWrapper>
                  <NomosXLogo3D size={140} />
                </ThreeComponentWrapper>
              </div>

              <div className={`inline-flex items-center gap-2.5 px-4 py-2 rounded-full border border-indigo-500/25 bg-indigo-500/8 mb-10 transition-opacity duration-700 ${mounted ? 'opacity-100' : 'opacity-0'}`}>
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-400" />
                </span>
                <span className="text-xs text-indigo-300 font-semibold tracking-[0.18em] uppercase">The First Autonomous Think Tank</span>
              </div>

              <h1 className={`font-display text-5xl sm:text-6xl md:text-[5.5rem] font-bold leading-[1.03] tracking-tight mb-7 transition-all duration-700 delay-100 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-5'}`}>
                <span className="text-white">22 PhD AI researchers.</span>
                <br />
                <span className="nx-gradient-text">16 autonomous agents.</span>
                <br />
                <span className="text-white/35">Institutional quality at AI speed.</span>
              </h1>
              
              <p className={`text-lg sm:text-xl text-white/50 max-w-2xl mx-auto mb-10 leading-relaxed font-light transition-all duration-700 delay-200 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-5'}`}>
                The complete picture, from 250M+ academic sources. Every claim sourced, every source verified. Zero opinion — just evidence.
              </p>

              <div className={`flex flex-col sm:flex-row gap-3 justify-center mb-12 transition-all duration-700 delay-300 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-5'}`}>
                <button onClick={() => setShowAuthModal(true)} className="group px-7 py-3.5 rounded-xl bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-[#09090b] font-semibold text-sm transition-all duration-300 shadow-lg shadow-amber-500/20 hover:shadow-amber-500/30 hover:scale-[1.03] flex items-center justify-center gap-2">
                  Access institutional intelligence — Free tier
                  <ArrowRight size={15} className="group-hover:translate-x-0.5 transition-transform" />
                </button>
                <button onClick={() => router.push('/methodology')} className="px-7 py-3.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white/60 hover:text-white hover:bg-white/[0.07] hover:border-white/[0.15] font-medium text-sm transition-all duration-200">
                  How it works
                </button>
              </div>

              <div className={`flex flex-wrap items-center justify-center transition-all duration-700 delay-400 ${mounted ? 'opacity-100' : 'opacity-0'}`}>
                {[{ value: "22", label: "PhD AI researchers" }, { value: "16", label: "Autonomous agents" }, { value: "250M+", label: "Academic sources" }, { value: "60+", label: "Data providers" }].map((s, i) => (
                  <React.Fragment key={i}>
                    {i > 0 && <div className="h-8 w-px bg-white/[0.08] mx-8 sm:mx-10" />}
                    <div className="text-center">
                      <div className="text-2xl sm:text-3xl font-display font-bold text-white">{s.value}</div>
                      <div className="text-[11px] text-white/30 mt-0.5 tracking-[0.08em]">{s.label}</div>
                    </div>
                  </React.Fragment>
                ))}
              </div>
            </div>
          </section>

          {/* BENTO GRID — Features */}
          <section className="relative px-6 sm:px-8 pb-8">
            <div className="max-w-5xl mx-auto">
              <div className="grid grid-cols-2 md:grid-cols-6 gap-3">

                {/* Council — hero card */}
                <div className="col-span-2 md:col-span-4 rounded-2xl relative overflow-hidden p-6 transition-all duration-300 hover:border-white/[0.11] group"
                  style={{ border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.02)', minHeight: '190px' }}>
                  <div className="absolute top-0 left-0 right-0 h-px" style={{ background: 'linear-gradient(90deg,#6366f1,#8B5CF6,transparent)' }} />
                  <div className="absolute -right-16 -top-16 w-52 h-52 rounded-full pointer-events-none" style={{ background: 'radial-gradient(circle,rgba(99,102,241,0.08) 0%,transparent 70%)' }} />
                  <p className="text-[10px] text-indigo-300 font-semibold tracking-[0.2em] uppercase mb-1.5">The Council</p>
                  <h3 className="text-lg sm:text-xl font-display font-semibold text-white mb-1">22 PhD AI Researchers</h3>
                  <p className="text-xs text-white/35 mb-5">Domain-specialized · Adversarial peer review at every stage</p>
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold text-indigo-300"
                      style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.30)' }}>
                      22
                    </div>
                    <span className="text-xs text-white/40">Domain experts</span>
                  </div>
                </div>

                {/* Sources */}
                <div className="col-span-2 md:col-span-2 rounded-2xl relative overflow-hidden p-5 flex flex-col justify-between hover:border-white/[0.10] transition-all duration-300"
                  style={{ border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.02)', minHeight: '190px' }}>
                  <div className="absolute top-0 left-0 right-0 h-px" style={{ background: 'linear-gradient(90deg,#10B981,transparent)' }} />
                  <p className="text-[10px] text-emerald-400 font-semibold tracking-[0.2em] uppercase">Sources</p>
                  <div>
                    <div className="text-4xl sm:text-5xl font-display font-bold text-white mb-1">250M+</div>
                    <p className="text-xs text-white/30">Academic & institutional documents</p>
                  </div>
                </div>

                {/* Agents */}
                <div className="col-span-1 md:col-span-2 rounded-2xl relative overflow-hidden p-5 flex flex-col justify-between hover:border-white/[0.10] transition-all duration-300"
                  style={{ border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.02)' }}>
                  <div className="absolute top-0 left-0 right-0 h-px" style={{ background: 'linear-gradient(90deg,#8B5CF6,transparent)' }} />
                  <p className="text-[10px] text-violet-300 font-semibold tracking-[0.2em] uppercase">Pipeline</p>
                  <div>
                    <div className="text-4xl sm:text-5xl font-display font-bold text-white mb-1">16</div>
                    <p className="text-xs text-white/30 mb-4">Autonomous agents</p>
                    <div className="flex gap-1 flex-wrap">
                      {['S','I','R','Rd','An','Cr','Gd','Ed'].map((s, i) => (
                        <div key={i} className="w-6 h-6 rounded-full flex items-center justify-center text-[8px] font-bold text-violet-300/70"
                          style={{ background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.22)' }}>{s}</div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Zero opinion */}
                <div className="col-span-1 md:col-span-2 rounded-2xl relative overflow-hidden p-5 flex flex-col justify-between hover:border-white/[0.10] transition-all duration-300"
                  style={{ border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.02)' }}>
                  <div className="absolute top-0 left-0 right-0 h-px" style={{ background: 'linear-gradient(90deg,#6366F1,transparent)' }} />
                  <p className="text-[10px] text-indigo-300 font-semibold tracking-[0.2em] uppercase">Objectivity</p>
                  <div>
                    <div className="text-4xl sm:text-5xl font-display font-bold text-white mb-1">0</div>
                    <p className="text-xs text-white/30">Editorial opinion · evidence only</p>
                  </div>
                </div>

                {/* Providers */}
                <div className="col-span-2 md:col-span-2 rounded-2xl relative overflow-hidden p-5 flex flex-col justify-between hover:border-white/[0.10] transition-all duration-300"
                  style={{ border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.02)' }}>
                  <div className="absolute top-0 left-0 right-0 h-px" style={{ background: 'linear-gradient(90deg,#0EA5E9,transparent)' }} />
                  <p className="text-[10px] text-sky-400 font-semibold tracking-[0.2em] uppercase">Coverage</p>
                  <div>
                    <div className="text-4xl sm:text-5xl font-display font-bold text-white mb-1">60+</div>
                    <p className="text-xs text-white/30">Live data providers</p>
                  </div>
                </div>

              </div>
            </div>
          </section>

          {/* THINK TANK */}
          <section className="relative px-6 sm:px-8 py-28 overflow-hidden">
            {/* Deep ambient glow */}
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_60%_at_50%_50%,rgba(99,102,241,0.10),transparent_70%)]" />
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-indigo-500/5 blur-[100px]" />
            </div>

            <div className="max-w-7xl mx-auto relative">
              <div className="text-center mb-20">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-indigo-500/20 bg-indigo-500/5 mb-6">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
                  <span className="text-[11px] text-indigo-300 font-semibold tracking-[0.2em] uppercase">The Think Tank</span>
                </div>
                <h2 className="font-display text-4xl sm:text-5xl md:text-6xl font-bold text-white mb-6 leading-tight">
                  22 domain-specialized researchers.<br />
                  <span className="nx-gradient-text">Adversarial peer review.</span>
                </h2>
                <p className="text-base sm:text-lg text-white/40 max-w-2xl mx-auto leading-relaxed">
                  Each researcher operates within a specific domain (economics, geopolitics, AI regulation, etc.). Cross-domain validation through adversarial review, steel-man debate, and statistical meta-analysis. Continuous operation.
                </p>
              </div>

              {/* Researcher Grid + Holographic Spotlight */}
              {(() => {
                const displayR = activeR !== null ? activeR : autoR;
                const N = COUNCIL_RESEARCHERS.length;
                const cur = COUNCIL_RESEARCHERS[displayR];

                return (
                  <div className="flex flex-col lg:flex-row gap-8 lg:gap-12 items-start">

                    {/* LEFT: 22-avatar holographic grid with HoloPortrait */}
                    <div className="flex-shrink-0 w-full lg:w-[320px]">
                      <div className="grid grid-cols-6 gap-2.5">
                        {COUNCIL_RESEARCHERS.map((r, i) => {
                          const isActive = i === displayR;
                          return (
                            <div key={i} className="relative aspect-square">
                              {/* Spinning conic ring — active only */}
                              {isActive && (
                                <>
                                  <div
                                    className="absolute inset-[-3px] rounded-full animate-holo-ring pointer-events-none"
                                    style={{
                                      background: `conic-gradient(from 0deg, transparent 0deg, ${r.hex} 80deg, rgba(0,255,200,0.9) 160deg, transparent 240deg, ${r.hex}80 320deg, transparent 360deg)`,
                                      zIndex: 1,
                                    }}
                                  />
                                  <div
                                    className="absolute inset-[2px] rounded-full pointer-events-none"
                                    style={{ background: 'rgba(9,9,11,0.92)', zIndex: 2 }}
                                  />
                                </>
                              )}
                              <button
                                title={r.name}
                                onClick={() => setAutoR(i)}
                                onMouseEnter={() => setActiveR(i)}
                                onMouseLeave={() => setActiveR(null)}
                                className={`absolute inset-0 rounded-full transition-all duration-300${isActive ? ' animate-holo-avatar' : ''}`}
                                style={{
                                  zIndex: 3,
                                  background: 'transparent',
                                  border: 'none',
                                }}
                              >
                                <Suspense fallback={
                                  <div
                                    className="w-full h-full rounded-full flex items-center justify-center font-bold text-white"
                                    style={{
                                      fontSize: '8px',
                                      backgroundColor: r.hex + (isActive ? '28' : '14'),
                                      border: `1px solid ${r.hex}${isActive ? '60' : '28'}`,
                                      boxShadow: isActive ? `0 0 14px ${r.hex}50, 0 0 28px ${r.hex}18` : 'none',
                                    }}
                                  >
                                    {r.initials}
                                  </div>
                                }>
                                  <ThreeComponentWrapper>
                                    <HoloPortrait hexColor={r.hex} initials={r.initials} size={40} />
                                  </ThreeComponentWrapper>
                                </Suspense>
                              </button>
                            </div>
                          );
                        })}
                      </div>
                      <div className="flex items-center justify-between mt-4">
                        <span className="text-[10px] text-white/15 font-mono tracking-[0.15em]">
                          {String(displayR + 1).padStart(2, '0')} / {N}
                        </span>
                        <div className="flex gap-1.5">
                          <button onClick={() => setAutoR((displayR - 1 + N) % N)}
                            className="w-7 h-7 rounded-full border border-white/[0.08] bg-white/[0.02] flex items-center justify-center text-white/30 hover:text-white/60 transition-all">
                            <svg width="11" height="11" viewBox="0 0 14 14" fill="none"><path d="M9 2L4 7L9 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                          </button>
                          <button onClick={() => setAutoR((displayR + 1) % N)}
                            className="w-7 h-7 rounded-full border border-white/[0.08] bg-white/[0.02] flex items-center justify-center text-white/30 hover:text-white/60 transition-all">
                            <svg width="11" height="11" viewBox="0 0 14 14" fill="none"><path d="M5 2L10 7L5 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* RIGHT: Holographic spotlight panel */}
                    <div className="flex-1">
                      <AnimatePresence mode="wait">
                        <motion.div
                          key={displayR}
                          initial={{ opacity: 0, y: 20, filter: 'blur(8px)' }}
                          animate={{ opacity: 1, y: 0,  filter: 'blur(0px)' }}
                          exit={{    opacity: 0, y: -12, filter: 'blur(5px)' }}
                          transition={{ duration: 0.55, ease: [0.23, 1, 0.32, 1] }}
                        >
                      <div
                        style={{ perspective: '1200px' }}
                        onMouseMove={(e) => {
                          const inner = e.currentTarget.firstElementChild as HTMLDivElement | null;
                          if (!inner) return;
                          const rect = e.currentTarget.getBoundingClientRect();
                          const x = ((e.clientY - rect.top)  / rect.height - 0.5) * 10;
                          const y = ((e.clientX - rect.left) / rect.width  - 0.5) * -10;
                          inner.style.transform = `rotateX(${x}deg) rotateY(${y}deg)`;
                          inner.style.transition = 'transform 0.1s ease';
                        }}
                        onMouseLeave={(e) => {
                          const inner = e.currentTarget.firstElementChild as HTMLDivElement | null;
                          if (!inner) return;
                          inner.style.transform = 'rotateX(0deg) rotateY(0deg)';
                          inner.style.transition = 'transform 0.8s cubic-bezier(0.23,1,0.32,1)';
                        }}
                      >
                      <div
                        className="rounded-2xl overflow-hidden relative"
                        style={{
                          border: `1px solid ${cur.hex}35`,
                          background: `linear-gradient(140deg, ${cur.hex}0C 0%, rgba(9,9,11,0.98) 55%)`,
                          boxShadow: `0 0 70px ${cur.hex}14, 0 20px 50px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.04)`,
                          transformStyle: 'preserve-3d',
                        }}
                      >
                        {/* Static scanlines */}
                        <div className="absolute inset-0 pointer-events-none rounded-2xl" style={{
                          backgroundImage: 'repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,255,200,0.012) 3px,rgba(0,255,200,0.012) 4px)',
                          zIndex: 1,
                        }} />
                        {/* Sweeping scan line */}
                        <div className="absolute inset-0 overflow-hidden pointer-events-none rounded-2xl" style={{ zIndex: 2 }}>
                          <div className="animate-holo-sweep w-full" style={{
                            height: '22%',
                            background: 'linear-gradient(180deg,transparent 0%,rgba(0,255,200,0.03) 50%,transparent 100%)',
                          }} />
                        </div>
                        {/* Conic sheen */}
                        <div className="absolute inset-0 pointer-events-none rounded-2xl" style={{
                          background: `conic-gradient(from 200deg at 70% 30%, transparent 0deg, ${cur.hex}06 60deg, rgba(0,255,200,0.04) 120deg, transparent 180deg)`,
                          zIndex: 3,
                        }} />

                        {/* Content */}
                        <div className="relative" style={{ zIndex: 10 }}>
                          <div className="h-px" style={{ background: `linear-gradient(90deg,${cur.hex}90,${cur.hex}30,transparent)` }} />
                          <div className="p-7 sm:p-9 flex flex-col items-center text-center gap-5">

                            {/* Holographic Domain Sigil */}
                            <div className="relative">
                              <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(circle, ${cur.hex}18 0%, transparent 60%)`, transform: 'scale(1.5)' }} />
                              <ThreeComponentWrapper>
                                <HoloOrb hexColor={cur.hex} size={190} />
                              </ThreeComponentWrapper>
                              {/* Domain icon — floating at center of orbital rings */}
                              <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ zIndex: 20 }}>
                                {(() => {
                                  const DomainIcon = DOMAIN_ICONS[cur.domain];
                                  if (!DomainIcon) return null;
                                  return (
                                    <div
                                      className="holo-domain-sigil"
                                      style={{ '--sigil-color': cur.hex } as React.CSSProperties}
                                    >
                                      <DomainIcon size={44} strokeWidth={1.2} style={{ color: cur.hex }} />
                                    </div>
                                  );
                                })()}
                              </div>
                            </div>

                            {/* Gradient divider */}
                            <div className="w-16 h-px" style={{ background: `linear-gradient(90deg,transparent,${cur.hex}60,transparent)` }} />

                            {/* Name + title */}
                            <div>
                              <h3 className="font-display text-2xl sm:text-[1.7rem] font-semibold text-white leading-tight mb-1.5">{cur.name}</h3>
                              <p className="text-sm text-white/40">{cur.title}</p>
                            </div>

                            {/* Badges */}
                            <div className="flex flex-wrap gap-2 justify-center">
                              <span className="px-2.5 py-1 rounded-full border border-white/[0.08] bg-white/[0.02] text-[11px] text-white/40">{cur.institution}</span>
                              <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold"
                                style={{ backgroundColor: cur.hex + '18', border: `1px solid ${cur.hex}35`, color: cur.hex + 'CC' }}>
                                {cur.domain}
                              </span>
                            </div>

                            {/* Research focus */}
                            <div className="w-full">
                              <p className="text-[10px] text-white/20 font-mono tracking-[0.2em] uppercase mb-2">Research Focus</p>
                              <p className="text-sm text-white/45 leading-relaxed">{cur.specialty}</p>
                            </div>

                            {/* Footer */}
                            <div className="w-full flex items-center justify-between pt-4 border-t border-white/[0.04]">
                              <span className="text-[10px] text-white/15 font-mono tracking-[0.15em]">{String(displayR + 1).padStart(2, '0')} — {N}</span>
                              <span className="text-[10px] text-white/10">Adversarial peer review · 22 validators</span>
                            </div>

                          </div>
                        </div>
                      </div>{/* rounded-2xl card */}
                      </div>{/* perspective tilt wrapper */}
                        </motion.div>
                      </AnimatePresence>
                    </div>{/* flex-1 */}

                  </div>
                );
              })()}
            </div>
          </section>

          {/* LIVE DEMO */}
          <section className="relative px-6 sm:px-8 py-24">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_50%,rgba(99,102,241,0.08),transparent_70%)] pointer-events-none" />
            <div className="max-w-5xl mx-auto relative">
              <div className="text-center mb-14">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-indigo-500/20 bg-indigo-500/5 mb-5">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
                  <span className="text-[11px] text-indigo-300 font-semibold tracking-[0.2em] uppercase">16-Agent Pipeline · Live</span>
                </div>
                <h2 className="font-display text-3xl sm:text-4xl font-bold text-white mb-4">Autonomous research, end to end.</h2>
                <p className="text-base text-white/40 max-w-xl mx-auto">16 agents in sequence. 22 researchers validate at key stages. From query to published brief — fully autonomous.</p>
              </div>
            </div>
          </section>

          {/* LATEST PUBLICATIONS */}
          <section className="relative px-6 sm:px-8 py-24">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_55%_45%_at_50%_50%,rgba(99,102,241,0.06),transparent_70%)] pointer-events-none" />
            <div className="max-w-5xl mx-auto">
              <div className="flex items-end justify-between mb-10">
                <div>
                  <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-indigo-500/20 bg-indigo-500/5 mb-4">
                    <span className="relative flex h-1.5 w-1.5"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75" /><span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-indigo-400" /></span>
                    <span className="text-[11px] text-indigo-300 font-semibold tracking-[0.2em] uppercase">Auto-published · Live</span>
                  </div>
                  <h2 className="font-display text-3xl sm:text-4xl font-bold text-white">Live intelligence feed</h2>
                  <p className="text-base text-white/40 mt-2">Multi-pass validation. Full source traceability. Zero editorial opinion.</p>
                </div>
                <button onClick={() => router.push('/articles')} className="hidden sm:flex items-center gap-2 text-sm text-white/35 hover:text-white/60 transition-colors">
                  View all <ExternalLink size={13} />
                </button>
              </div>
              {latestBriefs.length > 0 ? (
                <div className="space-y-3">
                  {latestBriefs.map((brief) => (
                    <div key={brief.id} onClick={() => router.push(`/articles/${brief.id}`)} className="group relative rounded-xl border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] hover:border-indigo-500/20 transition-all duration-300 p-5 cursor-pointer">
                      <div className="flex items-start gap-4">
                        <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/15 flex items-center justify-center mt-0.5">
                          <BookOpen size={14} className="text-indigo-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-4 mb-1.5">
                            <h3 className="text-sm font-semibold text-white/90 group-hover:text-white transition-colors leading-snug line-clamp-1">{brief.title}</h3>
                            <div className="flex items-center gap-3 flex-shrink-0 text-xs text-white/30">
                              <span className="flex items-center gap-1"><Clock size={11} />{brief.readTime} min</span>
                              <span>{brief.sources} sources</span>
                            </div>
                          </div>
                          <p className="text-xs text-white/40 leading-relaxed line-clamp-2 mb-2">{brief.summary}</p>
                          <div className="flex items-center gap-2">
                            {brief.topics.slice(0, 3).map((t, ti) => (
                              <span key={ti} className="text-[10px] px-2 py-0.5 rounded-full border border-white/[0.07] text-white/25">{t}</span>
                            ))}
                            <span className="text-[10px] text-white/20 ml-auto">{new Date(brief.publishedAt).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-3">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="rounded-xl border border-white/[0.04] bg-white/[0.01] p-5">
                      <div className="flex items-center gap-4"><div className="w-8 h-8 rounded-lg bg-white/[0.03] flex-shrink-0" /><div className="flex-1 space-y-2"><div className="h-3 bg-white/[0.04] rounded w-3/4" /><div className="h-2.5 bg-white/[0.03] rounded w-full" /></div></div>
                    </div>
                  ))}
                  <p className="text-center text-xs text-white/20 pt-2">First publications appear here once the pipeline runs.</p>
                </div>
              )}
              <div className="mt-5 flex justify-center sm:hidden">
                <button onClick={() => router.push('/articles')} className="text-sm text-white/35 hover:text-white/60 transition-colors flex items-center gap-2">View all publications <ExternalLink size={13} /></button>
              </div>
            </div>
          </section>

          {/* NEWSLETTER — primary CTA */}
          <section className="relative px-6 sm:px-8 py-24">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_60%_at_50%_50%,rgba(99,102,241,0.07),transparent_70%)] pointer-events-none" />
            <div className="max-w-3xl mx-auto">
              <div className="relative rounded-2xl border border-indigo-500/20 bg-indigo-500/[0.03] p-10 sm:p-14 overflow-hidden text-center">
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_110%,rgba(99,102,241,0.10),transparent_70%)] pointer-events-none" />
                <div className="relative">
                  <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-indigo-500/25 bg-indigo-500/8 mb-6">
                    <Rss size={11} className="text-indigo-400" />
                    <span className="text-[11px] text-indigo-300 font-semibold tracking-[0.2em] uppercase">Weekly Intelligence Dispatch</span>
                  </div>
                  <h2 className="font-display text-3xl sm:text-4xl font-bold text-white mb-4 leading-tight">
                    Weekly intelligence dispatch.<br />
                    <span className="nx-gradient-text">Verified research. Free.</span>
                  </h2>
                  <p className="text-base text-white/40 max-w-xl mx-auto">Significant findings from 250M+ academic sources. Multi-researcher validation. Full source traceability.</p>
                  <p className="text-sm text-white/25 mb-10 max-w-md mx-auto">Every claim sourced. Every source verified.</p>
                  {newsletterStatus === "success" ? (
                    <div className="flex items-center justify-center gap-2.5 text-emerald-400 font-medium text-sm">
                      <div className="w-5 h-5 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center"><span className="text-[10px]">✓</span></div>
                      {newsletterMessage || "Check your inbox to confirm."}
                    </div>
                  ) : (
                    <form onSubmit={handleNewsletterSubmit} className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
                      <input type="email" value={newsletterEmail} onChange={e => setNewsletterEmail(e.target.value)} placeholder="your@institution.edu" required className="flex-1 px-4 py-3.5 rounded-xl bg-white/[0.05] border border-white/[0.12] text-white placeholder-white/20 text-sm focus:outline-none focus:border-indigo-500/50 transition-colors" />
                      <button type="submit" disabled={newsletterStatus === "loading"} className="px-6 py-3.5 rounded-xl bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-[#09090b] font-semibold text-sm transition-all duration-200 disabled:opacity-60 whitespace-nowrap shadow-lg shadow-amber-500/20">
                        {newsletterStatus === "loading" ? "..." : "Subscribe — free"}
                      </button>
                    </form>
                  )}
                  {newsletterStatus === "error" && (
                    <p className="mt-3 text-xs text-red-400">
                      {searchParams.get('newsletter') === 'expired'
                        ? 'Your confirmation link expired (48h). Subscribe again below.'
                        : 'Something went wrong — try again.'}
                    </p>
                  )}
                  <p className="mt-5 text-xs text-white/20">No spam. Unsubscribe anytime. Weekly cadence.</p>
                </div>
              </div>
            </div>
          </section>

          {/* PRICING — 3 tiers */}
          <section className="relative px-6 sm:px-8 py-24">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_60%_at_50%_100%,rgba(99,102,241,0.07),transparent_70%)] pointer-events-none" />
            <div className="max-w-5xl mx-auto">
              <div className="text-center mb-14">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-indigo-500/20 bg-indigo-500/5 mb-5">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                  <span className="text-[11px] text-indigo-300 font-semibold tracking-[0.2em] uppercase">Access Tiers</span>
                </div>
                <h2 className="font-display text-3xl sm:text-4xl font-bold text-white mb-4">Research infrastructure access</h2>
                <p className="text-base text-white/40 max-w-xl mx-auto">Free tier: read-only access. Paid tiers: commission custom research.</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Analyst */}
                <div className="relative rounded-2xl border border-white/[0.07] bg-white/[0.02] p-7 hover:border-white/[0.12] transition-all duration-300">
                  <p className="text-[10px] text-white/35 font-semibold tracking-[0.25em] uppercase mb-3">Analyst</p>
                  <div className="flex items-baseline gap-1 mb-2"><span className="text-3xl font-display font-bold text-white">€0</span><span className="text-sm text-white/30">/month</span></div>
                  <p className="text-xs text-white/35 leading-relaxed mb-6">Read the auto-published briefs. Subscribe to the weekly dispatch.</p>
                  <div className="space-y-2 mb-7">
                    {["Weekly intelligence dispatch","Access to published briefs","Signal radar (read-only)","Weak-signal alerts"].map((f, i) => (
                      <div key={i} className="flex items-center gap-2.5">
                        <div className="w-3.5 h-3.5 rounded-full border border-white/15 flex items-center justify-center flex-shrink-0"><div className="w-1 h-1 rounded-full bg-white/35" /></div>
                        <span className="text-xs text-white/40">{f}</span>
                      </div>
                    ))}
                  </div>
                  <button onClick={() => setShowAuthModal(true)} className="w-full py-2.5 rounded-xl border border-white/[0.09] bg-white/[0.03] text-white/45 font-medium text-sm hover:bg-white/[0.06] hover:text-white/65 transition-all duration-200">Start free</button>
                </div>
                {/* Researcher */}
                <div className="relative p-[1px] rounded-2xl overflow-hidden">
                  <div className="absolute inset-0 rounded-2xl animate-beam-spin" style={{ background: 'conic-gradient(from 0deg, transparent 0deg, rgba(99,102,241,0.9) 45deg, rgba(139,92,246,0.7) 90deg, transparent 135deg)' }} />
                <div className="relative rounded-2xl bg-[#09090b] bg-indigo-500/[0.04] p-7 shadow-xl shadow-indigo-500/10">
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2"><span className="px-3 py-1 rounded-full bg-indigo-500 text-white text-[10px] font-bold tracking-widest uppercase">Most popular</span></div>
                  <p className="text-[10px] text-indigo-300 font-semibold tracking-[0.25em] uppercase mb-3">Researcher</p>
                  <div className="flex items-baseline gap-1 mb-2"><span className="text-3xl font-display font-bold text-white">€19</span><span className="text-sm text-white/30">/month</span></div>
                  <p className="text-xs text-white/45 leading-relaxed mb-6">Commission briefs and strategic reports. Full pipeline access.</p>
                  <div className="space-y-2 mb-7">
                    {["Everything in Analyst +","Commission research briefs on any topic","Strategic reports (10-15 page)","22-researcher Council deliberations","Adversarial debate & meta-analysis","Verified citation export"].map((f, i) => (
                      <div key={i} className="flex items-center gap-2.5">
                        <div className="w-3.5 h-3.5 rounded-full border border-indigo-400/50 flex items-center justify-center flex-shrink-0"><div className="w-1 h-1 rounded-full bg-indigo-400" /></div>
                        <span className="text-xs text-white/65">{f}</span>
                      </div>
                    ))}
                  </div>
                  <button onClick={() => setShowAuthModal(true)} className="w-full py-2.5 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white font-semibold text-sm transition-all duration-200 shadow-lg shadow-indigo-500/25">Start free trial</button>
                </div>
                </div>
                {/* Studio */}
                <div className="relative rounded-2xl border border-violet-500/20 bg-violet-500/[0.02] p-7 hover:border-violet-500/30 transition-all duration-300">
                  <p className="text-[10px] text-violet-300 font-semibold tracking-[0.25em] uppercase mb-3">Studio</p>
                  <div className="flex items-baseline gap-1 mb-2"><span className="text-3xl font-display font-bold text-white">€49</span><span className="text-sm text-white/30">/month</span></div>
                  <p className="text-xs text-white/35 leading-relaxed mb-6">Full editorial control. Publish under your own brand.</p>
                  <div className="space-y-2 mb-7">
                    {["Everything in Researcher +","Publications Studio (custom questions)","Council Q&A sessions","Custom research verticals","White-label export & API access","Priority pipeline queue"].map((f, i) => (
                      <div key={i} className="flex items-center gap-2.5">
                        <div className="w-3.5 h-3.5 rounded-full border border-violet-400/35 flex items-center justify-center flex-shrink-0"><div className="w-1 h-1 rounded-full bg-violet-400" /></div>
                        <span className="text-xs text-white/40">{f}</span>
                      </div>
                    ))}
                  </div>
                  <button onClick={() => setShowAuthModal(true)} className="w-full py-2.5 rounded-xl border border-violet-500/25 bg-violet-500/[0.06] text-violet-300 font-medium text-sm hover:bg-violet-500/[0.12] transition-all duration-200">Start free trial</button>
                </div>
              </div>
              <p className="text-center text-xs text-white/20 mt-8">All plans include the weekly dispatch. <button onClick={() => router.push('/pricing')} className="text-indigo-400/60 hover:text-indigo-400 transition-colors underline underline-offset-2">Full pricing details →</button></p>
            </div>
          </section>

          {/* FOOTER */}
          <SiteFooter onSignInClick={() => setShowAuthModal(true)} />

        </div>
      </div>

      {showAuthModal && <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} onSignupSuccess={handleAuthSuccess} />}
    </ErrorBoundary>
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#09090b] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
      </div>
    }>
      <HomePageContent />
    </Suspense>
  );
}
