/**
 * Think Tank Quality Pack — NomosX
 *
 * Pousse un brief académique au niveau d'une note de think tank renommée
 * (RAND, Brookings, Chatham House, IFRI) en ajoutant :
 * 1. Recommandations actionnables par stakeholder
 * 2. Options / trade-offs explicites
 * 3. Analyse économique et régulatoire
 * 4. Relecture éditoriale (anti-répétitions, anti-coquilles, ton)
 *
 * Inspirations :
 * - Takshashila Scholar (policy brief draft, stakeholder analysis)
 * - RAND / Brookings / Chatham House report structure
 * - Bardach 8-step policy analysis
 */

import { callLLM } from '../llm/unified-llm';
import { parseJson } from './json-utils';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface Stakeholder {
  name: string;
  interest: string;
  power: 'high' | 'medium' | 'low';
  position: string;
}

export interface Recommendation {
  stakeholder: string;
  actor: string;
  action: string;
  timeline: string;
  priority: 'high' | 'medium' | 'low';
  rationale: string;
  firstStep: string;
}

export interface PolicyOption {
  option: string;
  pros: string[];
  cons: string[];
}

export interface PolicyRecommendations {
  headline: string;
  options: PolicyOption[];
  recommendations: Recommendation[];
  stakeholders: Stakeholder[];
  costUsd: number;
}

export interface PolicyEconomics {
  marketSize?: string;
  costOfInaction?: string;
  keyRegulators: { name: string; position: string }[];
  incentives: { actor: string; incentive: string }[];
  risks: { actor: string; risk: string }[];
  costUsd: number;
}

export interface EditorialPolish {
  polishedHtml: string;
  changes: string[];
  issues: string[];
  costUsd: number;
}

export interface ThinkTankPackOptions {
  domain?: string;
  maxRecommendations?: number;
  polish?: boolean;
  recommendations?: boolean;
  economics?: boolean;
}

// ─── Recommandations ──────────────────────────────────────────────────────────

export async function generatePolicyRecommendations(
  question: string,
  html: string,
  sources: any[],
  options: ThinkTankPackOptions = {},
): Promise<PolicyRecommendations> {
  const text = stripHtml(html).slice(0, 12000);
  const sourceList = sources.slice(0, 20).map((s, i) => `[${i + 1}] ${s.title || s.id}`).join('\n');
  const max = options.maxRecommendations ?? 5;

  const response = await callLLM({
    messages: [
      {
        role: 'system',
        content: `You are a senior policy fellow at a top-tier think tank (RAND/Brookings/Chatham House style). Your job is to transform a research synthesis into a concise, decision-oriented policy section.

Output MUST be valid JSON with no markdown, no preamble.`,
      },
      {
        role: 'user',
        content: `QUESTION: ${question}

RESEARCH SYNTHESIS (truncated):
${text}

SOURCES:
${sourceList}

TASK: Produce a policy section with the following JSON structure:
{
  "headline": "One-sentence bottom line for a busy decision-maker",
  "options": [
    { "option": "Description of policy option 1", "pros": ["pro 1", "pro 2"], "cons": ["con 1", "con 2"] },
    { "option": "Description of policy option 2", "pros": ["pro 1"], "cons": ["con 1"] },
    { "option": "Description of policy option 3", "pros": ["pro 1"], "cons": ["con 1"] }
  ],
  "recommendations": [
    { "stakeholder": "Regulators", "actor": "Specific body (e.g. FDA, EU AI Act Office)", "action": "Concrete action", "timeline": "e.g. 6-12 months", "priority": "high", "rationale": "Why this matters", "firstStep": "First actionable step" }
  ],
  "stakeholders": [
    { "name": "Stakeholder name", "interest": "What they want", "power": "high|medium|low", "position": "Current position" }
  ]
}

Rules:
- ${max} recommendations maximum, each assigned to a specific actor
- 3 policy options with explicit trade-offs
- 4-6 stakeholders with Interest × Power mapping
- Use sources where possible; do not invent data
- Headline must state the single most important action to take`,
      },
    ],
    task: 'strategic_analysis',
    temperature: 0.25,
    maxTokens: 4000,
    jsonMode: true,
    enableCache: true,
  });

  const parsed = parseJson<PolicyRecommendations>(response.content);
  if (!parsed) {
    return {
      headline: `Further action is needed on ${question.slice(0, 80)}.`,
      options: [],
      recommendations: [],
      stakeholders: [],
      costUsd: response.costUsd,
    };
  }

  return { ...parsed, costUsd: response.costUsd };
}

// ─── Économie / Régulateurs ─────────────────────────────────────────────────

