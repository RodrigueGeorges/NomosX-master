"use client";



import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import AuthModal from "@/components/AuthModal";
import { PublicPageShell } from "@/components/layout/PublicPageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { ScrollReveal } from "@/components/ui/ScrollReveal";
import { PUBLIC_ROUTES } from "@/lib/public-urls";
import { cn } from "@/lib/utils";
import { nx } from "@/lib/brand/public-ui";
import { PUBLICATION_FORMATS } from "@/lib/publication-formats";
import { getStudioXPrice } from "@/lib/studiox-pricing";
import {
  ArrowRight,
  BookOpen,
  Brain,
  Check,
  ChevronDown,
  FileText,
  Sparkles,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { FaqJsonLd } from "@/components/seo/JsonLd";



const READER_FEATURES = [
  "Pricing.readerFeature0",
  "Pricing.readerFeature1",
  "Pricing.readerFeature2",
  "Pricing.readerFeature3",
  "Pricing.readerFeature4",
];

const STUDIO_FEATURES = [
  "Pricing.studioFeature0",
  "Pricing.studioFeature1",
  "Pricing.studioFeature2",
  "Pricing.studioFeature3",
  "Pricing.studioFeature4",
  "Pricing.studioFeature5",
];

const STUDIO_STEPS = [
  { labelKey: "Pricing.step1Label", detailKey: "Pricing.step1Detail" },
  { labelKey: "Pricing.step2Label", detailKey: "Pricing.step2Detail" },
  { labelKey: "Pricing.step3Label", detailKey: "Pricing.step3Detail" },
];

const FAQ = [
  { qKey: "Pricing.faq0Q", aKey: "Pricing.faq0A" },
  { qKey: "Pricing.faq1Q", aKey: "Pricing.faq1A" },
  { qKey: "Pricing.faq2Q", aKey: "Pricing.faq2A" },
];



export default function PricingPage() {
  const router = useRouter();
  const t = useTranslations();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authRedirect, setAuthRedirect] = useState<"studio" | "free">("free");
  const [openFaq, setOpenFaq] = useState<number | null>(null);



  function openStudioAuth() {

    setAuthRedirect("studio");

    setShowAuthModal(true);

  }



  function openFreeAuth() {

    setAuthRedirect("free");

    setShowAuthModal(true);

  }



  function handleAuthSuccess() {

    setShowAuthModal(false);

    router.push(authRedirect === "studio" ? PUBLIC_ROUTES.studio : "/archives");

  }



  return (

    <>

      <FaqJsonLd items={FAQ.map((f) => ({ q: t(f.qKey), a: t(f.aKey) }))} />

      <PublicPageShell currentPage="pricing" onSignInClick={() => setShowAuthModal(true)} particles={0}>

          <div className="max-w-5xl mx-auto px-6 sm:px-8 py-16 sm:py-20">

            <PageHeader
              eyebrow={t("Pricing.access")}
              title={
                <>
                  {t("Pricing.title")}{" "}
                  <span className="text-black dark:text-white">{t("Pricing.titleAccent")}</span>
                </>
              }
              description={t("Pricing.description")}
              align="center"
            />



            <ScrollReveal stagger className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-16">

              <div

                className="relative p-6 sm:p-7 nx-surface"

              >

                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-20 h-px bg-black/60 dark:bg-white/60" />

                <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-black/55 dark:text-white/55 mb-4">
                  {t("Pricing.reader")}
                </p>

                <div className="flex items-baseline gap-2 mb-2">
                  <span className="font-mono text-4xl font-light text-text">{t("Pricing.free")}</span>
                  <span className="text-sm text-black/50 dark:text-white/50">{t("Pricing.forever")}</span>
                </div>

                <p className="text-sm text-black/60 dark:text-white/60 mb-8">
                  {t("Pricing.readerDesc")}
                </p>

                <ul className="space-y-3 mb-9">
                  {READER_FEATURES.map((key) => (
                    <li key={key} className="flex items-start gap-3 text-sm text-black/70 dark:text-white/70">
                      <Check className="w-4 h-4 text-black dark:text-white flex-shrink-0 mt-0.5" strokeWidth={1.5} />
                      {t(key)}
                    </li>
                  ))}
                </ul>

                <button
                  type="button"
                  onClick={openFreeAuth}
                  className="w-full py-3.5 border border-black/30 dark:border-white/30 text-black dark:text-white text-sm font-medium hover:border-black/60 dark:hover:border-white/60 hover:text-black dark:hover:text-white transition-colors"
                >
                  {t("Pricing.startReading")}
                </button>

              </div>



              <div

                className="relative p-6 sm:p-7 nx-surface border-black/20 dark:border-white/20"

              >

                <div className="absolute -top-3 left-8">

                  <span className="px-3 py-1 bg-white dark:bg-black text-black dark:text-white text-[11px] font-mono font-semibold tracking-[0.14em] uppercase">
                    {t("Pricing.payPerStudy")}
                  </span>

                </div>

                <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-black/50 dark:text-white/50 mb-4 mt-2">
                  {t("StudioPage.eyebrow")}

                </p>

                <div className="flex items-baseline gap-2 mb-2">

                  <span className="font-display text-3xl font-semibold text-text">
                    {t("Pricing.fromPrice")}

                  </span>

                  <span className="text-sm text-black/50 dark:text-white/50">{t("Pricing.perStudy")}</span>

                </div>

                <p className="text-sm text-black/60 dark:text-white/60 mb-8">

                  {t("Pricing.studioDesc")}

                </p>

                <ul className="space-y-3 mb-9">

                  {STUDIO_FEATURES.map((key) => (

                    <li key={key} className="flex items-start gap-3 text-sm text-black/75 dark:text-white/75">

                      <Check className="w-4 h-4 text-black dark:text-white flex-shrink-0 mt-0.5" strokeWidth={1.5} />

                      {t(key)}

                    </li>

                  ))}

                </ul>

                <button

                  type="button"

                  onClick={openStudioAuth}

                  className={cn(nx.btnPrimary, "w-full group")}

                >

                  {t("Pricing.commissionStudy")}

                  <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform" />

                </button>

              </div>

            </ScrollReveal>



            {/* ── 4 formats pricing grid ── */}
            <section className="mb-16">
              <div className="text-center mb-8">
                <p className={cn(nx.eyebrow, "mb-3")}>{t("Pricing.formatsAngles")}</p>
                <h2 className="font-display text-xl sm:text-2xl font-semibold text-text mb-2">
                  {t("Pricing.payPerStudyNoSub")}
                </h2>
                <p className="text-sm text-black/55 dark:text-white/55 max-w-lg mx-auto">
                  {t("Pricing.formatsDesc")}
                </p>
              </div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {PUBLICATION_FORMATS.map((format) => {
                  const price = getStudioXPrice(format.type);
                  const labelKey = format.type === "SUMMARY_BRIEF" ? "Formats.signalBrief" : format.type === "DECISION_MEMO" ? "Formats.decisionMemo" : format.type === "ARTICLE" ? "Formats.article" : "Formats.strategicReport";
                  const pagesKey = format.type === "SUMMARY_BRIEF" ? "Formats.signalBriefPages" : format.type === "DECISION_MEMO" ? "Formats.decisionMemoPages" : format.type === "ARTICLE" ? "Formats.articlePages" : "Formats.strategicReportPages";
                  const descKey = format.type === "SUMMARY_BRIEF" ? "Formats.signalBriefDesc" : format.type === "DECISION_MEMO" ? "Formats.decisionMemoDesc" : format.type === "ARTICLE" ? "Formats.articleDesc" : "Formats.strategicReportDesc";
                  return (
                    <div key={format.type} className="nx-surface p-5 flex flex-col">
                      <div className="text-sm text-black dark:text-white font-semibold mb-1">{t(labelKey)}</div>
                      <div className="text-[10px] font-mono uppercase tracking-[0.12em] text-black/40 dark:text-white/40 mb-3">{t(pagesKey)}</div>
                      <p className="text-xs text-black/55 dark:text-white/55 leading-relaxed mb-4 flex-1">{t(descKey)}</p>
                      <div className="border-t border-black/[0.08] dark:border-white/[0.08] pt-3">
                        <div className="text-2xl font-display font-semibold text-text">{price.display}</div>
                        <div className="text-[10px] text-black/35 dark:text-white/35 uppercase tracking-wide mt-0.5">{t("Pricing.perStudyShort")}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="text-center mt-6">
                <button
                  type="button"
                  onClick={openStudioAuth}
                  className={cn(nx.btnPrimary)}
                >
                  {t("Pricing.commissionStudy")}
                  <ArrowRight size={14} className="ml-2" />
                </button>
                <p className="mt-3 text-[11px] text-black/35 dark:text-white/35">
                  {t("Pricing.moneyBackNote")}
                </p>
              </div>
            </section>

            <section className="mb-16 nx-surface overflow-hidden">

              <div className="p-6 sm:p-8 border-b border-black/[0.08] dark:border-white/[0.08]">

                <div className="flex flex-wrap items-center gap-3 mb-4">

                  <Sparkles className="w-4 h-4 text-black/50 dark:text-white/50" />

                  <h2 className="font-display text-xl font-semibold text-text">
                    {t("StudioPage.eyebrow")}
                  </h2>

                  <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-black/55 dark:text-white/55 px-2 py-0.5 border border-black/20 dark:border-white/20">
                    {t("Pricing.interfacePreview")}
                  </span>

                </div>

                <p className="text-sm text-black/60 dark:text-white/60 max-w-xl">
                  {t("Pricing.engineDesc")}
                </p>

              </div>

              <div className="grid sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-white/[0.08] dark:divide-black/[0.08]">

                {STUDIO_STEPS.map((step, i) => (

                  <div key={step.labelKey} className="p-5 sm:p-6">

                    <span className="font-mono text-[11px] text-black/55 dark:text-white/55">

                      {String(i + 1).padStart(2, "0")}

                    </span>

                    <p className="text-sm font-medium text-text mt-2 mb-1">{t(step.labelKey)}</p>

                    <p className="font-mono text-[11px] text-black/50 dark:text-white/50">{t(step.detailKey)}</p>

                  </div>

                ))}

              </div>

              <div className="p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-6 border-t border-black/[0.08] dark:border-white/[0.08]">

                <div>

                  <h3 className="font-display text-lg font-medium text-text mb-1">
                    {t("Pricing.commissionCustom")}
                  </h3>

                  <p className="text-sm text-black/55 dark:text-white/55">{t("Pricing.fullPipeline")}</p>

                </div>

                <button

                  type="button"

                  onClick={openStudioAuth}

                  className={cn(nx.btnPrimary, "shrink-0")}

                >

                  {t("Pricing.getStarted")}

                </button>

              </div>

            </section>



            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-16">

              {[

                { value: "250M+", label: t("Pricing.sourcesIndexed"), icon: BookOpen },
                { value: "12+", label: t("Pricing.domainLenses"), icon: Brain },
                { value: "4", label: t("Pricing.methodStages"), icon: FileText },
                { value: "48", label: t("Pricing.dataProviders"), icon: Sparkles },

              ].map(({ value, label, icon: Icon }) => (

                <div

                  key={label}

                  className="nx-surface p-4 text-center"

                >

                  <Icon className="w-4 h-4 text-black/55 dark:text-white/55 mx-auto mb-3" strokeWidth={1.25} />

                  <div className="font-mono text-2xl font-light text-text tabular-nums">{value}</div>

                  <div className="font-mono text-[11px] text-black/50 dark:text-white/50 mt-1 uppercase tracking-[0.12em]">

                    {label}

                  </div>

                </div>

              ))}

            </div>



            <div className="mb-16">

              <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-black/55 dark:text-white/55 text-center mb-8">
                {t("Pricing.questions")}
              </p>

              <div className="space-y-2">

                {FAQ.map((item, i) => (

                  <div

                    key={item.qKey}

                    className={cn(
                      "nx-surface overflow-hidden transition-colors",
                      openFaq === i && "border-black/20 dark:border-white/20"
                    )}

                  >

                    <button

                      type="button"

                      onClick={() => setOpenFaq(openFaq === i ? null : i)}

                      className="w-full flex items-center justify-between px-5 py-4 text-left gap-4"

                    >

                      <span className="text-sm font-medium text-text">{t(item.qKey)}</span>

                      <ChevronDown

                        size={15}

                        className={cn(

                          "text-black/50 dark:text-white/50 flex-shrink-0 transition-transform",

                          openFaq === i && "rotate-180 text-black dark:text-white"

                        )}

                      />

                    </button>

                    <AnimatePresence initial={false}>

                      {openFaq === i && (

                        <motion.div

                          initial={{ height: 0, opacity: 0 }}

                          animate={{ height: "auto", opacity: 1 }}

                          exit={{ height: 0, opacity: 0 }}

                          transition={{ duration: 0.25 }}

                        >

                          <p className="text-sm text-black/60 dark:text-white/60 leading-relaxed px-6 pb-5">{t(item.aKey)}</p>

                        </motion.div>

                      )}

                    </AnimatePresence>

                  </div>

                ))}

              </div>

            </div>



            <div className="text-center py-12">

              <h2 className="font-display text-xl sm:text-2xl font-semibold mb-4">
                {t("Pricing.fromChaosOpen")}{" "}
                <span className="text-black/70 dark:text-white/70">{t("Pricing.openByDefault")}</span>
              </h2>

              <div className="flex flex-col sm:flex-row gap-3 justify-center mt-8">

                <button

                  type="button"

                  onClick={openFreeAuth}

                  className="px-7 py-3.5 border border-black/30 dark:border-white/30 text-sm text-black dark:text-white hover:text-black dark:hover:text-white hover:border-black/60 dark:hover:border-white/60"

                >

                  {t("Pricing.enterThinkTank")}

                </button>

                <button

                  type="button"

                  onClick={openStudioAuth}

                  className={cn(nx.btnPrimary, "group")}

                >

                  {t("Pricing.openEngine")}

                  <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform" />

                </button>

              </div>

            </div>

          </div>

      </PublicPageShell>



      {showAuthModal && (

        <AuthModal

          isOpen={showAuthModal}

          onClose={() => setShowAuthModal(false)}

          onSignupSuccess={handleAuthSuccess}

        />

      )}

    </>

  );

}


