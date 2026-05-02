import { Metadata } from 'next';
import { prisma } from '@/lib/db';
import { publicPublicationWhere } from '@/lib/publication-visibility';
import { getPublicationFormat } from '@/lib/publication-formats';

interface Props {
  params: Promise<{ id: string }>;
  children: React.ReactNode;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;

  if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
    return {};
  }

  const article = await prisma.thinkTankPublication.findFirst({
    where: publicPublicationWhere({ id }),
    select: {
      id: true,
      title: true,
      html: true,
      type: true,
      publishedAt: true,
    },
  }).catch(() => null);

  if (!article) {
    return {
      title: 'Article not found',
    };
  }

  const format = getPublicationFormat(article.type);
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://nomosx.com';
  const articleUrl = `${baseUrl}/articles/${article.id}`;

  // Extract a plain-text summary from HTML for description
  let description = '';
  try {
    const rawHtml = (article.html || '').replace(/^```html?\s*/i, '').replace(/\s*```\s*$/, '').trim();
    const firstParagraph = rawHtml.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
    if (firstParagraph) {
      description = firstParagraph[1]
        .replace(/<[^>]*>/g, '')
        .replace(/\[SRC-\d+\]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 200);
    }
  } catch {
    // ignore
  }

  if (!description) {
    description = `${format.label} by NomosX Autonomous Think Tank — source-grounded research with verified citations.`;
  }

  return {
    title: article.title,
    description,
    openGraph: {
      type: 'article',
      title: article.title,
      description,
      url: articleUrl,
      siteName: 'NomosX',
      publishedTime: article.publishedAt?.toISOString(),
      authors: ['NomosX Think Tank'],
    },
    twitter: {
      card: 'summary_large_image',
      title: article.title,
      description,
    },
    alternates: {
      canonical: articleUrl,
    },
  };
}

export default function ArticleLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
