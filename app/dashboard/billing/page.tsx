"use client";

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Shell from '@/components/Shell';
import { CreditCard, Zap, CheckCircle, AlertTriangle, ExternalLink, Loader2, Calendar, BarChart3 } from 'lucide-react';

interface SubscriptionStatus {
  plan: string;
  status: string;
  isTrialActive: boolean;
  trialDaysRemaining: number;
  isTrialExpired: boolean;
  weeklyPublicationCount: number;
  weeklyPublicationMax: number;
  studioQuestionsUsed: number;
  studioQuestionsPerMonth: number;
  canAccessStudio: boolean;
  canExportPdf: boolean;
  stripeCustomerId: string | null;
  currentPeriodEnd: string | null;
}

const PLANS = [
  {
    id: 'ANALYST',
    label: 'Analyst',
    price: '€0',
    period: '/month',
    description: 'Read the autonomous output. Subscribe to the weekly dispatch.',
    features: ['Weekly intelligence dispatch', 'Access to all published briefs', 'Signal radar (read-only)', 'Weak-signal alerts'],
    color: 'border-white/10',
    badge: null,
  },
  {
    id: 'RESEARCHER',
    label: 'Researcher',
    price: '€19',
    period: '/month',
    description: 'Commission briefs and strategic reports. Full pipeline access.',
    features: ['Everything in Analyst', 'Commission research briefs on any topic', 'Strategic reports (10-15 pages)', '22-researcher Council deliberations', 'Adversarial debate & meta-analysis', 'Verified citation export'],
    color: 'border-indigo-500/40',
    badge: 'Most popular',
  },
  {
    id: 'STUDIO',
    label: 'Studio',
    price: '€49',
    period: '/month',
    description: 'Full editorial control. Publish under your own brand.',
    features: ['Everything in Researcher', 'Publications Studio (custom questions)', 'Council Q&A sessions', 'Custom research verticals', 'White-label export & API access', 'Priority pipeline queue'],
    color: 'border-violet-500/40',
    badge: 'Full access',
  },
];

function planLabel(plan: string): string {
  if (plan === 'TRIAL' || plan === 'ANALYST') return 'ANALYST';
  if (plan === 'EXECUTIVE' || plan === 'RESEARCHER') return 'RESEARCHER';
  if (plan === 'STRATEGY' || plan === 'STUDIO') return 'STUDIO';
  return plan;
}

