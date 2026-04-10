import { Metadata } from 'next';
import Link from 'next/link';
import { NomosXLogo } from '@/components/brand/NomosXLogo';

export const metadata: Metadata = {
  title: 'Unsubscribed | NomosX',
};

export default function UnsubscribedPage() {
  return (
    <div className="min-h-screen bg-[#09090b] text-white flex items-center justify-center px-6">
      <div className="max-w-md w-full text-center">
        <div className="mb-8 flex justify-center">
          <NomosXLogo size="md" variant="full" />
        </div>

        <div className="w-12 h-12 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mx-auto mb-6">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/60">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </div>

        <h1 className="text-2xl font-light text-white mb-3">You've been unsubscribed.</h1>
        <p className="text-sm text-white/50 mb-8 leading-relaxed">
          You won't receive any more emails from NomosX.<br />
          Changed your mind? You can re-subscribe at any time.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/"
            className="px-6 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors"
          >
            Back to NomosX
          </Link>
          <Link
            href="/#newsletter"
            className="px-6 py-2.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-white/70 text-sm font-medium transition-colors"
          >
            Re-subscribe
          </Link>
        </div>
      </div>
    </div>
  );
}
