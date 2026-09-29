"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import AuthModal from "@/components/AuthModal";
import { PublicPageShell } from "@/components/layout/PublicPageShell";
import { EtherealCard, PageHeader, PageSection } from "@/components/layout/PageHeader";
import { ScrollReveal } from "@/components/ui/ScrollReveal";
import { StatCounter } from "@/components/ui/StatCounter";
import { PUBLIC_ROUTES } from "@/lib/public-urls";
import { DomainMap } from "@/components/signature/DomainMap";
import { KnowledgeGraphHero } from "@/components/signature/KnowledgeGraphHero";
import {
  BRAND_POSITIONING,
  BRAND_TAGLINE,
  NOMOS_PHILOSOPHY_STATEMENT,
} from "@/lib/brand/public-copy";
import { ArrowRight } from "lucide-react";

/**
 * About page — SpaceX + Harvard Growth Lab inspired.
 *
 * Structure (Harvard "How we work / Where we work" + SpaceX mission-led):
 *  01 Mission statement (full-bleed, outcome-led, no card)
 *  02 How we work (AgenticCore — the living system)
 *  03 Where we work (DomainMap — eight domains)
 *  04 The institute (the agentic system as the "team" — NomosX twist)
 *  05 The origin + pillars (philosophy + what you get, merged)
 *  06 CTA
 *
 * Removed vs. old: redundant manifesto (duplicated on home), overlapping
 * Vision + Values 4-card grids (collapsed into the institute + pillars).
 */

export default function AboutPage() {
  const router = useRouter();
  const t = useTranslations();
  const [showAuthModal, setShowAuthModal] = useState(false);

  return (
    <>
      <PublicPageShell currentPage="about" onSignInClick={() => setShowAuthModal(true)} particles={0}>
        {/* Hero — SpaceX-style mission block, outcome-led */}
        <PageSection className="pt-16 sm:pt-24 pb-10">
          <PageHeader
            eyebrow={BRAND_POSITIONING}
            title={
              <>
                {t("About.title")}{" "}
                <span className="text-black/70 dark:text-white/70">{t("About.titleAccent")}</span>
              </>
            }
            description={t("About.description")}
            align="center"
          />
        </PageSection>

        {/* 01 — Mission statement (full-bleed, large type, no card) */}
        <PageSection sectionIndex="01 / 06" className="relative py-20 sm:py-32 overflow-hidden">
          <KnowledgeGraphHero />
          <div className="relative max-w-3xl mx-auto text-center">
            <ScrollReveal>
              <p className="nx-eyebrow mb-8 justify-center">{t("About.missionEyebrow")}</p>
            </ScrollReveal>
            <ScrollReveal delay={120}>
              <p className="font-display text-2xl sm:text-3xl lg:text-4xl font-light text-black dark:text-white leading-[1.25] tracking-tight">
                {t("About.missionStatement")}
              </p>
            </ScrollReveal>
          </div>
        </PageSection>

        {/* 02 — How we work (the protocol, told not diagrammed) */}
        <PageSection sectionIndex="02 / 06" className="py-16 sm:py-20">
          <div className="max-w-2xl mx-auto">
            <ScrollReveal>
              <p className="nx-eyebrow mb-3">{t("About.howWeWork")}</p>
              <h2 className="font-display text-2xl sm:text-3xl font-semibold text-black dark:text-white tracking-tight mb-5">
                {t("Brand.methodStepsInline")}
              </h2>
              <p className="text-base text-black/65 dark:text-white/65 leading-[1.6]">
                {t("About.howWeWorkDesc")}
              </p>
            </ScrollReveal>
          </div>
        </PageSection>

        {/* 03 — Where we work (DomainMap) */}
        <DomainMap sectionIndex="03 / 06" />

        {/* 04 — The institute (the agentic system as the "team") */}
        <PageSection sectionIndex="04 / 06" className="py-16 sm:py-20">
          <div className="max-w-4xl mx-auto">
            <ScrollReveal>
              <p className="nx-eyebrow mb-3">{t("About.theInstitute")}</p>
              <h2 className="font-display text-2xl sm:text-3xl font-semibold text-black dark:text-white tracking-tight mb-5">
                {t("About.title")} <span className="text-black/70 dark:text-white/70">{t("About.titleAccent")}</span>
              </h2>
              <p className="text-base text-black/65 dark:text-white/65 leading-[1.6] max-w-2xl">
                {t("About.theInstituteDesc")}
              </p>
            </ScrollReveal>

            <ScrollReveal stagger delay={150} className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-black/[0.06] dark:bg-white/[0.06] border border-black/[0.06] dark:border-white/[0.06] mt-10">
              {([
                { end: 19, suffix: "", label: t("About.instituteStat1") },
                { end: 6, suffix: "", label: t("About.instituteStat2") },
                { end: 250, suffix: "M+", label: t("About.instituteStat3") },
                { end: 100, suffix: "%", label: t("About.instituteStat4") },
              ] as const).map((stat) => (
                <div key={stat.label} className="bg-white dark:bg-black p-5 sm:p-6 text-center">
                  <p className="font-mono text-2xl sm:text-3xl font-light text-black dark:text-white tabular-nums leading-none mb-2">
                    <StatCounter end={stat.end} suffix={stat.suffix} />
                  </p>
                  <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-black/45 dark:text-white/45">
                    {stat.label}
                  </p>
                </div>
              ))}
            </ScrollReveal>
          </div>
        </PageSection>

        {/* 05 — The origin + pillars (merged: philosophy + what you get) */}
        <PageSection sectionIndex="05 / 06" className="py-16 sm:py-24">
          <div className="max-w-2xl mx-auto text-center">
            <ScrollReveal>
              <p className="nx-eyebrow mb-8 justify-center">{t("About.origin")}</p>
            </ScrollReveal>
            <ScrollReveal delay={120}>
              <p className="text-base sm:text-lg text-black/70 dark:text-white/70 leading-[1.6] italic">
                {NOMOS_PHILOSOPHY_STATEMENT}
              </p>
            </ScrollReveal>
          </div>

          {/* Pillars merged into origin — what you get */}
          <div className="max-w-5xl mx-auto mt-16">
            <ScrollReveal>
              <p className="nx-eyebrow mb-8 text-center">{t("About.sixPillars")}</p>
            </ScrollReveal>
            <ScrollReveal stagger className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="nx-surface nx-pillar p-5">
                  <p className="font-mono text-[11px] text-black/45 dark:text-white/45 mb-3">0{i + 1}</p>
                  <p className="text-sm text-black/70 dark:text-white/70 leading-[1.5]">{t(`Brand.philosophyPillars.${i}`)}</p>
                </div>
              ))}
            </ScrollReveal>
          </div>
        </PageSection>

        {/* 06 — CTA */}
        <PageSection sectionIndex="06 / 06" className="text-center pb-16">
          <ScrollReveal>
            <h2 className="font-display text-2xl font-semibold mb-4">
              {t("About.ctaHeadline")}{" "}
              <span className="text-black/70 dark:text-white/70">{t("About.ctaHeadlineAccent")}</span>
            </h2>
            <p className="text-sm text-black/55 dark:text-white/55 mb-8 max-w-md mx-auto">{BRAND_TAGLINE}</p>
            <button type="button" onClick={() => router.push(PUBLIC_ROUTES.archives)} className="nx-public-btn-primary">
              {t("About.browseInquiries")}
              <ArrowRight size={14} />
            </button>
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
