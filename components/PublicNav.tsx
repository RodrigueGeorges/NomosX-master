"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Menu, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { NomosXLogo } from "@/components/brand/NomosXLogo";
import { LOGO_NAV_CAP } from "@/lib/brand/logo-config";
import { cn } from "@/lib/utils";

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

const NAV_LINKS: { label: string; page: PublicNavPage; href: string }[] = [
  { label: "Briefs", page: "inquiries", href: "/archives" },
  { label: "Domains", page: "research", href: "/researchers" },
  { label: "Studio", page: "studio", href: "/studio" },
  { label: "About", page: "about", href: "/about" },
];

export default function PublicNav({ currentPage, onSignInClick, isAuthenticated }: PublicNavProps) {
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-white/[0.08] bg-black/80 backdrop-blur-xl">
      <div className="max-w-6xl mx-auto px-5 sm:px-6 h-12 flex items-center justify-between">
        <button
          type="button"
          onClick={() => router.push("/")}
          className="text-white hover:opacity-80 transition-opacity focus:outline-none focus-visible:ring-1 focus-visible:ring-white/40 rounded-sm"
          aria-label="NomosX home"
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
              {link.label}
              {currentPage === link.page && (
                <span className="absolute -bottom-px left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/60 to-transparent" />
              )}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {isAuthenticated ? (
            <button
              type="button"
              onClick={() => router.push("/dashboard")}
              className="hidden sm:block font-mono text-[11px] uppercase tracking-[0.14em] text-white/60 hover:text-white transition-colors"
            >
              Dashboard
            </button>
          ) : (
            <button
              type="button"
              onClick={onSignInClick}
              className="hidden sm:block px-4 py-2.5 border border-white/25 text-white/85 font-mono text-[11px] uppercase tracking-[0.14em] hover:border-white/50 hover:text-white hover:bg-white/[0.04] transition-all"
            >
              Access
            </button>
          )}

          <button
            type="button"
            onClick={() => setMobileOpen(!mobileOpen)}
            className="md:hidden w-9 h-9 flex items-center justify-center text-white/60 hover:text-white"
            aria-label="Toggle menu"
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
                  {link.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  onSignInClick();
                  setMobileOpen(false);
                }}
                className="mt-4 w-full py-3 border border-white/25 text-white font-mono text-[11px] uppercase tracking-[0.14em] hover:bg-white/[0.04] transition-colors"
              >
                Access
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}
