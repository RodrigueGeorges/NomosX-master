"use client";

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, CheckCircle2, Loader2 } from 'lucide-react';

type Step = { label: string; detail: string; duration: number };

interface PipelineDemoProps {
  steps: Step[];
  query: string;
  excerpt: string;
  onCTA: () => void;
}

export default function PipelineDemo({ steps, query, excerpt, onCTA }: PipelineDemoProps) {
  const [running, setRunning] = useState(false);
  const [currentStep, setCurrentStep] = useState(-1);
  const [done, setDone] = useState(false);
  const [typedQuery, setTypedQuery] = useState('');
  const [showExcerpt, setShowExcerpt] = useState(false);
  const sectionRef = useRef<HTMLDivElement>(null);
  const hasStarted = useRef(false);

  // Auto-start when scrolled into view
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !hasStarted.current) {
          hasStarted.current = true;
          startDemo();
        }
      },
      { threshold: 0.3 }
    );
    if (sectionRef.current) observer.observe(sectionRef.current);
    return () => observer.disconnect();
  }, []);

  function startDemo() {
    setRunning(true);
    setCurrentStep(-1);
    setDone(false);
    setShowExcerpt(false);
    setTypedQuery('');

    // Type the query first
    let i = 0;
    const typeInterval = setInterval(() => {
      i++;
      setTypedQuery(query.slice(0, i));
      if (i >= query.length) {
        clearInterval(typeInterval);
        // Start pipeline after short pause
        setTimeout(() => runPipeline(0), 600);
      }
    }, 28);
  }

  function runPipeline(stepIndex: number) {
    if (stepIndex >= steps.length) {
      setCurrentStep(steps.length);
      setDone(true);
      setTimeout(() => setShowExcerpt(true), 400);
      return;
    }
    setCurrentStep(stepIndex);
    setTimeout(() => runPipeline(stepIndex + 1), steps[stepIndex].duration);
  }

  function replay() {
    hasStarted.current = false;
    setRunning(false);
    setCurrentStep(-1);
    setDone(false);
    setShowExcerpt(false);
    setTypedQuery('');
    setTimeout(() => {
      hasStarted.current = true;
      startDemo();
    }, 300);
  }

  // Highlight [SRC-N] citations in excerpt
  function renderExcerpt(text: string) {
    const parts = text.split(/(\[SRC-\d+\])/g);
    return parts.map((part, i) =>
      /\[SRC-\d+\]/.test(part)
        ? <span key={i} className="text-amber-400/90 font-mono text-[11px] font-semibold bg-amber-500/10 px-1 py-0.5 rounded">{part}</span>
        : <span key={i}>{part}</span>
    );
  }

  return (
    <section ref={sectionRef} className="relative px-6 sm:px-8 py-28">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_50%,rgba(212,175,55,0.05),transparent_70%)] pointer-events-none" />
      <div className="max-w-5xl mx-auto relative">

        {/* Header */}
        <div className="text-center mb-14">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-amber-500/20 bg-amber-500/5 mb-5">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            <span className="text-[11px] text-amber-300/80 font-semibold tracking-[0.2em] uppercase">Live demonstration</span>
          </div>
          <h2 className="font-display text-3xl sm:text-4xl font-bold text-white mb-4">
            From question to verified truth.
          </h2>
          <p className="text-base text-white/40 max-w-xl mx-auto">
            Watch a research question move through the full verification pipeline — in real time.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">

          {/* LEFT — Query + Pipeline steps */}
          <div className="space-y-4">

            {/* Query box */}
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
              <p className="text-[10px] text-white/25 font-mono tracking-[0.2em] uppercase mb-3">Research question</p>
              <p className="text-sm text-white/70 leading-relaxed min-h-[3rem]">
                {typedQuery}
                {running && !done && typedQuery.length < query.length && (
                  <span className="inline-block w-0.5 h-4 bg-amber-400 ml-0.5 animate-pulse align-middle" />
                )}
              </p>
            </div>

            {/* Pipeline steps */}
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] overflow-hidden">
              <div className="px-5 py-3 border-b border-white/[0.05]">
                <p className="text-[10px] text-white/25 font-mono tracking-[0.2em] uppercase">Verification pipeline</p>
              </div>
              <div className="p-3 space-y-1">
                {steps.map((step, i) => {
                  const isActive = currentStep === i;
                  const isDone = currentStep > i;
                  const isPending = currentStep < i;
                  return (
                    <div
                      key={i}
                      className={`flex items-start gap-3 px-3 py-2.5 rounded-xl transition-all duration-300 ${
                        isActive ? 'bg-amber-500/[0.06] border border-amber-500/15' :
                        isDone  ? 'opacity-60' : 'opacity-25'
                      }`}
                    >
                      <div className="flex-shrink-0 mt-0.5">
                        {isDone ? (
                          <CheckCircle2 size={14} className="text-amber-400/70" />
                        ) : isActive ? (
                          <Loader2 size={14} className="text-amber-400 animate-spin" />
                        ) : (
                          <div className="w-3.5 h-3.5 rounded-full border border-white/20" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-xs font-medium leading-none mb-1 ${isActive ? 'text-white' : isDone ? 'text-white/60' : 'text-white/30'}`}>
                          {step.label}
                        </p>
                        {(isActive || isDone) && (
                          <p className="text-[11px] text-white/35 leading-relaxed">{step.detail}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Replay */}
            {done && (
              <motion.button
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                onClick={replay}
                className="text-xs text-white/30 hover:text-white/60 transition-colors flex items-center gap-1.5"
              >
                <span>↺</span> Run again
              </motion.button>
            )}
          </div>

          {/* RIGHT — Output excerpt */}
          <div className="relative">
            <AnimatePresence>
              {!showExcerpt && (
                <motion.div
                  key="placeholder"
                  exit={{ opacity: 0 }}
                  className="rounded-2xl border border-white/[0.06] bg-white/[0.01] p-8 flex flex-col items-center justify-center text-center min-h-[320px] gap-4"
                >
                  <div className="w-12 h-12 rounded-2xl border border-white/[0.08] bg-white/[0.02] flex items-center justify-center">
                    <div className="w-2 h-2 rounded-full bg-white/20 animate-pulse" />
                  </div>
                  <p className="text-xs text-white/20">Output will appear here once the pipeline completes.</p>
                </motion.div>
              )}
              {showExcerpt && (
                <motion.div
                  key="excerpt"
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                  className="rounded-2xl border border-amber-500/15 bg-amber-500/[0.02] overflow-hidden"
                >
                  {/* Top bar */}
                  <div className="px-5 py-3 border-b border-amber-500/10 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                      <p className="text-[10px] text-amber-300/60 font-mono tracking-[0.2em] uppercase">Executive Brief — excerpt</p>
                    </div>
                    <span className="text-[10px] text-white/20 font-mono">22 sources · verified</span>
                  </div>

                  {/* Content */}
                  <div className="p-6 space-y-5">
                    <div>
                      <p className="text-[10px] text-white/25 font-mono tracking-[0.15em] uppercase mb-2">Key finding</p>
                      <p className="text-sm text-white/65 leading-relaxed">
                        {renderExcerpt(excerpt)}
                      </p>
                    </div>

                    {/* Evidence bar */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <p className="text-[10px] text-white/25 font-mono tracking-[0.15em] uppercase">Evidence quality</p>
                        <span className="text-[10px] text-amber-300/60 font-mono">8.4 / 10</span>
                      </div>
                      <div className="h-1 rounded-full bg-white/[0.06] overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: '84%' }}
                          transition={{ duration: 1, delay: 0.3, ease: 'easeOut' }}
                          className="h-full rounded-full bg-gradient-to-r from-amber-600 to-amber-400"
                        />
                      </div>
                    </div>

                    {/* Source tags */}
                    <div className="flex flex-wrap gap-1.5">
                      {['[SRC-1]','[SRC-3]','[SRC-5]','[SRC-7]','[SRC-9]','[SRC-12]','[SRC-14]'].map((s) => (
                        <span key={s} className="text-[10px] px-2 py-0.5 rounded-full border border-amber-500/15 text-amber-300/50 font-mono bg-amber-500/[0.03]">{s}</span>
                      ))}
                      <span className="text-[10px] px-2 py-0.5 rounded-full border border-white/[0.06] text-white/20 font-mono">+15 more</span>
                    </div>

                    {/* CTA */}
                    <button
                      onClick={onCTA}
                      className="group w-full mt-2 py-3 rounded-xl bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-[#09090b] font-semibold text-xs tracking-wide transition-all duration-300 shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2"
                    >
                      Access the full report — free
                      <ArrowRight size={13} className="group-hover:translate-x-0.5 transition-transform" />
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

        </div>
      </div>
    </section>
  );
}
