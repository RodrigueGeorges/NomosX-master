"use client";

import React, { useState, useEffect } from "react";
import { Menu, X, Globe, LayoutDashboard, Play } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { NomosXLogo } from "@/components/brand/NomosXLogo";
import { LOGO_NAV_CAP } from "@/lib/brand/logo-config";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { cn } from "@/lib/utils";
import { Link, useRouter, usePathname } from "@/i18n/navigation";
import { LOCALES, DEFAULT_LOCALE, type AppLocale } from "@/i18n/routing";

export type PublicNavPage =
  | "dossiers"
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
  { labelKey: "Nav.dossiers", page: "dossiers", href: "/dossiers" },
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
  const [isAdmin, setIsAdmin] = useState(false);

  // Check if user is admin (for dashboard link)
  useEffect(() => {
    if (!isAuthenticated) return;
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.user?.role === "admin" || data?.user?.role === "superadmin") {
          setIsAdmin(true);
        }
      })
      .catch(() => {});
  }, [isAuthenticated]);

  // Detect current locale from pathname (/fr/... → fr, else en)
  const currentLocale: AppLocale = pathname.startsWith("/fr") ? "fr" : "en";

  const switchLocale = (locale: AppLocale) => {
    // For default locale (en), no prefix. For fr, add /fr prefix.
    router.push(pathname, { locale });
    setLangOpen(false);
    setMobileOpen(false);
  };

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-black/[0.08] dark:border-white/[0.06] bg-white/80 dark:bg-[#0a0a0f]/80 backdrop-blur-xl">
      <div className="max-w-6xl mx-auto px-5 sm:px-6 h-12 flex items-center justify-between">
        <button
          type="button"
          onClick={() => router.push("/")}
          className="text-black dark:text-white hover:opacity-80 transition-opacity focus:outline-none focus-visible:ring-1 focus-visible:ring-black/40 dark:focus-visible:ring-white/40 rounded-sm"
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
                  ? "text-black dark:text-white"
                  : "text-black/55 dark:text-white/55 hover:text-black dark:hover:text-white"
              )}
            >
              {t(link.labelKey)}
              {currentPage === link.page && (
                <span className="absolute -bottom-px left-0 right-0 h-px bg-gradient-to-r from-transparent via-black/60 dark:via-white/60 to-transparent" />
              )}
            </button>
          ))}
          {isAdmin && (
            <button
              type="button"
              onClick={() => router.push("/dashboard")}
              className="flex items-center gap-1.5 font-mono text-xs uppercase tracking-[0.1em] text-black/55 dark:text-white/55 hover:text-black dark:hover:text-white transition-colors py-1"
            >
              <LayoutDashboard size={12} />
              {t("Nav.dashboard")}
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent("nomosx:replay-intro"))}
            className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-black/40 dark:text-white/40 hover:text-black dark:hover:text-white transition-colors"
            aria-label="Replay intro"
            title="Replay intro"
          >
            <Play size={12} />
          </button>
          <ThemeToggle className="hidden sm:flex" />
          {/* Language switcher */}
          <div className="relative hidden sm:block">
            <button
              type="button"
              onClick={() => setLangOpen(!langOpen)}
              className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white transition-colors"
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
                  className="absolute right-0 top-full mt-1 border border-black/[0.08] dark:border-white/[0.08] bg-white/95 dark:bg-[#111114]/95 backdrop-blur-xl py-1 min-w-[120px] shadow-lg shadow-black/[0.04] dark:shadow-black/40"
                >
                  {LOCALES.map((loc) => (
                    <button
                      key={loc}
                      type="button"
                      onClick={() => switchLocale(loc)}
                      className={cn(
                        "block w-full text-left px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.14em] transition-colors",
                        currentLocale === loc
                          ? "text-black dark:text-white"
                          : "text-black/50 dark:text-white/50 hover:text-black dark:hover:text-white"
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
              className="hidden sm:block font-mono text-[11px] uppercase tracking-[0.14em] text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white transition-colors"
            >
              {t("Nav.dashboard")}
            </button>
          ) : (
            <button
              type="button"
              onClick={onSignInClick}
              className="hidden sm:block px-4 py-2.5 border border-black/25 dark:border-white/20 text-black/85 dark:text-white/85 font-mono text-[11px] uppercase tracking-[0.14em] hover:border-black/50 dark:hover:border-white/40 hover:text-black dark:hover:text-white hover:bg-black/[0.04] dark:hover:bg-white/[0.04] transition-all"
            >
              {t("Nav.access")}
            </button>
          )}

          <button
            type="button"
            onClick={() => setMobileOpen(!mobileOpen)}
            className="md:hidden w-9 h-9 flex items-center justify-center text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white"
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
            className="md:hidden overflow-hidden border-t border-black/[0.08] dark:border-white/[0.06] bg-white dark:bg-[#0a0a0f]"
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
                    currentPage === link.page ? "text-black dark:text-white" : "text-black/60 dark:text-white/60"
                  )}
                >
                  {t(link.labelKey)}
                </button>
              ))}

              {isAdmin && (
                <button
                  type="button"
                  onClick={() => {
                    router.push("/dashboard");
                    setMobileOpen(false);
                  }}
                  className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.16em] text-left text-black/60 dark:text-white/60"
                >
                  <LayoutDashboard size={14} />
                  {t("Nav.dashboard")}
                </button>
              )}

              {/* Mobile language switcher */}
              <div className="flex gap-3 pt-2 border-t border-black/[0.06] dark:border-white/[0.06]">
                {LOCALES.map((loc) => (
                  <button
                    key={loc}
                    type="button"
                    onClick={() => switchLocale(loc)}
                    className={cn(
                      "font-mono text-xs uppercase tracking-[0.14em]",
                      currentLocale === loc ? "text-black dark:text-white" : "text-black/50 dark:text-white/50"
                    )}
                  >
                    {loc === "en" ? t("Nav.languageEn") : t("Nav.languageFr")}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => {
                  onSignInClick();
                  setMobileOpen(false);
                }}
                className="mt-4 w-full py-3 border border-black/25 dark:border-white/20 text-black dark:text-white font-mono text-[11px] uppercase tracking-[0.14em] hover:bg-black/[0.04] dark:hover:bg-white/[0.04] transition-colors"
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
