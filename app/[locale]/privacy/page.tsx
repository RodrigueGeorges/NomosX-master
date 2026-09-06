import Link from 'next/link';
import { LegalPageShell } from '@/components/layout/LegalPageShell';
import { getTranslations } from 'next-intl/server';

export default async function PrivacyPage() {
  const t = await getTranslations('Privacy');
  return (

    <LegalPageShell>

        <div className="mb-12">

          <p className="nx-eyebrow mb-3">{t('legal')}</p>

          <h1 className="font-display text-4xl font-semibold text-black mb-3">{t('title')}</h1>

          <p className="text-sm text-black/55 font-mono">{t('lastUpdated')}</p>

        </div>



        <div className="space-y-8 text-black/80 leading-relaxed text-sm">



          <section>

            <h2 className="text-lg font-medium text-black mb-3">{t('s1Title')}</h2>

            <p>

              {t('s1Body')}

            </p>

          </section>



          <section>

            <h2 className="text-lg font-medium text-black mb-3">{t('s2Title')}</h2>

            <ul className="space-y-2 list-disc list-inside text-black/70">

              <li>{t('s2Account')}</li>

              <li>{t('s2Usage')}</li>

              <li>{t('s2Newsletter')}</li>

              <li>{t('s2Billing')}</li>

              <li>{t('s2Technical')}</li>

            </ul>

          </section>



          <section>

            <h2 className="text-lg font-medium text-black mb-3">{t('s3Title')}</h2>

            <ul className="space-y-2 list-disc list-inside text-black/70">

              <li>{t('s3Item1')}</li>

              <li>{t('s3Item2')}</li>

              <li>{t('s3Item3')}</li>

              <li>{t('s3Item4')}</li>

              <li>{t('s3Item5')}</li>

            </ul>

            <p className="mt-3">

              {t('s3Note')}

            </p>

          </section>



          <section>

            <h2 className="text-lg font-medium text-black mb-3">{t('s4Title')}</h2>

            <ul className="space-y-2 list-disc list-inside text-black/70">

              <li>{t('s4Contract')}</li>

              <li>{t('s4Consent')}</li>

              <li>{t('s4Legitimate')}</li>

            </ul>

          </section>



          <section>

            <h2 className="text-lg font-medium text-black mb-3">{t('s5Title')}</h2>

            <p>

              {t('s5Body')}

            </p>

          </section>



          <section>

            <h2 className="text-lg font-medium text-black mb-3">{t('s6Title')}</h2>

            <ul className="space-y-2 list-disc list-inside text-black/70">

              <li>{t('s6Resend')}</li>

              <li>{t('s6Stripe')}</li>

              <li>{t('s6Neon')}</li>

              <li>{t('s6OpenAI')}</li>

              <li>{t('s6Sentry')}</li>

            </ul>

          </section>



          <section>

            <h2 className="text-lg font-medium text-black mb-3">{t('s7Title')}</h2>

            <p>{t('s7Intro')}</p>

            <ul className="space-y-2 list-disc list-inside text-black/70 mt-2">

              <li>{t('s7Item1')}</li>

              <li>{t('s7Item2')}</li>

              <li>{t('s7Item3')}</li>

              <li>{t('s7Item4')}</li>

              <li>{t('s7Item5')}</li>

              <li>{t('s7Item6')}</li>

            </ul>

            <p className="mt-3">

              {t('s7Note')}

            </p>

          </section>



          <section>

            <h2 className="text-lg font-medium text-black mb-3">{t('s8Title')}</h2>

            <p>

              {t('s8Body')}

            </p>

          </section>



          <section>

            <h2 className="text-lg font-medium text-black mb-3">{t('s9Title')}</h2>

            <p>

              {t('s9Body')}

            </p>

          </section>



          <section>

            <h2 className="text-lg font-medium text-black mb-3">{t('s10Title')}</h2>

            <p>

              {t('s10Body')}

            </p>

          </section>

        </div>



        <div className="mt-12 pt-8 border-t border-black/[0.08] flex gap-6 text-sm text-black/55">

          <Link href="/terms" className="hover:text-black transition-colors">{t('termsLink')}</Link>

          <Link href="/" className="hover:text-black transition-colors">{t('backToNomosX')}</Link>

        </div>

    </LegalPageShell>

  );

}