export default function BillingPage() {
  const router = useRouter();
  const [sub, setSub] = useState<SubscriptionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [upgrading, setUpgrading] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);

  async function handleUpgrade(planId: string) {
    setUpgrading(planId);
    setError('');
    try {
      const res = await fetch('/api/subscription/upgrade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetPlan: planId }),
      });
      const data = await res.json();
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
        return;
      }
      if (data.success) {
        window.location.reload();
      } else {
        setError(data.error || 'Upgrade failed');
      }
    } catch {
      setError('Network error — please try again.');
    } finally {
      setUpgrading(null);
    }
  }

  async function handleManageBilling() {
    setPortalLoading(true);
    try {
      const res = await fetch('/api/subscription/portal', { method: 'POST' });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        setError(data.error || 'Could not open billing portal');
      }
    } catch {
      setError('Network error — please try again.');
    } finally {
      setPortalLoading(false);
    }
  }

  useEffect(() => {
    fetch('/api/subscription/status')
      .then(r => {
        if (r.status === 401) { router.push('/'); return null; }
        return r.json();
      })
      .then(d => { if (d) setSub(d); })
      .catch(() => setError('Failed to load subscription data.'))
      .finally(() => setLoading(false));
  }, [router]);

  const currentPlan = sub ? planLabel(sub.plan) : null;

  return (
    <Shell>
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-10">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-indigo-500/10 to-violet-500/5 border border-indigo-500/20 flex items-center justify-center shadow-[0_0_20px_rgba(99,102,241,0.15)]">
              <CreditCard size={32} className="text-indigo-400" />
            </div>
            <div>
              <div className="text-xs text-indigo-300/70 tracking-[0.25em] uppercase mb-1">Account</div>
              <h1 className="text-4xl font-light tracking-tight text-white/95">Billing & Plan</h1>
            </div>
          </div>
          <p className="text-white/60">Manage your subscription and usage.</p>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-lg bg-red-500/10 border border-red-500/20">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {loading ? (
          <div className="py-20 text-center">
            <Loader2 size={32} className="text-indigo-400 animate-spin mx-auto mb-3" />
            <p className="text-white/40 text-sm">Loading subscription...</p>
          </div>
        ) : sub ? (
          <>
            {/* Current Plan Status */}
            <div className="mb-8 p-6 rounded-xl bg-white/[0.02] border border-white/10">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <p className="text-xs text-indigo-300/70 tracking-[0.2em] uppercase mb-2">Current Plan</p>
                  <div className="flex items-center gap-3 mb-1">
                    <span className="text-2xl font-light text-white">{currentPlan}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      sub.status === 'active' ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20' :
                      sub.status === 'trialing' ? 'bg-indigo-500/15 text-indigo-400 border border-indigo-500/20' :
                      'bg-amber-500/15 text-amber-400 border border-amber-500/20'
                    }`}>
                      {sub.isTrialActive ? `Trial · ${sub.trialDaysRemaining}d left` : sub.status}
                    </span>
                  </div>
                  {sub.currentPeriodEnd && (
                    <p className="text-xs text-white/40 flex items-center gap-1.5 mt-1">
                      <Calendar size={12} />
                      Renews {new Date(sub.currentPeriodEnd).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                    </p>
                  )}
                </div>

                {sub.stripeCustomerId && (
                  <button
                    onClick={handleManageBilling}
                    disabled={portalLoading}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white/70 hover:text-white hover:border-indigo-500/30 transition-all disabled:opacity-50"
                  >
                    {portalLoading ? <Loader2 size={14} className="animate-spin" /> : <ExternalLink size={14} />}
                    Manage billing
                  </button>
                )}
              </div>

              {/* Usage */}
              <div className="mt-6 pt-6 border-t border-white/10 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-white/50 flex items-center gap-1.5">
                      <BarChart3 size={12} />
                      Weekly briefs
                    </span>
                    <span className="text-xs text-white/70">
                      {sub.weeklyPublicationCount} / {sub.weeklyPublicationMax}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all"
                      style={{ width: `${Math.min(100, (sub.weeklyPublicationCount / sub.weeklyPublicationMax) * 100)}%` }}
                    />
                  </div>
                </div>

                {sub.canAccessStudio && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-white/50 flex items-center gap-1.5">
                        <Zap size={12} />
                        Studio sessions
                      </span>
                      <span className="text-xs text-white/70">
                        {sub.studioQuestionsUsed} / {sub.studioQuestionsPerMonth}
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-violet-500 to-purple-500 transition-all"
                        style={{ width: `${Math.min(100, (sub.studioQuestionsUsed / sub.studioQuestionsPerMonth) * 100)}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Plan Cards */}
            <div className="mb-4">
              <p className="text-xs text-white/40 tracking-[0.2em] uppercase mb-6">Available Plans</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {PLANS.map(plan => {
                  const isCurrent = currentPlan === plan.id;
                  return (
                    <div
                      key={plan.id}
                      className={`relative p-5 rounded-xl border transition-all ${
                        isCurrent
                          ? 'bg-indigo-500/10 border-indigo-500/40 shadow-[0_0_20px_rgba(99,102,241,0.15)]'
                          : `bg-white/[0.02] ${plan.color} hover:border-indigo-500/20`
                      }`}
                    >
                      {plan.badge && (
                        <span className="absolute -top-2.5 left-4 text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 font-medium tracking-wide">
                          {plan.badge}
                        </span>
                      )}

                      <div className="mb-4">
                        <p className="text-xs text-white/40 uppercase tracking-[0.15em] mb-1">{plan.label}</p>
                        <div className="flex items-baseline gap-1">
                          <span className="text-2xl font-light text-white">{plan.price}</span>
                          <span className="text-xs text-white/40">{plan.period}</span>
                        </div>
                        <p className="text-xs text-white/50 mt-2 leading-relaxed">{plan.description}</p>
                      </div>

                      <ul className="space-y-2 mb-5">
                        {plan.features.map(f => (
                          <li key={f} className="flex items-start gap-2 text-xs text-white/60">
                            <CheckCircle size={12} className="text-indigo-400 mt-0.5 flex-shrink-0" />
                            {f}
                          </li>
                        ))}
                      </ul>

                      {isCurrent ? (
                        <div className="w-full py-2 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-center text-xs text-indigo-300 font-medium">
                          Current plan
                        </div>
                      ) : (
                        <button
                          onClick={() => handleUpgrade(plan.id)}
                          disabled={upgrading === plan.id}
                          className="w-full py-2 rounded-lg bg-gradient-to-r from-indigo-500 to-violet-600 text-white text-xs font-medium hover:shadow-[0_0_20px_rgba(99,102,241,0.3)] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                          {upgrading === plan.id ? (
                            <><Loader2 size={12} className="animate-spin" /> Processing...</>
                          ) : (
                            plan.id === 'ANALYST' ? 'Downgrade' : 'Upgrade →'
                          )}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Trial warning */}
            {sub.isTrialActive && sub.trialDaysRemaining <= 5 && (
              <div className="mt-6 p-4 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-start gap-3">
                <AlertTriangle size={16} className="text-amber-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-amber-300 mb-1">Trial ending soon</p>
                  <p className="text-xs text-amber-400/70">
                    Your trial expires in {sub.trialDaysRemaining} day{sub.trialDaysRemaining !== 1 ? 's' : ''}.
                    Upgrade to keep access to all features.
                  </p>
                </div>
              </div>
            )}
          </>
        ) : null}
      </div>
    </Shell>
  );
}
