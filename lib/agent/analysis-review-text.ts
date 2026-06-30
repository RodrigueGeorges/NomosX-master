/**
 * Plain-text analysis bundle for epistemic review before final HTML render (Editorial V2).
 */

export function buildAnalysisReviewText(
  analysis: Record<string, unknown>,
  question: string
): string {
  const sections: string[] = [`QUESTION: ${question}`];

  const push = (label: string, value: unknown) => {
    if (value == null) return;
    if (typeof value === 'string' && value.trim()) {
      sections.push(`${label}:\n${value.trim()}`);
    } else if (Array.isArray(value) && value.length) {
      sections.push(`${label}:\n${value.map(String).join('\n')}`);
    } else if (typeof value === 'object') {
      sections.push(`${label}:\n${JSON.stringify(value, null, 2)}`);
    }
  };

  push('TITLE', analysis.title);
  push('EXECUTIVE SUMMARY', analysis.executiveSummary ?? analysis.summary);
  push('KEY FINDINGS', analysis.keyFindings);
  push('CONSENSUS', analysis.consensus);
  push('DISAGREEMENTS', analysis.disagreements);
  push('SCENARIOS', analysis.scenarios);
  push('RECOMMENDATIONS', analysis.recommendations);
  push('CONCLUSION', analysis.conclusion);
  push('DEBATE', analysis.debate);

  if (analysis._deliberationContext) {
    push('DELIBERATION', analysis._deliberationContext);
  }
  if (analysis._harvardCouncil) {
    push('COUNCIL SYNTHESIS', analysis._harvardCouncil);
  }

  return sections.join('\n\n---\n\n');
}
