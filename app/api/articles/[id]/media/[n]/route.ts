import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { publicPublicationWhere } from '@/lib/publication-visibility';

const DATA_URI_RE = /src="data:(image\/[a-zA-Z0-9.+-]+);base64,([^"]+)"/g;

/**
 * GET /api/articles/[id]/media/[n]
 *
 * Serves the n-th base64-embedded image of a public publication. The page's
 * HTML rewrites `src="data:image/…"` into these URLs at render time so the
 * article payload stays light; the bytes are decoded on demand here and are
 * immutable per index (published HTML is append-only), hence cache forever.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; n: string }> },
) {
  try {
    const { id, n } = await params;
    const index = Number.parseInt(n, 10);
    if (!Number.isInteger(index) || index < 0 || index > 500) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const article = await prisma.thinkTankPublication.findFirst({
      where: publicPublicationWhere({ OR: [{ id }, { publicId: id }] }),
      select: { html: true },
    });
    if (!article?.html) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const matches = Array.from(article.html.matchAll(DATA_URI_RE));
    const match = matches[index];
    if (!match) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const body = Buffer.from(match[2], 'base64');
    return new NextResponse(new Uint8Array(body), {
      headers: {
        'Content-Type': match[1],
        'Content-Length': String(body.byteLength),
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (error) {
    console.error('[media] Error:', error);
    return NextResponse.json({ error: 'Media unavailable' }, { status: 500 });
  }
}