export async function generatePolicyEconomics(
  question: string,
  html: string,
  sources: any[],
  options: ThinkTankPackOptions = {},
): Promise<PolicyEconomics> {
  const text = stripHtml(html).slice(0, 12000);

  const response = await callLLM({
    messages: [
      {
        role: 'system',
        content: 'You are a policy economist at a major think tank. Extract the economic, regulatory and incentive landscape from the research. Output valid JSON only.',
      },
      {
        role: 'user',
        content: `QUESTION: ${question}

RESEARCH SYNTHESIS (truncated):
${text}

TASK: Return JSON with this structure:
{
  "marketSize": "Qualitative or quantitative market sizing if inferable from sources",
  "costOfInaction": "Cost or risk of doing nothing",
  "keyRegulators": [
    { "name": "Regulator name (e.g. FDA, EMA, EU AI Act, SEC)", "position": "Current or likely stance" }
  ],
  "incentives": [
    { "actor": "Actor name", "incentive": "What drives them" }
  ],
  "risks": [
    { "actor": "Actor name", "risk": "Main risk they face" }
  ]
}

Rules:
- Distinguish regulators and their actual positions
- Map key incentives and conflicts
- If market size is not in the sources, write "Not quantified in sources" and provide a reasoned qualitative estimate
- Do not fabricate numbers`,
      },
    ],
    task: 'strategic_analysis',
    temperature: 0.25,
    maxTokens: 2500,
    jsonMode: true,
    enableCache: true,
  });

  const parsed = parseJson<PolicyEconomics>(response.content);
  if (!parsed) {
    return {
      marketSize: undefined,
      costOfInaction: undefined,
      keyRegulators: [],
      incentives: [],
      risks: [],
      costUsd: response.costUsd,
    };
  }

  return { ...parsed, costUsd: response.costUsd };
}

// ─── Relecture éditoriale ───────────────────────────────────────────────────

export async function polishEditorial(
  html: string,
  title: string,
): Promise<EditorialPolish> {
  const text = stripHtml(html).slice(0, 12000);

  const response = await callLLM({
    messages: [
      {
        role: 'system',
        content: 'You are a senior editor at a top-tier think tank. Your job is to tighten prose, remove redundancies, fix typos and awkward phrasing, and improve clarity without changing facts or citations. Output valid JSON only.',
      },
      {
        role: 'user',
        content: `TITLE: ${title}

HTML (stripped, truncated):
${text}

TASK: Return JSON:
{
  "polishedHtml": "The full polished HTML. Keep all tags, citations and structure. Only fix wording, remove redundancies, and improve flow. If no major issues, return the original HTML.",
  "changes": ["List of changes made, e.g. 'Removed redundant paragraph on mechanism 2'"],
  "issues": ["List of remaining issues or types of weakness"]
}

Rules:
- Preserve all [SRC-N], [E-N] citations and HTML tags
- Do not add new facts or remove sources
- Target: think tank style — confident, concise, decision-oriented
- Fix obvious typos and repeated phrases`,
      },
    ],
    task: 'reader_v3',
    temperature: 0.2,
    maxTokens: 6000,
    jsonMode: true,
    enableCache: true,
  });

  const parsed = parseJson<EditorialPolish>(response.content);
  if (!parsed || !parsed.polishedHtml) {
    return { polishedHtml: html, changes: [], issues: ['Polish parse failed'], costUsd: response.costUsd };
  }

  return { ...parsed, costUsd: response.costUsd };
}

// ─── Orchestration ───────────────────────────────────────────────────────────

export async function augmentThinkTankHtml(
  html: string,
  question: string,
  sources: any[],
  options: ThinkTankPackOptions = {},
): Promise<{ html: string; stats: any; costUsd: number }> {
  const start = Date.now();
  let totalCost = 0;
  let currentHtml = html;
  const packStats: any = {};

  // 1. Editorial polish
  if (options.polish !== false) {
    try {
      const titleMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
      const title = titleMatch ? titleMatch[1] : question;
      const polish = await polishEditorial(currentHtml, title);
      currentHtml = polish.polishedHtml;
      totalCost += polish.costUsd;
      packStats.polish = { changes: polish.changes.length, issues: polish.issues.length };
      console.log(`[ThinkTankPack] Editorial polish: ${polish.changes.length} changes`);
    } catch (err) {
      console.warn('[ThinkTankPack] Editorial polish failed:', err);
      packStats.polish = { error: true };
    }
  }

  // 2. Recommendations
  if (options.recommendations !== false) {
    try {
      const recs = await generatePolicyRecommendations(question, currentHtml, sources, options);
      currentHtml = insertBeforeConclusion(currentHtml, renderRecommendations(recs));
      totalCost += recs.costUsd;
      packStats.recommendations = { count: recs.recommendations.length, options: recs.options.length };
      console.log(`[ThinkTankPack] Recommendations: ${recs.recommendations.length} actions, ${recs.options.length} options`);
    } catch (err) {
      console.warn('[ThinkTankPack] Recommendations generation failed:', err);
      packStats.recommendations = { error: true };
    }
  }

  // 3. Economics
  if (options.economics !== false) {
    try {
      const econ = await generatePolicyEconomics(question, currentHtml, sources, options);
      currentHtml = insertBeforeConclusion(currentHtml, renderEconomics(econ));
      totalCost += econ.costUsd;
      packStats.economics = { regulators: econ.keyRegulators.length, incentives: econ.incentives.length };
      console.log(`[ThinkTankPack] Economics: ${econ.keyRegulators.length} regulators, ${econ.incentives.length} incentives`);
    } catch (err) {
      console.warn('[ThinkTankPack] Economics generation failed:', err);
      packStats.economics = { error: true };
    }
  }

  return {
    html: currentHtml,
    stats: packStats,
    costUsd: totalCost,
  };
}

