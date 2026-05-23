/**
 * GET /api/inquiry/[id]/foresight
 * Institutional foresight bundle for inquiry detail UI
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { publicPublicationWhere } from "@/lib/publication-visibility";
import {
  extractForesightFromPublicationMeta,
  extractForesightFromLineage,
  emptyForesight,
} from "@/lib/foresight";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    let publication = await prisma.thinkTankPublication.findFirst({
      where: publicPublicationWhere({ id }),
      select: {
        id: true,
        title: true,
        type: true,
        criticalLoopResult: true,
      },
    });

    if (!publication) {
      publication = await prisma.thinkTankPublication.findFirst({
        where: publicPublicationWhere({ publicId: id }),
        select: {
          id: true,
          title: true,
          type: true,
          criticalLoopResult: true,
        },
      });
    }

    if (!publication) {
      return NextResponse.json({ foresight: emptyForesight() }, { status: 404 });
    }

    const meta = (publication.criticalLoopResult ?? {}) as Record<string, unknown>;
    let bundle = extractForesightFromPublicationMeta(meta);

    if (!bundle.available && meta.briefId) {
      const brief = await prisma.brief.findUnique({
        where: { id: String(meta.briefId) },
        select: { lineage: true, question: true },
      });
      if (brief?.lineage) {
        bundle = extractForesightFromLineage(brief.lineage as Record<string, unknown>);
        bundle.question = brief.question;
      }
    }

    if (!bundle.question && meta.question) {
      bundle.question = String(meta.question);
    }

    return NextResponse.json({
      foresight: bundle,
      publicationId: publication.id,
      type: publication.type,
    });
  } catch (err: unknown) {
    console.error("[API/Foresight]", err);
    return NextResponse.json({ error: "Failed to load foresight" }, { status: 500 });
  }
}
