import { Metadata } from 'next';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://nomosx.com';

export async function generateMetadata(
  { params }: { params: Promise<{ id: string }> }
): Promise<Metadata> {
  const { id } = await params;

  try {
    const res = await fetch(`${APP_URL}/api/public/publications/${id}`, {
      next: { revalidate: 3600 },
    });

    if (!res.ok) {
      return {
        title: 'Research Brief | NomosX',
        description: 'Peer-reviewed intelligence brief by the NomosX Autonomous Think Tank.',
      };
    }

    const pub = await res.json();
    const typeLabel = pub.type === 'STRATEGIC_REPORT' || pub.type === 'DOSSIER'
      ? 'Strategic Report'
      : 'Research Brief';

    const title = `${pub.title} | NomosX`;
    const description = pub.description || `A ${typeLabel.toLowerCase()} by the NomosX Think Tank.`;
    const url = `${APP_URL}/publications/${id}`;

    return {
      title,
      description,
      openGraph: {
        type: 'article',
        title: pub.title,
        description,
        url,
        siteName: 'NomosX',
        publishedTime: pub.publishedAt ?? undefined,
        tags: pub.vertical ? [pub.vertical, typeLabel] : [typeLabel],
        images: [
          {
            url: `${APP_URL}/og-default.svg`,
            width: 1200,
            height: 630,
            alt: pub.title,
          },
        ],
      },
      twitter: {
        card: 'summary_large_image',
        title: pub.title,
        description,
        images: [`${APP_URL}/og-default.png`],
      },
      alternates: {
        canonical: url,
      },
    };
  } catch {
    return {
      title: 'Research Brief | NomosX',
      description: 'Peer-reviewed intelligence brief by the NomosX Autonomous Think Tank.',
    };
  }
}

export default function PublicationLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
