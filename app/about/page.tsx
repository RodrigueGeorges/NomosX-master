"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import AuthModal from "@/components/AuthModal";
import { PublicPageShell } from "@/components/layout/PublicPageShell";
import { EtherealCard, PageHeader, PageSection } from "@/components/layout/PageHeader";
import { PUBLIC_ROUTES } from "@/lib/public-urls";
import { PipelineStrip } from "@/components/signature";
import {
  BRAND_SOURCES_LABEL,
  BRAND_TAGLINE,
  BRAND_MANIFESTO,
  NOMOS_PHILOSOPHY_PILLARS,
  NOMOS_PHILOSOPHY_STATEMENT,
  ABOUT_CTA_HEADLINE,
  ABOUT_CTA_HEADLINE_ACCENT,
} from "@/lib/brand/public-copy";
import { ArrowRight, Globe, Lightbulb, Shield, Network } from "lucide-react";

const VISION = [
  {
    icon: Globe,
    title: "From chaos to order",
    description:
      "The world produces a flood of fragmented signals. NomosX structures the chaos into a defensible causal chain that a decision-maker can act on.",
  },
  {
    icon: Network,
    title: "Connect, don't isolate",
    description: `The most consequential insights live at the intersection of domains. NomosX forces the collision across ${BRAND_SOURCES_LABEL} sources and extracts the friction.`,
  },
  {
    icon: Shield,
    title: "Trust through traceability",
    description:
      "Every claim links to its source. Every source to its DOI. Nothing is taken on faith. The map is the product; the sources are the terrain.",
  },
  {
    icon: Lightbulb,
    title: "Meaning before answers",
    description:
      "Before producing a conclusion, NomosX establishes what the question actually means. A precise question poorly answered beats a vague one answered confidently.",
  },
];

const VALUES = [
  { title: "Transform chaos into order", description: "Structure the noise into a causal chain anyone can follow." },
  { title: "Map knowledge, don't accumulate it", description: "Cartograph the intellectual territory — show where evidence is dense, absent, or contradictory." },
  { title: "Position before consensus", description: "We publish what we believe — with confidence bounds, not false balance." },
  { title: "Structure produces enlightened decisions", description: "A position worth defending emerges from structured thinking, not opinion or intuition." },
];

export default function AboutPage() {
  const router = useRouter();
  const [showAuthModal, setShowAuthModal] = useState(false);

  return (
    <>
      <PublicPageShell currentPage="about" onSignInClick={() => setShowAuthModal(true)} particles={0}>
        <PageSection className="pt-16 sm:pt-20 pb-6">
          <PageHeader
            eyebrow="About"
            title={
              <>
                From Chaos{" "}
                <span className="text-white/70">to Clarity.</span>
              </>
            }
            description="NomosX is an autonomous think tank that maps evidence, challenges assumptions, and publishes positions anyone can verify — as a public good."
            align="center"
          />
        </PageSection>

        {/* Nomos philosophy statement */}
        <PageSection className="pb-8">
          <div className="max-w-2xl mx-auto text-center">
            <p className="nx-eyebrow mb-6">The principle</p>
            <p className="text-base sm:text-lg text-white/70 leading-[1.6] italic">
              {NOMOS_PHILOSOPHY_STATEMENT}
            </p>
          </div>
        </PageSection>

        {/* Manifesto */}
        <section className="px-6 sm:px-8 py-12 sm:py-16 nx-section-divide">
          <div className="max-w-2xl mx-auto text-center">
            <div className="space-y-5">
              <p className="text-lg sm:text-xl text-white/80 leading-[1.4] font-light">
                The world doesn't suffer from a lack of information.
              </p>
              <p className="text-lg sm:text-xl text-white/80 leading-[1.4] font-light">
                It suffers from a lack of structure.
              </p>
              <div className="h-px w-12 bg-white/15 mx-auto my-6" />
              <p className="text-sm sm:text-base text-white/65 leading-[1.6]">
                Knowledge without order creates noise.
              </p>
              <p className="text-sm sm:text-base text-white/65 leading-[1.6]">
                Order creates understanding.
              </p>
              <p className="text-sm sm:text-base text-white/65 leading-[1.6]">
                Understanding creates better decisions.
              </p>
              <p className="text-sm font-mono uppercase tracking-[0.2em] text-white/50 pt-4">
                That is NomosX.
              </p>
            </div>
          </div>
        </section>

        {/* Six pillars */}
        <PageSection className="py-10">
          <div className="max-w-5xl mx-auto">
            <p className="nx-eyebrow mb-10 text-center">Six editorial pillars</p>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {NOMOS_PHILOSOPHY_PILLARS.map((pillar, i) => (
                <div key={pillar} className="nx-public-surface p-5 hover:border-white/[0.14] transition-colors">
                  <p className="font-mono text-[11px] text-white/45 mb-3">0{i + 1}</p>
                  <p className="text-sm text-white/75 leading-[1.5]">{pillar}</p>
                </div>
              ))}
            </div>
          </div>
        </PageSection>

        <PipelineStrip />

        <PageSection>
          <PageHeader
            eyebrow="What we do"
            title="The vision"
            description="Four principles that define every publication NomosX produces."
          />
          <div className="grid sm:grid-cols-2 gap-4">
            {VISION.map(({ icon: Icon, title, description }) => (
              <EtherealCard key={title}>
                <Icon className="w-5 h-5 text-white mb-4" strokeWidth={1.25} />
                <h3 className="font-display text-lg font-medium text-white mb-2">{title}</h3>
                <p className="text-sm text-white/60 leading-relaxed">{description}</p>
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
                <p className="text-sm text-white/55 leading-relaxed">{v.description}</p>
              </div>
            ))}
          </div>
        </PageSection>

        <PageSection className="border-t border-white/[0.08] text-center pb-16">
          <h2 className="font-display text-2xl font-semibold mb-4">
            {ABOUT_CTA_HEADLINE}{" "}
            <span className="text-white/70">{ABOUT_CTA_HEADLINE_ACCENT}</span>
          </h2>
          <p className="text-sm text-white/55 mb-8 max-w-md mx-auto">{BRAND_TAGLINE}</p>
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
