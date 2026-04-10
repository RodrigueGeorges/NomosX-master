import { Metadata } from 'next';
import Link from 'next/link';
import { NomosXLogo } from '@/components/brand/NomosXLogo';

export const metadata: Metadata = {
  title: 'Privacy Policy | NomosX',
  description: 'NomosX Privacy Policy — how we collect, use, and protect your data',
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[#09090b] text-white">
      <div className="max-w-3xl mx-auto px-6 py-16">
        {/* Header */}
        <div className="mb-12">
          <Link href="/" className="inline-block mb-8">
            <NomosXLogo size="sm" variant="full" />
          </Link>
          <p className="text-xs text-indigo-400/80 font-semibold tracking-[0.2em] uppercase mb-3">Legal</p>
          <h1 className="text-4xl font-light text-white mb-3">Privacy Policy</h1>
          <p className="text-sm text-white/40">Last updated: February 2026</p>
        </div>

        <div className="space-y-8 text-white/70 leading-relaxed text-sm">

          <section>
            <h2 className="text-lg font-medium text-white mb-3">1. Who We Are</h2>
            <p>
              NomosX SAS operates the NomosX platform at nomosx.com. We are committed to protecting
              your personal data in accordance with the GDPR and applicable French law.
              Data controller: NomosX SAS — contact:{' '}
              <a href="mailto:privacy@nomosx.com" className="text-indigo-400 hover:text-indigo-300">
                privacy@nomosx.com
              </a>
            </p>
          </section>

          <section>
            <h2 className="text-lg font-medium text-white mb-3">2. Data We Collect</h2>
            <ul className="space-y-2 list-disc list-inside text-white/60">
              <li><strong className="text-white/80">Account data:</strong> email address, name, hashed password</li>
              <li><strong className="text-white/80">Usage data:</strong> research queries, brief views, session activity</li>
              <li><strong className="text-white/80">Newsletter data:</strong> email address, subscription status, confirmation date</li>
              <li><strong className="text-white/80">Billing data:</strong> processed by Stripe — we do not store card numbers</li>
              <li><strong className="text-white/80">Technical data:</strong> IP address (for rate limiting), browser type</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-medium text-white mb-3">3. How We Use Your Data</h2>
            <ul className="space-y-2 list-disc list-inside text-white/60">
              <li>To provide and improve the Service</li>
              <li>To send transactional emails (account confirmation, weekly dispatch)</li>
              <li>To process subscription payments via Stripe</li>
              <li>To prevent abuse and enforce rate limits</li>
              <li>To comply with legal obligations</li>
            </ul>
            <p className="mt-3">
              We do not sell your data to third parties. We do not use your data to train AI models.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-medium text-white mb-3">4. Legal Basis (GDPR)</h2>
            <ul className="space-y-2 list-disc list-inside text-white/60">
              <li><strong className="text-white/80">Contract performance:</strong> account management, service delivery</li>
              <li><strong className="text-white/80">Consent:</strong> newsletter subscription (double opt-in)</li>
              <li><strong className="text-white/80">Legitimate interest:</strong> security, fraud prevention, analytics</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-medium text-white mb-3">5. Data Retention</h2>
            <p>
              Account data is retained for the duration of your account plus 3 years after deletion.
              Newsletter data is retained until you unsubscribe, then deleted within 30 days.
              Usage logs are retained for 12 months.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-medium text-white mb-3">6. Third-Party Services</h2>
            <ul className="space-y-2 list-disc list-inside text-white/60">
              <li><strong className="text-white/80">Resend</strong> — transactional email delivery</li>
              <li><strong className="text-white/80">Stripe</strong> — payment processing</li>
              <li><strong className="text-white/80">Neon</strong> — PostgreSQL database hosting (EU region)</li>
              <li><strong className="text-white/80">OpenAI</strong> — AI model inference (data not used for training)</li>
              <li><strong className="text-white/80">Sentry</strong> — error monitoring</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-medium text-white mb-3">7. Your Rights</h2>
            <p>Under GDPR, you have the right to:</p>
            <ul className="space-y-2 list-disc list-inside text-white/60 mt-2">
              <li>Access your personal data</li>
              <li>Rectify inaccurate data</li>
              <li>Request deletion ("right to be forgotten")</li>
              <li>Object to processing</li>
              <li>Data portability</li>
              <li>Withdraw consent at any time (newsletter: unsubscribe link in every email)</li>
            </ul>
            <p className="mt-3">
              To exercise these rights, email{' '}
              <a href="mailto:privacy@nomosx.com" className="text-indigo-400 hover:text-indigo-300">
                privacy@nomosx.com
              </a>. We respond within 30 days.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-medium text-white mb-3">8. Cookies</h2>
            <p>
              We use a single session cookie (<code className="text-indigo-300">nomosx-session</code>) for
              authentication. It is <code className="text-indigo-300">httpOnly</code>, <code className="text-indigo-300">secure</code>,
              and expires after 7 days. We do not use tracking or advertising cookies.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-medium text-white mb-3">9. Security</h2>
            <p>
              Passwords are hashed with bcrypt (12 rounds). All connections use TLS. API routes are
              protected with CSRF validation and rate limiting. We conduct regular security audits.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-medium text-white mb-3">10. Contact & Complaints</h2>
            <p>
              Data protection inquiries:{' '}
              <a href="mailto:privacy@nomosx.com" className="text-indigo-400 hover:text-indigo-300">
                privacy@nomosx.com
              </a>
              <br />
              You may also lodge a complaint with the CNIL (Commission Nationale de l'Informatique et des Libertés)
              at{' '}
              <a href="https://www.cnil.fr" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:text-indigo-300">
                cnil.fr
              </a>.
            </p>
          </section>
        </div>

        <div className="mt-12 pt-8 border-t border-white/10 flex gap-6 text-sm text-white/40">
          <Link href="/terms" className="hover:text-white/70 transition-colors">Terms of Service</Link>
          <Link href="/" className="hover:text-white/70 transition-colors">← Back to NomosX</Link>
        </div>
      </div>
    </div>
  );
}
