"use client";

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { nx } from "@/lib/brand/public-ui";

export default function UnsubscribedPage() {
  const t = useTranslations();
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-6 py-24 bg-white dark:bg-black">
      <div className="max-w-md w-full text-center">
        <div className="w-12 h-12 nx-public-surface flex items-center justify-center mx-auto mb-6">
          <span className="text-black/50 dark:text-white/50 text-lg">✓</span>
        </div>
        <h1 className="font-display text-2xl font-semibold text-black dark:text-white mb-3">{t('Unsubscribed.title')}</h1>
        <p className="text-sm text-black/45 dark:text-white/45 mb-8 leading-relaxed">
          {t('Unsubscribed.description')}
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link href="/" className={nx.btnPrimary}>
            {t('Unsubscribed.backToNomosX')}
          </Link>
          <Link href="/#newsletter" className={nx.btnSecondary}>
            {t('Unsubscribed.resubscribe')}
          </Link>
        </div>
      </div>
    </div>
  );
}
