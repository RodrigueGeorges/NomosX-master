"use client";

import React from 'react';
import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Sparkles, FileText, Layers, Loader2, ArrowRight, Shield, Activity, Database, Scale, CheckCircle, AlertCircle } from 'lucide-react';
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
  const [selectedFormat, setSelectedFormat] = useState<PublicationFormatType>('ARTICLE');
  const [selectedMode, setSelectedMode] = useState('COMMISSION');
  const [audience, setAudience] = useState('Decision-makers');
  const [urgency, setUrgency] = useState('Standard');
  const [orderStatus, setOrderStatus] = useState<'idle' | 'verifying' | 'running' | 'done' | 'failed' | 'refunded'>('idle');
  const [progressMessage, setProgressMessage] = useState<string | null>(null);
  const [progressPct, setProgressPct] = useState<number | null>(null);
  const [failureReason, setFailureReason] = useState<string | null>(null);

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
      mode?: string;
      audience?: string | null;
      urgency?: string | null;
      progress?: { step?: string | null; pct?: number | null; message?: string | null };
      failureReason?: string | null;
    }) {
      if (cancelled) return;

      setQuestion(order.question ?? '');
      setSelectedFormat((order.formatType as PublicationFormatType) ?? 'ARTICLE');
      setSelectedMode(order.mode ?? 'COMMISSION');
      if (order.audience) setAudience(order.audience);
      if (order.urgency) setUrgency(order.urgency);

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
    <div className="min-h-screen bg-black flex items-center justify-center">
      <div className={cn("w-8 h-8", nx.spinner)} />
    </div>
  );

  if (!hasSession) return (
    <>
      <PublicPageShell currentPage="studio" onSignInClick={() => setShowAuthModal(true)}>
        <PageSection className="flex items-center justify-center min-h-[50vh]">
          <div className="text-center max-w-md">
            <PageHeader
              eyebrow="NomosX Studio"
              title="NomosX Studio"
              description="Commission custom inquiries through the full verification protocol. Pay per commission — no subscription."
              align="center"
            />
            <button
              type="button"
              onClick={() => setShowAuthModal(true)}
              className={cn(nx.btnPrimary, "mx-auto")}
            >
              Create account to commission
              <ArrowRight size={14} />
            </button>
          </div>
        </PageSection>
      </PublicPageShell>
      {showAuthModal && (
        <AuthModal
          isOpen={showAuthModal}
          onClose={() => setShowAuthModal(false)}
          onSignupSuccess={() => { setShowAuthModal(false); setHasSession(true); }}
        />
      )}
    </>
  );

  return (
    <>
      <PublicPageShell currentPage="studio" onSignInClick={() => setShowAuthModal(true)} isAuthenticated>
        <PageSection className="max-w-5xl">
          <PageHeader
            eyebrow="NomosX Studio"
            title="NomosX Studio"
            description="Commission a custom inquiry. Your question, our protocol — chaos structured into a position you can defend."
            align="center"
          />

          {cancelled && (
            <div className="mb-6 flex items-center gap-3 border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-300">
              <AlertCircle size={16} className="flex-shrink-0" />
              Payment cancelled — your mandate is saved. Commission again when ready.
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
              Research complete — your deliverable is ready below.
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

          <div className="mb-6 nx-public-surface overflow-hidden">
            <div className="p-5 sm:p-6">
              <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 mb-5">
                <div>
                  <p className={cn(nx.eyebrow, "mb-3")}>Research Cockpit</p>
                  <h2 className="font-display text-xl sm:text-2xl font-semibold text-white mb-2">From chaos to clarity — your question, our protocol.</h2>
                  <p className={cn(nx.body, "max-w-2xl")}>
                    NomosX Studio uses the same verification logic as public publications: source discovery, evidence mapping, adversarial review, and citation integrity. Your question goes in — a defensible position comes out.
                  </p>
                </div>
                <div className="nx-public-surface px-4 py-3">
                  <div className={nx.label}>Mode</div>
                  <div className="mt-1 text-lg text-white font-semibold uppercase tracking-wide text-[13px]">pay per commission</div>
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
                    <div key={item.label} className="nx-public-surface p-3">
                      <CIcon size={15} className={cn(nx.icon, "mb-4")} />
                      <div className={nx.label}>{item.label}</div>
                      <div className="text-sm text-white/75 font-medium mt-1">{item.value}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="grid lg:grid-cols-[220px_minmax(0,1fr)_220px] gap-4 mb-6">
            <div className="nx-public-surface p-3">
              <div className={cn(nx.label, "mb-4")}>Modes</div>
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
                    className={cn(
                      "w-full text-left border px-3 py-2.5 transition-all",
                      selectedMode === mode.key ? OPTION_SELECTED : OPTION_DEFAULT
                    )}
                  >
                    <div className="text-sm text-white/80 font-medium">{mode.label}</div>
                    <div className="text-[11px] text-white/50">{mode.value}</div>
                  </button>
                ))}
              </div>
            </div>

            <Card className="nx-public-surface backdrop-blur-none shadow-none">
              <div className="p-5">
                <div className="flex items-center justify-between gap-4 mb-4">
                  <div>
                    <div className={cn(nx.eyebrow, "mb-1")}>Mandate</div>
                    <h3 className="text-base text-white font-semibold">Define the research question</h3>
                  </div>
                  <div className="hidden sm:block text-right">
                    <div className={nx.label}>Protocol</div>
                    <div className="text-xs text-white/70">gate before publication</div>
                  </div>
                </div>
                <Textarea
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder="Example: What would change the EU policy position on open-source AI models over the next 24 months?"
                  rows={6}
                  className={cn(nx.input, "mb-4 resize-none")}
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
                    <div className={nx.label}>Output format</div>
                    <div className="text-[10px] text-white/55 font-mono uppercase tracking-[0.12em]">
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
                          className={cn(
                            "text-left border px-3 py-3 transition-all",
                            selectedFormat === format.type ? OPTION_SELECTED : OPTION_DEFAULT
                          )}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="text-sm text-white/80 font-medium">{format.label}</div>
                            <span className="text-[11px] font-semibold text-white/60 font-mono">{price.display}</span>
                          </div>
                          <div className="mt-1 text-[11px] text-white/50">{format.sourceDepth}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex flex-wrap gap-2">
                    {["scope", "sources", "dissent", "memo"].map((tag) => (
                      <span key={tag} className={nx.chip}>
                        {tag}
                      </span>
                    ))}
                  </div>
                  <Button
                    onClick={handleCommission}
                    disabled={!question.trim() || loading || checkoutLoading}
                    className={cn(nx.btnPrimary, "min-w-[200px] border-0 shadow-none hover:scale-100")}
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

            <div className="nx-public-surface p-3">
              <div className={cn(nx.label, "mb-4")}>Mandate rail</div>
              <label className="block mb-3">
                <span className={cn(nx.label, "block mb-1.5")}>Audience</span>
                <input
                  value={audience}
                  onChange={(e) => setAudience(e.target.value)}
                  className={cn(nx.input, "text-xs py-2")}
                />
              </label>
              <label className="block mb-4">
                <span className={cn(nx.label, "block mb-1.5")}>Urgency</span>
                <select
                  value={urgency}
                  onChange={(e) => setUrgency(e.target.value)}
                  className={cn(nx.select, "w-full text-xs py-2")}
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
                    <div key={item.label} className="flex items-center gap-3 nx-public-surface px-3 py-2.5">
                      <RIcon size={14} className={nx.icon} />
                      <span className="text-xs text-white/70">{item.label}</span>
                    </div>
                  );
                })}
              </div>
              <p className="mt-4 text-[10px] text-white/45 leading-relaxed">
                One payment per commission. No subscription. Result stored in your account.
              </p>
            </div>
          </div>

          {result && (
            <Card className="nx-public-surface backdrop-blur-none shadow-none animate-fade-in">
              <div className="p-5">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-8 h-8 nx-public-surface flex items-center justify-center">
                    <FileText size={20} className="text-white/80" />
                  </div>
                  <h2 className="text-lg font-semibold text-white">Research Result</h2>
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

          {!result && !loading && orderStatus === 'idle' && !cancelled && (
            <div className="text-center py-10">
              <div className="w-16 h-16 bg-white/[0.02] flex items-center justify-center mx-auto mb-6">
                <Layers size={32} className="text-white/20" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">Ready to commission</h3>
              <p className="text-white/40 max-w-md mx-auto">
                Define your research question, choose a format, and launch a custom inquiry. The chaos of evidence becomes a position you can defend.
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
          <p className="text-white/50 font-mono text-[11px] uppercase tracking-[0.14em]">Loading Studio</p>
        </div>
      </div>
    }>
      <StudioPageContent />
    </Suspense>
  );
}

