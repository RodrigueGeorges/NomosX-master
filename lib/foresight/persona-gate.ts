/**
 * Server-side persona validation for foresight chat
 */

import { prisma } from "@/lib/db";
import { publicPublicationWhere } from "@/lib/publication-visibility";
import { extractForesightFromPublicationMeta, extractForesightFromLineage } from "./adapter";
import type { ForesightPersonaSnapshot } from "./types";

export async function resolvePublicationPersona(
  publicationId: string,
  personaId: string
): Promise<{
  persona: ForesightPersonaSnapshot;
  question: string;
} | null> {
  let publication = await prisma.thinkTankPublication.findFirst({
    where: publicPublicationWhere({ id: publicationId }),
    select: { id: true, criticalLoopResult: true },
  });

  if (!publication) {
    publication = await prisma.thinkTankPublication.findFirst({
      where: publicPublicationWhere({ publicId: publicationId }),
      select: { id: true, criticalLoopResult: true },
    });
  }

  if (!publication) return null;

  const meta = (publication.criticalLoopResult ?? {}) as Record<string, unknown>;
  let bundle = extractForesightFromPublicationMeta(meta);

  if (!bundle.personas.length && meta.briefId) {
    const brief = await prisma.brief.findUnique({
      where: { id: String(meta.briefId) },
      select: { lineage: true, question: true },
    });
    if (brief?.lineage) {
      bundle = extractForesightFromLineage(brief.lineage as Record<string, unknown>);
      bundle.question = brief.question;
    }
  }

  const persona = bundle.personas.find((p) => p.id === personaId);
  if (!persona) return null;

  return {
    persona,
    question: bundle.question ?? String(meta.question ?? ""),
  };
}
