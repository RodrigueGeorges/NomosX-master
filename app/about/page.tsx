"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import AuthModal from "@/components/AuthModal";
import { PublicPageShell } from "@/components/layout/PublicPageShell";
import { EtherealCard, PageHeader, PageSection } from "@/components/layout/PageHeader";
import { PUBLIC_ROUTES } from "@/lib/public-urls";
import { PipelineStrip } from "@/components/signature";
import {
  BRAND_HERO_SUBTITLE_SHORT,
  BRAND_SOURCES_LABEL,
  BRAND_TAGLINE,
  ABOUT_CTA_HEADLINE,
  ABOUT_CTA_HEADLINE_ACCENT,
} from "@/lib/brand/public-copy";
import { ArrowRight, Brain, Globe, Lightbulb, Shield } from "lucide-react";

const VISION = [
  {
    icon: Globe,
    title: "Intelligence for everyone",
    description:
      "Verified foresight should not be reserved for institutions alone. Cross-domain inquiries deliver sourced intelligence to anyone who needs it.",
  },
  {
    icon: Brain,
    title: "Agentic by design",
    description: `Map, confront, quantify, decide — an autonomous pipeline runs continuously, publishing institute positions without human trigger.`,
  },
  {
    icon: Shield,
    title: "Trust through traceability",
    description:
      "Every claim links to its source. Every source to its DOI. Traceability is the only path to trust.",
  },
  {
    icon: Lightbulb,
    title: "Futures, not summaries",
    description: `${BRAND_SOURCES_LABEL} sources filtered for quality, modeled as probabilistic distributions, delivered as decisions you can defend.`,
  },
];

const VALUES = [
  { title: "Rigor before speed", description: "Multiple validation layers beat fast wrong answers." },
  { title: "Position before consensus", description: "We publish what we believe — with confidence bounds, not false balance." },
  { title: "Transparency before trust", description: "Sources, reasoning, and confidence levels are always visible." },
  { title: "Autonomy before control", description: "No sponsor, no editorial agenda — evidence only." },
];

export default function AboutPage() {
  const router = useRouter();
  const [showAuthModal, setShowAuthModal] = useState(false);

  return (
    <>
      <PublicPageShell currentPage="about" onSignInClick={() => setShowAuthModal(true)} particles={0}>
        <PageSection className="pt-20 sm:pt-28 pb-8">
          <PageHeader
            eyebrow="About"
            title={
              <>
                {BRAND_HERO_SUBTITLE_SHORT.replace(/\.$/, "")}{" "}
                <span className="text-white/70">for everyone.</span>
              </>
            }
            description="NomosX operates continuously — mapping cross-domain evidence, quantifying probable futures, and publishing institute positions."
            align="center"
          />
        </PageSection>

        <PipelineStrip />

        <PageSection>
          <div className="grid sm:grid-cols-2 gap-4">
            {VISION.map(({ icon: Icon, title, description }) => (
              <EtherealCard key={title}>
                <Icon className="w-5 h-5 text-white/45 mb-4" strokeWidth={1.25} />
                <h3 className="font-display text-lg font-medium text-white mb-2">{title}</h3>
                <p className="text-sm text-white/45 leading-relaxed">{description}</p>
              </EtherealCard>
            ))}
          </div>
        </PageSection>

        <PageSection className="nx-public-section">
          <PageHeader
            eyebrow="Values"
            title="What we optimize for"
            description="Four principles govern every publication."
          />
          <div className="grid sm:grid-cols-2 gap-4">
            {VALUES.map((v) => (
              <div key={v.title} className="nx-public-surface p-6">
                <h3 className="text-sm font-medium text-white mb-2">{v.title}</h3>
                <p className="text-xs text-white/40 leading-relaxed">{v.description}</p>
              </div>
            ))}
          </div>
        </PageSection>

        <PageSection className="border-t border-white/[0.05] text-center pb-24">
          <h2 className="font-display text-2xl font-semibold mb-4">
            {ABOUT_CTA_HEADLINE}{" "}
            <span className="text-white/70">{ABOUT_CTA_HEADLINE_ACCENT}</span>
          </h2>
          <p className="text-sm text-white/40 mb-8 max-w-md mx-auto">{BRAND_TAGLINE}</p>
          <button type="button" onClick={() => router.push(PUBLIC_ROUTES.archives)} className="nx-public-btn-primary">
            Browse inquiries
            <ArrowRight size={14} />
          </button>
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
