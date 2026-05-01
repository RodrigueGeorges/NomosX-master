"use client";

import React from 'react';
import { useState, useEffect, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles, FileText, Layers, Loader2, ArrowRight, Shield, Activity, Database, Scale } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Textarea } from '@/components/ui/Textarea';
import PublicNav from '@/components/PublicNav';
import SiteFooter from '@/components/SiteFooter';
import AuthModal from '@/components/AuthModal';

/**
 * StudioX — NomosX Research Studio
 *
 * STRATEGY tier subscribers can commission custom research
 * Ask a question → get a brief with Harvard Council insights
 */

function StudioPageContent() {
  const router = useRouter();
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        setHasSession(!!data?.user);
        setSessionChecked(true);
      })
      .catch(() => { setHasSession(false); setSessionChecked(true); });
  }, []);

  async function handleGenerate() {
    if (!question.trim()) return;

    setLoading(true);
    try {
      const res = await fetch('/api/studiox', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          messages: [{ role: 'user', content: question }],
          stream: false 
        }),
      });

      if (!res.ok) throw new Error('Failed to generate');

      const data = await res.json();
      setResult(data.content || 'No response generated');
    } catch (error) {
      console.error('Generation error:', error);
      setResult('Error generating response. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  if (!sessionChecked) return (
    <div className="min-h-screen bg-[#09090b] flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
    </div>
  );

  if (!hasSession) return (
    <div className="min-h-screen bg-[#09090b] text-white flex flex-col">
      <div className="nx-noise" aria-hidden="true" />
      <PublicNav currentPage="studio" onSignInClick={() => setShowAuthModal(true)} />
      <div className="flex-1 flex items-center justify-center px-6">
        <div className="text-center max-w-md">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-indigo-500/20 bg-indigo-500/5 mb-6">
            <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
            <span className="text-xs text-indigo-300 font-medium tracking-wide">STUDIOX</span>
          </div>
          <h1 className="text-4xl font-display font-bold text-white mb-4 tracking-tight">
            Studio<span className="text-indigo-500">X</span>
          </h1>
          <p className="text-white/40 mb-8 text-sm leading-relaxed">
            Commission custom research through the full 16-agent pipeline. Create an account to get started — it&apos;s free.
          </p>
          <div className="grid grid-cols-2 gap-2 mb-8">
            {[
              { icon: Shield, label: "guarded" },
              { icon: Scale, label: "debated" },
              { icon: Database, label: "sourced" },
              { icon: Activity, label: "tracked" },
            ].map((item) => {
              const SIcon = item.icon;
              return (
                <div key={item.label} className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-3">
                  <SIcon size={14} className="text-indigo-300/75 mx-auto mb-2" />
                  <div className="text-[10px] text-white/35 uppercase tracking-[0.14em]">{item.label}</div>
                </div>
              );
            })}
          </div>
          <button
            onClick={() => setShowAuthModal(true)}
            className="px-7 py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm transition-all duration-200 shadow-lg shadow-indigo-500/20 flex items-center gap-2 mx-auto"
          >
            Get StudioX access
            <ArrowRight size={14} />
          </button>
          <p className="mt-4 text-xs text-white/25">Already have an account? <button onClick={() => setShowAuthModal(true)} className="text-white/50 hover:text-white underline underline-offset-2 transition-colors">Sign in</button></p>
        </div>
      </div>
      <SiteFooter onSignInClick={() => setShowAuthModal(true)} />
      {showAuthModal && (
        <AuthModal
          isOpen={showAuthModal}
          onClose={() => setShowAuthModal(false)}
          onSignupSuccess={() => { setShowAuthModal(false); setHasSession(true); }}
        />
      )}
    </div>
  );

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
        <PublicNav currentPage="studio" onSignInClick={() => setShowAuthModal(true)} />

        <div className="relative z-10 max-w-5xl mx-auto px-6 sm:px-8 py-20 sm:py-28">
          {/* Header */}
          <div className="mb-12 text-center">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-indigo-500/20 bg-indigo-500/5 mb-6">
              <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse-glow" />
              <span className="text-xs text-indigo-300 font-medium tracking-wide">STUDIOX</span>
            </div>
            <h1 className="text-5xl font-display font-bold text-white mb-4 tracking-tight">
              Studio<span className="text-indigo-500">X</span>
            </h1>
            <p className="text-lg text-white/50 max-w-2xl mx-auto">
              Commission the engine directly. Define the question, launch the Council, and receive source-bound intelligence with visible dissent and verification.
            </p>
          </div>

          {/* Cockpit */}
          <div className="mb-8 rounded-[28px] border border-indigo-400/15 bg-[#0b0b12]/80 overflow-hidden relative">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_22%,rgba(99,102,241,0.16),transparent_30%),radial-gradient(circle_at_82%_44%,rgba(212,175,55,0.08),transparent_34%)]" />
            <div className="absolute inset-0 nx-grid-bg opacity-20" />
            <div className="relative p-6 sm:p-8">
              <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 mb-7">
                <div>
                  <p className="text-xs text-indigo-300/75 font-medium tracking-[0.22em] uppercase mb-3">Research Cockpit</p>
                  <h2 className="font-display text-2xl sm:text-3xl font-bold text-white mb-2">Custom intelligence, same publication protocol.</h2>
                  <p className="text-sm text-white/40 max-w-2xl leading-relaxed">
                    StudioX uses the same verification logic as public publications: source discovery, evidence ranking, reader extraction, synthesis, adversarial review, and citation integrity checks.
                  </p>
                </div>
                <div className="rounded-xl border border-white/[0.07] bg-white/[0.035] px-5 py-4">
                  <div className="text-[10px] text-white/25 uppercase tracking-[0.18em]">Mode</div>
                  <div className="mt-1 text-lg text-indigo-200 font-semibold">commissioned run</div>
                </div>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                  { icon: Database, label: "Corpus", value: "expanded" },
                  { icon: Scale, label: "Dissent", value: "forced" },
                  { icon: Shield, label: "Citations", value: "guarded" },
                  { icon: Activity, label: "Lineage", value: "logged" },
                ].map((item) => {
                  const CIcon = item.icon;
                  return (
                    <div key={item.label} className="rounded-xl border border-white/[0.06] bg-black/20 p-4">
                      <CIcon size={15} className="text-indigo-300/75 mb-4" />
                      <div className="text-[10px] text-white/25 uppercase tracking-[0.16em]">{item.label}</div>
                      <div className="text-sm text-white/75 font-medium mt-1">{item.value}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

        {/* Mandate Builder */}
        <div className="grid lg:grid-cols-[220px_minmax(0,1fr)_220px] gap-4 mb-8">
          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">
            <div className="text-[10px] text-white/25 uppercase tracking-[0.18em] mb-4">Modes</div>
            <div className="space-y-2">
              {[
                { label: "Ask", value: "fast answer" },
                { label: "Commission", value: "new brief" },
                { label: "Monitor", value: "topic radar" },
                { label: "Compare", value: "positions" },
                { label: "Board Memo", value: "decision note" },
              ].map((mode, index) => (
                <div
                  key={mode.label}
                  className={`rounded-xl border px-3 py-2.5 ${index === 1 ? "border-indigo-400/25 bg-indigo-500/10" : "border-white/[0.06] bg-black/20"}`}
                >
                  <div className="text-sm text-white/80 font-medium">{mode.label}</div>
                  <div className="text-[11px] text-white/30">{mode.value}</div>
                </div>
              ))}
            </div>
          </div>

          <Card className="border-white/10 bg-white/[0.02] backdrop-blur-xl">
            <div className="p-6">
              <div className="flex items-center justify-between gap-4 mb-4">
                <div>
                  <div className="text-[10px] text-indigo-300/70 uppercase tracking-[0.18em] mb-1">Mandate</div>
                  <h3 className="text-lg text-white font-semibold">Define the research question</h3>
                </div>
                <div className="hidden sm:block text-right">
                  <div className="text-[10px] text-white/25 uppercase tracking-[0.16em]">Protocol</div>
                  <div className="text-xs text-white/55">gate before publication</div>
                </div>
              </div>
              <Textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Example: What would change the EU policy position on open-source AI models over the next 24 months?"
                rows={6}
                className="mb-4 bg-[#0c0c10] border-white/10 text-white placeholder:text-white/30 resize-none focus:border-indigo-500/50 focus:ring-indigo-500/20"
                disabled={loading}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    handleGenerate();
                  }
                }}
              />

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex flex-wrap gap-2">
                  {["scope", "sources", "dissent", "memo"].map((tag) => (
                    <span key={tag} className="rounded-full border border-white/[0.08] bg-black/20 px-3 py-1 text-[11px] text-white/35">
                      {tag}
                    </span>
                  ))}
                </div>
                <Button
                  onClick={handleGenerate}
                  disabled={!question.trim() || loading}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white font-medium shadow-lg shadow-indigo-500/20"
                >
                  {loading ? (
                    <>
                      <Loader2 size={18} className="mr-2 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Sparkles size={18} className="mr-2" />
                      Launch Protocol
                    </>
                  )}
                </Button>
              </div>
            </div>
          </Card>

          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">
            <div className="text-[10px] text-white/25 uppercase tracking-[0.18em] mb-4">Quality rail</div>
            <div className="space-y-3">
              {[
                { icon: Database, label: "Corpus preview" },
                { icon: Shield, label: "Citation gate" },
                { icon: Scale, label: "Opposing case" },
                { icon: Activity, label: "Audit trail" },
              ].map((item) => {
                const RIcon = item.icon;
                return (
                  <div key={item.label} className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-black/20 px-3 py-3">
                    <RIcon size={14} className="text-indigo-300/75" />
                    <span className="text-xs text-white/55">{item.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Result */}
        {result && (
          <Card className="border-white/10 bg-white/[0.02] backdrop-blur-xl animate-fade-in">
            <div className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center">
                  <FileText size={20} className="text-white" />
                </div>
                <h2 className="text-xl font-semibold text-white">Research Result</h2>
              </div>
              <div className="prose prose-invert prose-sm max-w-none text-white/80 whitespace-pre-wrap">
                {result}
              </div>
            </div>
          </Card>
        )}

        {/* Empty State */}
        {!result && !loading && (
          <div className="text-center py-12">
            <div className="w-20 h-20 rounded-full bg-white/[0.02] flex items-center justify-center mx-auto mb-6">
              <Layers size={40} className="text-white/20" />
            </div>
            <h3 className="text-2xl font-semibold text-white mb-2">Ready to research</h3>
            <p className="text-white/40 max-w-md mx-auto">
              Ask any question above. StudioX will analyze the topic and provide evidence-based insights from 250M+ academic sources.
            </p>
          </div>
        )}
      </div>

      <SiteFooter onSignInClick={() => setShowAuthModal(true)} />

      {showAuthModal && (
        <AuthModal
          isOpen={showAuthModal}
          onClose={() => setShowAuthModal(false)}
          onSignupSuccess={() => setShowAuthModal(false)}
        />
      )}
    </div>
    </>
  );
}

export default function StudioPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#09090b] flex items-center justify-center">
        <div className="text-center">
          <Loader2 size={48} className="text-indigo-500 animate-spin mx-auto mb-4" />
          <p className="text-white/50">Loading StudioX...</p>
        </div>
      </div>
    }>
      <StudioPageContent />
    </Suspense>
  );
}
