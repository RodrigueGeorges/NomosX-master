import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { publicPublicationWhere } from '@/lib/publication-visibility';
import { getPublicationFormat } from '@/lib/publication-formats';

export const dynamic = 'force-dynamic';

function extractSummary(html: string): string {
  const raw = (html || '').replace(/^```html?\s*/i, '').replace(/\s*```\s*$/, '').trim();
  const sectionMatch = raw.match(/<section[^>]*id="?(?:executive-summary|key-findings)"?[^>]*>([\s\S]*?)<\/section>/i);
  const text = (sectionMatch ? sectionMatch[1] : raw).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  return text.slice(0, 500) + (text.length > 500 ? '…' : '');
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export async function GET(_req: NextRequest) {
  const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://nomosx.com';

  const publications = await prisma.thinkTankPublication.findMany({
    where: publicPublicationWhere(),
    orderBy: { publishedAt: 'desc' },
    take: 25,
    select: {
      id: true,
      title: true,
      html: true,
      type: true,
      publishedAt: true,
      trustScore: true,
    },
  }).catch(() => []);

  const now = new Date().toUTCString();

  const items = (publications as any[]).map((pub) => {
    const format = getPublicationFormat(pub.type);
    const summary = extractSummary(pub.html || '');
    const pubDate = pub.publishedAt ? new Date(pub.publishedAt).toUTCString() : now;
    const link = `${APP_URL}/articles/${pub.id}`;
    const trustLabel = pub.trustScore ? ` · Trust ${pub.trustScore}/100` : '';
    return `  <item>
    <title>${escapeXml(pub.title || 'Untitled')}</title>
    <link>${link}</link>
    <guid isPermaLink="true">${link}</guid>
    <pubDate>${pubDate}</pubDate>
    <category>${escapeXml(format.label)}</category>
    <description>${escapeXml(summary + trustLabel)}</description>
  </item>`;
  }).join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>NomosX — Council Publications</title>
    <link>${APP_URL}</link>
    <atom:link href="${APP_URL}/feed.xml" rel="self" type="application/rss+xml"/>
    <description>Peer-reviewed strategic intelligence from the NomosX autonomous think tank. 16-stage verification. Every source traced.</description>
    <language>en</language>
    <lastBuildDate>${now}</lastBuildDate>
    <ttl>60</ttl>
    <image>
      <url>${APP_URL}/favicon.svg</url>
      <title>NomosX</title>
      <link>${APP_URL}</link>
    </image>
${items}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=600',
    },
  });
}
