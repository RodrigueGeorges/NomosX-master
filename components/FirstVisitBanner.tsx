"use client";

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { X, BookOpen, Bell, Zap, ChevronRight } from 'lucide-react';

const STORAGE_KEY = 'nomosx_onboarding_dismissed';

const STEPS = [
  {
    icon: BookOpen,
    color: 'text-indigo-400',
    bg: 'bg-indigo-500/10 border-indigo-500/20',
    title: 'Read a brief',
    description: 'Browse the latest peer-reviewed intelligence briefs published by the Think Tank.',
    cta: 'Browse publications',
    href: '/publications',
  },
  {
    icon: Bell,
    color: 'text-violet-400',
    bg: 'bg-violet-500/10 border-violet-500/20',
    title: 'Subscribe to the dispatch',
    description: 'Get the weekly intelligence digest delivered to your inbox every Monday.',
    cta: 'Set up newsletter',
    href: '/dashboard/settings',
  },
  {
    icon: Zap,
    color: 'text-amber-400',
    bg: 'bg-amber-500/10 border-amber-500/20',
    title: 'Commission research',
    description: 'Upgrade to Researcher to commission custom briefs and strategic reports.',
    cta: 'See plans',
    href: '/pricing',
  },
];

export default function FirstVisitBanner() {
  const router = useRouter();
  const [visible, setVisible] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const dismissed = localStorage.getItem(STORAGE_KEY);
    if (!dismissed) setVisible(true);
  }, []);

  function dismiss() {
    localStorage.setItem(STORAGE_KEY, '1');
    setVisible(false);
  }

  if (!mounted || !visible) return null;

  return (
    <div className="mb-8 rounded-2xl border border-indigo-500/20 bg-gradient-to-br from-indigo-500/[0.06] to-violet-500/[0.03] p-6">
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <p className="text-xs text-indigo-400/80 font-semibold tracking-[0.2em] uppercase mb-1">
            Getting started
          </p>
          <h2 className="text-lg font-light text-white">
            Welcome to NomosX — here's where to start.
          </h2>
        </div>
        <button
          onClick={dismiss}
          className="p-1.5 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/[0.04] transition-all flex-shrink-0"
          aria-label="Dismiss"
        >
          <X size={16} />
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {STEPS.map((step, i) => (
          <button
            key={step.title}
            onClick={() => { dismiss(); router.push(step.href); }}
            className="group text-left p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:border-indigo-500/25 hover:bg-white/[0.04] transition-all"
          >
            <div className="flex items-start gap-3">
              <div className={`w-8 h-8 rounded-lg border flex items-center justify-center flex-shrink-0 ${step.bg}`}>
                <step.icon size={15} className={step.color} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-[10px] text-white/25 font-mono">{i + 1}</span>
                  <p className="text-sm font-medium text-white/80">{step.title}</p>
                </div>
                <p className="text-xs text-white/40 leading-relaxed mb-2">{step.description}</p>
                <span className={`text-xs font-medium flex items-center gap-1 ${step.color} group-hover:gap-1.5 transition-all`}>
                  {step.cta} <ChevronRight size={11} />
                </span>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
