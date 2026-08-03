"use client";

import React from "react";
import PublicNav, { type PublicNavPage } from "@/components/PublicNav";
import SiteFooter from "@/components/SiteFooter";
import { EtherealBackground } from "@/components/signature";
import { ScrollProgress } from "@/components/ui/ScrollProgress";
import { CursorGlow } from "@/components/ui/CursorGlow";
import { GrainOverlay } from "@/components/ui/GrainOverlay";
import { cn } from "@/lib/utils";

interface PublicPageShellProps {
  children: React.ReactNode;
  currentPage?: PublicNavPage;
  onSignInClick?: () => void;
  isAuthenticated?: boolean;
  showFooter?: boolean;
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
  particles = 0,
  className,
  contentClassName,
}: PublicPageShellProps) {
  return (
    <div className={cn("min-h-screen bg-black text-text overflow-x-hidden relative", className)}>
      {/* Atmospheric layers — subtle, cohesive, alive */}
      <GrainOverlay />
      <CursorGlow />
      <div className="nx-vignette" aria-hidden="true" />
      <ScrollProgress />
      {particles > 0 && <EtherealBackground particleCount={particles} radialGlow={false} />}
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
