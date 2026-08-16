"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import AuthModal from "@/components/AuthModal";
import { PublicPageShell } from "@/components/layout/PublicPageShell";
import { EtherealCard, PageHeader, PageSection } from "@/components/layout/PageHeader";
import { ScrollReveal } from "@/components/ui/ScrollReveal";
import { PUBLIC_ROUTES } from "@/lib/public-urls";
import { PipelineStrip } from "@/components/signature";
import {
  BRAND_TAGLINE,
  BRAND_POSITIONING,
} from "@/lib/brand/public-copy";
import { ArrowRight, Globe, Lightbulb, Shield, Network } from "lucide-react";

const VISION = [
  {
    icon: Globe,
    titleKey: "About.vision1Title",
    descKey: "About.vision1Desc",
  },
  {
    icon: Network,
    titleKey: "About.vision2Title",
    descKey: "About.vision2Desc",
  },
  {
    icon: Shield,
    titleKey: "About.vision3Title",
    descKey: "About.vision3Desc",
  },
  {
    icon: Lightbulb,
    titleKey: "About.vision4Title",
    descKey: "About.vision4Desc",
  },
];

const VALUES = [
  { titleKey: "About.value1Title", descKey: "About.value1Desc" },
  { titleKey: "About.value2Title", descKey: "About.value2Desc" },
  { titleKey: "About.value3Title", descKey: "About.value3Desc" },
  { titleKey: "About.value4Title", descKey: "About.value4Desc" },
];

export default function AboutPage() {
  const router = useRouter();
  const t = useTranslations();
  const [showAuthModal, setShowAuthModal] = useState(false);

  return (
    <>
      <PublicPageShell currentPage="about" onSignInClick={() => setShowAuthModal(true)} particles={0}>
        <PageSection className="pt-16 sm:pt-20 pb-6">
          <PageHeader
            eyebrow={BRAND_POSITIONING}
            title={
              <>
                {t("About.title")}{" "}
                <span className="text-white/70">{t("About.titleAccent")}</span>
              </>
            }
            description={t("About.description")}
            align="center"
          />
        </PageSection>

        {/* Nomos philosophy statement */}
        <PageSection sectionIndex="01 / 06" className="pb-8">
          <div className="max-w-2xl mx-auto text-center">
            <ScrollReveal>
              <p className="nx-eyebrow mb-6 justify-center">{t("About.thePrinciple")}</p>
            </ScrollReveal>
            <ScrollReveal delay={100}>
              <p className="text-base sm:text-lg text-white/70 leading-[1.6] italic">
                {t("Brand.philosophyStatement")}
              </p>
            </ScrollReveal>
          </div>
        </PageSection>

        {/* Manifesto — using brand typography classes (harmonized with home) */}
        <section className="nx-section-divide relative px-6 sm:px-8 py-16 sm:py-20 overflow-hidden">
          <span className="nx-section-index">02 / 06</span>
          <div className="nx-grid-bg-enhanced opacity-30" aria-hidden="true" />
          <div className="relative max-w-4xl mx-auto text-center">
            <ScrollReveal stagger className="space-y-2">
              <p className="nx-manifesto-line">{t("Home.manifestoLine1")}</p>
              <p className="nx-manifesto-line">{t("Home.manifestoLine2")}</p>
              <div className="nx-divider w-16 mx-auto my-8" />
              <p className="nx-manifesto-line nx-manifesto-line--accent">{t("Home.manifestoLine3")}</p>
            </ScrollReveal>
            <ScrollReveal stagger delay={200} className="mt-12 space-y-1">
              <p className="nx-manifesto-cascade">{t("Home.manifestoCascade1")}</p>
              <p className="nx-manifesto-cascade">{t("Home.manifestoCascade2")}</p>
              <p className="nx-manifesto-cascade">{t("Home.manifestoCascade3")}</p>
            </ScrollReveal>
            <ScrollReveal delay={400}>
              <p className="nx-manifesto-signoff">
                {t("Home.manifestoSignoff")}<span className="nx-manifesto-signoff-x">X</span>
              </p>
            </ScrollReveal>
          </div>
        </section>

        {/* Six pillars */}
        <PageSection sectionIndex="03 / 06" className="py-10">
          <div className="max-w-5xl mx-auto">
            <ScrollReveal>
              <p className="nx-eyebrow mb-10 text-center">{t("About.sixPillars")}</p>
            </ScrollReveal>
            <ScrollReveal stagger className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="nx-surface nx-pillar p-5">
                  <p className="font-mono text-[11px] text-white/45 mb-3">0{i + 1}</p>
                  <p className="text-sm text-white/70 leading-[1.5]">{t(`Brand.philosophyPillars.${i}`)}</p>
                </div>
              ))}
            </ScrollReveal>
          </div>
        </PageSection>

        <PipelineStrip />

        <PageSection sectionIndex="04 / 06">
          <PageHeader
            eyebrow={t("About.whatWeDo")}
            title={t("About.theVision")}
            description={t("About.visionDesc")}
          />
          <ScrollReveal stagger className="grid sm:grid-cols-2 gap-4">
            {VISION.map(({ icon: Icon, titleKey, descKey }) => (
              <EtherealCard key={titleKey}>
                <Icon className="w-5 h-5 text-white mb-4" strokeWidth={1.25} />
                <h3 className="font-display text-lg font-medium text-white mb-2">{t(titleKey)}</h3>
                <p className="text-sm text-white/60 leading-relaxed">{t(descKey)}</p>
              </EtherealCard>
            ))}
          </ScrollReveal>
        </PageSection>

        <PageSection sectionIndex="05 / 06">
          <PageHeader
            eyebrow={t("About.values")}
            title={t("About.whatWeOptimizeFor")}
            description={t("About.valuesDesc")}
          />
          <ScrollReveal stagger className="grid sm:grid-cols-2 gap-4">
            {VALUES.map((v) => (
              <div key={v.titleKey} className="nx-surface p-6">
                <h3 className="text-sm font-medium text-white mb-2">{t(v.titleKey)}</h3>
                <p className="text-sm text-white/55 leading-relaxed">{t(v.descKey)}</p>
              </div>
            ))}
          </ScrollReveal>
        </PageSection>

        <PageSection sectionIndex="06 / 06" className="text-center pb-16">
          <ScrollReveal>
            <h2 className="font-display text-2xl font-semibold mb-4">
              {t("About.ctaHeadline")}{" "}
              <span className="text-white/70">{t("About.ctaHeadlineAccent")}</span>
            </h2>
            <p className="text-sm text-white/55 mb-8 max-w-md mx-auto">{BRAND_TAGLINE}</p>
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
