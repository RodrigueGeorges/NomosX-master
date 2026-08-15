"use client";

import React, { useState } from "react";
import { Menu, X, Globe } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { NomosXLogo } from "@/components/brand/NomosXLogo";
import { LOGO_NAV_CAP } from "@/lib/brand/logo-config";
import { cn } from "@/lib/utils";
import { Link, useRouter, usePathname } from "@/i18n/navigation";
import { LOCALES, DEFAULT_LOCALE, type AppLocale } from "@/i18n/routing";

export type PublicNavPage =
  | "home"
  | "inquiries"
  | "research"
  | "studio"
  | "about"
  | "articles"
  | "methodology"
  | "pricing";

interface PublicNavProps {
  currentPage?: PublicNavPage;
  onSignInClick: () => void;
  isAuthenticated?: boolean;
}

const NAV_LINKS: { labelKey: string; page: PublicNavPage; href: string }[] = [
  { labelKey: "Nav.briefs", page: "inquiries", href: "/archives" },
  { labelKey: "Nav.domains", page: "research", href: "/researchers" },
  { labelKey: "Nav.studio", page: "studio", href: "/studio" },
  { labelKey: "Nav.about", page: "about", href: "/about" },
];

export default function PublicNav({ currentPage, onSignInClick, isAuthenticated }: PublicNavProps) {
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);

  // Detect current locale from pathname (/fr/... → fr, else en)
  const currentLocale: AppLocale = pathname.startsWith("/fr") ? "fr" : "en";

  const switchLocale = (locale: AppLocale) => {
    // For default locale (en), no prefix. For fr, add /fr prefix.
    router.push(pathname, { locale });
    setLangOpen(false);
    setMobileOpen(false);
  };

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-white/[0.08] bg-black/80 backdrop-blur-xl">
      <div className="max-w-6xl mx-auto px-5 sm:px-6 h-12 flex items-center justify-between">
        <button
          type="button"
          onClick={() => router.push("/")}
          className="text-white hover:opacity-80 transition-opacity focus:outline-none focus-visible:ring-1 focus-visible:ring-white/40 rounded-sm"
          aria-label={t("Nav.home")}
        >
          <NomosXLogo variant="wordmark" size={LOGO_NAV_CAP} />
        </button>

        <div className="hidden md:flex items-center gap-6">
          {NAV_LINKS.map((link) => (
            <button
              key={link.page}
              type="button"
              onClick={() => router.push(link.href)}
              className={cn(
                "relative font-mono text-xs uppercase tracking-[0.1em] transition-colors py-1",
                currentPage === link.page
                  ? "text-white"
                  : "text-white/55 hover:text-white"
              )}
            >
              {t(link.labelKey)}
              {currentPage === link.page && (
                <span className="absolute -bottom-px left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/60 to-transparent" />
              )}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {/* Language switcher */}
          <div className="relative hidden sm:block">
            <button
              type="button"
              onClick={() => setLangOpen(!langOpen)}
              className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-white/60 hover:text-white transition-colors"
              aria-label={t("Nav.language")}
            >
              <Globe size={14} />
              {currentLocale.toUpperCase()}
            </button>
            <AnimatePresence>
              {langOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  className="absolute right-0 top-full mt-1 border border-white/[0.08] bg-black/95 backdrop-blur-xl py-1 min-w-[120px]"
                >
                  {LOCALES.map((loc) => (
                    <button
                      key={loc}
                      type="button"
                      onClick={() => switchLocale(loc)}
                      className={cn(
                        "block w-full text-left px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.14em] transition-colors",
                        currentLocale === loc
                          ? "text-white"
                          : "text-white/50 hover:text-white"
                      )}
                    >
                      {loc === "en" ? t("Nav.languageEn") : t("Nav.languageFr")}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {isAuthenticated ? (
            <button
              type="button"
              onClick={() => router.push("/dashboard")}
              className="hidden sm:block font-mono text-[11px] uppercase tracking-[0.14em] text-white/60 hover:text-white transition-colors"
            >
              {t("Nav.dashboard")}
            </button>
          ) : (
            <button
              type="button"
              onClick={onSignInClick}
              className="hidden sm:block px-4 py-2.5 border border-white/25 text-white/85 font-mono text-[11px] uppercase tracking-[0.14em] hover:border-white/50 hover:text-white hover:bg-white/[0.04] transition-all"
            >
              {t("Nav.access")}
            </button>
          )}

          <button
            type="button"
            onClick={() => setMobileOpen(!mobileOpen)}
            className="md:hidden w-9 h-9 flex items-center justify-center text-white/60 hover:text-white"
            aria-label={t("Nav.toggleMenu")}
          >
            {mobileOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="md:hidden overflow-hidden border-t border-white/[0.08] bg-black"
          >
            <div className="px-5 py-5 flex flex-col gap-3">
              {NAV_LINKS.map((link) => (
                <button
                  key={link.page}
                  type="button"
                  onClick={() => {
                    router.push(link.href);
                    setMobileOpen(false);
                  }}
                  className={cn(
                    "font-mono text-xs uppercase tracking-[0.16em] text-left",
                    currentPage === link.page ? "text-white" : "text-white/60"
                  )}
                >
                  {t(link.labelKey)}
                </button>
              ))}

              {/* Mobile language switcher */}
              <div className="flex gap-3 pt-2 border-t border-white/[0.06]">
                {LOCALES.map((loc) => (
                  <button
                    key={loc}
                    type="button"
                    onClick={() => switchLocale(loc)}
                    className={cn(
                      "font-mono text-xs uppercase tracking-[0.14em]",
                      currentLocale === loc ? "text-white" : "text-white/50"
                    )}
                  >
                    {loc === "en" ? "EN" : "FR"}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => {
                  onSignInClick();
                  setMobileOpen(false);
                }}
                className="mt-4 w-full py-3 border border-white/25 text-white font-mono text-[11px] uppercase tracking-[0.14em] hover:bg-white/[0.04] transition-colors"
              >
                {t("Nav.access")}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}
