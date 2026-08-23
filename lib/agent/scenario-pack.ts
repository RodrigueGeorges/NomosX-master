/**
 * SCENARIO PACK - NomosX
 *
 * Modele des scenarios de niveau think tank: moteurs, points de bascule,
 * signaux d'alerte precoce et sensibilite aux hypotheses.
 *
 * Inspirations : RAND Foresight, Chatham House Scenarios, Shell Scenarios.
 */

import { callLLM } from '../llm/unified-llm';
import { parseJson } from './json-utils';

// - Helpers -------------------------------------------------------------------

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function esc(s: string): string {
  return String(s || '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m] as string));
}

// - Types ----------------------------------------------------------------------

export interface ScenarioPackOptions {
  question?: string;
  maxScenarios?: number;
  includeSensitivity?: boolean;
}

export interface ScenarioOutlook {
  name: string;
  probability: string;
  description: string;
  keyDrivers: string[];
  implications: string;
}

export interface ScenarioModeling {
  summary: string;
  scenarios: ScenarioOutlook[];
  whatWouldChangeOurMind: string[];
  dominantScenario: string;
  costUsd: number;
}

// - Engine ---------------------------------------------------------------------

export async function generateScenarioModeling(
  question: string,
  html: string,
  sources: any[],
  options: ScenarioPackOptions = {},
): Promise<ScenarioModeling> {
  const maxScenarios = options.maxScenarios ?? 3;
  const text = stripHtml(html).slice(0, 12000);
  const sourceList = sources.slice(0, 15).map((s, i) => `[SRC-${i + 1}] ${s.title || s.id} (${s.year || 'n/a'})`).join('\n');

  const response = await callLLM({
    messages: [
      {
        role: 'system',
        content: 'You are a senior foresight analyst at a top-tier think tank. Output valid JSON only.',
      },
      {
        role: 'user',
        content: `POLICY QUESTION: ${question}\n\nRESEARCH SYNTHESIS:\n${text}\n\nSOURCES:\n${sourceList}\n\nTASK: Return JSON with summary, scenarios (name, probability, description, keyDrivers, implications), whatWouldChangeOurMind, dominantScenario. Up to ${maxScenarios} scenarios, probabilities sum to ~100%, use [SRC-N] citations.`,
      },
    ],
    task: 'primary_data_synthesis',
    temperature: 0.25,
    maxTokens: 4000,
    jsonMode: true,
    enableCache: true,
  });

  const parsed = parseJson<ScenarioModeling>(response.content);
  if (!parsed) {
    return { summary: 'Scenario modeling could not be generated.', scenarios: [], whatWouldChangeOurMind: [], dominantScenario: '', costUsd: response.costUsd };
  }

  return { ...parsed, scenarios: (parsed.scenarios || []).slice(0, maxScenarios), costUsd: response.costUsd };
}

// - HTML Renderer ----------------------------------------------------------------

export function renderScenarioModeling(model: ScenarioModeling): string {
  if (!model.scenarios.length) return '';

  const scenariosHtml = model.scenarios.map((s, i) => {
    const drivers = s.keyDrivers.map(esc).join('; ');
    return '<div class="scenario-card"><h3>' + (i + 1) + '. ' + esc(s.name) + ' <span class="probability">[' + esc(s.probability) + ']</span></h3>' +
      '<p>' + esc(s.description) + '</p>' +
      '<p><strong>Key drivers:</strong> ' + drivers + '</p>' +
      '<p><strong>Implications:</strong> ' + esc(s.implications) + '</p></div>';
  }).join('');

  const mindHtml = model.whatWouldChangeOurMind.length
    ? '<h3>What Would Change Our Mind</h3><ul>' + model.whatWouldChangeOurMind.map((m) => '<li>' + esc(m) + '</li>').join('') + '</ul>'
    : '';

  return '<section class="scenario-modeling"><h2>Scenario Modeling & Foresight</h2>' +
    '<p class="summary">' + esc(model.summary) + '</p>' +
    '<p class="dominant"><strong>Dominant scenario:</strong> ' + esc(model.dominantScenario) + '</p>' +
    scenariosHtml + mindHtml + '</section>';
}
