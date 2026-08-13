import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { withRateLimit, rateLimitConfigs, commonSchemas } from '@/lib/validation';
import { publicPublicationWhere } from '@/lib/publication-visibility';
import { getPublicationFormat } from '@/lib/publication-formats';
import { buildReportWorkbook, buildSourcesCSV, type ReportExportData, type ExportPrediction } from '@/lib/export/report-workbook';

/**
 * GET /api/articles/[id]/export/data?format=xlsx|csv
 *
 * Structured data export of a publication:
 * - xlsx: Report metadata + analysis text + source register + claims + predictions + model sheets
 * - csv:  source register alone
 *
 * Complements the HTML export (../export) with analyst-grade, reusable files.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withRateLimit(
    rateLimitConfigs.api,
    async (req) => {
      try {
        const session = await getSession();
        if (!session?.id) {
          return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
        }

        const { id } = await params;
        const idValidation = commonSchemas.id.safeParse({ id });
        if (!idValidation.success) {
          return NextResponse.json({ error: 'Invalid article ID format' }, { status: 400 });
        }

        const format = (req.nextUrl.searchParams.get('format') || 'xlsx').toLowerCase();
        if (!['xlsx', 'csv'].includes(format)) {
          return NextResponse.json({ error: 'format must be xlsx or csv' }, { status: 400 });
        }

        const article = await prisma.thinkTankPublication.findFirst({
          where: publicPublicationWhere({ id: idValidation.data.id }),
          select: {
            id: true, title: true, type: true, publishedAt: true, sourceIds: true,
            trustScore: true, html: true, draftId: true,
          },
        });
        if (!article) {
          return NextResponse.json({ error: 'Article not found' }, { status: 404 });
        }

        // Fetch sources, claims, and predictions in parallel
        const [sources, claims, draft] = await Promise.all([
          article.sourceIds.length
            ? prisma.source.findMany({
                where: { id: { in: article.sourceIds } },
                select: {
                  id: true, provider: true, title: true, year: true, doi: true, url: true,
                  qualityScore: true, noveltyScore: true, citationCount: true, issuer: true, documentType: true,
                },
              })
            : Promise.resolve([]),
          prisma.thinkTankClaim.findMany({
            where: { publicationId: article.id },
            select: {
              text: true, claimType: true, section: true, confidence: true,
              citations: true, hasContradiction: true, contradictedBy: true,
            },
            orderBy: { section: 'asc' },
          }),
          article.draftId
            ? prisma.draft.findUnique({
                where: { id: article.draftId },
                select: { question: true },
              })
            : Promise.resolve(null),
        ]);

        // Best-effort: find predictions linked to a Brief with the same question
        let predictions: ExportPrediction[] = [];
        if (draft?.question) {
          try {
            const brief = await prisma.brief.findFirst({
              where: { question: draft.question },
              select: { id: true },
            });
            if (brief) {
              const preds = await prisma.prediction.findMany({
                where: { briefId: brief.id },
                select: {
                  claim: true, horizon: true, probability: true, confidence: true,
                  status: true, resolutionCriteria: true, createdAt: true, resolvedAt: true, outcome: true,
                },
                orderBy: { createdAt: 'desc' },
              });
              predictions = preds;
            }
          } catch {
            // Non-blocking — predictions are a bonus, not critical
          }
        }

        // Preserve the report's [SRC-N] ordering
        const byId = new Map(sources.map((s) => [s.id, s]));
        const ordered = article.sourceIds.map((sid) => byId.get(sid)).filter((s): s is NonNullable<typeof s> => !!s);

        const data: ReportExportData = {
          id: article.id,
          title: article.title,
          formatLabel: getPublicationFormat(article.type).label,
          publishedAt: article.publishedAt,
          trustScore: article.trustScore,
          question: draft?.question ?? null,
          html: article.html,
          sources: ordered,
          claims,
          predictions,
        };

        const safeName = article.title.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 60);

        if (format === 'csv') {
          // UTF-8 BOM for Excel French locale compatibility (accents render correctly)
          const csv = '\uFEFF' + buildSourcesCSV(data);
          return new NextResponse(csv, {
            status: 200,
            headers: {
              'Content-Type': 'text/csv; charset=utf-8',
              'Content-Disposition': `attachment; filename="nomosx-${safeName}-sources.csv"`,
              'Cache-Control': 'private, no-store',
            },
          });
        }

        const workbook = await buildReportWorkbook(data);
        return new NextResponse(new Uint8Array(workbook), {
          status: 200,
          headers: {
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition': `attachment; filename="nomosx-${safeName}.xlsx"`,
            'Cache-Control': 'private, no-store',
          },
        });
      } catch (error: unknown) {
        console.error('[API/Articles/ExportData] Error:', error);
        return NextResponse.json({ error: 'Export failed' }, { status: 500 });
      }
    }
  )(req);
}
