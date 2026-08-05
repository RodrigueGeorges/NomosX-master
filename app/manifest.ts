import { MetadataRoute } from 'next';
import {
  BRAND_MANIFEST_DESCRIPTION,
  BRAND_NAME,
  BRAND_TITLE,
} from '@/lib/brand/public-copy';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: BRAND_TITLE,
    short_name: BRAND_NAME,
    description: BRAND_MANIFEST_DESCRIPTION,
    start_url: '/',
    display: 'standalone',
    categories: ['news', 'education', 'productivity'],
    background_color: '#000000',
    theme_color: '#000000',
    icons: [
      {
        src: '/favicon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
      },
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  };
}
