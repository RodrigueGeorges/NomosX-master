"use client";

import Link from "next/link";

export default function UnsubscribedPage() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-6 py-24">
      <div className="max-w-md w-full text-center">
        <div className="w-12 h-12 rounded-full bg-bg-elevated border border-white/[0.08] flex items-center justify-center mx-auto mb-6">
          <span className="text-white/50 text-lg">✓</span>
        </div>
        <h1 className="font-display text-2xl font-semibold text-text mb-3">You&apos;ve been unsubscribed</h1>
        <p className="text-sm text-white/45 mb-8 leading-relaxed">
          You won&apos;t receive further emails from NomosX. You can re-subscribe anytime from the homepage.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/"
            className="px-6 py-2.5 rounded-xl bg-accent text-bg text-sm font-semibold hover:brightness-110"
          >
            Back to NomosX
          </Link>
          <Link
            href="/"
            className="px-6 py-2.5 rounded-xl border border-white/[0.10] text-white/60 text-sm hover:text-white"
          >
            Re-subscribe
          </Link>
        </div>
      </div>
    </div>
  );
}
