"use client";
import React, { useState } from 'react';

/**
 * PublicNav Component
 * 
 * Reusable navigation for marketing pages (Home, About, Methodology)
 * Consistent styling and behavior across public pages
 */

import { useRouter } from 'next/navigation';
import { NomosXLogo } from '@/components/brand/NomosXLogo';
import { Menu, X } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';

interface PublicNavProps {
  currentPage?: "home" | "articles" | "about" | "methodology" | "pricing" | "platform";
  onSignInClick: () => void;
  isAuthenticated?: boolean;
}

export default function PublicNav({ currentPage, onSignInClick, isAuthenticated }: PublicNavProps) {
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  const navLinks: { label: string; page: PublicNavProps["currentPage"]; href: string }[] = [
    { label: "Home", page: "home", href: "/" },
    { label: "Platform", page: "platform", href: "/platform" },
    { label: "Articles", page: "articles", href: "/articles" },
    { label: "About", page: "about", href: "/about" },
    { label: "Methodology", page: "methodology", href: "/methodology" },
    { label: "Pricing", page: "pricing", href: "/pricing" },
  ];

  return (
    <nav className="sticky top-0 z-50 w-full">
      <div className="absolute inset-0 bg-[#09090b]/80 backdrop-blur-xl border-b border-white/[0.06]" />
      <div className="relative max-w-7xl mx-auto px-6 sm:px-8 h-16 flex items-center justify-between">
        {/* Logo */}
        <div 
          className="cursor-pointer hover:opacity-80 transition-opacity"
          onClick={() => router.push("/")}
        >
          <NomosXLogo size="sm" variant="full" />
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
              onClick={() => router.push("/dashboard")}
              className="px-4 py-2 rounded-lg bg-white/[0.08] border border-white/[0.08] text-[13px] font-medium text-white hover:bg-white/[0.12] transition-all duration-200"
            >
              Open Dashboard
            </button>
          ) : (
            <button 
              onClick={onSignInClick}
              className="px-4 py-2 rounded-lg bg-gradient-to-r from-indigo-500 to-violet-500 hover:from-indigo-400 hover:to-violet-400 text-[13px] font-medium text-white transition-all duration-200 shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40"
            >
              Start Free
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
