
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  serverExternalPackages: ['@prisma/client'],
  transpilePackages: ['three', '@react-three/fiber', '@react-three/drei'],
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
        source: '/executive-briefs',
        destination: '/articles',
        permanent: true,
      },
      {
        source: '/strategic-briefs',
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

export default nextConfig;
