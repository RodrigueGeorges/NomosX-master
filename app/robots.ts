import { MetadataRoute } from 'next';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://nomosx.com';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/dashboard/', '/admin/', '/studio/', '/fr/studio/', '/council/', '/search/'],
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}
