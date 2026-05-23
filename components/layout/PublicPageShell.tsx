"use client";

import React from "react";
import PublicNav, { type PublicNavPage } from "@/components/PublicNav";
import SiteFooter from "@/components/SiteFooter";
import { EtherealBackground } from "@/components/signature";
import { cn } from "@/lib/utils";

interface PublicPageShellProps {
  children: React.ReactNode;
  currentPage?: PublicNavPage;
  onSignInClick?: () => void;
  isAuthenticated?: boolean;
  /** Hide footer on minimal pages */
  showFooter?: boolean;
  /** Particle count for background */
  particles?: number;
  className?: string;
  contentClassName?: string;
}

export function PublicPageShell({
  children,
  currentPage,
  onSignInClick = () => {},
  isAuthenticated,
  showFooter = true,
  particles = 18,
  className,
  contentClassName,
}: PublicPageShellProps) {
  return (
    <div className={cn("min-h-screen bg-bg text-text overflow-x-hidden relative", className)}>
      <EtherealBackground particleCount={particles} />
      <div className="relative z-10 flex flex-col min-h-screen">
        <PublicNav
          currentPage={currentPage}
          onSignInClick={onSignInClick}
          isAuthenticated={isAuthenticated}
        />
        <main className={cn("flex-1", contentClassName)}>{children}</main>
        {showFooter && <SiteFooter onSignInClick={onSignInClick} />}
      </div>
    </div>
  );
}
