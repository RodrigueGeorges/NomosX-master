"use client";

import React, { useState, useEffect, Suspense } from 'react';
import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import AuthModal from '@/components/AuthModal';
import PublicNav from '@/components/PublicNav';
import { Brain, Shield, BarChart3, TrendingUp, ArrowRight, Search, FileText, Scale, Leaf, Globe2, Rss, Clock, BookOpen, ExternalLink, Database, Zap, Eye, AlertTriangle, Network, Activity, DollarSign, Target, Building2, Package, Calculator } from 'lucide-react';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ThreeComponentWrapper } from '@/components/ThreeComponentWrapper';
import SiteFooter from '@/components/SiteFooter';
import { AnimatePresence, motion } from 'framer-motion';
import PipelineDemo from '@/components/ui/PipelineDemo';
import { GreekProtocolStrip, OracleSeal } from '@/components/brand/GreekProtocol';
import { NomosXLogo } from '@/components/brand/NomosXLogo';

const HoloOrb = dynamic(() => import('@/components/ui/HoloOrb'), { ssr: false, loading: () => null });
const HoloPortrait = dynamic(() => import('@/components/ui/HoloPortrait'), { ssr: false, loading: () => null });

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
  trustScore?: number | null;
  displayType?: string;
};

function HomePageContent() {
  const router = useRouter();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authRedirect, setAuthRedirect] = useState<'dashboard' | 'studio'>('dashboard');
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

  function openStudioAuth() { setAuthRedirect('studio'); setShowAuthModal(true); }
  function openFreeAuth()   { setAuthRedirect('dashboard'); setShowAuthModal(true); }
  const handleAuthSuccess = () => {
    setIsAuthenticated(true);
    setShowAuthModal(false);
    if (authRedirect === 'studio') router.push('/studio');
    else router.push('/dashboard');
  };

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

          {/* HERO — Doxa → Nomos */}
          <section className="relative px-6 sm:px-8 pt-28 sm:pt-40 pb-24">
            <div className="max-w-5xl mx-auto text-center">

              {/* Official NomosX Logo — large, dynamic, gold core */}
              <div className={`flex justify-center mb-8 transition-all duration-700 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
                <motion.div
                  animate={{
                    scale: [1, 1.04, 1],
                    opacity: [0.9, 1, 0.9],
                  }}
                  transition={{
                    duration: 4,
                    repeat: Infinity,
                    ease: 'easeInOut',
                  }}
                  className="relative"
                >
                  {/* Gold glow behind the logo */}
                  <div className="absolute inset-[-25%] rounded-full blur-3xl bg-amber-400/20 animate-pulse" />
                  <div className="absolute inset-[-15%] rounded-full blur-2xl bg-indigo-500/15 animate-pulse" style={{ animationDelay: '1.5s' }} />
                  <NomosXLogo size="5xl" variant="symbol" />
                </motion.div>
              </div>

              <h1 className={`font-display text-5xl sm:text-6xl md:text-[5.5rem] lg:text-[6.5rem] font-bold leading-[1.05] tracking-tight mb-8 transition-all duration-700 delay-100 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-5'}`}>
                Research that cannot be<br />
                <span className="nx-gradient-text">bought, biased, or briefed.</span>
              </h1>

              <p className={`text-lg sm:text-xl text-white/50 max-w-2xl mx-auto mb-5 leading-relaxed font-light tracking-wide transition-all duration-700 delay-200 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-5'}`}>
                NomosX is an autonomous think tank. 22 domain researchers and a 16-stage verification pipeline produce every brief — no editorial agenda, no sponsor, no opinion.
              </p>
              <p className={`text-sm text-white/25 max-w-md mx-auto mb-14 leading-loose tracking-wide transition-all duration-700 delay-250 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-5'}`}>
                250M+ sources · 16-stage verification · zero editorial opinion · free to read
              </p>

              <div className={`mb-12 transition-all duration-700 delay-300 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-5'}`}>
                <GreekProtocolStrip compact className="text-left" />
              </div>

              <div className={`flex flex-col sm:flex-row gap-4 justify-center mb-20 transition-all duration-700 delay-300 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-5'}`}>
                <button onClick={() => setShowAuthModal(true)} className="group px-8 py-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm tracking-wide transition-all duration-300 shadow-lg shadow-amber-300/10 hover:shadow-amber-300/20 hover:scale-[1.02] flex items-center justify-center gap-2">
                  Access the Council — free
                  <ArrowRight size={15} className="group-hover:translate-x-0.5 transition-transform" />
                </button>
                <button onClick={() => router.push('/articles')} className="px-8 py-4 rounded-xl bg-white/[0.03] border border-white/[0.07] text-white/50 hover:text-white/80 hover:bg-white/[0.06] hover:border-white/[0.12] font-medium text-sm tracking-wide transition-all duration-200">
                  View publications
                </button>
              </div>

              <div className={`flex flex-wrap items-center justify-center gap-0 transition-all duration-700 delay-400 ${mounted ? 'opacity-100' : 'opacity-0'}`}>
                {[{ value: "22", label: "PhD researchers" }, { value: "16", label: "Verification stages" }, { value: "250M+", label: "Academic sources" }, { value: "60+", label: "Data providers" }].map((s, i) => (
                  <React.Fragment key={i}>
                    {i > 0 && <div className="h-10 w-px bg-white/[0.06] mx-10 sm:mx-14" />}
                    <div className="text-center">
                      <div className="text-3xl sm:text-4xl font-display font-bold text-white/90">{s.value}</div>
                      <div className="text-[11px] text-white/25 mt-1 tracking-[0.12em] uppercase">{s.label}</div>
                    </div>
                  </React.Fragment>
                ))}
              </div>
            </div>
          </section>

          {/* TRUTH ENGINE - live institutional instrument */}
          <section className="relative px-6 sm:px-8 py-20">
            <div className="max-w-6xl mx-auto">
              <div className="relative overflow-hidden rounded-[28px] border border-indigo-400/15 bg-[#0b0b12]/80 shadow-2xl shadow-indigo-950/30">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(99,102,241,0.16),transparent_34%),radial-gradient(circle_at_78%_38%,rgba(20,184,166,0.10),transparent_30%),linear-gradient(180deg,rgba(255,255,255,0.045),transparent)]" />
                <div className="absolute inset-0 nx-grid-bg opacity-25" />
                <div className="relative grid lg:grid-cols-[1.05fr_0.95fr] gap-0">
                  <div className="p-7 sm:p-10 lg:p-12 border-b lg:border-b-0 lg:border-r border-white/[0.06]">
                    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-indigo-500/25 bg-indigo-500/10 mb-7">
                      <Activity size={12} className="text-indigo-300" />
                      <span className="text-[11px] text-indigo-200/90 font-semibold tracking-[0.22em] uppercase">Truth Engine Online</span>
                    </div>
                    <h2 className="font-display text-3xl sm:text-5xl font-bold text-white leading-tight mb-5">
                      Watch the institution think.
                    </h2>
                    <p className="text-sm sm:text-base text-white/45 leading-relaxed max-w-xl mb-9">
                      NomosX turns the invisible work of a think tank into an instrument panel: sourcing, adversarial review, citation support, dissent, and publication gating are visible before a claim becomes Nomos.
                    </p>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {[
                        { label: "Signals", value: "live", tone: "text-emerald-300", icon: Activity },
                        { label: "Dissent", value: "forced", tone: "text-rose-300", icon: AlertTriangle },
                        { label: "Citations", value: "verified", tone: "text-indigo-300", icon: Shield },
                        { label: "Memory", value: "persistent", tone: "text-amber-200", icon: Database },
                      ].map((m, i) => {
                        const MIcon = m.icon;
                        return (
                          <div key={i} className="rounded-xl border border-white/[0.07] bg-white/[0.035] p-4">
                            <MIcon size={15} className={m.tone} />
                            <div className="mt-4 text-[10px] text-white/25 uppercase tracking-[0.18em]">{m.label}</div>
                            <div className={`mt-1 text-sm font-semibold ${m.tone}`}>{m.value}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="relative p-7 sm:p-10 lg:p-12">
                    <div className="absolute top-8 right-8 text-[10px] text-white/20 font-mono tracking-[0.18em]">DOXA_TO_NOMOS</div>
                    <div className="space-y-3">
                      {[
                        { step: "01", name: "Scout", detail: "provider swarm + source reputation", pct: 92, color: "from-indigo-300 to-amber-100" },
                        { step: "02", name: "Rank", detail: "semantic relevance + diversity controls", pct: 84, color: "from-amber-100 to-emerald-300" },
                        { step: "03", name: "Debate", detail: "steel-man dissent and contradiction map", pct: 78, color: "from-rose-300 to-amber-200" },
                        { step: "04", name: "Verify", detail: "claim support, citation integrity, limits", pct: 88, color: "from-amber-200 to-indigo-300" },
                        { step: "05", name: "Publish", detail: "editorial gate, lineage, audit trail", pct: 71, color: "from-violet-300 to-indigo-300" },
                      ].map((stage) => (
                        <div key={stage.step} className="group rounded-xl border border-white/[0.07] bg-black/20 p-4 hover:border-indigo-400/25 transition-colors">
                          <div className="flex items-center justify-between gap-4 mb-3">
                            <div className="flex items-center gap-3 min-w-0">
                              <span className="text-[10px] font-mono text-indigo-300/70">{stage.step}</span>
                              <div className="min-w-0">
                                <div className="text-sm font-semibold text-white/90">{stage.name}</div>
                                <div className="text-[11px] text-white/30 truncate">{stage.detail}</div>
                              </div>
                            </div>
                            <span className="text-xs font-mono text-white/35">{stage.pct}%</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-white/[0.05] overflow-hidden">
                            <div className={`h-full rounded-full bg-gradient-to-r ${stage.color}`} style={{ width: `${stage.pct}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* DOXA → NOMOS — The transformation */}
          <section className="relative px-6 sm:px-8 py-28">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_50%,rgba(99,102,241,0.06),transparent_70%)] pointer-events-none" />
            <div className="max-w-5xl mx-auto relative">
              <div className="text-center mb-12">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-indigo-500/20 bg-indigo-500/5 mb-5">
                  <Shield size={12} className="text-indigo-400" />
                  <span className="text-[11px] text-indigo-300/80 font-semibold tracking-[0.2em] uppercase">Doxa → Nomos</span>
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
                        <SIcon size={16} className={s.color === 'indigo' ? 'text-indigo-400' : s.color === 'violet' ? 'text-violet-400' : s.color === 'emerald' ? 'text-emerald-400' : 'text-rose-400'} />
                      </div>
                      <h3 className="text-sm font-semibold text-white mb-2">{s.title}</h3>
                      <p className="text-xs text-white/35 leading-relaxed">{s.desc}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          {/* BENTO GRID — Features */}
          <section className="relative px-6 sm:px-8 py-28">
            <div className="max-w-5xl mx-auto">
              <div className="text-center mb-14">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-indigo-500/20 bg-indigo-500/5 mb-5">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
                  <span className="text-[11px] text-indigo-300/80 font-semibold tracking-[0.2em] uppercase">At a glance</span>
                </div>
                <h2 className="font-display text-3xl sm:text-4xl font-bold text-white">The infrastructure behind every truth.</h2>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-6 gap-3">

                {/* Council — hero card */}
                <div className="col-span-2 md:col-span-4 rounded-2xl relative overflow-hidden p-6 transition-all duration-300 hover:border-white/[0.11] group"
                  style={{ border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.02)', minHeight: '190px' }}>
                  <div className="absolute top-0 left-0 right-0 h-px" style={{ background: 'linear-gradient(90deg,rgba(99,102,241,0.7),rgba(99,102,241,0.2),transparent)' }} />
                  <div className="absolute -right-16 -top-16 w-52 h-52 rounded-full pointer-events-none" style={{ background: 'radial-gradient(circle,rgba(99,102,241,0.06) 0%,transparent 70%)' }} />
                  <p className="text-[10px] text-indigo-300/70 font-semibold tracking-[0.2em] uppercase mb-1.5">The Council</p>
                  <h3 className="text-lg sm:text-xl font-display font-semibold text-white mb-1">22 PhD AI Researchers</h3>
                  <p className="text-xs text-white/35 mb-5">Domain-specialized · Adversarial peer review at every stage</p>
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold text-indigo-300/80"
                      style={{ background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)' }}>
                      22
                    </div>
                    <span className="text-xs text-white/40">Domain experts</span>
                  </div>
                </div>

                {/* Sources */}
                <div className="col-span-2 md:col-span-2 rounded-2xl relative overflow-hidden p-5 flex flex-col justify-between hover:border-white/[0.10] transition-all duration-300"
                  style={{ border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.02)', minHeight: '190px' }}>
                  <div className="absolute top-0 left-0 right-0 h-px" style={{ background: 'linear-gradient(90deg,rgba(99,102,241,0.5),transparent)' }} />
                  <p className="text-[10px] text-indigo-300/60 font-semibold tracking-[0.2em] uppercase">Sources</p>
                  <div>
                    <div className="text-4xl sm:text-5xl font-display font-bold text-white mb-1">250M+</div>
                    <p className="text-xs text-white/30">Academic & institutional documents</p>
                  </div>
                </div>

                {/* Agents */}
                <div className="col-span-1 md:col-span-2 rounded-2xl relative overflow-hidden p-5 flex flex-col justify-between hover:border-white/[0.10] transition-all duration-300"
                  style={{ border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.02)' }}>
                  <div className="absolute top-0 left-0 right-0 h-px" style={{ background: 'linear-gradient(90deg,rgba(99,102,241,0.4),transparent)' }} />
                  <p className="text-[10px] text-indigo-300/60 font-semibold tracking-[0.2em] uppercase">Pipeline</p>
                  <div>
                    <div className="text-4xl sm:text-5xl font-display font-bold text-white mb-1">16</div>
                    <p className="text-xs text-white/30 mb-4">Autonomous agents</p>
                    <div className="flex gap-1 flex-wrap">
                      {['S','I','R','Rd','An','Cr','Gd','Ed'].map((s, i) => (
                        <div key={i} className="w-6 h-6 rounded-full flex items-center justify-center text-[8px] font-bold text-indigo-300/60"
                          style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.18)' }}>{s}</div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Zero opinion */}
                <div className="col-span-1 md:col-span-2 rounded-2xl relative overflow-hidden p-5 flex flex-col justify-between hover:border-white/[0.10] transition-all duration-300"
                  style={{ border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.02)' }}>
                  <div className="absolute top-0 left-0 right-0 h-px" style={{ background: 'linear-gradient(90deg,rgba(99,102,241,0.35),transparent)' }} />
                  <p className="text-[10px] text-indigo-300/60 font-semibold tracking-[0.2em] uppercase">Objectivity</p>
                  <div>
                    <div className="text-4xl sm:text-5xl font-display font-bold text-white mb-1">0</div>
                    <p className="text-xs text-white/30">Editorial opinion · evidence only</p>
                  </div>
                </div>

                {/* Providers */}
                <div className="col-span-2 md:col-span-2 rounded-2xl relative overflow-hidden p-5 flex flex-col justify-between hover:border-white/[0.10] transition-all duration-300"
                  style={{ border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.02)' }}>
                  <div className="absolute top-0 left-0 right-0 h-px" style={{ background: 'linear-gradient(90deg,rgba(99,102,241,0.35),transparent)' }} />
                  <p className="text-[10px] text-indigo-300/60 font-semibold tracking-[0.2em] uppercase">Coverage</p>
                  <div>
                    <div className="text-4xl sm:text-5xl font-display font-bold text-white mb-1">60+</div>
                    <p className="text-xs text-white/30">Live data providers</p>
                  </div>
                </div>

              </div>
            </div>
          </section>

          {/* PIPELINE DEMO — cinematic */}
          {(() => {
            const DEMO_STEPS = [
              { label: "Collecting sources",   detail: "847 documents retrieved across 60+ providers",      duration: 1400 },
              { label: "Indexing & enriching", detail: "Authors, institutions, DOIs resolved",               duration: 1200 },
              { label: "Ranking evidence",     detail: "Top 22 sources selected by quality & recency",      duration: 1000 },
              { label: "Reading abstracts",    detail: "Claims, methods, results extracted per source",     duration: 1300 },
              { label: "Synthesizing",         detail: "Consensus · Disagreements · Strategic implications", duration: 1500 },
              { label: "Verifying citations",  detail: "All [SRC-N] references validated against sources",  duration: 900  },
              { label: "Publishing",           detail: "Report signed and released to the Council",         duration: 800  },
            ];
            const DEMO_QUERY = "What is the macroeconomic impact of carbon pricing on industrial competitiveness?";
            const DEMO_EXCERPT = `Carbon pricing mechanisms demonstrate a statistically significant negative correlation with short-term industrial output in energy-intensive sectors [SRC-3][SRC-7], though longitudinal evidence suggests competitive adaptation within 5–8 years [SRC-1][SRC-12]. Border carbon adjustments substantially mitigate leakage risks [SRC-5], while revenue recycling into R&D amplifies net productivity gains [SRC-9][SRC-14].`;

            return (
              <PipelineDemo
                steps={DEMO_STEPS}
                query={DEMO_QUERY}
                excerpt={DEMO_EXCERPT}
                onCTA={() => setShowAuthModal(true)}
              />
            );
          })()}

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
                  <span className="text-[11px] text-indigo-300/80 font-semibold tracking-[0.2em] uppercase">The Think Tank</span>
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
                                  <ThreeComponentWrapper fallback={
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
                              <ThreeComponentWrapper fallback={
                                <div className="w-full h-full rounded-full flex items-center justify-center" style={{ background: `radial-gradient(circle, ${cur.hex}22 0%, transparent 70%)` }}>
                                  <div className="w-24 h-24 rounded-full border-2 opacity-40" style={{ borderColor: cur.hex }} />
                                </div>
                              }>
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

          {/* OUTPUT FORMATS */}
          <section className="relative px-6 sm:px-8 py-28">
            <div className="max-w-5xl mx-auto">
              <div className="text-center mb-12">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-indigo-500/20 bg-indigo-500/5 mb-5">
                  <BookOpen size={12} className="text-indigo-400" />
                  <span className="text-[11px] text-indigo-300/80 font-semibold tracking-[0.2em] uppercase">What truth looks like</span>
                </div>
                <h2 className="font-display text-3xl sm:text-4xl font-bold text-white mb-4">Multiple formats. One standard: truth.</h2>
                <p className="text-base text-white/40 max-w-xl mx-auto">Every publication survives the same 16 challenges. Signals, memos, briefs, reports, dossiers: same rigour, different depth.</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-8 relative overflow-hidden hover:border-indigo-500/15 transition-all duration-300">
                  <div className="absolute top-0 left-0 right-0 h-px" style={{ background: 'linear-gradient(90deg,rgba(99,102,241,0.6),transparent)' }} />
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/15 flex items-center justify-center">
                      <FileText size={18} className="text-indigo-400" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-white">Research Brief</h3>
                      <p className="text-xs text-white/30">4-6 pages</p>
                    </div>
                  </div>
                  <p className="text-sm text-white/40 leading-relaxed mb-6">Decision-ready synthesis. Key findings, consensus, disagreements, and implications: every claim traced to its source.</p>
                  <div className="space-y-2">
                    {['Consensus & disagreements', 'Pro/con debate synthesis', 'Evidence quality score', 'Full [SRC-N] citations'].map((f, i) => (
                      <div key={i} className="flex items-center gap-2.5">
                        <div className="w-3.5 h-3.5 rounded-full border border-indigo-400/40 flex items-center justify-center flex-shrink-0"><div className="w-1 h-1 rounded-full bg-indigo-400" /></div>
                        <span className="text-xs text-white/45">{f}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-8 relative overflow-hidden hover:border-indigo-500/15 transition-all duration-300">
                  <div className="absolute top-0 left-0 right-0 h-px" style={{ background: 'linear-gradient(90deg,rgba(99,102,241,0.4),transparent)' }} />
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-xl bg-indigo-500/[0.07] border border-indigo-500/15 flex items-center justify-center">
                      <Target size={18} className="text-indigo-400/70" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-white">Format Ladder</h3>
                      <p className="text-xs text-white/30">1-50 pages</p>
                    </div>
                  </div>
                  <p className="text-sm text-white/40 leading-relaxed mb-6">Signal Briefs, Data Notes, Policy Memos, Strategic Reports, and Research Dossiers use the same verification stack at different depths.</p>
                  <div className="space-y-2">
                    {['Literature review & thematic analysis', 'Scenario planning (3-5 scenarios)', 'Stakeholder impact matrix', 'Implementation roadmap & metrics'].map((f, i) => (
                      <div key={i} className="flex items-center gap-2.5">
                        <div className="w-3.5 h-3.5 rounded-full border border-indigo-400/30 flex items-center justify-center flex-shrink-0"><div className="w-1 h-1 rounded-full bg-indigo-400/70" /></div>
                        <span className="text-xs text-white/45">{f}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* LATEST PUBLICATIONS */}
          <section className="relative px-6 sm:px-8 py-28">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_55%_45%_at_50%_50%,rgba(99,102,241,0.06),transparent_70%)] pointer-events-none" />
            <div className="max-w-5xl mx-auto">
              <div className="flex items-end justify-between mb-10">
                <div>
                  <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-indigo-500/20 bg-indigo-500/5 mb-4">
                    <span className="relative flex h-1.5 w-1.5"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75" /><span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-indigo-400" /></span>
                    <span className="text-[11px] text-indigo-300/80 font-semibold tracking-[0.2em] uppercase">Council Publications</span>
                  </div>
                  <h2 className="font-display text-3xl sm:text-4xl font-bold text-white">Latest from the Council</h2>
                  <p className="text-base text-white/40 mt-2">Every brief: multi-pass validation, full source traceability, zero editorial opinion.</p>
                </div>
                <button onClick={() => router.push('/articles')} className="hidden sm:flex items-center gap-2 text-sm text-white/35 hover:text-white/60 transition-colors">
                  View all <ExternalLink size={13} />
                </button>
              </div>
              {latestBriefs.length > 0 ? (
                <div className="grid md:grid-cols-3 gap-4">
                  {latestBriefs.map((brief) => (
                    <div
                      key={brief.id}
                      onClick={() => router.push(`/articles/${brief.id}`)}
                      className="group cursor-pointer rounded-xl border border-white/[0.07] bg-white/[0.02] hover:border-indigo-500/20 hover:bg-white/[0.035] p-5 transition-all duration-300 overflow-hidden relative"
                    >
                      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-indigo-400/40 via-violet-300/15 to-transparent" />
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-[10px] text-amber-100/50 uppercase tracking-wider font-medium">
                          {brief.displayType || brief.type.replace(/_/g, ' ')}
                        </span>
                        {brief.trustScore != null && (
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                            brief.trustScore >= 85 ? 'text-emerald-300 border-emerald-500/20 bg-emerald-500/5'
                            : brief.trustScore >= 75 ? 'text-indigo-300 border-indigo-500/20 bg-indigo-500/5'
                            : 'text-amber-300 border-amber-500/20 bg-amber-500/5'
                          }`}>{brief.trustScore}</span>
                        )}
                      </div>
                      <h3 className="font-display text-sm font-light text-white/90 mb-2 line-clamp-2 group-hover:text-indigo-200/80 transition-colors leading-snug">
                        {brief.title}
                      </h3>
                      <p className="text-xs text-white/35 line-clamp-3 leading-relaxed mb-3">
                        {brief.summary}
                      </p>
                      <div className="flex items-center justify-between text-[10px] text-white/25">
                        <span>{brief.sources} sources · {brief.readTime} min</span>
                        <span>{new Date(brief.publishedAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-10 text-center">
                  <p className="text-sm text-white/40 mb-1">No publications yet.</p>
                  <p className="text-xs text-white/25">The pipeline is running — check back soon.</p>
                </div>
              )}
              <div className="mt-5 flex justify-center sm:hidden">
                <button onClick={() => router.push('/articles')} className="text-sm text-white/35 hover:text-white/60 transition-colors flex items-center gap-2">View all publications <ExternalLink size={13} /></button>
              </div>
            </div>
          </section>

          {/* NEWSLETTER — Weekly Truth Dispatch */}
          <section className="relative px-6 sm:px-8 py-28">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_60%_at_50%_50%,rgba(99,102,241,0.07),transparent_70%)] pointer-events-none" />
            <div className="max-w-3xl mx-auto">
              <div className="relative rounded-2xl border border-indigo-500/15 bg-indigo-500/[0.02] p-10 sm:p-14 overflow-hidden text-center">
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_110%,rgba(99,102,241,0.08),transparent_70%)] pointer-events-none" />
                <div className="relative">
                  <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-indigo-500/20 bg-indigo-500/5 mb-6">
                    <Rss size={11} className="text-indigo-400" />
                    <span className="text-[11px] text-indigo-300/80 font-semibold tracking-[0.2em] uppercase">Weekly Truth Dispatch</span>
                  </div>
                  <h2 className="font-display text-3xl sm:text-4xl font-bold text-white mb-4 leading-tight">
                    Truth, delivered weekly.<br />
                    <span className="nx-gradient-text">Free.</span>
                  </h2>
                  <p className="text-base text-white/40 max-w-xl mx-auto mb-10">The most significant findings from 250M+ academic sources. What survived the Council. Every claim sourced. Every source verified. No opinion — just what the evidence says.</p>
                  {newsletterStatus === "success" ? (
                    <div className="flex items-center justify-center gap-2.5 text-emerald-400 font-medium text-sm">
                      <div className="w-5 h-5 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center"><span className="text-[10px]">✓</span></div>
                      {newsletterMessage || "Check your inbox to confirm."}
                    </div>
                  ) : (
                    <form onSubmit={handleNewsletterSubmit} className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
                      <input type="email" value={newsletterEmail} onChange={e => setNewsletterEmail(e.target.value)} placeholder="your@institution.edu" required className="flex-1 px-4 py-3.5 rounded-xl bg-white/[0.05] border border-white/[0.12] text-white placeholder-white/20 text-sm focus:outline-none focus:border-indigo-500/50 transition-colors" />
                      <button type="submit" disabled={newsletterStatus === "loading"} className="px-6 py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm transition-all duration-200 disabled:opacity-60 whitespace-nowrap shadow-lg shadow-amber-300/10">
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
                  <p className="mt-5 text-xs text-white/20">No spam. Unsubscribe anytime.</p>
                </div>
              </div>
            </div>
          </section>

          {/* ACCESS — Free + StudioX */}
          <section className="relative px-6 sm:px-8 py-28">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_60%_at_50%_50%,rgba(99,102,241,0.07),transparent_70%)] pointer-events-none" />
            <div className="max-w-4xl mx-auto">
              <div className="text-center mb-12">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-indigo-500/20 bg-indigo-500/5 mb-5">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
                  <span className="text-[11px] text-indigo-300/80 font-semibold tracking-[0.2em] uppercase">Access</span>
                </div>
                <h2 className="font-display text-3xl sm:text-4xl font-bold text-white mb-4">The Think Tank is open.</h2>
                <p className="text-base text-white/40 max-w-xl mx-auto">All publications are free. The Council publishes — you read. StudioX is for those who want to commission their own research.</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

                {/* Free */}
                <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-8 hover:border-white/[0.12] transition-all duration-300 relative overflow-hidden">
                  <div className="absolute top-0 left-0 right-0 h-px" style={{ background: 'linear-gradient(90deg,rgba(255,255,255,0.12),transparent)' }} />
                  <p className="text-[10px] text-white/35 font-semibold tracking-[0.25em] uppercase mb-4">Think Tank — Open access</p>
                  <div className="flex items-baseline gap-2 mb-3">
                    <span className="text-4xl font-display font-bold text-white">Free</span>
                    <span className="text-sm text-white/30">forever</span>
                  </div>
                  <p className="text-xs text-white/40 leading-relaxed mb-7">Read everything the Council publishes. Subscribe to the weekly dispatch. No credit card. No expiry.</p>
                  <div className="space-y-2.5 mb-8">
                    {[
                      "All published formats: signals, memos, reports, dossiers",
                      "Weekly truth dispatch",
                      "Full source traceability on every claim",
                      "22-researcher Council publications",
                      "Signal feed (read-only)",
                    ].map((f, i) => (
                      <div key={i} className="flex items-center gap-2.5">
                        <div className="w-3.5 h-3.5 rounded-full border border-white/15 flex items-center justify-center flex-shrink-0"><div className="w-1 h-1 rounded-full bg-white/40" /></div>
                        <span className="text-xs text-white/50">{f}</span>
                      </div>
                    ))}
                  </div>
                  <button onClick={() => setShowAuthModal(true)} className="w-full py-3 rounded-xl border border-white/[0.10] bg-white/[0.03] text-white/60 font-medium text-sm hover:bg-white/[0.07] hover:text-white/80 transition-all duration-200">
                    Start reading — free
                  </button>
                </div>

                {/* StudioX */}
                <div className="relative p-[1px] rounded-2xl overflow-hidden">
                  <div className="absolute inset-0 rounded-2xl animate-beam-spin" style={{ background: 'conic-gradient(from 0deg, transparent 0deg, rgba(99,102,241,0.9) 45deg, rgba(139,92,246,0.7) 90deg, transparent 135deg)' }} />
                  <div className="relative rounded-2xl bg-[#09090b] p-8 h-full" style={{ background: 'linear-gradient(140deg,rgba(99,102,241,0.06) 0%,rgba(9,9,11,1) 50%)' }}>
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <span className="px-3 py-1 rounded-full bg-indigo-600 text-white text-[10px] font-bold tracking-widest uppercase shadow shadow-amber-300/10">StudioX</span>
                    </div>
                    <p className="text-[10px] text-indigo-400/70 font-semibold tracking-[0.25em] uppercase mb-4 mt-1">Custom research on demand</p>
                    <div className="flex items-baseline gap-2 mb-3">
                      <span className="text-4xl font-display font-bold text-white">On demand</span>
                    </div>
                    <p className="text-xs text-white/45 leading-relaxed mb-7">Commission the full 16-agent pipeline on any question. The Council researches, debates, validates, and delivers truth — on your timeline.</p>
                    <div className="space-y-2.5 mb-8">
                      {[
                        "Commission research on any topic",
                        "Choose format: memo, brief, report, or dossier",
                        "Full 22-researcher Council deliberations",
                        "Adversarial debate + meta-analysis",
                        "Verified [SRC-N] citation export",
                        "White-label & API access",
                        "Priority pipeline queue",
                      ].map((f, i) => (
                        <div key={i} className="flex items-center gap-2.5">
                          <div className="w-3.5 h-3.5 rounded-full border border-indigo-400/35 flex items-center justify-center flex-shrink-0"><div className="w-1 h-1 rounded-full bg-indigo-400" /></div>
                          <span className="text-xs text-white/60">{f}</span>
                        </div>
                      ))}
                    </div>
                    <button onClick={openStudioAuth} className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm transition-all duration-200 shadow-lg shadow-amber-300/10 flex items-center justify-center gap-2 group">
                      Get StudioX access
                      <ArrowRight size={13} className="group-hover:translate-x-0.5 transition-transform" />
                    </button>
                  </div>
                </div>

              </div>
            </div>
          </section>

          {/* FINAL CTA */}
          <section className="relative px-6 sm:px-8 py-32">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_60%_at_50%_100%,rgba(99,102,241,0.07),transparent_70%)] pointer-events-none" />
            <div className="max-w-3xl mx-auto text-center">
              <h2 className="font-display text-3xl sm:text-4xl font-bold text-white mb-4">
                The Council publishes continuously.<br />
                <span className="nx-gradient-text">All of it is open.</span>
              </h2>
              <p className="text-base text-white/40 max-w-xl mx-auto mb-8">Every brief, every strategic report, every source trace — freely accessible. No paywall. No account required to read.</p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <button onClick={openFreeAuth} className="group px-7 py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm transition-all duration-300 shadow-lg shadow-amber-300/10 hover:shadow-amber-300/20 flex items-center justify-center gap-2">
                  Enter the Think Tank
                  <ArrowRight size={15} className="group-hover:translate-x-0.5 transition-transform" />
                </button>
                <button onClick={openStudioAuth} className="px-7 py-3.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white/60 hover:text-white hover:bg-white/[0.07] font-medium text-sm transition-all duration-200">
                  Commission research
                </button>
              </div>
            </div>
          </section>

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
