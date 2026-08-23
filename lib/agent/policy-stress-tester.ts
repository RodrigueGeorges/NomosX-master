/**
 * POLICY STRESS TESTER — NomosX
 *
 * Stress-teste les recommandations d'un think tank a la maniere de Civica :
 * plusieurs archetypes specialises (economiste, juriste, industriel, etc.)
 * identifient les risques, groupes affectes et mecanismes pour chaque
 * recommandation, puis un coordinateur synthetise le resultat.
 *
 * Inspiration : Civica (Shlok-Ippala) — multi-agent policy stress test.
 */

import { callLLM } from '../llm/unified-llm';
import { parseJson } from './json-utils';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface StressRecommendation {
  actor: string;
  action: string;
  priority: 'high' | 'medium' | 'low';
  rationale: string;
  firstStep: string;
  fallback?: string;
}

export interface StressRisk {
  recommendation: string;
  archetype: string;
  risk: string;
  severity: 'critical' | 'major' | 'minor';
  affectedGroups: string[];
  mechanism: string;
  agreement: 'high' | 'medium' | 'low';
}

export interface StressTestResult {
  riskLevel: 'high' | 'medium' | 'low';
  keyInsight: string;
  blindSpots: string[];
  risks: StressRisk[];
  costUsd: number;
}

export interface StressTestOptions {
  question?: string;
  maxRisks?: number;
}

// ─── Engine ─────────────────────────────────────────────────────────────────

export async function stressTestRecommendations(
  question: string,
  recommendations: StressRecommendation[],
  options: StressTestOptions = {},
): Promise<StressTestResult> {
  const maxRisks = options.maxRisks ?? 12;

  if (!recommendations.length) {
    return {
      riskLevel: 'low',
      keyInsight: 'No recommendations to stress-test.',
      blindSpots: [],
      risks: [],
      costUsd: 0,
    };
  }

  const recsBlock = recommendations.map((r, i) => `--- REC-${i + 1} ---\nActor: ${r.actor}\nAction: ${r.action}\nPriority: ${r.priority}\nRationale: ${r.rationale}\nFirst step: ${r.firstStep}\nFallback: ${r.fallback || 'n/a'}`).join('\n');

  const response = await callLLM({
    messages: [
      {
        role: 'system',
        content: 'You are the head of a policy stress-testing unit at a top-tier think tank. Your team: labor economist, legal/regulatory expert, industry analyst, equity researcher, implementation expert, and geopolitical analyst. Output valid JSON only.',
      },
      {
        role: 'user',
        content: `POLICY QUESTION: ${question}\n\nRECOMMENDATIONS TO STRESS-TEST:\n${recsBlock}\n\nTASK: Stress-test these recommendations. Return JSON:\n{\n  "riskLevel": "high|medium|low",\n  "keyInsight": "One sentence summarizing the biggest vulnerability",\n  "blindSpots": [\"Blind spot 1\", \"Blind spot 2\"],\n  "risks": [\n    {\n      \"recommendation\": \"Action text\",\n      \"archetype\": \"labor economist|legal/regulatory|industry analyst|equity researcher|implementation expert|geopolitical analyst\",\n      \"risk\": \"Description of the risk\",\n      \"severity\": \"critical|major|minor\",\n      \"affectedGroups\": [\"group 1\", \"group 2\"],\n      \"mechanism\": \"Causal mechanism\",\n      \"agreement\": \"high|medium|low\"\n    }\n  ]\n}\n\nRules:\n- Up to ${maxRisks} risks\n- Each risk must map to one recommendation and one archetype\n- Be specific: who gets hurt, how, and why\n- Identify 2-4 blind spots\n- Do not invent data`,
      },
    ],
    task: 'stress_test',
    temperature: 0.25,
    maxTokens: 4000,
    jsonMode: true,
    enableCache: true,
  });

  const parsed = parseJson<StressTestResult>(response.content);
  if (!parsed) {
    return {
      riskLevel: 'low',
      keyInsight: 'Stress test could not be parsed.',
      blindSpots: ['Parse failed'],
      risks: [],
      costUsd: response.costUsd,
    };
  }

  return {
    ...parsed,
    risks: (parsed.risks || []).slice(0, maxRisks),
    costUsd: response.costUsd,
  };
}

// ─── HTML Renderer ──────────────────────────────────────────────────────────

function esc(s: string): string {
  return String(s || '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m] as string));
}

export function renderStressTest(result: StressTestResult): string {
  if (!result.risks.length) return '';

  const risksByRec = new Map<string, StressRisk[]>();
  for (const r of result.risks) {
    const list = risksByRec.get(r.recommendation) || [];
    list.push(r);
    risksByRec.set(r.recommendation, list);
  }

  const risksHtml = Array.from(risksByRec.entries()).map(([rec, risks]) => {
    const rows = risks.map((r) => `\n      <tr>\n        <td>${esc(r.archetype)}</td>\n        <td>${esc(r.risk)} <span class="severity">[${r.severity}]</span></td>\n        <td>${r.affectedGroups.map(esc).join(', ')}</td>\n        <td>${esc(r.mechanism)}</td>\n        <td>${r.agreement}</td>\n      </tr>`).join('');
    return `<h4>${esc(rec)}</h4><table class="stress-table"><thead><tr><th>Archetype</th><th>Risk</th><th>Affected</th><th>Mechanism</th><th>Agreement</th></tr></thead><tbody>${rows}</tbody></table>`;
  }).join('');

  const blindHtml = result.blindSpots.length
    ? '<h3>Blind Spots</h3><ul>' + result.blindSpots.map((b) => `<li>${esc(b)}</li>`).join('') + '</ul>'
    : '';

  return '<section class="policy-stress-test"><h2>Policy Stress Test</h2>' +
    '<p class="risk-level"><strong>Overall risk level:</strong> ' + esc(result.riskLevel) + '</p>' +
    '<p class="key-insight"><strong>Key insight:</strong> ' + esc(result.keyInsight) + '</p>' +
    risksHtml + blindHtml + '</section>';
}
