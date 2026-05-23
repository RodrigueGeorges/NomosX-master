"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Menu, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
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
  { label: "Inquiries", page: "inquiries", href: "/archives" },
  { label: "Research", page: "research", href: "/researchers" },
  { label: "Studio", page: "studio", href: "/studio" },
  { label: "About", page: "about", href: "/about" },
];

export default function PublicNav({ currentPage, onSignInClick, isAuthenticated }: PublicNavProps) {
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-white/[0.06] bg-bg/90 backdrop-blur-xl">
      <div className="max-w-6xl mx-auto px-6 sm:px-8 h-16 flex items-center justify-between">
        <button
          type="button"
          onClick={() => router.push("/")}
          className="font-display font-semibold text-[18px] tracking-[-0.03em] text-text hover:opacity-90 transition-opacity"
        >
          Nomos<span className="text-accent">X</span>
        </button>

        <div className="hidden md:flex items-center gap-1">
          {NAV_LINKS.map((link) => (
            <button
              key={link.page}
              type="button"
              onClick={() => router.push(link.href)}
              className={cn(
                "px-3.5 py-1.5 rounded-lg text-[13px] font-medium transition-colors",
                currentPage === link.page
                  ? "text-text bg-white/[0.06]"
                  : "text-white/45 hover:text-white/75 hover:bg-white/[0.03]"
              )}
            >
              {link.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {isAuthenticated ? (
            <button
              type="button"
              onClick={() => router.push("/dashboard")}
              className="hidden sm:block px-4 py-2 rounded-lg border border-white/[0.10] text-[13px] text-white/60 hover:text-white hover:border-accent/25 transition-colors"
            >
              Dashboard
            </button>
          ) : (
            <button
              type="button"
              onClick={onSignInClick}
              className="hidden sm:block px-4 py-2 rounded-lg bg-accent hover:brightness-110 text-bg text-[13px] font-semibold transition-colors"
            >
              Sign in
            </button>
          )}

          <button
            type="button"
            onClick={() => setMobileOpen(!mobileOpen)}
            className="md:hidden w-9 h-9 rounded-lg border border-white/[0.08] flex items-center justify-center text-white/50"
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X size={16} /> : <Menu size={16} />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="md:hidden overflow-hidden border-t border-white/[0.06] bg-bg/98"
          >
            <div className="px-6 py-4 flex flex-col gap-1">
              {NAV_LINKS.map((link) => (
                <button
                  key={link.page}
                  type="button"
                  onClick={() => {
                    router.push(link.href);
                    setMobileOpen(false);
                  }}
                  className={cn(
                    "px-4 py-2.5 rounded-lg text-sm text-left",
                    currentPage === link.page ? "text-white bg-white/[0.06]" : "text-white/50"
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
                className="mt-2 px-4 py-2.5 rounded-lg bg-accent text-bg text-sm font-semibold"
              >
                Sign in
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}
