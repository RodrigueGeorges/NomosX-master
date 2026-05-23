"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import AuthModal from "@/components/AuthModal";
import { PublicPageShell } from "@/components/layout/PublicPageShell";
import { EtherealCard, PageHeader, PageSection } from "@/components/layout/PageHeader";
import { PUBLIC_ROUTES } from "@/lib/public-urls";
import { PipelineStrip } from "@/components/signature";
import {
  BarChart3,
  Brain,
  Crosshair,
  FileText,
  Globe,
  MessageSquare,
  Network,
  Search,
  Send,
  Shield,
} from "lucide-react";

const AGENTS = [
  { icon: Crosshair, name: "Scout", desc: "250M+ sources across 60+ providers in parallel." },
  { icon: BarChart3, name: "Rank", desc: "Semantic relevance, quality scores, diversity controls." },
  { icon: FileText, name: "Read", desc: "Claims, methods, quantitative data from abstracts & PDFs." },
  { icon: Network, name: "Simulate", desc: "25 stakeholder personas, empirical scenario probabilities." },
  { icon: MessageSquare, name: "Challenge", desc: "Adversarial review, steel-man debate, citation guard." },
  { icon: Send, name: "Publish", desc: "Probabilistic verdict, full [SRC-N] traceability." },
];

const STANDARDS = [
  { icon: Shield, title: "Citation guard", text: "Every [SRC-N] validated against available sources." },
  { icon: Brain, title: "Multi-pass analysis", text: "Three synthesis passes before publication." },
  { icon: Globe, title: "Provider diversity", text: "Minimum provider spread enforced at rank stage." },
  { icon: Search, title: "Evidence ledger", text: "Full pipeline lineage stored per inquiry." },
];

export default function MethodologyPage() {
  const router = useRouter();
  const [showAuthModal, setShowAuthModal] = useState(false);

  return (
    <>
      <PublicPageShell onSignInClick={() => setShowAuthModal(true)} particles={14}>
        <PageSection className="pt-20 sm:pt-28 pb-4">
          <PageHeader
            eyebrow="Protocol"
            title={
              <>
                How NomosX produces{" "}
                <span className="text-accent">probable futures.</span>
              </>
            }
            description="Six agents. One pipeline. Every inquiry evidence-bound before publication."
            align="center"
          />
        </PageSection>

        <PipelineStrip />

        <PageSection>
          <PageHeader eyebrow="Agents" title="The verification pipeline" />
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {AGENTS.map(({ icon: Icon, name, desc }) => (
              <EtherealCard key={name}>
                <Icon className="w-5 h-5 text-accent/70 mb-3" strokeWidth={1.25} />
                <h3 className="font-mono text-sm uppercase tracking-[0.12em] text-text mb-2">{name}</h3>
                <p className="text-sm text-white/45 leading-relaxed">{desc}</p>
              </EtherealCard>
            ))}
          </div>
        </PageSection>

        <PageSection className="border-t border-white/[0.05]">
          <PageHeader
            eyebrow="Standards"
            title="Institutional rigor"
            description="What separates an inquiry from a summary."
          />
          <div className="grid sm:grid-cols-2 gap-4">
            {STANDARDS.map(({ icon: Icon, title, text }) => (
              <div
                key={title}
                className="flex gap-4 rounded-xl border border-white/[0.06] bg-bg-elevated/80 p-5"
              >
                <Icon className="w-5 h-5 text-accent/60 shrink-0 mt-0.5" strokeWidth={1.25} />
                <div>
                  <h3 className="text-sm font-medium text-text mb-1">{title}</h3>
                  <p className="text-xs text-white/40 leading-relaxed">{text}</p>
                </div>
              </div>
            ))}
          </div>
        </PageSection>

        <PageSection className="border-t border-white/[0.05] text-center pb-24">
          <p className="text-sm text-white/45 mb-6 max-w-lg mx-auto">
            22 domain researchers validate cross-domain claims. Devil&apos;s advocate runs before every publish gate.
          </p>
          <button
            type="button"
            onClick={() => router.push(PUBLIC_ROUTES.archives)}
            className="px-7 py-3.5 rounded-xl bg-accent text-bg text-sm font-semibold hover:brightness-110"
          >
            Read published inquiries
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
