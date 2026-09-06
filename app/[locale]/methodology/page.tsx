"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import AuthModal from "@/components/AuthModal";
import { PublicPageShell } from "@/components/layout/PublicPageShell";
import { EtherealCard, PageHeader, PageSection } from "@/components/layout/PageHeader";
import { PUBLIC_ROUTES } from "@/lib/public-urls";
import { PipelineStrip } from "@/components/signature";
import { BRAND_TAGLINE } from "@/lib/brand/public-copy";
import { ScrollReveal } from "@/components/ui/ScrollReveal";
import {
  BarChart3,
  GitCompare,
  Globe,
  Map,
  Scale,
  Search,
  Shield,
} from "lucide-react";

const METHOD_ICONS: Record<string, typeof Map> = {
  Map,
  Confront: GitCompare,
  Quantify: BarChart3,
  Decide: Scale,
};

const METHOD_KEYS = [
  { name: "Map", nameKey: "Brand.methodSteps.0", descKey: "Methodology.mapDesc" },
  { name: "Confront", nameKey: "Brand.methodSteps.1", descKey: "Methodology.confrontDesc" },
  { name: "Quantify", nameKey: "Brand.methodSteps.2", descKey: "Methodology.quantifyDesc" },
  { name: "Decide", nameKey: "Brand.methodSteps.3", descKey: "Methodology.decideDesc" },
];

const STANDARDS = [
  { icon: Shield, titleKey: "Methodology.standard1Title", textKey: "Methodology.standard1Text" },
  { icon: Search, titleKey: "Methodology.standard2Title", textKey: "Methodology.standard2Text" },
  { icon: Globe, titleKey: "Methodology.standard3Title", textKey: "Methodology.standard3Text" },
  { icon: Scale, titleKey: "Methodology.standard4Title", textKey: "Methodology.standard4Text" },
];

export default function MethodologyPage() {
  const router = useRouter();
  const t = useTranslations();
  const [showAuthModal, setShowAuthModal] = useState(false);

  return (
    <>
      <PublicPageShell onSignInClick={() => setShowAuthModal(true)} particles={0}>
        <PageSection className="pt-16 sm:pt-20 pb-4" sectionIndex="01 / 04">
          <PageHeader
            eyebrow={t("Methodology.method")}
            title={
              <>
                {t("Methodology.title")}{" "}
                <span className="text-black/70">{t("Methodology.titleAccent")}</span>
              </>
            }
            description={t("Methodology.intro")}
            align="center"
          />
        </PageSection>

        <PipelineStrip />

        <PageSection sectionIndex="02 / 04">
          <PageHeader eyebrow={t("Methodology.process")} title={t("Methodology.fromQuestionToPosition")} />
          <ScrollReveal stagger className="grid sm:grid-cols-2 gap-4">
            {METHOD_KEYS.map(({ name, nameKey, descKey }) => {
              const Icon = METHOD_ICONS[name];
              return (
                <EtherealCard key={name}>
                  <Icon className="w-5 h-5 text-black mb-3" strokeWidth={1.25} />
                  <h3 className="font-mono text-sm uppercase tracking-[0.12em] text-black mb-2">{t(nameKey)}</h3>
                  <p className="text-sm text-black/60 leading-relaxed">{t(descKey)}</p>
                </EtherealCard>
              );
            })}
          </ScrollReveal>
        </PageSection>

        <PageSection className="nx-public-section" sectionIndex="03 / 04">
          <PageHeader
            eyebrow={t("Methodology.standards")}
            title={t("Methodology.whatSeparatesUs")}
            description={t("Methodology.standardsDesc")}
          />
          <ScrollReveal stagger className="grid sm:grid-cols-2 gap-4">
            {STANDARDS.map(({ icon: Icon, titleKey, textKey }) => (
              <div key={titleKey} className="flex gap-4 nx-surface nx-pillar p-5">
                <Icon className="w-5 h-5 text-black shrink-0 mt-0.5" strokeWidth={1.25} />
                <div>
                  <h3 className="text-sm font-medium text-black mb-1">{t(titleKey)}</h3>
                  <p className="text-sm text-black/55 leading-relaxed">{t(textKey)}</p>
                </div>
              </div>
            ))}
          </ScrollReveal>
        </PageSection>

        <PageSection className="border-t border-black/[0.08] text-center pb-16" sectionIndex="04 / 04">
          <ScrollReveal>
            <p className="text-sm text-black/60 mb-6 max-w-lg mx-auto">{BRAND_TAGLINE}</p>
            <button type="button" onClick={() => router.push(PUBLIC_ROUTES.archives)} className="nx-public-btn-primary">
              {t("Methodology.exploreInquiries")}
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
