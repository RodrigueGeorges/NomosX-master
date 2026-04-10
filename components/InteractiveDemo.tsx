"use client";

import React, { useState, useEffect, useRef } from 'react';
import { CheckCircle, Search, Brain, Shield, FileText, ChevronRight, Scale, Microscope, BarChart3, Database, Zap, Eye, AlertTriangle, Flame, Globe2, Layers, TrendingUp } from 'lucide-react';

const DEMO_TOPICS = [
  "EU AI Act: impact on European tech competitiveness",
  "BRICS expansion and the future of dollar hegemony",
  "Carbon border adjustments: trade war or climate tool?",
  "Pandemic preparedness: gaps in G20 health infrastructure",
];

const RESEARCHER_DOTS = [
  { initials: "EV", color: "#6366F1" }, { initials: "JC", color: "#8B5CF6" },
  { initials: "AO", color: "#818CF8" }, { initials: "SL", color: "#A78BFA" },
  { initials: "MW", color: "#94A3B8" }, { initials: "IM", color: "#4F46E5" },
  { initials: "KT", color: "#7C3AED" }, { initials: "PS", color: "#A855F7" },
  { initials: "AD", color: "#6366F1" }, { initials: "SP", color: "#8B5CF6" },
  { initials: "RG", color: "#0EA5E9" }, { initials: "NK", color: "#F59E0B" },
  { initials: "CH", color: "#EC4899" }, { initials: "BM", color: "#F97316" },
  { initials: "YT", color: "#14B8A6" }, { initials: "FD", color: "#06B6D4" },
  { initials: "AB", color: "#6366F1" }, { initials: "MP", color: "#10B981" },
  { initials: "VK", color: "#8B5CF6" }, { initials: "HL", color: "#EC4899" },
  { initials: "OB", color: "#F59E0B" }, { initials: "ZA", color: "#14B8A6" },
];

interface PipelineStep {
  id: number;
  icon: React.ElementType;
  label: string;
  detail: string;
  duration: number;
  type: string;
  researchers?: number;
}

const PIPELINE_STEPS: PipelineStep[] = [
  { id: 1,  icon: Search,        label: "SCOUT",    detail: "250M+ sources, 60+ providers",                          duration: 900,  type: "data"       },
  { id: 2,  icon: Database,      label: "INDEX",    detail: "ORCID + ROR author & institution enrichment",           duration: 650,  type: "data"       },
  { id: 3,  icon: Zap,           label: "EMBED",    detail: "Semantic vector generation",                            duration: 480,  type: "data"       },
  { id: 4,  icon: BarChart3,     label: "RANK",     detail: "Quality, novelty & diversity scoring",                  duration: 560,  type: "data"       },
  { id: 5,  icon: FileText,      label: "READER",   detail: "Claims, methods & quantitative extraction",             duration: 950,  type: "data"       },
  { id: 6,  icon: Brain,         label: "ANALYST",  detail: "3-pass synthesis: thematic → contradictions → synthesis",duration: 1500, type: "synthesis"  },
  { id: 7,  icon: Shield,        label: "COUNCIL",  detail: "22 domain researchers reviewing in parallel",           duration: 1700, type: "council",   researchers: 22 },
  { id: 8,  icon: CheckCircle,   label: "GUARD",    detail: "[SRC-N] citation integrity check",                      duration: 450,  type: "validation" },
  { id: 9,  icon: Eye,           label: "VERIFIER", detail: "Semantic cross-check of claims vs. sources",            duration: 520,  type: "validation" },
  { id: 10, icon: AlertTriangle, label: "CRITICAL", detail: "14 epistemic flaw types — 3 parallel critics",          duration: 750,  type: "validation" },
  { id: 11, icon: Scale,         label: "DEBATE",   detail: "Steel-man adversarial challenge",                       duration: 850,  type: "council",   researchers: 3  },
  { id: 12, icon: Microscope,    label: "META",     detail: "Effect sizes, I² heterogeneity, Egger's test",           duration: 780,  type: "council",   researchers: 5  },
  { id: 13, icon: Flame,         label: "DEVIL",    detail: "Final adversarial stress-test",                         duration: 580,  type: "validation" },
  { id: 14, icon: Globe2,        label: "GRAPH",    detail: "Knowledge graph update",                                duration: 370,  type: "knowledge"  },
  { id: 15, icon: Layers,        label: "EDITOR",   detail: "Source-grounded HTML brief rendering",                  duration: 310,  type: "output"     },
  { id: 16, icon: TrendingUp,    label: "PUBLISH",  detail: "Autonomous publication",                                duration: 220,  type: "output"     },
];

