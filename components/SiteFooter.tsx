"use client";

import { useRouter } from "next/navigation";
import { NomosXLogo3D } from "@/components/brand/NomosXLogo3D";
import { ArrowRight, Github, Twitter, Shield, Activity, Database } from "lucide-react";

const LINKS = {
  Product: [
    { label: "Methodology", href: "/methodology" },
    { label: "Publications", href: "/articles" },
    { label: "Pricing", href: "/pricing" },
    { label: "API Access", href: "/pricing" },
  ],
  Research: [
    { label: "About the Think Tank", href: "/about" },
    { label: "Council Protocol", href: "/methodology" },
    { label: "Citation Standards", href: "/methodology" },
  ],
  Company: [
    { label: "About", href: "/about" },
    { label: "Privacy Policy", href: "/privacy" },
    { label: "Terms of Service", href: "/terms" },
    { label: "Contact", href: "mailto:contact@nomosx.com" },
  ],
};

const STATS = [
  { value: "250M+", label: "Sources indexed" },
  { value: "22", label: "PhD researchers" },
  { value: "60+", label: "Data providers" },
  { value: "16", label: "Pipeline agents" },
];

interface SiteFooterProps {
  onSignInClick?: () => void;
}

export default function SiteFooter({ onSignInClick }: SiteFooterProps) {
  const router = useRouter();

  return (
    <footer className="relative border-t border-white/[0.06] overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_40%_at_50%_100%,rgba(245,215,120,0.055),transparent_70%)]" />
      </div>

      {/* CTA strip */}
      <div className="relative border-b border-white/[0.05]">
        <div className="max-w-7xl mx-auto px-6 sm:px-8 py-14 flex flex-col md:flex-row items-center justify-between gap-8">
          <div>
            <h3 className="font-display text-2xl sm:text-3xl font-bold text-white mb-2 leading-tight">
              Autonomous research infrastructure.{" "}
              <span className="nx-gradient-text">Open access.</span>
            </h3>
            <p className="text-sm text-white/35 max-w-md">
              22 researchers. 16 agents. 250M+ sources. Free tier available.
            </p>
          </div>
          <button
            onClick={onSignInClick}
            className="group flex-shrink-0 flex items-center gap-2 px-6 py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm transition-all duration-300 shadow-lg shadow-amber-300/10 hover:shadow-amber-300/20 hover:scale-[1.03]"
          >
            Access institutional intelligence — Free tier
            <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
          </button>
        </div>
      </div>

      {/* Stats bar */}
      <div className="relative border-b border-white/[0.04]">
        <div className="max-w-7xl mx-auto px-6 sm:px-8 py-8">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
            {STATS.map((s, i) => (
              <div key={i} className="text-center">
                <div className="font-display text-2xl font-bold text-white mb-0.5">{s.value}</div>
                <div className="text-xs text-white/25 tracking-wide">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Protocol bar */}
      <div className="relative border-b border-white/[0.04]">
        <div className="max-w-7xl mx-auto px-6 sm:px-8 py-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { icon: Shield, label: "Citation guard", value: "source-bound claims" },
              { icon: Activity, label: "Live radar", value: "continuous signal scan" },
              { icon: Database, label: "Institutional memory", value: "persistent evidence graph" },
            ].map((item) => {
              const FIcon = item.icon;
              return (
                <div key={item.label} className="rounded-xl border border-white/[0.05] bg-white/[0.02] p-4">
                  <FIcon size={15} className="text-amber-100/60 mb-3" />
                  <div className="text-[10px] text-white/25 uppercase tracking-[0.16em]">{item.label}</div>
                  <div className="text-xs text-white/45 mt-1">{item.value}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Main footer grid */}
      <div className="relative max-w-7xl mx-auto px-6 sm:px-8 py-14">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12">
          {/* Brand column */}
          <div className="md:col-span-1">
            <div
              className="cursor-pointer mb-5 inline-block"
              onClick={() => router.push("/")}
            >
              <NomosXLogo3D size={40} />
            </div>
            <p className="text-sm text-white/30 leading-relaxed mb-6 max-w-[220px]">
              Autonomous research infrastructure. 22 researchers. 16 agents. 250M+ sources. Multi-pass validation.
            </p>
            <div className="flex items-center gap-3">
              <a
                href="https://x.com/nomosx_ai"
                target="_blank"
                rel="noopener noreferrer"
                className="w-8 h-8 rounded-lg border border-white/[0.08] bg-white/[0.03] flex items-center justify-center text-white/30 hover:text-white/60 hover:border-white/[0.15] hover:bg-white/[0.06] transition-all duration-200"
              >
                <Twitter size={13} />
              </a>
              <a
                href="https://github.com/nomosx"
                target="_blank"
                rel="noopener noreferrer"
                className="w-8 h-8 rounded-lg border border-white/[0.08] bg-white/[0.03] flex items-center justify-center text-white/30 hover:text-white/60 hover:border-white/[0.15] hover:bg-white/[0.06] transition-all duration-200"
              >
                <Github size={13} />
              </a>
              <div className="flex items-center gap-1.5 ml-1">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400" />
                </span>
                <span className="text-[10px] text-white/20 font-medium">Pipeline live</span>
              </div>
            </div>
          </div>

          {/* Link columns */}
          {Object.entries(LINKS).map(([category, links]) => (
            <div key={category}>
              <p className="text-[11px] font-semibold tracking-[0.2em] uppercase text-white/25 mb-5">
                {category}
              </p>
              <ul className="space-y-3">
                {links.map((link) => (
                  <li key={link.label}>
                    <button
                      onClick={() => router.push(link.href)}
                      className="text-sm text-white/35 hover:text-white/65 transition-colors duration-200 text-left"
                    >
                      {link.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom bar */}
      <div className="relative border-t border-white/[0.04]">
        <div className="max-w-7xl mx-auto px-6 sm:px-8 py-5 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs text-white/30">
            © 2026 NomosX · Autonomous Think Tank · All rights reserved
          </p>
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-amber-300/60" />
            <p className="text-xs text-white/30">
              Powered by GPT-4o · OpenAlex · 60+ providers · 250M+ sources
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
