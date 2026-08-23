/**
 * POLICY COUNCIL — NomosX
 *
 * Conseil deliberatif multi-perspectives a la maniere de :
 * - Claude Policy Council (adamconner) : 19+ agents votant
 * - LLM Council Policy Ideation (danielrosehill) : 6 lenses + chairman
 * - CouncilVerse (Relay-Launch) : formations pretes a l'emploi
 *
 * Objectif : obtenir une recommandation politique eprouvee par plusieurs
 * ideologies et specialites, avec desaccords explicites et synthese.
 */

import { callLLM } from '../llm/unified-llm';
import { parseJson } from './json-utils';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface PolicyPersona {
  id: string;
  name: string;
  lens: string;
  focus: string;
}

export interface PolicyPerspective {
  personaId: string;
  position: string;
  keyArguments: string[];
  concerns: string[];
  preferredOption: string;
}

export interface PolicyReview {
  personaId: string;
  reviewedPersonaId: string;
  usefulness: number; // 1-5
  rigor: number;      // 1-5
  comment: string;
}

export interface PolicyRecommendation {
  actor: string;
  action: string;
  rationale: string;
  support: string[];   // persona ids supporting
  opposition: string[]; // persona ids opposed
  risk: 'low' | 'medium' | 'high';
}

export interface PolicyCouncilReport {
  question: string;
  consensus: string;
  disagreements: string[];
  confidence: number;
  recommendations: PolicyRecommendation[];
  blindSpots: string[];
  nextSteps: string[];
  costUsd: number;
}

export interface PolicyCouncilOptions {
  question?: string;
  maxRecommendations?: number;
}

// ─── Personas ───────────────────────────────────────────────────────────────

const DEFAULT_PERSONAS: PolicyPersona[] = [
  { id: 'economic_populist', name: 'Economic Populist', lens: 'Working-class economic impact, anti-monopoly', focus: 'Does this hurt or help ordinary workers and small firms?' },
  { id: 'progressive', name: 'Progressive', lens: 'Social equity, civil rights, distributional justice', focus: 'Who benefits least and who is left behind?' },
  { id: 'centrist', name: 'Centrist', lens: 'Bipartisan stability, evidence, implementability', focus: 'What can actually pass and be administered?' },
  { id: 'conservative_market', name: 'Conservative / Market', lens: 'Market principles, limited government, fiscal discipline', focus: 'Does this distort incentives or burden taxpayers?' },
  { id: 'ai_safety', name: 'AI Safety', lens: 'Risk mitigation, alignment, long-term safety', focus: 'What could go wrong and how do we prevent it?' },
  { id: 'labor', name: 'Organized Labor', lens: 'Worker protections, job security, collective bargaining', focus: 'How does this affect employment conditions and unions?' },
];

// ─── Engine ─────────────────────────────────────────────────────────────────