const TYPE_COLORS: Record<string, { bg: string; border: string; label: string; icon: string }> = {
  data:       { bg: "bg-slate-500/[0.05]",   border: "border-slate-500/[0.12]",   label: "text-slate-400",   icon: "bg-slate-500/[0.15]"   },
  synthesis:  { bg: "bg-violet-500/[0.05]",  border: "border-violet-500/[0.12]",  label: "text-violet-400",  icon: "bg-violet-500/[0.15]"  },
  council:    { bg: "bg-indigo-500/[0.08]",  border: "border-indigo-500/[0.18]",  label: "text-indigo-400",  icon: "bg-indigo-500/[0.18]"  },
  validation: { bg: "bg-purple-500/[0.05]",  border: "border-purple-500/[0.12]",  label: "text-purple-400",  icon: "bg-purple-500/[0.15]"  },
  knowledge:  { bg: "bg-teal-500/[0.05]",    border: "border-teal-500/[0.12]",    label: "text-teal-400",    icon: "bg-teal-500/[0.15]"    },
  output:     { bg: "bg-emerald-500/[0.05]", border: "border-emerald-500/[0.12]", label: "text-emerald-400", icon: "bg-emerald-500/[0.15]" },
};

const DEMO_RESULTS = [
  {
    sources: 47, used: 18, quality: 89,
    findings: [
      "Risk-tiered regulation reduces compliance cost by 40% for low-risk AI [SRC-3]",
      "Sandbox frameworks attract 2.8× more AI investment vs. prescriptive regimes [SRC-7]",
      "EU tech VC funding declined 12% post-Act announcement, but recovered within 6 months [SRC-11]",
    ],
    summary: "Evidence suggests the EU AI Act's risk-tiered approach balances innovation with safety better than blanket regulations. However, SMEs face disproportionate compliance burdens. Regulatory sandboxes emerge as the critical enabler.",
  },
  {
    sources: 52, used: 21, quality: 92,
    findings: [
      "BRICS+ now represents 36% of global GDP (PPP), surpassing G7 at 30% [SRC-2]",
      "De-dollarisation accelerating in bilateral trade: 23% of BRICS trade settled in local currencies [SRC-8]",
      "Dollar still dominates 58% of global reserves — structural inertia limits rapid displacement [SRC-14]",
    ],
    summary: "The expansion of BRICS challenges dollar hegemony at the margins, but no viable reserve currency alternative exists yet. The transition is gradual, driven by bilateral trade settlement mechanisms rather than a coordinated monetary framework.",
  },
  {
    sources: 41, used: 16, quality: 87,
    findings: [
      "CBAM could reduce carbon leakage by 20–35% in energy-intensive sectors [SRC-4]",
      "Developing nations face $12–18B in annual export cost increases under current CBAM scope [SRC-9]",
      "WTO compatibility remains contested — no precedent for environmental border measures at this scale [SRC-15]",
    ],
    summary: "Carbon border adjustments are effective climate instruments but risk deepening trade tensions with developing economies. Success depends on revenue recycling mechanisms and differentiated treatment for least-developed countries.",
  },
  {
    sources: 38, used: 15, quality: 90,
    findings: [
      "Only 4 of 20 G20 nations meet WHO benchmark for pandemic preparedness spending [SRC-1]",
      "Early-warning surveillance systems could reduce outbreak response time by 47% [SRC-6]",
      "mRNA platform technology enables vaccine development in 60 days vs. 18–24 months traditionally [SRC-12]",
    ],
    summary: "G20 pandemic preparedness remains critically underfunded despite COVID-19 lessons. Key gaps: surveillance infrastructure, manufacturing surge capacity, and equitable distribution frameworks. The Pandemic Fund has mobilised only 12% of its $10.5B target.",
  },
];

type Phase = "typewriter" | "pipeline" | "result";

