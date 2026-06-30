import { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'NomosX — The Agentic Think Tank',
    short_name: 'NomosX',
    description:
      'Probable futures. Decisions owned. Evidence verified. Agentic cross-domain foresight with probabilistic institute positions.',
    start_url: '/',
    display: 'standalone',
    background_color: '#000000',
    theme_color: '#FFFFFF',
    icons: [
      {
        src: '/favicon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
      },
    ],
  };
}
