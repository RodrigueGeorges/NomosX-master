import type { ReportFormat } from '@/lib/agent/pipeline-v2';

/** Map a StudioX publication format to a pipeline report format. */
export function formatTypeToReportFormat(formatType?: string | null): ReportFormat {
  switch (formatType) {
    case 'STRATEGIC_REPORT':
      return 'strategic';
    case 'DOSSIER':
      return 'dossier';
    default:
      // ARTICLE, RESEARCH_BRIEF, EXECUTIVE_BRIEF, POLICY_NOTE all map to 'brief'
      return 'brief';
  }
}
