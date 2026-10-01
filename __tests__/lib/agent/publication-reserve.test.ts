import {
  certifyForReserve,
  validateReserveCertificate,
  type ReserveArtifact,
} from '@/lib/agent/publication-reserve';
import type { PublicationGateInput } from '@/lib/agent/publication-gate';

// A SUMMARY_BRIEF artifact that passes the full publication gate:
// ≥250 adaptive words, 6 sources, every claim-like sentence cited, no novlangue.
function paragraph(idx: number): string {
  const body =
    `Section ${idx} reviews the available record on transatlantic energy coordination. ` +
    `Multiple official documents describe gradual capacity additions across the corridor [SRC-${(idx % 5) + 1}]. ` +
    `Observers note continued alignment between member state positions over the period covered [SRC-${((idx + 1) % 5) + 1}]. ` +
    `The compiled material covers contractual, regulatory and infrastructural dimensions [SRC-${((idx + 2) % 5) + 1}].`;
  return `<p>${body}</p>`;
}

const html = Array.from({ length: 8 }, (_, i) => paragraph(i + 1)).join('\n');
const sourceIds = ['s1', 's2', 's3', 's4', 's5', 's6'];

const artifact: ReserveArtifact = {
  title: 'Transatlantic energy coordination: a short brief',
  html,
  type: 'SUMMARY_BRIEF',
  sourceIds,
  trustScore: 78,
  qualityScore: 76,
  citationCoverage: 0.85,
};

const gateInput: PublicationGateInput = {
  html, // overridden inside certifyForReserve with the artifact html
  sourceIds,
  format: 'signal',
  fatalChallenges: 0,
  devilsAdvocateScore: 72,
  staleEvaluations: [],
};

describe('publication reserve certificates', () => {
  it('certifies a gate-passing artifact and validates it', () => {
    const cert = certifyForReserve(artifact, gateInput, { publicId: 'pub-1', briefId: 'brief-1' });
    expect(cert.artifactHash).toMatch(/^[0-9a-f]{64}$/);
    expect(validateReserveCertificate(artifact, cert)).toBe(true);
  });

  it('rejects a tampered artifact (hash mismatch)', () => {
    const cert = certifyForReserve(artifact, gateInput, { publicId: 'pub-1', briefId: 'brief-1' });
    const tampered = { ...artifact, html: html + '<p>Inserted unsourced material.</p>' };
    expect(validateReserveCertificate(tampered, cert)).toBe(false);
  });

  it('rejects an expired certificate', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const cert = certifyForReserve(artifact, gateInput, { publicId: 'pub-1', briefId: 'brief-1' }, now);
    const later = new Date(now.getTime() + 7 * 3600_000);
    expect(validateReserveCertificate(artifact, cert, later)).toBe(false);
  });

  it('refuses to certify an artifact that fails the gate', () => {
    const weak = { ...artifact, trustScore: 20 };
    expect(() =>
      certifyForReserve(weak, { ...gateInput, trustScore: 20 }, { publicId: 'p', briefId: 'b' })
    ).toThrow('not eligible');
  });

  it('keeps the fingerprint stable across JSON key ordering', () => {
    const cert = certifyForReserve(artifact, gateInput, { publicId: 'pub-1', briefId: 'brief-1' });
    const reordered: ReserveArtifact = {
      citationCoverage: artifact.citationCoverage,
      qualityScore: artifact.qualityScore,
      trustScore: artifact.trustScore,
      sourceIds: [...artifact.sourceIds],
      type: artifact.type,
      html: artifact.html,
      title: artifact.title,
    };
    expect(validateReserveCertificate(reordered, cert)).toBe(true);
  });
});
