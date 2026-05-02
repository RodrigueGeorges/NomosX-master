"use client";

import React from 'react';
import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Sparkles, FileText, Layers, Loader2, ArrowRight, Shield, Activity, Database, Scale, CheckCircle, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Textarea } from '@/components/ui/Textarea';
import PublicNav from '@/components/PublicNav';
import SiteFooter from '@/components/SiteFooter';
import AuthModal from '@/components/AuthModal';
import { GreekProtocolStrip } from '@/components/brand/GreekProtocol';
import { PUBLICATION_FORMATS, type PublicationFormatType } from '@/lib/publication-formats';
import { getStudioXPrice } from '@/lib/studiox-pricing';

function StudioPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const orderId = searchParams.get('orderId');
  const cancelled = searchParams.get('cancelled');

  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [selectedFormat, setSelectedFormat] = useState<PublicationFormatType>('POLICY_NOTE');
  const [selectedMode, setSelectedMode] = useState('COMMISSION');
  const [audience, setAudience] = useState('Decision-makers');
  const [urgency, setUrgency] = useState('Standard');
  const [orderStatus, setOrderStatus] = useState<'idle' | 'verifying' | 'paid' | 'failed'>('idle');

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        setHasSession(!!data?.user);
        setSessionChecked(true);
      })
      .catch(() => { setHasSession(false); setSessionChecked(true); });
  }, []);

  // After Stripe redirect: verify order and auto-run
  useEffect(() => {
    if (!orderId || !sessionChecked || !hasSession) return;

    setOrderStatus('verifying');

    fetch(`/api/studiox/order/${orderId}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data?.order) { setOrderStatus('failed'); return; }
        const order = data.order;

        // Restore mandate from order
        setQuestion(order.question ?? '');
        setSelectedFormat((order.formatType as PublicationFormatType) ?? 'RESEARCH_BRIEF');
        setSelectedMode(order.mode ?? 'COMMISSION');
        if (order.audience) setAudience(order.audience);
        if (order.urgency) setUrgency(order.urgency);

        if (order.status === 'PAID') {
          setOrderStatus('paid');
          if (order.result) {
            // Already computed — show cached result
            setResult(order.result);
          } else {
            // Auto-run pipeline
            runPipeline(order.question, order.formatType, order.mode, order.audience, order.urgency, orderId);
          }
        } else {
          setOrderStatus('failed');
        }
      })
      .catch(() => setOrderStatus('failed'));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId, sessionChecked, hasSession]);

  async function runPipeline(
    q: string,
    fmt: string,
    mode: string,
    aud: string,
    urg: string,
    oId: string
  ) {
    setLoading(true);
    try {
      const res = await fetch('/api/studiox', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: q }],
          stream: false,
          orderId: oId,
          studioContext: { mode, formatType: fmt, audience: aud, urgency: urg },
        }),
      });
      if (!res.ok) throw new Error('Generation failed');
      const data = await res.json();
      setResult(data.content ?? 'No response generated');
    } catch {
      setResult('Error generating response. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleCommission() {
    if (!question.trim()) return;
    setCheckoutLoading(true);
    try {
      const res = await fetch('/api/studiox/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, formatType: selectedFormat, mode: selectedMode, audience, urgency }),
      });
      if (!res.ok) throw new Error('Checkout failed');
      const data = await res.json();
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      }
    } catch {
      setCheckoutLoading(false);
    }
  }

  const selectedPrice = getStudioXPrice(selectedFormat);

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
            Studio<span className="text-amber-100">X</span>
          </h1>
          <p className="text-white/40 mb-8 text-sm leading-relaxed">
            Commission custom research through the full 16-agent pipeline. Pay per commission — no subscription.
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
                  <SIcon size={14} className="text-amber-100/60 mx-auto mb-2" />
                  <div className="text-[10px] text-white/35 uppercase tracking-[0.14em]">{item.label}</div>
                </div>
              );
            })}
          </div>
          <button
            onClick={() => setShowAuthModal(true)}
            className="px-7 py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm transition-all duration-200 shadow-lg shadow-amber-300/10 flex items-center gap-2 mx-auto"
          >
            Create account to commission
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
        <div className="fixed inset-0 pointer-events-none overflow-hidden">
          <div className="absolute w-[900px] h-[700px] rounded-full -top-48 left-1/2 -translate-x-1/2 animate-aurora-1" style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.15) 0%, transparent 70%)' }} />
          <div className="absolute w-[600px] h-[600px] rounded-full top-1/3 -right-32 animate-aurora-2" style={{ background: 'radial-gradient(circle, rgba(139,92,246,0.09) 0%, transparent 70%)' }} />
          <div className="absolute w-[500px] h-[500px] rounded-full bottom-1/4 -left-24 animate-aurora-3" style={{ background: 'radial-gradient(circle, rgba(212,175,55,0.06) 0%, transparent 70%)' }} />
          <div className="nx-grid-bg absolute inset-0 opacity-30" />
        </div>

        <PublicNav currentPage="studio" onSignInClick={() => setShowAuthModal(true)} />

        <div className="relative z-10 max-w-5xl mx-auto px-6 sm:px-8 py-20 sm:py-28">

          {/* Header */}
          <div className="mb-12 text-center">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-indigo-500/20 bg-indigo-500/5 mb-6">
              <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse-glow" />
              <span className="text-xs text-indigo-300 font-medium tracking-wide">STUDIOX</span>
            </div>
            <h1 className="text-5xl font-display font-bold text-white mb-4 tracking-tight">
              Studio<span className="text-amber-100">X</span>
            </h1>
            <p className="text-lg text-white/50 max-w-2xl mx-auto">
              Commission the engine directly. Pay per research mandate — no subscription.
            </p>
          </div>

          {/* Payment status banners */}
          {cancelled && (
            <div className="mb-6 flex items-center gap-3 rounded-xl border border-red-500/20 bg-red-500/5 px-5 py-4 text-sm text-red-300">
              <AlertCircle size={16} className="flex-shrink-0" />
              Payment cancelled — your mandate is saved. Commission again when ready.
            </div>
          )}
          {orderStatus === 'verifying' && (
            <div className="mb-6 flex items-center gap-3 rounded-xl border border-indigo-500/20 bg-indigo-500/5 px-5 py-4 text-sm text-indigo-300">
              <Loader2 size={16} className="flex-shrink-0 animate-spin" />
              Verifying payment...
            </div>
          )}
          {orderStatus === 'paid' && (
            <div className="mb-6 flex items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-5 py-4 text-sm text-emerald-300">
              <CheckCircle size={16} className="flex-shrink-0" />
              Payment confirmed — launching the pipeline.
            </div>
          )}

          {/* Cockpit */}
          <div className="mb-8 rounded-[28px] border border-indigo-400/15 bg-[#0b0b12]/80 overflow-hidden relative">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_22%,rgba(99,102,241,0.16),transparent_30%),radial-gradient(circle_at_82%_44%,rgba(212,175,55,0.08),transparent_34%)]" />
            <div className="absolute inset-0 nx-grid-bg opacity-20" />
            <div className="relative p-6 sm:p-8">
              <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 mb-7">
                <div>
                  <p className="text-xs text-amber-100/60 font-medium tracking-[0.22em] uppercase mb-3">Research Cockpit</p>
                  <h2 className="font-display text-2xl sm:text-3xl font-bold text-white mb-2">Custom intelligence, same publication protocol.</h2>
                  <p className="text-sm text-white/40 max-w-2xl leading-relaxed">
                    StudioX uses the same verification logic as public publications: source discovery, evidence ranking, synthesis, adversarial review, and citation integrity checks.
                  </p>
                </div>
                <div className="rounded-xl border border-white/[0.07] bg-white/[0.035] px-5 py-4">
                  <div className="text-[10px] text-white/25 uppercase tracking-[0.18em]">Mode</div>
                  <div className="mt-1 text-lg text-amber-100 font-semibold">pay per commission</div>
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
                      <CIcon size={15} className="text-amber-100/60 mb-4" />
                      <div className="text-[10px] text-white/25 uppercase tracking-[0.16em]">{item.label}</div>
                      <div className="text-sm text-white/75 font-medium mt-1">{item.value}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <GreekProtocolStrip compact className="mb-8" />

          {/* Mandate Builder */}
          <div className="grid lg:grid-cols-[220px_minmax(0,1fr)_220px] gap-4 mb-8">
            <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">
              <div className="text-[10px] text-white/25 uppercase tracking-[0.18em] mb-4">Modes</div>
              <div className="space-y-2">
                {[
                  { label: "Commission", value: "new publication", key: "COMMISSION" },
                  { label: "Monitor", value: "topic radar", key: "MONITOR" },
                  { label: "Compare", value: "positions", key: "COMPARE" },
                  { label: "Board Memo", value: "decision note", key: "BOARD_MEMO" },
                ].map((mode) => (
                  <button
                    key={mode.label}
                    type="button"
                    onClick={() => setSelectedMode(mode.key)}
                    className={`w-full text-left rounded-xl border px-3 py-2.5 transition-all ${selectedMode === mode.key ? "border-amber-300/25 bg-amber-300/10" : "border-white/[0.06] bg-black/20 hover:border-white/[0.10]"}`}
                  >
                    <div className="text-sm text-white/80 font-medium">{mode.label}</div>
                    <div className="text-[11px] text-white/30">{mode.value}</div>
                  </button>
                ))}
              </div>
            </div>

            <Card className="border-white/10 bg-white/[0.02] backdrop-blur-xl">
              <div className="p-6">
                <div className="flex items-center justify-between gap-4 mb-4">
                  <div>
                    <div className="text-[10px] text-amber-100/60 uppercase tracking-[0.18em] mb-1">Mandate</div>
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
                  className="mb-4 bg-[#0c0c10] border-white/10 text-white placeholder:text-white/30 resize-none focus:border-amber-300/45 focus:ring-amber-300/15"
                  disabled={loading || checkoutLoading}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      handleCommission();
                    }
                  }}
                />

                <div className="mb-5">
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-[10px] text-white/25 uppercase tracking-[0.18em]">Output format</div>
                    <div className="text-[10px] text-amber-100/50">
                      {PUBLICATION_FORMATS.find((f) => f.type === selectedFormat)?.pages}
                    </div>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-2">
                    {PUBLICATION_FORMATS.filter((f) => f.type !== 'EXECUTIVE_BRIEF').map((format) => {
                      const price = getStudioXPrice(format.type);
                      return (
                        <button
                          key={format.type}
                          type="button"
                          onClick={() => setSelectedFormat(format.type)}
                          className={`text-left rounded-xl border px-3 py-3 transition-all ${selectedFormat === format.type ? 'border-amber-300/30 bg-amber-300/[0.08]' : 'border-white/[0.06] bg-black/20 hover:border-white/[0.10]'}`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="text-sm text-white/80 font-medium">{format.label}</div>
                            <span className="text-[11px] font-semibold text-amber-100/70">{price.display}</span>
                          </div>
                          <div className="mt-1 text-[11px] text-white/35">{format.sourceDepth}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex flex-wrap gap-2">
                    {["scope", "sources", "dissent", "memo"].map((tag) => (
                      <span key={tag} className="rounded-full border border-white/[0.08] bg-black/20 px-3 py-1 text-[11px] text-white/35">
                        {tag}
                      </span>
                    ))}
                  </div>
                  <Button
                    onClick={handleCommission}
                    disabled={!question.trim() || loading || checkoutLoading}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white font-medium shadow-lg shadow-amber-300/10 min-w-[200px]"
                  >
                    {checkoutLoading ? (
                      <>
                        <Loader2 size={16} className="mr-2 animate-spin" />
                        Redirecting...
                      </>
                    ) : loading ? (
                      <>
                        <Loader2 size={16} className="mr-2 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Sparkles size={16} className="mr-2" />
                        Commission — {selectedPrice.display}
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </Card>

            <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">
              <div className="text-[10px] text-white/25 uppercase tracking-[0.18em] mb-4">Mandate rail</div>
              <label className="block mb-3">
                <span className="block text-[10px] text-white/30 uppercase tracking-[0.14em] mb-1.5">Audience</span>
                <input
                  value={audience}
                  onChange={(e) => setAudience(e.target.value)}
                  className="w-full rounded-xl border border-white/[0.07] bg-black/20 px-3 py-2 text-xs text-white/70 outline-none focus:border-amber-300/35"
                />
              </label>
              <label className="block mb-4">
                <span className="block text-[10px] text-white/30 uppercase tracking-[0.14em] mb-1.5">Urgency</span>
                <select
                  value={urgency}
                  onChange={(e) => setUrgency(e.target.value)}
                  className="w-full rounded-xl border border-white/[0.07] bg-black/20 px-3 py-2 text-xs text-white/70 outline-none focus:border-amber-300/35"
                >
                  <option>Standard</option>
                  <option>Board deadline</option>
                  <option>Crisis watch</option>
                  <option>Exploratory</option>
                </select>
              </label>
              <div className="space-y-2">
                {[
                  { icon: Database, label: "Corpus preview" },
                  { icon: Shield, label: "Citation gate" },
                  { icon: Scale, label: "Opposing case" },
                  { icon: Activity, label: "Audit trail" },
                ].map((item) => {
                  const RIcon = item.icon;
                  return (
                    <div key={item.label} className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-black/20 px-3 py-2.5">
                      <RIcon size={14} className="text-amber-100/60" />
                      <span className="text-xs text-white/55">{item.label}</span>
                    </div>
                  );
                })}
              </div>
              <p className="mt-4 text-[10px] text-white/25 leading-relaxed">
                One payment per commission. No subscription. Result stored in your account.
              </p>
            </div>
          </div>

          {/* Result */}
          {result && (
            <Card className="border-white/10 bg-white/[0.02] backdrop-blur-xl animate-fade-in">
              <div className="p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 via-violet-600 to-amber-300 flex items-center justify-center">
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
          {!result && !loading && orderStatus === 'idle' && !cancelled && (
            <div className="text-center py-12">
              <div className="w-20 h-20 rounded-full bg-white/[0.02] flex items-center justify-center mx-auto mb-6">
                <Layers size={40} className="text-white/20" />
              </div>
              <h3 className="text-2xl font-semibold text-white mb-2">Ready to commission</h3>
              <p className="text-white/40 max-w-md mx-auto">
                Define your research question, choose a format, and pay to launch the 16-agent pipeline.
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
          <Loader2 size={48} className="text-amber-100 animate-spin mx-auto mb-4" />
          <p className="text-white/50">Loading StudioX...</p>
        </div>
      </div>
    }>
      <StudioPageContent />
    </Suspense>
  );
}
