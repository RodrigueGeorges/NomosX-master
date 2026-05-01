"use client";
import React, { useState } from 'react';
import dynamic from 'next/dynamic';

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
  <svg width="44" height="44" viewBox="0 0 28 28" fill="none" aria-hidden="true">
    <defs>
      <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="1.5" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
    <circle cx="14" cy="14" r="12.5" fill="#09090b" stroke="white" strokeWidth="1.2" strokeOpacity="0.9" />
    <circle cx="14" cy="14" r="9.5" stroke="#818CF8" strokeWidth="1.1" strokeOpacity="0.95" filter="url(#glow)" />
    <ellipse cx="14" cy="14" rx="12" ry="4.2" stroke="#A5B4FC" strokeWidth="0.9" strokeOpacity="0.85" transform="rotate(-24 14 14)" />
    <ellipse cx="14" cy="14" rx="12" ry="4.2" stroke="#7C3AED" strokeWidth="0.9" strokeOpacity="0.85" transform="rotate(28 14 14)" />
    <line x1="8.5" y1="8.5" x2="19.5" y2="19.5" stroke="#A5B4FC" strokeWidth="2.5" strokeLinecap="round" />
    <line x1="19.5" y1="8.5" x2="8.5" y2="19.5" stroke="#8B5CF6" strokeWidth="2.5" strokeLinecap="round" />
    <circle cx="14" cy="14" r="2.7" fill="#F5D778" filter="url(#glow)" />
    <circle cx="14" cy="14" r="1" fill="#09090b" />
  </svg>
);

const NomosXLogo3D = dynamic(
  () => import('@/components/brand/NomosXLogo3D').then(m => m.NomosXLogo3D),
  { ssr: false, loading: () => <LogoFallback /> }
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
    <nav className="sticky top-0 z-50 w-full">
      <div className="absolute inset-0 bg-[#09090b]/80 backdrop-blur-xl border-b border-white/[0.06]" />
      <div className="relative max-w-7xl mx-auto px-6 sm:px-8 h-16 flex items-center justify-between">
        {/* Logo + Wordmark */}
        <div
          className="flex items-center gap-3 cursor-pointer group"
          onClick={() => router.push("/")}
        >
          <div className="relative">
            <NomosXLogo3D size={48} />
            <div className="absolute inset-0 rounded-full blur-md bg-indigo-500/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          </div>
          <div className="flex flex-col items-start leading-none">
            <span className="font-display font-black text-[22px] tracking-tight">
              <span className="text-white/95 group-hover:text-white transition-colors">Nomos</span>
              <span className="bg-gradient-to-r from-indigo-400 via-violet-400 to-fuchsia-400 bg-clip-text text-transparent">X</span>
            </span>
            <span className="text-[9px] tracking-[0.25em] uppercase text-white/30 font-medium mt-0.5">Autonomous Think Tank</span>
          </div>
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
              className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[13px] font-medium transition-all duration-200 shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/40"
            >
            Browse Codex
            </button>
          ) : (
            <button
              onClick={onSignInClick}
              className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[13px] font-medium transition-all duration-200 shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/40"
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
