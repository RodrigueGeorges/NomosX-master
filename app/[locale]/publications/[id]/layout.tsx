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
        description: 'A published position by NomosX.',
      };
    }

    const pub = await res.json();
    const typeLabel = pub.type === 'STRATEGIC_REPORT' || pub.type === 'DOSSIER'
      ? 'Strategic Report'
      : 'Research Brief';

    const title = `${pub.title} | NomosX`;
    const description = pub.description || `A position by NomosX — ${typeLabel.toLowerCase()}.`;
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
      },
      twitter: {
        card: 'summary_large_image',
        title: pub.title,
        description,
      },
      alternates: {
        canonical: url,
      },
    };
  } catch {
    return {
      title: 'Research Brief | NomosX',
      description: 'A published position by NomosX.',
    };
  }
}

export default function PublicationLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
