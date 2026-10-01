import { createHash } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { assertExecutionActive } from '@/lib/worker/execution-scope';
import { evaluatePublicationReadiness } from '@/lib/publication-visibility';
import { evaluatePublicationGate, type PublicationGateInput } from './publication-gate';
import { countWordsHtml, normalizeTopicKey } from './inquiry-funnel-utils';

export interface ReserveArtifact {
  title: string;
  html: string;
  type: string;
  sourceIds: string[];
  trustScore: number;
  qualityScore: number;
  citationCoverage: number;
}

export interface ReserveCertificate {
  version: 1;
  artifactHash: string;
  validatedAt: string;
  expiresAt: string;
  publicId: string;
  briefId: string;
  gateInput: PublicationGateInput;
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(
    Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => [k, canonical(v)]),
  );
  return value;
}

function fingerprint(artifact: ReserveArtifact, gateInput: PublicationGateInput): string {
  return createHash('sha256').update(JSON.stringify(canonical({
    title: artifact.title, html: artifact.html, type: artifact.type,
    sourceIds: artifact.sourceIds, trustScore: artifact.trustScore,
    qualityScore: artifact.qualityScore, citationCoverage: artifact.citationCoverage,
    gateInput,
  }))).digest('hex');
}

export function certifyForReserve(
  artifact: ReserveArtifact,
  evaluation: PublicationGateInput,
  identity: { publicId: string; briefId: string },
  now = new Date(),
): ReserveCertificate {
  const gateInput: PublicationGateInput = {
    ...evaluation, html: artifact.html, sourceIds: artifact.sourceIds, format: artifact.type,
    trustScore: artifact.trustScore, qualityScore: artifact.qualityScore,
    citationCoverage: artifact.citationCoverage, dbClaims: undefined, thresholds: undefined,
    triangularOverride: false,
  };
  const gate = evaluatePublicationGate(gateInput);
  const readiness = evaluatePublicationReadiness({ ...artifact, wordCount: countWordsHtml(artifact.html) });
  if (!identity.publicId || !identity.briefId || gate.decision !== 'publish' || !readiness.ok ||
      gate.checks?.some(c => !c.passed) || (gateInput.fatalChallenges ?? 0) > 0) {
    throw new Error('Artifact is not eligible for the validated reserve');
  }
  const serializedInput = JSON.parse(JSON.stringify(gateInput)) as PublicationGateInput;
  return {
    version: 1, artifactHash: fingerprint(artifact, serializedInput),
    validatedAt: now.toISOString(), expiresAt: new Date(now.getTime() + 6 * 3600000).toISOString(),
    ...identity, gateInput: serializedInput,
  };
}

export function validateReserveCertificate(artifact: ReserveArtifact, certificate: ReserveCertificate, now = new Date()): boolean {
  if (certificate?.version !== 1 || !certificate.publicId || !certificate.briefId || !certificate.gateInput) return false;
  const validated = Date.parse(certificate.validatedAt);
  const expires = Date.parse(certificate.expiresAt);
  if (!Number.isFinite(validated) || !Number.isFinite(expires) || validated > now.getTime() ||
      expires <= now.getTime() || expires <= validated || expires - validated > 6 * 3600000) return false;
  if (certificate.artifactHash !== fingerprint(artifact, certificate.gateInput)) return false;
  const gate = evaluatePublicationGate({
    ...certificate.gateInput, html: artifact.html, sourceIds: artifact.sourceIds,
    thresholds: undefined, triangularOverride: false, dbClaims: undefined,
  });
  return gate.decision === 'publish' && !gate.checks?.some(c => !c.passed)
    && (certificate.gateInput.fatalChallenges ?? 0) === 0
    && evaluatePublicationReadiness({ ...artifact, wordCount: countWordsHtml(artifact.html) }).ok;
}

export async function releaseReservedPublication(input: {
  slotKey: string;
  publicationId?: string;
  question?: string;
  verticalId?: string;
}) {
  if (!input.slotKey.trim() || input.slotKey.length > 200) throw new Error('Invalid publication slot key');
  return prisma.$transaction(async tx => {
    assertExecutionActive();
    const previous = await tx.thinkTankPublication.findFirst({
      where: { criticalLoopResult: { path: ['reserveRelease', 'slotKey'], equals: input.slotKey } },
    });
    if (previous) return { publication: previous, alreadyReleased: true };
    const candidates = await tx.thinkTankPublication.findMany({
      where: {
        status: 'READY', publishedAt: null, publicId: null,
        ...(input.publicationId ? { id: input.publicationId } : {}),
        ...(input.verticalId ? { verticalId: input.verticalId } : {}),
        vertical: { isActive: true },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: 20,
    });
    for (const candidate of candidates) {
      const metadata = candidate.criticalLoopResult as Record<string, any> | null;
      const certificate = metadata?.reserve as ReserveCertificate;
      const now = new Date();
      if (input.question && normalizeTopicKey(input.question) !== normalizeTopicKey(String(metadata?.question ?? ''))) continue;
      if (!certificate || !validateReserveCertificate(candidate, certificate, now)) continue;
      const sourcesChanged = await tx.source.count({
        where: { id: { in: candidate.sourceIds }, updatedAt: { gt: new Date(certificate.validatedAt) } },
      });
      const existingSources = await tx.source.count({ where: { id: { in: candidate.sourceIds } } });
      if (sourcesChanged > 0 || existingSources !== new Set(candidate.sourceIds).size) continue;
      const duplicate = await tx.thinkTankPublication.findFirst({
        where: {
          status: { in: ['PUBLISHED', 'CORRECTED', 'RETRACTED'] },
          OR: [
            { publicId: certificate.publicId },
            { title: candidate.title, publishedAt: { gte: new Date(now.getTime() - 7 * 86400000) } },
            { criticalLoopResult: { path: ['briefId'], equals: certificate.briefId } },
          ],
        },
      });
      if (duplicate) continue;
      assertExecutionActive();
      const claimed = await tx.thinkTankPublication.updateMany({
        where: { id: candidate.id, status: 'READY', updatedAt: candidate.updatedAt, publishedAt: null, publicId: null },
        data: {
          status: 'PUBLISHED', publishedAt: now, publicId: certificate.publicId,
          criticalLoopResult: { ...metadata, reserveRelease: { slotKey: input.slotKey, releasedAt: now.toISOString() } } as Prisma.InputJsonValue,
        },
      });
      if (claimed.count !== 1) continue;
      await tx.brief.update({ where: { id: certificate.briefId }, data: { publicId: certificate.publicId, publishedAt: now } });
      if (candidate.signalId) await tx.signal.update({ where: { id: candidate.signalId }, data: { status: 'PUBLISHED' } });
      const publication = await tx.thinkTankPublication.findUniqueOrThrow({ where: { id: candidate.id } });
      return { publication, alreadyReleased: false };
    }
    return null;
  }, { isolationLevel: 'Serializable', timeout: 15000 });
}
