import { MetadataRoute } from 'next';
import { prisma } from '@/lib/db';
import { publicPublicationWhere } from '@/lib/publication-visibility';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://nomosx.com';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Static pages
  const staticPages: MetadataRoute.Sitemap = [
    { url: BASE_URL, lastModified: new Date(), changeFrequency: 'daily', priority: 1.0 },
    { url: `${BASE_URL}/about`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.8 },
    { url: `${BASE_URL}/methodology`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE_URL}/pricing`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.8 },
    { url: `${BASE_URL}/articles`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.9 },
    { url: `${BASE_URL}/researchers`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE_URL}/radar`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.8 },
    { url: `${BASE_URL}/privacy`, lastModified: new Date(), changeFrequency: 'yearly', priority: 0.3 },
    { url: `${BASE_URL}/terms`, lastModified: new Date(), changeFrequency: 'yearly', priority: 0.3 },
  ];

  // Dynamic article pages (ThinkTank publications)
  let articlePages: MetadataRoute.Sitemap = [];
  try {
    const articles = await prisma.thinkTankPublication.findMany({
      where: publicPublicationWhere(),
      select: { id: true, publishedAt: true },
      orderBy: { publishedAt: 'desc' },
      take: 500,
    });
    articlePages = articles.map((article) => ({
      url: `${BASE_URL}/articles/${article.id}`,
      lastModified: article.publishedAt ?? new Date(),
      changeFrequency: 'weekly' as const,
      priority: 0.6,
    }));
  } catch {
    // DB unavailable at build time — return static pages only
  }

  return [...staticPages, ...articlePages];
}
