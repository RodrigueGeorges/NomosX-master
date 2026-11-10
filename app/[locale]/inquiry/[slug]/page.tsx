import { cache } from "react";
import type { Metadata } from "next";
import { fetchInquiryData } from "@/lib/queries/public-inquiry";
import { InquiryClient, InquiryNotFound } from "@/components/inquiry/InquiryClient";
import { parseEditorialInquiry } from "@/lib/brand/inquiry-html-parse";
import { inquiryUrl } from "@/lib/public-urls";
import { getPublicationFormat } from "@/lib/publication-formats";
import { setRequestLocale } from "next-intl/server";

interface PageProps {
  params: Promise<{ slug: string; locale: string }>;
}

// Deduped per request — generateMetadata and the page share one DB read.
const getInquiry = cache(fetchInquiryData);

function abstractOf(content: string, title: string): string {
  return (
    parseEditorialInquiry(content)?.lede ||
    content.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().substring(0, 400) ||
    title
  );
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug, locale } = await params;
  if (!/^[a-zA-Z0-9_-]+$/.test(slug)) return {};
  const { inquiry } = await getInquiry(slug, locale);
  if (!inquiry) return {};

  const canonical = inquiryUrl(inquiry.publicId || inquiry.id, true);
  const description = abstractOf(inquiry.content, inquiry.title);
  const published = inquiry.publishedAt.slice(0, 10); // YYYY-MM-DD

  return {
    title: `${inquiry.title} — NomosX`,
    description,
    alternates: { canonical },
    openGraph: {
      title: inquiry.title,
      description,
      type: "article",
      publishedTime: inquiry.publishedAt,
      modifiedTime: (inquiry as { correctedAt?: string }).correctedAt ?? inquiry.publishedAt,
      authors: ["NomosX Research Desk"],
      section: inquiry.domain && inquiry.domain !== "general" ? inquiry.domain : undefined,
      tags: inquiry.topics,
      siteName: "NomosX",
    },
    other: {
      // Highwire / Google Scholar meta — the academic indexing surface.
      citation_title: inquiry.title,
      citation_author: "NomosX Research Desk",
      citation_publication_date: published,
      citation_online_date: published,
      citation_journal_title: "NomosX",
      citation_language: locale === "fr" ? "fr" : "en",
      citation_abstract_html_url: canonical,
      citation_pdf_url: `${inquiryUrl(inquiry.publicId || inquiry.id, true).replace("/inquiry/", "/api/articles/")}/export/pdf`,
      citation_keywords: inquiry.topics,
      citation_technical_report_institution: "NomosX",
      citation_technical_report_number: inquiry.publicId || inquiry.id,
    },
  };
}

export default async function InquiryPage({ params }: PageProps) {
  const { slug, locale } = await params;

  // Enable static rendering for this locale
  setRequestLocale(locale);

  if (!/^[a-zA-Z0-9_-]+$/.test(slug)) {
    return <InquiryNotFound />;
  }

  const { inquiry, related } = await getInquiry(slug, locale);

  if (!inquiry) {
    return <InquiryNotFound />;
  }

  // ScholarlyArticle JSON-LD — the scholar/citation surface (Google Scholar,
  // Zotero auto-detect, reference managers). Server-rendered so crawlers see it.
  const abstractText = abstractOf(inquiry.content, inquiry.title);
  const correctedAt = (inquiry as { correctedAt?: string }).correctedAt;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ScholarlyArticle",
    headline: inquiry.title,
    abstract: abstractText,
    description: abstractText,
    datePublished: inquiry.publishedAt,
    dateModified: correctedAt ?? inquiry.publishedAt,
    wordCount: inquiry.readTime * 200,
    author: { "@type": "Organization", name: "NomosX Research Desk", url: "https://nomosx.com/desk" },
    publisher: {
      "@type": "Organization",
      name: "NomosX",
      logo: { "@type": "ImageObject", url: "https://nomosx.com/favicon.svg" },
    },
    isPartOf: { "@type": "Periodical", name: "NomosX", url: "https://nomosx.com" },
    about: inquiry.domain && inquiry.domain !== "general" ? inquiry.domain : undefined,
    mainEntityOfPage: { "@type": "WebPage", "@id": inquiryUrl(inquiry.publicId || inquiry.id, true) },
    keywords: inquiry.topics?.join(", "),
    articleSection: inquiry.format?.label ?? getPublicationFormat(inquiry.type as never).label,
    image: inquiry.heroImageUrl ?? undefined,
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
      />
      <InquiryClient inquiry={inquiry} related={related} />
    </>
  );
}
