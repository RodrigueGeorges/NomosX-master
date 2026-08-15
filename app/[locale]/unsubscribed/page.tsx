"use client";

import Link from "next/link";
import { nx } from "@/lib/brand/public-ui";

export default function UnsubscribedPage() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-6 py-24 bg-black">
      <div className="max-w-md w-full text-center">
        <div className="w-12 h-12 nx-public-surface flex items-center justify-center mx-auto mb-6">
          <span className="text-white/50 text-lg">✓</span>
        </div>
        <h1 className="font-display text-2xl font-semibold text-white mb-3">You&apos;ve been unsubscribed</h1>
        <p className="text-sm text-white/45 mb-8 leading-relaxed">
          You won&apos;t receive further emails from NomosX. You can re-subscribe anytime from the homepage.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link href="/" className={nx.btnPrimary}>
            Back to NomosX
          </Link>
          <Link href="/#newsletter" className={nx.btnSecondary}>
            Re-subscribe
          </Link>
        </div>
      </div>
    </div>
  );
}
