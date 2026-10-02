/**
 * Plain-text analysis bundle for epistemic review before final HTML render (Editorial V2).
 */

export function buildAnalysisReviewText(
  analysis: Record<string, unknown> | string,
  question: string
): string {
  // A string analysis (serialized JSON or plain verdict text) used to cast to
  // Record — every field lookup returned undefined, so reviewers received ONLY
  // the question and vetoed with "the substantive analysis is omitted"
  // (observed on prod: DA killShot, major_revision, publishability 38).
  if (typeof analysis === 'string') {
    try {
      const parsed = JSON.parse(analysis);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return `QUESTION: ${question}\n\n---\n\nANALYSIS:\n${analysis}`;
      }
      analysis = parsed as Record<string, unknown>;
    } catch {
      return `QUESTION: ${question}\n\n---\n\nANALYSIS:\n${analysis}`;
    }
  }
  const obj = analysis as Record<string, unknown>;
  const sections: string[] = [`QUESTION: ${question}`];

  const push = (label: string, value: unknown) => {
    if (value == null) return;
    if (typeof value === 'string' && value.trim()) {
      sections.push(`${label}:\n${value.trim()}`);
    } else if (Array.isArray(value) && value.length) {
      const rendered = value.every(v => typeof v === 'string')
        ? value.join('\n')
        : JSON.stringify(value, null, 2);
      sections.push(`${label}:\n${rendered}`);
    } else if (typeof value === 'object') {
      sections.push(`${label}:\n${JSON.stringify(value, null, 2)}`);
    }
  };

  push('TITLE', obj.title);
  push('THROUGH LINE', obj.throughLine);
  push('VERDICT', obj.verdict);
  push('CONVICTION LEVEL', obj.convictionLevel);
  push('ANCHORING BASIS', obj.anchoringBasis);
  push('CAUSAL CHAIN', obj.causalChain);
  push('TRAJECTORY', obj.trajectory);
  push('REJECTED ALTERNATIVES', obj.rejectedAlternatives);
  push('WHAT TO WATCH', obj.whatToWatch);
  push('EVIDENCE ASSESSMENT', obj.evidenceAssessment);
  push('KEY FINDINGS', obj.keyFindings);

  // Multipass analyst substance — the friction map is where the cited
  // mechanisms/collisions/dataPoints actually live. Omitting it means the
  // reviewer sees conclusions but never the evidence-bearing machinery
  // (observed on prod: DA vetoed "substantive analysis is omitted" while the
  // analysis held 500+ [SRC-N] citations inside frictionMap).
  const fm = obj.frictionMap as Record<string, unknown> | undefined;
  if (fm) {
    push('MECHANISMS', fm.mechanisms);
    push('COLLISIONS', fm.collisions);
    push('DATA LANDSCAPE', fm.dataLandscape);
  }
  push('MECHANISMS', obj.mechanisms);
  push('DATA LANDSCAPE', obj.dataLandscape);
  push('QUANTITATIVE FINDINGS', obj.quantitativeFindings);
  push('ACTIVE DYNAMICS', obj.activeDynamics);
  push('PROJECTIONS IN LITERATURE', obj.projectionsInLiterature);

  // Legacy fields (for backward compat if strategic analyst output is passed)
  push('EXECUTIVE SUMMARY', obj.executiveSummary ?? obj.summary);
  push('CONSENSUS', obj.consensus);
  push('DISAGREEMENTS', obj.disagreements);
  push('SCENARIOS', obj.scenarios);
  push('RECOMMENDATIONS', obj.recommendations);
  push('CONCLUSION', obj.conclusion);
  push('DEBATE', obj.debate);

  if (obj._deliberationContext) {
    push('DELIBERATION', obj._deliberationContext);
  }
  if (obj._harvardCouncil) {
    push('COUNCIL SYNTHESIS', obj._harvardCouncil);
  }

  // Unrecognized shape — never let a reviewer see only the question.
  if (sections.length === 1) {
    sections.push(`ANALYSIS:\n${JSON.stringify(obj, null, 2)}`);
  }

  return sections.join('\n\n---\n\n');
}
