import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { publicPublicationWhere } from '@/lib/publication-visibility';
import { getPublicationFormat } from '@/lib/publication-formats';
import { inquiryUrl } from '@/lib/public-urls';

const SITE = process.env.NEXT_PUBLIC_APP_URL || 'https://nomosx.com';

export const revalidate = 3600;

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&');
}

function plainText(html: string, limit: number): string {
  const text = decodeEntities(
    decodeEntities(
      (html || '')
        .replace(/<head[\s\S]*?<\/head>/gi, ' ')
        .replace(/<div class="brief-meta"[\s\S]*?<\/div>/gi, ' ')
        .replace(/<figure[\s\S]*?<\/figure>/gi, ' ')
        .replace(/<h1[\s\S]*?<\/h1>/gi, ' '),
    ),
  )
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\[SRC-\d+\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > limit ? text.slice(0, limit - 1).trimEnd() + '…' : text;
}

/** GET /feed.xml — RSS 2.0 feed of public NomosX publications. */
export async function GET() {
  try {
    const articles = await prisma.thinkTankPublication.findMany({
      where: publicPublicationWhere(),
      orderBy: { publishedAt: 'desc' },
      take: 50,
      select: {
        id: true,
        publicId: true,
        title: true,
        html: true,
        type: true,
        publishedAt: true,
        vertical: { select: { name: true, nameEn: true } },
      },
    });

    const items = articles
      .map((a) => {
        const url = inquiryUrl(a.publicId || a.id, true);
        const format = getPublicationFormat(a.type).label;
        const domain = a.vertical?.nameEn || a.vertical?.name || '';
        const desc = plainText(a.html || '', 500);
        return `    <item>
      <title>${escapeXml(a.title || 'Untitled')}</title>
      <link>${escapeXml(url)}</link>
      <guid isPermaLink="true">${escapeXml(url)}</guid>
      <pubDate>${(a.publishedAt ?? new Date()).toUTCString()}</pubDate>
      <category>${escapeXml(format)}</category>${domain ? `
      <category>${escapeXml(domain)}</category>` : ''}
      <author>desk@nomosx.com (NomosX Research Desk)</author>
      <description>${escapeXml(desc)}</description>
    </item>`;
      })
      .join('\n');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>NomosX — Research Publications</title>
    <link>${SITE}</link>
    <atom:link href="${SITE}/feed.xml" rel="self" type="application/rss+xml" />
    <description>Institutional research from the NomosX Research Desk — verified briefs, memos and strategic reports.</description>
    <language>en</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${items}
  </channel>
</rss>`;

    return new NextResponse(xml, {
      headers: {
        'Content-Type': 'application/rss+xml; charset=utf-8',
        'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
      },
    });
  } catch (error) {
    console.error('[feed.xml] Error:', error);
    return new NextResponse('Feed unavailable', { status: 500 });
  }
}
