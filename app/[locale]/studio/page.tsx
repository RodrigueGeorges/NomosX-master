"use client";

import React from 'react';
import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Sparkles, FileText, Layers, Loader2, ArrowRight, ArrowLeft, Shield, CheckCircle, AlertCircle, Lock } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Textarea } from '@/components/ui/Textarea';
import { PublicPageShell } from "@/components/layout/PublicPageShell";
import { PageHeader, PageSection } from "@/components/layout/PageHeader";
import AuthModal from '@/components/AuthModal';
import { PUBLICATION_FORMATS, type PublicationFormatType } from '@/lib/publication-formats';
import { getStudioXPrice } from '@/lib/studiox-pricing';
import { nx } from '@/lib/brand/public-ui';
import { cn } from '@/lib/utils';

const OPTION_SELECTED = "border-white/40 bg-white/10";
const OPTION_DEFAULT = "border-white/[0.08] bg-black/20 hover:border-white/[0.12]";

const EXAMPLE_QUESTIONS = [
  "What would change the EU policy position on open-source AI models over the next 24 months?",
  "Is the evidence for carbon border adjustment mechanisms reducing leakage robust?",
  "What are the systemic risks of stablecoin adoption for institutional treasuries?",
  "How credible is the evidence that remote work reduces productivity?",
];