export async function runPolicyCouncil(
  question: string,
  html: string,
  sources: any[],
  options: PolicyCouncilOptions = {},
): Promise<PolicyCouncilReport> {
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 12000);
  const sourceList = sources.slice(0, 15).map((s, i) => `[SRC-${i + 1}] ${s.title || s.id}`).join('\n');

  // Stage 1: Persona perspectives (single LLM call with all personas)
  const stage1 = await callLLM({
    messages: [
      {
        role: 'system',
        content: 'You are the moderator of a policy council. Produce independent perspectives from 6 ideologically distinct council members. Return valid JSON only.',
      },
      {
        role: 'user',
        content: `QUESTION: ${question}\n\nBRIEF SYNTHESIS:\n${text}\n\nSOURCES:\n${sourceList}\n\nPERSONAS:\n${DEFAULT_PERSONAS.map(p => `- ${p.id}: ${p.name} (${p.lens})`).join('\n')}\n\nTASK: For each persona, return a JSON with:\n{\n  "perspectives": [\n    {\n      "personaId": "...",\n      "position": "one-paragraph stance",\n      "keyArguments": ["arg 1", "arg 2"],\n      "concerns": ["concern 1"],\n      "preferredOption": "the option or recommendation this persona prefers"\n    }\n  ]\n}\n\nEach persona must be distinctive and true to their lens.`,
      },
    ],
    task: 'harvard_council',
    temperature: 0.3,
    maxTokens: 4000,
    jsonMode: true,
    enableCache: true,
  });

  const p1 = parseJson<{ perspectives: PolicyPerspective[] }>(stage1.content);
  if (!p1) {
    return { question, consensus: 'Council failed to produce perspectives.', disagreements: [], confidence: 0, recommendations: [], blindSpots: [], nextSteps: [], costUsd: stage1.costUsd };
  }

  // Stage 2: Peer review (rank each other's perspectives)
  const perspectivesText = p1.perspectives.map((p) => `--- ${p.personaId} ---\nPosition: ${p.position}\nPreferred option: ${p.preferredOption}\nKey arguments: ${p.keyArguments.join('; ')}\nConcerns: ${p.concerns.join('; ')}`).join('\n\n');

  const stage2 = await callLLM({
    messages: [
      {
        role: 'system',
        content: 'You are the peer-review coordinator. Each council member reviews the other five perspectives for usefulness and rigor. Return valid JSON only.',
      },
      {
        role: 'user',
        content: `QUESTION: ${question}\n\nPERSPECTIVES:\n${perspectivesText}\n\nTASK: Return JSON:\n{\n  "reviews": [\n    {\n      "personaId": "reviewer",\n      "reviewedPersonaId": "author",\n      "usefulness": 1-5,\n      "rigor": 1-5,\n      "comment": "one sentence"\n    }\n  ]\n}\n\nEach reviewer reviews each of the other 5 personas. Total 30 reviews.`,
      },
    ],
    task: 'harvard_council',
    temperature: 0.2,
    maxTokens: 4000,
    jsonMode: true,
    enableCache: true,
  });

  const p2 = parseJson<{ reviews: PolicyReview[] }>(stage2.content);
  const reviews = (p2?.reviews || []).filter(r => r.usefulness && r.rigor);

  // Stage 3: Chairman synthesis
  const reviewsText = reviews.slice(0, 18).map((r) => `${r.personaId} on ${r.reviewedPersonaId}: usefulness=${r.usefulness}/5, rigor=${r.rigor}/5 — ${r.comment}`).join('\n');

  const maxRecs = options.maxRecommendations ?? 4;
  const stage3 = await callLLM({
    messages: [
      {
        role: 'system',
        content: 'You are the Chairman of the council. Synthesize perspectives and peer reviews into a final report. Preserve dissent. Return valid JSON only.',
      },
      {
        role: 'user',
        content: `QUESTION: ${question}\n\nPERSPECTIVES:\n${perspectivesText}\n\nPEER REVIEWS (sample):\n${reviewsText}\n\nTASK: Return JSON:\n{\n  "consensus": "one-paragraph area of agreement",\n  "disagreements": ["disagreement 1"],\n  "confidence": 0-100,\n  "recommendations": [\n    {\n      "actor": "who should act",\n      "action": "concrete action",\n      "rationale": "why",\n      "support": ["personaId"],\n      "opposition": ["personaId"],\n      "risk": "low|medium|high"\n    }\n  ],\n  "blindSpots": ["blind spot 1"],\n  "nextSteps": ["step 1"]\n}\n\nRules:\n- Up to ${maxRecs} recommendations\n- Explicit support and opposition per recommendation\n- Do not invent data\n- Confidence reflects how much the council agrees`,
      },
    ],
    task: 'harvard_council',
    temperature: 0.25,
    maxTokens: 4000,
    jsonMode: true,
    enableCache: true,
  });

  const p3 = parseJson<PolicyCouncilReport>(stage3.content);
  if (!p3) {
    return { question, consensus: 'Council synthesis failed.', disagreements: [], confidence: 0, recommendations: [], blindSpots: [], nextSteps: [], costUsd: stage1.costUsd + stage2.costUsd + stage3.costUsd };
  }

  return {
    ...p3,
    question,
    recommendations: (p3.recommendations || []).slice(0, maxRecs),
    costUsd: stage1.costUsd + stage2.costUsd + stage3.costUsd,
  };
}

// ─── HTML Renderer ──────────────────────────────────────────────────────────

function esc(s: string): string {
  return String(s || '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m] as string));
}

export function renderPolicyCouncil(report: PolicyCouncilReport): string {
  if (!report.recommendations.length) return '';

  const recsHtml = report.recommendations.map((r) => `
    <div class="council-recommendation">
      <h4>${esc(r.actor)} — <span class="risk">[risk: ${r.risk}]</span></h4>
      <p><strong>Action:</strong> ${esc(r.action)}</p>
      <p><strong>Rationale:</strong> ${esc(r.rationale)}</p>
      <p><strong>Support:</strong> ${r.support.map(esc).join(', ')}</p>
      <p><strong>Opposition:</strong> ${r.opposition.map(esc).join(', ')}</p>
    </div>`).join('');

  const disagreeHtml = report.disagreements.length
    ? '<h3>Disagreements</h3><ul>' + report.disagreements.map((d) => `<li>${esc(d)}</li>`).join('') + '</ul>'
    : '';

  const blindHtml = report.blindSpots.length
    ? '<h3>Blind Spots</h3><ul>' + report.blindSpots.map((b) => `<li>${esc(b)}</li>`).join('') + '</ul>'
    : '';

  const nextHtml = report.nextSteps.length
    ? '<h3>Next Steps</h3><ol>' + report.nextSteps.map((s) => `<li>${esc(s)}</li>`).join('') + '</ol>'
    : '';

  return `<section class="policy-council">
    <h2>Policy Council</h2>
    <p class="consensus"><strong>Consensus:</strong> ${esc(report.consensus)}</p>
    <p class="confidence"><strong>Confidence:</strong> ${report.confidence}%</p>
    ${recsHtml}
    ${disagreeHtml}
    ${blindHtml}
    ${nextHtml}
  </section>`;
}
