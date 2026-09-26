/**
 * POST-HOC DATA INJECTION: Evidence Tiers + Adversarial Transparency +
 * Multi-Lens Convergence. Extracted from pipeline-v2.ts — identical semantics.
 *
 * These fields are computed/injected AFTER the analyst and critic run, then
 * attached to the analysis object so the renderer can display them.
 * Strategic reports only.
 */

export interface PostHocInjectionOptions {
  isStrategic: boolean;
  analysis: Record<string, any> | null | undefined;
  topSources: any[];
  criticResult?: any;
  canaResult?: any;
  scatterResult?: any;
  label: string;
}

export async function runPostHocInjection(o: PostHocInjectionOptions): Promise<void> {
  const { isStrategic, analysis, topSources, label } = o;
  if (!(isStrategic && analysis && typeof analysis === 'object')) return;
  const savedCriticResult = o.criticResult;
  const savedCanaResult = o.canaResult;
  const savedScatterResult = o.scatterResult;

  try {
    // 1. Evidence Tiers — classify sources into 5 tiers
    const { computeEvidenceTiers, summarizeEvidenceTiers } = await import('../evidence-tiering');
    const tiers = computeEvidenceTiers(topSources);
    analysis._evidenceTiers = tiers;
    console.log(`${label} EVIDENCE TIERS: ${summarizeEvidenceTiers(tiers)}`);
  } catch (err) {
    console.warn(`${label} EVIDENCE TIERS: failed (non-blocking):`, err instanceof Error ? err.message : String(err));
  }

  // 2. Adversarial Transparency — inject Critic objections
  if (savedCriticResult) {
    try {
      const objections = (savedCriticResult.contradictions || []).map((c: any) => ({
        claim: c.claim || c.text || '',
        objection: c.contradiction || c.reason || c.explanation || '',
        severity: c.severity || 'medium',
        resolved: false,
      }));
      // Also add biases as objections
      const biasObjections = (savedCriticResult.biases || []).map((b: any) => ({
        claim: b.claim || b.description || '',
        objection: b.bias || b.type || b.explanation || 'Bias detected',
        severity: b.severity || 'medium',
        resolved: false,
      }));
      // stageResults is an object (not array) — extract preprint penalties from grounding stage if present
      const stageResults = savedCriticResult.stageResults || {};
      const groundingStage = stageResults.grounding || {};
      const preprintDowngrades = (groundingStage.preprintPenalties || []).map((pp: any) => ({
        claim: pp.claim || '',
        sources: pp.sources || [],
        reason: pp.reason || 'Claim supported primarily by non-peer-reviewed preprint',
      }));
      analysis._adversarialTransparency = {
        criticScore: savedCriticResult.overallScore || 0,
        criticObjections: [...objections, ...biasObjections],
        preprintDowngrades,
      };
      console.log(`${label} ADVERSARIAL TRANSPARENCY: ${objections.length + biasObjections.length} objections, ${preprintDowngrades.length} preprint downgrades injected`);
    } catch (err) {
      console.warn(`${label} ADVERSARIAL TRANSPARENCY: failed (non-blocking):`, err instanceof Error ? err.message : String(err));
    }
  }

  // 3. Multi-Lens Convergence Map — inject CANA/SCATTER convergence
  if (savedCanaResult || savedScatterResult) {
    try {
      const canaMechanisms = (savedCanaResult?.mechanisms || []).slice(0, 6).map((m: any) =>
        m.mechanism || m.description || JSON.stringify(m).slice(0, 200)
      );
      const scatterHypotheses = (savedScatterResult?.hypotheses || []).slice(0, 6).map((h: any) =>
        h.hypothesis || h.scenario || h.description || JSON.stringify(h).slice(0, 200)
      );
      // Convergence: themes that appear in both CANA mechanisms and SCATTER hypotheses
      const canaText = canaMechanisms.join(' ').toLowerCase();
      const scatterText = scatterHypotheses.join(' ').toLowerCase();
      const convergencePoints: string[] = [];
      const divergencePoints: string[] = [];

      // Simple keyword-based convergence detection
      const keyConcepts = ['governance', 'religion', 'ethics', 'bias', 'pluralism', 'dignity', 'regulation', 'framework'];
      for (const concept of keyConcepts) {
        const inCana = canaText.includes(concept);
        const inScatter = scatterText.includes(concept);
        if (inCana && inScatter) {
          convergencePoints.push(`Both CANA and SCATTER identify "${concept}" as a central mechanism — this increases robustness of findings related to ${concept}.`);
        } else if (inCana || inScatter) {
          divergencePoints.push(`Only ${inCana ? 'CANA' : 'SCATTER'} identifies "${concept}" — this indicates genuine uncertainty about the role of ${concept}.`);
        }
      }

      analysis._multiLensConvergence = {
        canaMechanisms,
        scatterHypotheses,
        weakSignals: [], // populated from weak_signal lens if available
        convergencePoints,
        divergencePoints,
      };
      console.log(`${label} MULTI-LENS CONVERGENCE: ${convergencePoints.length} convergence, ${divergencePoints.length} divergence points`);
    } catch (err) {
      console.warn(`${label} MULTI-LENS CONVERGENCE: failed (non-blocking):`, err instanceof Error ? err.message : String(err));
    }
  }
}
