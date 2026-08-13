"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AuthModal from "@/components/AuthModal";
import { PublicPageShell } from "@/components/layout/PublicPageShell";
import { PageHeader, PageSection } from "@/components/layout/PageHeader";
import { getReasoningLenses, REASONING_LENS_COUNT, type ReasoningLens } from "@/lib/brand/reasoning-lenses";
import { PUBLIC_ROUTES, archivesDomainUrl } from "@/lib/public-urls";
import { nx } from "@/lib/brand/public-ui";
import { cn } from "@/lib/utils";
import { ArrowRight } from "lucide-react";
import { ScrollReveal } from "@/components/ui/ScrollReveal";

const TIERS = [
  { id: "all", label: "All" },
  { id: "core", label: "Core" },
  { id: "advanced", label: "Advanced" },
  { id: "specialized", label: "Specialized" },
] as const;

const LENSES = getReasoningLenses();

function LensCard({ lens }: { lens: ReasoningLens }) {
  return (
    <article className="group relative flex flex-col p-6 nx-surface hover:border-white/20 transition-all">
      <div className="flex items-start justify-between gap-4 mb-5">
        <div
          className="w-12 h-12 flex items-center justify-center font-mono text-[11px] font-semibold uppercase tracking-wider"
          style={{
            backgroundColor: `${lens.colorHex}18`,
            border: `1px solid ${lens.colorHex}40`,
            color: lens.colorHex,
          }}
        >
          {lens.domain.slice(0, 2)}
        </div>
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/50 px-2 py-0.5 border border-white/[0.08]">
          {lens.tier}
        </span>
      </div>

      <h3 className="font-display text-base font-medium text-text mb-1">{lens.domain} lens</h3>
      <p className="text-xs text-white/60 mb-4">{lens.focus}</p>
      <p className="text-xs text-white/55 leading-relaxed line-clamp-4 flex-1 mb-4">{lens.approach}</p>

      {lens.frameworks.length > 0 && (
        <div className="mb-4">
          <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-white/45 mb-2">
            Frameworks
          </p>
          <ul className="space-y-1">
            {lens.frameworks.map((fw) => (
              <li key={fw} className="text-[11px] text-white/50 line-clamp-1">
                · {fw}
              </li>
            ))}
          </ul>
        </div>
      )}

      <Link
        href={archivesDomainUrl(lens.domain)}
        className="inline-flex items-center gap-1.5 text-[11px] font-mono text-white/65 hover:text-white mt-auto pt-2 uppercase tracking-[0.1em]"
      >
        Briefs in {lens.domain}
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

  const domains = Array.from(new Set(LENSES.map((l) => l.domain))).sort();
  const filtered = LENSES.filter((l) => {
    if (tierFilter !== "all" && l.tier !== tierFilter) return false;
    if (domainFilter !== "all" && l.domain !== domainFilter) return false;
    return true;
  });

  return (
    <>
      <PublicPageShell currentPage="research" onSignInClick={() => setShowAuthModal(true)} particles={0}>
        <PageSection className="pt-16 sm:pt-20" sectionIndex="01 / 01">
          <PageHeader
            eyebrow="Reasoning models"
            title={`${REASONING_LENS_COUNT} domain lenses`}
            description="Cross-domain analytical models — not personas. Each lens maps evidence, challenges assumptions, and feeds the final position."
          />

          <ScrollReveal>
            <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-6">
              <div className="flex flex-wrap gap-2">
                {TIERS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTierFilter(t.id)}
                    className={cn(
                      "px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.14em]",
                      tierFilter === t.id
                        ? "bg-white/10 text-white border border-white/40"
                        : "text-white/50 border border-white/[0.08]"
                    )}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <select
                value={domainFilter}
                onChange={(e) => setDomainFilter(e.target.value)}
                className={nx.select}
              >
                <option value="all">All domains</option>
                {domains.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
          </ScrollReveal>

          <ScrollReveal>
            <p className="font-mono text-[11px] text-white/50 mb-6 uppercase tracking-[0.14em]">
              {filtered.length} lenses
            </p>
          </ScrollReveal>

          <ScrollReveal stagger>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-12">
              {filtered.map((l) => (
                <LensCard key={l.id} lens={l} />
              ))}
            </div>
          </ScrollReveal>

          <ScrollReveal>
            <div className="text-center nx-surface p-8">
              <h2 className="font-display text-lg font-semibold mb-3">Always publishing</h2>
              <p className="text-sm text-white/60 mb-6 max-w-md mx-auto">
                New positions every day. Browse the full archive.
              </p>
              <button
                type="button"
                onClick={() => router.push(PUBLIC_ROUTES.archives)}
                className="inline-flex items-center gap-2 px-6 py-3 bg-white text-bg text-xs font-semibold uppercase tracking-[0.1em] hover:bg-white/90 group"
              >
                Explore briefs
                <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
              </button>
            </div>
          </ScrollReveal>
        </PageSection>
      </PublicPageShell>

      {showAuthModal && (
        <AuthModal
          isOpen={showAuthModal}
          onClose={() => setShowAuthModal(false)}
          onSignupSuccess={() => {
            setShowAuthModal(false);
            router.push("/archives");
          }}
        />
      )}
    </>
  );
}
