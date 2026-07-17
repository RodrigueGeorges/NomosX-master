"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import AuthModal from "@/components/AuthModal";
import { PublicPageShell } from "@/components/layout/PublicPageShell";
import { EtherealCard, PageHeader, PageSection } from "@/components/layout/PageHeader";
import { PUBLIC_ROUTES } from "@/lib/public-urls";
import { PipelineStrip } from "@/components/signature";
import { BRAND_NAME, BRAND_TAGLINE, METHOD_BLOCKS, METHODOLOGY_INTRO } from "@/lib/brand/public-copy";
import {
  BarChart3,
  GitCompare,
  Globe,
  Map,
  Scale,
  Search,
  Shield,
} from "lucide-react";

const METHOD_ICONS: Record<(typeof METHOD_BLOCKS)[number]["name"], typeof Map> = {
  Map,
  Confront: GitCompare,
  Quantify: BarChart3,
  Decide: Scale,
};

const STANDARDS = [
  { icon: Shield, title: "Citation guard", text: "Every [SRC-N] validated against available sources." },
  { icon: Search, title: "Evidence ledger", text: "Full pipeline lineage stored per inquiry." },
  { icon: Globe, title: "Provider diversity", text: "Minimum provider spread enforced at rank stage." },
  { icon: Scale, title: "Arbitration gate", text: "Adversarial challenge runs before every publication." },
];

export default function MethodologyPage() {
  const router = useRouter();
  const [showAuthModal, setShowAuthModal] = useState(false);

  return (
    <>
      <PublicPageShell onSignInClick={() => setShowAuthModal(true)} particles={0}>
        <PageSection className="pt-20 sm:pt-28 pb-4">
          <PageHeader
            eyebrow="Method"
            title={
              <>
                How {BRAND_NAME} produces{" "}
                <span className="text-white/70">a position worth defending.</span>
              </>
            }
            description={METHODOLOGY_INTRO}
            align="center"
          />
        </PageSection>

        <PipelineStrip />

        <PageSection>
          <PageHeader eyebrow="Process" title="From question to position" />
          <div className="grid sm:grid-cols-2 gap-4">
            {METHOD_BLOCKS.map(({ name, desc }) => {
              const Icon = METHOD_ICONS[name];
              return (
                <EtherealCard key={name}>
                  <Icon className="w-5 h-5 text-white/45 mb-3" strokeWidth={1.25} />
                  <h3 className="font-mono text-sm uppercase tracking-[0.12em] text-white mb-2">{name}</h3>
                  <p className="text-sm text-white/45 leading-relaxed">{desc}</p>
                </EtherealCard>
              );
            })}
          </div>
        </PageSection>

        <PageSection className="nx-public-section">
          <PageHeader
            eyebrow="Standards"
            title="What separates us from a summary"
          />
          <div className="grid sm:grid-cols-2 gap-4">
            {STANDARDS.map(({ icon: Icon, title, text }) => (
              <div key={title} className="flex gap-4 nx-public-surface p-5">
                <Icon className="w-5 h-5 text-white/40 shrink-0 mt-0.5" strokeWidth={1.25} />
                <div>
                  <h3 className="text-sm font-medium text-white mb-1">{title}</h3>
                  <p className="text-xs text-white/40 leading-relaxed">{text}</p>
                </div>
              </div>
            ))}
          </div>
        </PageSection>

        <PageSection className="border-t border-white/[0.05] text-center pb-24">
          <p className="text-sm text-white/45 mb-6 max-w-lg mx-auto">{BRAND_TAGLINE}</p>
          <button type="button" onClick={() => router.push(PUBLIC_ROUTES.archives)} className="nx-public-btn-primary">
            Explore inquiries
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