// ─── HTML Renderers ─────────────────────────────────────────────────────────

function renderRecommendations(recs: PolicyRecommendations): string {
  const optionsHtml = recs.options.length
    ? `<section class="policy-options"><h2>Options Considered</h2>${recs.options.map(o => `
      <div class="policy-option">
        <h3>${escapeHtml(o.option)}</h3>
        <p><strong>Pros:</strong> ${o.pros.map(escapeHtml).join('; ')}</p>
        <p><strong>Cons:</strong> ${o.cons.map(escapeHtml).join('; ')}</p>
      </div>`).join('')}</section>`
    : '';

  const recsHtml = recs.recommendations.length
    ? `<section class="recommendations"><h2>Recommendations</h2>
        <p class="headline"><strong>Bottom line:</strong> ${escapeHtml(recs.headline)}</p>
        <table class="recommendations-table">
          <thead><tr><th>Actor</th><th>Action</th><th>Timeline</th><th>Priority</th><th>First Step</th></tr></thead>
          <tbody>${recs.recommendations.map(r => `
            <tr>
              <td>${escapeHtml(r.actor)}</td>
              <td>${escapeHtml(r.action)}</td>
              <td>${escapeHtml(r.timeline)}</td>
              <td>${r.priority}</td>
              <td>${escapeHtml(r.firstStep)}</td>
            </tr>`).join('')}
          </tbody>
        </table>
        <h3>Stakeholders</h3>
        <table class="stakeholders-table">
          <thead><tr><th>Stakeholder</th><th>Interest</th><th>Power</th><th>Position</th></tr></thead>
          <tbody>${recs.stakeholders.map(s => `
            <tr>
              <td>${escapeHtml(s.name)}</td>
              <td>${escapeHtml(s.interest)}</td>
              <td>${s.power}</td>
              <td>${escapeHtml(s.position)}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </section>`
    : '';

  return `${optionsHtml}${recsHtml}`;
}

function renderEconomics(econ: PolicyEconomics): string {
  const regs = econ.keyRegulators.length
    ? `<h3>Key Regulators & Positions</h3><ul>${econ.keyRegulators.map(r => `<li><strong>${escapeHtml(r.name)}:</strong> ${escapeHtml(r.position)}</li>`).join('')}</ul>`
    : '';

  const incentives = econ.incentives.length
    ? `<h3>Incentives</h3><ul>${econ.incentives.map(i => `<li><strong>${escapeHtml(i.actor)}:</strong> ${escapeHtml(i.incentive)}</li>`).join('')}</ul>`
    : '';

  const risks = econ.risks.length
    ? `<h3>Risks & Costs</h3><ul>${econ.risks.map(r => `<li><strong>${escapeHtml(r.actor)}:</strong> ${escapeHtml(r.risk)}</li>`).join('')}</ul>`
    : '';

  return `<section class="policy-economics"><h2>Policy & Economic Context</h2>
    ${econ.marketSize ? `<p><strong>Market / scale:</strong> ${escapeHtml(econ.marketSize)}</p>` : ''}
    ${econ.costOfInaction ? `<p><strong>Cost of inaction:</strong> ${escapeHtml(econ.costOfInaction)}</p>` : ''}
    ${regs}${incentives}${risks}
  </section>`;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function stripHtml(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeHtml(text: string | undefined): string {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function insertBeforeConclusion(html: string, block: string): string {
  // Try to insert before the last major closing section or conclusion
  const markers = ['<h2>Conclusion', '<h2>Limitations', '<h2>About the', '<section class="conclusion', '<footer'];
  for (const marker of markers) {
    const idx = html.toLowerCase().lastIndexOf(marker.toLowerCase());
    if (idx !== -1) {
      return html.slice(0, idx) + block + '\n' + html.slice(idx);
    }
  }
  // Fallback: append before closing body or end
  const bodyEnd = html.toLowerCase().lastIndexOf('</body>');
  if (bodyEnd !== -1) return html.slice(0, bodyEnd) + block + '\n' + html.slice(bodyEnd);
  return html + '\n' + block;
}
