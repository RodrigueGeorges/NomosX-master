/**
 * POST-RENDER EXTRAS — two small cohesive units shared by the V2 and non-V2
 * paths (they were byte-identical duplicates in pipeline-v2):
 *
 * 1. `injectAdversarialSection` — renders the devil's advocate verdict as an
 *    editorial section. Deterministic; additive injection → no html bump.
 * 2. `runPeerReviewAndPack` — flag-gated peer review + think-tank pack.
 *    Parallelized: both read the same input html; only the pack rewrites it
 *    (peer review judges the pre-pack artifact in the sequential version too).
 */

import { runPeerReview } from '../peer-reviewer';
import { augmentThinkTankHtml } from '../think-tank-pack';

export function injectAdversarialSection(html: string, daStats: any, label: string): string {
  // Render the adversarial review as an editorial section — a publication
  // that shows its own strongest objection reads as rigorous, not fragile.
  if (!(daStats && !daStats.skipped && !daStats.error && (daStats.fatalChallenges > 0 || daStats.majorChallenges > 0))) {
    return html;
  }
  const esc = (s: string) => s.replace(/</g, '<').replace(/>/g, '>').replace(/"/g, '"');
  const challenges = (daStats.topChallenges || []) as { type: string; text: string }[];
  const vulnerabilities = (daStats.vulnerabilityTexts || []) as string[];
  const severityLabel = daStats.fatalChallenges > 0 ? 'Adversarial review — dissenting opinion' : 'Adversarial review';
  const daSection = `
<section class="nx-block nx-adversarial-review" data-no-cite="true">
  <div class="pf-axes-title">${severityLabel}</div>
  <p class="da-verdict-line">Verdict: <strong>${esc(String(daStats.verdict || 'publish').replace(/_/g, ' '))}</strong> · analytical strength ${daStats.overallStrength ?? '—'}/100</p>
  ${daStats.killShot ? `<p class="da-killshot"><em>“${esc(daStats.killShot)}”</em></p>` : ''}
  ${challenges.length > 0 ? `<ul class="da-challenges">${challenges.map(c => `<li><span class="da-challenge-type">${esc(c.type)}</span> ${esc(c.text)}</li>`).join('')}</ul>` : ''}
  ${vulnerabilities.length > 0 ? `<p class="da-vuln"><strong>Where this analysis could age badly:</strong> ${vulnerabilities.map(esc).join(' · ')}</p>` : ''}
</section>`;
  // Anchor before references, else before </article>, else append
  let out: string;
  if (html.includes('references-section')) {
    out = html.replace(/<section class="references-section"/, `${daSection}\n<section class="references-section"`);
  } else if (html.includes('</article>')) {
    out = html.replace('</article>', `${daSection}</article>`);
  } else {
    out = html + daSection;
  }
  console.log(`${label} DA SECTION: rendered adversarial review (fatal=${daStats.fatalChallenges}, major=${daStats.majorChallenges})`);
  return out;
}

export interface PeerReviewPackDeps {
  html: string;
  query: string;
  topSources: any[];
  analysisTitle: any;
  stats: Record<string, any>;
  label: string;
  detectedDomain: string;
  institutePosition: any;
  usePeerReview: boolean;
  useThinkTankPack: boolean;
  packOpts: {
    primaryData?: any[];
    scenarioModeling?: boolean;
    maxScenarios?: number;
    stressTest?: boolean;
    policyCouncil?: boolean;
  };
  addCost: (usd: number | undefined, step: string) => void;
  tagEval: <T extends Record<string, any>>(entry: T, artifact: 'analysis' | 'html') => T;
  bumpHtmlArtifact: () => void;
}

export async function runPeerReviewAndPack(deps: PeerReviewPackDeps): Promise<string> {
  const { html, query, topSources, analysisTitle, stats, label, detectedDomain, institutePosition, usePeerReview, useThinkTankPack, packOpts, addCost, tagEval, bumpHtmlArtifact } = deps;
  let packHtml: string | null = null;

  // Peer review judges the pre-pack html in both orderings — it never injects,
  // only scores. The pack is the only mutator. Safe to run concurrently.
  await Promise.allSettled([
    (async () => {
      if (!usePeerReview) return;
      try {
        const review = await runPeerReview(html, topSources, { title: analysisTitle });
        (stats as any).peerReview = tagEval({
          score: review.overallScore,
          recommendation: review.recommendation,
          critical: review.issues.filter(i => i.severity === 'critical').length,
          major: review.issues.filter(i => i.severity === 'major').length,
        }, 'html');
        addCost(review.costUsd, 'PEER REVIEW');
        console.log(`${label} PEER REVIEW: score=${review.overallScore}, rec=${review.recommendation}, critical=${(stats as any).peerReview.critical}, major=${(stats as any).peerReview.major}`);
      } catch (err) {
        console.warn(`${label} PEER REVIEW: failed (non-blocking):`, err);
      }
    })(),
    (async () => {
      if (!useThinkTankPack) return;
      try {
        const pack = await augmentThinkTankHtml(html, query, topSources, {
          domain: detectedDomain,
          primaryData: packOpts.primaryData,
          scenarioModeling: !institutePosition && (packOpts.scenarioModeling ?? true),
          maxScenarios: packOpts.maxScenarios,
          stressTest: packOpts.stressTest ?? true,
          policyCouncil: packOpts.policyCouncil ?? true,
        });
        packHtml = pack.html;
        addCost(pack.costUsd, 'THINK TANK PACK');
        (stats as any).thinkTankPack = pack.stats;
        console.log(`${label} THINK TANK PACK: applied (cost=$${pack.costUsd.toFixed(4)})`);
      } catch (err) {
        console.warn(`${label} THINK TANK PACK: failed (non-blocking):`, err);
      }
    })(),
  ]);

  if (packHtml) {
    bumpHtmlArtifact();
    return packHtml;
  }
  return html;
}
