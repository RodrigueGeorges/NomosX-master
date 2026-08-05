import { prisma } from "@/lib/db";

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
