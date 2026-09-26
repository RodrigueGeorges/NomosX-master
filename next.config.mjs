import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  serverExternalPackages: ['@prisma/client'],
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
