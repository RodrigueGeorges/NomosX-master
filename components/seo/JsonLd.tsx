import React from 'react';
import Script from 'next/script';

interface JsonLdProps {
  data: Record<string, unknown>;
}

export function JsonLd({ data }: JsonLdProps) {
  return (
    <Script
      id={`jsonld-${(data['@type'] as string) || 'data'}`}
      type="application/ld+json"
      strategy="afterInteractive"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

export function BreadcrumbJsonLd({ items }: { items: Array<{ name: string; url: string }> }) {
  return (
    <JsonLd
      data={{
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: items.map((item, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          name: item.name,
          item: item.url,
        })),
      }}
    />
  );
}

export function ArticleJsonLd({
  title,
  description,
  url,
  publishedAt,
  wordCount,
  imageUrl,
}: {
  title: string;
  description: string;
  url: string;
  publishedAt?: string;
  wordCount?: number;
  imageUrl?: string;
}) {
  return (
    <JsonLd
      data={{
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: title.slice(0, 110),
        description,
        url,
        ...(publishedAt ? { datePublished: publishedAt, dateModified: publishedAt } : {}),
        ...(wordCount ? { wordCount } : {}),
        ...(imageUrl ? { image: [imageUrl] } : {}),
        author: { '@type': 'Organization', name: 'NomosX', url: 'https://nomosx.com' },
        publisher: {
          '@type': 'Organization',
          name: 'NomosX',
          url: 'https://nomosx.com',
        },
        isAccessibleForFree: true,
      }}
    />
  );
}

export function FaqJsonLd({ items }: { items: Array<{ q: string; a: string }> }) {
  return (
    <JsonLd
      data={{
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: items.map((item) => ({
          '@type': 'Question',
          name: item.q,
          acceptedAnswer: {
            '@type': 'Answer',
            text: item.a,
          },
        })),
      }}
    />
  );
}
