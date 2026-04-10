
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ['@prisma/client'],
  images: {
    formats: ['image/avif', 'image/webp'],
  },
  async redirects() {
    return [
      {
        source: '/briefs',
        destination: '/articles',
        permanent: true,
      },
      {
        source: '/publications', 
        destination: '/articles',
        permanent: true,
      },
      {
        source: '/brief/:path*',
        destination: '/articles/:path*',
        permanent: true,
      },
      {
        source: '/publications/:path*',
        destination: '/articles/:path*',
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
