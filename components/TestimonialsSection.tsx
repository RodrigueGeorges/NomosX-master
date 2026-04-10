"use client";

import { FileText, Brain, Shield, BarChart3 } from "lucide-react";

const USE_CASES = [
  {
    icon: FileText,
    title: "Weekly intelligence dispatch",
    description: "Every week, the pipeline autonomously selects the most significant research questions, runs the full 16-agent pipeline, and publishes source-grounded briefs. No human trigger.",
    output: "2\u20134 page brief \u00b7 15\u201325 cited sources \u00b7 adversarially reviewed",
    color: "from-indigo-500 to-indigo-700",
    glow: "rgba(99,102,241,0.35)",
  },
  {
    icon: Brain,
    title: "Strategic reports on demand",
    description: "Commission a 10\u201315 page deep dive on any question. Includes scenario planning, stakeholder analysis, meta-analysis with effect sizes, and implementation roadmap.",
    output: "15 page report \u00b7 20\u201330 sources \u00b7 forest plots & evidence gauges",
    color: "from-violet-500 to-violet-700",
    glow: "rgba(139,92,246,0.35)",
  },
  {
    icon: Shield,
    title: "Adversarial peer review",
    description: "Every publication passes through a 22-researcher Council Protocol: 3-pass multi-pass analysis, steel-man debate, devil\u2019s advocate challenges, and citation verification.",
    output: "Council deliberation \u00b7 debate transcript \u00b7 confidence assessment",
    color: "from-indigo-400 to-violet-600",
    glow: "rgba(129,140,248,0.35)",
  },
  {
    icon: BarChart3,
    title: "Signal detection & weak signals",
    description: "Continuous monitoring across 250M+ sources to detect emerging trends, paradigm shifts, and weak signals before they become mainstream consensus.",
    output: "Signal radar \u00b7 trend alerts \u00b7 knowledge graph tracking",
    color: "from-purple-500 to-indigo-700",
    glow: "rgba(168,85,247,0.35)",
  },
];

export default function TestimonialsSection() {
  return (
    <section className="relative px-6 sm:px-8 py-24 overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_50%,rgba(99,102,241,0.06),transparent_70%)]" />
      </div>

      <div className="max-w-6xl mx-auto relative">
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-indigo-500/20 bg-indigo-500/5 mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
            <span className="text-[11px] text-indigo-300 font-semibold tracking-[0.2em] uppercase">
              What you get
            </span>
          </div>
          <h2 className="font-display text-3xl sm:text-4xl font-bold text-white mb-4 leading-tight">
            Institutional-grade research.
            <br />
            <span className="nx-gradient-text">Delivered autonomously.</span>
          </h2>
          <p className="text-base text-white/40 max-w-xl mx-auto">
            From weekly dispatches to on-demand strategic reports \u2014 every
            output is source-grounded, adversarially reviewed, and fully
            traceable.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {USE_CASES.map((uc, i) => {
            const Icon = uc.icon;
            return (
              <div
                key={i}
                className="group relative rounded-2xl border border-white/[0.06] bg-white/[0.02] p-7 hover:border-indigo-500/20 hover:bg-white/[0.035] transition-all duration-500"
                style={{ animationDelay: `${i * 100}ms` }}
              >
                <div className="flex items-center gap-3 mb-4">
                  <div
                    className={`w-10 h-10 rounded-xl bg-gradient-to-br ${uc.color} flex items-center justify-center flex-shrink-0`}
                    style={{ boxShadow: `0 0 16px ${uc.glow}` }}
                  >
                    <Icon size={18} className="text-white" />
                  </div>
                  <h3 className="text-sm font-semibold text-white/90">
                    {uc.title}
                  </h3>
                </div>

                <p className="text-[14px] text-white/50 leading-relaxed mb-4">
                  {uc.description}
                </p>

                <div className="px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.06]">
                  <p className="text-[11px] text-indigo-300/70 font-mono tracking-wide">
                    {uc.output}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-10 flex items-center justify-center gap-3">
          <div className="h-px flex-1 max-w-[120px] bg-gradient-to-r from-transparent to-white/8" />
          <p className="text-xs text-white/20 text-center">
            Every claim is sourced. Every source is traceable.
          </p>
          <div className="h-px flex-1 max-w-[120px] bg-gradient-to-l from-transparent to-white/8" />
        </div>
      </div>
    </section>
  );
}
