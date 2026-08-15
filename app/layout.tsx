import React from 'react';
import './globals.css';

/**
 * Root layout — pass-through.
 *
 * With next-intl, the `<html>` and `<body>` tags are rendered by
 * `app/[locale]/layout.tsx` so that `lang={locale}` can be set dynamically.
 *
 * This root layout exists to:
 * 1. Import global CSS (globals.css)
 * 2. Wrap all routes (including non-locale routes like API handlers)
 *
 * Routes that render HTML (pages) always go through `[locale]/layout.tsx`
 * which provides `<html>`, `<body>`, fonts, and providers.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
