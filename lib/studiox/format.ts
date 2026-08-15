import type { ReportFormat } from '@/lib/agent/pipeline-v2';
import { resolveFormatType } from '@/lib/publication-formats';

/**
 * Map a Nomos Engine publication format to a pipeline report format.
 *
 * Canonical mapping (4 formats → 3 pipeline formats):
 *   Signal Brief      → "brief"     (surface depth, perProvider ~15)
 *   Decision Memo     → "memo"      (standard depth, perProvider ~30)
 *   Article           → "brief"     (deep depth, perProvider ~50)
 *   Strategic Report  → "strategic" (strategic depth, perProvider ~80)
 *
 * Legacy types are resolved via resolveFormatType() before mapping.
 */
export function formatTypeToReportFormat(formatType?: string | null): ReportFormat {
  const resolved = resolveFormatType(formatType);
  switch (resolved) {
    case 'STRATEGIC_REPORT':
      return 'strategic';
    case 'DECISION_MEMO':
      return 'memo';
    case 'SUMMARY_BRIEF':
    case 'ARTICLE':
    default:
      return 'brief';
  }
}
