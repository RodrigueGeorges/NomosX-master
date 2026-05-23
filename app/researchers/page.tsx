"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AuthModal from "@/components/AuthModal";
import { PublicPageShell } from "@/components/layout/PublicPageShell";
import { PageHeader, PageSection } from "@/components/layout/PageHeader";
import { RESEARCHERS, type Researcher } from "@/lib/researchers";
import { PUBLIC_ROUTES, archivesDomainUrl } from "@/lib/public-urls";
import { cn } from "@/lib/utils";
import { ArrowRight } from "lucide-react";

const TIERS = [
  { id: "all", label: "All" },
  { id: "core", label: "Core" },
  { id: "advanced", label: "Advanced" },
  { id: "specialized", label: "Specialized" },
] as const;

function ResearcherCard({ r }: { r: Researcher }) {
  const topPubs = (r.landmarkTopics ?? r.fields ?? []).slice(0, 3);

  return (
    <article className="group relative flex flex-col rounded-2xl p-6 border border-white/[0.06] bg-bg-elevated/80 hover:border-accent/20 transition-all">
      <div className="flex items-start justify-between gap-4 mb-5">
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center font-mono text-xs font-semibold"
          style={{
            backgroundColor: `${r.colorHex}18`,
            border: `1px solid ${r.colorHex}40`,
            color: r.colorHex,
          }}
        >
          {r.initials}
        </div>
        <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-white/30 px-2 py-0.5 border border-white/[0.06] rounded-full">
          {r.tier}
        </span>
      </div>

      <h3 className="font-display text-base font-medium text-text mb-1">{r.name}</h3>
      <p className="text-xs text-white/45 mb-1">{r.title}</p>
      <p className="text-[11px] text-white/30 mb-4">{r.institution}</p>
      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent/60 mb-3">
        {r.domain}
      </span>
      <p className="text-xs text-white/40 leading-relaxed line-clamp-3 flex-1 mb-4">{r.specialty}</p>

      {topPubs.length > 0 && (
        <div className="mb-4">
          <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-white/25 mb-2">
            Key references
          </p>
          <ul className="space-y-1">
            {topPubs.map((topic) => (
              <li key={topic} className="text-[11px] text-white/35 line-clamp-1">
                · {topic}
              </li>
            ))}
          </ul>
        </div>
      )}

      <Link
        href={archivesDomainUrl(r.domain)}
        className="inline-flex items-center gap-1.5 text-[11px] font-mono text-accent/70 hover:text-accent mt-auto pt-2"
      >
        Inquiries in {r.domain}
        <ArrowRight size={12} />
      </Link>
    </article>
  );
}

export default function ResearchersPage() {
  const router = useRouter();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [tierFilter, setTierFilter] = useState<(typeof TIERS)[number]["id"]>("all");
  const [domainFilter, setDomainFilter] = useState<string>("all");

  const domains = Array.from(new Set(RESEARCHERS.map((r) => r.domain))).sort();
  const filtered = RESEARCHERS.filter((r) => {
    if (tierFilter !== "all" && r.tier !== tierFilter) return false;
    if (domainFilter !== "all" && r.domain !== domainFilter) return false;
    return true;
  });

  return (
    <>
      <PublicPageShell currentPage="research" onSignInClick={() => setShowAuthModal(true)}>
        <PageSection className="pt-20 sm:pt-28">
          <PageHeader
            eyebrow="Research Council"
            title={`${RESEARCHERS.length} domain researchers`}
            description="The autonomous think tank routes every inquiry through domain experts with adversarial review at each stage."
          />

          <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-10">
            <div className="flex flex-wrap gap-2">
              {TIERS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTierFilter(t.id)}
                  className={cn(
                    "px-3 py-1.5 rounded-lg font-mono text-[10px] uppercase tracking-[0.14em]",
                    tierFilter === t.id
                      ? "bg-accent/15 text-accent border border-accent/30"
                      : "text-white/40 border border-white/[0.06]"
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <select
              value={domainFilter}
              onChange={(e) => setDomainFilter(e.target.value)}
              className="sm:ml-auto px-3 py-2 rounded-lg bg-bg-elevated border border-white/[0.08] text-sm text-white/70 font-mono text-[11px] focus:outline-none focus:border-accent/30"
            >
              <option value="all">All domains</option>
              {domains.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>

          <p className="font-mono text-[10px] text-white/30 mb-6">{filtered.length} researchers</p>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-16">
            {filtered.map((r) => (
              <ResearcherCard key={r.id} r={r} />
            ))}
          </div>

          <div className="text-center rounded-2xl border border-white/[0.06] bg-bg-elevated p-10">
            <h2 className="font-display text-xl font-semibold mb-3">Autonomous publications</h2>
            <p className="text-sm text-white/45 mb-6 max-w-md mx-auto">
              The think tank publishes 24/7. Scout → rank → read → simulate → challenge → publish.
            </p>
            <button
              type="button"
              onClick={() => router.push(PUBLIC_ROUTES.archives)}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-accent text-bg text-sm font-semibold hover:brightness-110 group"
            >
              Browse inquiries
              <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
            </button>
          </div>
        </PageSection>
      </PublicPageShell>

      {showAuthModal && (
        <AuthModal
          isOpen={showAuthModal}
          onClose={() => setShowAuthModal(false)}
          onSignupSuccess={() => {
            setShowAuthModal(false);
            router.push("/dashboard");
          }}
        />
      )}
    </>
  );
}
