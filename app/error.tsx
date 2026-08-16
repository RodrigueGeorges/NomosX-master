"use client";

import React from 'react';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Home, RefreshCw } from 'lucide-react';
import { NomosXLogo } from '@/components/brand/NomosXLogo';
import { LOGO_ERROR_CAP } from '@/lib/brand/logo-config';
import { nx } from '@/lib/brand/public-ui';
import { cn } from '@/lib/utils';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();
  const t = useTranslations();

  useEffect(() => {
    console.error("[NomosX Error Boundary]", error);
  }, [error]);

  return (
    <div className="min-h-screen bg-black flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <div className="flex items-center justify-center gap-3 mb-8">
          <NomosXLogo variant="wordmark" size={LOGO_ERROR_CAP} />
        </div>

        <h1 className="font-display text-2xl font-semibold text-white mb-3">
          {t("ErrorPage.title")}
        </h1>

        <p className={cn(nx.body, "mb-8")}>
          {t("ErrorPage.description")}
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button type="button" onClick={() => reset()} className={cn(nx.btnPrimary, "group")}>
            <RefreshCw size={16} />
            {t("ErrorPage.tryAgain")}
          </button>
          <button type="button" onClick={() => router.push("/")} className={nx.btnSecondary}>
            <Home size={16} />
            {t("ErrorPage.backToHome")}
          </button>
        </div>
      </div>
    </div>
  );
}
