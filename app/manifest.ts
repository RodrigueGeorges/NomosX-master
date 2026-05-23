import { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'NomosX — The Autonomous Think Tank',
    short_name: 'NomosX',
    description:
      '22 PhD-calibrated AI researchers continuously scan 250M+ academic publications and publish source-grounded briefs autonomously.',
    start_url: '/',
    display: 'standalone',
    background_color: '#0A0A0B',
    theme_color: '#4A9EFF',
    icons: [
      {
        src: '/favicon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
      },
    ],
  };
}
