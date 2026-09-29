import { prisma } from "@/lib/db";
import { publicPublicationWhere } from "@/lib/publication-visibility";

export interface PredictionWithBrief {
  id: string;
  claim: string;
  horizon: string;
  probability: number | null;
  confidence: string;
  resolutionCriteria: string;
  whatWouldFalsify: string;
  status: string;
  resolvedAt: Date | null;
  outcome: string | null;
  createdAt: Date;
  brief: { id: string; question: string; publicId: string | null } | null;
}

export async function fetchPredictions(options: {
  status?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<{ predictions: PredictionWithBrief[]; total: number }> {
  const { status, limit = 50, offset = 0 } = options;

  const where = status ? { status } : {};
  const [predictions, total] = await Promise.all([
    prisma.prediction.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
      include: {
        brief: { select: { id: true, question: true, publicId: true } },
      },
    }),
    prisma.prediction.count({ where }),
  ]);

  return { predictions: predictions as PredictionWithBrief[], total };
}

export async function fetchPredictionStats(): Promise<{
  total: number;
  open: number;
  confirmed: number;
  refuted: number;
  expired: number;
  superseded: number;
  accuracy: number;
}> {
  const [total, open, confirmed, refuted, expired, superseded] = await Promise.all([
    prisma.prediction.count(),
    prisma.prediction.count({ where: { status: "OPEN" } }),
    prisma.prediction.count({ where: { status: "CONFIRMED" } }),
    prisma.prediction.count({ where: { status: "REFUTED" } }),
    prisma.prediction.count({ where: { status: "EXPIRED" } }),
    prisma.prediction.count({ where: { status: "SUPERSEDED" } }),
  ]);

  const resolved = confirmed + refuted;
  const accuracy = resolved > 0 ? confirmed / resolved : 0;

  return { total, open, confirmed, refuted, expired, superseded, accuracy };
}

export interface DeskPrediction {
  id: string;
  claim: string;
  horizon: string;
  probability: number | null;
  confidence: string;
  status: string;
  resolvedAt: Date | null;
  outcome: string | null;
  createdAt: Date;
  /** The public inquiry that contains this call, when linked. */
  publication: { id: string; publicId: string | null; title: string } | null;
}

/**
 * Predictions attributable to a desk's domain: ThinkTankPublications carry
 * `criticalLoopResult.briefId` — the pipeline brief whose Prediction rows
 * were registered at publish time.
 */
export async function fetchDeskPredictions(verticalSlugs: string[], limit = 8): Promise<DeskPrediction[]> {
  if (!verticalSlugs.length) return [];
  try {
    const pubs = await prisma.thinkTankPublication.findMany({
      where: {
        ...publicPublicationWhere(),
        vertical: { is: { slug: { in: verticalSlugs } } },
      },
      orderBy: { publishedAt: "desc" },
      take: 60,
      select: { id: true, publicId: true, title: true, criticalLoopResult: true },
    });

    const briefToPub = new Map<string, { id: string; publicId: string | null; title: string }>();
    for (const p of pubs) {
      const briefId = (p.criticalLoopResult as Record<string, any> | null)?.briefId;
      if (typeof briefId === "string" && briefId) {
        briefToPub.set(briefId, { id: p.id, publicId: p.publicId ?? null, title: p.title });
      }
    }
    if (!briefToPub.size) return [];

    const preds = await prisma.prediction.findMany({
      where: { briefId: { in: [...briefToPub.keys()] } },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true, claim: true, horizon: true, probability: true,
        confidence: true, status: true, resolvedAt: true, outcome: true,
        createdAt: true, briefId: true,
      },
    });

    return preds.map((p) => ({
      id: p.id,
      claim: p.claim,
      horizon: p.horizon,
      probability: p.probability,
      confidence: p.confidence,
      status: p.status,
      resolvedAt: p.resolvedAt,
      outcome: p.outcome,
      createdAt: p.createdAt,
      publication: p.briefId ? briefToPub.get(p.briefId) ?? null : null,
    }));
  } catch (err) {
    console.warn("[predictions] fetchDeskPredictions failed:", err);
    return [];
  }
}
