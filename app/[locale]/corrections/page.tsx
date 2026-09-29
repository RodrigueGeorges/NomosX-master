"use client";

import { useState } from "react";
import AuthModal from "@/components/AuthModal";
import { PublicPageShell } from "@/components/layout/PublicPageShell";
import { PageHeader, PageSection } from "@/components/layout/PageHeader";
import { useTranslations } from "next-intl";
import { PUBLIC_ROUTES } from "@/lib/public-urls";
import { Link } from "@/i18n/navigation";
import { AlertTriangle, FileCheck, Mail, RotateCcw } from "lucide-react";

const PRINCIPLES = [
  { icon: FileCheck, titleKey: "Corrections.p1Title", textKey: "Corrections.p1Text" },
  { icon: RotateCcw, titleKey: "Corrections.p2Title", textKey: "Corrections.p2Text" },
  { icon: AlertTriangle, titleKey: "Corrections.p3Title", textKey: "Corrections.p3Text" },
] as const;

export default function CorrectionsPage() {
  const t = useTranslations();
  const [showAuthModal, setShowAuthModal] = useState(false);

  return (
    <>
      <PublicPageShell onSignInClick={() => setShowAuthModal(true)} particles={0}>
        <PageSection className="pt-16 sm:pt-20 pb-20 max-w-3xl">
          <PageHeader
            eyebrow={t("Corrections.eyebrow")}
            title={t("Corrections.title")}
            description={t("Corrections.subtitle")}
          />

          <div className="mt-12 space-y-8">
            {PRINCIPLES.map(({ icon: Icon, titleKey, textKey }) => (
              <section
                key={titleKey}
                className="border border-black/[0.08] dark:border-white/[0.08] p-6 sm:p-8"
              >
                <div className="flex items-center gap-3 mb-3">
                  <Icon size={16} className="text-black/50 dark:text-white/50" />
                  <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-black/60 dark:text-white/60">
                    {t(titleKey)}
                  </h2>
                </div>
                <p className="text-[15px] leading-relaxed text-black/75 dark:text-white/75">
                  {t(textKey)}
                </p>
              </section>
            ))}

            <section className="border border-black/[0.08] dark:border-white/[0.08] p-6 sm:p-8">
              <div className="flex items-center gap-3 mb-3">
                <Mail size={16} className="text-black/50 dark:text-white/50" />
                <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-black/60 dark:text-white/60">
                  {t("Corrections.reportTitle")}
                </h2>
              </div>
              <p className="text-[15px] leading-relaxed text-black/75 dark:text-white/75 mb-4">
                {t("Corrections.reportText")}
              </p>
              <a
                href="mailto:corrections@nomosx.com"
                className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.14em] text-black/70 dark:text-white/70 hover:text-black dark:hover:text-white border border-black/[0.15] dark:border-white/[0.15] px-3 py-2 transition-colors"
              >
                corrections@nomosx.com
              </a>
            </section>

            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-black/40 dark:text-white/40 pt-4">
              {t("Corrections.seeAlso")}{" "}
              <Link href={PUBLIC_ROUTES.methodology} className="underline underline-offset-4 hover:text-black dark:hover:text-white transition-colors">
                {t("Corrections.methodology")}
              </Link>
              {" · "}
              <Link href={PUBLIC_ROUTES.trackRecord} className="underline underline-offset-4 hover:text-black dark:hover:text-white transition-colors">
                {t("Corrections.trackRecord")}
              </Link>
            </p>
          </div>
        </PageSection>
      </PublicPageShell>
      {showAuthModal && (
        <AuthModal
          isOpen={showAuthModal}
          onClose={() => setShowAuthModal(false)}
          onSignupSuccess={() => setShowAuthModal(false)}
        />
      )}
    </>
  );
}