export default function InteractiveDemo() {
  const [topicIndex, setTopicIndex]     = useState(0);
  const [displayed, setDisplayed]       = useState("");
  const [phase, setPhase]               = useState<Phase>("typewriter");
  const [activeStep, setActiveStep]     = useState(0);
  const [completedSteps, setCompleted]  = useState<number[]>([]);
  const cycleRef                        = useRef<ReturnType<typeof setTimeout> | null>(null);

  const topic = DEMO_TOPICS[topicIndex];
  const demoResult = DEMO_RESULTS[topicIndex];

  const clearCycle = () => { if (cycleRef.current) clearTimeout(cycleRef.current); };

  useEffect(() => {
    clearCycle();
    setDisplayed("");
    setPhase("typewriter");
    setActiveStep(0);
    setCompleted([]);
    return clearCycle;
  }, [topicIndex]);

  useEffect(() => {
    if (phase !== "typewriter") return;

    if (displayed.length < topic.length) {
      cycleRef.current = setTimeout(() => setDisplayed(topic.slice(0, displayed.length + 1)), 36);
    } else {
      cycleRef.current = setTimeout(() => setPhase("pipeline"), 500);
    }

    return clearCycle;
  }, [phase, displayed, topic]);

  useEffect(() => {
    if (phase !== "pipeline") return;

    if (activeStep >= PIPELINE_STEPS.length) {
      cycleRef.current = setTimeout(() => setPhase("result"), 400);
      return;
    }

    const step = PIPELINE_STEPS[activeStep];
    cycleRef.current = setTimeout(() => {
      setCompleted(prev => [...prev, step.id]);
      setActiveStep(s => s + 1);
    }, step.duration);

    return clearCycle;
  }, [phase, activeStep]);

  useEffect(() => {
    if (phase !== "result") return;
    cycleRef.current = setTimeout(() => setTopicIndex(i => (i + 1) % DEMO_TOPICS.length), 6000);
    return clearCycle;
  }, [phase]);

  return (
    <div className="w-full max-w-4xl mx-auto">
      <div className="rounded-2xl border border-white/[0.08] bg-gradient-to-br from-white/[0.03] to-white/[0.01] overflow-hidden">

        {/* Terminal header */}
        <div className="flex items-center justify-between gap-2 px-5 py-3 border-b border-white/[0.06] bg-white/[0.02]">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
            <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/60" />
            <div className="w-2.5 h-2.5 rounded-full bg-green-500/60" />
            <span className="ml-3 text-xs text-white/25 font-mono tracking-wider">nomosx — autonomous pipeline · 16 agents</span>
          </div>
          <div className="hidden sm:flex items-center gap-3">
            {([{label:"data",color:"bg-slate-400"},{label:"synthesis",color:"bg-violet-400"},{label:"council",color:"bg-indigo-400"},{label:"validation",color:"bg-purple-400"},{label:"output",color:"bg-emerald-400"}] as const).map(t => (
              <div key={t.label} className="flex items-center gap-1">
                <div className={`w-1.5 h-1.5 rounded-full ${t.color} opacity-50`} />
                <span className="text-[9px] text-white/20 font-mono">{t.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="p-5 sm:p-7 space-y-5">

          {/* Query */}
          <div className="flex items-start gap-3">
            <span className="text-indigo-400/40 font-mono text-sm mt-0.5 shrink-0">$</span>
            <div>
              <p className="text-[10px] text-white/20 font-mono mb-1 uppercase tracking-widest">research query</p>
              <p className="text-white/85 font-light text-base leading-snug min-h-[1.5rem]">
                {displayed}
                {phase === "typewriter" && (
                  <span className="inline-block w-0.5 h-[1em] bg-indigo-400 ml-0.5 animate-pulse align-middle" />
                )}
              </p>
            </div>
          </div>

          {/* Pipeline steps — 16 agents with color coding */}
          {(phase === "pipeline" || phase === "result") && (
            <div className="space-y-1">
              {PIPELINE_STEPS.map((step, i) => {
                const done        = completedSteps.includes(step.id);
                const running     = phase === "pipeline" && activeStep === i && !done;
                const colors      = TYPE_COLORS[step.type] ?? TYPE_COLORS.data;
                const Icon        = step.icon as React.ComponentType<{ size?: number; className?: string }>;
                const researchers = step.researchers;
                return (
                  <div key={step.id}>
                    <div className={`flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all duration-300 ${
                      done    ? `${colors.bg} ${colors.border} border` :
                      running ? "bg-white/[0.04] border border-white/[0.09]" :
                                "opacity-20"
                    }`}>
                      <span className="text-[8px] font-mono text-white/15 w-4 shrink-0 text-right tabular-nums">
                        {String(step.id).padStart(2, '0')}
                      </span>
                      <div className={`w-5 h-5 rounded flex items-center justify-center shrink-0 ${
                        done ? colors.icon : running ? "bg-white/[0.08]" : "bg-white/[0.03]"
                      }`}>
                        {done
                          ? <CheckCircle size={10} className={colors.label} />
                          : <Icon size={10} className={running ? "text-white/55 animate-pulse" : "text-white/15"} />
                        }
                      </div>
                      <span className={`text-[10px] font-mono tracking-wider w-14 shrink-0 ${
                        done ? colors.label : running ? "text-white/55" : "text-white/15"
                      }`}>{step.label}</span>
                      <span className={`text-[11px] leading-tight flex-1 truncate ${
                        done ? "text-white/35" : running ? "text-white/30" : "text-white/10"
                      }`}>{step.detail}</span>
                      {running && (
                        <div className="flex gap-0.5 shrink-0">
                          {[0,1,2].map(d => (
                            <div key={d} className="w-1 h-1 rounded-full bg-indigo-400/60 animate-bounce" style={{ animationDelay: `${d * 120}ms` }} />
                          ))}
                        </div>
                      )}
                      {done && researchers && (
                        <span className={`text-[9px] font-mono shrink-0 ${colors.label} opacity-50`}>{researchers}✓</span>
                      )}
                      {done && !researchers && (
                        <span className={`text-[9px] shrink-0 ${colors.label} opacity-35`}>✓</span>
                      )}
                    </div>

                    {/* Researcher visual panel — COUNCIL / DEBATE / META steps */}
                    {researchers && running && (
                      <div className="mx-3 mt-1 mb-0.5 p-3 rounded-lg border border-indigo-500/20 bg-indigo-500/[0.05]">
                        <div className="flex items-center gap-2 mb-2.5">
                          <span className="relative flex h-1.5 w-1.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75" />
                            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-indigo-400" />
                          </span>
                          <span className="text-[9px] text-indigo-400/60 font-mono tracking-widest uppercase">
                            {researchers} researchers active
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {RESEARCHER_DOTS.slice(0, researchers).map((r, ri) => (
                            <div
                              key={ri}
                              className="w-6 h-6 rounded-full flex items-center justify-center text-[7px] font-bold text-white"
                              style={{
                                backgroundColor: r.color + '20',
                                border: `1px solid ${r.color}45`,
                                boxShadow: `0 0 8px ${r.color}25`,
                                animation: `pulse 2s ease-in-out ${ri * 70}ms infinite`,
                              }}
                            >
                              {r.initials}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Result card */}
          {phase === "result" && (
            <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/[0.04] p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle size={12} className="text-emerald-400" />
                  <span className="text-xs font-medium text-emerald-400 uppercase tracking-wider font-mono">Brief generated</span>
                </div>
                <div className="flex items-center gap-3 text-[10px] text-white/30 font-mono">
                  <span>{demoResult.sources} scanned</span>
                  <span>{demoResult.used} cited</span>
                  <span className="text-indigo-300/70">{demoResult.quality}% quality</span>
                </div>
              </div>
              <div className="space-y-1.5">
                {demoResult.findings.map((f, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <ChevronRight size={10} className="text-indigo-400/45 mt-0.5 shrink-0" />
                    <span className="text-xs text-white/50">{f}</span>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-white/30 leading-relaxed border-t border-white/[0.05] pt-3">
                {demoResult.summary}
              </p>
            </div>
          )}

          {/* Topic selector */}
          <div className="flex items-center justify-center gap-2 pt-1">
            {DEMO_TOPICS.map((_, i) => (
              <button key={i} onClick={() => setTopicIndex(i)}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i === topicIndex ? "w-4 bg-indigo-400" : "w-1.5 bg-white/15 hover:bg-white/30"
                }`}
              />
            ))}
          </div>

        </div>
      </div>
    </div>
  );
}