function StudioPageContent() {
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
  const [selectedFormat, setSelectedFormat] = useState<PublicationFormatType>('DECISION_MEMO');
  const [orderStatus, setOrderStatus] = useState<'idle' | 'verifying' | 'running' | 'done' | 'failed' | 'refunded'>('idle');
  const [progressMessage, setProgressMessage] = useState<string | null>(null);
  const [progressPct, setProgressPct] = useState<number | null>(null);
  const [failureReason, setFailureReason] = useState<string | null>(null);

  // Step 1 = prompt only, Step 2 = configure & pay
  const [step, setStep] = useState<'prompt' | 'configure'>('prompt');

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        setHasSession(!!data?.user);
        setSessionChecked(true);
      })
      .catch(() => { setHasSession(false); setSessionChecked(true); });
  }, []);

  useEffect(() => {
    if (!orderId || !sessionChecked || !hasSession) return;

    let cancelled = false;
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    async function applyOrder(order: {
      status: string;
      result?: string | null;
      question?: string;
      formatType?: string;
      progress?: { step?: string | null; pct?: number | null; message?: string | null };
      failureReason?: string | null;
    }) {
      if (cancelled) return;

      setQuestion(order.question ?? '');
      setSelectedFormat((order.formatType as PublicationFormatType) ?? 'DECISION_MEMO');

      if (order.progress?.message) setProgressMessage(order.progress.message);
      if (typeof order.progress?.pct === 'number') setProgressPct(order.progress.pct);

      if (order.status === 'DONE' && order.result) {
        setResult(order.result);
        setOrderStatus('done');
        setLoading(false);
        if (pollTimer) clearInterval(pollTimer);
        return;
      }

      if (order.status === 'FAILED') {
        setFailureReason(order.failureReason ?? 'Pipeline failed');
        setOrderStatus('failed');
        setLoading(false);
        if (pollTimer) clearInterval(pollTimer);
        return;
      }

      if (order.status === 'REFUNDED') {
        setFailureReason(
          order.progress?.message ??
            'Your payment has been refunded. The research pipeline could not complete.'
        );
        setOrderStatus('refunded');
        setLoading(false);
        if (pollTimer) clearInterval(pollTimer);
        return;
      }

      if (['PAID', 'QUEUED', 'RUNNING'].includes(order.status)) {
        setOrderStatus('running');
        setLoading(true);
        setStep('configure');
        if (order.status === 'PAID') {
          await fetch('/api/studiox', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              messages: [{ role: 'user', content: order.question ?? '' }],
              stream: false,
              orderId,
            }),
          }).catch(() => {});
        }
      } else if (order.status === 'PENDING') {
        setOrderStatus('verifying');
      } else {
        setOrderStatus('failed');
        setLoading(false);
        if (pollTimer) clearInterval(pollTimer);
      }
    }

    async function pollOrder() {
      try {
        const res = await fetch(`/api/studiox/order/${orderId}`);
        if (!res.ok) {
          setOrderStatus('failed');
          setLoading(false);
          return;
        }
        const data = await res.json();
        if (data?.order) await applyOrder(data.order);
      } catch {
        if (!cancelled) {
          setOrderStatus('failed');
          setLoading(false);
        }
      }
    }

    setOrderStatus('verifying');
    void pollOrder();
    pollTimer = setInterval(pollOrder, 4000);

    return () => {
      cancelled = true;
      if (pollTimer) clearInterval(pollTimer);
    };
  }, [orderId, sessionChecked, hasSession]);

  async function handleCommission() {
    if (!question.trim()) return;
    if (!hasSession) {
      setShowAuthModal(true);
      return;
    }
    setCheckoutLoading(true);
    try {
      const res = await fetch('/api/studiox/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, formatType: selectedFormat, mode: 'COMMISSION' }),
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

  function handleSendPrompt() {
    if (!question.trim()) return;
    setStep('configure');
  }

  function handleBackToPrompt() {
    setStep('prompt');
  }

  const selectedPrice = getStudioXPrice(selectedFormat);
  const selectedFormatMeta = PUBLICATION_FORMATS.find((f) => f.type === selectedFormat);

  if (!sessionChecked) return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <div className={cn("w-8 h-8", nx.spinner)} />
    </div>
  );

  if (!sessionChecked) return (
    <PublicPageShell currentPage="studio" onSignInClick={() => setShowAuthModal(true)}>
      <PageSection className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className={cn("w-6 h-6 animate-spin text-white/40")} />
      </PageSection>
    </PublicPageShell>
  );

  return (
    <>
      <PublicPageShell currentPage="studio" onSignInClick={() => setShowAuthModal(true)} isAuthenticated={hasSession}>
        <PageSection className="max-w-3xl">
          <PageHeader
            eyebrow="Nomos Engine"
            title="Nomos Engine"
            description="Commission a custom study. Your question, our protocol — chaos structured into a position you can defend."
            align="center"
          />

          {cancelled && (
            <div className="mb-6 flex items-center gap-3 border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-300">
              <AlertCircle size={16} className="flex-shrink-0" />
              Payment cancelled — your question is saved. Commission again when ready.
            </div>
          )}
          {orderStatus === 'verifying' && (
            <div className="mb-6 flex items-center gap-3 nx-public-surface px-4 py-3 text-sm text-white/70">
              <Loader2 size={16} className={cn("flex-shrink-0 animate-spin", nx.icon)} />
              Verifying payment…
            </div>
          )}
          {orderStatus === 'running' && (
            <div className="mb-6 flex items-center gap-3 nx-public-surface px-4 py-3 text-sm text-white/70">
              <Loader2 size={16} className={cn("flex-shrink-0 animate-spin", nx.icon)} />
              <div>
                <div>Research pipeline running…</div>
                {progressMessage && (
                  <div className="text-xs text-white/55 mt-1">
                    {progressMessage}
                    {typeof progressPct === 'number' && progressPct >= 0 ? ` (${progressPct}%)` : ''}
                  </div>
                )}
              </div>
            </div>
          )}
          {orderStatus === 'done' && (
            <div className="mb-6 flex items-center gap-3 border border-white/20 bg-white/5 px-4 py-3 text-sm text-white">
              <CheckCircle size={16} className="flex-shrink-0" />
              Study complete — your deliverable is ready below.
            </div>
          )}
          {orderStatus === 'failed' && failureReason && (
            <div className="mb-6 flex items-center gap-3 border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-300">
              <AlertCircle size={16} className="flex-shrink-0" />
              {failureReason}
            </div>
          )}
          {orderStatus === 'refunded' && failureReason && (
            <div className="mb-6 flex items-center gap-3 border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-200">
              <AlertCircle size={16} className="flex-shrink-0" />
              {failureReason}
            </div>
          )}

          {/* ── STEP 1: PROMPT ─────────────────────────────────────────── */}
          {step === 'prompt' && orderStatus === 'idle' && (
            <div className="mt-8">
              <Card className="nx-public-surface backdrop-blur-none shadow-none">
                <div className="p-6 sm:p-8">
                  <div className="text-center mb-6">
                    <div className={cn(nx.eyebrow, "mb-3")}>Your Question</div>
                    <h2 className="font-display text-xl sm:text-2xl font-semibold text-white mb-2">
                      What do you need to know?
                    </h2>
                    <p className={cn(nx.body, "max-w-lg mx-auto")}>
                      Frame your question. Be specific — the sharper the question, the sharper the output.
                    </p>
                  </div>

                  <Textarea
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    placeholder="Example: What would change the EU policy position on open-source AI models over the next 24 months?"
                    rows={5}
                    className={cn(nx.input, "mb-4 resize-none text-sm")}
                    disabled={loading || checkoutLoading}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                        e.preventDefault();
                        handleSendPrompt();
                      }
                    }}
                  />

                  <div className="mb-6">
                    <div className={cn(nx.label, "mb-3")}>Or try one of these</div>
                    <div className="space-y-2">
                      {EXAMPLE_QUESTIONS.map((q) => (
                        <button
                          key={q}
                          type="button"
                          onClick={() => setQuestion(q)}
                          className={cn(
                            "w-full text-left border px-4 py-3 transition-all text-sm text-white/60 hover:text-white/90",
                            OPTION_DEFAULT
                          )}
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-col items-center gap-3">
                    <Button
                      onClick={handleSendPrompt}
                      disabled={!question.trim() || loading || checkoutLoading}
                      className={cn(nx.btnPrimary, "min-w-[220px] border-0 shadow-none hover:scale-100")}
                    >
                      <Sparkles size={16} className="mr-2" />
                      Send
                      <ArrowRight size={14} className="ml-2" />
                    </Button>
                    <a
                      href="/pricing"
                      className="text-[11px] font-mono uppercase tracking-[0.14em] text-white/30 hover:text-white/55 transition-colors"
                    >
                      See pricing →
                    </a>
                  </div>
                </div>
              </Card>

              <div className="mt-6 grid sm:grid-cols-3 gap-3">
                {[
                  { icon: Shield, label: "Same protocol", value: "as public publications" },
                  { icon: CheckCircle, label: "Money-back", value: "if pipeline fails" },
                  { icon: Lock, label: "Private", value: "your question, your output" },
                ].map((item) => {
                  const Icon = item.icon;
                  return (
                    <div key={item.label} className="nx-public-surface p-4 text-center">
                      <Icon size={16} className={cn(nx.icon, "mx-auto mb-3")} />
                      <div className="text-sm text-white/80 font-medium">{item.label}</div>
                      <div className="text-[11px] text-white/45 mt-0.5">{item.value}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── STEP 2: CONFIGURE & PAY ────────────────────────────────── */}
          {step === 'configure' && orderStatus === 'idle' && (
            <div className="mt-8">
              <button
                type="button"
                onClick={handleBackToPrompt}
                className={cn(nx.btnGhost, "mb-6")}
              >
                <ArrowLeft size={14} className="mr-2" />
                Back to question
              </button>

              {/* Question recap */}
              <div className="nx-public-surface p-5 mb-6">
                <div className={cn(nx.label, "mb-2")}>Your question</div>
                <p className="text-sm text-white/85 leading-relaxed">{question}</p>
              </div>

              {/* Format selection */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <div className={cn(nx.eyebrow, "mb-1")}>Choose your format</div>
                    <h3 className="text-base text-white font-semibold">4 formats, 4 angles</h3>
                  </div>
                </div>
                <div className="space-y-3">
                  {PUBLICATION_FORMATS.map((format) => {
                    const price = getStudioXPrice(format.type);
                    const isSelected = selectedFormat === format.type;
                    return (
                      <button
                        key={format.type}
                        type="button"
                        onClick={() => setSelectedFormat(format.type)}
                        className={cn(
                          "w-full text-left border p-5 transition-all",
                          isSelected ? OPTION_SELECTED : OPTION_DEFAULT
                        )}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-1">
                              <div className="text-base text-white font-semibold">{format.label}</div>
                              <span className="text-[10px] font-mono uppercase tracking-[0.12em] text-white/40">
                                {format.pages}
                              </span>
                            </div>
                            <p className="text-sm text-white/55 leading-relaxed">{format.description}</p>
                            <div className="mt-2 text-[11px] text-white/40 font-mono">
                              {format.sourceDepth}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="text-lg text-white font-bold font-mono">{price.display}</div>
                            <div className="text-[10px] text-white/35 uppercase tracking-wide">per study</div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Money-back guarantee */}
              <div className="nx-public-surface p-4 mb-6 flex items-center gap-3">
                <Shield size={18} className="text-white/60 shrink-0" />
                <p className="text-xs text-white/55 leading-relaxed">
                  <span className="text-white/80 font-medium">Money-back guarantee.</span> If the research pipeline cannot complete your study, your payment is fully refunded. No questions asked.
                </p>
              </div>

              {/* Commission button */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 nx-public-surface p-5">
                <div>
                  <div className={cn(nx.label, "mb-1")}>Selected</div>
                  <div className="text-sm text-white font-medium">
                    {selectedFormatMeta?.label} · {selectedFormatMeta?.pages}
                  </div>
                </div>
                <Button
                  onClick={handleCommission}
                  disabled={!question.trim() || loading || checkoutLoading}
                  className={cn(nx.btnPrimary, "min-w-[240px] border-0 shadow-none hover:scale-100")}
                >
                  {checkoutLoading ? (
                    <>
                      <Loader2 size={16} className="mr-2 animate-spin" />
                      Redirecting…
                    </>
                  ) : loading ? (
                    <>
                      <Loader2 size={16} className="mr-2 animate-spin" />
                      Generating…
                    </>
                  ) : (
                    <>
                      <Sparkles size={16} className="mr-2" />
                      Commission — {selectedPrice.display}
                    </>
                  )}
                </Button>
              </div>

              <p className="mt-4 text-center text-[10px] text-white/35">
                One payment per study. No subscription. Result stored in your account. Secure checkout via Stripe.
              </p>
            </div>
          )}

          {/* ── RESULT ─────────────────────────────────────────────────── */}
          {result && (
            <Card className="nx-public-surface backdrop-blur-none shadow-none animate-fade-in mt-6">
              <div className="p-5">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-8 h-8 nx-public-surface flex items-center justify-center">
                    <FileText size={20} className="text-white/80" />
                  </div>
                  <h2 className="text-lg font-semibold text-white">Your Study</h2>
                </div>
                {/^\s*<(?:!doctype|html|div|section|article|h[1-6]|p|main)/i.test(result) ? (
                  <iframe
                    title="Research Result"
                    srcDoc={result}
                    className="w-full border border-white/10 bg-white"
                    style={{ height: '80vh' }}
                    sandbox="allow-same-origin"
                  />
                ) : (
                  <div className="prose prose-invert prose-sm max-w-none text-white/80 whitespace-pre-wrap">
                    {result}
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* ── EMPTY STATE (only if no result, no order, no step) ─────── */}
          {!result && !loading && orderStatus === 'idle' && step === 'prompt' && !question && !cancelled && (
            <div className="text-center py-10 mt-4">
              <div className="w-16 h-16 bg-white/[0.02] flex items-center justify-center mx-auto mb-6">
                <Layers size={32} className="text-white/20" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">Ready when you are</h3>
              <p className="text-white/40 max-w-md mx-auto">
                Type your question above. The chaos of evidence becomes a position you can defend.
              </p>
            </div>
          )}
        </PageSection>
      </PublicPageShell>

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

export default function StudioPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <Loader2 size={36} className={cn("mx-auto mb-4 animate-spin", nx.icon)} />
          <p className="text-white/50 font-mono text-[11px] uppercase tracking-[0.14em]">Loading Engine</p>
        </div>
      </div>
    }>
      <StudioPageContent />
    </Suspense>
  );
}
