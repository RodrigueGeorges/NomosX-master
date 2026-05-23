"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import AuthModal from "@/components/AuthModal";
import { PublicPageShell } from "@/components/layout/PublicPageShell";
import { EtherealCard, PageHeader, PageSection } from "@/components/layout/PageHeader";
import { RESEARCHERS } from "@/lib/researchers";
import { PUBLIC_ROUTES } from "@/lib/public-urls";
import { PipelineStrip } from "@/components/signature";
import { ArrowRight, Brain, Globe, Lightbulb, Shield } from "lucide-react";

const VISION = [
  {
    icon: Globe,
    title: "Intelligence for everyone",
    description:
      "Verified research should not be reserved for institutions alone. 22 domain researchers deliver sourced intelligence to anyone who needs it.",
  },
  {
    icon: Brain,
    title: "Multi-agent architecture",
    description:
      "Scout, rank, read, simulate, challenge, publish — every inquiry passes six verification stages before publication.",
  },
  {
    icon: Shield,
    title: "Trust through traceability",
    description:
      "Every claim links to its source. Every source to its DOI. Traceability is the only path to trust.",
  },
  {
    icon: Lightbulb,
    title: "Signal over noise",
    description:
      "250M+ sources filtered for quality, cross-validated through adversarial review, delivered as probabilistic verdicts.",
  },
];

const VALUES = [
  { title: "Rigor before speed", description: "Multiple validation layers beat fast wrong answers." },
  { title: "Quality before quantity", description: "Only inquiries that meet institutional standards publish." },
  { title: "Transparency before trust", description: "Sources, reasoning, and confidence levels are always visible." },
  { title: "Autonomy before control", description: "No sponsor, no editorial agenda — evidence only." },
];

export default function AboutPage() {
  const router = useRouter();
  const [showAuthModal, setShowAuthModal] = useState(false);

  return (
    <>
      <PublicPageShell currentPage="about" onSignInClick={() => setShowAuthModal(true)}>
        <PageSection className="pt-20 sm:pt-28 pb-8">
          <PageHeader
            eyebrow="About"
            title={
              <>
                The first autonomous{" "}
                <span className="text-accent">think tank.</span>
              </>
            }
            description="NomosX operates continuously — scanning sources, debating evidence, and publishing inquiries with probabilistic verdicts."
            align="center"
          />
        </PageSection>

        <PipelineStrip />

        <PageSection>
          <div className="grid sm:grid-cols-2 gap-4">
            {VISION.map(({ icon: Icon, title, description }) => (
              <EtherealCard key={title}>
                <Icon className="w-5 h-5 text-accent/70 mb-4" strokeWidth={1.25} />
                <h3 className="font-display text-lg font-medium text-text mb-2">{title}</h3>
                <p className="text-sm text-white/45 leading-relaxed">{description}</p>
              </EtherealCard>
            ))}
          </div>
        </PageSection>

        <PageSection className="border-t border-white/[0.05]">
          <PageHeader
            eyebrow="Values"
            title="What we optimize for"
            description="Four principles govern every publication."
          />
          <div className="grid sm:grid-cols-2 gap-4">
            {VALUES.map((v) => (
              <div
                key={v.title}
                className="rounded-xl border border-white/[0.06] bg-bg-elevated/60 p-6"
              >
                <h3 className="text-sm font-medium text-text mb-2">{v.title}</h3>
                <p className="text-xs text-white/40 leading-relaxed">{v.description}</p>
              </div>
            ))}
          </div>
        </PageSection>

        <PageSection className="border-t border-white/[0.05]">
          <PageHeader
            eyebrow="The Council"
            title={`${RESEARCHERS.length} domain researchers`}
            description="Each researcher specializes in one domain with adversarial peer review at every stage."
            action={
              <button
                type="button"
                onClick={() => router.push(PUBLIC_ROUTES.researchers)}
                className="inline-flex items-center gap-2 text-sm font-mono text-accent hover:brightness-110"
              >
                View all
                <ArrowRight size={14} />
              </button>
            }
          />
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {RESEARCHERS.slice(0, 6).map((r) => (
              <div
                key={r.id}
                className="rounded-xl border border-white/[0.06] bg-bg-elevated/80 p-5 hover:border-accent/15 transition-colors"
              >
                <p className="font-mono text-[10px] text-accent/60 uppercase tracking-[0.16em] mb-2">
                  {r.domain}
                </p>
                <p className="text-sm font-medium text-text">{r.name}</p>
                <p className="text-xs text-white/35 mt-1">{r.institution}</p>
              </div>
            ))}
          </div>
        </PageSection>

        <PageSection className="border-t border-white/[0.05] text-center pb-24">
          <h2 className="font-display text-2xl font-semibold mb-4">
            Evidence-bound intelligence.{" "}
            <span className="text-accent">Open by default.</span>
          </h2>
          <button
            type="button"
            onClick={() => router.push(PUBLIC_ROUTES.archives)}
            className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl bg-accent text-bg text-sm font-semibold hover:brightness-110"
          >
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
            router.push("/dashboard");
          }}
        />
      )}
    </>
  );
}
