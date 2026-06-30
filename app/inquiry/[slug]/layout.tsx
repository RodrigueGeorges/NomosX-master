import { Metadata } from "next";
import { prisma } from "@/lib/db";
import { publicPublicationWhere } from "@/lib/publication-visibility";
import { getPublicationFormat } from "@/lib/publication-formats";
import { inquiryUrl } from "@/lib/public-urls";

interface Props {
  params: Promise<{ slug: string }>;
  children: React.ReactNode;
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
  const canonical = inquiryUrl(article.id, true);

  let description = "";
  try {
    const rawHtml = (article.html || "")
      .replace(/^```html?\s*/i, "")
      .replace(/\s*```\s*$/, "")
      .trim();
    const firstParagraph = rawHtml.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
    if (firstParagraph) {
      description = firstParagraph[1]
        .replace(/<[^>]*>/g, "")
        .replace(/\[SRC-\d+\]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 200);
    }
  } catch {
    // ignore
  }

  if (!description) {
    description = `${format.label} by NomosX — source-grounded institute position with verified citations.`;
  }

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

export default function InquiryLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
