import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Temporal must never be bundled: @temporalio/worker ships a webpack/swc
  // workflow bundler with native deps — Turbopack tracing it breaks the build
  // (missing loader-utils) even though every import is dynamic and the code
  // only runs in the in-process worker, never in route handlers.
  serverExternalPackages: [
    '@prisma/client',
    '@temporalio/activity',
    '@temporalio/client',
    '@temporalio/common',
    '@temporalio/worker',
    '@temporalio/workflow',
  ],
  // Dev preview proxies reach the server from 127.0.0.1 — allow dev assets.
  allowedDevOrigins: ['127.0.0.1', 'localhost'],
  transpilePackages: [],
  experimental: {
    viewTransition: true,
  },
  images: {
    formats: ['image/avif', 'image/webp'],
  },
  async redirects() {
    return [
      {
        source: '/briefs',
        destination: '/archives',
        permanent: true,
      },
      {
        source: '/publications',
        destination: '/archives',
        permanent: true,
      },
      {
        source: '/articles',
        destination: '/archives',
        permanent: true,
      },
      {
        source: '/executive-briefs',
        destination: '/archives',
        permanent: true,
      },
      {
        source: '/strategic-briefs',
        destination: '/archives',
        permanent: true,
      },
      {
        source: '/brief/:path*',
        destination: '/inquiry/:path*',
        permanent: true,
      },
      {
        source: '/publications/:path*',
        destination: '/inquiry/:path*',
        permanent: true,
      },
      {
        source: '/articles/:path*',
        destination: '/inquiry/:path*',
        permanent: true,
      },
      {
        source: '/council',
        destination: '/studio',
        permanent: true,
      },
      {
        source: '/council/:path*',
        destination: '/studio',
        permanent: true,
      },
    ];
  },
};

export default withNextIntl(nextConfig);
