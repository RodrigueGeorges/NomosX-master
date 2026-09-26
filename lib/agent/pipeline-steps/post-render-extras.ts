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

/**
 * EVIDENCE IDS + PROSE CLEANUP — P3.8 stable [E-N] ids then deterministic
 * prose fixes (broken abbreviations, double spaces, merged words). Runs
 * AFTER citation repair so it catches patterns the renderer's
 * replaceCitations() missed. Additive/derived transformations on the same
 * artifact the gates already judged — no html bump.
 */
export async function applyEvidenceIdsAndProseCleanup(
  html: string,
  evidenceRegistry: any,
  stats: Record<string, any>,
  label: string,
): Promise<string> {
  // P3.8: Apply stable evidence IDs — convert [SRC-N] to [E-N] in final HTML
  try {
    const { replaceSrcWithEvidenceIds, getCitationStats } = await import('../evidence-registry');
    html = replaceSrcWithEvidenceIds(html, evidenceRegistry);
    const citStats = getCitationStats(evidenceRegistry);
    stats.evidenceRegistry = {
      total: citStats.totalEvidence,
      cited: citStats.citedEvidence,
      uncited: citStats.uncitedEvidence,
    };
    console.log(`${label} EVIDENCE IDS: ${citStats.citedEvidence}/${citStats.totalEvidence} cited, ${citStats.uncitedEvidence} uncited`);
  } catch (err) {
    console.warn(`${label} EVIDENCE IDS: failed (non-blocking):`, err);
  }

  // DETERMINISTIC PROSE CLEANUP — fix LLM stutter, broken abbreviations, double spaces
  // Runs AFTER citation repair (which converts [SRC-N] to <sup> tags) so it can catch
  // patterns the renderer's replaceCitations() missed (it only handles [SRC-N] format).
  try {
    let proseFixed = 0;
    // 1. Fix broken abbreviations with <sup> tags: "e <sup...>...</sup> g." → "e.g."
    //    Also handles variants: "e<sup>9</sup>.g." (dot before g), "e<sup>9</sup>g." (no dot)
    html = html.replace(/\be\s*<sup[^>]*>[\s\S]*?<\/sup>\s*\.?\s*g\./gi, () => { proseFixed++; return 'e.g.'; });
    html = html.replace(/\bi\s*<sup[^>]*>[\s\S]*?<\/sup>\s*\.?\s*e\./gi, () => { proseFixed++; return 'i.e.'; });
    // 1b. Fix "e.<sup>9</sup>g." (citation between the two dots of e.g.)
    html = html.replace(/\be\.\s*<sup[^>]*>[\s\S]*?<\/sup>\s*g\./gi, () => { proseFixed++; return 'e.g.'; });
    html = html.replace(/\bi\.\s*<sup[^>]*>[\s\S]*?<\/sup>\s*e\./gi, () => { proseFixed++; return 'i.e.'; });
    // 1c. Fix geopolitical abbreviations with <sup> tags: "U<sup>9</sup>S." → "U.S."
    html = html.replace(/\bU\s*<sup[^>]*>[\s\S]*?<\/sup>\s*\.?\s*S\./g, () => { proseFixed++; return 'U.S.'; });
    html = html.replace(/\bE\s*<sup[^>]*>[\s\S]*?<\/sup>\s*\.?\s*U\./g, () => { proseFixed++; return 'E.U.'; });
    html = html.replace(/\bU\s*<sup[^>]*>[\s\S]*?<\/sup>\s*\.?\s*K\./g, () => { proseFixed++; return 'U.K.'; });
    html = html.replace(/\bU\s*<sup[^>]*>[\s\S]*?<\/sup>\s*\.?\s*N\./g, () => { proseFixed++; return 'U.N.'; });
    // 2. Fix double spaces before <sup> citation tags
    html = html.replace(/\s\s+(<sup\s)/g, (_m, sup) => { proseFixed++; return ' ' + sup; });
    // 3. Fix double spaces throughout (but not inside tags)
    html = html.replace(/  +(?![^<]*>)/g, () => { proseFixed++; return ' '; });
    // 4. Fix merged words from citation injection: "thatto" → "that to"
    // Only match words ≥8 chars containing "to" where both halves are known words
    const LEGIT_WORDS_WITH_TO = new Set(['protocol','tomato','today','tonight','tomorrow','together','protocol','photograph','biotechnology','nanotechnology','autonomy','autonomous','cartography','etymology','topology','toxicology','methodology','methodology','terminology','homogeneous','heterogeneous']);
    html = html.replace(/\b([a-z]{3,})to([a-z]{3,})\b/gi, (m, w1, w2) => {
      if (LEGIT_WORDS_WITH_TO.has(m.toLowerCase())) return m;
      if (/(that|is|are|was|were|will|can|may|must|does|has|have|had|not|but|and|for|the|this|from|with|able|likely|supposed|meant|going|used|able|forced|allowed|expected|intended|required|permitted|encouraged|discouraged|prohibited|inclined|reluctant|willing|unwilling|hesitant|prone|vulnerable|resistant|immune|subject|addicted|dedicated|committed|opposed|indifferent|indifferent|blind|deaf|equal|similar|comparable|analogous|equivalent|identical|related|connected|linked|tied|bound|drawn|attracted|repelled|devoted|loyal|faithful|true|dedicated|opposed|contrary|adjacent|proximate|close|near|far|prior|subsequent|anterior|posterior|superior|inferior|senior|junior)$/.test(w1.toLowerCase()) &&
          /^(be|do|have|not|fragment|provide|support|indicate|suggest|imply|represent|constitute|enable|prevent|reduce|increase|require|allow|ensure|maintain|create|produce|generate|facilitate|promote|limit|constrain|shape|drive|affect|impact|influence|determine|depend|vary|differ|change|evolve|emerge|develop|expand|contract|converge|diverge|exist|persist|decline|improve|worsen|accelerate|decelerate|stabilize|fluctuate|oscillate|transition|transform|adapt|adjust|respond|react|contribute|lead|result|amount|correspond|amount|add|contribute|amount|lead)/.test(w2.toLowerCase())) {
        proseFixed++;
        return w1 + ' to ' + w2;
      }
      return m;
    });
    if (proseFixed > 0) {
      console.log(`${label} PROSE CLEANUP: fixed ${proseFixed} issues (abbreviations, double spaces, merged words)`);
      stats.proseCleanup = { fixed: proseFixed };
    }
  } catch (err) {
    console.warn(`${label} PROSE CLEANUP: failed (non-blocking):`, err);
  }

  return html;
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
