"use client";

import React from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { NomosXLogo } from '@/components/brand/NomosXLogo';
import {
  LayoutDashboard,
  FileText,
  Brain,
  Settings,
  CreditCard,
  User,
  LogOut,
  ExternalLink,
  ChevronRight,
} from 'lucide-react';

const NAV_ITEMS = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Briefs", href: "/briefs", icon: FileText },
  { label: "Studio", href: "/dashboard/studio", icon: Brain },
];

const BOTTOM_ITEMS = [
  { label: "Billing", href: "/dashboard/billing", icon: CreditCard },
  { label: "Preferences", href: "/dashboard/preferences", icon: Settings },
];

export default function DashboardNav() {
  const router = useRouter();
  const pathname = usePathname();

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      window.location.href = '/';
    } catch {
      window.location.href = '/';
    }
  };

  return (
    <nav className="sticky top-0 z-50 w-full">
      <div className="absolute inset-0 bg-[#09090b]/80 backdrop-blur-xl border-b border-white/[0.06]" />
      <div className="relative max-w-7xl mx-auto px-6 sm:px-8 h-14 flex items-center justify-between">
        {/* Logo */}
        <div
          className="cursor-pointer hover:opacity-80 transition-opacity"
          onClick={() => router.push("/")}
        >
          <NomosXLogo size="sm" variant="full" />
        </div>

        {/* Center nav */}
        <div className="hidden md:flex items-center gap-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href || (item.href !== "/dashboard" && pathname?.startsWith(item.href));
            return (
              <button
                key={item.href}
                onClick={() => router.push(item.href)}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-[13px] font-medium transition-all duration-200 ${
                  isActive
                    ? "text-white bg-white/[0.08]"
                    : "text-white/45 hover:text-white/75 hover:bg-white/[0.04]"
                }`}
              >
                <Icon size={14} className={isActive ? "text-indigo-400" : ""} />
                {item.label}
              </button>
            );
          })}
        </div>

        {/* Right side */}
        <div className="flex items-center gap-2">
          {BOTTOM_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = pathname?.startsWith(item.href);
            return (
              <button
                key={item.href}
                onClick={() => router.push(item.href)}
                className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-200 ${
                  isActive
                    ? "text-white bg-white/[0.08]"
                    : "text-white/30 hover:text-white/60 hover:bg-white/[0.04]"
                }`}
                title={item.label}
              >
                <Icon size={14} />
              </button>
            );
          })}
          <div className="w-px h-5 bg-white/[0.06] mx-1" />
          <button
            onClick={handleLogout}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white/25 hover:text-red-400/70 hover:bg-red-500/[0.06] transition-all duration-200"
            title="Sign out"
          >
            <LogOut size={14} />
          </button>
        </div>
      </div>
    </nav>
  );
}
