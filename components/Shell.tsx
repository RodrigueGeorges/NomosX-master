"use client";

import React from 'react';
import { useState,useEffect } from 'react';

import Link from 'next/link';
import { useRouter,usePathname } from 'next/navigation';
import { LayoutDashboard,Zap,Search,Archive,Settings,LogOut,User as UserIcon,Menu,X,PenTool,DollarSign,CreditCard } from 'lucide-react';
import { NomosXLogo } from '@/components/brand/NomosXLogo';
import { useAuth } from '@/hooks/useAuth';

// USER Navigation - Reading focused
const userNav = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/publications", label: "Publications", icon: Archive },
  { href: "/search", label: "Explorer", icon: Search },
];

// ADMIN Navigation - Editorial control
const adminNav = [
  { href: "/admin", label: "Command Center", icon: LayoutDashboard },
  { href: "/studio", label: "Studio", icon: PenTool },
  { href: "/signals", label: "Signals", icon: Zap }, // Admin only
  { href: "/publications", label: "Publications", icon: Archive },
];

// Secondary navigation
const secondaryNav = [
  { href: "/pricing", label: "Pricing", icon: DollarSign },
  { href: "/dashboard/billing", label: "Billing", icon: CreditCard },
];

export default function Shell({ children }: { children: React.ReactNode }) {
  const { user, loading, isAuthenticated, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showLoadingOverlay, setShowLoadingOverlay] = useState(true);
  const [mounted, setMounted] = useState(false);

  const isActive = (href: string) => pathname === href;
  
  // Determine if user is admin (role-based or simple check)
  const isAdmin = user?.role === "ADMIN" || user?.email?.includes("admin");
  
  // Determine which nav to show
  const isAdminRoute = pathname?.startsWith("/admin") || pathname?.startsWith("/studio") || pathname?.startsWith("/signals");
  const mainNav = isAdminRoute && isAdmin ? adminNav : userNav;

  // Mount particles on client only to avoid hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  // Redirect non-authenticated users to home
  useEffect(() => {
    if (!loading && !isAuthenticated) {
      // Avoid redirect loops
      if (pathname !== "/") {
        router.push("/");
      }
    }
  }, [loading, isAuthenticated, router, pathname]);

  // Keep overlay visible for smooth fade-out
  useEffect(() => {
    if (!loading) {
      const timer = setTimeout(() => {
        setShowLoadingOverlay(false);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [loading]);

  return (
    <>
      {/* Loading Overlay - Crossfade smooth */}
      {showLoadingOverlay && (
        <div className={`fixed inset-0 z-50 min-h-screen bg-[#0B0B0D] flex items-center justify-center transition-opacity duration-500 ${loading ? 'opacity-100' : 'opacity-0'}`}>
        {/* Background Futuriste */}
        <div className="fixed inset-0 pointer-events-none overflow-hidden">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1200px] h-[800px]">
            <div className="absolute inset-0 bg-gradient-to-b from-indigo-500/8 via-violet-500/4 to-transparent blur-3xl" />
            <div className="absolute inset-0 bg-gradient-to-tr from-purple-500/6 via-transparent to-indigo-500/6 blur-3xl" />
          </div>
          <div className="absolute inset-0 bg-[linear-gradient(rgba(99,102,241,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(99,102,241,0.02)_1px,transparent_1px)] bg-[size:80px_80px]" />
        </div>
        
        <div className="text-center relative z-10">
          <div className="mb-8">
            <div className="flex flex-col items-center gap-4">
              <NomosXLogo size="lg" variant="full" />
              <p className="text-xs text-white/30 tracking-[0.15em] uppercase">Autonomous Think Tank</p>
            </div>
          <div className="relative w-12 h-12 mx-auto">
            <div className="absolute inset-0 border-2 border-indigo-500/20 rounded-full"></div>
            <div className="absolute inset-0 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
        </div>
      </div>
        </div>
      )}

      {/* Main Content - Always rendered */}
      <div className="min-h-screen bg-bg text-text overflow-x-hidden">
      {/* Background Futuriste - Identique à Home */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        {/* Mesh gradient principal */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1400px] h-[900px]">
          <div className="absolute inset-0 bg-gradient-to-b from-indigo-500/8 via-violet-500/4 to-transparent blur-3xl" />
          <div className="absolute inset-0 bg-gradient-to-tr from-purple-500/6 via-transparent to-indigo-500/6 blur-3xl" />
        </div>
        
        {/* Grid pattern subtil */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(99,102,241,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(99,102,241,0.02)_1px,transparent_1px)] bg-[size:80px_80px]" />
        
        {/* Particles réseau agentique - Client only to avoid hydration mismatch */}
        {mounted && (
          <div className="absolute inset-0">
            {[...Array(15)].map((_, i) => (
              <div 
                key={i}
                className="absolute w-1 h-1 rounded-full bg-indigo-400/20 animate-pulse"
                style={{
                  top: `${Math.random() * 100}%`,
                  left: `${Math.random() * 100}%`,
                  animationDelay: `${Math.random() * 3}s`,
                  animationDuration: `${3 + Math.random() * 2}s`
                }}
              />
            ))}
          </div>
        )}
      </div>
      
      {/* Header Premium - Plus épuré */}
      <header className="sticky top-0 z-30 backdrop-blur-xl bg-[#0B0B0D]/90 border-b border-white/[0.08]">
        <div className="px-6 lg:px-8 py-4 flex items-center justify-between max-w-[1400px] mx-auto">
          
          {/* Logo */}
          <Link href="/dashboard" className="hover:opacity-80 transition-opacity">
            <NomosXLogo size="sm" variant="full" />
          </Link>

          {/* Desktop Navigation - Minimaliste */}
          <nav className="hidden lg:flex items-center gap-1">
            {mainNav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`
                  px-3 py-2 rounded-lg text-sm font-medium
                  inline-flex items-center gap-2 whitespace-nowrap
                  transition-all duration-200
                  ${isActive(item.href)
                    ? 'text-white bg-white/[0.08]'
                    : 'text-white/50 hover:text-white/80 hover:bg-white/[0.04]'
                  }
                `}
              >
                <item.icon size={16} strokeWidth={2} />
                <span>{item.label}</span>
              </Link>
            ))}

            {/* Divider */}
            <div className="w-px h-4 bg-white/10 mx-2" />

            {/* Pricing Link */}
            <Link
              href="/pricing"
              className={`
                px-3 py-2 rounded-lg text-sm font-medium
                inline-flex items-center gap-2 whitespace-nowrap
                transition-all duration-200
                ${isActive("/pricing")
                  ? 'text-indigo-300 bg-indigo-500/10'
                  : 'text-indigo-300/70 hover:text-indigo-300 hover:bg-indigo-500/5'
                }
              `}
            >
              <DollarSign size={16} strokeWidth={2} />
              <span>Pricing</span>
            </Link>

            {/* Billing Link */}
            <Link
              href="/dashboard/billing"
              className={`
                px-3 py-2 rounded-lg text-sm font-medium
                inline-flex items-center gap-2 whitespace-nowrap
                transition-all duration-200
                ${isActive("/dashboard/billing")
                  ? 'text-white bg-white/[0.08]'
                  : 'text-white/50 hover:text-white/80 hover:bg-white/[0.04]'
                }
              `}
            >
              <CreditCard size={16} strokeWidth={2} />
              <span>Billing</span>
            </Link>

            {/* Settings Link */}
            <Link
              href="/settings"
              className={`
                px-3 py-2 rounded-lg text-sm font-medium
                inline-flex items-center gap-2 whitespace-nowrap
                transition-all duration-200
                ${isActive("/settings")
                  ? 'text-white bg-white/[0.08]'
                  : 'text-white/50 hover:text-white/80 hover:bg-white/[0.04]'
                }
              `}
            >
              <Settings size={16} strokeWidth={2} />
              <span>Settings</span>
            </Link>
          </nav>

          {/* Right Side - User & Logout */}
          <div className="flex items-center gap-3">
            {user && (
              <>
                {/* User Badge (Desktop) */}
                <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 bg-white/[0.04] rounded-lg border border-white/[0.08]">
                  <div className="w-6 h-6 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center">
                    <UserIcon size={14} className="text-white" strokeWidth={2.5} />
                  </div>
                  <span className="text-sm font-medium text-white/80">{user.name || user.email?.split('@')[0]}</span>
                </div>

                {/* Logout Button (Desktop) */}
                <button
                  onClick={logout}
                  className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-lg text-white/50 hover:text-red-400 hover:bg-red-500/10 transition-all duration-200"
                  title="Sign out"
                >
                  <LogOut size={16} strokeWidth={2} />
                </button>
              </>
            )}

            {/* Mobile Menu Button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-2 rounded-lg text-white/50 hover:text-white/80 hover:bg-white/[0.04] transition-all"
            >
              {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>
      </header>


      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 z-40 top-[65px]">
          <div 
            className="absolute inset-0 bg-black/60 backdrop-blur-sm" 
            onClick={() => setMobileMenuOpen(false)}
          />
          <nav className="relative bg-[#111113] border-r border-white/[0.08] h-full w-64 p-4 overflow-y-auto">
            <div className="space-y-1 mb-6">
              {[...mainNav, { href: "/pricing", label: "Pricing", icon: DollarSign }, { href: "/dashboard/billing", label: "Billing", icon: CreditCard }, { href: "/settings", label: "Settings", icon: Settings }].map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`
                    flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium
                    transition-all duration-200
                    ${isActive(item.href)
                      ? 'text-white bg-white/[0.08]'
                      : 'text-white/60 hover:text-white/90 hover:bg-white/[0.04]'
                    }
                  `}
                >
                  <item.icon size={18} strokeWidth={2} />
                  <span>{item.label}</span>
                </Link>
              ))}
            </div>

            {/* User Menu (Mobile) */}
            {user && (
              <div className="pt-4 border-t border-white/[0.08] space-y-2">
                <div className="px-3 py-2 bg-white/[0.03] rounded-lg">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-6 h-6 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center">
                      <UserIcon size={14} className="text-white" strokeWidth={2.5} />
                    </div>
                    <span className="text-sm font-medium text-white/80">{user.name || user.email}</span>
                  </div>
                </div>
                <button
                  onClick={() => {
                    logout();
                    setMobileMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-white/60 hover:text-red-400 hover:bg-red-500/10 transition-all"
                >
                  <LogOut size={18} strokeWidth={2} />
                  <span>Logout</span>
                </button>
              </div>
            )}
          </nav>
        </div>
      )}

      {/* Main Content */}
      <main className="w-full">{children}</main>

      {/* Footer */}
      <footer className="px-6 lg:px-8 py-8 border-t border-white/[0.08] mt-16 relative z-10">
        <div className="max-w-[1400px] mx-auto">
          <div className="flex items-center justify-between flex-wrap gap-6">
            <div className="flex items-center gap-2.5">
              <NomosXLogo size="sm" variant="full" />
            </div>
            <div className="flex items-center gap-6 text-xs text-white/30">
              <Link href="/publications" className="hover:text-white/60 transition-colors">Publications</Link>
              <Link href="/about" className="hover:text-white/60 transition-colors">About</Link>
              <Link href="/terms" className="hover:text-white/60 transition-colors">Terms</Link>
              <Link href="/privacy" className="hover:text-white/60 transition-colors">Privacy</Link>
              <span>© 2026 NomosX</span>
            </div>
          </div>
        </div>
      </footer>
      </div>
    </>
  );
}
