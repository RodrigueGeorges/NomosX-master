import Link from 'next/link';
import { LegalPageShell } from '@/components/layout/LegalPageShell';
import { getTranslations } from 'next-intl/server';

export default async function TermsPage() {
  const t = await getTranslations('Terms');
  return (
    <LegalPageShell>
      <div className="mb-12">
        <p className="nx-eyebrow mb-3">{t('legal')}</p>
        <h1 className="font-display text-4xl font-semibold text-black mb-3">{t('title')}</h1>
        <p className="text-sm text-black/55 font-mono">{t('lastUpdated')}</p>
      </div>

      <div className="space-y-8 text-black/80 leading-relaxed text-sm">
        <section>
          <h2 className="text-lg font-medium text-text mb-3">{t('s1Title')}</h2>
          <p>{t('s1Body')}</p>
        </section>

        <section>
          <h2 className="text-lg font-medium text-text mb-3">{t('s2Title')}</h2>
          <p>{t('s2Body')}</p>
        </section>

        <section>
          <h2 className="text-lg font-medium text-text mb-3">{t('s3Title')}</h2>
          <p>{t('s3Body')}</p>
        </section>

        <section>
          <h2 className="text-lg font-medium text-text mb-3">{t('s4Title')}</h2>
          <p>{t('s4Body')}</p>
        </section>

        <section>
          <h2 className="text-lg font-medium text-text mb-3">{t('s5Title')}</h2>
          <p>{t('s5Body')}</p>
        </section>

        <section>
          <h2 className="text-lg font-medium text-text mb-3">{t('s6Title')}</h2>
          <p>{t('s6Body')}</p>
        </section>

        <section>
          <h2 className="text-lg font-medium text-text mb-3">{t('s7Title')}</h2>
          <p>{t('s7Body')}</p>
        </section>
      </div>

      <div className="mt-12 pt-8 border-t border-black/[0.08] flex gap-6 text-sm text-black/55">
        <Link href="/privacy" className="hover:text-black transition-colors">{t('privacyLink')}</Link>
        <Link href="/" className="hover:text-black transition-colors">{t('backToNomosX')}</Link>
      </div>
    </LegalPageShell>
  );
}
