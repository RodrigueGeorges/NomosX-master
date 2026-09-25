import { Metadata } from "next";
import type { ReactNode } from "react";
import { prisma } from "@/lib/db";
import { publicPublicationWhere } from "@/lib/publication-visibility";
import { getPublicationFormat } from "@/lib/publication-formats";
import { inquiryUrl } from "@/lib/public-urls";
import { BreadcrumbJsonLd, ArticleJsonLd } from "@/components/seo/JsonLd";

interface Props {
  params: Promise<{ slug: string }>;
  children: React.ReactNode;
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://nomosx.com';

/**
 * Meta description from the editorial lede (key judgment / summary block) —
 * falls back to the first generic <p>. Strips tags and citation markers.
 */
function extractDescription(html: string | null | undefined): string {
  try {
    const rawHtml = (html || "")
      .replace(/^```html?\s*/i, "")
      .replace(/\s*```\s*$/, "")
      .trim();
    const lede =
      rawHtml.match(/<li[^>]*class="[^"]*(?:key-judgment|in-brief)[^"]*"[^>]*>([\s\S]*?)<\/li>/i) ??
      rawHtml.match(/<(?:p|div)[^>]*class="[^"]*(?:lede|dek|standfirst|summary|abstract)[^"]*"[^>]*>([\s\S]*?)<\/(?:p|div)>/i) ??
      rawHtml.match(/<ol[^>]*class="[^"]*key-judgments[^"]*"[^>]*>\s*<li[^>]*>([\s\S]*?)<\/li>/i) ??
      rawHtml.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
    return lede
      ? lede[1]
          .replace(/<[^>]*>/g, "")
          .replace(/\[(?:SRC|E)-\d+\]/g, "")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 200)
      : "";
  } catch {
    return "";
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;

  if (!/^[a-zA-Z0-9_-]+$/.test(slug)) {
    return {};
  }

  const article = await prisma.thinkTankPublication
    .findFirst({
      where: publicPublicationWhere({ OR: [{ id: slug }, { publicId: slug }] }),
      select: {
        id: true,
        publicId: true,
        title: true,
        html: true,
        type: true,
        publishedAt: true,
      },
    })
    .catch(() => null);

  if (!article) {
    return { title: "Inquiry not found" };
  }

  const format = getPublicationFormat(article.type);
  const canonical = inquiryUrl(article.publicId ?? article.id, true);
  const description = extractDescription(article.html)
    || `${format.label} by NomosX — source-grounded institute position with verified citations.`;

  return {
    title: article.title,
    description,
    openGraph: {
      type: "article",
      title: article.title ?? undefined,
      description,
      url: canonical,
      siteName: "NomosX",
      publishedTime: article.publishedAt?.toISOString(),
      authors: ["NomosX"],
    },
    twitter: {
      card: "summary_large_image",
      title: article.title ?? undefined,
      description,
    },
    alternates: { canonical },
  };
}

export default async function InquiryLayout({ params, children }: Props) {
  const { slug } = await params;

  let breadcrumbItems: Array<{ name: string; url: string }> = [];

  let articleLd: ReactNode = null;

  if (/^[a-zA-Z0-9_-]+$/.test(slug)) {
    const article = await prisma.thinkTankPublication
      .findFirst({
        where: publicPublicationWhere({ OR: [{ id: slug }, { publicId: slug }] }),
        select: { id: true, publicId: true, title: true, publishedAt: true, wordCount: true, heroImageUrl: true, html: true },
      })
      .catch(() => null);

    if (article) {
      const canonical = inquiryUrl(article.publicId ?? article.id, true);
      breadcrumbItems = [
        { name: 'NomosX', url: APP_URL },
        { name: 'Briefs', url: `${APP_URL}/archives` },
        { name: article.title || 'Inquiry', url: canonical },
      ];
      articleLd = (
        <ArticleJsonLd
          title={article.title || 'Inquiry'}
          description={extractDescription(article.html)}
          url={canonical}
          publishedAt={article.publishedAt?.toISOString()}
          wordCount={article.wordCount ?? undefined}
          imageUrl={article.heroImageUrl ?? undefined}
        />
      );
    }
  }

  return (
    <>
      {articleLd}
      {breadcrumbItems.length > 0 && <BreadcrumbJsonLd items={breadcrumbItems} />}
      {children}
    </>
  );
}
