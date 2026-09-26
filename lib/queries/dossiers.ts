/**
 * Dossier watch queries — "dossiers suivis" page data.
 *
 * A dossier is an analyzed subject NomosX keeps watching: the Brief that
 * originated open predictions plus every UPDATE_NOTE follow-up triggered
 * when the world matched a falsification trigger (Sprint 28 P2/7).
 *
 * Linkage chain:
 *   UPDATE_NOTE publication → signalId → Signal(PREDICTION_TRIGGER,
 *   summary contains "[PRED:<predictionId>]") → Prediction → briefId.
 */

import { prisma } from '@/lib/db';
import { publicPublicationWhere } from '@/lib/publication-visibility';

export interface DossierPrediction {
  id: string;
  claim: string;
  horizon: string;
  probability: number | null;
  confidence: string;
  whatWouldFalsify: string;
  status: string;
}

export interface DossierUpdate {
  id: string;
  publicId: string | null;
  title: string;
  publishedAt: Date | null;
  trustScore: number | null;
}

export interface WatchedDossier {
  briefId: string;
  question: string;
  briefPublicId: string | null;
  publishedAt: Date | null;
  openPredictions: DossierPrediction[];
  totalPredictions: number;
  updates: DossierUpdate[];
  lastActivity: Date;
}

const PRED_MARKER = /\[PRED:([^\]]+)\]/;

export async function fetchWatchedDossiers(limit = 30): Promise<WatchedDossier[]> {
  try {
    // 1. Predictions we are tracking (OPEN or recently resolved — the
    //    dossier stays on the page as long as updates keep landing).
    const predictions = await prisma.prediction.findMany({
      where: { briefId: { not: null } },
      orderBy: { createdAt: 'desc' },
      take: 300,
      select: {
        id: true,
        briefId: true,
        claim: true,
        horizon: true,
        probability: true,
        confidence: true,
        whatWouldFalsify: true,
        status: true,
        createdAt: true,
        brief: { select: { id: true, question: true, publicId: true, publishedAt: true } },
      },
    });

    // 2. Published UPDATE_NOTE publications → parent prediction via the
    //    [PRED:<id>] marker embedded in the trigger signal's summary.
    const updateNotes = await prisma.thinkTankPublication.findMany({
      where: publicPublicationWhere({ type: 'UPDATE_NOTE' }),
      orderBy: { publishedAt: 'desc' },
      take: 200,
      select: {
        id: true,
        publicId: true,
        title: true,
        publishedAt: true,
        trustScore: true,
        signal: { select: { summary: true } },
      },
    });

    // predictionId → its UPDATE_NOTE publications
    const updatesByPrediction = new Map<string, DossierUpdate[]>();
    for (const note of updateNotes) {
      const predId = PRED_MARKER.exec(note.signal?.summary ?? '')?.[1];
      if (!predId) continue;
      const list = updatesByPrediction.get(predId) ?? [];
      list.push({
        id: note.id,
        publicId: note.publicId ?? null,
        title: note.title,
        publishedAt: note.publishedAt,
        trustScore: note.trustScore,
      });
      updatesByPrediction.set(predId, list);
    }

    // 3. Group predictions by dossier (originating brief).
    const dossiers = new Map<string, WatchedDossier>();
    for (const p of predictions) {
      if (!p.briefId || !p.brief) continue;
      let d = dossiers.get(p.briefId);
      if (!d) {
        d = {
          briefId: p.briefId,
          question: p.brief.question,
          briefPublicId: p.brief.publicId,
          publishedAt: p.brief.publishedAt,
          openPredictions: [],
          totalPredictions: 0,
          updates: [],
          lastActivity: p.createdAt,
        };
        dossiers.set(p.briefId, d);
      }
      d.totalPredictions += 1;
      if (p.status === 'OPEN') {
        d.openPredictions.push({
          id: p.id,
          claim: p.claim,
          horizon: p.horizon,
          probability: p.probability,
          confidence: p.confidence,
          whatWouldFalsify: p.whatWouldFalsify,
          status: p.status,
        });
      }
      const noteList = updatesByPrediction.get(p.id);
      if (noteList) for (const n of noteList) {
        if (!d.updates.some(u => u.id === n.id)) d.updates.push(n);
        if (n.publishedAt && n.publishedAt > d.lastActivity) d.lastActivity = n.publishedAt;
      }
      if (p.createdAt > d.lastActivity) d.lastActivity = p.createdAt;
    }

    // 4. Dossiers worth showing: under active watch (open predictions) or
    //    with at least one shipped update note.
    return [...dossiers.values()]
      .filter(d => d.openPredictions.length > 0 || d.updates.length > 0)
      .sort((a, b) => b.lastActivity.getTime() - a.lastActivity.getTime())
      .slice(0, limit);
  } catch (err) {
    console.error('[fetchWatchedDossiers] Error:', err);
    return [];
  }
}
