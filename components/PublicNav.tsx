"use client";
import React, { useState } from 'react';

/**
 * PublicNav Component
 * 
 * Reusable navigation for marketing pages (Home, About, Methodology)
 * Consistent styling and behavior across public pages
 */

import { useRouter } from 'next/navigation';
import { Menu, X } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';

const LogoFallback = () => (
  <svg width="36" height="36" viewBox="0 0 100 100" fill="none" aria-hidden="true">
    <line x1="22" y1="16" x2="22" y2="84" stroke="white" strokeWidth="4" strokeLinecap="square" />
    <line x1="22" y1="16" x2="78" y2="84" stroke="white" strokeWidth="4" strokeLinecap="square" />
    <line x1="78" y1="16" x2="78" y2="84" stroke="white" strokeWidth="4" strokeLinecap="square" />
  </svg>
);


interface PublicNavProps {
  currentPage?: "home" | "articles" | "about" | "methodology" | "pricing" | "platform" | "studio";
  onSignInClick: () => void;
  isAuthenticated?: boolean;
}

export default function PublicNav({ currentPage, onSignInClick, isAuthenticated }: PublicNavProps) {
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  const navLinks: { label: string; page: PublicNavProps["currentPage"]; href: string }[] = [
    { label: "Home", page: "home", href: "/" },
    { label: "Codex", page: "articles", href: "/articles" },
    { label: "About", page: "about", href: "/about" },
    { label: "Protocol", page: "methodology", href: "/methodology" },
    { label: "Access", page: "pricing", href: "/pricing" },
    { label: "Oracle", page: "studio", href: "/studio" },
  ];

  return (
    <nav className="sticky top-0 z-50 w-full" style={{ background: 'rgba(0,0,0,0.92)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
      <div className="absolute inset-0 backdrop-blur-xl pointer-events-none" />
      <div className="relative max-w-7xl mx-auto px-6 sm:px-8 h-16 flex items-center justify-between">
        {/* Logo + Wordmark */}
        <div
          className="flex items-center gap-3 cursor-pointer group"
          onClick={() => router.push("/")}
        >
          <LogoFallback />
          <span className="font-display font-semibold text-[20px] tracking-[-0.03em]">
            <span className="text-white">Nomos</span>
            <span className="text-white/45">X</span>
          </span>
          <span className="flex items-center gap-1.5 ml-1" title="System active">
            <span className="nx-status-dot" aria-hidden="true" />
            <span className="font-mono text-[9px] text-white/25 tracking-[0.18em] uppercase hidden sm:inline">live</span>
          </span>
        </div>
        
        {/* Nav Links — Desktop */}
        <div className="hidden md:flex items-center gap-1">
          {navLinks.map(link => (
            <button
              key={link.page}
              onClick={() => router.push(link.href)}
              className={`px-3 py-1.5 rounded-lg text-[13px] font-medium transition-all duration-200 ${
                currentPage === link.page
                  ? "text-white bg-white/[0.08]"
                  : "text-white/50 hover:text-white/80 hover:bg-white/[0.04]"
              }`}
            >
              {link.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          {/* CTA */}
          {isAuthenticated ? (
            <button
              onClick={() => router.push("/articles")}
              className="px-4 py-2 border border-white/20 hover:border-white/40 text-white text-[13px] font-medium transition-all duration-150 hover:bg-white/[0.05]"
            >
              Browse Codex
            </button>
          ) : (
            <button
              onClick={onSignInClick}
              className="px-4 py-2 bg-white text-black text-[13px] font-semibold transition-all duration-150 hover:bg-white/90"
            >
              Enter
            </button>
          )}

          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="md:hidden w-9 h-9 rounded-lg border border-white/[0.08] bg-white/[0.03] flex items-center justify-center text-white/50 hover:text-white/80 hover:bg-white/[0.06] transition-all duration-200"
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X size={16} /> : <Menu size={16} />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            className="md:hidden overflow-hidden relative bg-[#09090b]/95 backdrop-blur-xl border-b border-white/[0.06]"
          >
            <div className="max-w-7xl mx-auto px-6 py-4 flex flex-col gap-1">
              {navLinks.map(link => (
                <button
                  key={link.page}
                  onClick={() => { router.push(link.href); setMobileOpen(false); }}
                  className={`px-4 py-2.5 rounded-lg text-sm font-medium text-left transition-all duration-200 ${
                    currentPage === link.page
                      ? "text-white bg-white/[0.08]"
                      : "text-white/50 hover:text-white/80 hover:bg-white/[0.04]"
                  }`}
                >
                  {link.label}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}
