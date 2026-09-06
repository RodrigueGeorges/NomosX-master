import React from 'react';
import Link from 'next/link';

/**
 * Root 404 — rendered when a URL doesn't match any locale.
 * This is outside the [locale] segment, so it needs its own <html>/<body>.
 * Kept minimal (no nav, no providers) to avoid depending on i18n context.
 */
export default function RootNotFound() {
  return (
    <html lang="en">
      <body className="bg-white text-black min-h-screen flex items-center justify-center">
        <div className="text-center max-w-md px-6 py-24">
          <p className="font-mono text-8xl font-light text-black/20 tabular-nums mb-4">
            404
          </p>
          <h1 className="text-2xl font-semibold mb-3">Page not found</h1>
          <p className="text-sm text-black/45 mb-8 leading-relaxed">
            The page you are looking for does not exist or has been moved.
          </p>
          <Link
            href="/"
            className="inline-flex items-center justify-center px-6 py-3 bg-black text-white text-sm font-semibold hover:bg-black/85"
          >
            Back to home
          </Link>
        </div>
      </body>
    </html>
  );
}
