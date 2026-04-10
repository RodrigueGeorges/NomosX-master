import { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'NomosX — The Autonomous Think Tank',
    short_name: 'NomosX',
    description: '22 PhD-calibrated AI researchers continuously scan 250M+ academic publications and publish source-grounded briefs autonomously.',
    start_url: '/',
    display: 'standalone',
    background_color: '#09090b',
    theme_color: '#6366f1',
    icons: [
      {
        src: '/favicon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
      },
    ],
  };
}
