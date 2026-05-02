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
  <svg width="44" height="44" viewBox="0 0 120 120" fill="none" aria-hidden="true">
    <defs>
      <linearGradient id="nav-oracle-gradient" x1="20%" y1="0%" x2="80%" y2="100%">
        <stop offset="0%" stopColor="#A5B4FC" />
        <stop offset="45%" stopColor="#6366F1" />
        <stop offset="100%" stopColor="#7C3AED" />
      </linearGradient>
      <radialGradient id="nav-oracle-core" cx="50%" cy="45%" r="55%">
        <stop offset="0%" stopColor="#FFFFFF" />
        <stop offset="42%" stopColor="#F5D778" />
        <stop offset="100%" stopColor="#D4AF37" />
      </radialGradient>
      <filter id="nav-oracle-glow" x="-40%" y="-40%" width="180%" height="180%">
        <feGaussianBlur stdDeviation="3.8" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
    <circle cx="60" cy="60" r="52" fill="#09090B" stroke="white" strokeOpacity="0.10" strokeWidth="1.2" />
    <path d="M60 9 L68 24 H52 L60 9Z" fill="#F5D778" opacity="0.55" />
    <path d="M60 111 L52 96 H68 L60 111Z" fill="#F5D778" opacity="0.42" />
    <path d="M9 60 L24 52 V68 L9 60Z" fill="#A5B4FC" opacity="0.28" />
    <path d="M111 60 L96 68 V52 L111 60Z" fill="#A5B4FC" opacity="0.28" />
    <circle cx="60" cy="60" r="42" stroke="url(#nav-oracle-gradient)" strokeWidth="1.3" strokeOpacity="0.50" />
    <path d="M60 18 A42 42 0 0 1 102 60" stroke="#F5D778" strokeWidth="1" strokeOpacity="0.38" strokeLinecap="round" />
    <path d="M60 102 A42 42 0 0 1 18 60" stroke="#F5D778" strokeWidth="1" strokeOpacity="0.28" strokeLinecap="round" />
    <ellipse cx="60" cy="60" rx="50" ry="18" stroke="#A5B4FC" strokeWidth="1.1" strokeOpacity="0.24" transform="rotate(-24 60 60)" />
    <ellipse cx="60" cy="60" rx="49" ry="17" stroke="#7C3AED" strokeWidth="1.1" strokeOpacity="0.26" transform="rotate(28 60 60)" />
    <g filter="url(#nav-oracle-glow)">
      <path d="M31 35 V86" stroke="url(#nav-oracle-gradient)" strokeWidth="8" strokeLinecap="round" />
      <path d="M89 35 V86" stroke="url(#nav-oracle-gradient)" strokeWidth="8" strokeLinecap="round" />
      <path d="M34 36 L86 84" stroke="url(#nav-oracle-gradient)" strokeWidth="8" strokeLinecap="round" opacity="0.92" />
      <path d="M86 36 L34 84" stroke="url(#nav-oracle-gradient)" strokeWidth="8" strokeLinecap="round" opacity="0.72" />
    </g>
    <circle cx="60" cy="60" r="11" fill="url(#nav-oracle-core)" />
    <circle cx="60" cy="60" r="4.2" fill="#09090B" opacity="0.92" />
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
            <NomosXLogo3D size={52} />
            <div className="absolute inset-0 rounded-full blur-md bg-amber-300/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          </div>
          <span className="font-display font-black text-[24px] tracking-tight drop-shadow-[0_0_12px_rgba(139,92,246,0.35)]">
            <span className="text-white group-hover:text-white transition-colors">Nomos</span>
            <span className="bg-gradient-to-r from-indigo-300 via-violet-300 to-[#F5D778] bg-clip-text text-transparent">X</span>
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
              className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[13px] font-medium transition-all duration-200 shadow-lg shadow-amber-300/10 hover:shadow-amber-300/20"
            >
            Browse Codex
            </button>
          ) : (
            <button
              onClick={onSignInClick}
              className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[13px] font-medium transition-all duration-200 shadow-lg shadow-amber-300/10 hover:shadow-amber-300/20"
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
